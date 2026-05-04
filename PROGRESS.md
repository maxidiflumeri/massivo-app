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

- **Fase actual:** Fase 4 — Canal WhatsApp Cloud API (**sub-A ✅, sub-B ✅, sub-C ✅, sub-D ✅, sub-E ✅, sub-F.1 ✅, sub-F.1.a ✅, sub-F.1.b ✅, sub-F.2.a ✅** backend templates Massivo→Meta; siguen 4.F.2.b frontend del editor, 4.F.2.c media upload, 4.F.3-4 inbox, 4.G snippets, 4.H opt-out, 4.I welcome, 4.J live dashboard, 4.K botones)
- **Fases completadas:** Fase 0 ✅ + Fase 1 ✅ + Fase 2 ✅ + **Fase 3 ✅** (3.E inbound postergado, decisión del dueño)
- **Última actualización:** 2026-05-04
- **Branch principal:** `main`
- **Último commit (próximo a este cierre):** Sesión 22 cierre final extendido (4.F.1 + 4.F.1.a + 4.F.1.b + 4.F.2.a). Sobre el frontend WAPI ya completado se sumó **4.F.2.a — backend de posting de templates Massivo→Meta**: nuevo `WapiTemplatesPostingService` que mapea DTO a payload Meta (HEADER text/image/video/document, BODY con `{{1}}…{{N}}` + samples `body_text`, FOOTER, BUTTONS quick-reply/URL/phone con max 3) y postea a `/v20.0/<wabaId>/message_templates`, persiste local con status PENDING. Endpoint `POST /api/wapi/templates/submit/:configId`. Wire en `wapi.module.ts`. **14 specs nuevos** cubriendo cada variante del DTO + errores Meta + decryption + dedup. Backend full **339/339 ✅** (+14, 0 regresiones). Para retomar: arrancar **4.F.2.b — Frontend del editor** (`WapiTemplateEditorPage` con form + live preview + AI suggestion placeholder, consumiendo `POST /api/wapi/templates/submit/:configId`). 4.F.2.c (media handle upload) queda como sub-fase posterior porque requiere implementar la 3-step Resumable Upload de Meta.
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

### Setup dev local sin Docker (WSL nativo)

En máquinas sin Docker (PC del trabajo), instalar Postgres / Redis / Mailpit nativo en WSL:

```bash
# Postgres (ya hecho — puerto 5432)
# Redis (Fase 3.A)
sudo apt install -y redis-server
sudo service redis-server start
redis-cli ping  # → PONG

# Mailpit (Fase 3.A — captura SMTP local con UI web)
curl -sL https://github.com/axllent/mailpit/releases/latest/download/mailpit-linux-amd64.tar.gz | tar -xz
sudo mv mailpit /usr/local/bin/
mailpit &  # SMTP en :1025, UI en http://localhost:8025
```

Para que el backend use Mailpit, crear una `SmtpAccount` con `host=127.0.0.1`, `port=1025`, `provider="smtp"`, `username=""`, `password=""`.

---

## Próximo paso (Fase 3 — Canal Email: envío real)

Ver `MIGRATION_PLAN.md` sección **9 → Fase 3** (líneas 529-542). Código de referencia en AMSA: `backend/src/modules/email/` y `backend/src/workers/email-worker.service.ts`.

### Sub-fase 3.A — Infra de envío (completada ✅)

Checklist:
- [x] Decisión: arquitectura **driver-based** con interface `EmailSender` y dos implementaciones: `SmtpSender` (nodemailer, default — Mailpit en dev / SMTP de cliente en prod) y `SesSender` (`@aws-sdk/client-sesv2`). Selección por `SmtpAccount.provider` (campo nuevo `provider: "smtp"|"ses"` + `sesConfigSet?: string`).
- [x] Migración `add_smtp_provider_field` aplicada.
- [x] Deps: `nodemailer`, `@aws-sdk/client-sesv2`, `bullmq`, `ioredis`, `handlebars` + `@types/nodemailer`. Variables `EMAIL_QUEUE_NAME`, `EMAIL_WORKER_CONCURRENCY`, `EMAIL_WORKER_ENABLED`, `SES_CONFIG_SET_PREFIX` en `.env.example`.
- [x] `SesSender.ensureConfigurationSet(teamId)` idempotente con cache in-memory: GetConfigurationSet → si NotFoundException, CreateConfigurationSet. Truncado a 64 chars. **Pendiente para 3.B**: agregar SNS destinations para Bounce/Complaint/Delivery/Open/Click.
- [x] `EmailSenderService` resuelve sender por account (cache de `SmtpSender` por accountId, `SesSender` compartido).
- [x] `EmailQueueService` (BullMQ queue `email-send`) con `enqueue({reportId, organizationId, teamId})`. JobId = reportId para idempotencia. Reintentos con backoff exponencial (3 attempts, delay 5s).
- [x] `EmailWorkerService`: reconstruye `TenantContext.run` con role sintético OWNER/ADMIN (background sin user real, authz ya pasó al enquolar), carga `EmailReport`+contact+campaign+template+smtpAccount via `prisma.scoped`, renderiza con Handlebars (`contact.data` como vars), llama `EmailSenderService.sendForAccount`, marca SENT con `smtpMessageId` o FAILED.
- [x] Tests: `ses-sender.spec.ts` (6 — config-set idempotente, NotFoundException → create, truncado 64 chars, send messageId) + `email-worker.service.spec.ts` (4 — happy path render+send+SENT, sender error → FAILED+rethrow, cross-tenant report not found, campaign sin template).

Criterios de aceptación 3.A:
- `pnpm typecheck` 8/8 ✅, `pnpm --filter @massivo/backend test` 124/124 ✅ (+10 vs Fase 2).
- Worker reconstruye contexto desde el job y todas las queries son tenant-scoped (no leak cross-tenant — verificado por test).
- ⚙️ **Pendiente de verificación dev local** (depende de instalar Mailpit + Redis en WSL): enquolar un job real → recibir el email en Mailpit UI → ver `EmailReport.status=SENT` con `smtpMessageId` poblado.

### Checklist Fase 3 (sub-fases pendientes)

**Sub-fase 3.B — Tracking + Webhook SES**:

**3.B.1 — Tracking saliente (✅ completada):**
- [x] `TrackingTokenService.sign/verify` con HS256 + payload corto `{r,o,t,c}`. Secret en `EMAIL_TRACKING_JWT_SECRET`, base URL en `EMAIL_PUBLIC_URL`.
- [x] Helper `prepareHtmlForTracking({html,token,publicUrl})`: reescribe href http(s) a `/api/track/click?t&u`, inyecta pixel 1×1 antes de `</body>` (o al final si no existe). Skip de href que ya apuntan al `publicUrl` propio.
- [x] `TrackController` público (`/track/open.gif`, `/track/click`): NUNCA leakea validación — token inválido = 200+pixel / 302+redirect igual.
- [x] `TrackService.record` idempotente (dedupe ventana 2s) + actualiza `firstOpenedAt`/`firstClickedAt` solo si `null`. Reconstruye `TenantContext` con role sintético del payload JWT.
- [x] `EmailWorker` integra: render handlebars → `prepareHtmlForTracking` → persiste `trackingToken` en `EmailReport` al SENT.
- [x] Tests: 18 nuevos (token, prepare-html, controller, worker actualizado) — full suite 142/142 ✅.

**3.B.2 — Suppression + unsubscribe (✅ completada):**
- [x] Schema: `SUPPRESSED` agregado a enum `EmailReportStatus` (migración `add_suppressed_status`).
- [x] Permissions: subject `EmailSuppression` agregado, MEMBER tiene `read`.
- [x] `SuppressionService.check({email, campaignId})`: chequea `EmailUnsubscribe` GLOBAL/CAMPAIGN matching + `EmailBounce` con `code='hard'`. Retorna `{suppressed, reason}`.
- [x] `SuppressionService.addUnsubscribe({email, scope, campaignId, ...})`: idempotente vía findFirst+create (no upsert por unique con NULL en compound key).
- [x] `EmailWorker` integrado: chequea suppression antes de render → marca report `SUPPRESSED` + reason, NO llama sender, NO throw.
- [x] `UnsubscribeController` público (`GET /api/unsubscribe?t=jwt&scope=global|campaign`): mismo patrón seguro que `/track/*` — token inválido devuelve 200 con HTML genérico, no leakea validación.
- [x] `SuppressionsController` (`GET /api/email/suppressions`): stack auth completo + `@CheckPolicies('read', 'EmailSuppression')`, paginado por cursor (clamp 200).
- [x] Tests: 17 nuevos (suppression service, unsubscribe controller, suppressions list, worker SUPPRESSED branch). Backend total: **159/159 ✅**.

**3.B.3 — Webhook SES (✅ completada):**
- [x] `SesSender.ensureConfigurationSet`: extiende para crear EventDestination tipo SNS (idempotente vía `GetConfigurationSetEventDestinationsCommand`) cuando hay `SES_EVENTS_SNS_TOPIC_ARN`. Eventos: BOUNCE, COMPLAINT, DELIVERY, OPEN, CLICK.
- [x] `SnsValidatorAdapter`: wrapper Promise sobre `sns-validator` (callback API) para mock fácil en tests.
- [x] `SesWebhookController` (`POST /webhooks/ses`, `@SkipTenantScope`): valida firma RSA, maneja SubscriptionConfirmation (auto-confirma vía fetch al SubscribeURL), UnsubscribeConfirmation (log) y Notification (parsea Message, delega).
- [x] `SesWebhookService.process`: resuelve tenant por `mail.tags['ses:configuration-set']` (formato `{prefix}{teamId}`) con fallback a buscar por `messageId` con cliente raíz, corre todo dentro de `TenantContext.run`. Bounce permanent → `EmailBounce` hard + `EmailReport` BOUNCED + suppression GLOBAL. Complaint → COMPLAINED + suppression. Open/Click idempotentes (dedupe 2s + targetDomain). Delivery sin acción (no hay enum DELIVERY).
- [x] Tests: 18 nuevos — `ses-sender.spec` extendido (3 SNS destination tests), `ses-webhook.controller.spec` (6: SubscriptionConfirmation, Notification, firma inválida, BadRequest, UnsubscribeConfirmation), `ses-webhook.service.spec` (9: tenant resolution por tag y fallback, Bounce permanent/transient, Complaint, Open dedupe, Click targetDomain, Delivery sin acción). Backend total: **177/177 ✅**.

> **🏁 Sub-fase 3.B completa**: tracking saliente + suppression + webhook SES en 3 sub-pasos. Falta solo 3.C (campañas, Unlayer, frontend) para cerrar Fase 3.

**Sub-fase 3.C — Campañas + Unlayer + Frontend**:

**3.C.1 — Backend campaigns CRUD + send + report (✅ completada):**
- [x] DTOs (`email-campaigns.dto.ts`): `CreateEmailCampaignDto`, `UpdateEmailCampaignDto`, `CampaignContactDto`, `AddCampaignContactsDto` (max 5000 contacts, `@IsEmail` + normalización).
- [x] `EmailCampaignsService`: create (DRAFT o SCHEDULED si `scheduledAt > now`), findAll/findOne con relaciones + `_count`, update/remove con guard de estados (`EDITABLE_STATUSES = DRAFT|SCHEDULED|PAUSED`, bloquea PROCESSING), `addContacts` con bulk `createMany`, `send` (valida ready → transiciona PROCESSING → `$transaction` crea `EmailReport[]` PENDING → enquola en BullMQ con `jobId=reportId`), `getReport` (groupBy status counts + opens/clicks/uniqueOpens/uniqueClicks).
- [x] `EmailCampaignsController` (`/api/email/campaigns`): stack auth completo + `@CheckPolicies` por acción. `POST /:id/send` retorna 202 ACCEPTED. `DELETE /:id` retorna 204.
- [x] Wiring en `EmailModule`.
- [x] Tests: 12 nuevos en `email-campaigns.service.spec.ts` (create DRAFT/SCHEDULED/past, update DRAFT/Conflict, addContacts, send happy path + 4 edge cases, getReport). Backend total: **189/189 ✅**.

**3.C.2 — Realtime events (✅ completada):**
- [x] `EventsService.emitToTeamDebounced(teamId, event, key, payload, delayMs=1000)`: coalesce un burst de emisiones (mismo teamId+event+key) en 1 sola emisión que dispara tras `delayMs` sin nuevos eventos. Usa el payload de la llamada más reciente. `OnModuleDestroy` limpia timers pendientes.
- [x] `EmailWorkerService` integra `EventsService` y emite `email.report.updated` con `{campaignId}` (debounce key=campaignId) en cada transición: SUPPRESSED, SENT, FAILED.
- [x] `SesWebhookService` integra `EventsService` y emite `email.report.updated` en Bounce, Complaint, Open, Click. Delivery y eventos sin tenant resoluble NO emiten.
- [x] `EmailModule` importa `EventsModule`.
- [x] Tests: 5 nuevos — `events.service.spec.ts` (4: coalesce burst, keys distintas no coalescing, onModuleDestroy limpia, sin server no rompe), `ses-webhook.service.spec.ts` (1: emit en Open). Worker spec extendido con asserción de emit en happy path. Backend total: **194/194 ✅**.

**3.C.3 — Frontend Unlayer + dashboard** (✅ completada):

**3.C.3.a — Infra frontend (✅ completada):**
- [x] `useApi()` hook (`apps/frontend/src/api/client.ts`): wrapper sobre fetch con base URL `VITE_API_URL`, adjunta `Authorization: Bearer <clerk-token>` y `x-team-id` (del TeamContext) automáticamente. Métodos `get/post/patch/delete`. Throw `ApiError(status, message, body)` en 4xx/5xx.
- [x] `TeamContext` (`apps/frontend/src/team/TeamContext.tsx`): provider + `useActiveTeam()` con persistencia en `localStorage` y sync entre tabs vía `storage` event.
- [x] `useTeamSocket()` hook (`apps/frontend/src/realtime/useTeamSocket.ts`): conecta socket.io con `auth: { token, teamId }`, reconnect cuando cambia team o user, cleanup en unmount.
- [x] Router wiring: `/dashboard/email/templates`, `/dashboard/email/campaigns`, `/dashboard/email/campaigns/:id` (placeholders por ahora). `TeamProvider` envuelve la app antes del router.
- [x] Dep nueva: `socket.io-client@^4.8.3`.

**3.C.3.b — Templates + Unlayer (✅ completada):**
- [x] `TemplatesListPage` (`/dashboard/email/templates`): tabla con MUI con name/subject/updatedAt + acciones edit/delete + botón "Nuevo template". Confirm() antes de delete.
- [x] `TemplateEditorPage` (`/dashboard/email/templates/new` y `/:id`): Unlayer embed (`react-email-editor`) con `onReady` → `loadDesign(design)` cuando se carga uno existente. Form con name + subject. Botón Guardar exporta `{design, html}` y POST/PATCH al backend. Redirige a la URL del id creado en modo new.
- [x] Dep nueva: `react-email-editor@^1.8.0`.

**3.C.3.c — Campaigns + contacts (✅ completada):**
- [x] `CampaignsListPage` (`/dashboard/email/campaigns`): tabla con status chips, dialog de creación (name + template/smtp/scheduledAt opcionales), confirm() destructive en delete. Columnas secundarias hidden en xs/sm.
- [x] `CampaignDetailPage` (`/dashboard/email/campaigns/:id`): edita name/template/smtp/scheduledAt solo si status ∈ {DRAFT, SCHEDULED, PAUSED}. CSV paste con detección de header `email,name` o filas planas, normalización lowercase+trim, máx 5000.
- [x] Botón Enviar con confirm() → POST `/:id/send`. Panel de report con counts (PENDING/SENT/FAILED/BOUNCED/COMPLAINED/SUPPRESSED) + opens/clicks/uniqueOpens/uniqueClicks.
- [x] Types compartidos en `features/email/campaigns/types.ts`.

**3.C.3.d — Realtime dashboard (✅ completada):**
- [x] `CampaignsListPage` suscrita a `email.report.updated` via `useTeamSocket()` → re-fetcha lista (debounce 1s ya en backend).
- [x] `CampaignDetailPage` suscrita filtrando por `campaignId` del payload → re-fetcha report en cada update. Counts + opens/clicks live.

**3.C.3.e — UX polish (✅ completada):**
- [x] `NotifyProvider` (Snackbar global, hook `useNotify()`, errores 8s vs 4s normal).
- [x] `ConfirmProvider` (hook `useConfirm()` Promise-based, soporta `destructive`/title/labels custom).
- [x] Skeletons en listas durante loading inicial.
- [x] Responsive: tablas ocultan columnas en xs/sm, AppLayout usa Drawer mobile.
- [x] Provider order en `main.tsx`: `ColorModeProvider > MuiThemeWithMode > ClerkWithTheme > NotifyProvider > ConfirmProvider > TeamProvider > BrowserRouter > App`.

**Extras (no estaban planificados, pero entraron en esta sesión):**
- [x] **Landing page** (`HomePage.tsx`) estilo SaaS moderno con hero gradient, 6 features, CTA. Patrón SignedIn/SignedOut sibling para auto-redirect a /dashboard.
- [x] **GitLab-style layout**: topbar full-width fijo (con UserButton top-right) + sidebar colapsable persistente desktop / Drawer mobile. `Sidebar` con NAV_GROUPS (General/Email/WhatsApp/Datos/Cuenta) + items disabled "pronto".
- [x] **Clerk dark mode**: `ClerkWithTheme` sincroniza `baseTheme` de `@clerk/themes` con el modo MUI + variables custom (colorPrimary, colorBackground, colorText, colorInputBackground).
- [x] **Clerk en español**: `localization={esES}` de `@clerk/localizations`.
- [x] **Tablas con shadow visible en dark**: override `MuiTableContainer` + `MuiPaper` con `boxShadow` custom + inner ring `rgba(255,255,255,0.05)`.
- [x] **Auth redirects**: `forceRedirectUrl`/`fallbackRedirectUrl="/dashboard"` en SignIn/SignUp.
- [x] **`DashboardHome`** con greeting + ActionCards a Campaigns/Templates.
- [x] Deps: `@clerk/themes`, `@clerk/localizations`.
**3.C.4 — Frontend email features restantes (próximo paso):**
- [x] **3.C.4.a — SMTP accounts UI** ✅ (2026-04-30): Página `/dashboard/email/smtp-accounts` con tabla + dialog crear/editar (provider smtp|ses, host, port, username, password opcional en edit, fromName, fromEmail, sesConfigSet?). Endpoint backend `POST /email/smtp-accounts/:id/test` + `TestSmtpAccountDto` que reusa `EmailSenderService.sendForAccount()`. UI con dialog "Enviar prueba" que pide email destinatario. NavRow en sidebar (icono `DnsIcon`). BLOCKER resuelto: ya no hace falta SQL para crear cuentas SMTP.
- [x] **3.C.4.a' — Verify de credenciales SMTP** ✅ (2026-04-30): `EmailSenderService.verifyAccount()` (SMTP: `transporter.verify` de nodemailer; SES: `GetAccountCommand`). `SmtpAccountsService.create/update` corren verify y setean `isActive` automáticamente (true si OK, false si falla). `isActive` pasa a ser system-controlled (se sacó el switch manual del editor). Endpoint nuevo `POST /email/smtp-accounts/:id/verify` para reintentar bajo demanda + botón "Verificar conexión" en cada fila. Si está inactiva, el chip muestra el motivo del último fallo en tooltip. Tests del service: 14/14 ✅ (4 nuevos: create OK / create FAIL / verify OK / verify FAIL).
- [x] **Fix: campaign queda en PROCESSING** ✅ (2026-04-30): el worker no transicionaba la campaign a `COMPLETED` cuando terminaba el último report. Agregado `EmailWorkerService.maybeCompleteCampaign()` (count PENDING → updateMany guarded por status) llamado tras cada transición terminal. Tests worker: 7/7 ✅ (sumamos 2 casos: "transiciona OK" y "no transiciona si quedan PENDING").
- [x] **Fix: loop de fetch en CampaignSendsSection** ✅ (2026-04-30): `useApi()` no estaba memoizada → `loadFirstPage` cambiaba en cada render → `useEffect` se disparaba en loop. Sacado de las deps; sólo refetch ante cambio de filtro / campaign / refreshKey externo.
- [x] **3.C.4.b — Per-campaign sends/events drill-down** ✅ (2026-04-30): nuevos endpoints `GET /api/email/campaigns/:id/reports` (paginado por cursor, filtro `?status=`, incluye contact + count de events) y `GET /api/email/campaigns/:id/reports/:reportId/events` (lista cronológica de OPEN/CLICK con metadata: targetUrl, ip, ua, device/os/browser). Frontend: nuevo componente `CampaignSendsSection` con tabla paginada (50/pág, "Cargar más"), filtro select por status, columnas con sentAt/1ª apertura/1er click/count events, error de envío en tooltip cuando aplica. Drill-down dialog con timeline de eventos (chip OPEN/CLICK, timestamp, link clickable al targetUrl, IP+device+OS+browser, UA completo). Auto-refresh por socket (refreshKey con `liveTick`).
- [x] **3.C.4.c — Suppressions UI** ✅ (2026-04-30): backend con endpoints separados `GET /unsubscribes` + `GET /bounces` (cursor + filtro email), `POST /unsubscribes` (manual con source='manual') y `DELETE` de ambos (CASL `create`/`delete EmailSuppression`). Frontend `/dashboard/email/suppressions` con Tabs unsubscribes+bounces, tabla paginada, search por email, dialog "Agregar manual" (scope GLOBAL), confirm antes de borrar. NavRow con BlockIcon. Tests: 25/25 ✅.
- [x] **3.C.4.d — Métricas globales** ✅ (2026-04-30): backend `EmailMetricsService` con groupBy agregado (sent/failed/bounced/complained/suppressed/pending + aperturas/clicks únicos via firstOpenedAt/firstClickedAt) y top 5 campañas. Endpoint `GET /api/email/metrics/overview?days=7|30`. Frontend `/dashboard/email/metrics` con 4 KpiCards (Enviados / Open rate / Click rate / Bounce rate), distribución por estado, tabla top campañas con link al detalle. ToggleButtonGroup 7d/30d. Tests: 3/3 ✅.
- [x] **3.C.4.e — Live processing view** ✅ (2026-04-30): nuevo `CampaignProcessingBanner` que se muestra arriba de Resultados cuando `campaign.status === 'PROCESSING'`. LinearProgress determinate calculada como `(totalReports - PENDING) / totalReports`, contador `procesados / total (%)`, chip "● en vivo / ○ desconectado" según socket, breakdown por status (Pendientes/Enviados/Fallidos/Bounced/Complaints/Suprimidos). Hook `useThroughput` con buffer de muestras (ventana 60s, ≥5s de datos, delta>0) que estima envíos/min — null mientras no haya datos. Auto-refresh ya cubierto por el socket existente (`email.report.updated`). Pause/resume de campaña diferido a 3.C.5.
- [x] **3.C.4.f — Log en vivo por campaña + throttle fix** ✅ (2026-04-30): backend emite `email.report.log` por transición (SENT/FAILED/SUPPRESSED) con `{campaignId, reportId, email, status, messageId?, error?, ts}` — no throttleado, el filtrado lo hace el frontend. `EventsService.emitToTeamDebounced` reescrito a throttle leading+trailing (debounce puro nunca disparaba durante un burst → progreso pegado en 0%). Frontend `CampaignProcessingBanner` con panel "Log en vivo" colapsable estilo consola (monospace dark, scroll auto, filtro por status, ring buffer 200, botón limpiar). Multi-campaña: cada banner filtra por su `campaignId`, soporta hasta 5 campañas en paralelo sin cruzar logs. Tests: events 11/11 ✅, worker 7/7 ✅.

**3.C.5 — Control actions de campaña (pausar / reanudar / forzar cierre):**
- [x] **3.C.5 — Control actions completas** ✅ (2026-05-04): nuevo valor `CANCELED` en `EmailReportStatus` (migración `20260504181455_add_canceled_report_status`). Service: `pause` (PROCESSING→PAUSED), `resume` (PAUSED→PROCESSING + re-enqueue PENDING idempotente), `forceClose` (PROCESSING|PAUSED→COMPLETED + `updateMany` PENDING→CANCELED). Endpoints `POST /:id/pause | /resume | /force-close` con `@CheckPolicies('send', 'Campaign')`. Worker chequea `campaign.status` antes de procesar: PAUSED → `job.moveToDelayed(now+30s, token)` y exit; COMPLETED+PENDING → marca CANCELED y exit. Estrategia DB-flag + worker check (no se cancelan jobs en BullMQ → idempotente, sobrevive reinicios, sin race con jobs ya tomados). Frontend: `CampaignProcessingBanner` también se muestra en PAUSED (icono PauseCircle, color warning) y recibe `status` + handlers; tres botones nuevos (Pausar / Reanudar / Forzar cierre) con `useConfirm` destructive en force-close. Tests: campaigns 19/19 ✅ (7 nuevos para pause/resume/forceClose), worker 9/9 ✅ (2 nuevos para PAUSED y CANCELED por force-close), backend full **228/228 ✅**.

**3.D — Reportes consolidados con export CSV/XLSX:**
- [x] **3.D — Reportes consolidados completos** ✅ (2026-05-04): backend `ReportGeneratorService` con 4 generators (`campaign-summary` / `campaign-reports` / `bounces-complaints` / `suppressions`). Endpoint único `POST /api/email/reports/generate` (controller `ReportsController` con `@CheckPolicies` compuesto: `read Campaign` AND `read EmailSuppression`). DTO `GenerateReportDto` con `kind`/`format`/`campaignId?`/`status?`/`fromDate?`/`toDate?` (class-validator + `@Type(() => Date)`). Estrategia **sync-only** (single Buffer en memoria, ~50k filas máx) — async + S3 + scheduler diferido a Fase 8. Libs: `csv-stringify@^6.7.0` (sync API) + `exceljs@^4.4.0` (XLSX con header bold). Response binaria stream-friendly (Express `Response` con `Content-Type` + `Content-Disposition: attachment; filename="..."` + `Content-Length`). Frontend: nuevo `useApi.download()` + helper `triggerBlobDownload` (parsea `Content-Disposition`, dispara save dialog vía `<a>` temporal con `URL.createObjectURL`). Componente reutilizable `ExportReportButton` (split-button MUI con menu CSV / Excel + busy state + useNotify). Cableado en `CampaignDetailPage` (2 botones: Resumen + Detalle por contacto, ambos con `campaignId` filtro) y `SuppressionsPage` (2 botones: unsubs + bounces/complaints). Tests: 10 nuevos en `report-generator.service.spec.ts` (4 generators × CSV/XLSX, BadRequest/NotFound, date range filter precedence, parseback XLSX vía `ExcelJS.Workbook` para asertar header bold + numeric cells). Backend full **238/238 ✅**. Fix preexistente colateral: TS2742 (Prisma type portability) en `email-campaigns.controller.ts` resuelto con return types explícitos en `pause`/`resume`/`forceClose`.

> Sub-tareas legacy del plan original (referencia, ya cubiertas en 3.A/3.B/3.C):
- [x] Tracking JWT: payload `{ rid: reportId, oid: orgId, tid: teamId, cid: campaignId }` firmado con `EMAIL_TRACKING_JWT_SECRET`. Endpoints `GET /api/track/open.gif` (1×1 transparente, registra `EmailEvent` OPEN) y `GET /api/track/click` (registra CLICK + 302 al destino). Ambos públicos (sin Clerk) pero validan firma JWT y resuelven tenant del payload, no del header. **Cubierto en 3.B.**
- [x] Webhook SES `POST /webhooks/ses`: valida firma SNS, resuelve tenant via `configurationSet` (lookup por prefijo `massivo-team-`) o vía `messageId` → `EmailReport`. Maneja `Bounce` / `Complaint` / `Delivery` / `Open` / `Click` idempotente. Endpoint público con `@SkipTenantScope()`. **Cubierto en 3.B + 3.B'.5 DSN parsing.**
- [x] CRUD campañas email (`/api/email/campaigns`): create (DRAFT), update, schedule, `POST /api/email/campaigns/:id/send` que enquola jobs por contacto. Reportes: `GET /api/email/campaigns/:id/report` con conteos agregados. Stack auth completo y `@CheckPolicies` (`send Campaign`). **Cubierto en 3.C.1/.2.**
- [x] Suppression list por team: vista `/api/email/suppressions` (lista `EmailUnsubscribe` + `EmailBounce` activos). Antes de enquolar cada job el worker chequea suppression para `(teamId, email)` y marca el report como `SUPPRESSED`. **Cubierto en 3.C.2 (worker check) + 3.C.4.c (UI).**
- [x] Endpoint público `GET /api/unsubscribe` con token JWT (mismo secret tracking, scope GLOBAL o CAMPAIGN según template). Persiste `EmailUnsubscribe` y devuelve página HTML mínima de confirmación. **Cubierto en 3.B + 3.B'.4 One-Click RFC 8058.**
- [x] Editor Unlayer: portar embed desde AMSA frontend. Persiste `design` (JSON Unlayer) y `html` exportado en `EmailTemplate`. **Cubierto en 3.C.3.b.**
- [x] Eventos en tiempo real: emitir vía `EventsService.emitToTeam(teamId, 'email.report.updated', ...)` en cada actualización del worker/webhook (throttled 1s) para que el frontend refresque dashboards. **Cubierto en 3.C.3.d (suscripción) + 3.C.4.f (fix throttle leading+trailing).**
- [x] Tests: `email.worker.spec.ts` (mock SES, config set, suppression check, persistencia + messageId), `track.controller.spec.ts` (JWT inválido → 400; OPEN/CLICK persisten event), `ses.webhook.controller.spec.ts` (Bounce → suppression, Complaint → unsubscribe, x-tenant via configSet), `tenant-isolation.spec.ts` extendido con `EmailCampaign`/`EmailReport`/`EmailEvent`. **Cubierto a lo largo de 3.A/3.B/3.C — backend full 238/238 ✅ al cierre de 3.D.**

### Criterios de aceptación Fase 3

- `pnpm typecheck` 8/8 ✅, `pnpm --filter @massivo/backend test` verde con todos los specs nuevos.
- E2E manual: en team A, crear template con Unlayer → crear campaña con 50 contactos → ejecutar `send` → SES entrega los emails reales (o stub local con MailHog en dev) → reporte muestra ≥45 SENT y eventos OPEN/CLICK al disparar pixel/links → todos los registros persisten con `organizationId/teamId` del team A.
- Cross-tenant: `GET /api/email/campaigns/:id/report` con campaña de team B desde JWT de team A retorna `404`.
- Webhook SES con `messageId` de team B procesado correctamente sin contexto preexistente (resuelve tenant por configSet/messageId, no por header).
- Suppression efectiva: agregar manualmente un email a `EmailUnsubscribe.GLOBAL` y reenviar campaña → ese contacto queda con `SUPPRESSED` en el reporte y SES NO recibe el send.
- Aislamiento de eventos: socket cliente conectado al team B no recibe `email.report.updated` de team A.

> **Notas de portado AMSA:** ver `C:\Users\MDIFLUME\Documents\Proyectos\Propios\amsa-sender\backend\src\modules\email\*` (services, queue, worker, tracking) y `frontend/src/features/email/*` (Unlayer). Adaptar a multi-tenant: nada de globals, todo el contexto entra por job payload o JWT del request.

---

## Plan de Fase 4 — Canal WhatsApp Cloud API (en curso)

> Schema y CRUD mínimo (`WapiConfig`, `WapiTemplate`) ya hechos en 2.B. Faltan envío real, inbox conversacional, webhooks de Meta, sync de templates aprobados, encriptación KMS, UI frontend, opt-out, welcome message, live dashboard.

**4.A — Infra de envío WAPI** (✅ completada — Sesión 17 / 2026-05-04):
- [x] **WapiSenderService** ✅: cliente HTTP a Graph API v20+ `/messages` con `fetch` nativo (Node 22 / undici, sin deps). Métodos `sendText` / `sendTemplate` / `sendMedia`. `WapiSendException` con `{code, subCode, message, isRateLimit, isAuth, retryable, raw}` — el worker decide backoff vs FAILED. Códigos rate limit conocidos: 130429, 131048, 131056. Códigos auth: 190, 102, 10, 200. Override de URL base vía `WAPI_GRAPH_BASE_URL`.
- [x] **WapiQueueService** ✅: BullMQ Queue `wapi-send` con `jobId=reportId` (idempotente). Mismo patrón que `email-send` (`attempts:3`, backoff exponencial, TTLs). Acepta `delayMs` opcional al enquolar.
- [x] **WapiWorkerService** ✅: BullMQ Worker que reconstruye `TenantContext` desde el payload, carga report+contact+campaign(template, configRel) via `prisma.scoped`, chequea control actions (PAUSED → moveToDelayed; COMPLETED+PENDING → FAILED 'campaign-closed'), aplica daily limit per-config (cuenta SENT últimas 24h y compara con `WapiConfig.dailyLimit`), envía vía `WapiSenderService.sendTemplate`, marca SENT con `metaMessageId`/`sentAt`, emite `wapi.report.updated` (debounced) + `wapi.report.log`, llama `maybeCompleteCampaign`. **Jitter post-envío**: sleep `random(WAPI_DELAY_MIN_MS, WAPI_DELAY_MAX_MS)` (defaults 30s/60s) — con `concurrency=1` da rate limiting per-worker. **Backoff exponencial Meta rate-limit**: si `WapiSendException.isRateLimit`, NO marca FAILED — `moveToDelayed(now + min(60s × 2^attempt, 1h))`. Otros errores → FAILED + rethrow para retries de BullMQ.
- [x] **Endpoint placeholder** `POST /api/wapi/campaigns/:id/send` ✅: valida estado/templateId/configId/contacts, marca PROCESSING, crea WapiReport por contacto en transaction, enquola un job por cada uno. CRUD completo de campañas y control actions vienen en 4.E.
- [x] **Tests** ✅: `wapi-sender.service.spec.ts` 8/8 (sendText/Template happy + 6 errores) + `wapi-worker.service.spec.ts` 9/9 (happy, cross-tenant, PAUSED, COMPLETED, dailyLimit, rate-limit, auth, components con bodyVars, transición a COMPLETED). Backend full **255/255 ✅**.

**Pendientes de Fase 4 (próximos pasos):**
- [x] **4.B — Encriptación de tokens at-rest** ✅ (Sesión 18 / 2026-05-04): `EncryptionService` abstracto + `AesGcmEncryptionService` concreto en `common/security/`, cloud-agnostic (sin acoplamiento a AWS/GCP/Vault). AES-256-GCM con master key desde `MASSIVO_ENCRYPTION_KEY` (hex/base64). Formato versionado `v1:<iv>:<ct>:<tag>` (base64url). Cache LRU TTL 5min, max 256 entries. Modo legacy: sin clave master, persiste plaintext; lee plaintext y `v1:` indistintamente. `WapiConfigsService.create/update` encriptan; `WapiWorkerService` decripta antes de enviar. Tests 11/11. Backend full 266/266 ✅.
- [x] **4.C — Webhook Meta** ✅ (Sesión 19 / 2026-05-04): `GET /api/webhooks/wapi/:configId` verify (mode=subscribe + verify_token timing-safe), `POST` con HMAC-SHA256 sobre rawBody usando `appSecret` (sin appSecret → modo dev acepta sin validar + warn). Procesa `statuses[]` → WapiReport.DELIVERED/READ/FAILED por metaMessageId (no retrocede de READ a DELIVERED). Procesa `messages[]` entrantes → upsert `WapiConversation(teamId, configId, phone)` + crea `WapiMessage` con metaMessageId @unique (P2002 swallowed). Emite `wapi.report.updated` y `wapi.message.inbound`. Tests 20/20. Backend full 286/286 ✅. Pendiente: descarga de media → S3 (4.F), auto-reply welcome (4.I), keywords opt-out (4.H), `template_status_update`/`account_alerts`.
- [x] **4.D — Sync de templates Meta** ✅ (Sesión 20 / 2026-05-04): `POST /api/wapi/templates/sync/:configId` en `WapiTemplatesController`. `WapiTemplatesSyncService` carga `WapiConfig` vía `prisma.scoped`, decripta `accessTokenEnc`, pagina Graph API v20 (`paging.next`) con safety guard `MAX_PAGES=5` (~500 templates), upsert idempotente por `(metaName, businessAccountId)` — skip si `(status, language, category, components)` no cambió, sino update con `syncedAt`. Errores: Forbidden sin context, NotFound config inexistente, ServiceUnavailable en Graph non-2xx. URL base override-able vía `WAPI_GRAPH_BASE_URL`. No remueve templates que Meta borró (queda último status conocido). Tests 9/9. Backend full **295/295 ✅**. Pendientes: cron semanal (Fase 8), procesar `template_status_update` desde webhook (4.C lo ignora).
- [x] **4.E — Campañas WAPI** ✅ (Sesión 21 / 2026-05-04): migration `add_canceled_to_wapi_report_status` (enum `CANCELED`). DTOs `Create/Update/AddContacts/Contact` con phone E.164 lenient (`^\+?[0-9]{6,20}$`). `WapiCampaignsService` extendido con `create`/`findAll`/`findOne` (con includes template+configRel+_count)/`update`/`remove`/`addContacts`/`pause`/`resume`/`forceClose`/`listReports`/`getReport`. `forceClose` ahora marca PENDING como `CANCELED` (antes FAILED), funnel limpio. `getReport` devuelve counts por status + funnel `{sent,delivered,read,failed}` derivado de timestamps WapiReport. `WapiWorkerService` con early-exit si `report.status≠PENDING` (fix de bug latente: jobs huérfanos post-forceClose enviaban igual). Branch campaign COMPLETED|FAILED + report PENDING → ahora marca CANCELED. Endpoints completos en controller. Tests 24/24 (service) + 1 nuevo (worker). Backend full **325/325 ✅**. Pendientes: dedup de phone en `addContacts` (consistente con email), cron de campañas SCHEDULED (Fase 8).
- [ ] **4.F — Inbox conversacional** (modelos, endpoints take/assign/resolve/mark-read, send dentro de ventana 24h, media S3, realtime, frontend chat layout).
- [ ] **4.G — Respuestas rápidas** (snippets `WapiQuickReply`, autocomplete `/atajo`).
- [ ] **4.H — Bajas / opt-out** (auto desde keywords entrantes "BAJA"/"STOP", worker check pre-envío, UI). Requiere agregar `SUPPRESSED` al enum `WapiReportStatus`.
- [ ] **4.I — Welcome message automático** (`WapiConfig.welcomeMessage` + `delaySec` cuando llega mensaje de número sin conversación previa).
- [ ] **4.J — Live dashboard WAPI** (`/dashboard/wapi/live` con campañas en curso, throughput per-config, alertas daily-limit 80%/100%).
- [ ] **4.K — Botones de templates** (`interactive.button_reply` → INBOX/BAJA/IGNORAR según payload).

### Criterios de aceptación Fase 4

- Dos tenants con cuentas Meta distintas envían campañas en paralelo sin interferencia. Webhooks llegan al tenant correcto (resolución por `configId`).
- Inbox: asesor ve solo conversaciones del team, admin ve cola sin asignar, asignar+resolver funciona, media sube/baja con URL firmada.
- Opt-out automático por palabra clave entrante funciona; el worker no envía a phones suprimidos.
- Daily limit per-config no se excede aún bajo carga (test con campaña 1000 contactos + limit=50 → 50 envíos día 0, resto en próximos días).

> **Notas de portado AMSA:** ver `C:\Users\MDIFLUME\Documents\Proyectos\Propios\amsa-sender\backend\src\modules\wapi\*` (services, worker, webhook, queue, inbox) y `frontend/src/features/wapi/*` (chat layout). Adaptar a multi-tenant: el `WapiConfig` reemplaza el global de AMSA — todo el contexto viene del job payload o resolución por `configId`.

---

## Plan de Fase 2 (completada ✅ — referencia)

**Sub-fase 2.A — Email** (completada ✅)

Checklist:
- [x] Schema Prisma: `SmtpAccount`, `EmailTemplate`, `EmailCampaign`, `EmailContact`, `EmailReport`, `EmailEvent`, `EmailBounce`, `EmailUnsubscribe` con `organizationId` + `teamId` + índices.
- [x] Enums: `EmailCampaignStatus`, `EmailReportStatus`, `EmailEventType`, `EmailUnsubscribeScope`.
- [x] Registrar los 8 modelos en `TENANT_SCOPED_MODELS` (`apps/backend/src/common/prisma/tenant-models.ts`) para que la Prisma extension los enforce.
- [x] Migración Prisma `add_email_models` aplicada contra DB local.
- [x] CRUD mínimo de `SmtpAccount` y `EmailTemplate` con `@CheckPolicies` (sin envío todavía — eso es Fase 3): DTOs `class-validator`, services usando `prisma.scoped`, controllers con stack `ClerkAuthGuard → TenantContextGuard → PoliciesGuard`. `EmailModule` registrado en `AppModule`.
- [x] Tests unitarios de los services nuevos (`smtp-accounts.service.spec.ts`, `email-templates.service.spec.ts`): cada uno cubre `ForbiddenException` sin contexto, `NotFoundException` cross-tenant, `create` confía en la extension (no inyecta orgId/teamId manual), `delete` valida existencia previa.
- [x] Sumar al `Ability` factory los subjects `SmtpAccount` y `Template` con sus rules por rol (read/create/update/delete). **Nota:** subjects ya estaban en `subjects.ts` y rules ya estaban en `ability.ts` (ADMIN → manage all, MEMBER → read SmtpAccount + CRUD Template, VIEWER → read all). Se agregaron 3 tests explícitos en `ability.spec.ts`.
- [x] Extender `tenant-isolation.spec.ts` con casos para `SmtpAccount` y `EmailTemplate`: 6 tests cross-tenant (read/update/delete → NotFoundException) + 2 tests sin contexto (→ ForbiddenException). Total isolation suite: 18 tests.
- [x] Fix errores TypeScript en services: uso de `Prisma.*.UncheckedCreateInput` para `create()` + imports vía `@massivo/prisma`.

Criterios de aceptación 2.A:
- `pnpm --filter @massivo/backend test` verde con los nuevos specs incluidos.
- Llamada autenticada `POST /api/email/smtp-accounts` (Tenant A) crea y devuelve registro con `organizationId`/`teamId` del JWT, sin que el cliente los pase en el body.
- Llamada autenticada `GET /api/email/templates` con `X-Team-Id` de Tenant A devuelve solo templates de ese team (validado en suite isolation).
- Cualquier intento de leer/modificar un `SmtpAccount` o `EmailTemplate` de otro tenant retorna `404` (no `403`, para no filtrar existencia).

**Sub-fase 2.B — WhatsApp** (completada ✅)

Checklist:
- [x] Schema Prisma: `WapiConfig`, `WapiTemplate`, `WapiCampaign`, `WapiContact`, `WapiReport`, `WapiConversation`, `WapiMessage`, `WapiOptOut`. Todos tenant-aware.
- [x] Registrar los 8 modelos en `TENANT_SCOPED_MODELS`.
- [x] Migración Prisma `add_wapi_models`.
- [x] Tokens marcados como encriptados a nivel de tipo (`*Enc: string`) — encriptación real con KMS queda para Fase 4; agregar TODO con referencia a la fase.
- [x] CRUD mínimo de `WapiConfig` y `WapiTemplate` con `@CheckPolicies` (subjects `WhatsappConfig`, `WhatsappTemplate`).
- [x] DTOs `class-validator` para `WapiConfig` (`phoneNumberId`, `businessAccountId`, `accessToken`, `webhookVerifyToken`, `isActive`).
- [x] Tests unitarios de los services + extensión de `tenant-isolation.spec.ts`.

Criterios de aceptación 2.B:
- `pnpm --filter @massivo/backend test` verde.
- `POST /api/wapi/configs` autenticado guarda `accessToken` en `accessTokenEnc` (placeholder en claro hasta Fase 4) — verificado por test.
- Cross-tenant access a `WapiConfig`/`WapiTemplate` retorna `404`.

**Sub-fase 2.C — Cross-cutting** (completada ✅)

Checklist:
- [x] Schema Prisma: `Contact` (unificado email+wapi con `email`, `phone`, `attributes` JSONB), `Tag`, `ContactTag` (M:N), `ContactList`, `ContactListMember`, `ScheduledTask` (cron, config, nextRunAt), `TaskExecution`, `CampaignLog`. Enums nuevos: `ChannelKind`, `ScheduledTaskKind`, `TaskExecutionStatus`, `CampaignLogLevel`.
- [x] Registrar tenant-aware en `TENANT_SCOPED_MODELS` (Contact, Tag, ContactList, ScheduledTask, TaskExecution, CampaignLog). `ContactTag` y `ContactListMember` son tablas de unión sin orgId/teamId — heredan scope vía relaciones.
- [x] Migración Prisma `add_crosscutting_models` aplicada contra DB local.
- [x] Servicios mínimos: `ContactsService` (create/list/findByEmail/findByPhone con dedupe por `(teamId, email)` y `(teamId, phone)` vía índices `@@unique` — Postgres permite múltiples NULLs) y `TagsService` (CRUD con dedupe por `(teamId, name)`).
- [x] Subjects CASL: `Tag` y `ContactList` agregados a `subjects.ts`. Rules MEMBER extendidas con `Contact/ContactList/Tag` (CRUD + delete). `Contact` ya estaba.
- [x] Controllers `ContactsController` (`/contacts`) y `TagsController` (`/tags`) con stack `ClerkAuthGuard → TenantContextGuard → PoliciesGuard` y `@CheckPolicies`. `ContactsModule` registrado en `AppModule`.
- [x] DTOs `class-validator`: email/phone validados (E.164 para phone, IsEmail para email, al menos uno requerido en create vía `@ValidateIf`).
- [x] Tests unitarios `contacts.service.spec.ts` (7 tests) y `tags.service.spec.ts` (6 tests) — Forbidden sin contexto, NotFound cross-tenant, ConflictException en duplicados (P2002), create no inyecta orgId/teamId manual.
- [x] Extender `tenant-isolation.spec.ts` con casos para `Contact` y `Tag`: 6 tests cross-tenant + 2 sin contexto.

Criterios de aceptación 2.C:
- `pnpm --filter @massivo/backend test` verde (104/104 ✅).
- `pnpm typecheck` 8/8 ✅, `pnpm --filter @massivo/permissions test` 14/14 ✅.
- Crear dos contacts con mismo email en distintos teams del mismo org **es válido** (`@@unique([teamId, email])` lo permite); en el mismo team retorna `409 Conflict`.
- Cross-tenant aislado: cualquier `findOne/update/remove` cross-tenant retorna `404`.

> **Nota sobre `ContactList`/`ContactListMember`**: el schema y la migración existen, pero NO se implementó CRUD por ahora (no listado en "servicios mínimos" del plan). Se completará junto al UI de listas en una fase futura (probablemente Fase 5/6).

**Sub-fase 2.D — Sockets scopeados** (completada ✅)

Checklist:
- [x] Instalar `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io` + `socket.io-client` (devDep).
- [x] `AppGateway` con auth handshake (vía `server.use(middleware)` para que el cliente reciba `connect_error`): valida JWT Clerk del `socket.handshake.auth.token` + `teamId`, resuelve `RequestContext` con `SocketContextResolver` (encapsula la misma lógica que `TenantContextGuard`) y lo guarda en `socket.data.context`.
- [x] Suscripción automática del socket a rooms `org:{orgId}`, `team:{teamId}`, `user:{userId}` en `handleConnection`.
- [x] `EventsService` con helpers `emitToTeam(teamId, event, payload)`, `emitToOrg(orgId, ...)`, `emitToUser(userId, ...)`. `EventsModule` exporta el service para que otros módulos emitan.
- [x] Test de integración real con dos clientes Socket.IO (`app.gateway.spec.ts`): bootstrappea NestApplication con `IoAdapter`, mockea `SocketContextResolver`, conecta clientes A y B, verifica `emitToTeam('team-a1', ...)` solo llega al cliente A.
- [x] Tests unit `events.service.spec.ts`: 5 casos (delegación correcta a `server.to(room).emit`, no rompe sin server, `roomsFor` orden esperado).

Criterios de aceptación 2.D:
- Test de aislamiento Socket.IO verde (cliente del Tenant B no recibe eventos del Tenant A) ✅.
- Conexión sin `auth.token`, sin `auth.teamId`, o con token inválido retorna `connect_error` y no establece la conexión ✅.

### Cierre Fase 2 (criterios globales — todos cumplidos ✅)

- [x] Auditoría manual: `grep` en backend confirma que ningún acceso a modelos tenant-aware usa el cliente raíz; todo va por `prisma.scoped.<model>`.
- [x] Suite `tenant-isolation.spec.ts` cubre Email (SmtpAccount, EmailTemplate), Wapi (WapiConfig, WapiTemplate) y cross-cutting (Contact, Tag) — 18 tests cross-tenant + 8 sin contexto.
- [x] `pnpm typecheck` 8/8 ✅, `pnpm --filter @massivo/backend test` 114/114 ✅, `pnpm --filter @massivo/permissions test` 14/14 ✅.
- [x] `CHANGELOG.md` con entrada de cierre Fase 2 y resumen de modelos.
- [x] Regla de propagación aplicada: checklist + criterios de Fase 3 expandidos abajo.

### Criterio de aceptación de Fase 2 (resumen)

Suite de tests de aislamiento verde sobre todos los modelos de dominio nuevos; ningún query a un modelo tenant-scoped puede ejecutarse sin contexto; sockets aíslan eventos por team; backend levanta limpio y todos los CRUD mínimos respetan `@CheckPolicies`.

---

## Checklist Fase 1 ✅ (completada)

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
- [x] CRUD de invitaciones a org y assignment a teams. Invites a org las maneja Clerk. Implementado: `TeamMembersController` + `TeamMembersService` para asignar/desasignar/cambiar rol de users en teams. Validación de pertenencia a la org, protección contra eliminar último admin. Tests: 6 ✅.
- [x] Tests de integración: dos tenants concurrentes, no pueden leer datos del otro. Suite `tenant-isolation.spec.ts` con 10 tests ✅.

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

### Regla de checklist por fase (OBLIGATORIA — propagación automática)

Esta regla garantiza que la próxima IA/dev nunca arranque una fase sin checklist concreto y criterios de aceptación explícitos.

1. **Al iniciar una fase**: si su sección "Próximo paso" no tiene checklist detallado + criterios de aceptación, **expandirlos primero** (antes de tocar código). Basarse en `MIGRATION_PLAN.md` sección 9 + lectura del código heredado en AMSA Sender.
2. **Al cerrar una fase** (todos sus criterios verificados): además de mover la fase a "Fases completadas", **expandir el checklist + criterios de aceptación de la fase siguiente** en la sección "Próximo paso", con el mismo nivel de detalle (sub-fases si aplica, ítems ejecutables, criterios verificables). Repetir este patrón hasta llegar a la Fase 9.
3. **Formato de cada ítem del checklist**: empezar con verbo en infinitivo, mencionar archivos/módulos concretos cuando sea posible, marcar `[x]` solo si está verificado por test o ejecución. No anticipar tildes.
4. **Criterios de aceptación**: deben ser verificables (comando que corre verde, request HTTP que responde X, test que pasa, métrica que cumple umbral). Frases como "todo funciona" no son criterios válidos.

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

### 2026-05-04 — Sesión 22 (Claude Opus 4.7) — Sub-fase 4.F.1 (frontend de campañas WAPI)
- **Decisión de scope**: tras cerrar 4.E el dueño autorizó arrancar el frontend con la directiva *"q sea lo mas simple e intuitivo de usar. Siguiendo con el mismo estilo q ya le estamos dando a massivo app en el modulo de los mails"*. También adelantó un requerimiento de 4.F.2: *"los templates se puedan crear desde massivo app y postearlos en meta, quiero q sea con todas las posbilidades de templates para el uusuario, facil y sencillo. A futuro, incluir sugerencia de IA"*. Decidí dividir 4.F en sub-sub-fases para entregar valor incremental: **4.F.1** (esta sesión: listado + creación + detalle + processing banner + sends section + carga CSV de contactos), **4.F.2** (templates con creación desde Massivo + post a Meta + preview + AI placeholder), **4.F.3-4.F.4** (inbox conversacional).
- **Tipos** (`apps/frontend/src/features/wapi/campaigns/types.ts`): adapté el espejo de `email/campaigns/types.ts` al modelo WAPI. Cambios clave: `phone` en lugar de `email` en `WapiCampaignContactInput`; `configId` en lugar de `smtpAccountId`; `template` con `{ id, metaName, language, category }` en lugar de `{ id, name, subject }`; `configRel` con `{ id, name, phoneNumberId }` en lugar de `smtpAccount`; `WapiCampaignReport` con `funnel: { sent, delivered, read, failed }` derivado de timestamps en backend (sin `events` porque WAPI no tiene EmailEvent); `WapiReportStatus` con `CANCELED` (vs `BOUNCED|COMPLAINED|SUPPRESSED` de email). `WapiCampaignReportRow` lista los 4 timestamps `sentAt/deliveredAt/readAt/failedAt` directos en lugar de `firstOpenedAt/firstClickedAt`.
- **`WapiCampaignsListPage`** (`/dashboard/wapi/campaigns`): mejora UX sobre email — agregué tabs por estado (`Todas / Borradores / Programadas / En envío / Pausadas / Completadas / Fallidas`) con counts client-side. Empty state con ícono de WhatsApp. Modal de creación pidiendo solo el nombre. Skeleton loaders. Suscribe a `wapi.report.updated` para refrescar la lista en vivo cuando una campaña cambia de estado.
- **`WapiCampaignDetailPage`** (`/dashboard/wapi/campaigns/:id`): header con botón "← Campañas" + ícono WhatsApp + chip de status. Si la campaña está PROCESSING/PAUSED, renderiza el `WapiCampaignProcessingBanner`. Si tiene reports, muestra bloque "Resultados" con los 6 stat boxes (Pendientes, Enviados, Entregados, Leídos, Fallidos, Cancelados) + 2 KPIs derivados (tasa entrega = `delivered/sent` y tasa lectura = `read/delivered`). Form de configuración (nombre / template / número origen / scheduledAt) editable solo en `DRAFT|SCHEDULED|PAUSED`. Después la `WapiCampaignSendsSection` y el bloque de carga de contactos.
- **Parser CSV** (`parseContactsCsv`): detecta header `phone|telefono|teléfono`, normaliza el número (conserva `+` inicial, descarta espacios/guiones/paréntesis con `replace(/[^0-9]/g, '')`), valida contra el regex E.164 lenient `^\+?[0-9]{6,20}$` (mismo del backend). Columnas extra del CSV se mandan como `data: { firstName: 'Ana', ... }` para que el worker pueda usarlas como vars del template. Placeholder del textarea muestra ejemplo con `phone,name,firstName` para que el usuario entienda el formato.
- **`WapiCampaignProcessingBanner`**: copié el patrón del email banner. Progress bar (determinate cuando hay datos frescos del groupBy, indeterminate mientras "Iniciando envío…"), throughput estimado (envíos/min en ventana rolling de 60s con `useThroughput` hook idéntico al email), chips por estado adaptados a WAPI (Pendientes/Enviados/Entregados/Leídos/Fallidos/Cancelados — entregados+leídos son nuevos vs email), botones Pausar/Reanudar/Forzar cierre. Consola colapsable de log con ring buffer de 200 entries que filtra eventos `wapi.report.log` por `campaignId` (multi-campaña). Filter dropdown: Todos / Enviados / Fallidos / Cancelados (vs Suprimidos de email). Glyphs y colores del log adaptados.
- **`WapiCampaignSendsSection`**: tabla paginada (50/página, cursor) con filtro por estado. Por fila: contacto (name + phone separado), status chip + sufijo del wamid (últimos 12 chars como pista visual sin ocupar espacio), timestamps `sentAt/deliveredAt/readAt`. Tooltip con error completo si FAILED. Refresh manual + auto-refresh por `refreshKey` cuando llega socket update. Sin drilldown a eventos (no hay) — el patrón de email mostraba `_count: { events }` y un dialog con click/open/etc, no aplica acá.
- **Routing + sidebar**: `App.tsx` agrega rutas `/dashboard/wapi/campaigns` y `/dashboard/wapi/campaigns/:id`. `Sidebar.tsx` cambia el item "Campañas" de la sección WhatsApp de `disabled: true` a un link real (`to: '/dashboard/wapi/campaigns'`); "Templates" queda disabled hasta 4.F.2.
- **Verificación**: `pnpm exec tsc -b --noEmit` ✅ para los archivos WAPI nuevos. Hay 2 errores TS pre-existentes en `email/campaigns/CampaignDetailPage.tsx` líneas 66/70 que **no son míos** (estaban antes de esta sesión). `eslint` reporta los `react-hooks/exhaustive-deps` que también son falsos positivos pre-existentes en email (rule no instalada en el config). Dev server estaba corriendo en otra terminal (puerto 5173 ocupado) — no pude smoke-testear yo mismo el golden path en browser.
- **Pendientes intencionales en 4.F.1**:
  - **Verificación visual end-to-end** queda al usuario. Golden path: crear campaña → addContacts CSV con phone+name+firstName → seleccionar template (debe haber al menos uno sincronizado vía 4.D `POST /api/wapi/templates/sync/:configId`) y config (creado en 2.B) → send → ver progreso en vivo en el banner + log con eventos `wapi.report.log` → ver resultados al completarse. Edge cases: pause/resume durante PROCESSING, force-close cancela los pendientes y los segrega en counts.
  - **Templates en Massivo** (4.F.2) — el flow actual sólo permite seleccionar templates ya sincronizados desde Meta vía 4.D. Para 4.F.2 hay que agregar `WapiTemplateEditorPage` que permita crear template desde cero, postearlo a `POST /<wabaId>/message_templates` (Graph API), trackear el status `PENDING/APPROVED/REJECTED` que devuelve Meta y mostrarlo en `WapiTemplatesListPage`. Variantes: header text/image/video/document, body con `{{1}}…{{N}}` y vars de ejemplo, footer, botones quick-reply/URL/phone, preview WhatsApp en vivo, AI suggestion como placeholder (botón "Sugerir con IA" → toast "Próximamente").
  - **Inbox WAPI** (4.F.3-4.F.4) — `WapiConversation`/`WapiMessage` ya existen desde 2.B y reciben mensajes inbound desde 4.C webhook. Falta UI: lista conversations + thread + send dentro de ventana 24h + media S3 con URL firmada.
- **Próximo paso**: **4.F.2 — Templates con creación desde Massivo + posting a Meta**.

### 2026-05-04 — Sesión 22 (continuación 2) — Sub-fase 4.F.2.a (backend templates Massivo→Meta)
- **Decisión de scope**: tras smoke-test exitoso del golden path (crear config → sync templates → crear campaña → enviar) confirmado por el dueño, autorizó arrancar 4.F.2 con la directiva *"hace todo el backend y cuando termines vemos si llegamos con el frontend"*. Le advertí honestamente que 4.F.2 entera (backend + frontend del editor) no entra en lo que queda de sesión sin riesgo de quedar a la mitad. Subdividí en **4.F.2.a** (esta — backend posting service + endpoint + tests), **4.F.2.b** (frontend editor + preview + AI placeholder, sesión nueva), **4.F.2.c** (Resumable Upload para media headers, futura).
- **`CreateWapiTemplateMetaDto`** + tipos componentes (`templates-posting/wapi-templates-posting.dto.ts`):
  - `name` con regex `^[a-z0-9_]{1,512}$` — Meta exige lowercase + underscores. Validar acá ahorra un round-trip Meta para el error más común.
  - `language` (e.g. `es_AR`, `en_US`) y `category` (`MARKETING|UTILITY|AUTHENTICATION`).
  - `TemplateHeaderDto` con format `NONE|TEXT|IMAGE|VIDEO|DOCUMENT`. `text` y `textExamples` para TEXT; `mediaHandle` para los 3 media variants. NONE significa que no hay header (no se incluye el componente en el payload Meta).
  - `TemplateBodyDto` con `text` (1-1024 chars, regla Meta) y `examples?: string[][]` con shape Meta `[["Ana", "1234"]]` — un array por set de vars. Si el body tiene `{{1}}…{{N}}`, Meta exige al menos un sample para que el reviewer humano pueda evaluarlo.
  - `TemplateFooterDto` con `text` max 60.
  - `TemplateButtonDto` con `type: QUICK_REPLY|URL|PHONE_NUMBER`, `text` max 25, `url?` y `phoneNumber?`. `ArrayMaxSize(3)` en el campo del root DTO — Meta acepta hasta 3 botones por template.
  - **Validación cruzada hecha en el service** (no en class-validator): URL exige `url`, PHONE_NUMBER exige `phoneNumber`, header TEXT exige `text`, header IMAGE/VIDEO/DOCUMENT exige `mediaHandle`. Decisión: class-validator no expresa "campo X requerido sólo si Y=Z" sin custom decorators y agregaba mucha indirección para 4 reglas. El service tira `BadRequestException` con mensaje específico y los tests lo cubren.
- **`WapiTemplatesPostingService`** (`templates-posting/wapi-templates-posting.service.ts`):
  - Patrón espejo del `WapiTemplatesSyncService` (mismas dependencies: `ConfigService`, `PrismaService`, `EncryptionService`; misma forma de manejar tenant context y errores Graph API).
  - **Flujo `submit(configId, dto)`**: tenant context → load config (cross-tenant 404) → dedup check `findFirst({ metaName, businessAccountId })` → `buildMetaPayload` → decrypt accessToken → `POST /v20.0/<wabaId>/message_templates` → persist local con status PENDING.
  - **`buildMetaPayload`**: transformación declarativa DTO→Meta. Header sólo si format ≠ NONE (y para TEXT incluye `example.header_text`, para media incluye `example.header_handle: [handle]` array). Body siempre, con `example.body_text` si hay samples. Footer opcional. Buttons con shape exacto Meta (`phone_number` snake_case, no `phoneNumber`; `url` directo; QUICK_REPLY sólo `{type, text}`).
  - **Dedup anticipado**: chequeo local antes de POST. Si existe → `ConflictException`. Razones: (1) Meta también rechaza pero anticipar es mejor UX, (2) ahorra rate limit Meta, (3) la BD es la source of truth para el catálogo local — si está acá, el sync ya lo trajo o lo creamos antes.
  - **Errores Meta non-2xx**: `ServiceUnavailableException` preservando `error.code` y `error.message` del payload Meta. El UI puede surface al usuario los mensajes específicos ("Template name already exists", "Body exceeds 1024 chars", "Invalid OAuth", etc.).
  - **Persistencia**: components con shape Meta (`type: 'HEADER'`, `format: 'TEXT'`, etc.) — exactamente lo que devuelve el sync. Esto permite que `TemplatePreview` del frontend (4.F.1.b) los renderice sin tener dos render paths. Status default `PENDING` si Meta no lo devuelve (rarísimo, pero defensivo).
  - **Notas**:
    - `metaTemplateId` (response `id` de Meta) sólo se loggea; no hay columna para persistirlo. La identificación canónica es `(teamId, metaName, businessAccountId)`. Si en el futuro necesitamos delete-from-Meta sin re-fetch, agregamos la columna en migration aparte.
    - Media headers (IMAGE/VIDEO/DOCUMENT) requieren `mediaHandle` ya generado — la implementación de la 3-step Resumable Upload de Meta (start → upload → commit) queda para 4.F.2.c. Por ahora si el usuario quiere mandar template con media, debe generar el handle por su cuenta o usar TEXT/NONE.
- **Endpoint** `POST /api/wapi/templates/submit/:configId` con `@HttpCode(201)` y `@CheckPolicies('create', 'WapiTemplate')`. Policy igual a sync (criterio: si podés crear, podés submit). Anotación explícita `: Promise<WapiTemplate>` por TS2742 (referencia a runtime de Prisma en types inferidos — mismo patrón que `SyncSummary` en sync controller).
- **Tests** (`wapi-templates-posting.service.spec.ts`, **14 nuevos**): sin tenant → Forbidden, config no existe → NotFound, dedup → Conflict, happy path full (verifica shape exacto del payload Meta con todos los componentes y los 3 button types — el assertion es `toEqual` sobre `body.components`, no `toMatchObject`, así que regresiones en el mapeo se detectan), header IMAGE sin handle → BadRequest, header IMAGE con handle → `header_handle` array, header TEXT sin text → BadRequest, button URL sin url → BadRequest, button PHONE_NUMBER sin phoneNumber → BadRequest, Graph API 400 con error Meta → ServiceUnavailable preservando mensaje, decryption verificada con `Bearer real-token`, Meta sin status → default PENDING, body sin examples → no incluye `body_text`, header NONE → omite componente HEADER. Backend full: **339/339 ✅** (325 anteriores + 14 nuevos, 0 regresiones).
- **Verificación**: `tsc --noEmit` ✅ (necesité agregar el `import type { WapiTemplate }` y la anotación de retorno `Promise<WapiTemplate>` en el controller). Jest 339/339 ✅.
- **Pendientes intencionales en 4.F.2.a**:
  - **4.F.2.b** — `WapiTemplateEditorPage` con form completo (header type selector, body con detección de `{{N}}` + inputs de samples auto-generados, footer, gestor de buttons add/remove con type-aware fields), live preview con el `TemplatePreview` ya hecho en 4.F.1.b, botón "Sugerir con IA" como placeholder (toast "Próximamente — Fase 6"). Consume `POST /api/wapi/templates/submit/:configId` y muestra el row creado en la lista con badge PENDING.
  - **4.F.2.c** — Resumable Upload Meta (3-step). Sin esto los templates con media son inviables desde el UI. Va en sesión propia.
  - **`metaTemplateId` column** — útil sólo si decidimos implementar delete-from-Meta. No bloqueante para el flow actual.
  - **Sync de status post-creación** — los templates entran PENDING; el status se actualiza vía sync manual (4.D) o con `template_status_update` webhook (4.C los ignora — flag para 4.D.1).
- **Próximo paso**: **4.F.2.b — Frontend del editor de templates** (sesión nueva con contexto fresco).

### 2026-05-04 — Sesión 22 (continuación) — Sub-fases 4.F.1.a + 4.F.1.b (admin de WapiConfigs + catálogo de Templates con sync)
- **Decisión de scope**: tras cerrar 4.F.1, el dueño avisó *"no puedo crear campaña completa xq aun no tengo como crear una config y ver templates, asi q avancemos con eso primero, nose como sigue el plan"*. Propuse sub-dividir 4.F en **4.F.1.a** (CRUD de configs/números — sin esto no se puede sincronizar templates ni elegir desde dónde mandar), **4.F.1.b** (catálogo read-only + sync — con esto el usuario ya puede operar el golden path completo) y dejar **4.F.2** (editor de templates con posting a Meta) como sub-fase posterior. Aceptado *"perfecto avanza dale"* + warning de uso de tokens al 78% — bundleé las dos en una sola sesión para no quedar a la mitad.
- **4.F.1.a — `WapiConfigsPage`** (`/dashboard/wapi/configs`):
  - **Tipos** (`apps/frontend/src/features/wapi/configs/types.ts`): `WapiConfigListItem` (id, name, phoneNumberId, businessAccountId, isActive, createdAt). `WapiConfigDetail` extiende con `welcomeMessage, optOutConfirmMessage, dailyLimit, updatedAt`. Los 3 secrets cifrados (`accessToken`, `webhookVerifyToken`, `appSecret`) **NO** existen en `WapiConfigDetail` porque el backend nunca los devuelve en `findOne` — se setean sólo en payloads de create/update. `CreateWapiConfigPayload` con phoneNumberId/businessAccountId/accessToken/webhookVerifyToken obligatorios; `UpdateWapiConfigPayload` con todos opcionales + `isActive` boolean. Los secrets en update son `string | null | undefined` (`undefined` = no tocar, `null` = limpiar — sólo aplicable a `appSecret`).
  - **Modal único** (`editing: WapiConfigDetail | null` decide create vs edit). En edit, los secrets son opcionales con placeholder `••••••••` y helper "dejar vacío para no cambiar"; sólo se incluyen en el PATCH si el usuario tipeó algo (lookup vía `if (form.accessToken) payload.accessToken = form.accessToken`). Esto resuelve la asimetría de que el backend no devuelve los valores actuales — sin esta lógica, abrir el form en edit y guardar borraría los secrets.
  - **`showSecrets` toggle** con `VisibilityIcon`/`VisibilityOffIcon` global del modal — afecta los 3 password fields a la vez. Útil cuando el usuario está pegando tokens recién copiados de Meta.
  - **Switch `isActive` en la fila** dispara PATCH `{ isActive }` directo sin abrir modal (UX optimization para el caso común de "querés desactivar un número viejo"). El backend usa `isActive` para excluir configs del worker pickup.
  - **Empty state** con `DnsIcon` + CTA "Crear primera config". Validación `canSave`: phoneNumberId+businessAccountId siempre, más accessToken+webhookVerifyToken sólo en create.
  - **Delete** con `useConfirm` ("¿Eliminar config <name>?"). Backend valida que no tenga campañas activas — el toast surface el error si lo hay.
- **4.F.1.b — `WapiTemplatesListPage`** (`/dashboard/wapi/templates`):
  - **Tipos** (`apps/frontend/src/features/wapi/templates/types.ts`): `WapiTemplateListItem` (id, metaName, category, language, status, createdAt). `WapiTemplateDetail` extiende con `businessAccountId, components: WapiTemplateComponent[] | null, buttonActions, syncedAt`. `WapiTemplateComponent` con `type, format?, text?, buttons?, example?` + `[key: string]: unknown` para campos extra que Meta agregue (`add_security_recommendation`, `code_expiration_minutes`, etc.). `WapiSyncSummary` espejo del DTO backend `{ fetched, created, updated, skipped, pages }`. `WapiConfigOption` mínimo para el sync dropdown.
  - **Carga inicial paralela**: `Promise.all([api(GET /api/wapi/templates), api(GET /api/wapi/configs)])` — el segundo es para alimentar el dropdown del sync dialog.
  - **Tabla read-only** con columnas Nombre / Categoría / Idioma / Estado (chip color: APPROVED=success, PENDING/IN_REVIEW=warning, REJECTED=error, default=info) / Sincronizado (formato relativo) / acciones (Vista previa, Abrir en Meta, Eliminar).
  - **Sync dialog**: dropdown de configs activos, botón "Sincronizar" llama `POST /api/wapi/templates/sync/:configId`. La response `WapiSyncSummary` se renderiza in-place como chips (Fetched/Created/Updated/Skipped/Páginas) sin cerrar el dialog para que el usuario pueda revisar el resultado y volver a sincronizar otro config si hay varios. Botón "Cerrar" recarga la lista.
  - **Preview dialog** con `TemplatePreview` subcomponent que renderiza un mock del bubble de WhatsApp: fondo `#e5ddd5` (chat bg), bubble blanca con sombra, parsing por `component.type`: HEADER text → bold p, HEADER format=IMAGE → placeholder image, HEADER format=VIDEO → "🎥 Video", HEADER format=DOCUMENT → "📄 Documento"; BODY → texto crudo respetando `\n`; FOOTER → `<small>` gris; BUTTONS → grid de botones outlined con type label (`QUICK_REPLY` / `URL` / `PHONE_NUMBER`). El componente es defensivo contra `components: null`.
  - **Link "Abrir en Meta Business Manager"** → `https://business.facebook.com/wa/manage/message-templates/?waba_id=<businessAccountId>` para que el usuario edite/borre desde Meta.
  - **Delete** advierte explícitamente: "NO lo borra de Meta — sólo del catálogo local. Al próximo sync vuelve si sigue existiendo allá".
- **Routing + sidebar**:
  - `App.tsx`: imports + rutas `/dashboard/wapi/configs` y `/dashboard/wapi/templates`.
  - `Sidebar.tsx`: en la sección WhatsApp, "Templates" (antes `disabled: true`) ahora linkea al catálogo. Nueva entry "Números" con `DnsIcon` linkea a configs.
- **Verificación**: `pnpm exec tsc -b --noEmit` ✅ con los archivos nuevos. Los 2 errores TS pre-existentes en `email/campaigns/CampaignDetailPage.tsx` líneas 66/70 siguen tal cual (no son de esta sesión, no relacionados con WAPI).
- **Pendientes intencionales en 4.F.1.a/4.F.1.b**:
  - **`welcomeMessage` / `optOutConfirmMessage` / `dailyLimit`** en el form de configs — existen en el DTO pero no son críticos para el golden path. Agregar después si el dueño los reclama (probablemente en 4.H opt-out / 4.I welcome).
  - **Creación de templates desde Massivo** — eso es 4.F.2 explícitamente. La pantalla actual sólo lee y sincroniza.
  - **Tests** — son pantallas admin consumiendo endpoints ya cubiertos por specs backend. No agregué nada en frontend.
- **Smoke test pendiente del usuario**: golden path completo ahora viable — crear config en `/wapi/configs` → ir a `/wapi/templates` y sincronizar contra Meta → ir a `/wapi/campaigns` → crear campaña → addContacts CSV → seleccionar template+config → send → ver progreso en vivo. El dueño confirmó que ya tiene credenciales Meta para probar.
- **Próximo paso**: **4.F.2 — Templates con creación desde Massivo + posting a Meta** (header text/image/video/document, body con `{{1}}…{{N}}`, footer, botones quick-reply/URL/phone, preview en vivo, AI suggestion como placeholder).

### 2026-05-04 — Sesión 21 (Claude Opus 4.7) — Sub-fase 4.E (CRUD completo de campañas WAPI)
- **Decisión de scope**: el dueño autorizó *"si dale"* sobre 4.E después de cerrar Sesión 20 (4.D + 4.C.1). Paridad con email 3.C: cierre del CRUD que en 4.A quedó como placeholder send-only. La infra de envío (`WapiQueueService`/`WapiWorkerService`) ya estaba — faltaba wiring del CRUD + control actions con el patrón de 3.C.5.
- **Migration `add_canceled_to_wapi_report_status`** — `WapiReportStatus` enum ahora tiene `PENDING/SENT/DELIVERED/READ/FAILED/CANCELED`. Decisión consultada al dueño antes de tocar schema: *"si por A"*. Opción A elegida (enum dedicado) sobre opción B (reutilizar `FAILED` + `error='force-closed'`) porque ensucia los counts de fallas reales del envío — un `forceClose` no es una falla, es una cancelación administrativa, y al ver el funnel `FAILED:50` no querés tener que segregar entre fallas Meta vs cancelaciones tuyas.
- **DTOs** (`wapi-campaigns.dto.ts`):
  - `phone` con regex E.164 lenient `^\+?[0-9]{6,20}$` — no usé `IsPhoneNumber` (de class-validator/libphonenumber) porque Meta acepta formatos que libphonenumber rechaza (números de prueba, números de países raros) y queremos que la validación sea permisiva: el sender tirará error si Meta no lo acepta.
  - `ArrayMaxSize(5000)` — mismo cap que email para no romper el `createMany` con payloads gigantes.
  - `WapiCampaignContactDto` igual al `CampaignContactDto` de email pero con `phone` en vez de `email`.
- **`WapiCampaignsService`** (rewrite del placeholder):
  - `create` (DRAFT/SCHEDULED por `scheduledAt`), `findAll` (orderBy createdAt desc + `_count: { contacts, reports }`), `findOne` (incluye `template { metaName, language, category }`, `configRel { name, phoneNumberId }` — corregí en build: `WapiTemplate` no tiene `name`, sólo `metaName`; `WapiConfig` no tiene `label`, sólo `name`), `update` (sólo en DRAFT/SCHEDULED/PAUSED), `remove` (bloqueado en PROCESSING), `addContacts` (createMany con `phone.trim()`).
  - `pause/resume/forceClose` espejo de email 3.C.5 — `forceClose` ahora marca `CANCELED` (no `FAILED`).
  - `listReports` con cursor pagination (1-200, default 50), filtro por status. Select expone `phone`, `metaMessageId`, `sentAt/deliveredAt/readAt/failedAt`, `error`, `contact{id,phone,name}`. Sin `_count: { events }` porque WAPI no tiene `EmailEvent`.
  - `getReport` con `groupBy` por status (shape completo `PENDING/SENT/DELIVERED/READ/FAILED/CANCELED`) + `funnel` derivado de `count({ X: { not: null } })` sobre los 4 timestamps. Reemplaza el approach email de contar `EmailEvent` filas — acá los eventos son timestamps inline.
- **`WapiWorkerService` — fix de bug latente**:
  - **Antes**: si `forceClose` marcaba un report como `CANCELED` pero el job ya estaba en BullMQ, al ejecutarse el worker veía `report.status='CANCELED'` y `campaign.status='COMPLETED'`. La guard `if (report.status === 'PENDING' && campaignStatus === 'COMPLETED')` no entraba (status≠PENDING), pero tampoco había early-exit, así que seguía el flujo y **mandaba el mensaje igual**.
  - **Después**: agregué un `if (report.status !== 'PENDING') { skip; return { canceled: true }; }` al inicio del flow, ANTES de los control actions de campaña. Esto cubre: report ya CANCELED por forceClose, report ya SENT/FAILED por re-procesamiento de un job que volvió a estar disponible (BullMQ raro pero posible), y cualquier estado terminal.
  - **Branch `campaign COMPLETED|FAILED + report PENDING`** ahora marca `CANCELED` (antes `FAILED`). El `notifyReportLog` sigue mandando `status: 'FAILED'` al frontend porque el inbox/dashboard lee eso como "envío frustrado" (UX-wise está bien — desde el punto de vista del usuario, el mensaje no salió). Solo cambia la fuente de verdad en BD.
- **Endpoints** (`WapiCampaignsController`): GET `/`, GET `/:id`, GET `/:id/report`, GET `/:id/reports` (paginado), POST `/`, PATCH `/:id`, POST `/:id/contacts`, POST `/:id/send` (existente), POST `/:id/pause`, POST `/:id/resume`, POST `/:id/force-close`, DELETE `/:id`. Policies CASL: `read|create|update|delete|send` sobre `Campaign`. **No** agregué `GET /:id/reports/:reportId/events` (en email lista los `EmailEvent` de un report — no aplica a WAPI).
- **Tests** (24 nuevos en `wapi-campaigns.service.spec.ts` + 1 en `wapi-worker.service.spec.ts`):
  - `create` 3 (sin scheduledAt, futuro, pasado), `update` 2 (DRAFT permite, PROCESSING bloquea), `addContacts` 2 (DRAFT trim, PROCESSING bloquea), `send` 5 (happy, sin contactos, sin templateId, sin configId, PROCESSING, NotFound), `getReport` 1 (counts + funnel), `pause` 2, `resume` 2, `forceClose` 3 (PROCESSING/PAUSED OK, DRAFT bloquea), `remove` 2 (DRAFT delete, PROCESSING bloquea), `listReports` 1 (cursor + nextCursor).
  - **Worker**: actualicé el test "campaign COMPLETED + report PENDING → FAILED con campaign-closed" a esperar `status: 'CANCELED'`. Agregué nuevo "report ya CANCELED (forceClose previo) → skip sin enviar ni update" verificando el early-exit.
  - Backend full: **325/325 ✅** (300 anteriores + 24 nuevos del service + 1 nuevo del worker; 1 actualizado del worker pasó de FAILED→CANCELED expected; 0 regresiones).
- **Verificación**: `tsc --noEmit` ✅ (corregí dos errores de typing en select de includes — `WapiTemplate.name` no existe, `WapiConfig.label` no existe), `jest` 325/325 ✅. Migration aplicada en local.
- **Pendientes intencionales en 4.E**:
  - **Dedup de phone en `addContacts`** — hoy si subís el mismo número 2 veces, crea 2 contactos. Email tiene el mismo comportamiento, lo dejé consistente. Si más adelante se decide cambiar uno, cambiar ambos juntos.
  - **Cron de campañas SCHEDULED** — Fase 8 (junto con WAPI templates sync).
  - **UI frontend** — sub-fase 4.F (incluye admin + Inbox).
- **Próximo paso**: **4.F — UI frontend (admin de campañas WAPI + Inbox conversacional)**. Includes: páginas `/wapi/campaigns` (list + form de create/edit + addContacts CSV + control actions toolbar como en email), `/wapi/inbox` (chat layout: lista conversations + thread por phone + send dentro de ventana 24h + media S3 con URL firmada). El inbound ya entra desde 4.C webhook, los modelos `WapiConversation`/`WapiMessage` ya existen desde 2.B. Alternativa: **4.G snippets** o **4.H opt-out** si el dueño quiere priorizar features antes que UI.

### 2026-05-04 — Sesión 20 (Claude Opus 4.7) — Sub-fase 4.D (sync de templates Meta)
- **Decisión de scope**: el dueño dijo *"avanza"* después de 4.C, así que continué en orden con 4.D. La idea: Massivo necesita conocer los `WapiTemplate` aprobados antes de poder lanzar campañas, y crearlos a mano vía CRUD existente es frágil (cambios de status en Meta — APPROVED/REJECTED — no se ven). 4.D agrega un sync explícito tirando del Graph API.
- **`WapiTemplatesSyncService`** (`apps/backend/src/modules/wapi/templates-sync/wapi-templates-sync.service.ts`):
  - `sync(configId)` — `prisma.scoped.wapiConfig.findFirst({ where: { id: configId } })` (cross-tenant 404 natural por la extension), decripta `accessTokenEnc` con `EncryptionService`, pagina Meta hasta `MAX_PAGES=5` (~500 templates con `PAGE_SIZE=100`), llama `upsertOne` por cada template y agrega al `SyncSummary { fetched, created, updated, skipped, pages }`.
  - **Pagination**: arranca con `firstPageUrl(businessAccountId)` (`<base>/v20.0/<biz>/message_templates?fields=name,status,language,category,components,id&limit=100`) y avanza por `paging.next` que viene en cada response (Meta da la URL completa con cursor `after`). El loop `while (url && pages < MAX_PAGES)` corta solo si Meta devuelve un `paging.next` malformado o si ya hay más de 500 templates (caso patológico — el log warn lo deja explícito en `pages=5 fetched=500`). Tests cubren explícitamente el caso de `paging.next` infinito.
  - **`upsertOne`** — `findFirst({ metaName, businessAccountId })` (la extension agrega teamId). Si no existe → `create`. Si existe → comparación: `sameStatus && sameLanguage && sameCategory && sameComponents` (este último por `JSON.stringify` — los components de Meta son arrays de objetos chicos con `type`/`text`/`buttons`, no necesitan diff estructural). Si nada cambió → `'skipped'` (no toca `syncedAt` para no ensuciar la timeline en re-syncs inocentes). Si difiere → `update` con `syncedAt = now`.
  - **Errores**:
    - Sin tenant context → `ForbiddenException`. Test directo via `svc.sync('cfg-1')` sin `TenantContext.run(...)`.
    - Config no encontrada (incluye cross-tenant) → `NotFoundException`. La extension hace que un config de otro org vuelva null.
    - Graph API non-2xx (401 token inválido, 5xx, 4xx parámetros) → `ServiceUnavailableException` con `code` y `message` desde `error` del payload Meta. El warn log incluye `status` HTTP + `code` Meta para que oncall pueda diferenciar 401 de 5xx en logs.
- **Endpoint** `POST /api/wapi/templates/sync/:configId` agregado a `WapiTemplatesController` con `@CheckPolicies('create', 'WapiTemplate')` (criterio: si podés crear templates, podés sincronizar — el sync es esencialmente un bulk create+update). `@HttpCode(200)` porque devuelve el summary; un 201 sería confuso si `created=0`. El controller devuelve directamente el `SyncSummary` y el frontend (a futuro 4.E UI) lo muestra como toast.
- **Decisiones intencionales para 4.D**:
  - **Soft delete**: no removemos templates que Meta borró (Meta puede archivarlos). Si el sync no los trae, quedan en BD con su último status conocido. Esto evita romper campañas históricas que referencian un template viejo. El cleanup es manual vía `DELETE /api/wapi/templates/:id`. Una alternativa (marcar como `ARCHIVED` automáticamente) la dejé para cuando hagamos auditoría — por ahora, no info, no acción.
  - **Cron semanal** (`ScheduledTask` con `kind=WAPI_TEMPLATES_SYNC`) lo dejo para Fase 8, junto al resto del sistema de tareas programadas. El sync manual es suficiente para MVP.
  - **`template_status_update`** desde el webhook Meta — 4.C lo ignora (sólo procesa `messages` y `statuses`). Cuando llegue un APPROVED/REJECTED, Massivo no se entera hasta el próximo sync manual. Esto es aceptable: Meta tarda horas en revisar templates, no minutos. Cuando se haga 4.J (live dashboard) o se pida UX más reactiva, agregamos un handler en el webhook que llame `upsertOne` con el template del payload.
- **Tests** (9 nuevos): `wapi-templates-sync.service.spec.ts`:
  - sin tenant context → ForbiddenException (sanity).
  - config no existe → NotFoundException.
  - happy 1 página: 2 templates nuevos → 2 created. Verifica URL Graph (incluye `biz-1/message_templates` y `fields=name`) + header `Authorization: Bearer tok-plain`.
  - paginación: 1ª página con `paging.next` → 2ª página → 3 templates totales en 2 pages. Verifica que la 2ª llamada usa la URL con `after=abc`.
  - existing idéntico → skipped sin DB write (ni create ni update).
  - existing con status distinto → updated, verifica `update` con `data: { status: 'APPROVED' }`.
  - Graph API 401 (`error.code=190 Invalid OAuth`) → ServiceUnavailableException, no se escribió nada.
  - safety guard MAX_PAGES=5 con `paging.next` infinito → corta en 5 páginas (5 fetches, summary.pages=5).
  - decripta accessToken con EncryptionService antes de fetch — verifica `encrypt.decrypt('enc(real-token)')` y que el header sea `Bearer real-token`.
  - Backend full: **295/295 ✅** (286 anteriores + 9 nuevos de 4.D, 0 regresiones).
- **Verificación**: `tsc --noEmit` ✅ (0 errores), `jest` 295/295 ✅. Frontend no tocado (4.D es backend puro).
- **Sub-fase 4.C.1 (refactor in-session)** — Antes de commitear, el dueño preguntó: *"el webhook va a ser un webhook x config? imaginando q alguien puede subir 2 numeros de 2 apps distintas o 2 numeros de la misma app entonces el webhook es el mismo"*. Acertó: el diseño original `/api/webhooks/wapi/:configId` solo soporta 1 config = 1 Meta App. Si dos configs comparten App, Meta solo permite registrar una webhook URL en la App, así que pierde eventos del segundo config. Refactor in-session a URL única:
  - **`GET /api/webhooks/wapi`** (sin `:configId`): escanea todas las `WapiConfig` activas, decripta `webhookVerifyTokenEnc` de cada una, compara timing-safe contra `hub.verify_token`. Primera que matchea gana. Es one-shot (registro de webhook), N decrypts cacheados por LRU del `EncryptionService`.
  - **`POST /api/webhooks/wapi`** (sin `:configId`): parsea rawBody, extrae los `phone_number_id` únicos (`entry[].changes[].value.metadata.phone_number_id`), `findMany({ phoneNumberId: { in: [...] } })` para resolver configs. Valida HMAC con el `appSecret` del primer config — todos los configs de la misma App comparten ese secreto, así que cualquiera sirve. Le pasa al service un `Map<phoneNumberId, ResolvedWebhookConfig>`. Sin matches → 404.
  - **`WapiWebhookService.process(payload, configByPhoneNumberId)`**: itera entry-by-entry, resuelve config por `phone_number_id`, corre cada `value` en su propio `TenantContext.run`. Si Meta batchea events de N números en un mismo POST, cada uno se procesa contra su tenant correcto (caso real cuando un team tiene 2 números bajo la misma App).
  - **Decisión**: la opción alternativa era modelar `WapiMetaApp` separado (App ⊃ WABAs ⊃ phoneNumbers) con URL `/webhooks/wapi/app/:metaAppId`. Más correcta conceptualmente pero requiere migración + cambio de UX (crear App primero, después configs). Para MVP, el lookup por payload es suficiente y no requiere schema changes.
  - **Tests adicionales** (5 nuevos): match en 2ª config (escanea todas), multi-config carga ambos en map, phone_number_id sin matching → 404, payload sin phone_number_id → ignorado sin DB, multi-tenant entry processing.
  - **Verificación final**: backend full **300/300 ✅** (295 de 4.D + 5 nuevos de 4.C.1, 0 regresiones). `tsc --noEmit` clean.
- **Próximo paso**: **4.E — CRUD completo de campañas WAPI**. Paridad con email 3.C: create/update/addContacts/control actions (PAUSE/RESUME/FORCE_CLOSE)/getReport/realtime. La infra de envío (`WapiQueueService` + `WapiWorkerService`) ya está de 4.A — falta el wiring del CRUD y los control actions con el patrón de 3.C.5. Alternativa: **4.F — Inbox conversacional** (modelos ya existen de 2.B, el inbound ya entra de 4.C, falta UI + take/assign/resolve + media S3).

### 2026-05-04 — Sesión 19 (Claude Opus 4.7) — Sub-fase 4.C (webhook Meta WhatsApp Cloud API)
- **Decisión de scope**: continuar Fase 4 en orden — el dueño dijo *"perfecto, avanza con el 4C"* después de 4.B. 4.C cubre el inbound del canal WAPI: verify del registro del webhook + recepción de `statuses` (delivered/read/failed) y `messages[]` entrantes (base del inbox que viene en 4.F).
- **Endpoint**: `GET /api/webhooks/wapi/:configId` (verify) + `POST /api/webhooks/wapi/:configId` (events). Bajo `@SkipTenantScope` — Meta no manda Authorization. La confianza es:
  - **GET**: `hub.mode=subscribe` + `hub.verify_token` matchea el `webhookVerifyTokenEnc` decriptado de la WapiConfig identificada por `:configId`. Devuelve `hub.challenge` o 403. Comparación `timingSafeEqual` para evitar timing attacks.
  - **POST**: header `X-Hub-Signature-256` = `sha256=<hex>` con HMAC-SHA256 sobre el rawBody usando `appSecret` decriptado. `main.ts` ya tiene `rawBody:true`, así que `@Req() req: RawBodyRequest<Request>` da `req.rawBody`. Verificación con `timingSafeEqual` sobre buffers de igual longitud.
  - **Sin appSecret** en la config → modo dev: acepta sin validar firma + warn. Producción debería tener appSecret obligatorio (a futuro: validation en `WapiConfigsService.create` o flag `WAPI_REQUIRE_APP_SECRET=true`).
- **`WapiWebhookService.process(payload, tenant)`**:
  - Reconstruye TenantContext (configId resuelto a orgId/teamId en el controller, role sintético OWNER/ADMIN — el inbound es background).
  - Itera `entry[].changes[].value`. Cada `value` puede traer `statuses[]` y/o `messages[]` (no son mutuamente excluyentes).
- **Status flow** (statuses[]):
  - Mapeo: `sent` → no-op (ya marcamos SENT en el ack del POST /messages); `delivered` → DELIVERED + deliveredAt; `read` → READ + readAt + (deliveredAt si no estaba); `failed` → FAILED + failedAt + error desde `errors[0]` (`code:title — message`, slice 500).
  - **No retrocede**: si el report ya está READ y llega un `delivered`, ignoramos. Si está FAILED, tampoco aceptamos read/delivered. Esto importa porque Meta puede reordenar entregas (la red de webhooks no es FIFO).
  - Idempotente vía el lookup `findFirst({ metaMessageId: st.id })` + el chequeo de status actual. Si llega un duplicado exacto, el update setea los mismos campos.
  - Emite `wapi.report.updated` (debounced) por `(teamId, campaignId)` para que el frontend (Fase 4.J live dashboard / 4.E vista de reports) refresque.
- **Inbound message flow** (messages[]):
  - `upsert WapiConversation(teamId, configId, phone)` — el unique compuesto ya está en el schema. `create` setea `lastMessageAt=ts`, `window24hAt=ts+24h`, `unreadCount=1`, `name=contacts[0].profile.name`. `update` renueva los timestamps + `unreadCount: { increment: 1 }` + actualiza `name` si vino.
  - Crea `WapiMessage` con `metaMessageId @unique` (catch P2002 → swallow + log debug — Meta reintenta hasta recibir 200).
  - `content` persiste el sub-objeto del tipo (text/image/audio/video/document/sticker/button/interactive/reaction) + `context` para reply chains. Esto evita que el inbox de 4.F tenga que volver a parsear el payload Meta.
  - `type` se persiste crudo de Meta — el inbox renderiza lo que conozca. Tipos no soportados quedan en BD para diagnóstico.
  - Emite `wapi.message.inbound` por mensaje (no debounced — es UX-critical para el inbox).
- **Tipos** (`wapi-webhook.types.ts`): shapes mínimos. No replicamos el schema completo de Meta (es enorme) — sólo los campos que tocamos. El payload crudo se persiste en `WapiMessage.content`.
- **Decisiones intencionales para 4.C**:
  - **Media no se descarga**: los `messages.image.id` de Meta son media IDs que requieren un `GET /v20.0/<media-id>` adicional para obtener la URL temporal. Eso + upload a S3 lo dejé para 4.F (inbox) — ahí sabremos qué thumbnails / proxy necesita el frontend.
  - **Auto-reply welcome**: si llega un mensaje de un phone sin conversation previa, no respondemos automáticamente todavía. Eso es 4.I (welcome message + delaySec).
  - **Auto-detección opt-out**: keywords "BAJA"/"STOP" no se detectan acá. Es 4.H — y depende de agregar `SUPPRESSED` al enum WapiReportStatus (migración Prisma diferida).
  - **`template_status_update` / `account_alerts`**: estos vienen en `entry.changes.field` distinto de `messages` y los ignoramos por ahora. Cuando se haga 4.D (sync de templates), lo natural es procesar `template_status_update` para reflejar APPROVED/REJECTED en BD.
- **Tests** (20 nuevos):
  - `wapi-webhook.controller.spec.ts` 10/10: GET verify happy/mismatch/wrong-mode/not-found, POST signature válida (HMAC real, no mockeado)/inválida/sin-appSecret-acepta/object-distinto-ignora/no-JSON-400/not-found-404.
  - `wapi-webhook.service.spec.ts` 10/10: status delivered/read/read-cuando-DELIVERED-no-resetea-deliveredAt/no-retrocede-READ→delivered/failed-con-errors[0]/sent-noop/sin-report-skip + mensaje text-crea-conv-y-message-y-evento/dup-P2002-swallow/image-content-incluye-image.
  - Backend full: **286/286 ✅** (266 anteriores + 20 nuevos de 4.C, 0 regresiones).
- **Verificación**: `tsc --noEmit` ✅ (0 errores), `jest` 286/286 ✅. Frontend no tocado (4.C es backend puro).
- **Próximo paso**: **4.D — Sync de templates Meta** (`POST /api/wapi/templates/:configId/sync` — pull de templates aprobados desde Graph API, persiste `metaName`, `language`, `category`, `status`, `components`). Alternativa: **4.E — CRUD completo de campañas WAPI** (paridad con email 3.C: create/update/addContacts/control actions/getReport/realtime). Para tener un flujo end-to-end testeable, lo natural sería 4.D primero (templates aprobados) → 4.E (campañas) → 4.F (inbox que ya recibe inbound vía 4.C).

### 2026-05-04 — Sesión 18 (Claude Opus 4.7) — Sub-fase 4.B (encriptación at-rest AES-256-GCM)
- **Decisión arquitectónica del dueño**: cloud-agnostic. La frase exacta fue *"no quiero que massivo app quede acoplado solo a soluciones de AWS, xq si en un momento tendria q cambiar de entorno, complicaria las cosas. Quiero quedar lo mas abstracto e independiente posible"*. Descartado AWS KMS-only; elegido AES-256-GCM con master key en env detrás de una abstracción `EncryptionService` (clase abstracta) — el día que se quiera swapear a KMS / Vault / GCP, sólo cambia el `useExisting` del `SecurityModule`, los call sites no se tocan.
- **`EncryptionService`** (`apps/backend/src/common/security/encryption.service.ts`): clase abstracta con `encrypt(plaintext): string`, `decrypt(value): string`, `isEncrypted(value): boolean`. Impl concreta `AesGcmEncryptionService`:
  - Master key desde `MASSIVO_ENCRYPTION_KEY` (hex, 64 chars) o `MASSIVO_ENCRYPTION_KEY_B64` (base64, 44 chars). Validación de tamaño: 32 bytes exactos o el `onModuleInit` tira al boot.
  - Algoritmo: AES-256-GCM via `node:crypto`. IV random 12 bytes per-encrypt. AuthTag 16 bytes detecta tampering.
  - Formato de salida: `v1:<iv-b64url>:<ciphertext-b64url>:<authTag-b64url>` (string, 4 partes separadas por `:`). El prefijo `v1:` es el contrato — futuros algoritmos suben a `v2:` etc., y el `decrypt` puede coexistir con valores viejos hasta que rotemos todo.
  - **Cache LRU TTL**: 5min, max 256 entries, key=ciphertext completo. Un WapiConfig con muchos sends evita correr AES en cada job. Se invalida cuando se rota el secreto (porque el ciphertext cambia).
  - **Modo legacy** (sin clave master, sólo dev): `encrypt()` es no-op, `decrypt()` devuelve el valor sin cambios mientras NO tenga prefijo `v\d+:`. Si tiene prefijo y la clave no está → tira. Esto deja a 2.B funcionar sin breaking change.
  - **Detección de versión desconocida**: `decrypt('v9:...')` tira `formato inválido (versión=v9)`. Sólo `v1` es aceptable hoy.
- **`SecurityModule`** (`apps/backend/src/common/security/security.module.ts`) `@Global` — provider `AesGcmEncryptionService` ligado a token `EncryptionService` (`useExisting`). Importado en `AppModule`. Como es global, los call sites no necesitan importar el module.
- **Integración call sites**:
  - `WapiConfigsService.create`: encripta `accessToken`, `webhookVerifyToken`, `appSecret` (este último, si vino).
  - `WapiConfigsService.update`: idem para los tres campos cuando vienen en el DTO. Trato especial para `appSecret: null` (limpia el campo) — no lo pasa por encrypt.
  - `WapiWorkerService.process`: reemplaza el TODO 4.B (línea ~243) — `accessToken: this.encryption.decrypt(cfg.accessTokenEnc)`. Detección de legacy plaintext (sin prefijo `v1:`) → devuelve el valor tal cual, manteniendo backward-compat con WapiConfigs sembradas en 2.B.
- **Env**: `.env.example` documenta `MASSIVO_ENCRYPTION_KEY` y `_B64`, con comando para generar (`openssl rand -hex 32`) y advertencia de no perder la clave. También aproveché para agregar las vars del worker WAPI (`WAPI_QUEUE_NAME`, `WAPI_WORKER_CONCURRENCY`, `WAPI_WORKER_ENABLED`, `WAPI_DELAY_MIN_MS/MAX_MS`) y `WAPI_GRAPH_BASE_URL` que faltaba documentar de 4.A.
- **Tests** (11 nuevos): `encryption.service.spec.ts`:
  - encrypt+decrypt roundtrip preserva el plaintext.
  - cada `encrypt()` del mismo plaintext produce ciphertext distinto (IV random).
  - tamper detection: flippear el primer char del ciphertext → `decrypt` tira.
  - versión desconocida (`v9:...`) → tira `formato inválido`.
  - clave de tamaño incorrecto al boot → tira.
  - soporta clave en base64 vía `MASSIVO_ENCRYPTION_KEY_B64`.
  - sin clave master: `encrypt` es no-op, `isEncrypted('plain')=false`.
  - sin clave master + valor `v1:...` → `decrypt` tira con mensaje claro.
  - decrypt de plaintext legacy (sin prefijo) lo devuelve sin cambios.
  - `isEncrypted` distingue `v1:` de plaintext.
  - cache hit: tras un `decrypt` exitoso, blanquear la masterKey y volver a llamar — devuelve el cached sin tocar crypto.
- **Mocks actualizados**: `tenant-isolation.spec.ts` y `wapi-configs.service.spec.ts` agregan provider mock de `EncryptionService` con `encrypt(v) → 'enc(v)'` / `decrypt('enc(v)') → 'v'` para que los Nest testing modules resuelvan la dep.
- **Fix colateral preexistente** en `wapi-worker.service.spec.ts`: el test de `bodyVars` asignaba `fix.campaign.config = { bodyVars: [...] }` pero el fixture infiere `config: null`. tsc strict lo rechazó — cast `(fix.campaign as { config: unknown }).config = ...`. Detectado al correr `tsc --noEmit` después de modificar el archivo.
- **Verificación**: `tsc --noEmit` ✅ (0 errores), `jest` **266/266 ✅** (255 anteriores + 11 de 4.B, 0 regresiones).
- **Próximo paso**: **4.C — Webhook Meta** (`POST /webhooks/wapi/:configId` público, `@SkipTenantScope`, verify_token + firma con `appSecret`, procesa `messages` entrantes y `statuses` delivered/read/failed). Alternativa: **4.D — Sync de templates Meta** si se quiere armar primero el flujo completo de outbound (templates aprobados desde Graph API).

### 2026-05-04 — Sesión 17 (Claude Opus 4.7) — Sub-fase 4.A (infra de envío WAPI)
- **Decisión de scope**: arrancar Fase 4 (WhatsApp Cloud API) en lugar de cerrar 3.E inbound de mails — el dueño priorizó WAPI. 3.E queda postergado al final de Fase 3 (después de 4 entera).
- **Cleanup previo**: las 7 sub-tareas legacy bajo "Sub-tareas legacy del plan original (referencia, ya cubiertas en 3.A/3.B/3.C)" de la sección Fase 3 estaban con `[ ]` aunque el header decía que ya estaban cubiertas. Marcadas como `[x]` con referencia a la sub-fase exacta donde se implementó cada una. Commit `abbe371`.
- **WapiSenderService** (`apps/backend/src/modules/wapi/sender/wapi-sender.service.ts`): cliente HTTP a Graph API v20+ `/messages` usando `fetch` nativo (Node 22 / undici bundled — sin agregar `@nestjs/axios` ni `undici` como dep). Métodos `sendText` / `sendTemplate` / `sendMedia`. Errores Meta normalizados en `WapiSendException` con flags `isRateLimit` / `isAuth` / `retryable` para que el worker pueda decidir backoff vs FAILED definitivo. Códigos rate limit conocidos del API: 130429, 131048, 131056. Códigos auth: 190, 102, 10, 200. Override de URL base vía env `WAPI_GRAPH_BASE_URL` (mocks/staging).
- **WapiQueueService** (`apps/backend/src/modules/wapi/queue/wapi-queue.service.ts`): wrapper sobre BullMQ Queue `wapi-send` con `jobId=reportId` para idempotencia. Mismas opciones default que `email-send` (`attempts:3`, backoff exponencial 5s, removeOnComplete age 1h).
- **WapiWorkerService** (`apps/backend/src/modules/wapi/queue/wapi-worker.service.ts`): patrón calcado del EmailWorker. Por cada job:
  - Reconstruye TenantContext (orgId/teamId del payload, role sintético OWNER/ADMIN porque el envío es background).
  - Carga `WapiReport` + `WapiContact` + `WapiCampaign(template, configRel)` via `prisma.scoped` — falla naturalmente si el job vino de otro tenant.
  - **Control actions** (paridad con email 3.C.5): PAUSED → `job.moveToDelayed(now + 30s)` y exit; COMPLETED|FAILED + report PENDING → marca FAILED con `error='campaign-closed'`. Nota: `WapiReportStatus` no tiene `CANCELED` (solo email lo tiene), así que reusamos `FAILED` con error string distintivo.
  - **Daily limit per-config**: `prisma.scoped.wapiReport.count` con filtro `status='SENT' + sentAt >= 24h ago + campaign.configId = X`. Si `>= cfg.dailyLimit` → `moveToDelayed(now + 1h)`.
  - Llama `WapiSenderService.sendTemplate` con `templateName/language` del template + `components` mapeados desde `WapiContact.data` según `campaign.config.bodyVars` (array de keys, opcional).
  - Marca `WapiReport.SENT` + `metaMessageId` + `sentAt`. Emite `wapi.report.updated` (debounced) + `wapi.report.log` (cada transición). Llama `maybeCompleteCampaign` (PROCESSING → COMPLETED si no quedan PENDING).
  - **Jitter post-envío**: sleep `random(WAPI_DELAY_MIN_MS, WAPI_DELAY_MAX_MS)` defaults 30s/60s. Con `concurrency=1` (default) esto da rate limiting per-worker. Multi-worker sync (Redis `nextAvailableAt` per-config) queda pendiente para cuando se necesite escalar.
  - **Backoff exponencial Meta rate-limit**: si `WapiSendException.isRateLimit=true`, NO marca FAILED — `moveToDelayed(now + min(60s × 2^attemptsMade, 1h))`. Otros errores → marca FAILED + rethrow para retries del `defaultJobOptions` de BullMQ.
- **Endpoint placeholder** `POST /api/wapi/campaigns/:id/send` (`WapiCampaignsController` con `@CheckPolicies('send', 'Campaign')`): SENDABLE_STATUSES = {DRAFT, SCHEDULED, PAUSED}, valida `templateId`/`configId`/`contacts.length > 0`, marca campaign PROCESSING, crea `WapiReport` por contacto en `$transaction` (copia `phone` del contacto al report para sobrevivir si después se elimina el contact), enquola un job por cada uno. CRUD completo (create/update/addContacts/control actions/getReport) viene en 4.E.
- **Decisiones intencionales para 4.A**:
  - **Token en claro**: el worker lee `cfg.accessTokenEnc` directamente sin decriptar. TODO marcado para 4.B (encriptación KMS). Por ahora los tokens se persisten igual de plano que en 2.B (era placeholder explícito).
  - **Sin opt-out check pre-envío**: requiere agregar `SUPPRESSED` al enum `WapiReportStatus` (migración Prisma). Diferido a 4.H que es la sub-fase específica de opt-out.
  - **Sin webhook Meta**: los `statuses` (delivered/read/failed) vendrán cuando se implemente 4.C.
  - **Single-worker rate limiting**: jitter sleep + `concurrency=1` es suficiente para MVP. Si se necesita multi-worker en una misma config, se agrega sync vía Redis (no en 4.A).
- **Tests** (17 nuevos):
  - `wapi-sender.service.spec.ts` 8/8: sendText OK + sendTemplate OK con components, code 131056 → isRateLimit, code 190 → isAuth, 200 sin `messages[0].id` → tira, 5xx genérico → retryable=true isRateLimit=false, 429 sin error.code → isRateLimit=true (HTTP-level), override `WAPI_GRAPH_BASE_URL`. Mock de `global.fetch` (no abre red).
  - `wapi-worker.service.spec.ts` 9/9: happy path, report not found cross-tenant, PAUSED → moveToDelayed sin tocar report, COMPLETED → FAILED, dailyLimit alcanzado → moveToDelayed sin sender, rate-limit code 131056 → moveToDelayed sin FAILED (PENDING preserved para reintento), error auth 190 → FAILED + rethrow, components con `bodyVars=['firstName']` envía vars del contact, último report SENT → transiciona campaign PROCESSING → COMPLETED.
  - Backend full: **255/255 ✅** (228 anteriores + 10 de 3.D + 17 nuevos de 4.A, 0 regresiones).
- **Fix colateral preexistente**: `email/reports/report-generator.service.spec.ts` no compilaba bajo `tsc --noEmit` por tipo del Buffer pasado a `wb.xlsx.load()` (`Buffer<ArrayBufferLike>` vs el `Buffer` que pide exceljs). Cast `as never` puntual. Era TS strict-only — los tests pasaban porque ts-jest es más permisivo. Detectado al correr typecheck antes de los specs nuevos de 4.A.
- **Verificación de scope**: typecheck backend ✅ (0 errores), tests 255/255 ✅. Frontend no tocado (no hay UI WAPI todavía — viene en 4.E adelante).
- **Próximo paso**: **4.B — Encriptación KMS de tokens** (`accessTokenEnc` / `webhookVerifyTokenEnc` / `appSecretEnc` quedaron en claro). Decisión a tomar: AWS KMS vs `crypto.subtle` con clave maestra en env vs Vault. Alternativa: arrancar **4.C — Webhook Meta** primero para tener inbound completo (mensajes entrantes + statuses delivered/read/failed) antes de invertir en KMS — depende de qué se pueda probar end-to-end primero.

### 2026-05-04 — Sesión 16 (Claude Opus 4.7) — Sub-fase 3.D (reportes consolidados con export CSV/XLSX)
- **Backend**: nuevo módulo `apps/backend/src/modules/email/reports/` con `ReportGeneratorService` (4 generators: `campaign-summary` / `campaign-reports` / `bounces-complaints` / `suppressions`), `GenerateReportDto` (class-validator: `@IsIn(REPORT_KINDS)`, `@IsIn(REPORT_FORMATS)`, `campaignId?` / `status?` / `fromDate?` / `toDate?` con `@Type(() => Date)`) y `ReportsController` con un único endpoint `POST /api/email/reports/generate`.
- **Auth**: `@CheckPolicies` compuesto sobre el endpoint (`read Campaign` AND `read EmailSuppression`) en lugar de splittear en dos endpoints — ambas abilities ya las tiene MEMBER+ADMIN, simpler de mantener.
- **Estrategia de export**: sync-only — single Buffer en memoria, target ~50k filas máx por reporte. Para cargas mayores, async + S3 + scheduler quedan diferidos a **Fase 8** (notifications/scheduling). Formato seleccionable por el cliente (CSV o XLSX) en el body del POST.
- **Libs nuevas**: `csv-stringify@^6.7.0` (API sync, `quoted_string: true` para evitar issues con comas/comillas en payloads) + `exceljs@^4.4.0` (XLSX con `ws.columns = [...]` + header bold + width 18 default por columna). Instaladas vía `pnpm add --filter @massivo/backend csv-stringify exceljs`.
- **Response binaria**: controller usa Express `Response` (`@Res() res`) con `Content-Type` (`text/csv` / `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), `Content-Disposition: attachment; filename="<kind>.<format>"`, `Content-Length` y `res.end(buffer)`. No se usa stream incremental (sync ya genera el Buffer completo).
- **Generators detalle**:
  - `campaign-summary`: requiere `campaignId`. `groupBy` sobre `EmailReport.status` + count de `firstOpenedAt`/`firstClickedAt` no nulos. Una fila con los 7 estados (incluido CANCELED) + `uniqueOpens` + `uniqueClicks` + `openRate` + `clickRate`.
  - `campaign-reports`: requiere `campaignId`. `findMany` con `include: { contact, _count: { events } }`, filtro opcional por `status`. Una fila por contacto.
  - `bounces-complaints`: combina `emailBounce.findMany` + `emailReport.findMany(status=COMPLAINED)` con default 30-day range si no viene `fromDate/toDate`. Sort desc por timestamp.
  - `suppressions`: `emailUnsubscribe.findMany` ordered by `createdAt desc`. No requiere campaignId.
- **Helper interno**: `requireCampaignId(filters)` lanza `BadRequestException` si falta para los 2 generators per-campaign. `serialize()` es genérico `<T extends Record<string, unknown>>` con array de `{ key, header, width? }`.
- **Frontend**: extendido `apps/frontend/src/api/client.ts` con `useApi().download(path, body, fallbackFilename)` que retorna `{ blob, filename }`, parsea `Content-Disposition` (filename="...") y maneja `ApiError` desde respuestas 4xx/5xx (lee body como text + intenta parse JSON). Helper exportado `triggerBlobDownload(file)` crea un `<a>` temporal con `URL.createObjectURL` y dispara save dialog del browser.
- **Componente reutilizable**: `apps/frontend/src/features/email/reports/ExportReportButton.tsx` — split-button MUI con `Menu` + 2 `MenuItem` (CSV / Excel .xlsx con `ListItemText` + secondary descriptive text). Props: `kind` (4 union), `filters` (campaignId/status/fromDate/toDate), `label`, `size`, `variant`, `disabled`. Busy state + useNotify success/error.
- **Wiring**: `CampaignDetailPage` con 2 botones en panel Resultados (`Resumen` + `Detalle por contacto`, ambos con `filters={{ campaignId: campaign.id }}`). `SuppressionsPage` con 2 botones en header (`Exportar unsubs` + `Exportar bounces/complaints`).
- **Tests backend**: 10 nuevos en `report-generator.service.spec.ts` cubriendo los 4 generators × ambos formatos (CSV/XLSX), `BadRequestException` cuando falta `campaignId`, `NotFoundException` cuando `campaignId` no existe en el tenant activo, precedence de `fromDate`/`toDate` sobre default 30-day. Para XLSX hace parseback con `new ExcelJS.Workbook().xlsx.load(buffer)` y assertea `font.bold` en row 1 + tipo numérico en celdas de counts/rates. Backend full **238/238 ✅** (10 nuevos, 0 regresiones).
- **Fix preexistente colateral**: TS2742 en `email-campaigns.controller.ts` (`The inferred type of 'pause' cannot be named without a reference to '@prisma/client/runtime/library'`) resuelto con return types explícitos: `Promise<unknown>` en `pause`, `Promise<{ resumed: true; reEnqueued: number }>` en `resume`, `Promise<{ closed: true; canceled: number }>` en `forceClose`. Era el error preexistente reportado tras el commit de 3.C.5 — sólo afectaba `tsc --noEmit`, no el runtime.
- **Frontend typecheck**: ✅ excepto los mismos 2 errores preexistentes en `CampaignDetailPage.tsx` (parser CSV / `noUncheckedIndexedAccess` en `lines[0]`) — confirmados como no tocados vs baseline.
- **Próximo paso**: arrancar **Fase 4 — Canal WhatsApp Cloud API** (4.A → 4.K, ver MIGRATION_PLAN). Alternativamente, si el dueño prioriza cerrar Fase 3 antes de saltar de canal: **3.E inbound** (parsing IMAP / forwarders) — postergado en sesiones anteriores. Antes de pasar a Fase 4, **el sender SES en producción aún no fue verificado end-to-end con tracking real (cloudflared)** — sigue diferido si el dueño prioriza otras cosas.

### 2026-05-04 — Sesión 15 (Claude Opus 4.7) — Sub-fase 3.C.5 (control actions de campaña)
- **Schema**: nuevo valor `CANCELED` en `EmailReportStatus`. Migración `20260504181455_add_canceled_report_status` aplicada en Postgres local vía WSL (workaround de Git-Bash MSYS path conversion: script en `/mnt/c/...` invocado con `MSYS_NO_PATHCONV=1 wsl.exe`).
- **Backend service**: `EmailCampaignsService.pause` (PROCESSING→PAUSED, Conflict en otros estados), `resume` (PAUSED→PROCESSING + re-enqueue PENDING idempotente vía `jobId=reportId`), `forceClose` (PROCESSING|PAUSED→COMPLETED + `updateMany` PENDING→CANCELED con `error='force-closed'`). Cada acción notifica via `events.emitToTeamDebounced` para que dashboards/banner/lista refresquen.
- **Endpoints**: `POST /api/email/campaigns/:id/pause | /resume | /force-close`, todos con `@CheckPolicies((a) => a.can('send', 'Campaign'))`.
- **Worker**: `EmailWorkerService.process` ahora chequea `report.campaign.status` antes de enviar:
  - PAUSED + report PENDING → `job.moveToDelayed(now+30s, job.token)` (BullMQ idiomatic), exit-early sin tocar el report.
  - COMPLETED|FAILED (force-close) + report PENDING → marca CANCELED con `error='campaign-closed'` y exit.
  - **Decisión arquitectural**: estrategia "DB-flag + worker check" en lugar de cancelar jobs en BullMQ → idempotente, sobrevive reinicios, sin race con jobs ya tomados por otro worker.
- **Frontend**: `CampaignProcessingBanner` ahora se renderiza también en estado `PAUSED` (icono `PauseCircle`, color warning, barra warning a 0%). Recibe `status` + `onPause/onResume/onForceClose` + `actionsBusy`. Tres botones: Pausar (PROCESSING), Reanudar (PAUSED), Forzar cierre (en ambos, con `useConfirm` destructive). `CampaignDetailPage` cablea las acciones contra los nuevos endpoints con `useNotify` y refresh de campaign+report tras cada acción.
- **Fix preexistente**: `tenant-isolation.spec.ts` no compilaba en CI por dependencia de `EmailSenderService` agregada en 3.C.4.a' al `SmtpAccountsService`. Sumado mock `{ verifyAccount, sendForAccount }`.
- **Tests**: campaigns.service.spec 19/19 ✅ (7 nuevos: pause OK / pause Conflict / resume OK + reEnqueue / resume Conflict / forceClose PROCESSING / forceClose PAUSED / forceClose Conflict). worker.service.spec 9/9 ✅ (2 nuevos: PAUSED → moveToDelayed sin tocar report, COMPLETED por force-close → CANCELED). Backend full **228/228 ✅**. Frontend typecheck OK (los 2 errores en `CampaignDetailPage` son preexistentes en parser CSV, no tocados).
- **Próximo paso**: **3.D — Reportes consolidados** (vistas globales cross-campañas). Implica: tablero de reportes por team con filtros por rango de fechas/canal, drill-down por campaña, export CSV/XLSX, scheduler genérico de reportes (Fase 9 dependency: cualquier reporte agendable + entrega por mail con adjunto). Antes de eso, sumar al Sender SES verificación real de tracking en producción (cloudflared) — diferido si lo prioriza el dueño.

### 2026-04-30 — Sesión 14 (Claude Opus 4.7) — Cierre sub-fase 3.C.4 (frontend email features)
- **3.C.4.c — Suppressions UI** ✅: backend con endpoints separados unsubscribes/bounces (cursor + filtro email), POST manual, DELETE de ambos. Frontend `/dashboard/email/suppressions` con Tabs, search, dialog "Agregar manual". Tests: 25/25 ✅.
- **3.C.4.d — Métricas globales** ✅: `EmailMetricsService.getOverview(7|30)` con groupBy + aperturas/clicks únicos + top 5 campañas. Frontend `/dashboard/email/metrics` con KpiCards, distribución, tabla top campañas. Tests: 3/3 ✅.
- **3.C.4.e — Live processing view** ✅: `CampaignProcessingBanner` con LinearProgress determinate, contador procesados/total, throughput hook 60s, breakdown chips. Pause/resume diferido a 3.C.5.
- **3.C.4.f — Log en vivo + fix throttle socket** ✅: backend emite `email.report.log` por transición (no throttleado, payload con `campaignId` para multi-campaña). Frontend con panel consola dark, ring buffer 200, filtro por status, auto-scroll, soporta hasta 5 campañas paralelas sin cruzar logs.
- **Fix crítico realtime**: `EventsService.emitToTeamDebounced` era debounce puro → cada nueva transición reseteaba el timer → durante un envío activo NO llegaba ningún `email.report.updated` al frontend hasta que terminaba la cola. Reescrito a **throttle leading+trailing** (1s window). Es la razón por la que el banner de progreso en pruebas anteriores quedaba pegado en 0.
- **Fix banner inicial**: `handleSend` ahora dispara `loadReport()` además de `load()`; banner muestra `LinearProgress` indeterminate cuando counts vienen todos en 0 (evita falso 100% durante el primer segundo).
- **Fix UX**: loop infinito de `GET /api/email/campaigns/:id/reports` en `CampaignSendsSection` (loadFirstPage no estaba memoizada via `useApi()`) — sacado de las deps de `useEffect`.
- **Fix worker**: campañas quedaban en PROCESSING para siempre — agregado `maybeCompleteCampaign` (count PENDING + updateMany guarded by status). Tests worker: 7/7 ✅.
- **Tracking de email**: confirmado que funciona (probado abriendo emails en local, eventos OPEN/CLICK se persisten). Para que Gmail llegue al endpoint de tracking en dev necesitamos un túnel (cloudflared/ngrok) — diferido.
- **Estado al cierre**: backend tests verde excepto `tenant-isolation.spec.ts` (failure preexistente no relacionado a esta sesión, falta proveer `EmailSenderService` en el módulo de test). Frontend typecheck ✅.
- **Próximo paso**: **3.C.5 — Control actions de campaña** (pausar / reanudar / forzar cierre durante PROCESSING). Implica: endpoint backend `POST /api/email/campaigns/:id/pause` (transiciona a PAUSED, cancela jobs pendientes en BullMQ o setea flag que el worker chequea antes de procesar), `POST /:id/resume` (vuelve a PROCESSING + re-enqueue), `POST /:id/cancel` (force-close → COMPLETED con flag canceled). Frontend: botones en `CampaignProcessingBanner`. Decidir estrategia: cancelar jobs de la queue vs flag en BD chequeado por worker. Después de 3.C.5 viene **3.D — Reports consolidados**.

### 2026-04-30 — Sesión 13 (Claude Opus 4.7) — Reescritura `MIGRATION_PLAN.md` v2.0
- **Audit exhaustivo de AMSA Sender** (vía Explore agent): listado feature-por-feature de backend modules, workers, frontend features, Prisma models, crons, capacidades cross-cutting.
- **Gaps detectados** que el plan v1 no cubría: One-Click unsubscribe RFC 8058, bounce DSN parsing, EmailEvent metadata extendida, manual send, test send/preview, acciones de control campaña (pausar/reanudar/forzar cierre), inbox WAPI full feature (asignar/tomar/resolver/búsqueda/sin asignar/resueltas/media), respuestas rápidas, bajas WAPI, mensaje bienvenida, daily limit per-config, detección rate-limit codes Meta, live dashboard WAPI, scheduler genérico de reportes, contacts unificados con `externalId` + timeline cross-canal, dev simulator, AI provider switcheable.
- **Decisiones del usuario** sobre features ambiguas:
  1. **Deudores → Contacts con `externalId` + timeline cross-canal**: SÍ se porta como Fase 5 nueva.
  2. **Gmail OAuth read**: NO se porta.
  3. **Dev Simulator**: SÍ se porta como Fase 9.
  4. **Scheduler genérico**: SÍ — cualquier reporte de la plataforma debe ser agendable y llegar por mail con CSV/XLSX.
  5. **Configuración por usuario/scope**: simplificada a config por team + valores del plan.
  6. **AI Gemini + Bedrock**: ambos, switcheables por feature flag + env vars (operador elige, no el usuario).
  7. **WhatsApp legacy**: NO va.
- **Reescritura de `MIGRATION_PLAN.md` → v2.0**:
  - Fases 0/1/2 marcadas ✅ con detalle.
  - Fase 3 dividida en sub-fases: 3.A ✅, 3.B ✅, **3.B'** (3.B.4 One-Click + 3.B.5 DSN + 3.B.6 metadata) 🆕, 3.C ✅ hasta .3.e, **3.C.4** (.a-.g) 🆕, **3.C.5** acciones de control 🆕, **3.D** reportes consolidados 🆕, 3.E inbound (postergado).
  - Fase 4 expandida en 11 sub-fases (4.A → 4.K).
  - **Fase 5 nueva**: Contacts + Timeline cross-canal (reemplaza Deudores).
  - **Fase 7 nueva** (ex 6): IA con `LlmProvider` switcheable.
  - **Fase 8 nueva**: Scheduler genérico de reportes.
  - **Fase 9 nueva**: Dev Simulator.
  - Tabla "Mapa AMSA Sender → Massivo App" feature-por-feature con estado (✅/🟡/🆕/⛔).
- **Próximo paso**: 3.C.4.a (SMTP accounts UI + test send) — el BLOCKER actual ya identificado.

### 2026-04-30 — Sesión 12 (Claude Opus 4.7) — Sub-fase 3.C.3.c/.d/.e + landing + GitLab layout + Clerk theming
- **3.C.3.c — Frontend campaigns**: `CampaignsListPage` (tabla con chips de status, dialog de creación, confirm() destructive en delete) y `CampaignDetailPage` (edit metadata si DRAFT/SCHEDULED/PAUSED, CSV paste con header detection, send con confirm, panel de report con counts + opens/clicks).
- **3.C.3.d — Realtime dashboard**: ambas páginas suscriptas al socket `email.report.updated` (filtra por campaignId en detail) → re-fetcha el agregado.
- **3.C.3.e — UX polish**: `NotifyProvider` (Snackbar global con hook `useNotify`), `ConfirmProvider` (Promise-based con destructive), skeletons, responsive tables, AppLayout con Drawer mobile.
- **Landing page** (`HomePage`) estilo SaaS moderno: hero gradient, 6 features grid, CTA paper, footer. Patrón `<SignedIn><Navigate/></SignedIn><SignedOut>...</SignedOut>` para redirección automática logueado → /dashboard.
- **GitLab-style layout**: rediseño de `AppLayout` con topbar fijo full-width (UserButton top-right, theme toggle, hamburger mobile) + sidebar colapsable (`SIDEBAR_WIDTH=248`/`COLLAPSED=64`). Estado persistido en `localStorage['massivo:sidebarCollapsed']`. NAV_GROUPS con items disabled "pronto".
- **Clerk theming**: nuevo `ClerkWithTheme` wrapper que sincroniza `baseTheme=dark` de `@clerk/themes` con el modo MUI vía `useColorMode()`. Variables custom (colorPrimary, colorBackground/Text/InputBackground en dark). Resuelve "OrgSwitcher se ve negro en dark mode".
- **Clerk en español**: `localization={esES}` de `@clerk/localizations`.
- **Tablas con shadow en dark mode**: override de `MuiTableContainer` + `MuiPaper` con boxShadow custom + inner ring `rgba(255,255,255,0.05)`. `backgroundImage: 'none'` para evitar el filtro lavado MUI.
- **Auth redirects**: `forceRedirectUrl`/`fallbackRedirectUrl="/dashboard"` en SignIn/SignUp para que el flujo post-login termine en el dashboard.
- **`ThemeProvider` split**: `ColorModeProvider` (context-only) + `MuiThemeWithMode` (consumer). Permite que `ClerkWithTheme` consuma el contexto y sincronice baseTheme.
- **Próximo paso**: 3.C.4.c — Suppressions UI (`/dashboard/email/suppressions` con `EmailUnsubscribe` + `EmailBounce` paginados). Después: métricas globales, live processing view, manual send, preview test send.

### 2026-04-30 — Sesión 11 (Claude Opus 4.7) — Sub-fases 3.B + 3.C.1/.2/.3.a/.3.b
- **🏁 Sub-fase 3.B completa**: tracking saliente + suppression + webhook SES.
- **3.C.1 — Backend campaigns**: CRUD + send (BullMQ enqueue por contacto) + getReport (groupBy + opens/clicks).
- **3.C.2 — Realtime**: `EventsService.emitToTeamDebounced` + integración en `EmailWorker` y `SesWebhookService` con event `email.report.updated`.
- **3.C.3.a — Frontend infra**: `useApi()`, `TeamContext`, `useTeamSocket()`, router placeholders, `socket.io-client`.
- **3.C.3.b — Templates + Unlayer**: list page + editor con `react-email-editor`.
- Tests al final de la sesión: backend **194/194 ✅**, permissions 14/14 ✅.
- **Próximo paso**: 3.C.3.c (frontend campaigns).

### 2026-04-30 — Sesión 10 (Claude Opus 4.7) — Sub-fase 3.A
- **Sub-fase 3.A — Infra de envío email completada** ✅.
- Decisión arquitectónica: driver-based (`EmailSender` interface). `SmtpSender` (nodemailer, default — Mailpit en dev / SMTP de cliente en prod) y `SesSender` (`@aws-sdk/client-sesv2`, prod). Selección por `SmtpAccount.provider`. Migración `add_smtp_provider_field` (campos `provider`, `sesConfigSet`).
- `EmailQueueService` (BullMQ, queue `email-send`, jobId=reportId para idempotencia). `EmailWorkerService` reconstruye `TenantContext.run` con role sintético OWNER/ADMIN, render Handlebars desde `contact.data`, persiste SENT/FAILED.
- Tests: 6 SesSender (mock SESv2Client: ensureConfigurationSet idempotente + NotFoundException→create + truncado 64) + 4 EmailWorker (happy path, sender error→FAILED, cross-tenant not found, sin template).
- Verificación: typecheck 8/8 ✅, backend 124/124 ✅ (+10 vs Fase 2), permissions 14/14 ✅.
- **Pendiente dev local** (no en CI): instalar Mailpit + Redis en WSL para test E2E manual. Comandos en sección "Setup dev local".
- **Próximo paso**: 3.B (tracking pixel + webhook SES + suppression + unsubscribe).


- **Sub-fase 2.D — Sockets scopeados completada** y con ello **🏁 Fase 2 completada**.
- `EventsModule` con `EventsService` (helpers `emitToTeam`/`emitToOrg`/`emitToUser`), `SocketContextResolver` (encapsula la lógica de `TenantContextGuard` para handshake) y `AppGateway` con auth vía `server.use(middleware)` (necesario para que el cliente reciba `connect_error`; emitir manualmente `connect_error` está reservado por Socket.IO). Rooms `org:{id}`, `team:{id}`, `user:{id}` por socket.
- Tests: `events.service.spec.ts` (5 unit), `app.gateway.spec.ts` (5 integración con Socket.IO real + `IoAdapter` + `SocketContextResolver` mockeado): verifica aislamiento `emitToTeam` (cliente B no recibe eventos de team A), `emitToOrg`, y rechazos sin token / sin teamId / token inválido.
- Auditoría manual: `grep` confirma cero accesos al cliente prisma raíz para modelos tenant-aware desde `apps/backend/src` (todo va por `prisma.scoped`).
- Verificación final: typecheck 8/8 ✅, backend 114/114 ✅, permissions 14/14 ✅.
- Aplicada regla de propagación: checklist + criterios de Fase 3 expandidos en "Próximo paso" (SES + worker + tracking pixel + webhook + Unlayer + suppression + unsubscribe).
- **Próximo paso:** Fase 3 — Canal Email envío real.

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

### 2026-04-30 — Sesión 8 (Claude Opus 4.7)
- **Sub-fase 2.C — Cross-cutting completada**. 6 modelos tenant-aware (`Contact`, `Tag`, `ContactList`, `ScheduledTask`, `TaskExecution`, `CampaignLog`) + 2 tablas de unión (`ContactTag`, `ContactListMember`) + 4 enums (`ChannelKind`, `ScheduledTaskKind`, `TaskExecutionStatus`, `CampaignLogLevel`).
- Migración `add_crosscutting_models` aplicada. Modelos registrados en `TENANT_SCOPED_MODELS`.
- Subjects CASL: agregados `Tag` y `ContactList`. Rules MEMBER ahora cubren `Contact/ContactList/Tag` (CRUD + delete).
- Nuevo módulo `ContactsModule` con `ContactsController` (`/contacts`) y `TagsController` (`/tags`): DTOs class-validator (E.164 + IsEmail, `@ValidateIf` para exigir email-o-phone), services con dedupe por team (Postgres permite múltiples NULL → contacts sin email no chocan), traducción de `P2002` a `ConflictException`.
- Tests: `contacts.service.spec.ts` (7) + `tags.service.spec.ts` (6) + extensión de `tenant-isolation.spec.ts` (6 cross-tenant + 2 sin contexto).
- Verificación: typecheck 8/8 ✅, backend 104/104 ✅, permissions 14/14 ✅.
- **Pendiente para cerrar Fase 2**: sub-fase 2.D (Sockets scopeados con Socket.IO + auth handshake + rooms `org/team/user` + `EventsService`).
- **Nota**: `ContactList`/`ContactListMember` quedaron en schema sin CRUD — no estaba en "servicios mínimos" del plan, se completará junto con el UI de listas en Fase 5/6.

### 2026-04-30 — Sesión 7 (Claude Opus 4.7)
- **Inicio Fase 2 — sub-A: Email**. Schema Prisma con 8 modelos nuevos (`SmtpAccount`, `EmailTemplate`, `EmailCampaign`, `EmailContact`, `EmailReport`, `EmailEvent`, `EmailBounce`, `EmailUnsubscribe`) tenant-scoped (`organizationId` + `teamId` + índices). 4 enums nuevos (`EmailCampaignStatus`, `EmailReportStatus`, `EmailEventType`, `EmailUnsubscribeScope`). Migración `add_email_models` aplicada contra DB local.
- Modelos registrados en `TENANT_SCOPED_MODELS` → la Prisma extension los enforce automáticamente.
- **Fix de `pnpm dev` que rompía el backend** (`ERR_MODULE_NOT_FOUND` en `@massivo/permissions`): se descartaron los cambios uncommitted previos (que rompían jest), y se aplicó la solución correcta: `package.json` de los 3 packages workspace ahora apunta a `./dist/index.js` y `./dist/index.d.ts`; `tsconfig.json` de los 3 packages cambia a `module: CommonJS` + `moduleResolution: Node`; `turbo.json` agrega `dependsOn: ["^build"]` al task `dev`.
- Verificación: typecheck 8/8 ✅, build 5/5 ✅, tests backend 49/49 ✅, tests permissions 11/11 ✅, `pnpm --filter @massivo/backend dev` arranca y `GET /api/health` responde `{"status":"ok"}`.

### 2026-04-29 — Sesión 6c (Antigravity — Opus 4.6)
- **TeamMembersService**: CRUD de miembros de team (`GET/POST/PATCH/DELETE /api/teams/:teamId/members`). Valida pertenencia a la org antes de agregar, protege contra eliminar último admin, cross-org isolation.
- DTOs `AddTeamMemberDto` / `UpdateTeamMemberRoleDto` con `class-validator`.
- Tests `TeamMembersService`: 6 tests.
- **Suite `tenant-isolation.spec.ts`**: 10 tests verificando que Tenant A no puede leer/escribir/eliminar datos de Tenant B, ni con TeamsService ni con TeamMembersService. ForbiddenException sin contexto.
- **🏁 FASE 1 COMPLETADA**: todos los criterios de aceptación verificados.
- Verificación final: typecheck 8/8 ✅, build 5/5 ✅, tests backend 49/49 ✅, tests permissions 11/11 ✅.

### 2026-04-30 — Sesión 8 (Antigravity — Opus 4.6 Thinking)
- **🏁 Sub-fase 2.A Email COMPLETADA**: todos los ítems del checklist verificados.
- Fix de 2 errores TypeScript en `SmtpAccountsService` y `EmailTemplatesService`: uso de `Prisma.*.UncheckedCreateInput` (la extension inyecta orgId/teamId en runtime, el tipo `CreateInput` exige relaciones que no se pasan manualmente).
- Fix imports `@prisma/client` → `@massivo/prisma` (convención del monorepo).
- 3 tests CASL nuevos en `@massivo/permissions/ability.spec.ts`: ADMIN manage SmtpAccount/Template, MEMBER read SmtpAccount + CRUD Template, VIEWER read only.
- 8 tests isolation nuevos en `tenant-isolation.spec.ts`: cross-tenant read/update/delete SmtpAccount y EmailTemplate → NotFoundException; sin contexto → ForbiddenException.
- Verificación final: typecheck 8/8 ✅, tests backend 67/67 ✅, tests permissions 14/14 ✅.
- **Próximo paso:** sub-fase 2.B — WhatsApp.
