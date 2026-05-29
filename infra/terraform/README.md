# infra/terraform — Infraestructura AWS de massivo-app

## Pre-requisitos

- Terraform >= 1.10.0 (`terraform version`)
- AWS CLI configurado con profile `massivo` (`aws sts get-caller-identity --profile massivo`)
- Region: `us-east-1`

## Comandos básicos

```bash
cd infra/terraform

# Una sola vez (descarga providers + crea .terraform/)
terraform init

# Ver qué cambiaría sin aplicar
terraform plan

# Aplicar cambios (pide confirmación interactiva)
terraform apply

# Ver outputs del último apply
terraform output

# Destruir todo (cuidado)
terraform destroy
```

## Estado

El `terraform.tfstate` se guarda **local** en este directorio y está **gitignored**.

> Si la POC se estabiliza, migrar el state a backend S3 + DynamoDB para tener
> locking y poder operar desde múltiples máquinas. Por ahora, solo se opera
> desde la máquina de Maxi.

## Estructura inicial

- `providers.tf` — declara provider AWS + version pinning + tags por default
- `variables.tf` — region, profile, project, env (todos con defaults)
- `main.tf` — data sources de read-only (account, region, VPC default)
- `outputs.tf` — info útil para verificar conexión

El primer `terraform apply` **no crea recursos**; solo lee la cuenta para
verificar que provider + creds funcionan. Después se van sumando módulos:
EC2, RDS, S3, CloudFront, ACM, registros DNS, etc.
