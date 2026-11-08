// Mode sans clé API : réponses construites directement à partir du MCP Grafana
// et de PostgreSQL. Chaque affirmation chiffrée ou factuelle porte sa source.
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { queryRisks, type Risk } from "./db";
import { readIndicators, withGrafanaMcp } from "./mcp";
import { SourceRegistry, type ChatResult, type TraceStep } from "./sources";

type Intent = "cyber" | "regulation" | "priority" | "search";

export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/priorit|traiter|en premier|urgence|urgent/.test(s)) return "priority";
  if (/r[ée]glement|r[ée]glementation|loi|directive|eur-lex|conformit|surveiller/.test(s)) return "regulation";
  if (/risque|cyber|vuln[ée]rab|menace|alerte|important|grave|critique/.test(s)) return "cyber";
  return "search";
}

const date = (d: Date | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "date inconnue");
const short = (s: string, n = 260) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function riskLine(r: Risk, ref: number, withAction = false) {
  // Deux espaces en fin de ligne = retour à la ligne Markdown dans l'élément de liste.
  let line = `**${r.title}** — criticité *${r.criticity}*, ${date(r.published_at)} [${ref}]  \n${short(r.summary.replace(/\*\*/g, ""))}`;
  if (withAction && r.recommended_action) line += `  \n→ *Action :* ${r.recommended_action}`;
  return line;
}

export async function answerDeterministic(question: string): Promise<ChatResult> {
  const reg = new SourceRegistry();
  const trace: TraceStep[] = [];
  const intent = detectIntent(question);

  const indicators = await withGrafanaMcp(async (client: Client) => {
    const ind = await readIndicators(client);
    trace.push(
      { tool: "search_dashboards", via: "MCP Grafana", detail: "dashboard retrouvé : " + ind.dashboardTitle },
      { tool: "get_dashboard_summary", via: "MCP Grafana", detail: "liste des panneaux" },
      { tool: "run_panel_query", via: "MCP Grafana", detail: "indicateurs : " + Object.keys(ind.values).join(", ") },
    );
    return ind;
  });
  const ind = (title: string) => {
    const v = indicators.values[title];
    return v ? { value: v.value, ref: reg.panel(v.panelId, title) } : null;
  };

  let answer = "";
  if (intent === "cyber") {
    const total = ind("Risques détectés");
    const crit = ind("Critique");
    const high = ind("Élevé");
    const risks = await queryRisks({ kind: "cyber", min_criticity: "élevé", order: "criticity", limit: 5 });
    trace.push({ tool: "queryRisks", via: "PostgreSQL", detail: "risques cyber de criticité ≥ élevé" });
    answer = `## Risques cyber les plus importants\n\n`;
    if (total && crit && high)
      answer += `Le tableau de bord recense **${total.value} risques** au total [${total.ref}], dont **${crit.value} critiques** [${crit.ref}] et **${high.value} élevés** [${high.ref}].\n\n`;
    answer += `Les cinq publications CERT-FR les plus graves :\n\n`;
    answer += risks.map((r, i) => `${i + 1}. ${riskLine(r, reg.risk(r))}`).join("\n");
  } else if (intent === "regulation") {
    const regs = ind("Textes réglementaires");
    const recent = await queryRisks({ kind: "reglementaire", order: "date", min_criticity: "moyen", limit: 30 });
    trace.push({ tool: "queryRisks", via: "PostgreSQL", detail: "textes EUR-Lex de criticité ≥ moyen" });
    answer = `## Réglementations à surveiller\n\n`;
    if (regs) answer += `**${regs.value} textes réglementaires** sont suivis par l'agent [${regs.ref}].\n\n`;
    const fresh = recent.filter((r) => r.category !== "referentiel").slice(0, 6);
    const base = recent
      .filter((r) => r.category === "referentiel")
      .sort((a, b) => b.criticity_score - a.criticity_score);
    if (fresh.length) {
      answer += `### Nouveautés publiées sur EUR-Lex\n\n`;
      answer += fresh.map((r) => `- ${riskLine(r, reg.risk(r), true)}`).join("\n") + "\n\n";
    }
    if (base.length) {
      answer += `### Socle réglementaire cyber en vigueur\n\n`;
      answer += base.map((r) => `- ${riskLine(r, reg.risk(r), true)}`).join("\n");
    }
  } else if (intent === "priority") {
    const crit = ind("Critique");
    const cyber = await queryRisks({ kind: "cyber", min_criticity: "critique", order: "criticity", since_days: 60, limit: 4 });
    const regs = await queryRisks({ kind: "reglementaire", min_criticity: "élevé", order: "criticity", limit: 3 });
    trace.push({ tool: "queryRisks", via: "PostgreSQL", detail: "risques critiques des 60 derniers jours + textes à enjeu élevé" });
    answer = `## Risques à traiter en priorité\n\n`;
    if (crit) answer += `Sur **${crit.value} risques critiques** recensés [${crit.ref}], la priorité va aux alertes récentes, puis aux obligations réglementaires à fort enjeu.\n\n`;
    answer += `### 1. Vulnérabilités critiques récentes (correctifs immédiats)\n\n`;
    answer += (cyber.length ? cyber : await queryRisks({ kind: "cyber", min_criticity: "élevé", limit: 4 }))
      .map((r) => `- ${riskLine(r, reg.risk(r), true)}`).join("\n");
    answer += `\n\n### 2. Obligations réglementaires à fort enjeu\n\n`;
    answer += regs.map((r) => `- ${riskLine(r, reg.risk(r), true)}`).join("\n");
  } else {
    const words = question.split(/\W+/u).filter((w) => w.length > 3);
    let found: Risk[] = [];
    for (const w of words) {
      found = await queryRisks({ search: w, limit: 5 });
      if (found.length) break;
    }
    trace.push({ tool: "queryRisks", via: "PostgreSQL", detail: `recherche plein texte (${words.join(", ")})` });
    answer = found.length
      ? `## Résultats\n\n` + found.map((r) => `- ${riskLine(r, reg.risk(r), true)}`).join("\n")
      : "Je n'ai trouvé aucun risque correspondant. Essayez : *Quels sont les risques cyber les plus importants ?*, *Quelles nouvelles réglementations devons-nous surveiller ?* ou *Quels risques devons-nous traiter en priorité ?*";
  }

  return { answer, sources: reg.cited(answer), trace, mode: "deterministe" };
}
