# 2. Dashboard Grafana

Le dashboard **« Veille GRC — Risques cyber & réglementaires »** (`uid: grc-risques`) reprend la structure du modèle [14608 Vulnerability Faraday](https://grafana.com/grafana/dashboards/14608-vulnerability-faraday/) : une rangée de compteurs colorés par sévérité, un histogramme temporel, des camemberts de répartition, puis des tables de détail. Les panneaux `singlestat`, `graph` et `grafana-piechart-panel` du modèle (obsolètes) sont remplacés par leurs équivalents actuels `stat`, `timeseries` et `piechart`, et les requêtes Faraday par des requêtes sur la table `risks`.

## Provisionnement

Tout est chargé au démarrage, sans clic :

- `grafana/provisioning/datasources/postgres.yml` : datasource `grc-postgres`, connectée avec le rôle **`grc_reader`** (lecture seule) ;
- `grafana/provisioning/dashboards/dashboards.yml` + `grafana/dashboards/grc-risques.json` : le dashboard, dans le dossier *GRC*.

## Panneaux

| Rangée | Panneau | Type | Ce qu'il montre |
|---|---|---|---|
| Vue d'ensemble | Risques détectés | stat | **Nombre de risques détectés** |
| | Critique / Élevé / Moyen / Faible | stat | **Risques par criticité** |
| | Textes réglementaires | stat | Nombre de textes EUR-Lex suivis |
| | Risques détectés dans le temps | timeseries | Publications par jour et par criticité |
| Risques par criticité | Répartition par criticité | piechart | Parts de chaque niveau |
| | Criticité par source | barchart | CERT-FR vs EUR-Lex |
| | Répartition par type de publication | piechart | Alertes, avis, législation… |
| Dernières actualités réglementaires | Table EUR-Lex | table | **Dernières actualités réglementaires**, résumé, action, lien |
| Risques cyber prioritaires | Table CERT-FR | table | Triés par criticité, CVE, lien |
| Fonctionnement de l'agent | Dernière collecte, historique | stat, table | Supervision de la collecte horaire |

Les colonnes « Lien » ouvrent la source officielle ; la colonne « Criticité » est colorée (rouge, orange, jaune, vert).
