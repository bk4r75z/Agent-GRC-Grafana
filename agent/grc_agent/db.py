"""Accès PostgreSQL : déduplication, insertion des risques et journal des collectes."""

from __future__ import annotations

import os

import psycopg

from .analyzer import Analysis
from .sources import RawItem


def connect() -> psycopg.Connection:
    return psycopg.connect(
        os.getenv("DATABASE_URL", "postgresql://grc:grc@localhost:5432/grc"), autocommit=True
    )


def known_ids(conn: psycopg.Connection, ids: list[str]) -> set[str]:
    rows = conn.execute(
        "SELECT external_id FROM risks WHERE external_id = ANY(%s)", (ids,)
    ).fetchall()
    return {r[0] for r in rows}


def insert_risk(conn: psycopg.Connection, item: RawItem, a: Analysis) -> bool:
    cur = conn.execute(
        """
        INSERT INTO risks (external_id, source, kind, category, title, summary, criticity,
                           criticity_score, justification, recommended_action, cves,
                           source_url, published_at, analyzer)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (external_id) DO NOTHING
        """,
        (item.external_id, item.source, item.kind, item.category, item.title, a.summary,
         a.criticity, a.score, a.justification, a.recommended_action, item.cves,
         item.url, item.published_at, a.analyzer),
    )
    return cur.rowcount == 1


def start_run(conn: psycopg.Connection) -> int:
    return conn.execute("INSERT INTO collection_runs DEFAULT VALUES RETURNING id").fetchone()[0]


def finish_run(conn, run_id: int, fetched: int, inserted: int, skipped: int,
               status: str = "success", error: str | None = None) -> None:
    conn.execute(
        """UPDATE collection_runs SET finished_at = now(), fetched=%s, inserted=%s,
           skipped=%s, status=%s, error=%s WHERE id=%s""",
        (fetched, inserted, skipped, status, error, run_id),
    )
