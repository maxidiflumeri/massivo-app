# syntax=docker/dockerfile:1.7
#
# Dockerfile multi-stage para el backend NestJS de massivo-app.
# Compatible con linux/arm64 (Graviton). Build context = root del monorepo.
#
# Estrategia "copy-everything": el runtime stage copia el workspace entero
# del builder, sin pnpm deploy. Imagen más grande (~3 GB) pero conceptualmente
# trivial y libre del laberinto pnpm-deploy + prisma auto-install + workspace
# protocol que rompe npm.
#
# Build (desde el root):
#   docker build -f apps/backend/Dockerfile -t massivo-backend:local .

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
# Stage 1: builder
# ============================================
FROM base AS builder

# Manifests primero — cachea la layer de pnpm install si no cambia el lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/prisma/package.json ./packages/prisma/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install completo (incluye devDeps para poder buildear)
RUN pnpm install --frozen-lockfile

# Código fuente
COPY apps/backend ./apps/backend
COPY packages ./packages

# Generar prisma client en el workspace (los binarios y runtime quedan donde
# pnpm los mantiene; el runtime stage hereda /app entero, así que se llevan
# los symlinks intactos).
RUN cd packages/prisma && pnpm exec prisma generate

# Buildear workspace packages + backend
RUN pnpm --filter @massivo/shared-types build && \
    pnpm --filter @massivo/permissions build && \
    pnpm --filter @massivo/prisma build && \
    pnpm --filter @massivo/backend build

# ============================================
# Stage 2: runtime
# ============================================
FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3001

# Copiamos el workspace entero del builder. Esto preserva los symlinks de pnpm
# (.pnpm store + workspace packages) intactos.
COPY --from=builder /app /app

# Usuario no-root
RUN groupadd -r massivo && useradd -r -g massivo -d /app -s /sbin/nologin massivo && \
    chown -R massivo:massivo /app
USER massivo

EXPOSE 3001

# Healthcheck (NestJS Terminus expone /api/health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/health || exit 1

# Working dir y entrypoint relativos al backend
WORKDIR /app/apps/backend
CMD ["node", "dist/main.js"]
