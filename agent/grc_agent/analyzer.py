"""Résumé et classification des risques par LLM (Claude), avec repli heuristique."""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass

from .sources import RawItem

log = logging.getLogger(__name__)

CRITICITY_LEVELS = ["faible", "moyen", "élevé", "critique"]
SCORE = {level: i + 1 for i, level in enumerate(CRITICITY_LEVELS)}

SYSTEM_PROMPT = """Tu es analyste GRC (gouvernance, risques, conformité) pour une entreprise française \
de taille intermédiaire soumise à NIS 2 et au RGPD. Pour chaque publication officielle (CERT-FR ou \
EUR-Lex), tu rédiges un résumé factuel en français et tu évalues le niveau de risque pour l'entreprise.

Échelle de criticité :
- critique : exploitation active ou imminente, exécution de code à distance sur un produit très répandu, \
  ou obligation réglementaire cyber majeure applicable à court terme avec sanctions.
- élevé : vulnérabilité grave (RCE, élévation de privilèges, contournement d'authentification) sur un \
  produit courant, ou texte réglementaire cyber qui impose de nouvelles obligations.
- moyen : vulnérabilité à impact limité ou nécessitant des conditions particulières, ou texte \
  réglementaire à surveiller (proposition, acte d'exécution, recommandation).
- faible : information, rectificatif, impact marginal pour une entreprise type.

Ne déduis rien qui ne figure pas dans le texte fourni."""

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "Résumé en 2 à 3 phrases, en français."},
        "criticity": {"type": "string", "enum": CRITICITY_LEVELS},
        "justification": {"type": "string", "description": "Une phrase expliquant le niveau."},
        "recommended_action": {"type": "string", "description": "Action concrète recommandée."},
    },
    "required": ["summary", "criticity", "justification", "recommended_action"],
    "additionalProperties": False,
}


@dataclass
class Analysis:
    summary: str
    criticity: str
    justification: str
    recommended_action: str
    analyzer: str

    @property
    def score(self) -> int:
        return SCORE[self.criticity]


class Analyzer:
    """Utilise Claude si une clé API est disponible, sinon une heuristique déterministe."""

    def __init__(self) -> None:
        self.model = os.getenv("LLM_MODEL", "claude-opus-5-5")
        self.client = None
        if os.getenv("ANTHROPIC_API_KEY"):
            import anthropic

            self.client = anthropic.Anthropic()
            log.info("Analyse LLM activée (%s)", self.model)
        else:
            log.warning("ANTHROPIC_API_KEY absente : repli sur la classification heuristique")

    def analyze(self, item: RawItem) -> Analysis:
        if self.client is not None:
            try:
                return self._analyze_llm(item)
            except Exception as exc:  # une erreur API ne doit pas bloquer la collecte
                log.error("Analyse LLM impossible pour %s : %s", item.external_id, exc)
        return heuristic_analysis(item)

    def _analyze_llm(self, item: RawItem) -> Analysis:
        user = (
            f"Source : {item.source} ({item.category})\n"
            f"Titre : {item.title}\n"
            f"Date : {item.published_at.date() if item.published_at else 'inconnue'}\n"
            f"Contenu : {item.content}\n"
            f"Lien : {item.url}"
        )
        # fallbacks="default" : si un classifieur de sécurité refuse (contenu de
        # vulnérabilité), l'API relance la même requête sur un modèle de repli.
        response = self.client.beta.messages.create(
            model=self.model,
            max_tokens=2048,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM_PROMPT,
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": ANALYSIS_SCHEMA},
            },
            messages=[{"role": "user", "content": user}],
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            raise RuntimeError(f"réponse inexploitable (stop_reason={response.stop_reason})")
        text = next(b.text for b in response.content if b.type == "text")
        data = json.loads(text)
        return Analysis(
            summary=data["summary"],
            criticity=data["criticity"],
            justification=data["justification"],
            recommended_action=data["recommended_action"],
            analyzer=response.model,
        )


# --- Repli heuristique -------------------------------------------------------

CRITICAL_PATTERNS = re.compile(
    r"activement exploitée|exploitation active|exploitée dans le cadre d'attaques|"
    r"rançongiciel|ransomware|0-day|zero-day|jour zéro", re.IGNORECASE)
HIGH_PATTERNS = re.compile(
    r"exécution de code arbitraire à distance|exécution de code à distance|"
    r"contournement de (la politique de sécurité|l'authentification)|élévation de privilèges|"
    r"injection SQL", re.IGNORECASE)
MEDIUM_PATTERNS = re.compile(
    r"déni de service|atteinte à la confidentialité|atteinte à l'intégrité|XSS|"
    r"falsification de requêtes|SSRF|injection de code indirecte", re.IGNORECASE)
REG_HIGH = re.compile(r"NIS ?2|2022/2555|DORA|2022/2554|Cyber Resilience|2024/2847|cybersécurité", re.IGNORECASE)
REG_MEDIUM = re.compile(r"intelligence artificielle|données|identité numérique|eIDAS|nuage|numérique", re.IGNORECASE)


def heuristic_analysis(item: RawItem) -> Analysis:
    text = f"{item.title} {item.content}"
    if item.kind == "cyber":
        if item.category == "alerte" or CRITICAL_PATTERNS.search(text):
            level, why = "critique", "Alerte CERT-FR ou exploitation active signalée."
        elif HIGH_PATTERNS.search(text):
            level, why = "élevé", "Vulnérabilité permettant une compromission (RCE, élévation de privilèges ou contournement)."
        elif MEDIUM_PATTERNS.search(text) or item.category == "avis":
            level, why = "moyen", "Vulnérabilité à impact limité (déni de service, fuite ou altération de données)."
        else:
            level, why = "faible", "Publication d'information sans vulnérabilité exploitable identifiée."
        action = (
            "Identifier les actifs concernés et appliquer les correctifs de l'éditeur en urgence."
            if level in ("critique", "élevé")
            else "Vérifier l'exposition et planifier la mise à jour lors du prochain cycle de correctifs."
        )
    else:
        if re.search(r"rectificatif|Berichtigung|corrigendum", text, re.IGNORECASE):
            level, why = "faible", "Rectificatif sans nouvelle obligation."
        elif REG_HIGH.search(text):
            level, why = "élevé", "Texte imposant des obligations de cybersécurité."
        elif REG_MEDIUM.search(text):
            level, why = "moyen", "Texte numérique ou données à surveiller."
        else:
            level, why = "faible", "Impact réglementaire limité pour l'entreprise."
        action = (
            "Analyser l'applicabilité, désigner un responsable et intégrer les exigences au plan de conformité."
            if level != "faible"
            else "Archiver pour information."
        )
    summary = item.content if len(item.content) <= 600 else item.content[:597] + "..."
    if item.cves:
        summary += f" CVE : {', '.join(item.cves[:5])}."
    return Analysis(summary=summary, criticity=level, justification=why,
                    recommended_action=action, analyzer="heuristique")
