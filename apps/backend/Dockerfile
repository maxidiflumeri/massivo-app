# syntax=docker/dockerfile:1.7
#
# Dockerfile multi-stage para el backend NestJS de massivo-app.
# Compatible con linux/arm64 (Graviton). Build context = root del monorepo.
#
# Build (desde el root):
#   docker build -f apps/backend/Dockerfile -t massivo-backend:local .
#
# Run:
#   docker run --rm -p 3001:3001 --env-file .env massivo-backend:local
#

FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# openssl: requerido por prisma engine
# ca-certificates: TLS para llamadas salientes (Clerk, Meta, SES)
# curl: healthchecks
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ============================================
# Stage 1: deps + build de todos los workspaces
# ============================================
FROM base AS builder

# Manifests primero — cachea la layer de pnpm install si no cambia el lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/prisma/package.json ./packages/prisma/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install completo (incluye devDependencies para poder buildear)
RUN pnpm install --frozen-lockfile

# Código fuente
COPY apps/backend ./apps/backend
COPY packages ./packages

# Generar prisma client antes de buildear backend (backend importa @massivo/prisma)
RUN cd packages/prisma && pnpm exec prisma generate

# Buildear workspace packages + backend
RUN pnpm --filter @massivo/shared-types build && \
    pnpm --filter @massivo/permissions build && \
    pnpm --filter @massivo/prisma build && \
    pnpm --filter @massivo/backend build

# Crear bundle prod self-contained en /prod/backend (resuelve los workspace deps)
RUN pnpm --filter @massivo/backend deploy --prod /prod/backend

# ============================================
# Stage 2: runtime mínimo
# ============================================
FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3001

# Prisma CLI para correr migrations en deploy (`prisma migrate deploy`)
RUN npm install -g prisma@6.16.2 && npm cache clean --force

WORKDIR /app

# Bundle del backend (dist + node_modules flat con workspace deps resueltos)
COPY --from=builder /prod/backend ./

# Schema prisma (para `prisma migrate deploy` al arrancar)
COPY --from=builder /app/packages/prisma/prisma ./prisma

# Usuario no-root
RUN groupadd -r massivo && useradd -r -g massivo -d /app -s /sbin/nologin massivo && \
    chown -R massivo:massivo /app
USER massivo

EXPOSE 3001

# Healthcheck simple — el backend expone /api/health vía @nestjs/terminus
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]
