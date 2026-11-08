---
layout: home
hero:
  name: Agent GRC
  text: Veille cyber et réglementaire pilotée par l'IA
  tagline: CERT-FR + EUR-Lex → Agent Python + LLM → PostgreSQL → Grafana → MCP → Chatbot Next.js
  actions:
    - theme: brand
      text: Démarrer
      link: /guide/demarrage
    - theme: alt
      text: Architecture
      link: /guide/architecture
features:
  - title: Agent de veille IA
    details: Collecte CERT-FR et EUR-Lex toutes les heures, résume avec Claude, classe en faible / moyen / élevé / critique, stocke dans PostgreSQL avec le lien source.
  - title: Dashboard Grafana
    details: Adapté du modèle 14608 (Faraday) — nombre de risques, répartition par criticité, dernières actualités réglementaires, risques cyber prioritaires.
  - title: MCP Grafana en lecture seule
    details: Serveur MCP officiel, compte de service Viewer, outils d'écriture désactivés, seules les requêtes enregistrées dans les panneaux sont exécutables.
  - title: Chatbot sourcé
    details: Interface Next.js qui interroge le MCP Grafana et PostgreSQL, et cite chaque source (CERT-FR, EUR-Lex, panneau Grafana).
---
