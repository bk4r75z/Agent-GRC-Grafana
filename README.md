# Agent GRC — veille cyber et réglementaire avec Grafana, MCP et chatbot

Agent IA qui surveille les risques de cybersécurité (**CERT-FR**) et les réglementations (**EUR-Lex**), affiche les informations dans **Grafana** et répond aux questions via un **chatbot Next.js** connecté en **MCP**.

```
Sources (CERT-FR, EUR-Lex) → Agent IA Python + LLM → PostgreSQL → Grafana → MCP Grafana → Chatbot Next.js
```

**Technologies :** Python · LLM (Claude) · PostgreSQL · Grafana · MCP · Next.js · VitePress

## Démarrage

```bash
cp .env.example .env          # ajouter ANTHROPIC_API_KEY (facultatif)
docker compose up -d --build
```

- Dashboard Grafana : <http://localhost:3000> (admin / admin) → *GRC → Veille GRC*
- Chatbot : <http://localhost:3001>
- Serveur MCP Grafana : <http://localhost:8000/mcp> (jeton Bearer `MCP_GRAFANA_SERVER_TOKEN`)

L'agent collecte au démarrage puis **toutes les heures**.

## Contenu

| Livrable | Emplacement |
|---|---|
| Agent Python (collecte, résumé LLM, classification faible/moyen/élevé/critique, stockage avec liens sources) | [`agent/`](agent/) |
| Schéma PostgreSQL + rôle lecture seule | [`db/init.sql`](db/init.sql) |
| Dashboard Grafana (adapté du modèle 14608 Faraday) + provisionnement | [`grafana/`](grafana/) |
| Connexion MCP Grafana en lecture seule | service `mcp-grafana` dans [`docker-compose.yml`](docker-compose.yml), [`grafana/init/`](grafana/init/) |
| Chatbot Next.js aux réponses sourcées | [`chatbot/`](chatbot/) |
| Documentation VitePress | [`docs/`](docs/) — `cd docs && npm install && npm run dev` |

## Documentation

La documentation complète (architecture, détail de chaque étape, scénario de démonstration, sécurité) est dans [`docs/`](docs/guide/demarrage.md).
