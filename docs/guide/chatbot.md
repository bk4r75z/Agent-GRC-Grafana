# 4. Chatbot Next.js

L'application `chatbot/` (Next.js, App Router) expose une interface de discussion sur <http://localhost:3001> et une route `POST /api/chat`.

## Les trois questions

| Question | Données utilisées |
|---|---|
| Quels sont les risques cyber les plus importants ? | Indicateurs « Risques détectés », « Critique », « Élevé » via MCP + risques CERT-FR de criticité ≥ élevé |
| Quelles nouvelles réglementations devons-nous surveiller ? | Indicateur « Textes réglementaires » via MCP + nouveautés EUR-Lex et socle réglementaire |
| Quels risques devons-nous traiter en priorité ? | Indicateur « Critique » via MCP + alertes critiques des 60 derniers jours + textes à fort enjeu, avec l'action recommandée |

Les boutons de suggestion de la page d'accueil posent ces questions.

## Deux modes

**Mode LLM** (`ANTHROPIC_API_KEY` définie, `lib/llm.ts`) : Claude reçoit
- tous les outils du serveur MCP Grafana (listés dynamiquement avec `listTools`) ;
- un outil `query_risks` qui interroge PostgreSQL avec des **filtres typés** (type, criticité minimale, période, mot-clé) — jamais de SQL libre.

Le modèle enchaîne les appels d'outils puis rédige la réponse.

**Mode déterministe** (sans clé, `lib/deterministic.ts`) : l'intention est détectée par mots-clés, puis la réponse est construite à partir des mêmes appels MCP (`search_dashboards` → `get_dashboard_summary` → `run_panel_query`) et SQL.

## Citation des sources

Chaque résultat d'outil reçoit un numéro `source_ref` (`lib/sources.ts`) :

- un panneau Grafana lu via MCP → lien direct vers le panneau (`?viewPanel=`) ;
- un risque PostgreSQL → lien officiel CERT-FR ou EUR-Lex.

La réponse cite ces numéros entre crochets `[n]`, et l'interface affiche sous chaque réponse la liste des sources réellement citées, avec leur origine (CERT-FR, EUR-Lex, Grafana MCP), ainsi que la trace des appels d'outils.

## Développement local

```bash
cd chatbot
npm install
DATABASE_URL=postgresql://grc_reader:grc_reader@localhost:5432/grc \
MCP_GRAFANA_URL=http://localhost:8000/mcp \
MCP_GRAFANA_SERVER_TOKEN=change-me-mcp-token \
npm run dev
```
