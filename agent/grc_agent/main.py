"""Point d'entrée de l'agent.

    python -m grc_agent.main            # une collecte puis sortie
    python -m grc_agent.main --schedule # collecte immédiate puis toutes les heures
"""

from __future__ import annotations

import argparse
import logging
import os
import time

from apscheduler.schedulers.blocking import BlockingScheduler

from . import db
from .analyzer import Analyzer
from .sources import collect_all

log = logging.getLogger("grc_agent")


def run_once() -> dict:
    conn = None
    for attempt in range(10):  # la base peut démarrer après l'agent
        try:
            conn = db.connect()
            break
        except Exception as exc:
            log.warning("PostgreSQL indisponible (%s), nouvel essai dans 3 s", exc)
            time.sleep(3)
    if conn is None:
        raise SystemExit("Impossible de se connecter à PostgreSQL")

    with conn:
        run_id = db.start_run(conn)
        try:
            items = collect_all()
            already = db.known_ids(conn, [i.external_id for i in items])
            new_items = [i for i in items if i.external_id not in already]
            log.info("%d éléments collectés, %d nouveaux à analyser", len(items), len(new_items))
            analyzer = Analyzer()
            inserted = 0
            for item in new_items:
                analysis = analyzer.analyze(item)
                if db.insert_risk(conn, item, analysis):
                    inserted += 1
                    log.info("[%s] %s — %s", analysis.criticity.upper(), item.source, item.title[:90])
            stats = {"fetched": len(items), "inserted": inserted, "skipped": len(already)}
            db.finish_run(conn, run_id, **stats)
            log.info("Collecte terminée : %s", stats)
            return stats
        except Exception as exc:
            db.finish_run(conn, run_id, 0, 0, 0, status="error", error=str(exc))
            raise


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Agent de veille GRC")
    parser.add_argument("--schedule", action="store_true", help="collecte toutes les heures")
    args = parser.parse_args()

    if not args.schedule:
        run_once()
        return

    interval = int(os.getenv("COLLECT_INTERVAL_MINUTES", "60"))
    scheduler = BlockingScheduler(timezone="Europe/Paris")
    scheduler.add_job(run_once, "interval", minutes=interval, id="collect",
                      max_instances=1, coalesce=True)
    try:
        run_once()  # première collecte immédiate
    except Exception:
        log.exception("La collecte initiale a échoué")
    log.info("Planification : collecte toutes les %d minutes", interval)
    scheduler.start()


if __name__ == "__main__":
    main()
