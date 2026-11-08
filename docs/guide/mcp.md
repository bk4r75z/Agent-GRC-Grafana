# 3. Connecter Grafana en MCP

Le serveur MCP officiel [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) tourne dans le service `mcp-grafana`, en transport **streamable-http** sur le port 8000 (`/mcp`).

## Accès en lecture seule : quatre verrous

1. **Compte de service Grafana `mcp-readonly` au rôle Viewer** — créé par le conteneur `grafana-init` (`grafana/init/create_readonly_token.py`), qui écrit le jeton dans un volume partagé lu via `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE`. Un Viewer ne peut ni modifier ni créer de dashboard.
2. **`--disable-write`** — les outils de création et de modification ne sont pas exposés.
3. **`--enabled-tools search,datasource,dashboard,runpanelquery`** — seules ces catégories sont chargées. L'outil SQL libre (`query_sql`) n'est **pas** activé : le client ne peut exécuter que les **requêtes autorisées**, c'est-à-dire celles enregistrées dans les panneaux du dashboard (`run_panel_query`).
4. **Rôle PostgreSQL `grc_reader`** — la datasource Grafana n'a que `SELECT`, avec `default_transaction_read_only = on`.

L'accès au serveur MCP lui-même exige un jeton Bearer (`MCP_GRAFANA_SERVER_TOKEN`), et l'en-tête `Host` est filtré (`--allowed-hosts`).

## Outils exposés

`search_dashboards`, `search_folders`, `get_dashboard_by_uid`, `get_dashboard_summary`, `get_dashboard_property`, `get_dashboard_panel_queries`, `list_dashboard_versions`, `list_datasources`, `get_datasource`, `check_datasources_health`, `run_panel_query`.

## Vérification avec un client MCP

Les trois capacités demandées, vérifiées avec `curl` (n'importe quel client MCP fonctionne de la même façon) :

```bash
MCP() { curl -s http://localhost:8000/mcp \
  -H "Authorization: Bearer change-me-mcp-token" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "$1"; }

# 1. Retrouver le dashboard
MCP '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_dashboards","arguments":{"query":"Veille GRC"}}}'

# 2. Lire ses indicateurs (liste des panneaux)
MCP '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_dashboard_summary","arguments":{"uid":"grc-risques"}}}'

# 3. Consulter les résultats des requêtes autorisées (panneaux 1 à 6)
MCP '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_panel_query","arguments":{"dashboardUid":"grc-risques","panelIds":[1,2,3,4,5,6]}}}'
```

Résultat attendu de l'étape 3 (extrait) :

```json
{"2": {"panelTitle": "Critique", "query": "SELECT count(*) FROM risks WHERE criticity = 'critique'",
       "results": {"columns": ["count"], "rows": [{"count": 40}]}}}
```

## Utilisation depuis Claude Desktop ou Claude Code

```json
{
  "mcpServers": {
    "grafana-grc": {
      "type": "http",
      "url": "http://localhost:8000/mcp",
      "headers": { "Authorization": "Bearer change-me-mcp-token" }
    }
  }
}
```
