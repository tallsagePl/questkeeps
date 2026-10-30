#!/usr/bin/env bash
# Called only after a successful handover while the release lock is held.
# Standalone use requires taking /opt/questkeeps/docker-state/deploy.lock first.
set -euo pipefail
root=/opt/questkeeps
expected=$1
[[ "$expected" =~ ^sha256:[a-f0-9]{64}$ ]]
slot=$(cat "$root/docker-state/active-slot")
[[ "$slot" = blue || "$slot" = green ]]
[ "$(cat "$root/docker-state/active-image")" = "$expected" ]
for role in web worker video; do
  name="qk-$role-$slot"
  [ "$(docker inspect --format '{{.Image}}' "$name")" = "$expected" ]
  [ "$(docker inspect --format '{{.State.Running}}' "$name")" = true ]
  [ "$(docker inspect --format '{{.RestartCount}}' "$name")" = 0 ]
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "qk-web-$slot")" = healthy ]
HEALTH_URL=https://questkeeps.ru HEALTH_ASSET_BASE=https://questkeeps.ru /usr/local/bin/node "$root/docker-tools/container-health.mjs"
if [ "$slot" = blue ]; then previous=green; else previous=blue; fi
for role in web worker video; do
  name="qk-$role-$previous"
  if docker container inspect "$name" >/dev/null 2>&1; then
    [ "$(docker inspect --format '{{index .Config.Labels "app"}}' "$name")" = questkeeps ]
    [ "$(docker inspect --format '{{.State.Running}}' "$name")" = false ]
    [ "$(docker inspect --format '{{.Image}}' "$name")" != "$expected" ]
    docker rm "$name"
  fi
done
# Scope removal to this application's repository. No force flag, volumes or global prune.
while IFS= read -r old; do
  [ -n "$old" ] || continue
  [ "$old" != "$expected" ] || continue
  docker image rm "$old"
done < <(docker image ls --no-trunc --quiet --filter 'reference=questkeeps:*' | sort -u)
