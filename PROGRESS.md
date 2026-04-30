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
- **Última actualización:** 2026-04-29
- **Branch principal:** `main`
- **Último commit:** `0d8d5fe` — `chore: setup inicial del monorepo Massivo App (Fase 0)`
- **Repo remoto:** `https://github.com/maxidiflumeri/massivo-app`

---

## Código fuente de referencia: AMSA Sender

Massivo App reutiliza lógica de negocio de **AMSA Sender** (sistema interno de Ana Maya SA, queda congelado y NO se modifica). Cuando una fase requiera portar funcionalidad existente (worker WAPI, tracking de email, integración Meta, IA Gemini, Unlayer, etc.), el código fuente original se encuentra **localmente** en:

```
C:\Users\MDIFLUME\Documents\Proyectos\Propios\amsa-sender
```

### Cómo usarlo

- **Solo lectura.** Nunca modificar archivos en esa carpeta. AMSA Sender es un producto separado en producción.
- **Portar selectivamente.** Copiar/adaptar la lógica al nuevo monorepo refactorizándola a multi-tenant (con `organizationId` + `teamId`). Nunca hacer un fork en bloque.
- **Stack diferente en algunos puntos.** AMSA usa MySQL; Massivo usa Postgres. Algunos modelos Prisma cambian de nombre (sin acentos para portabilidad). Ver `MIGRATION_PLAN.md` sección 2.4.

### Mapa rápido AMSA → Massivo (referencia)

| AMSA Sender (origen) | Massivo App (destino) | Cuándo se porta |
|----------------------|-----------------------|-----------------|
| `backend/src/modules/wapi/` | `apps/backend/src/modules/wapi/` (multi-tenant) | Fase 4 |
| `backend/src/modules/email/` | `apps/backend/src/modules/email/` (multi-tenant) | Fase 3 |
| `backend/src/workers/wapi-worker.service.ts` | `apps/backend/src/workers/` (con tenant context) | Fase 4 |
| `backend/src/workers/email-worker.service.ts` | `apps/backend/src/workers/` (con tenant context) | Fase 3 |
| `backend/src/modules/ai/gemini.service.ts` | `apps/backend/src/modules/ai/` | Fase 6 |
| `frontend/` (componentes Unlayer, inbox, dashboards) | `apps/frontend/src/features/` | Fases 3-6 |
| `prisma/schema.prisma` (modelos de dominio) | `packages/prisma/schema.prisma` (con `organizationId`/`teamId`) | Fase 1-2 |

### Lo que NO se porta

- **WhatsApp Web.js / Baileys**: excluido del MVP (no escala bien en SaaS).
- **Módulos `usuarios/`, `roles/`, `auth/` de AMSA**: reemplazados por Clerk + CASL.
- **`configuracion/` global por usuario**: reemplazado por configs por tenant/team.
- **MySQL específico**: migrar a Postgres (ajustar tipos, índices, JSON → JSONB).

---

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

- [x] Configurar Prisma 6 en `packages/prisma` con datasource Postgres.
- [x] Schema Prisma inicial: `Organization`, `Team`, `User`, `OrgMembership`, `TeamMembership`, `Plan`, `Subscription`, `UsageCounter`, `AuditLog`, enums (ver MIGRATION_PLAN.md sección 2.3).
- [x] Generar primera migración + seed de planes (FREE, STARTER, BUSINESS, ENTERPRISE). *(Nota: Se generó el esquema y script seed; la migración contra DB viva queda pendiente para correr localmente)*.
- [x] Integrar `PrismaModule` en backend con cliente compartido desde `@massivo/prisma`.
- [x] Crear cuenta en Clerk, configurar Organizations habilitadas, copiar keys a `.env`.
- [x] Frontend: `<ClerkProvider>`, `<SignIn>`, `<OrganizationSwitcher>`, `<UserButton>`.
- [x] Backend: `ClerkAuthGuard` valida JWT contra JWKS de Clerk.
- [x] `TenantContextGuard` resuelve `organizationId` (por `clerkOrgId`) y valida `teamId` del header `X-Team-Id`.
- [x] `AsyncLocalStorage` con `RequestContext { userId, organizationId, teamId, orgRole, teamRole }`.
- [x] Webhook `/webhooks/clerk` con manejo idempotente de `user.*`, `organization.*`, `organizationMembership.*`.
- [x] Endpoint `GET /api/me/context` (devuelve user + orgs + teams + permissions).
- [x] CASL `AbilityFactory` en `@massivo/permissions` + `PoliciesGuard` + decorator `@CheckPolicies`. Plan flags (Opción A) en `/me/context` con `computePlanFlags`. Tests: 6 (AbilityFactory) + 5 (PoliciesGuard) + 4 (MeService actualizado) ✅.
- [x] Prisma client extension que auto-inyecta `organizationId` + `teamId` (modo strict, rechaza queries sin contexto en modelos tenant-aware).
- [x] Decorator `@SkipTenantScope()` para casos legítimos (admin, jobs de billing).
- [x] Onboarding: signup → crear org → crear team "General" → asignar plan FREE. Mejorado: upsert idempotente, OWNER para creator, auto-assign al team General.
- [x] CRUD básico de teams (`TeamsModule`): list/get/create/update/delete con `@CheckPolicies` (primer consumer del auth chain completo). Plan-gate `create Team` via CASL. Tests: 8 ✅.
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

## Reglas de actualización (OBLIGATORIAS)

> **Estas reglas no son opcionales.** Aplican a cualquier IA o desarrollador que cierre una sesión o complete una funcionalidad. El incumplimiento rompe la continuidad entre sesiones y deja el repo en estado ambiguo.

### Al completar una funcionalidad o cerrar una fase

1. **Actualizar `CHANGELOG.md`** con una entrada bajo `[Unreleased]` o crear una nueva versión si corresponde (ver formato Keep a Changelog en el propio archivo).
2. **Actualizar `PROGRESS.md`** (este archivo) — ver pasos abajo.
3. **Hacer commit** que incluya CHANGELOG + PROGRESS junto con el código de la funcionalidad. Mensaje en español.

### Al terminar una sesión de trabajo (incluso si no se completó una funcionalidad)

1. Mover de "Próximo paso" a "Resumen de lo hecho" lo que se completó.
2. Actualizar el campo **Fase actual** y el **% de avance** si corresponde.
3. Listar el nuevo "Próximo paso" concreto (la siguiente tarea ejecutable).
4. Sumar entradas a "Decisiones tomadas" cuando se acuerde algo no trivial.
5. Sumar al log al final de este archivo (sección "Bitácora de sesiones") indicando qué IA/dev ejecutó la sesión.
6. Si se completó funcionalidad, **actualizar también `CHANGELOG.md`** (regla anterior).
7. Commitear con mensaje: `docs: actualizar PROGRESS.md y CHANGELOG.md tras sesión <fecha>` (o agruparlo con el commit de la funcionalidad).
8. Pushear a `origin/main` salvo indicación explícita en contrario.

### Qué va en cada archivo

| Archivo | Para qué |
|---------|----------|
| `MIGRATION_PLAN.md` | Plan maestro inmutable. Solo se modifica si cambia una decisión arquitectónica de fondo. |
| `PROGRESS.md` | Estado actual, próximo paso, decisiones, bitácora. Se actualiza en cada sesión. |
| `CHANGELOG.md` | Historial de cambios entregados (features, fixes, infra, docs). Se actualiza al completar funcionalidad. |
| Commits | Detalle granular de cada cambio. Mensajes en español, descriptivos. |

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

### 2026-04-29 — Sesión 5 (Claude Opus 4.7)
- Implementado endpoint `GET /api/me/context` (`MeModule` con `MeService` + `MeController`). Devuelve user + orgs + teams + plan + roles del usuario logueado, sin requerir team elegido. Filtra teams a los que el user es miembro. Tipos en `@massivo/shared-types`. Auth: `ClerkAuthGuard`. Tests unitarios 3/3 ✅.
- `permissions: {}` queda como placeholder hasta integrar CASL en la próxima tarea.

### 2026-04-29 — Sesión 4 (Claude Opus 4.7)
- Implementada la **Prisma extension `tenant-scope`** (modo strict): auto-inyecta `organizationId` (y `teamId` cuando el modelo es tenant-scoped) en `where`/`data` de operaciones de read/write/upsert. Tira error si se hace una query a un modelo scoped sin `TenantContext`.
- Categorización de modelos en `tenant-models.ts`: `TENANT_SCOPED` (vacío — se llena en Fase 2 con WapiConfig, EmailTemplate, Campaign, etc.), `ORG_SCOPED` (Subscription, UsageCounter, AuditLog), globales (Organization, Team, User, memberships, Plan).
- `PrismaService` expone `prisma.scoped` (cliente con extension aplicada). El cliente raíz se reserva para `TenantContextGuard`, webhooks Clerk y onboarding que deben operar pre-contexto.
- Sumadas API `TenantContext.runUnscoped()` y decorator `@SkipTenantScope()`.
- Suite de tests unitarios de la extension (10/10 ✅): aislamiento, strict mode, skip, inject en read/create/upsert, distinción org vs tenant scoped.

### 2026-04-29 — Sesión 3 (Claude Opus 4.7)
- Centralizada la carga de `.env` en la raíz del monorepo (backend, Vite, `prisma.config.ts`).
- **Downgrade de Prisma 7 → 6.16** (alineado con `MIGRATION_PLAN.md`): Prisma 7 obliga a usar driver adapter o Accelerate, lo que rompía el arranque de `PrismaService`. Se ajustó `schema.prisma` con `url = env("DATABASE_URL")` y se simplificó `prisma.config.ts`.
- Aplicada la migración inicial contra Postgres local en WSL y ejecutado el seed de planes (FREE, STARTER, BUSINESS, ENTERPRISE).
- **Verificación funcional end-to-end de Clerk**: signup con Google, creación de organización, acceso a `/dashboard` protegido con `OrganizationSwitcher` + `UserButton`. Flujo UI + JWT operativo. Pendiente: verificar webhook `organization.created` contra Postgres (requiere tunnel ngrok/Cloudflare).
- Confirmado que el backend levanta sin Redis (BullMQ entra recién en Fase 3).

### 2026-04-28 — Sesión 2 (Antigravity)
- Configuración de Prisma 7 (`packages/prisma`) con esquema base (Postgres) y script de seed.
- Integración de `PrismaModule` en el backend.
- Configuración de llaves de Clerk en `.env` provistas por el usuario.
- Integración de Clerk en Frontend (`<ClerkProvider>`, layouts y rutas de Sign In / Sign Up).
- Implementación de `ClerkAuthGuard` en el backend usando `@clerk/backend` y corrección de tipos TypeScript en Express Request.
- Implementación de webhooks de Clerk (`ClerkWebhookController`, `ClerkWebhookService`) usando `svix` para sincronizar usuarios, organizaciones y membresías.
- Implementación de `TenantContextGuard` y `TenantContextInterceptor` con `AsyncLocalStorage` para manejar el scope de tenants en las peticiones.

### 2026-04-29 — Sesión 6 (Antigravity — Opus 4.6)
- Completada integración CASL end-to-end: `@massivo/permissions` package (ya existente) → backend `AbilityFactory` + `PoliciesGuard` + `@CheckPolicies` (ya existentes) → wiring verificado.
- `TenantContextGuard` ya cargaba `planFeatures` desde `org.plan.features` en `request.planFeatures` (confirmado, no requirió cambio).
- Implementada **Opción A para plan flags** en `GET /api/me/context`: cada org ahora devuelve `permissions: { hasAi, canCreateTeam, canSso }` usando `computePlanFlags()`. Removido `permissions: {}` top-level del response.
- Actualizado tipo `MeContextResponse` en `@massivo/shared-types`: `PlanFlags` per-org en lugar de `Record<string, unknown>` global.
- Tests nuevos: `AbilityFactory` (6 tests) + `PoliciesGuard` (5 tests) + `MeService` actualizado (4 tests con plan flags).
- Fix pre-existente: `vite-env.d.ts` agregado en frontend para resolver `import.meta.env` en `pnpm build`.
- Fix pre-existente: `@massivo/permissions/tsconfig.json` excluye `*.spec.ts` del build.
- Fix: `@massivo/backend/package.json` ahora declara dependencia `@massivo/permissions`.
- Verificación: typecheck 8/8 ✅, build 5/5 ✅, tests backend 25/25 ✅, tests permissions 11/11 ✅.

### 2026-04-29 — Sesión 6b (Antigravity — Opus 4.6)
- **Webhook Clerk hardening**: eliminados todos los `any`, tipado con `ClerkWebhookEvent`. Org creation ahora idempotente (upsert). Creator se asigna como OWNER + ADMIN del team General. Role mapping mejorado con `mapClerkRoleToOrgRole` y protección contra degradación de OWNER.
- **CRUD de Teams** (`TeamsModule`): primer consumer completo del auth chain `ClerkAuthGuard → TenantContextGuard → PoliciesGuard + @CheckPolicies`. Endpoints: `GET /api/teams`, `GET /api/teams/:id`, `POST /api/teams`, `PATCH /api/teams/:id`, `DELETE /api/teams/:id`. Plan-gate `create Team` via CASL ability. Default team no se puede eliminar.
- DTOs con `class-validator` (`CreateTeamDto`, `UpdateTeamDto`).
- Tests `TeamsService`: 8 tests (sin contexto → 403, OWNER vs MEMBER visibility, slug duplicado, auto-assign creator, default protection, cross-org isolation).
- Verificación: typecheck 8/8 ✅, build 5/5 ✅, tests backend 33/33 ✅, tests permissions 11/11 ✅.
