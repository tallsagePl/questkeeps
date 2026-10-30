#!/usr/bin/env python3
"""Create one verified, atomically published SQLite snapshot; never copy a live WAL file."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time
from datetime import datetime, timezone


def utc():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix=".status-", dir=path.parent)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def inspect_snapshot(path):
    path = Path(path).resolve(strict=True)
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    try:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise RuntimeError("Snapshot integrity check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise RuntimeError("Snapshot foreign key check failed")
        # Read ordinary application tables from the restored standalone database.
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"users", "trips", "media"}.issubset(tables):
            raise RuntimeError("Snapshot is not a complete QuestKeeps database")
        counts = {name: connection.execute('SELECT count(*) FROM "' + name + '"').fetchone()[0]
                  for name in ("users", "trips", "media") if name in tables}
        return {"schema": connection.execute("PRAGMA user_version").fetchone()[0], "counts": counts}
    finally:
        connection.close()


def checksum(path):
    result = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def create_snapshot(source, folder, timeout=180):
    os.umask(0o077)
    source = Path(source).resolve()
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = folder / "latest.sqlite"
    if target.is_symlink() or source == target.resolve():
        raise ValueError("Backup target must not refer to the working database")
    status_file = folder / "status.json"
    previous = {}
    if status_file.exists():
        try:
            previous = json.loads(status_file.read_text())
        except (OSError, ValueError):
            pass
    attempt = utc()
    temporary = None
    try:
        if not source.is_file():
            raise FileNotFoundError("Working database is unavailable")
        wal = Path(str(source) + "-wal")
        required = source.stat().st_size + (wal.stat().st_size if wal.exists() else 0) + 64 * 1024 * 1024
        if shutil.disk_usage(folder).free < required:
            raise RuntimeError("Insufficient disk space for a safe database snapshot")
        fd, temporary = tempfile.mkstemp(prefix=".snapshot-", suffix=".sqlite", dir=folder)
        os.close(fd)
        started = time.monotonic()
        def progress(status, remaining, total):
            if time.monotonic() - started > timeout:
                raise TimeoutError("Database snapshot exceeded its time budget")
        origin = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=15)
        snapshot = sqlite3.connect(temporary)
        try:
            origin.backup(snapshot, pages=256, progress=progress, sleep=0.05)
            snapshot.execute("PRAGMA journal_mode=DELETE")
        finally:
            snapshot.close()
            origin.close()
        result = inspect_snapshot(temporary)
        result.update({"sha256": checksum(temporary), "bytes": os.path.getsize(temporary),
                       "last_attempt": attempt, "last_success": utc(), "ok": True})
        with open(temporary, "rb+") as stream:
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        temporary = None
        # Flush the directory entry so a successful publication survives a host crash.
        if os.name == "posix":
            directory = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        atomic_json(status_file, result)
        return result
    except Exception as error:
        atomic_json(status_file, {**previous, "ok": False, "last_attempt": attempt,
                                  "error": type(error).__name__})
        raise
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["create", "check", "status"])
    parser.add_argument("--source", default="/opt/questkeeps/shared/data/travel.sqlite")
    parser.add_argument("--directory", default="/opt/questkeeps/backups/database")
    parser.add_argument("--file")
    parser.add_argument("--max-age-hours", type=float, default=36)
    args = parser.parse_args()
    if args.command == "create":
        print(json.dumps(create_snapshot(args.source, args.directory)))
    elif args.command == "check":
        path = Path(args.file) if args.file else Path(args.directory) / "latest.sqlite"
        print(json.dumps({**inspect_snapshot(path), "sha256": checksum(path), "bytes": path.stat().st_size}))
    else:
        path = Path(args.directory) / "latest.sqlite"
        state = json.loads((Path(args.directory) / "status.json").read_text())
        success = datetime.fromisoformat(state["last_success"])
        age = (datetime.now(timezone.utc) - success).total_seconds() / 3600
        valid = bool(state.get("ok")) and path.exists() and age <= args.max_age_hours
        print(json.dumps({"ok": valid, "last_success": state["last_success"], "age_hours": round(age, 2),
                          "last_attempt_ok": state.get("ok")}))
        if not valid:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
