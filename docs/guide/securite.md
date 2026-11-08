# Sécurité et limites

## Avant un déploiement réel

- Changer tous les secrets par défaut dans `.env` : `GF_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `MCP_GRAFANA_SERVER_TOKEN`, et le mot de passe du rôle `grc_reader` (défini dans `db/init.sql` et `grafana/provisioning/datasources/postgres.yml`).
- Ne pas publier les ports 5432 et 8000 hors de la machine (les retirer de `docker-compose.yml` si inutiles).
- Placer Grafana et le chatbot derrière un reverse proxy TLS.

## Limites connues

- **Flux EUR-Lex** : ils couvrent tout le droit de l'UE ; le filtrage par mots-clés peut laisser passer des textes hors sujet (classés « faible ») ou en manquer. Le socle réglementaire (`EURLEX_WATCHLIST` dans `sources.py`) garantit la présence des textes cyber majeurs.
- **Mode heuristique** : sans clé API, toutes les alertes CERT-FR sont classées « critique », même anciennes. Le mode LLM nuance selon le contenu.
- **Pas de réanalyse** : un risque n'est classé qu'une fois. Vider la table `risks` pour reclasser.
- Le chatbot ne garde pas d'historique côté serveur ; les 12 derniers messages sont renvoyés à chaque question.
