#!/usr/bin/env bash
#
# Setup Nginx para api.massivo.app + Let's Encrypt.
#
# Pre-req:
#   - api.massivo.app debe resolver a la IP de esta EC2 (record A en DNS)
#   - El container del backend (massivo-api) debe estar escuchando en 127.0.0.1:3001
#   - Puertos 80/443 abiertos en el SG (ya están)
#
# Uso (desde la EC2):
#   sudo bash /opt/massivo/app/infra/scripts/setup-nginx.sh
#

set -euo pipefail

CONFIG_SRC="/opt/massivo/app/infra/nginx/api.massivo.app.conf"
CONFIG_DST="/etc/nginx/sites-available/api.massivo.app.conf"
ENABLED_LINK="/etc/nginx/sites-enabled/api.massivo.app.conf"
DEFAULT_LINK="/etc/nginx/sites-enabled/default"
DOMAIN="api.massivo.app"
LETSENCRYPT_EMAIL="maxidiflumeri@gmail.com"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m==>\033[0m %s\n' "$*" >&2; }

if [[ $EUID -ne 0 ]]; then
  warn "Este script requiere sudo. Re-lanzando: sudo bash $0"
  exec sudo bash "$0" "$@"
fi

[[ -f "$CONFIG_SRC" ]] || { warn "No encuentro $CONFIG_SRC"; exit 1; }

log "1/5 — Copiando config de Nginx"
cp "$CONFIG_SRC" "$CONFIG_DST"

log "2/5 — Habilitando site + deshabilitando default"
ln -sf "$CONFIG_DST" "$ENABLED_LINK"
[[ -L "$DEFAULT_LINK" ]] && rm "$DEFAULT_LINK"

log "3/5 — Validando config y recargando Nginx (sin SSL todavía)"
nginx -t
systemctl reload nginx

log "4/5 — Pidiendo cert Lets Encrypt (DNS debe estar propagado)"
# --non-interactive: no pregunta nada
# --agree-tos: acepta TOS de LE
# --redirect: agrega 80 -> 301 a 443 automáticamente
# --no-eff-email: no inscribe en mailing de la EFF
if certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
  echo "Cert para ${DOMAIN} ya existe; pruebo renovación si hace falta"
  certbot renew --quiet || true
else
  certbot --nginx \
    --non-interactive --agree-tos --no-eff-email \
    --email "$LETSENCRYPT_EMAIL" \
    --redirect \
    -d "$DOMAIN"
fi

log "5/5 — Validando config final y recargando"
nginx -t
systemctl reload nginx

echo
log "Setup Nginx completo ✅"
echo
echo "Probá:"
echo "  curl -i https://${DOMAIN}/nginx-health"
echo "  curl -i https://${DOMAIN}/api/health  # si el backend está arriba"
