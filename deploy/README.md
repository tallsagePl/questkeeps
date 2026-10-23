# QuestKeeps on a single Ubuntu VPS

## Verified deployment: 23 October 2026

- Application version: **1.16.0**, application source revision `82040f7`; previous live version was 1.10.0.
- The active app path links to `releases/1.16.0-82040f7`; persistent data and private configuration are in `shared/`. The previous application/build and pre-migration database/configuration were preserved separately.
- Production SQLite migrated to schema 6 with a successful integrity/foreign-key check. A fresh backup through the systemd backup service also passed SQLite integrity checking.
- HTTPS `/`, `/about` and bilingual `/privacy` return 200. The footer links to `/privacy`; `/api/trips` returns 401 without a session. Requests for `.env.local`, `.git/config` and `data/travel.sqlite` return 404.
- Nginx configuration validates. The app listens only on loopback. Firewall rules expose SSH and HTTP/HTTPS. Application autostart, daily backup timer and certificate renewal timer are enabled.
- Mail verification is enabled, Resend accepted a production test email, and the support URL points to the real feedback bot. Inbox placement still requires checking the recipient mailbox.
- Telegram polling is active on the VPS and disabled locally. At verification time the administrator had not yet started the bot. Press Start before expecting registration notifications, and set `https://questkeeps.ru/privacy` in BotFather. Botpic/description-image uploads remain separate BotFather actions.
- Validation: 142 unit tests, 3 privacy browser tests (mobile/desktop, light/dark, accessibility and no-JavaScript content), Linux production build and public browser smoke check with no script errors or horizontal overflow. The npm production dependency advisory check reported zero known advisories at this time; this is not a complete application security audit.

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
transport are configured. Complete the sender-domain and test-delivery steps in
[EMAIL-SETUP.md](../docs/EMAIL-SETUP.md) before enabling it. Do not expose the login
form over unencrypted HTTP.

## Updates and rollback

For staged releases, keep source/builds under `/opt/questkeeps/releases/`, point `/opt/questkeeps/app` at the active release, and keep persistent `data/` and the mode-600 `.env.local` under `/opt/questkeeps/shared/`. Each release links to the shared files. Build against an isolated temporary database first; never use the live database for a staging build.

Back up the live SQLite database immediately before migrations. Preserve the previous source/build and private configuration. Stop the systemd unit only for the final data move/migration and active-release switch. Start it again, verify `npm run health`, HTTPS, the public `/privacy` page, private-path protection, email configuration and Telegram polling. A database schema upgrade can prevent an older release from starting; restoring a pre-upgrade database is a separate operation and can lose writes made after that backup.

Set `TELEGRAM_ENABLED=false` on local development before enabling the production bot. Keep `APP_URL=https://questkeeps.ru`, `EMAIL_VERIFICATION_REQUIRED=true` after verifying delivery, and the real support bot URL in production. Never publish or overwrite the live database with a local development database.

Before each deployment, retain the previous application revision and an online
SQLite snapshot. Stop the service before replacing files, preserve .env.local
and data/, install dependencies, migrate, build and restart. A source rollback
does not automatically roll back schema or data: restore a compatible snapshot
only as a separate, intentional operation.
