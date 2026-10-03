"""SQLite-backed job store. State survives engine restarts and crashes."""
import sqlite3
import json
import time
import threading
import uuid

from . import config

_local = threading.local()

ACTIVE_STAGES = ("queued", "downloading", "transcribing", "analyzing", "rendering", "uploading")
TERMINAL = ("done", "failed", "canceled", "failed_permanent")


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        config.ensure_dirs()
        conn = sqlite3.connect(config.DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        _local.conn = conn
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT DEFAULT '',
  progress REAL DEFAULT 0,
  message TEXT DEFAULT '',
  error TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  source_kind TEXT DEFAULT 'url',
  upload_path TEXT DEFAULT '',
  video_title TEXT DEFAULT '',
  duration REAL DEFAULT 0,
  settings TEXT DEFAULT '{}',
  clips TEXT DEFAULT '[]',
  transcript TEXT DEFAULT '',
  analysis TEXT DEFAULT '',
  stage_timings TEXT DEFAULT '{}',
  create_time REAL,
  update_time REAL,
  start_time REAL DEFAULT 0,
  end_time REAL DEFAULT 0,
  recovery_count INTEGER DEFAULT 0,
  cancel_requested INTEGER DEFAULT 0
);
"""


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()


def new_job(source_url: str, source_kind: str, upload_path: str, settings: dict) -> str:
    job_id = uuid.uuid4().hex[:12]
    now = time.time()
    conn = get_conn()
    conn.execute(
        "INSERT INTO jobs (id, status, source_url, source_kind, upload_path, settings, create_time, update_time)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (job_id, "queued", source_url, source_kind, upload_path, json.dumps(settings), now, now),
    )
    conn.commit()
    return job_id


def update(job_id: str, **fields):
    fields["update_time"] = time.time()
    keys = ", ".join(f"{k}=?" for k in fields)
    conn = get_conn()
    conn.execute(f"UPDATE jobs SET {keys} WHERE id=?", (*fields.values(), job_id))
    conn.commit()


def get(job_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return dict(row) if row else None


def list_jobs(limit=50):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM jobs ORDER BY create_time DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def claim_next_queued():
    """Atomically claim the next queued job for processing (worker thread only)."""
    with _claim_lock:
        conn = get_conn()
        row = conn.execute(
            "SELECT * FROM jobs WHERE status='queued' ORDER BY create_time ASC LIMIT 1"
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE jobs SET status='downloading', stage='download', start_time=?, update_time=? WHERE id=? AND status='queued'",
            (time.time(), time.time(), row["id"]),
        )
        conn.commit()
        return dict(row)


_claim_lock = threading.Lock()


def recover_interrupted():
    """On engine startup: requeue jobs stuck in active stages (max MAX_RECOVERY)."""
    conn = get_conn()
    rows = conn.execute(
        f"SELECT id, status, recovery_count FROM jobs WHERE status IN ({','.join('?' * len(ACTIVE_STAGES))})",
        ACTIVE_STAGES,
    ).fetchall()
    recovered, failed = [], []
    for r in rows:
        count = r["recovery_count"] + 1
        if count > config.MAX_RECOVERY:
            conn.execute(
                "UPDATE jobs SET status='failed_permanent', error='recovery limit exceeded after engine restart',"
                " recovery_count=?, end_time=?, update_time=? WHERE id=?",
                (count, time.time(), time.time(), r["id"]),
            )
            failed.append(r["id"])
        else:
            conn.execute(
                "UPDATE jobs SET status='queued', stage='recovering', progress=0, message=?,"
                " recovery_count=?, update_time=? WHERE id=?",
                (f"auto-recovered after restart (attempt {count}/3)", count, time.time(), r["id"]),
            )
            recovered.append(r["id"])
    conn.commit()
    return recovered, failed
