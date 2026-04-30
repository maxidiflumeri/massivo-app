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

### Added — Fase 3 sub-C.3.b (Frontend templates + Unlayer)
- **`TemplatesListPage`** (`/dashboard/email/templates`): tabla MUI con `name/subject/updatedAt` + botones Editar/Borrar + CTA "Nuevo template". Confirm() antes de borrar. Click en nombre o ícono lápiz → abre editor.
- **`TemplateEditorPage`** (`/dashboard/email/templates/new` y `/:id`): embed Unlayer via `react-email-editor`. Flujo:
  - En new: render del editor en blanco, form con name + subject.
  - En edit: GET `/api/email/templates/:id` → `loadDesign(design)` cuando el editor dispara `onReady`.
  - Guardar → `editor.exportHtml(callback)` retorna `{design, html}`, POST o PATCH al backend con `{name, subject, html, design}`.
  - El subject soporta Handlebars (helper visible en el field).
- **Routing**: rutas anidadas dentro del `AppLayout` autenticado.
- **Dep nueva**: `react-email-editor@^1.8.0`.

### Added — Fase 3 sub-C.3.a (Frontend infra: API client + socket + router)
- **`useApi()` hook** (`apps/frontend/src/api/client.ts`): cliente HTTP que adjunta `Authorization: Bearer` (Clerk session token via `getToken()`) y `x-team-id` (del `TeamContext`) en cada request. Base URL desde `VITE_API_URL` (default `http://localhost:3001`). Lanza `ApiError(status, message, body)` en 4xx/5xx. Métodos `get/post/patch/delete` (auto-stringify JSON + `Content-Type`).
- **`TeamContext` + `useActiveTeam()`** (`apps/frontend/src/team/TeamContext.tsx`): provider que mantiene `activeTeamId` con persistencia en `localStorage` y sync entre tabs vía `storage` event. Wrappea la app dentro de `ThemeProvider` antes del router.
- **`useTeamSocket()` hook** (`apps/frontend/src/realtime/useTeamSocket.ts`): conecta socket.io al backend con `auth: { token, teamId }`, refresca el token en cada reconexión (Clerk maneja refresh interno), reconecta cuando cambia el team activo, cleanup en unmount. Devuelve `Socket | null`.
- **Router**: rutas placeholder `/dashboard/email/templates`, `/dashboard/email/campaigns`, `/dashboard/email/campaigns/:id` dentro del `AppLayout` autenticado.
- **Dep nueva**: `socket.io-client@^4.8.3`.

### Added — Fase 3 sub-C.2 (Realtime events `email.report.updated`)
- **`EventsService.emitToTeamDebounced(teamId, event, key, payload, delayMs=1000)`**: coalesce un burst de emisiones (mismo teamId+event+key) en 1 sola emisión que dispara tras `delayMs` sin nuevos eventos. Usa el payload de la llamada más reciente. Implementa `OnModuleDestroy` para limpiar timers pendientes en shutdown.
- **`EmailWorkerService`** ahora inyecta `EventsService` y emite `email.report.updated` con `{ campaignId }` (debounce key=campaignId) en cada transición de estado: `SUPPRESSED`, `SENT`, `FAILED`.
- **`SesWebhookService`** ahora inyecta `EventsService` y emite el mismo evento en `Bounce`, `Complaint`, `Open` y `Click`. `Delivery` y eventos sin tenant resoluble NO emiten.
- **Wiring**: `EmailModule` importa `EventsModule` para acceder al servicio.
- **Decisión de diseño**: el payload sólo lleva `campaignId` (no counts) — el frontend re-fetchea `/api/email/campaigns/:id/report` cuando recibe el evento. Evita N+1 queries por transición y mantiene la lógica de agregación en un solo lugar.
- **Tests**: 5 nuevos — `events.service.spec.ts` (4 nuevos: coalesce burst → último payload, keys distintas no coalescing, onModuleDestroy limpia timers, sin server no rompe) + asserción de emit en `email-worker.service.spec.ts` happy path + 1 nuevo en `ses-webhook.service.spec.ts`. Backend total: **194/194 ✅** (+5).

### Added — Fase 3 sub-C.1 (Backend campaigns CRUD + send + report)
- **DTOs** (`email-campaigns.dto.ts`): `CreateEmailCampaignDto` (name+templateId?+smtpAccountId?+scheduledAt?), `UpdateEmailCampaignDto`, `CampaignContactDto` (email+name?+data?), `AddCampaignContactsDto` (max 5000).
- **`EmailCampaignsService`**:
  - `create` → DRAFT por default, SCHEDULED si `scheduledAt` presente (valida `> now`).
  - `findAll`/`findOne` con relaciones (`template`, `smtpAccount`) y `_count` (contacts/reports).
  - `update`/`remove` con guard de estados (`EDITABLE_STATUSES = DRAFT|SCHEDULED|PAUSED`, bloquea PROCESSING con Conflict).
  - `addContacts` → bulk `createMany` con email normalizado (lowercase+trim).
  - `send` → valida ready (templateId+smtpAccountId+contacts), transiciona a PROCESSING, `$transaction` crea `EmailReport[]` PENDING, enquola en BullMQ con `jobId=reportId` (idempotente). Retorna `{enqueued: N}`.
  - `getReport` → groupBy status counts (PENDING/SENT/FAILED/BOUNCED/COMPLAINED/SUPPRESSED) + opens/clicks/uniqueOpens/uniqueClicks.
- **`EmailCampaignsController`** (`/api/email/campaigns`): stack auth completo + `@CheckPolicies` por acción (`read|create|update|delete|send Campaign`). `POST /:id/send` → 202 ACCEPTED. `DELETE /:id` → 204.
- **Tests**: 12 nuevos en `email-campaigns.service.spec.ts`. Backend total: **189/189 ✅** (+12).

### Added — Fase 3 sub-B.3 (Webhook SES)
- **`SesSender.ensureConfigurationSet` extendido**: cuando hay `SES_EVENTS_SNS_TOPIC_ARN` configurado, crea (idempotente) un EventDestination tipo SNS apuntando al topic, suscripto a `BOUNCE/COMPLAINT/DELIVERY/OPEN/CLICK`. Sin topic → no-op (útil en dev sin SNS).
- **`SnsValidatorAdapter`**: wrapper Promise sobre `sns-validator` (callback API → Promise) para que el controller pueda awaitearlo y los tests mockearlo trivialmente.
- **`SesWebhookController`** (`POST /webhooks/ses`, `@SkipTenantScope`): endpoint público confiable solo por la firma RSA del payload SNS. Maneja:
  - `SubscriptionConfirmation` → auto-confirma vía fetch a `SubscribeURL`.
  - `UnsubscribeConfirmation` → log only.
  - `Notification` → parsea `Message` (string JSON con el evento SES) y delega.
- **`SesWebhookService.process`**:
  - **Tenant resolution**: primero por `mail.tags['ses:configuration-set']` (formato `{prefix}{teamId}` → busca el `Team` con cliente raíz para obtener `organizationId`); fallback a buscar por `smtpMessageId` en `EmailReport` con cliente raíz. Si no resuelve, log y skip.
  - Corre todo dentro de `TenantContext.run` con role sintético OWNER/ADMIN.
  - **Bounce Permanent** → `EmailBounce` con `code='hard'` + `EmailReport.status='BOUNCED'` + `SuppressionService.addUnsubscribe` GLOBAL con `reason='ses-bounce-permanent'`.
  - **Bounce Transient** → `EmailBounce` con `code='soft'`, sin suppression.
  - **Complaint** → `EmailReport.status='COMPLAINED'` + suppression GLOBAL `reason='ses-complaint'`.
  - **Open/Click** → idempotente con dedupe 2s, persiste IP/userAgent/targetUrl/targetDomain, actualiza `firstOpenedAt`/`firstClickedAt` solo si null.
  - **Delivery** → no-op por ahora (no existe `EmailEventType.DELIVERY` en el enum; nota para futuro).
- **Tests**: 18 nuevos — `ses-sender.spec.ts` extendido (3 SNS destination), `ses-webhook.controller.spec.ts` (6), `ses-webhook.service.spec.ts` (9). Backend total: **177/177 ✅**.
- **Deps**: `sns-validator@^0.3.5` + `@types/sns-validator`.

> **🏁 Sub-fase 3.B completa** — tracking saliente + suppression + webhook SES.

### Added — Fase 3 sub-B.2 (Suppression + unsubscribe)
- **Schema**: enum `EmailReportStatus` agora incluye `SUPPRESSED` (migración `add_suppressed_status`).
- **Permissions**: subject `EmailSuppression` agregado a `@massivo/permissions`. MEMBER tiene `read`; ADMIN puede manage (vía `manage all`).
- **`SuppressionService`** (`apps/backend/src/modules/email/suppression/`): centraliza la lógica de "este email está bloqueado para este team":
  - `check({email, campaignId})` → consulta `EmailUnsubscribe` (GLOBAL o CAMPAIGN matching) + `EmailBounce` con `code='hard'`. Devuelve `{suppressed, reason}` con razón discriminada (`unsubscribe-global` / `unsubscribe-campaign` / `bounce-hard`). Búsqueda por `emailHash` (SHA-256 del email normalizado lowercase+trim) para case-insensitive y futura compat con borrado de PII.
  - `addUnsubscribe({email, scope, campaignId, ...})` idempotente vía findFirst+create (Postgres no deduplica NULL en compound unique, así que no se puede upsert directo).
- **`EmailWorker` integrado**: antes de render, chequea suppression. Si suprime → `EmailReport.status='SUPPRESSED'` + `error=<reason>`, NO llama sender, NO throw (job ack normal). Cambia firma de `process()` para incluir `{suppressed?, reason?}`.
- **`UnsubscribeController`** (`GET /api/unsubscribe?t=jwt&scope=global|campaign`): endpoint público sin Clerk con el mismo patrón seguro que `/track/*` — JWT inválido devuelve 200 + HTML genérico, no leakea validación. Reconstruye `TenantContext` del payload, resuelve email del `EmailReport` via `prisma.scoped`.
- **`SuppressionsController`** (`GET /api/email/suppressions`): stack auth completo, `@CheckPolicies('read', 'EmailSuppression')`, paginado por cursor (default 50, clamp 200). Devuelve `{unsubscribes, bounces}` ordenados por fecha desc.
- **Tests**: 17 nuevos — `suppression.service.spec.ts` (8: GLOBAL/CAMPAIGN match, bounce hard, hash normalizado, idempotencia), `unsubscribe.controller.spec.ts` (4: GLOBAL/CAMPAIGN, JWT inválido NO leakea, report not found), `suppressions.controller.spec.ts` (4: paginación, clamp, cursor), worker SUPPRESSED branch (1 test extra). Backend total: **159/159 ✅** (+17).

### Added — Fase 3 sub-B.1 (Tracking saliente: pixel + click rewriter)
- **`TrackingTokenService`**: HS256 JWT con payload corto `{r,o,t,c}` (reportId, orgId, teamId, campaignId). Secret `EMAIL_TRACKING_JWT_SECRET`, base URL `EMAIL_PUBLIC_URL` (default `http://localhost:3001`). `verify()` valida tipos de cada claim antes de devolver el payload.
- **`prepareHtmlForTracking`** helper: regex `/\bhref=("|')(https?:\/\/[^"']+)\1/gi` reescribe links absolutos a `/api/track/click?t=<jwt>&u=<dest>` (URL-encoded), inyecta pixel 1×1 antes de `</body>` (o al final si no existe). Skip de href que ya apuntan al `publicUrl` propio (evita rewrite recursivo) y de mailto/tel/anchors.
- **`TrackController`** (`/track/open.gif`, `/track/click`): endpoints **públicos** sin Clerk. Crítico de seguridad: NUNCA leakean validación — token inválido devuelve 200+pixel / 302+redirect igual que un válido (no oráculo de validación). Lee IP de `x-forwarded-for` cuando está.
- **`TrackService.record`**: registra `EmailEvent` con dedupe ventana 2s (anti doble-click + preview proxies de email), reconstruye `TenantContext` desde el JWT con role sintético `OWNER/ADMIN` + `userId='system:tracking'`. Actualiza `EmailReport.firstOpenedAt`/`firstClickedAt` solo si `null`.
- **`EmailWorker` integrado**: pipeline ahora es `Handlebars.compile(html) → prepareHtmlForTracking → sendForAccount`. Persiste `trackingToken` en `EmailReport` al SENT.
- **Tests**: 18 nuevos — `tracking-token.service.spec.ts` (5: roundtrip, secret distinto, basura, sin secret, publicUrl default), `prepare-html.spec.ts` (7: rewrite https/single-quote, skip publicUrl propio, skip mailto/tel/#, pixel pre-`</body>` o append, normalización trailing slash), `track.controller.spec.ts` (6: OPEN/CLICK happy path, **token inválido NO leakea**, x-forwarded-for, falta `u` → 400). `email-worker.service.spec.ts` actualizado con mock `TrackingTokenService`. Backend total: **142/142 ✅** (+18).

### Added — Fase 3 sub-A (Infra de envío email)
- **Driver-based sender**: interface `EmailSender` con dos implementaciones — `SmtpSender` (nodemailer, default — Mailpit en dev / SMTP del cliente en prod) y `SesSender` (`@aws-sdk/client-sesv2`, prod). Selección por `SmtpAccount.provider`.
- **Schema**: `SmtpAccount.provider` (default `"smtp"`) y `SmtpAccount.sesConfigSet?` (migración `add_smtp_provider_field`). DTOs y service actualizados.
- **`SesSender.ensureConfigurationSet(teamId)`**: idempotente con cache, GetConfigurationSet → si NotFoundException, CreateConfigurationSet. Nombre estable `{prefix}{teamId}` truncado a 64 chars (límite SES). SNS destinations quedan para 3.B.
- **`EmailQueueService`** (BullMQ, queue `email-send`): jobId=reportId para idempotencia, reintentos 3 con backoff exponencial.
- **`EmailWorkerService`**: reconstruye `TenantContext.run` con role sintético OWNER/ADMIN, carga `EmailReport`+contact+campaign+template+smtpAccount via `prisma.scoped`, render Handlebars (`contact.data` como vars), envía via `EmailSenderService.sendForAccount`, persiste `SENT` con `smtpMessageId` o `FAILED` con error truncado.
- **Tests**: `ses-sender.spec.ts` (6 — config-set idempotente, NotFoundException → create, truncado, send messageId) + `email-worker.service.spec.ts` (4 — happy path, sender error → FAILED+rethrow, cross-tenant report not found, campaign sin template). Backend total: 124 ✅.
- **Setup dev sin Docker** documentado en `PROGRESS.md` (Postgres + Redis + Mailpit nativos en WSL).

### Added — Fase 2 sub-D (Sockets scopeados)
- **`EventsModule`** (`apps/backend/src/modules/events/`): `EventsService` con helpers `emitToTeam(teamId, event, payload)`, `emitToOrg(orgId, ...)`, `emitToUser(userId, ...)`. Static `roomsFor(orgId, teamId, userId)` para suscripción uniforme. Module exporta el service para que otros módulos emitan tras mutaciones.
- **`AppGateway`** (`@WebSocketGateway`): auth handshake vía `server.use(middleware)` en `afterInit` — necesario porque emitir manualmente `connect_error` está reservado por Socket.IO. Cada socket aprobado se suscribe automáticamente a sus 3 rooms (`org:{id}`, `team:{id}`, `user:{id}`).
- **`SocketContextResolver`**: encapsula la misma lógica de `TenantContextGuard` pero leyendo de `socket.handshake.auth` (`token` Clerk + `teamId`). Retorna un `RequestContext` o lanza `UnauthorizedException`.
- **Tests**: `events.service.spec.ts` (5 unit) + `app.gateway.spec.ts` (5 integración con Socket.IO real, `IoAdapter`, dos clientes A/B): verifica aislamiento `emitToTeam` cross-tenant, `emitToOrg` per-org, y rechazos sin token / sin teamId / token inválido.

> **🏁 Fase 2 completada**: todos los criterios globales verificados. Backend tests: 114/114, Permissions tests: 14/14. Auditoría manual confirma que ningún acceso a modelos tenant-aware usa el cliente raíz.

### Added — Fase 2 sub-C (Cross-cutting)
- **Schema Prisma cross-cutting**: 6 modelos tenant-aware (`Contact`, `Tag`, `ContactList`, `ScheduledTask`, `TaskExecution`, `CampaignLog`) + 2 tablas de unión (`ContactTag`, `ContactListMember`) + 4 enums (`ChannelKind`, `ScheduledTaskKind`, `TaskExecutionStatus`, `CampaignLogLevel`). Migración `add_crosscutting_models`.
- **`Contact` unificado** (email + phone + attributes JSONB): dedupe por `(teamId, email)` y `(teamId, phone)` vía `@@unique` — Postgres permite múltiples NULL así que contacts sin email no chocan.
- **`ContactsModule`**: `ContactsController` (`/contacts` con query `?email=` / `?phone=`) y `TagsController` (`/tags`). Stack `ClerkAuthGuard → TenantContextGuard → PoliciesGuard`. DTOs con `class-validator` (E.164 para phone, IsEmail para email, `@ValidateIf` exige al menos uno en create). `P2002` se traduce a `409 Conflict`.
- **CASL**: subjects `Tag` y `ContactList` agregados. Rules MEMBER ahora cubren CRUD + delete sobre `Contact/ContactList/Tag`.
- **Tests**: `contacts.service.spec.ts` (7), `tags.service.spec.ts` (6), extensión de `tenant-isolation.spec.ts` (6 cross-tenant + 2 sin contexto). Backend total: 104 ✅.

### Added
- Configuración de base de datos Postgres con Prisma y script de seed inicial (`packages/prisma`).
- Integración de Clerk para autenticación en el Frontend (`@clerk/react`).
- Vistas de Sign In, Sign Up y AppLayout protegidas con validación de sesión.
- `ClerkAuthGuard` en el backend para interceptar y validar JWTs contra JWKS.
- `ClerkWebhookController` en el backend para escuchar eventos de Clerk y sincronizar usuarios y organizaciones.
- `TenantContextGuard` y `TenantContextInterceptor` para manejar el scope de tenants de manera aislada (`AsyncLocalStorage`).

### Added
- **Endpoint `GET /api/me/context`** (`MeModule`): devuelve user + organizaciones + teams + roles + plan del usuario autenticado. Se usa desde el frontend antes de elegir team. Auth: `ClerkAuthGuard`. Filtra teams a los que el user pertenece. Tipos compartidos en `@massivo/shared-types` (`MeContextResponse`).
- **Prisma extension `tenant-scope`** (`apps/backend/src/common/prisma/tenant-extension.ts`): auto-inyecta `organizationId` (y `teamId` para modelos tenant-scoped) en `where`/`data` de queries que pasan por `prisma.scoped`. En modo strict, rechaza queries a modelos scoped sin `TenantContext`.
- Categorización de modelos en `tenant-models.ts`: `TENANT_SCOPED` (vacío hasta Fase 2), `ORG_SCOPED` (`Subscription`, `UsageCounter`, `AuditLog`), resto globales.
- API `TenantContext.runUnscoped()` y decorator `@SkipTenantScope()` para casos legítimos cross-tenant (admin, jobs de billing, webhooks).
- Suite de tests unitarios de la extension (10 casos: aislamiento, strict mode, skip, inject en read/create/upsert, modelos org vs tenant scoped).

### Changed
- Carga centralizada de `.env` desde la raíz del monorepo (backend `ConfigModule`, frontend `Vite envDir`, `prisma.config.ts`).
- `PrismaService` expone ahora `prisma.scoped` (cliente extendido con tenant-scope) además del cliente raíz para flujos sin contexto.

### Fixed
- Downgrade de Prisma 7 → 6.16 para alinear con `MIGRATION_PLAN.md` y restaurar conexión directa por `DATABASE_URL` (Prisma 7 obliga a usar driver adapter o Accelerate, lo que rompía el arranque de `PrismaService`).
- `schema.prisma` ahora declara `url = env("DATABASE_URL")` en el bloque `datasource` (requerido por Prisma 6).

### Added
- **`@massivo/permissions` package** (`packages/permissions`): subjects (11 + `all`), actions (8 incluyendo `use`), `defineAbilityFor(ctx)` con reglas org-level, team-level y plan gates alineadas con MIGRATION_PLAN §4.2. Tests: 11 ✅.
- **`AbilityFactory`** (provider NestJS): construye `AppAbility` desde `TenantContext` + `planFeatures`. Ubicado en `common/auth/`.
- **`@CheckPolicies` decorator** + **`PoliciesGuard`**: sistema declarativo de autorización para controllers. El guard lee handlers del decorator, construye el Ability y ejecuta cada handler.
- **`PlanFlags` en `GET /api/me/context`** (Opción A): cada organización devuelve `permissions: { hasAi, canCreateTeam, canSso }` computados desde `plan.features`. El frontend usa estos flags para mostrar/ocultar menú de nivel org. Los checks finos se hacen en backend con `PoliciesGuard`.
- **`computePlanFlags()`** en `@massivo/permissions`: mapea features del plan a flags booleanos del frontend.
- Tests: `AbilityFactory` (6 tests), `PoliciesGuard` (5 tests), `MeService` actualizado (4 tests con plan flags).
- `vite-env.d.ts` en frontend para resolver `import.meta.env` en build.

### Changed
- **`MeContextResponse`**: `permissions` movido de top-level `Record<string, unknown>` a per-org `PlanFlags` (Opción A). Tipo `PlanFlags` exportado desde `@massivo/shared-types`.
- `@massivo/permissions/tsconfig.json`: excluye `*.spec.ts` del build (los spec se ejecutan con ts-jest, no necesitan emit).
- `@massivo/backend/package.json`: agregada dependencia `@massivo/permissions: workspace:*`.
- **Webhook Clerk hardening**: eliminados todos los `any`, tipado con `ClerkWebhookEvent`. `organization.created` ahora usa `upsert` idempotente. Creator se asigna como `OWNER` + `ADMIN` del team General. Role mapping con `mapClerkRoleToOrgRole()`, protección contra degradación de OWNER en membership webhooks.

### Added
- **`TeamsModule`**: CRUD completo de teams (`GET /api/teams`, `GET /api/teams/:id`, `POST /api/teams`, `PATCH /api/teams/:id`, `DELETE /api/teams/:id`). Primer consumer del auth chain `ClerkAuthGuard → TenantContextGuard → PoliciesGuard + @CheckPolicies`. Plan-gate `create Team` via CASL ability. Team default no se puede eliminar. Auto-asigna creator como ADMIN del team.
- DTOs `CreateTeamDto` / `UpdateTeamDto` con `class-validator`.
- Tests `TeamsService`: 8 tests (sin contexto → 403, OWNER vs MEMBER visibility, slug duplicado, auto-assign creator, default team protection, cross-org isolation).
- **`TeamMembersController` + `TeamMembersService`**: CRUD de miembros de team (`GET/POST/PATCH/DELETE /api/teams/:teamId/members`). Valida pertenencia a org antes de agregar. Protección contra eliminar último admin. Cross-org isolation. Tests: 6 ✅.
- DTOs `AddTeamMemberDto` / `UpdateTeamMemberRoleDto` con `class-validator`.
- **Suite `tenant-isolation.spec.ts`**: 10 tests verificando aislamiento entre tenants (Tenant A no puede leer/escribir/eliminar datos de Tenant B).

> **🏁 Fase 1 completada**: todos los criterios de aceptación verificados. Backend tests: 49/49, Permissions tests: 11/11.

### Added (Fase 2 — sub-A: Email)
- **Schema Prisma de Email**: `SmtpAccount`, `EmailTemplate`, `EmailCampaign`, `EmailContact`, `EmailReport`, `EmailEvent`, `EmailBounce`, `EmailUnsubscribe` con `organizationId` + `teamId` obligatorios + índices por tenant. Cascada `onDelete` a `Organization` y `Team`.
- Enums: `EmailCampaignStatus` (DRAFT/SCHEDULED/PROCESSING/PAUSED/COMPLETED/FAILED), `EmailReportStatus` (PENDING/SENT/FAILED/BOUNCED/COMPLAINED), `EmailEventType` (OPEN/CLICK), `EmailUnsubscribeScope` (GLOBAL/CAMPAIGN).
- Migración Prisma `add_email_models` aplicada contra DB local.
- Modelos registrados en `TENANT_SCOPED_MODELS` (`apps/backend/src/common/prisma/tenant-models.ts`) → la Prisma extension los enforce automáticamente.

### Fixed
- **`pnpm dev` rompía el backend** (`ERR_MODULE_NOT_FOUND` en `@massivo/permissions`): los packages workspace exponían `main: ./src/index.ts`, lo que hacía que Node intentara cargar TS como ESM.
  - `package.json` de `@massivo/permissions`, `@massivo/shared-types`, `@massivo/prisma` ahora apuntan a `./dist/index.js` y `./dist/index.d.ts`.
  - `tsconfig.json` de los 3 packages: `module: CommonJS` + `moduleResolution: Node` (alineado con backend NestJS que es CJS).
  - `turbo.json`: `dev` ahora `dependsOn: ["^build"]` para que los packages se compilen antes de levantar las apps.

### Added (Fase 2 — sub-A: Email — completada ✅)
- **`EmailModule`**: CRUD de `SmtpAccount` y `EmailTemplate` con DTOs `class-validator`, services usando `prisma.scoped`, controllers con stack auth completo (`ClerkAuthGuard → TenantContextGuard → PoliciesGuard`). `@CheckPolicies` verifica subjects `SmtpAccount` y `Template` por rol.
- Tests unitarios `SmtpAccountsService` (5 tests) y `EmailTemplatesService` (6 tests): cobertura de `ForbiddenException` sin contexto, `NotFoundException` cross-tenant, `create` confía en la extension, `delete` valida existencia previa.
- Suite `tenant-isolation.spec.ts` extendida con 8 tests nuevos: aislamiento cross-tenant para `SmtpAccount` y `EmailTemplate` (read/update/delete devuelven 404), más tests de `ForbiddenException` sin contexto para ambos services.
- Tests CASL para subjects `SmtpAccount` y `Template` en `@massivo/permissions` (3 tests nuevos): ADMIN `manage`, MEMBER `read SmtpAccount + CRUD Template`, VIEWER `read only`.

### Fixed
- Errores de TypeScript en `SmtpAccountsService` y `EmailTemplatesService`: uso de `Prisma.*.UncheckedCreateInput` para `create()` porque la Prisma extension inyecta `organizationId`/`teamId` en runtime (el tipo `CreateInput` exige relaciones, pero el `UncheckedCreateInput` acepta IDs planos).
- Imports `@prisma/client` → `@massivo/prisma` en services de email (el backend accede al client via workspace package).

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
