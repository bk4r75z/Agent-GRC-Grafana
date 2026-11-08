"""Collecte des actualités depuis les deux sources officielles : CERT-FR et EUR-Lex."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import feedparser
import httpx

log = logging.getLogger(__name__)

USER_AGENT = "grc-watch-agent/1.0 (+veille GRC)"

# --- CERT-FR -----------------------------------------------------------------
# Flux RSS officiels : le flux général et le flux dédié aux alertes (les plus graves).
CERTFR_FEEDS = [
    "https://www.cert.ssi.gouv.fr/feed/",
    "https://www.cert.ssi.gouv.fr/alerte/feed/",
]
CERTFR_CATEGORIES = {
    "alerte": "alerte",
    "avis": "avis",
    "actualite": "actualite",
    "cti": "cti",
    "ioc": "ioc",
    "dur": "durcissement",
}

# --- EUR-Lex -----------------------------------------------------------------
# Flux RSS publics d'EUR-Lex (rssId) : législation adoptée, propositions de la
# Commission, actes du Journal officiel série L.
EURLEX_FEEDS = {
    "legislation": "https://eur-lex.europa.eu/FR/display-feed.rss?rssId=162",
    "proposition": "https://eur-lex.europa.eu/FR/display-feed.rss?rssId=161",
    "journal_officiel": "https://eur-lex.europa.eu/FR/display-feed.rss?rssId=222",
}

# Ces flux couvrent tout le droit de l'UE : on ne garde que ce qui touche à la
# cybersécurité, au numérique et à la protection des données.
EURLEX_KEYWORDS = re.compile(
    r"cyber|NIS ?2|résilience opérationnelle numérique|\bDORA\b|"
    r"données à caractère personnel|protection des données|informatique en nuage|"
    r"intelligence artificielle|identité numérique|eIDAS|sécurité des réseaux|"
    r"systèmes d'information|services numériques|marchés numériques|"
    r"produits comportant des éléments numériques|cryptograph|ransomware|rançongiciel|"
    r"\bTIC\b|\bICT\b|2022/2555|2022/2554|2024/2847|2024/1689|2019/881|2016/679|"
    r"accès aux données|Data Act|cybersecurity|artificial intelligence|personal data",
    re.IGNORECASE,
)

# Socle réglementaire cyber de référence (textes officiels EUR-Lex) : garantit
# que le tableau de bord couvre les textes majeurs même quand les flux du jour
# ne contiennent aucune nouveauté cyber.
EURLEX_WATCHLIST = [
    ("32022L2555", "Directive (UE) 2022/2555 (NIS 2) concernant des mesures destinées à assurer un niveau élevé commun de cybersécurité dans l'ensemble de l'Union", "2022-12-27"),
    ("32022R2554", "Règlement (UE) 2022/2554 (DORA) sur la résilience opérationnelle numérique du secteur financier", "2022-12-27"),
    ("32024R2847", "Règlement (UE) 2024/2847 (Cyber Resilience Act) concernant des exigences de cybersécurité horizontales pour les produits comportant des éléments numériques", "2024-11-20"),
    ("32024R1689", "Règlement (UE) 2024/1689 (AI Act) établissant des règles harmonisées concernant l'intelligence artificielle", "2024-07-12"),
    ("32019R0881", "Règlement (UE) 2019/881 (Cybersecurity Act) relatif à l'ENISA et à la certification de cybersécurité des TIC", "2019-06-07"),
    ("32016R0679", "Règlement (UE) 2016/679 (RGPD) relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel", "2016-05-04"),
    ("32024R1183", "Règlement (UE) 2024/1183 (eIDAS 2) établissant le cadre européen relatif à une identité numérique", "2024-04-30"),
    ("32023R2854", "Règlement (UE) 2023/2854 (Data Act) concernant des règles harmonisées portant sur l'équité de l'accès aux données et de l'utilisation des données", "2023-12-22"),
]


@dataclass
class RawItem:
    external_id: str
    source: str  # "CERT-FR" | "EUR-Lex"
    kind: str  # "cyber" | "reglementaire"
    category: str
    title: str
    content: str
    url: str
    published_at: datetime | None
    cves: list[str] = field(default_factory=list)


CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}")
TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", text or "")).strip()


def _published(entry) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    return datetime(*parsed[:6], tzinfo=timezone.utc)


def _fetch(client: httpx.Client, url: str):
    resp = client.get(url)
    resp.raise_for_status()
    return feedparser.parse(resp.content)


def fetch_certfr(client: httpx.Client) -> list[RawItem]:
    items: dict[str, RawItem] = {}
    for feed_url in CERTFR_FEEDS:
        try:
            feed = _fetch(client, feed_url)
        except httpx.HTTPError as exc:
            log.warning("CERT-FR : échec de lecture de %s (%s)", feed_url, exc)
            continue
        for entry in feed.entries:
            url = entry.get("link", "")
            guid = entry.get("id") or url
            # Le domaine a migré de cert.ssi.gouv.fr vers cert.cyber.gouv.fr :
            # on normalise l'identifiant sur le chemin pour éviter les doublons.
            key = re.sub(r"^https?://[^/]+", "", guid)
            m = re.search(r"/(alerte|avis|actualite|cti|ioc|dur)/", url)
            category = CERTFR_CATEGORIES.get(m.group(1), "autre") if m else "autre"
            content = _clean(entry.get("description") or entry.get("summary"))
            title = _clean(entry.get("title"))
            items[key] = RawItem(
                external_id=f"certfr:{key}",
                source="CERT-FR",
                kind="cyber",
                category=category,
                title=title,
                content=content,
                url=url,
                published_at=_published(entry),
                cves=sorted(set(CVE_RE.findall(f"{title} {content}"))),
            )
    log.info("CERT-FR : %d éléments collectés", len(items))
    return list(items.values())


def fetch_eurlex(client: httpx.Client) -> list[RawItem]:
    items: dict[str, RawItem] = {}
    for category, feed_url in EURLEX_FEEDS.items():
        try:
            feed = _fetch(client, feed_url)
        except httpx.HTTPError as exc:
            log.warning("EUR-Lex : échec de lecture de %s (%s)", feed_url, exc)
            continue
        kept = 0
        for entry in feed.entries:
            raw_title = _clean(entry.get("title"))
            description = _clean(entry.get("description"))
            if not EURLEX_KEYWORDS.search(f"{raw_title} {description}"):
                continue
            celex = re.match(r"CELEX:(\S+?):", raw_title)
            title = re.sub(r"^CELEX:\S+:\s*", "", raw_title) or raw_title
            celex_id = celex.group(1) if celex else (entry.get("id") or entry.get("link"))
            url = (entry.get("link") or "").replace("/./", "/")
            if celex:
                url = f"https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:{celex_id}"
            items[celex_id] = RawItem(
                external_id=f"eurlex:{celex_id}",
                source="EUR-Lex",
                kind="reglementaire",
                category=category,
                title=title,
                content=description or title,
                url=url,
                published_at=_published(entry),
            )
            kept += 1
        log.info("EUR-Lex %s : %d/%d éléments pertinents", category, kept, len(feed.entries))

    for celex_id, title, date in EURLEX_WATCHLIST:
        items.setdefault(
            celex_id,
            RawItem(
                external_id=f"eurlex:{celex_id}",
                source="EUR-Lex",
                kind="reglementaire",
                category="referentiel",
                title=title,
                content=title,
                url=f"https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:{celex_id}",
                published_at=datetime.fromisoformat(date).replace(tzinfo=timezone.utc),
            ),
        )
    return list(items.values())


def collect_all() -> list[RawItem]:
    with httpx.Client(
        timeout=30, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    ) as client:
        return fetch_certfr(client) + fetch_eurlex(client)
