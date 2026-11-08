// Accès PostgreSQL en lecture seule (rôle grc_reader).
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://grc_reader:grc_reader@localhost:5432/grc",
  max: 5,
});

export type Criticity = "faible" | "moyen" | "élevé" | "critique";

export type Risk = {
  id: number;
  source: string;
  kind: "cyber" | "reglementaire";
  category: string;
  title: string;
  summary: string;
  criticity: Criticity;
  criticity_score: number;
  justification: string | null;
  recommended_action: string | null;
  cves: string[];
  source_url: string;
  published_at: Date | null;
};

export type RiskQuery = {
  kind?: "cyber" | "reglementaire";
  min_criticity?: Criticity;
  since_days?: number;
  search?: string;
  category?: string;
  order?: "criticity" | "date";
  limit?: number;
};

const SCORE: Record<Criticity, number> = { faible: 1, moyen: 2, "élevé": 3, critique: 4 };

// Requête paramétrée : le modèle choisit des filtres, jamais du SQL brut.
export async function queryRisks(q: RiskQuery): Promise<Risk[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (q.kind) where.push(`kind = ${p(q.kind)}`);
  if (q.category) where.push(`category = ${p(q.category)}`);
  if (q.min_criticity && SCORE[q.min_criticity]) where.push(`criticity_score >= ${p(SCORE[q.min_criticity])}`);
  if (q.since_days) where.push(`published_at >= now() - make_interval(days => ${p(Math.floor(q.since_days))})`);
  if (q.search) {
    const s = p(`%${q.search}%`);
    where.push(`(title ILIKE ${s} OR summary ILIKE ${s})`);
  }
  const order =
    q.order === "date" ? "published_at DESC NULLS LAST" : "criticity_score DESC, published_at DESC NULLS LAST";
  const limit = Math.min(Math.max(Math.floor(q.limit ?? 10), 1), 50);
  const sql = `SELECT id, source, kind, category, title, summary, criticity, criticity_score,
                      justification, recommended_action, cves, source_url, published_at
               FROM risks ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY ${order} LIMIT ${limit}`;
  const { rows } = await pool.query<Risk>(sql, params);
  return rows;
}
