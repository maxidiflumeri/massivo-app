# Terraform multi-target (white-label)

La misma infra sirve para varios despliegues (massivo, rgbot, …). Lo que cambia por
target son **3 cosas**, todas parametrizadas:

| Eje | Cómo |
|-----|------|
| Cuenta AWS | variable `aws_profile` (profile en `~/.aws/credentials`) |
| Dominios | variables `frontend_domain` / `landing_apex_domain` / `landing_www_domain` / `docs_domain` / `api_domain` |
| Nombre de recursos / DB | variables `project` (prefijo+tags) y `rds_database_name` |

**State separado por target** (no se pisan): cada target usa su propio Terraform
**workspace**.

| Target | Workspace | tfvars |
|--------|-----------|--------|
| massivo | `default` (el deploy actual) | `massivo.tfvars` |
| rgbot | `rgbot` (se crea solo) | `rgbot.tfvars` |

## Setup (una vez)

```bash
cd infra/terraform
cp massivo.tfvars.example massivo.tfvars   # ya coincide con los defaults
cp rgbot.tfvars.example   rgbot.tfvars     # editá aws_profile/dominios si hace falta
terraform init
aws configure --profile rgbot              # credenciales de la cuenta nueva (solo rgbot)
```

> Los `*.tfvars` están en `.gitignore` (config local por máquina); los `*.tfvars.example`
> sí se versionan.

## Uso — elegís el target con un argumento

```bash
./tf.sh massivo plan
./tf.sh rgbot   plan
./tf.sh rgbot   apply
./tf.sh rgbot   output
```

`tf.sh <target> <comando>` selecciona el workspace correcto + pasa el `-var-file`
del target. Imposible aplicar rgbot sobre el state de massivo.

## Lo que Terraform NO hace (manual por target)

- **DNS**: Terraform te da los valores por `terraform output` (Elastic IP, dominios
  CloudFront, registros de validación ACM); los registros los creás vos en tu DNS.
- **pgvector**: en la RDS nueva, crear `CREATE EXTENSION vector` como master user
  antes de `prisma migrate deploy`.
- **Seed de planes** (una vez, tras el primer deploy del backend): las migraciones crean
  el esquema pero NO los datos — sin los planes, el webhook de Clerk falla con
  "No se encontró el plan FREE" al crear la primera org. Correr en la EC2:
  `docker exec <project>-api sh -c "cd /app/packages/prisma && npx ts-node prisma/seed.ts"`
- **`.env` del backend** en la EC2 (secrets, `APP_NAME`, dominios), Clerk, Meta, email, Stripe.
