# 1. Agent de veille IA

L'agent Python (`agent/grc_agent`) enchaîne quatre étapes : **collecter → résumer → classer → enregistrer**.

## Collecte

| Source | Flux | Traitement |
|---|---|---|
| CERT-FR | `cert.ssi.gouv.fr/feed/` et `/alerte/feed/` | Catégorie déduite de l'URL (alerte, avis, cti…), CVE extraites |
| EUR-Lex | RSS 162 (législation), 161 (propositions), 222 (JO série L) | Filtrage sur les thèmes cyber, numérique et données |
| EUR-Lex (référentiel) | NIS 2, DORA, CRA, AI Act, Cybersecurity Act, RGPD, eIDAS 2, Data Act | Socle de textes en vigueur, liens CELEX officiels |

Les éléments déjà présents en base (`external_id`) sont ignorés : le LLM n'est appelé que pour les nouveautés.

## Résumé et classification par LLM

`analyzer.py` appelle Claude (`claude-opus-5-5` par défaut, variable `LLM_MODEL`) avec :

- un prompt système d'analyste GRC qui définit l'échelle **faible / moyen / élevé / critique** ;
- une **sortie JSON structurée** (`output_config.format`) : `summary`, `criticity`, `justification`, `recommended_action` — la criticité est contrainte à l'une des quatre valeurs ;
- `effort: "low"`, suffisant pour une tâche de classification ;
- le **repli serveur** (`fallbacks: "default"`) : si un classifieur de sécurité refuse un contenu de vulnérabilité, l'API relance la requête sur un modèle de repli.

Sans clé API, ou si l'appel échoue, une **heuristique déterministe** prend le relais :

| Niveau | Règle cyber (CERT-FR) | Règle réglementaire (EUR-Lex) |
|---|---|---|
| critique | Alerte CERT-FR, exploitation active, rançongiciel, 0-day | — |
| élevé | Exécution de code à distance, élévation de privilèges, contournement d'authentification | Texte imposant des obligations cyber (NIS 2, DORA, CRA…) |
| moyen | Déni de service, fuite/altération de données, autres avis | Texte numérique ou données (IA, eIDAS, cloud…) |
| faible | Information | Rectificatif, impact limité |

La colonne `analyzer` indique quel moteur a classé chaque risque.

## Planification horaire

`python -m grc_agent.main --schedule` (commande par défaut du conteneur) lance une collecte immédiate puis une collecte toutes les `COLLECT_INTERVAL_MINUTES` minutes (60 par défaut) avec APScheduler. Chaque exécution est tracée dans `collection_runs`, visible en bas du dashboard.

Alternative sans conteneur, par cron :

```text
0 * * * * cd /chemin/agent && DATABASE_URL=... python -m grc_agent.main >> /var/log/grc-agent.log 2>&1
```
