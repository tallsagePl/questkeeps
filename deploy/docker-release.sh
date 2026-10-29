#!/usr/bin/env bash
# Blue/green deployment for the existing single-host SQLite installation.
set -Eeuo pipefail
image=$1
[[ "$image" =~ ^questkeeps:[a-zA-Z0-9._-]+$ ]] || { echo 'Use an immutable questkeeps:VERSION-REVISION image tag'; exit 1; }
root=/opt/questkeeps
state="$root/docker-state"
upstream=/etc/nginx/conf.d/questkeeps-upstream.conf
mkdir -p "$state"
chmod 700 "$state"
exec 9>"$state/deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
test -f "$upstream"
image_id=$(docker image inspect --format '{{.Id}}' "$image")
target_schema=$(docker run --rm --network none --read-only "$image_id" node -p "require('./deployment.json').schema")
current_schema=$(python3 -c "import sqlite3; print(sqlite3.connect('file:/opt/questkeeps/shared/data/travel.sqlite?mode=ro',uri=True).execute('pragma user_version').fetchone()[0])")
schema_transition="$current_schema:$target_schema"
schema_changed=false
schema_tool="$(dirname "$0")/media-archive-schema.py"
if [ "$target_schema" != "$current_schema" ] && [ "$schema_transition" != '8:9' ] && [ "$schema_transition" != '9:8' ] && [ "$schema_transition" != '9:10' ] && [ "$schema_transition" != '10:9' ] && [ "$schema_transition" != '8:10' ] && [ "$schema_transition" != '10:8' ] && [ "$schema_transition" != '10:11' ] && [ "$schema_transition" != '11:10' ] && [ "$schema_transition" != '11:12' ] && [ "$schema_transition" != '12:11' ]; then
  echo "Schema $current_schema -> $target_schema requires a reviewed compatible migration before an online rollout."
  exit 1
fi
current_port=$(sed -nE 's/.*server 127.0.0.1:([0-9]+);/\1/p' "$upstream")
legacy=false
case "$current_port" in
  3000) slot=blue; port=3101; previous_web=''; previous_worker=''; legacy=true ;;
  3101) slot=green; port=3102; previous_web=qk-web-blue; previous_worker=qk-worker-blue ;;
  3102) slot=blue; port=3101; previous_web=qk-web-green; previous_worker=qk-worker-green ;;
  *) echo 'Unrecognized active upstream'; exit 1 ;;
esac
web="qk-web-$slot"
worker="qk-worker-$slot"
for container in "$web" "$worker"; do
  if docker container inspect "$container" >/dev/null 2>&1; then
    test "$(docker inspect --format '{{index .Config.Labels "app"}}' "$container")" = questkeeps
    docker rm -f "$container" >/dev/null
  fi
done
cp "$upstream" "$state/upstream.previous"
switched=false
worker_stopped=false
rollback() {
  trap - ERR INT TERM
  set +e
  docker rm -f "$worker" >/dev/null 2>&1
  docker rm -f "$web" >/dev/null 2>&1
  if [ "$schema_changed" = true ]; then
    if ! python3 "$schema_tool" "$root/shared/data/travel.sqlite" "$current_schema"; then
      echo 'Schema marker rollback failed; previous containers were not restarted.'
      exit 1
    fi
  fi
  if [ "$worker_stopped" = true ]; then
    if [ "$legacy" = true ]; then systemctl start questkeeps
    else docker start "$previous_worker" >/dev/null; fi
  fi
  if [ "$legacy" != true ]; then docker start "$previous_web" >/dev/null 2>&1; fi
  if [ "$switched" = true ]; then
    cp "$state/upstream.previous" "$upstream.rollback"
    mv -Tf "$upstream.rollback" "$upstream"
    nginx -t && systemctl reload nginx
  fi
  docker rm -f "$web" >/dev/null 2>&1
  echo 'Deployment failed; previous traffic target and worker restored.'
  exit 1
}
trap rollback ERR INT TERM
# Online snapshot before the candidate or the reviewed additive migration.
python3 - <<'PY'
import sqlite3, os, time
folder='/opt/questkeeps/backups'
os.makedirs(folder,exist_ok=True)
path=folder+'/pre-docker-'+str(time.time_ns())+'.sqlite'
source=sqlite3.connect('file:/opt/questkeeps/shared/data/travel.sqlite?mode=ro',uri=True)
target=sqlite3.connect(path)
source.backup(target)
assert target.execute('pragma quick_check').fetchone()[0]=='ok'
target.close()
source.close()
os.chmod(path,0o600)
PY
# Reviewed 8 -> 9 -> 10 -> 11 -> 12 changes add defaulted columns and independent tables. Old
# application SQL remains compatible. A rollback retains both and restores only
# the compatibility marker, without restoring a stale database snapshot.
if [ "$target_schema" -gt "$current_schema" ]; then
  test -f "$schema_tool"
  docker run --rm --network none --security-opt no-new-privileges --cap-drop ALL \
    --mount "type=bind,src=$root/shared/data,dst=/app/data" \
    --mount "type=bind,src=$root/shared/.env.local,dst=/run/questkeeps.env,readonly" "$image_id" \
    node --env-file=/run/questkeeps.env --import tsx scripts/migrate.ts
  schema_changed=true
elif [ "$target_schema" -lt "$current_schema" ]; then
  python3 "$schema_tool" "$root/shared/data/travel.sqlite" "$target_schema"
  schema_changed=true
fi

docker run -d --init --name "$web" --label app=questkeeps --label role=web --restart unless-stopped \
  --memory 640m --memory-swap 1280m --pids-limit 160 --security-opt no-new-privileges --cap-drop ALL \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p "127.0.0.1:$port:3000" \
  --mount "type=bind,src=$root/shared/data,dst=/app/data" \
  --mount "type=bind,src=$root/shared/.env.local,dst=/run/questkeeps.env,readonly" "$image_id" >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Running}}' "$web")" != true ]; then break; fi
  if [ "$(docker inspect --format '{{.RestartCount}}' "$web")" != 0 ]; then break; fi
  if HEALTH_URL="http://127.0.0.1:$port" /usr/local/bin/node "$root/docker-tools/container-health.mjs"; then ready=true; break; fi
  sleep 2
done
[ "$ready" = true ]
echo 'Candidate responds to page and database checks; previous web is still running.'
assets=$(mktemp -d "$state/assets.XXXXXX")
docker cp "$web:/app/.next/static/." "$assets"
mkdir -p "/var/www/questkeeps-assets"
cp -r "$assets/." "/var/www/questkeeps-assets/"
chmod -R a+rX "/var/www/questkeeps-assets"
case "$assets" in "$state"/assets.*) rm -rf "$assets" ;; esac
HEALTH_URL="http://127.0.0.1:$port" HEALTH_ASSET_BASE=https://questkeeps.ru /usr/local/bin/node "$root/docker-tools/container-health.mjs"
printf 'upstream questkeeps_backend {\n    server 127.0.0.1:%s;\n    keepalive 16;\n}\n' "$port" > "$state/upstream.next"
cp "$state/upstream.next" "$upstream.next"
mv -Tf "$upstream.next" "$upstream"
switched=true
nginx -t
systemctl reload nginx
HEALTH_URL="http://127.0.0.1:$port" /usr/local/bin/node "$root/docker-tools/container-health.mjs"
# Retire exactly one old worker before starting its replacement.
worker_stopped=true
if [ "$legacy" = true ]; then systemctl stop questkeeps
else docker stop --time 60 "$previous_worker" >/dev/null; fi
docker run -d --init --name "$worker" --label app=questkeeps --label role=worker --restart unless-stopped \
  --no-healthcheck --memory 256m --memory-swap 512m --pids-limit 80 \
  --security-opt no-new-privileges --cap-drop ALL --log-opt max-size=10m --log-opt max-file=3 \
  --mount "type=bind,src=$root/shared/data,dst=/app/data" \
  --mount "type=bind,src=$root/shared/.env.local,dst=/run/questkeeps.env,readonly" "$image_id" \
  node --env-file=/run/questkeeps.env --import tsx scripts/worker.ts >/dev/null
sleep 3
test "$(docker inspect --format '{{.State.Running}}' "$worker")" = true
test "$(docker inspect --format '{{.RestartCount}}' "$worker")" = 0
HEALTH_URL="http://127.0.0.1:$port" /usr/local/bin/node "$root/docker-tools/container-health.mjs"
if [ "$legacy" = true ]; then systemctl disable questkeeps
else docker stop --time 60 "$previous_web" >/dev/null; fi
printf '%s\n' "$slot" > "$state/active-slot.next"
printf '%s\n' "$image_id" > "$state/active-image.next"
mv -Tf "$state/active-image.next" "$state/active-image"
mv -Tf "$state/active-slot.next" "$state/active-slot"
trap - ERR INT TERM
echo "Active: $web ($image). Previous image/container retained."
