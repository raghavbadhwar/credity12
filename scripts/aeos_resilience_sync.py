#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AEOS = ROOT / "AEOS_Memory"
DB_PATH = AEOS / "Operational_Memory" / "aeos_resilience.sqlite"


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS checkpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            title TEXT NOT NULL,
            source_file TEXT NOT NULL,
            body TEXT NOT NULL,
            hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            source_file TEXT NOT NULL,
            summary TEXT NOT NULL,
            hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS artifacts (
            path TEXT PRIMARY KEY,
            mtime TEXT NOT NULL,
            size INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL,
            notes TEXT
        )
        """
    )


def ingest_checkpoints(conn: sqlite3.Connection) -> int:
    state_file = AEOS / "Operational_Memory" / "current-state.md"
    if not state_file.exists():
        return 0

    text = state_file.read_text(encoding="utf-8")
    # Split by markdown H2 sections
    parts = re.split(r"\n## ", text)
    inserted = 0
    for i, raw in enumerate(parts):
        section = raw if i == 0 else f"## {raw}"
        lines = section.splitlines()
        if not lines:
            continue
        header = lines[0].strip()
        if not header.startswith("## Operational Checkpoint"):
            continue
        body = "\n".join(lines[1:]).strip()
        ts_match = re.search(r"\(([^)]+)\)", header)
        ts = ts_match.group(1).strip() if ts_match else None
        h = sha(f"{state_file}|{header}|{body}")
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO checkpoints (timestamp, title, source_file, body, hash)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ts, header.replace("## ", "", 1), str(state_file), body, h),
        )
        inserted += cur.rowcount
    return inserted


def ingest_decisions(conn: sqlite3.Connection) -> int:
    decisions_dir = AEOS / "Decision_Logs"
    if not decisions_dir.exists():
        return 0

    inserted = 0
    for file in sorted(decisions_dir.glob("*.md")):
        text = file.read_text(encoding="utf-8")

        if file.name == "weekly-learning-log.md":
            for line in text.splitlines():
                line = line.strip()
                if not line.startswith("- "):
                    continue
                ts_match = re.match(r"-\s*(\d{4}-\d{2}-\d{2})", line)
                ts = ts_match.group(1) if ts_match else None
                h = sha(f"{file}|{line}")
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO decisions (timestamp, source_file, summary, hash)
                    VALUES (?, ?, ?, ?)
                    """,
                    (ts, str(file), line[2:].strip(), h),
                )
                inserted += cur.rowcount
            continue

        ts_match = re.search(r"^\- Timestamp:\s*(.+)$", text, flags=re.MULTILINE)
        ts = ts_match.group(1).strip() if ts_match else None
        summary = re.sub(r"\s+", " ", text.strip())[:4000]
        h = sha(f"{file}|{summary}")
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO decisions (timestamp, source_file, summary, hash)
            VALUES (?, ?, ?, ?)
            """,
            (ts, str(file), summary, h),
        )
        inserted += cur.rowcount

    return inserted


def refresh_artifacts(conn: sqlite3.Connection) -> int:
    changed = 0
    for path in AEOS.rglob("*"):
        if not path.is_file() or path == DB_PATH:
            continue
        stat = path.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        cur = conn.execute(
            """
            INSERT INTO artifacts(path, mtime, size)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET mtime=excluded.mtime, size=excluded.size
            """,
            (str(path), mtime, stat.st_size),
        )
        changed += cur.rowcount
    return changed


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        checkpoints = ingest_checkpoints(conn)
        decisions = ingest_decisions(conn)
        artifacts = refresh_artifacts(conn)
        note = f"checkpoints+{checkpoints}; decisions+{decisions}; artifacts_upserted={artifacts}"
        conn.execute(
            "INSERT INTO sync_log(synced_at, notes) VALUES (?, ?)",
            (datetime.now(timezone.utc).isoformat(), note),
        )
        conn.commit()
        print(f"DB: {DB_PATH}")
        print(note)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
