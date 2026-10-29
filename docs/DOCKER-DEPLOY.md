# Docker deployment on the QuestKeeps VPS

The production web server and the background worker are separate containers.
Nginx stays on the host. SQLite, uploads, cached source data, private configuration
and backups remain on the host; they are never part of an image.

## Build and release

Use a unique immutable tag for each release. On this VPS the service UID/GID is 997.
Build while the current service continues accepting traffic:

```sh
docker build --build-arg APP_UID=997 --build-arg APP_GID=997 \
  --build-arg SOURCE_REVISION=COMMIT -t questkeeps:VERSION-COMMIT .
bash /opt/questkeeps/docker-tools/docker-release.sh questkeeps:VERSION-COMMIT
```

The release script takes a deployment lock, checks image/database schema versions,
makes an online SQLite snapshot, and starts the inactive blue/green web slot.
The candidate must serve both the home page and database-backed /api/me before
Nginx reloads its upstream configuration. Candidate JavaScript/CSS/font assets are also checked through public Nginx before that switch. Failed preparation leaves the old web
running. Failure during handover restores the previous upstream and worker.
An old worker is stopped before its replacement starts; Telegram polling, mail
and synchronization never intentionally run in both slots at once.

The former web container is stopped gracefully only after the new web and worker
have passed their checks. Its image and stopped container remain available until
that inactive slot is reused by a later release. To roll back, deploy the previous
image tag through the same script. Never delete the only verified rollback image.

## First conversion from systemd

1. Install Docker Engine from the official Ubuntu repository.
2. Build and validate the image against an isolated fixture database first.
3. Install docker-release.sh, docker-backup.sh and scripts/container-health.mjs
   in /opt/questkeeps/docker-tools (root-owned). Shell scripts are invoked with bash.
4. Copy the current .next/static contents into /var/www/questkeeps-assets.
   This directory is public and contains client assets only, never .next/server.
5. Install deploy/nginx-upstream.conf as
   /etc/nginx/conf.d/questkeeps-upstream.conf, initially pointing at host port 3000.
   Install deploy/nginx-https.conf, validate nginx -t, then reload Nginx.
   These steps continue routing to the existing systemd process.
6. Run the release script. It switches to port 3101 after readiness, stops the
   legacy supervisor, starts one Docker worker, and disables the old web unit.
   Do not mask or delete the former systemd unit or its source during conversion.
7. Install deploy/questkeeps-docker-backup.service as the existing
   questkeeps-backup.service, reload systemd and test the service.
   Keep the existing questkeeps-backup.timer enabled.

## Persistent paths and ports

- /opt/questkeeps/shared/data -> /app/data, writable by UID 997.
- /opt/questkeeps/shared/.env.local -> /run/questkeeps.env, read-only.
  Node parses this file with --env-file, including quoted values.
- /var/www/questkeeps-assets contains hashed public client files from releases.
  Old files are retained so an already-open browser tab can load its original
  chunks. Do not blindly clear this directory or prune active assets by age.
- /opt/questkeeps/docker-state contains the lock and active slot/image records.
- Web blue: 127.0.0.1:3101; web green: 127.0.0.1:3102.
  Docker publishes only to loopback, not to the public network.
- qk-worker-blue or qk-worker-green: no inbound port.

Only Nginx HTTP/HTTPS and SSH remain public. Docker port publishing can bypass
UFW, so loopback binding is required, as described in the
[official installation guide](https://docs.docker.com/engine/install/ubuntu/).

## Database migrations and capacity

Online rollout intentionally requires the image schema to match the live schema.
Docker does not make incompatible database changes safe for two versions.
A schema-changing release must first have a reviewed backward-compatible
migration plan; the script refuses it before touching live traffic.
Never restore an old database snapshot after the new release has accepted writes
without explicitly reconciling those writes.

On this 1 GB RAM VPS, two web versions overlap briefly and may use swap.
Web containers have a 640 MB memory limit and a 384 MB V8 heap; the worker has a
256 MB memory limit. These are operating limits, not a capacity guarantee.
Preserve at least one rollback image and monitor disk use before future builds.

## Diagnosis

```sh
docker ps -a --filter label=app=questkeeps
docker inspect --format '{{json .State.Health}}' qk-web-blue
docker logs --tail 100 qk-web-blue
docker logs --tail 100 qk-worker-blue
systemctl status questkeeps-backup.timer
```

Docker health checks detect an unresponsive page or API. The restart policy
restarts exited processes; it does not automatically restart a container solely
because its health status is unhealthy. Investigate the logs before manual
recovery. Nginx logs include request/upstream durations without query strings or
guest tokens.

## Verified production conversion: 24 October 2026

- Application image: questkeeps:1.19.0-46d33d3, database schema 8. The legacy systemd web unit is disabled and retained; Docker runs one active web and one worker. The other web/worker slot is stopped and retained for rollback.
- A broken web candidate was rejected before traffic switched. A separate worker-start failure after switching restored the preceding upstream and worker. Subsequent successful blue/green switches passed readiness, including public assets.
- Two sets of 240 HTTP probes against the home page returned only 200 responses during the tested handovers. Final browser checks loaded login, About and Privacy without script errors; all 15 referenced client assets and a retained previous-release asset returned 200.
- The daily backup timer uses Docker; a new backup passed SQLite integrity checking and had mode 0600. Working database integrity and foreign-key checks passed.
- Validation includes 156 unit/API/readiness tests, map browser scenarios that preserve map/layer identity and zoom, and desktop/mobile member-action layout checks. These checks do not guarantee unlimited capacity or compatibility of future schema changes.

## Reviewed schema 8 ↔ 9 transition

Version 1.25.0 adds a defaulted rotation column, an independent exclusions table and an insertion trigger. Deploy the updated `deploy/docker-release.sh` **and** `deploy/media-archive-schema.py` together in `/opt/questkeeps/docker-tools/`. The release script backs up the database, applies migration 9 before starting the candidate, and restores only the compatibility marker on failure. The running schema-8 application remains SQL compatible. A release of the retained schema-8 image restores marker 8 while preserving rotations, exclusions and the trigger; redeploying schema 9 is idempotent. The trigger also prevents the old worker from reimporting excluded files. Other version transitions still fail closed. Never replace the live database with the pre-release snapshot for this code rollback: that would discard intervening user writes.

Schema 10 adds only `notification_state`, a private per-user notification snapshot. The reviewed online transition and marker rollback also support 9 ↔ 10 and 8 ↔ 10. The same helper preserves the table and its contents during code rollback; migration 10 uses `IF NOT EXISTS`.

Schema 11 adds only `trip_cover_settings`, an independent per-trip cover preference table. The reviewed online transition is 10 ↔ 11. The compatibility helper preserves the table and selected photo IDs when restoring the schema-10 marker for the previous release; migration 11 is idempotent. Existing trip and media columns are unchanged.

Schema 12 adds only `trip_cover_positions`, with a normalized x/y position per trip and photo. The reviewed transition is 11 ↔ 12. Marker rollback preserves positions, and the idempotent migration restores the ledger on upgrade. Existing custom decks longer than five are read as their first five without deleting stored IDs; new saves enforce the five-photo limit.


## Mobile connection diagnosis and transport recovery

The TLS Nginx listener enables HTTP/2 (the `listen ... http2` syntax supports the
current Ubuntu Nginx 1.18 package). Verify ALPN negotiates `h2`; HTTP/1.1 remains
available for clients that do not support it. Reload Nginx only after `nginx -t`.
Do not rebuild or stop application containers for an edge configuration change.

`GET /connection-check` returns a tiny uncached JSON response directly from Nginx.
It proves only DNS/TCP/TLS/edge delivery; it does not assert application, session,
database or provider health. Correlate a user's attempt time with this route in
the existing access log. Never log authentication cookies or query tokens.

For paths with silent packet-size failures, install
`deploy/99-questkeeps-network.conf` in `/etc/sysctl.d/` and apply that file with
`sysctl -p`. Mode 1 enables MTU probing after black-hole detection, without
changing interface MTU or disabling TLS/firewall protection. Save the previous
value before applying; restore that value and the previous config file on rollback.
This mitigates a class of mobile/VPN failures; it is not proof that a particular
user's provider or VPN caused an incident. Confirm on the affected device.


### Verified connection incident mitigation: 29 October 2026

One phone intermittently could not open even the address, while another phone
and the desktop browser could open the site. At diagnosis the app was healthy,
DNS A was correct with no AAAA answer, the certificate was valid, UFW allowed
HTTP/HTTPS and fail2ban was inactive. No application container restart was used.

Enabled HTTP/2 on the existing TLS listener and changed TCP MTU probing from
mode 0 to mode 1. The original Nginx configuration was backed up on the VPS.
After applying, the affected user confirmed both `/connection-check` and `/`
opened. A public HTTP/2 connection negotiated `h2`; `/`, `/api/me`, `/about`, the
transport check and all 14 initial CSS/JS resources returned 200. HTTP/1.1 also
continued returning 200. The web and worker containers remained running.

This is verified recovery after a combined transport mitigation, not isolation
of a single root cause. The incident did not capture the affected phone's DNS,
TLS or packet trace before recovery, so an MTU black hole remains a plausible
mechanism rather than a proven packet-level diagnosis. The transport check is
retained to distinguish edge reachability from application loading on recurrence.
