#!/usr/bin/env bash
# scripts/dev-tunnel.sh — arranca ngrok contra el backend local usando el
# dominio estático reservado en el dashboard de ngrok (free tier permite 1).
#
# Lee NGROK_DOMAIN y BACKEND_PORT del .env de la raíz. Si NGROK_DOMAIN no
# está seteado, falla con un mensaje claro en vez de arrancar con un dominio
# random (que rompería el webhook de Meta tras cada restart).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Parseamos solo las vars que necesitamos, sin sourcear el .env entero —
  # un `source` falla si algún valor tiene espacios sin quotes (típico en
  # nombres como `DEV_ORG_NAME=Dev Org`).
  read_env_var() {
    local key="$1"
    grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | sed -E "s/^${key}=//; s/^['\"]//; s/['\"]$//"
  }
  : "${NGROK_DOMAIN:=$(read_env_var NGROK_DOMAIN)}"
  : "${BACKEND_PORT:=$(read_env_var BACKEND_PORT)}"
fi

if [[ -z "${NGROK_DOMAIN:-}" ]]; then
  cat <<EOF
NGROK_DOMAIN no está seteado en .env

Para configurarlo (una sola vez):
  1. Creá cuenta gratis en https://ngrok.com/signup
  2. Instalá la CLI: https://ngrok.com/download
  3. Autenticá: ngrok config add-authtoken <TU_TOKEN>
  4. En el dashboard de ngrok → Domains, reservá 1 dominio gratis.
     Te queda algo como: tu-nombre.ngrok-free.app
  5. Agregá esto al .env de la raíz:
       NGROK_DOMAIN=tu-nombre.ngrok-free.app
EOF
  exit 1
fi

PORT="${BACKEND_PORT:-3001}"

# Resolver el binario de ngrok. Algunos entornos (concurrently lanzado desde
# pnpm) no propagan el PATH completo, así que probamos paths conocidos.
NGROK_BIN="$(command -v ngrok || true)"
if [[ -z "$NGROK_BIN" ]]; then
  for candidate in /snap/bin/ngrok /usr/local/bin/ngrok "$HOME/.local/bin/ngrok" /usr/bin/ngrok; do
    if [[ -x "$candidate" ]]; then
      NGROK_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$NGROK_BIN" ]]; then
  echo "❌ No encontré el binario de ngrok. Instalalo (snap install ngrok / etc) o agregalo al PATH."
  exit 1
fi

echo "ngrok → https://${NGROK_DOMAIN} → localhost:${PORT}  (binario: ${NGROK_BIN})"
exec "$NGROK_BIN" http --url="https://${NGROK_DOMAIN}" "${PORT}"
