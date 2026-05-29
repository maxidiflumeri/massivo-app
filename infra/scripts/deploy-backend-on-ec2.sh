#!/usr/bin/env bash
#
# Script que corre la EC2 (vía SSM SendCommand desde GH Actions) para
# completar un deploy del backend:
#   1. Login a ECR
#   2. Pull de la imagen nueva
#   3. up -d (Docker compose recrea el container con la nueva imagen)
#   4. Limpieza de imágenes viejas
#
# El script se ejecuta como root via SSM. La EC2 tiene IAM Instance Profile
# que le da permisos de pull a ECR (sin tener que distribuir credenciales).
#
# Variables de entorno esperadas:
#   AWS_REGION    — default us-east-1
#   ECR_REPO_URL  — opcional override; default se infiere del trust profile
#   BACKEND_IMAGE — imagen full (con tag) a tirar arriba

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"

if [[ -z "${BACKEND_IMAGE:-}" ]]; then
  echo "ERROR: BACKEND_IMAGE no definido. Esperaba 'repo:tag' con la imagen a deployar." >&2
  exit 1
fi

cd /opt/massivo/app

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

log "1/4 — git pull para sincronizar docker-compose.yml + scripts"
git pull --ff-only origin main || echo "WARN: git pull falló (no es bloqueante si el compose no cambió)"

log "2/4 — Login a ECR"
# La cuenta se infiere del rol IAM adjunto a la EC2.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")
ECR_HOST="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_HOST"

log "3/4 — Pull de imagen ${BACKEND_IMAGE} y up -d"
export BACKEND_IMAGE
docker compose -f infra/docker-compose.yml pull api
docker compose -f infra/docker-compose.yml up -d api

log "4/4 — Limpieza de imágenes viejas"
docker image prune -f

log "Deploy backend completo ✅"
docker compose -f infra/docker-compose.yml ps
