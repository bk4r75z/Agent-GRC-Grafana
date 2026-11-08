// Registre des sources citées dans une réponse : chaque source reçoit un numéro [n].
import type { Risk } from "./db";
import { panelUrl } from "./mcp";

export type Source = {
  n: number;
  title: string;
  url: string;
  origin: "CERT-FR" | "EUR-Lex" | "Grafana (MCP)";
};

export type TraceStep = { tool: string; via: "MCP Grafana" | "PostgreSQL"; detail?: string };

export type ChatResult = {
  answer: string;
  sources: Source[];
  trace: TraceStep[];
  mode: "llm" | "deterministe";
  model?: string;
};

export class SourceRegistry {
  private byUrl = new Map<string, Source>();

  add(title: string, url: string, origin: Source["origin"]): number {
    const existing = this.byUrl.get(url);
    if (existing) return existing.n;
    const n = this.byUrl.size + 1;
    this.byUrl.set(url, { n, title, url, origin });
    return n;
  }

  risk(r: Risk): number {
    return this.add(r.title, r.source_url, r.source as Source["origin"]);
  }

  panel(panelId: number, title: string): number {
    return this.add(`Tableau de bord Grafana — panneau « ${title} »`, panelUrl(panelId), "Grafana (MCP)");
  }

  /** Ne garde que les sources réellement citées dans le texte. */
  cited(answer: string): Source[] {
    const used = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    return [...this.byUrl.values()].filter((s) => used.has(s.n));
  }
}
