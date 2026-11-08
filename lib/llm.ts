// Mode LLM : Claude orchestre les outils du serveur MCP Grafana et un outil
// PostgreSQL paramétré, puis rédige une réponse sourcée.
import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { queryRisks, type RiskQuery } from "./db";
import { callTool, DASHBOARD_UID, withGrafanaMcp } from "./mcp";
import { SourceRegistry, type ChatResult, type TraceStep } from "./sources";

const MODEL = process.env.LLM_MODEL ?? "claude-opus-5-5";
const MAX_TURNS = 10;

const SYSTEM = `Tu es l'assistant GRC (gouvernance, risques, conformité) d'une entreprise française.
Tu réponds en français, de façon concise et actionnable, à partir des seules données des outils :
- les outils du serveur MCP Grafana donnent accès au tableau de bord « ${DASHBOARD_UID} » (indicateurs
  agrégés : nombre de risques, répartition par criticité, dernières actualités). Pour lire un indicateur,
  utilise run_panel_query avec l'identifiant du panneau obtenu via get_dashboard_summary ;
- l'outil query_risks interroge la base PostgreSQL de veille (publications CERT-FR et EUR-Lex résumées
  et classées par l'agent IA).

Règles de citation, obligatoires :
- chaque résultat d'outil porte un champ "source_ref" (numéro). Cite-le entre crochets, par ex. [3],
  juste après chaque fait, chiffre ou risque que tu mentionnes ;
- n'invente jamais de source, de chiffre ni de lien ; si les données ne permettent pas de répondre, dis-le.
Termine par une courte recommandation quand la question porte sur des priorités.`;

const QUERY_RISKS_TOOL = {
  name: "query_risks",
  description:
    "Recherche des risques dans la base de veille GRC (PostgreSQL, lecture seule). kind=cyber pour les " +
    "publications CERT-FR, kind=reglementaire pour EUR-Lex. Renvoie titre, résumé, criticité, action " +
    "recommandée, date et source_ref à citer.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: { type: "string", enum: ["cyber", "reglementaire"] },
      min_criticity: { type: "string", enum: ["faible", "moyen", "élevé", "critique"] },
      since_days: { type: "integer", description: "Limiter aux publications des N derniers jours." },
      search: { type: "string", description: "Mot-clé recherché dans le titre ou le résumé." },
      category: {
        type: "string",
        description: "alerte, avis, cti, actualite (CERT-FR) ; legislation, proposition, journal_officiel, referentiel (EUR-Lex).",
      },
      order: { type: "string", enum: ["criticity", "date"] },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
};

export async function answerWithLlm(messages: { role: "user" | "assistant"; content: string }[]): Promise<ChatResult> {
  const anthropic = new Anthropic();
  const reg = new SourceRegistry();
  const trace: TraceStep[] = [];

  return withGrafanaMcp(async (mcp: Client) => {
    const { tools: mcpTools } = await mcp.listTools();
    const mcpNames = new Set(mcpTools.map((t) => t.name));
    const tools = [
      ...mcpTools.map((t) => ({
        name: t.name,
        description: (t.description ?? "").slice(0, 1024),
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      })),
      QUERY_RISKS_TOOL,
    ];

    const convo: Anthropic.Beta.BetaMessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
    let servedBy = MODEL;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools,
        messages: convo,
      });
      servedBy = response.model;

      if (response.stop_reason === "refusal") {
        return { answer: "La demande a été refusée par le modèle.", sources: [], trace, mode: "llm", model: servedBy };
      }
      if (response.stop_reason !== "tool_use") {
        const answer = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { answer, sources: reg.cited(answer), trace, mode: "llm", model: servedBy };
      }

      convo.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const input = (block.input ?? {}) as Record<string, unknown>;
        try {
          let payload: unknown;
          if (block.name === "query_risks") {
            const rows = await queryRisks(input as RiskQuery);
            trace.push({ tool: "query_risks", via: "PostgreSQL", detail: JSON.stringify(input) });
            payload = rows.map((r) => ({
              source_ref: reg.risk(r),
              source: r.source,
              categorie: r.category,
              titre: r.title,
              criticite: r.criticity,
              date: r.published_at,
              resume: r.summary,
              justification: r.justification,
              action_recommandee: r.recommended_action,
              cves: r.cves,
              lien: r.source_url,
            }));
          } else if (mcpNames.has(block.name)) {
            const out = await callTool(mcp, block.name, input);
            trace.push({ tool: block.name, via: "MCP Grafana", detail: JSON.stringify(input) });
            payload = annotateMcp(block.name, out, reg);
          } else {
            throw new Error(`outil inconnu : ${block.name}`);
          }
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(payload) });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: String(err), is_error: true });
        }
      }
      convo.push({ role: "user", content: results });
    }
    return {
      answer: "Je n'ai pas pu terminer l'analyse dans le nombre d'étapes autorisé.",
      sources: [],
      trace,
      mode: "llm",
      model: servedBy,
    };
  });
}

/** Ajoute un source_ref aux résultats MCP qui correspondent à des panneaux du dashboard. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function annotateMcp(tool: string, out: any, reg: SourceRegistry) {
  if (tool === "run_panel_query" && out?.results) {
    for (const r of Object.values(out.results) as { panelId: number; panelTitle: string; source_ref?: number }[]) {
      r.source_ref = reg.panel(r.panelId, r.panelTitle);
    }
  }
  return out;
}
