# Changelog

Todos los cambios relevantes de **Massivo App** se documentan en este archivo.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado siguiendo [SemVer](https://semver.org/lang/es/).

> **Regla:** cada vez que se completa una funcionalidad o se cierra una fase, se debe agregar una entrada acá. Ver `PROGRESS.md` para el flujo completo de fin de sesión.

## Tipos de cambios

- **Added** — funcionalidad nueva.
- **Changed** — cambios en funcionalidad existente.
- **Deprecated** — funcionalidad que será removida pronto.
- **Removed** — funcionalidad eliminada.
- **Fixed** — corrección de bugs.
- **Security** — cambios de seguridad.
- **Infra** — cambios de infraestructura, CI/CD, build, dependencias.
- **Docs** — cambios de documentación.

---

## [Unreleased]

### En curso
- Fase 1 — Tenancy core + Auth (Clerk). Ver `PROGRESS.md`.

---

## [0.1.0] — 2026-04-28 — Fase 0: Setup base

### Added
- Estructura inicial del monorepo con pnpm workspaces + Turborepo.
- `apps/backend` con NestJS 11, Winston logger, healthcheck en `GET /api/health`.
- `apps/frontend` con React 19 + Vite 6 + MUI 7, toggle dark/light persistente en `localStorage`.
- `packages/shared-types` con tipos base (`RequestContext`, `OrgRole`, `TeamRole`).
- `packages/permissions` (placeholder para CASL — Fase 1).
- `packages/prisma` (placeholder para schema y client extension — Fase 1).
- `MIGRATION_PLAN.md`: plan maestro completo de migración (arquitectura, fases, criterios, riesgos).
- `PROGRESS.md`: documento vivo de estado del proyecto con prompt de arranque para IAs.
- `README.md`: guía de setup local, scripts y convenciones.
- `.env.example` con variables de todas las fases.

### Infra
- `docker-compose.dev.yml` con Postgres 16, Redis 7 y MailHog.
- `.github/workflows/ci.yml`: pipeline de format check + lint + typecheck + build + test en cada PR a `main`.
- TypeScript strict en `tsconfig.base.json` (`noUncheckedIndexedAccess`, `noImplicitOverride`, etc.).
- ESLint flat config + Prettier + EditorConfig.
- Husky + lint-staged como pre-commit hook.
- `.vscode/` con settings (format-on-save) y extensiones recomendadas.
- `.nvmrc` fija Node 22; `packageManager` fija pnpm 9.15.0.

### Docs
- Convenciones documentadas en `README.md`: TS strict, Winston siempre, DTOs con class-validator, dark/light mode, queries tenant-aware, commits en español.

[Unreleased]: https://github.com/maxidiflumeri/massivo-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maxidiflumeri/massivo-app/releases/tag/v0.1.0
