#!/usr/bin/env python3
"""Pull the verified server database snapshot; preserve the previous local copy on failure."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location("database_backup", Path(__file__).with_name("database-backup.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
REMOTE = "/opt/questkeeps/backups/database/latest.sqlite"


def remote(host, command):
    return subprocess.check_output(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, command],
                                   text=True, timeout=40).strip()


def pull(host, folder):
    if not re.fullmatch(r"[A-Za-z0-9@.:-]+", host) or host.startswith("-"):
        raise ValueError("Invalid SSH host")
    os.umask(0o077)
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    status_file = folder / "status.json"
    previous = {}
    if status_file.exists():
        try:
            previous = json.loads(status_file.read_text())
        except (OSError, ValueError):
            pass
    temporary = None
    try:
        for attempt in range(3):
            state = json.loads(remote(host, "python3 /opt/questkeeps/docker-tools/database-backup.py status"))
            before = remote(host, "sha256sum " + REMOTE).split()[0]
            if not re.fullmatch(r"[a-f0-9]{64}", before):
                raise RuntimeError("Invalid remote snapshot checksum")
            fd, temporary = tempfile.mkstemp(prefix=".download-", suffix=".sqlite", dir=folder)
            os.close(fd)
            subprocess.run(["scp", "-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                            host + ":" + REMOTE, temporary], check=True, timeout=240)
            after = remote(host, "sha256sum " + REMOTE).split()[0]
            if before != after:
                os.unlink(temporary)
                temporary = None
                continue
            if backup.checksum(temporary) != before:
                raise RuntimeError("Downloaded database checksum mismatch")
            result = backup.inspect_snapshot(temporary)
            result.update({"sha256": before, "bytes": os.path.getsize(temporary), "ok": True,
                           "remote_last_success": state["last_success"], "last_success": backup.utc(),
                           "last_attempt": backup.utc()})
            with open(temporary, "rb+") as stream:
                os.fsync(stream.fileno())
            os.replace(temporary, folder / "latest.sqlite")
            temporary = None
            backup.atomic_json(status_file, result)
            return result
        raise RuntimeError("Server snapshot changed repeatedly; try again later")
    except Exception as error:
        backup.atomic_json(status_file, {**previous, "ok": False, "last_attempt": backup.utc(),
                                        "error": type(error).__name__})
        raise
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="root@222.167.230.214")
    parser.add_argument("--directory", type=Path, default=Path.home() / "QuestKeeps-backups")
    args = parser.parse_args()
    print(json.dumps(pull(args.host, args.directory)))
