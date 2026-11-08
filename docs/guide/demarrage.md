# Démarrage rapide

## Prérequis

- Docker et Docker Compose
- (facultatif) une clé API Claude pour l'analyse LLM et le chatbot conversationnel
- Node.js 20+ uniquement pour la documentation et le développement local du chatbot

## Lancer la pile complète

```bash
cp .env.example .env        # renseigner ANTHROPIC_API_KEY si disponible
docker compose up -d --build
```

| Service | URL | Rôle |
|---|---|---|
| Grafana | <http://localhost:3000> (admin / admin) | Tableau de bord « Veille GRC » |
| Chatbot | <http://localhost:3001> | Assistant GRC |
| MCP Grafana | <http://localhost:8000/mcp> | Serveur MCP (jeton Bearer requis) |
| PostgreSQL | `localhost:5432` (grc / grc) | Base de veille |

Au démarrage, l'agent effectue une première collecte puis recommence **toutes les heures**.

## Avec ou sans clé API

| | Avec `ANTHROPIC_API_KEY` | Sans clé |
|---|---|---|
| Agent | Résumé et criticité produits par Claude (`claude-opus-5-5`, sortie JSON structurée) | Classification heuristique (mots-clés CERT-FR : exploitation active, RCE…) |
| Chatbot | Claude choisit les outils MCP et PostgreSQL et rédige la réponse | Réponses construites à partir des mêmes appels MCP et SQL |

Dans les deux cas, chaque réponse du chatbot cite ses sources.

::: tip Reclasser avec le LLM
Les risques déjà en base ne sont pas réanalysés. Après l'ajout d'une clé, videz la table pour reclasser :
`docker compose exec postgres psql -U grc -d grc -c "TRUNCATE risks"` puis `docker compose restart agent`.
:::

## Lancer une collecte manuelle

```bash
docker compose run --rm agent python -m grc_agent.main
```

## Documentation

```bash
cd docs && npm install && npm run dev
```
