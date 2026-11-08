# 5. Démonstration

Scénario de bout en bout : **Sources → Agent IA → PostgreSQL → Grafana → MCP → Chatbot Next.js**, environ 10 minutes.

## 1. Démarrer la pile

```bash
docker compose up -d --build
docker compose ps
```

Tous les services sont `running`, sauf `grafana-init` qui se termine après avoir créé le compte de service Viewer.

## 2. Sources → Agent IA

```bash
docker compose logs agent | tail -20
```

On voit la collecte CERT-FR et EUR-Lex, le classement de chaque élément (`[CRITIQUE]`, `[ÉLEVÉ]`…) puis :
`Planification : collecte toutes les 60 minutes`.

## 3. Agent → PostgreSQL

```bash
docker compose exec postgres psql -U grc -d grc -c \
  "SELECT source, criticity, count(*) FROM risks GROUP BY 1,2 ORDER BY 1,2;"
docker compose exec postgres psql -U grc -d grc -c \
  "SELECT criticity, title, source_url FROM risks ORDER BY criticity_score DESC, published_at DESC LIMIT 5;"
```

## 4. PostgreSQL → Grafana

Ouvrir <http://localhost:3000> (admin / admin) → *Dashboards → GRC → Veille GRC*. Montrer les compteurs par criticité, les répartitions, la table des actualités réglementaires (lien EUR-Lex cliquable) et l'historique des collectes.

## 5. Grafana → MCP

Exécuter les trois appels de la page [Grafana en MCP](./mcp#verification-avec-un-client-mcp) : retrouver le dashboard, lire ses indicateurs, exécuter les requêtes autorisées. Montrer qu'aucun outil d'écriture n'est listé :

```bash
MCP '{"jsonrpc":"2.0","id":9,"method":"tools/list"}' | grep -o '"name":"[a-z_]*"'
```

## 6. MCP → Chatbot

Ouvrir <http://localhost:3001> et cliquer successivement sur les trois questions. Pour chaque réponse, montrer :
- les numéros `[n]` dans le texte ;
- la liste **Sources** (panneaux Grafana, avis CERT-FR, textes EUR-Lex) ;
- la trace des appels (`search_dashboards`, `get_dashboard_summary`, `run_panel_query` via MCP Grafana, puis PostgreSQL).

## 7. Collecte horaire

```bash
docker compose exec postgres psql -U grc -d grc -c \
  "SELECT id, started_at, status, fetched, inserted, skipped FROM collection_runs ORDER BY id DESC;"
```

Pour la démonstration, on peut accélérer la cadence : `COLLECT_INTERVAL_MINUTES=2 docker compose up -d agent`.
