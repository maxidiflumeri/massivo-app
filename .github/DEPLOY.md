# Despliegue multi-target (GitHub Actions)

Los 4 workflows (frontend, landing, docs, backend) son **environment-driven**:

- **Push a `main`** → despliega a **massivo** (environment `massivo-prod`).
- **Actions → Run workflow → elegís el target** → despliega a `<target>-prod`.

Las coordenadas AWS y los secrets **no están en el YAML**: viven en **GitHub Environments**
(repo → Settings → Environments). Creá uno por target: `massivo-prod` y `rgbot-prod`.

## ⚠️ Antes de mergear esto a `main`

Creá el environment **`massivo-prod`** con las variables/secrets de abajo (valores actuales),
o el deploy de massivo se rompe (el YAML ya no los tiene hardcodeados).

## Variables (Settings → Environments → Variables)

| Variable | massivo-prod | rgbot-prod (de `terraform output`) |
|---|---|---|
| `AWS_REGION` | `us-east-1` | `us-east-1` |
| `AWS_ROLE_ARN` | `arn:aws:iam::811261691778:role/massivo-prod-github-actions` | `github_actions_role_arn` |
| `FRONTEND_S3_BUCKET` | `massivo-prod-frontend-811261691778` | `s3_frontend_bucket` |
| `FRONTEND_CF_DISTRIBUTION_ID` | `E11IK4CYGMJAK9` | `cloudfront_distribution_id` |
| `LANDING_S3_BUCKET` | `massivo-prod-landing-811261691778` | `landing_s3_bucket` |
| `LANDING_CF_DISTRIBUTION_ID` | `EYO1OVL0SGSKM` | `landing_cloudfront_distribution_id` |
| `DOCS_S3_BUCKET` | `massivo-prod-docs-811261691778` | `docs_s3_bucket` |
| `DOCS_CF_DISTRIBUTION_ID` | `E21L5EETRDCVUX` | `docs_cloudfront_distribution_id` |
| `BACKEND_ECR_REPOSITORY` | `massivo-prod-backend` | `<project>-prod-backend` |
| `BACKEND_EC2_INSTANCE_ID` | `i-04f54928d8c12d964` | `ec2_instance_id` |
| `API_URL` | `https://api.massivo.app` | `https://api.rgbot.tech` |

## Secrets (Settings → Environments → Secrets)

| Secret | massivo-prod | rgbot-prod |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | pub key de Clerk de massivo | pub key de Clerk de rgbot |

> El branding público de **frontend y landing** sale de `.env.massivo` / `.env.rgbot`
> (committeado) vía `vite build --mode <target>`; **docs** lo toma del mismo archivo vía
> `DOCS_TARGET` (+ un plugin remark que reescribe la prosa de los `.md`). Acá solo van el
> secret de Clerk y las coordenadas AWS (que difieren por cuenta).
