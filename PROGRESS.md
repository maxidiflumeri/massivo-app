# Massivo App — Estado del proyecto

> **Archivo vivo.** Cualquier IA o desarrollador que retome el trabajo debe leer este archivo + `MIGRATION_PLAN.md` antes de avanzar. Al terminar cada sesión, **actualizá esta página** y commiteá los cambios.

---

## Prompt de arranque para IAs (copiar/pegar al iniciar sesión)

```
Estoy migrando AMSA Sender (sistema interno de Ana Maya SA, NO se toca) a un
SaaS multi-tenant llamado Massivo App, en este repositorio. Leé estos archivos
en este orden y resumime el estado actual antes de proponer el siguiente paso:

1. MIGRATION_PLAN.md  (plan maestro: arquitectura, stack, fases, criterios)
2. PROGRESS.md        (este archivo: estado actual y próximo paso concreto)
3. README.md          (setup local, scripts, convenciones)

Convenciones obligatorias:
- TypeScript strict, prohibido `any` salvo justificación.
- Logger Winston siempre, nunca console.*.
- DTOs con class-validator en endpoints.
- UI con dark/light mode (MUI useTheme).
- Toda query a modelo tenant-aware DEBE filtrar por organizationId + teamId
  (enforzado por Prisma extension a partir de Fase 1).
- Mensajes de commit en español.

No avances sin confirmarme el plan del paso siguiente.
```

---

## Estado actual

- **Fase actual:** Fase 0 — Setup base ✅ **COMPLETADA**
- **Próxima fase:** Fase 1 — Tenancy core + Auth (Clerk)
- **Última actualización:** 2026-04-28
- **Branch principal:** `main`
- **Último commit:** `0d8d5fe` — `chore: setup inicial del monorepo Massivo App (Fase 0)`
- **Repo remoto:** `https://github.com/maxidiflumeri/massivo-app`

## Resumen de lo hecho (Fase 0)

Monorepo pnpm + Turborepo, con:

- **apps/backend** — NestJS 11 + Winston + healthcheck (`GET /api/health`).
- **apps/frontend** — React 19 + Vite 6 + MUI 7 con toggle dark/light persistente.
- **packages/shared-types** — Tipos base (`RequestContext`, `OrgRole`, `TeamRole`).
- **packages/permissions** — Placeholder para CASL (se implementa en Fase 1).
- **packages/prisma** — Placeholder para schema y client extension (Fase 1).
- **Config global** — TypeScript strict, ESLint flat config, Prettier, Husky + lint-staged, EditorConfig, `.nvmrc` (Node 22), `.vscode/`.
- **Infra dev** — `docker-compose.dev.yml` con Postgres 16, Redis 7, MailHog.
- **CI** — `.github/workflows/ci.yml` corre format check, lint, typecheck, build, test en cada PR.
- **Docs** — `MIGRATION_PLAN.md` (plan maestro), `README.md`, `.env.example`.

## Verificación rápida (correr antes de empezar a editar)

```bash
pnpm install
pnpm typecheck   # debe pasar 6/6 paquetes
pnpm build       # debe pasar 5/5 paquetes
pnpm lint        # debe pasar 6/6 paquetes
pnpm format:check
```

Para levantar dev:

```bash
docker compose -f docker-compose.dev.yml up -d
cp .env.example .env  # si no existe
pnpm dev
```

---

## Próximo paso (Fase 1 — Tenancy core + Auth)

Ver `MIGRATION_PLAN.md` sección **9. Plan de ejecución por fases → Fase 1**.

### Checklist Fase 1 (en orden sugerido)

- [ ] Configurar Prisma 6 en `packages/prisma` con datasource Postgres.
- [ ] Schema Prisma inicial: `Organization`, `Team`, `User`, `OrgMembership`, `TeamMembership`, `Plan`, `Subscription`, `UsageCounter`, `AuditLog`, enums (ver MIGRATION_PLAN.md sección 2.3).
- [ ] Generar primera migración + seed de planes (FREE, STARTER, BUSINESS, ENTERPRISE).
- [ ] Integrar `PrismaModule` en backend con cliente compartido desde `@massivo/prisma`.
- [ ] Crear cuenta en Clerk, configurar Organizations habilitadas, copiar keys a `.env`.
- [ ] Frontend: `<ClerkProvider>`, `<SignIn>`, `<OrganizationSwitcher>`, `<UserButton>`.
- [ ] Backend: `ClerkAuthGuard` valida JWT contra JWKS de Clerk.
- [ ] `TenantContextGuard` resuelve `organizationId` (por `clerkOrgId`) y valida `teamId` del header `X-Team-Id`.
- [ ] `AsyncLocalStorage` con `RequestContext { userId, organizationId, teamId, orgRole, teamRole }`.
- [ ] Webhook `/webhooks/clerk` con manejo idempotente de `user.*`, `organization.*`, `organizationMembership.*`.
- [ ] Endpoint `GET /api/me/context` (devuelve user + orgs + teams + permissions).
- [ ] CASL `AbilityFactory` en `@massivo/permissions` + `PoliciesGuard` + decorator `@CheckPolicies`.
- [ ] Prisma client extension que auto-inyecta `organizationId` + `teamId` (modo strict, rechaza queries sin contexto en modelos tenant-aware).
- [ ] Decorator `@SkipTenantScope()` para casos legítimos (admin, jobs de billing).
- [ ] Onboarding: signup → crear org → crear team "General" → asignar plan FREE.
- [ ] CRUD básico de teams (con plan-gate `multiTeam`).
- [ ] CRUD de invitaciones a org y assignment a teams.
- [ ] Tests de integración: dos tenants concurrentes, no pueden leer datos del otro.

### Criterio de aceptación de Fase 1

Un usuario nuevo puede:
1. Hacer signup vía Clerk.
2. Crear una organización (= tenant).
3. Ver el team "General" creado automáticamente.
4. Invitar a otro usuario por email.
5. Asignarlo a un team con un rol.
6. El invitado loguea y ve solo los recursos del team al que fue asignado.
7. Ningún user puede leer datos de otra organización (verificado por test).

---

## Decisiones tomadas (no cambiar sin discusión)

| # | Decisión | Razón |
|---|----------|-------|
| 1 | Repositorio nuevo separado de AMSA Sender | AMSA está vendido a Ana Maya SA y queda congelado. |
| 2 | Opción A: empezar limpio, copiar lógica de AMSA selectivamente por fase | Codebase más limpio multi-tenant desde el primer commit, sin atajos heredados. |
| 3 | Shared DB + `organizationId` + `teamId` | Más barato, escala bien hasta cientos/miles de tenants. |
| 4 | Postgres 16 (cambio desde MySQL de AMSA) | Mejor RLS, índices parciales, JSONB, mejor encaje con multi-tenant. |
| 5 | Jerarquía 3 niveles: Organization → Team → User | Estándar SaaS B2B. Org = billing, Team = aislamiento operativo. |
| 6 | Auth tercerizada con Clerk | Ahorra 4-6 meses de auth, viene con Organizations + invitaciones + SSO. |
| 7 | Authz con CASL | Permisos finos de dominio, integración limpia con NestJS y Prisma. |
| 8 | Billing con Stripe (internacional) + MercadoPago (LATAM) | Cobertura de ambos mercados. |
| 9 | Email con AWS SES (configuration set por tenant) | SMTP propio del SaaS; los clientes dan de alta cuentas remitentes para usar como `From`. |
| 10 | WhatsApp solo Business API (Meta), NO Web.js | Web.js no escala bien en SaaS, alto costo operativo. |
| 11 | Monorepo con pnpm + Turborepo | Estándar moderno, buena DX, builds incrementales. |
| 12 | Node 22 LTS, pnpm 9.15 | LTS actuales. |

## Decisiones pendientes

- [ ] Región AWS para producción: `us-east-1` (más servicios, más barato) vs `sa-east-1` (latencia AR). Definir antes de Fase 8.
- [ ] Proveedor de feature flags: Unleash, GrowthBook o flags simples en DB. Definir cuando aparezca el primer caso de uso.
- [ ] ¿Better Auth como alternativa a Clerk si los costos escalan? Re-evaluar al llegar a 5k MAU.

---

## Cómo actualizar este archivo

Al terminar cada sesión de trabajo:

1. Mover de "Próximo paso" a "Resumen de lo hecho" lo que se completó.
2. Actualizar el campo **Fase actual** y el **% de avance** si corresponde.
3. Listar el nuevo "Próximo paso" concreto (la siguiente tarea ejecutable).
4. Sumar entradas a "Decisiones tomadas" cuando se acuerde algo no trivial.
5. Sumar al log al final de este archivo (sección "Bitácora de sesiones").
6. Commitear: `docs: actualizar PROGRESS.md tras sesión <fecha>`.

---

## Bitácora de sesiones

### 2026-04-28 — Sesión 1 (Claude Opus 4.7)
- Generado `MIGRATION_PLAN.md` (plan maestro completo: arquitectura, modelo de tenancy, fases, criterios, riesgos).
- Decidida arquitectura: shared DB + Postgres + Clerk + CASL + Stripe/MP + AWS SES + Meta WAPI.
- Decidido modelo Organization → Team → User con roles separados a cada nivel.
- Decisión: empezar limpio (Opción A), no fork directo de AMSA.
- Creado repo `massivo-app`, scaffolding completo del monorepo (Fase 0).
- Verificado: pnpm install + typecheck + build + lint + format → todo verde.
- Commit `0d8d5fe`, push a `origin/main`.
- Creado `PROGRESS.md` (este archivo) para continuidad entre sesiones / IAs.
