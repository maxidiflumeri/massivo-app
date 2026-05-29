#!/usr/bin/env bash
#
# Build + deploy de la landing (massivo.app + www) a S3 + invalidación CloudFront.
#
# Uso (desde el root del repo):
#   bash infra/scripts/deploy-landing.sh
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

log "1/4 — Leyendo outputs de terraform"
cd infra/terraform
BUCKET=$(terraform output -raw landing_s3_bucket)
DISTID=$(terraform output -raw landing_cloudfront_distribution_id)
cd "$ROOT"
echo "  Bucket:       $BUCKET"
echo "  Distribution: $DISTID"

log "2/4 — Buildeando landing"
export VITE_PANEL_URL="${VITE_PANEL_URL:-https://panel.massivo.app}"
export VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_ZmxleGlibGUtZm94aG91bmQtNjMuY2xlcmsuYWNjb3VudHMuZGV2JA}"

pnpm --filter @massivo/landing exec vite build

DIST_DIR="apps/landing/dist"
[[ -d "$DIST_DIR" ]] || { echo "Error: $DIST_DIR no existe"; exit 1; }

log "3/4 — Sincronizando a S3 (s3://$BUCKET/)"
# Assets con hash → cacheables 1 año
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --delete \
  --profile massivo \
  --region us-east-1 \
  --exclude "*.html" --exclude "asset-manifest.json" \
  --cache-control "public, max-age=31536000, immutable"

# HTML → siempre fresh
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --profile massivo \
  --region us-east-1 \
  --exclude "*" --include "*.html" --include "asset-manifest.json" \
  --cache-control "public, max-age=0, must-revalidate"

log "4/4 — Invalidando CloudFront"
INVID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTID" \
  --paths "/*" \
  --profile massivo \
  --query 'Invalidation.Id' --output text)
echo "  Invalidation: $INVID"

echo
log "Deploy landing completo ✅"
echo "  https://massivo.app/"
echo "  https://www.massivo.app/"
