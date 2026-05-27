# Massivo App

SaaS multi-tenant de envío masivo multicanal: **WhatsApp Business API (Meta)** + **Email**.

> Producto independiente. La lógica de negocio se inspira en el sistema interno **AMSA Sender** (Ana Maya SA), pero Massivo App es multi-tenant desde el día 1 y vive en este repositorio.

Ver [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) para el plan completo de migración/implementación.

## Stack

- **Backend:** NestJS 11 + TypeScript estricto + Prisma 6 + PostgreSQL 16
- **Colas:** BullMQ 5 + Redis 7
- **Realtime:** Socket.IO 4
- **Frontend:** React 19 + Vite 6 + MUI 7
- **Auth:** Clerk (Organizations + roles)
- **Authz:** CASL (`@casl/ability`)
- **Billing:** Stripe + MercadoPago
- **Email:** AWS SES (SMTP + SNS webhooks)
- **WhatsApp:** Meta Cloud API
- **IA:** Google Gemini
- **Infra:** Docker + AWS (ECS Fargate / EC2 + ALB)

## Estructura del monorepo

```
massivo-app/
├── apps/
│   ├── backend/         # NestJS API + workers
│   ├── frontend/        # React + Vite (UI principal)
│   └── admin/           # Admin panel super-admin (placeholder en Fase 0)
├── packages/
│   ├── shared-types/    # Tipos compartidos front/back
│   ├── permissions/     # CASL abilities + plan features
│   └── prisma/          # Schema Prisma + client extensions
├── infra/
│   ├── terraform/       # Infra como código (a partir de Fase 8)
│   └── docker/          # Dockerfiles
└── .github/workflows/   # CI/CD
```

## Requisitos

- Node.js **>= 22**
- pnpm **>= 9** (se activa con `corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker + Docker Compose
- Git

## Setup local

```bash
# 1. Instalar dependencias
pnpm install

# 2. Asegurar que la infra compartida esté arriba (Postgres, Redis, Mongo, MySQL)
#    El compose vive en ~/infra/docker-compose.yml y arranca al boot.
#    La primera vez, crear el user/db del proyecto:
#      docker exec -it dev-postgres psql -U postgres -d dev_db -c "CREATE USER massivo WITH PASSWORD 'massivo';"
#      docker exec -it dev-postgres psql -U postgres -d dev_db -c "CREATE DATABASE massivo OWNER massivo;"

# 3. Copiar variables de entorno
cp .env.example .env

# 4. Levantar todo el monorepo en modo dev
pnpm dev
```

## Scripts principales

| Comando          | Descripción                                         |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | Levanta todos los apps en modo dev (Turbo paralelo) |
| `pnpm build`     | Build de todos los packages y apps                  |
| `pnpm lint`      | Lint con ESLint                                     |
| `pnpm typecheck` | Typecheck con TypeScript                            |
| `pnpm test`      | Ejecuta tests                                       |
| `pnpm format`    | Formatea con Prettier                               |

## Estado del proyecto

**Fase actual:** 0 — Setup base (en curso).

Ver [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) sección 9 para el roadmap por fases.

## Convenciones

- TypeScript strict, prohibido `any` salvo justificación.
- Logger Winston siempre, nunca `console.*`.
- DTOs con `class-validator` en endpoints.
- Toda query a modelo tenant-aware DEBE filtrar por `organizationId` + `teamId` (enforzado por Prisma extension a partir de Fase 1).
- UI siempre dark/light mode con MUI.
- Commits en español.

## Licencia

Privado. Todos los derechos reservados.
