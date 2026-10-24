#!/usr/bin/env bash
set -euo pipefail
exec 9>/opt/questkeeps/docker-state/deploy.lock
flock -s 9
slot=$(cat /opt/questkeeps/docker-state/active-slot)
[[ "$slot" = blue || "$slot" = green ]]
docker exec "qk-web-$slot" node --env-file=/run/questkeeps.env --import tsx scripts/backup.ts
find /opt/questkeeps/shared/data/backups -maxdepth 1 -type f -name 'travel-*.sqlite' -mtime +14 -delete
