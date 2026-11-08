-- Schéma de la base de veille GRC
-- Exécuté automatiquement au premier démarrage du conteneur PostgreSQL.

CREATE TABLE IF NOT EXISTS risks (
    id               SERIAL PRIMARY KEY,
    external_id      TEXT        NOT NULL UNIQUE,          -- guid/URL de l'élément source (déduplication)
    source           TEXT        NOT NULL CHECK (source IN ('CERT-FR', 'EUR-Lex')),
    kind             TEXT        NOT NULL CHECK (kind IN ('cyber', 'reglementaire')),
    category         TEXT        NOT NULL,                 -- alerte, avis, cti, legislation, proposition, journal_officiel, referentiel...
    title            TEXT        NOT NULL,
    summary          TEXT        NOT NULL,                 -- résumé produit par le LLM
    criticity        TEXT        NOT NULL CHECK (criticity IN ('faible', 'moyen', 'élevé', 'critique')),
    criticity_score  SMALLINT    NOT NULL CHECK (criticity_score BETWEEN 1 AND 4),
    justification    TEXT,                                 -- pourquoi ce niveau de criticité
    recommended_action TEXT,                               -- action recommandée
    cves             TEXT[]      NOT NULL DEFAULT '{}',
    source_url       TEXT        NOT NULL,                 -- lien source officiel (cité par le chatbot)
    published_at     TIMESTAMPTZ,
    collected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    analyzer         TEXT        NOT NULL                  -- modèle LLM ou "heuristique"
);

CREATE INDEX IF NOT EXISTS risks_kind_idx       ON risks (kind);
CREATE INDEX IF NOT EXISTS risks_criticity_idx  ON risks (criticity_score DESC);
CREATE INDEX IF NOT EXISTS risks_published_idx  ON risks (published_at DESC);

CREATE TABLE IF NOT EXISTS collection_runs (
    id           SERIAL PRIMARY KEY,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    fetched      INTEGER     NOT NULL DEFAULT 0,
    inserted     INTEGER     NOT NULL DEFAULT 0,
    skipped      INTEGER     NOT NULL DEFAULT 0,
    status       TEXT        NOT NULL DEFAULT 'running',
    error        TEXT
);

-- Rôle en lecture seule utilisé par Grafana et par le chatbot.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grc_reader') THEN
        CREATE ROLE grc_reader LOGIN PASSWORD 'grc_reader';
    END IF;
END $$;

GRANT CONNECT ON DATABASE grc TO grc_reader;
GRANT USAGE ON SCHEMA public TO grc_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grc_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grc_reader;
ALTER ROLE grc_reader SET default_transaction_read_only = on;
