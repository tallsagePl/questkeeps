# QuestKeeps on a single Ubuntu VPS

Runtime: Node.js 24 LTS, Nginx, systemd, SQLite. On the initial 1 GB VPS,
use 2 GB swap and monitor RAM, disk and sync latency. This is a small trial
deployment, not a capacity guarantee. Build native dependencies on Linux;
do not copy Windows node_modules or .next to the server.

## Layout

- Application: /opt/questkeeps/app, owned by the questkeeps system user.
- Private configuration: /opt/questkeeps/app/.env.local, mode 600.
- Database: /opt/questkeeps/app/data/travel.sqlite, with WAL support.
- Runtime and daily backup units: the supplied questkeeps*.service/timer files.
- Backups: data/backups, daily, with 14-day local retention. Keep an additional
  protected copy off this VPS. Keep the OAuth encryption key separately.

The web unit runs scripts/serve.mjs, which already supervises the web server
and synchronization worker. Do not start a second worker unit.

## Initial deployment

1. Transfer tracked source plus deploy/, excluding .git, .env*, data/,
   node_modules/, build outputs and test artifacts. Copy production configuration
   separately over SSH. Set APP_URL=https://questkeeps.ru and DATABASE_PATH=./data/travel.sqlite.
2. For existing users/trips, create an online SQLite backup using npm run backup.
   Transfer that snapshot separately. Preserve TOKEN_ENCRYPTION_KEY so existing
   Yandex tokens remain readable. Do not replace it with a new key during a move.
3. Run npm ci, npm run migrate, npm run build and npm run health as questkeeps.
   Building uses dev dependencies; do not install with --omit=dev beforehand.
4. Copy service/timer files to /etc/systemd/system. Run systemctl daemon-reload,
   then enable and start questkeeps.service and questkeeps-backup.timer.
5. Install nginx-http.conf as /etc/nginx/sites-available/questkeeps, enable it,
   disable the distro default site, validate nginx -t and reload Nginx.
   This bootstrap deliberately returns 503 until TLS is configured.
6. Point the domain's A record to the VPS. Do not publish an AAAA record unless
   IPv6 firewall/listeners and routing are configured and tested too.
7. Issue a certificate with certbot certonly --webroot -w /var/www/questkeeps-acme
   -d questkeeps.ru. Replace the bootstrap config with nginx-https.conf only after
   issuance, validate nginx -t and reload. Verify automatic renewal with
   certbot renew --dry-run and a deploy hook that reloads Nginx.
8. Add https://questkeeps.ru/api/auth/callback to the Yandex OAuth application's
   allowed redirect URIs. Test sign-in and linked-account access on the real domain.

Only SSH, HTTP and HTTPS should be public. Next listens on loopback port 3000.
Do not enable required email confirmation until the sender domain and mail
transport are configured. Do not expose the login form over unencrypted HTTP.

## Updates and rollback

Before each deployment, retain the previous application revision and an online
SQLite snapshot. Stop the service before replacing files, preserve .env.local
and data/, install dependencies, migrate, build and restart. A source rollback
does not automatically roll back schema or data: restore a compatible snapshot
only as a separate, intentional operation.
