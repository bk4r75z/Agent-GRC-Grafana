// Client MCP vers le serveur officiel mcp-grafana (lecture seule).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DASHBOARD_UID = "grc-risques";
export const GRAFANA_PUBLIC_URL = process.env.GRAFANA_PUBLIC_URL ?? "http://localhost:3000";

export async function withGrafanaMcp<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "grc-chatbot", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(process.env.MCP_GRAFANA_URL ?? "http://localhost:8000/mcp"),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${process.env.MCP_GRAFANA_SERVER_TOKEN ?? "change-me-mcp-token"}` },
      },
    },
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

/** Appelle un outil MCP et renvoie son contenu texte (JSON parsé si possible). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await client.callTool({ name, arguments: args });
  const text = ((res.content ?? []) as { type: string; text?: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  if (res.isError) throw new Error(`MCP ${name}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function panelUrl(panelId: number) {
  return `${GRAFANA_PUBLIC_URL}/d/${DASHBOARD_UID}/?viewPanel=panel-${panelId}`;
}

export type Indicators = {
  dashboardTitle: string;
  dashboardUrl: string;
  values: Record<string, { value: number; panelId: number }>;
};

/**
 * Démontre les trois capacités demandées au MCP : retrouver le dashboard,
 * lire ses indicateurs, consulter les résultats des requêtes autorisées
 * (les requêtes enregistrées dans les panneaux, exécutées via run_panel_query).
 */
export async function readIndicators(client: Client): Promise<Indicators> {
  const search = await callTool(client, "search_dashboards", { query: "Veille GRC" });
  const dash =
    search.dashboards?.find((d: { uid: string }) => d.uid === DASHBOARD_UID) ?? search.dashboards?.[0];
  if (!dash) throw new Error("Dashboard GRC introuvable via MCP");
  const summary = await callTool(client, "get_dashboard_summary", { uid: dash.uid });
  const stats = (summary.panels as { id: number; title: string; type: string }[]).filter(
    (p) => p.type === "stat" && p.title !== "Dernière collecte",
  );
  const result = await callTool(client, "run_panel_query", {
    dashboardUid: dash.uid,
    panelIds: stats.map((p) => p.id),
  });
  const values: Indicators["values"] = {};
  for (const p of stats) {
    const row = result.results?.[String(p.id)]?.results?.rows?.[0];
    if (row) values[p.title] = { value: Number(Object.values(row)[0]), panelId: p.id };
  }
  return { dashboardTitle: dash.title, dashboardUrl: `${GRAFANA_PUBLIC_URL}${dash.url}`, values };
}
