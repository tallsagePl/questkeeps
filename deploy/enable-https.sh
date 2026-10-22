#!/usr/bin/env bash
# Run as root on the VPS after DNS points to it.
set -euo pipefail
domain=questkeeps.ru
expected=222.167.230.214
if ! dig @1.1.1.1 +short A "$domain" | grep -Fxq "$expected"; then
  printf '%s\n' 'DNS does not point to this VPS yet; no configuration changed.' >&2
  exit 1
fi
certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --webroot -w /var/www/questkeeps-acme -d "$domain"
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\n/usr/sbin/nginx -t && /bin/systemctl reload nginx\n' \
  > /etc/letsencrypt/renewal-hooks/deploy/questkeeps-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/questkeeps-nginx
backup=$(mktemp /etc/nginx/sites-available/questkeeps.backup.XXXXXX)
cp /etc/nginx/sites-available/questkeeps "$backup"
install -m 644 /opt/questkeeps/app/deploy/nginx-https.conf /etc/nginx/sites-available/questkeeps
if ! nginx -t; then
  cp "$backup" /etc/nginx/sites-available/questkeeps
  exit 1
fi
systemctl reload nginx
curl --fail --silent --show-error --resolve "$domain:443:127.0.0.1" "https://$domain/" -o /dev/null
certbot renew --dry-run
