#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/opt/questkeeps
exec 9>"$root/docker-state/deploy.lock"
# A snapshot must not overlap a schema transition or release cleanup.
flock -x -w 240 9
python3 "$root/docker-tools/database-backup.py" create
python3 "$root/docker-tools/database-backup.py" status
