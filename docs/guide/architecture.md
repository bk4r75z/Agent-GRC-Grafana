# Architecture

```
 ┌──────────┐   RSS   ┌──────────────────────┐  INSERT  ┌────────────┐
 │ CERT-FR  │────────▶│  Agent Python        │─────────▶│ PostgreSQL │
 │ EUR-Lex  │         │  collecte · LLM ·    │          │  risks     │
 └──────────┘         │  classification      │          │  runs      │
                      │  (toutes les heures) │          └─────┬──────┘
                      └──────────────────────┘                │ SELECT (grc_reader, lecture seule)
                                                   ┌──────────┴─────────┐
                                                   ▼                    │
                                            ┌────────────┐              │
                                            │  Grafana   │              │
                                            │ dashboard  │              │
                                            └─────┬──────┘              │
                                    API (Viewer)  │                     │
                                            ┌─────▼──────┐              │
                                            │ mcp-grafana│              │
                                            │ read-only  │              │
                                            └─────┬──────┘              │
                              MCP streamable-http │                     │
                                            ┌─────▼─────────────────────▼─┐
                                            │  Chatbot Next.js (+ Claude) │
                                            └─────────────────────────────┘
```

## Arborescence

```
├── agent/                  Agent de veille Python
│   └── grc_agent/
│       ├── sources.py      Collecte CERT-FR et EUR-Lex
│       ├── analyzer.py     Résumé + classification (Claude, repli heuristique)
│       ├── db.py           Accès PostgreSQL
│       └── main.py         Exécution unique ou planifiée (APScheduler)
├── db/init.sql             Schéma + rôle lecture seule grc_reader
├── grafana/
│   ├── dashboards/         Dashboard provisionné (grc-risques.json)
│   ├── provisioning/       Datasource PostgreSQL + fournisseur de dashboards
│   └── init/               Création du compte de service Viewer pour le MCP
├── chatbot/                Application Next.js
│   ├── app/                Interface + route /api/chat
│   └── lib/                Client MCP, accès PostgreSQL, modes LLM et déterministe
├── docs/                   Cette documentation (VitePress)
└── docker-compose.yml      Toute la pile
```

## Modèle de données

Table `risks` : une ligne par publication analysée.

| Colonne | Description |
|---|---|
| `external_id` | Identifiant unique de la source (déduplication) |
| `source` | `CERT-FR` ou `EUR-Lex` |
| `kind` | `cyber` ou `reglementaire` |
| `category` | alerte, avis, cti, actualite / legislation, proposition, journal_officiel, referentiel |
| `summary` | Résumé produit par le LLM |
| `criticity` / `criticity_score` | faible (1), moyen (2), élevé (3), critique (4) |
| `justification`, `recommended_action` | Raison du classement et action recommandée |
| `cves` | CVE citées |
| `source_url` | Lien officiel, cité par le chatbot |
| `published_at`, `collected_at` | Dates de publication et de collecte |
| `analyzer` | Modèle LLM utilisé ou `heuristique` |

Table `collection_runs` : journal de chaque exécution (début, fin, éléments collectés, nouveaux, erreurs).
