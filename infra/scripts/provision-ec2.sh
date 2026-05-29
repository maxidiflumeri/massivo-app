#!/usr/bin/env bash
#
# Provisión inicial de la EC2 de massivo-app.
# Idempotente: se puede correr varias veces sin romper nada.
#
# Instala:
#   - Docker CE (con repo oficial, ARM64) + docker compose plugin
#   - Nginx
#   - Certbot + plugin nginx (Let's Encrypt)
#   - 2 GiB swap (t4g.small tiene solo 2 GiB RAM)
#   - Crea /opt/massivo con permisos para ubuntu
#
# Uso (desde tu máquina local):
#   scp -i ~/.ssh/massivo_aws infra/scripts/provision-ec2.sh ubuntu@32.198.176.111:/tmp/
#   ssh -i ~/.ssh/massivo_aws ubuntu@32.198.176.111 'bash /tmp/provision-ec2.sh'
#

set -euo pipefail

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m==>\033[0m %s\n' "$*" >&2; }

if [[ $EUID -eq 0 ]]; then
  warn "Este script usa sudo internamente; corré como usuario 'ubuntu', no como root."
  exit 1
fi

log "1/6 — apt update + paquetes base"
# apt-get update puede salir != 0 ante mirrors fuera de sync (transient);
# si pasa, retry una vez y tirar adelante con los indices cacheados.
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y || \
  (sleep 5 && sudo DEBIAN_FRONTEND=noninteractive apt-get update -y) || true
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg lsb-release ufw vim htop unzip jq

log "2/6 — Swap 2 GiB (idempotente)"
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-massivo-swap.conf >/dev/null
  sudo sysctl -p /etc/sysctl.d/99-massivo-swap.conf
else
  echo "swapfile ya existe, salteo"
fi

log "3/6 — Docker CE (repo oficial Docker)"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  ARCH=$(dpkg --print-architecture)
  CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  sudo apt-get update -y || sudo apt-get update -y || true
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "docker ya instalado: $(docker --version)"
fi

log "4/6 — Usuario 'ubuntu' en grupo docker"
if ! id -nG ubuntu | grep -qw docker; then
  sudo usermod -aG docker ubuntu
  warn "Cerrá y reabrí la sesión SSH para que tome el grupo docker (o usá 'newgrp docker')."
fi

log "5/6 — Nginx + Certbot"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx

log "6/6 — Estructura /opt/massivo"
sudo mkdir -p /opt/massivo
sudo chown -R ubuntu:ubuntu /opt/massivo

echo
log "Provisión completa ✅"
echo
echo "Versiones instaladas:"
echo "  Docker:        $(docker --version 2>/dev/null || echo 'pendiente reinicio')"
echo "  Docker compose: $(docker compose version 2>/dev/null || echo 'pendiente reinicio')"
echo "  Nginx:         $(nginx -v 2>&1)"
echo "  Certbot:       $(certbot --version 2>&1)"
echo
echo "Próximo paso: salir y reentrar por SSH para que tome el grupo docker."
