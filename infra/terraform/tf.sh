#!/usr/bin/env bash
# Wrapper para elegir el TARGET (massivo|rgbot) de forma simple.
#
#   ./tf.sh massivo plan
#   ./tf.sh rgbot   apply
#   ./tf.sh rgbot   output
#
# Cada target tiene su propio Terraform workspace (state separado) y su tfvars,
# así nunca pisás el deploy del otro:
#   massivo → workspace "default"  + massivo.tfvars
#   rgbot   → workspace "rgbot"    + rgbot.tfvars
#
# (Corré `terraform init` una sola vez a mano antes del primer uso.)
set -euo pipefail
cd "$(dirname "$0")"

target="${1:-}"
cmd="${2:-plan}"

case "$target" in
  massivo) ws="default" ;;
  rgbot)   ws="rgbot" ;;
  *) echo "Target inválido: '${target}'. Usá: massivo | rgbot" >&2; exit 1 ;;
esac

varfile="${target}.tfvars"
if [[ ! -f "$varfile" ]]; then
  echo "Falta ${varfile}. Crealo con: cp ${target}.tfvars.example ${varfile}" >&2
  exit 1
fi

# Selecciona el workspace del target (lo crea si no existe; massivo vive en 'default').
terraform workspace select "$ws" 2>/dev/null || terraform workspace new "$ws"

echo "▶ target=${target}  workspace=${ws}  varfile=${varfile}"
# Args extra (todo lo que venga después del comando) se pasan tal cual a terraform.
terraform "$cmd" -var-file="$varfile" "${@:3}"
