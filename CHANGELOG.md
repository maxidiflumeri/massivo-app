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

### 3.C.4.e — Live processing view
- **Frontend**: nuevo componente `CampaignProcessingBanner` que se muestra en `CampaignDetailPage` cuando `campaign.status === 'PROCESSING'`. Incluye:
  - Headline "Enviando campaña…" + indicador socket connected (`● en vivo`).
  - `LinearProgress` determinate calculado como `(totalReports - PENDING) / totalReports * 100`. Refresh en vivo al recibir `email.report.updated`.
  - Counter `processed / total` con porcentaje.
  - Throughput estimado (envíos/min) sobre los últimos 60s de progreso real, vía hook `useThroughput` con buffer de muestras. Sólo se muestra con ≥5s de datos y delta positivo (evita ruido al arranque).
  - Chips con breakdown live: Pendientes / Enviados / Fallidos / Bounced / Complaints / Suprimidos.
- El banner queda arriba del card "Resultados" (que sigue mostrando aperturas/clicks únicos en su lugar) — banner = headline operativo, Resultados = breakdown analítico.
- **Pause/resume** queda fuera de scope para 3.C.4.e — se aborda en 3.C.5.

### 3.C.4.d — Métricas globales de email
- **Backend**: nuevo `EmailMetricsService.getOverview(days)` (window 7|30) con queries agregadas via `prisma.scoped.emailReport.groupBy`. Calcula totales por status (sent, failed, bounced, complained, suppressed, pending), aperturas/clicks únicos (reports cuyo `firstOpenedAt`/`firstClickedAt` cae en ventana) y rates: openRate / clickRate / bounceRate / complaintRate. Top 5 campañas (por enviados) con sent + opens + clicks únicos por campaña.
- **Endpoint** `GET /api/email/metrics/overview?days=7|30` con `@CheckPolicies('read', 'Analytics')`. 400 si days no es 7 ni 30.
- **Tests**: `email-metrics.service.spec.ts` 3 casos (totales+rates+top, rates=0 sin sent, ventana 30d).
- **Frontend**: nueva página `/dashboard/email/metrics` con 4 KpiCards (Enviados / Open rate / Click rate / Bounce rate), distribución por estado en chips, tabla top 5 campañas con link al detalle. ToggleButtonGroup 7d/30d. NavRow con `InsightsIcon`.

### 3.C.4.c — Suppressions UI
- **Backend**: refactor `SuppressionsController` con endpoints separados y paginados:
  - `GET /api/email/suppressions/unsubscribes?cursor=&limit=&email=` — cursor pagination (take=limit+1), filtro `email` substring case-insensitive, devuelve `{ items, nextCursor }`.
  - `GET /api/email/suppressions/bounces?cursor=&limit=&email=` — idem para bounces (orderBy `occurredAt desc`).
  - `POST /api/email/suppressions/unsubscribes` body `{ email, scope, campaignId?, reason? }` — agrega manualmente con `source='manual'`. CASL: `create EmailSuppression`.
  - `DELETE /api/email/suppressions/unsubscribes/:id` y `DELETE /api/email/suppressions/bounces/:id` — devuelven 204, 404 si no existe en tenant. CASL: `delete EmailSuppression`.
  - Nuevos métodos `SuppressionService.deleteUnsubscribe(id)` / `deleteBounce(id)` con `deleteMany` por scoped (cross-tenant safe).
  - DTO `CreateUnsubscribeDto` con validación condicional de `campaignId` cuando `scope=CAMPAIGN`.
- **Tests**: `suppressions.controller.spec.ts` reescrito — 11 casos cubren default/limit/clamp/cursor/filtro email/paginación/create con scope GLOBAL+CAMPAIGN/delete OK+404 (unsub y bounce). Total 25/25 ✅ en módulo suppression.
- **Frontend**: nueva página `/dashboard/email/suppressions` con dos Tabs (Unsubscribes / Bounces). Cada tabla muestra columnas relevantes (email, scope/code, source, reason/description, fecha, acción borrar) con paginación "Cargar más". Buscador por email (Enter o botón Buscar). Dialog "Agregar manual" — sólo permite scope GLOBAL para uso manual (CAMPAIGN se administra automáticamente vía link de unsubscribe). Confirm dialog antes de borrar. NavRow en sidebar con icono `BlockIcon`.
- **Notas**: el listado de unsubscribes incluye `source` como chip (manual / link / webhook-ses) para diferenciar origen — los provenientes de webhook SES no son borrables sin perderlos hasta el siguiente envent.

### Fixed
- **Campaign queda en PROCESSING para siempre tras enviar** — el worker marcaba reports `SENT/FAILED/SUPPRESSED` pero nunca transicionaba la campaign a `COMPLETED`. Agregado `EmailWorkerService.maybeCompleteCampaign(campaignId, teamId)` que cuenta reports `PENDING` y, si no quedan, hace `updateMany({ where: { id, status: 'PROCESSING' }, data: { status: 'COMPLETED' } })` (guard de status hace el update idempotente entre workers concurrentes). Se invoca tras cada transición terminal de report y emite `email.report.updated` para refrescar la UI. Tests worker: 7/7 ✅ (sumamos 2 casos).
- **Loop infinito de `GET /api/email/campaigns/:id/reports`** en `CampaignSendsSection` — `useApi()` devuelve un objeto nuevo por render, así que `loadFirstPage` cambiaba siempre y disparaba el `useEffect`. Sacado de las deps; ahora sólo refetch ante cambio de `campaignId` / `statusFilter` / `refreshKey`.

### 3.C.4.b — Drill-down per-campaign de envíos y eventos
- **Backend**: `EmailCampaignsService.listReports(campaignId, { cursor, limit, status })` — paginación cursor (default 50, máx 200), filtro opcional por `EmailReportStatus`, incluye `contact: { id, email, name }` y `_count.events`. `EmailCampaignsService.listReportEvents(campaignId, reportId)` con verificación de pertenencia a la campaign + scope tenant; devuelve OPEN/CLICK con `targetUrl/targetDomain`, `ip`, `userAgent`, `deviceFamily`, `osName/osVersion`, `browserName/browserVersion`, ordenados cronológicamente.
- **Endpoints**: `GET /api/email/campaigns/:id/reports?status=&cursor=&limit=` y `GET /api/email/campaigns/:id/reports/:reportId/events`. Ambos con `@CheckPolicies('read', 'Campaign')`.
- **Frontend**: nuevo `CampaignSendsSection.tsx` con tabla paginada (botón "Cargar más" cuando hay nextCursor), filtro select por estado (Todos/Pendientes/Enviados/Fallidos/Bounced/Complaints/Suprimidos), columnas con email+nombre del contacto, chip de estado con color, fechas de envío / 1ª apertura / 1er click, count de eventos, ⚠ error en tooltip cuando aplica. Drill-down dialog con timeline cronológico: chip OPEN/CLICK, timestamp, link clickable al `targetUrl` (con icono `OpenInNew`), línea con IP+device+OS+browser, UA completo en pie. Refresh automático ante eventos socket (vía `refreshKey={liveTick}`).
- **Integración**: la sección aparece en `CampaignDetailPage` solo si `_count.reports > 0`, debajo de Resultados y arriba de Contactos.

### 3.C.4.a' — Verify automático de cuentas SMTP + reintento manual
- **Backend**: nuevo `EmailSenderService.verifyAccount(account)` que valida credenciales sin enviar email — para SMTP usa `transporter.verify()` de nodemailer (handshake + AUTH); para SES usa `GetAccountCommand` (cheap call que requiere credenciales válidas). Devuelve `{ ok }` o `{ ok: false, error }` y nunca lanza.
- **`SmtpAccountsService.create/update` ahora corren verify automáticamente** y setean `isActive` según el resultado: si verifica OK → activa, si falla → se guarda igual pero inactiva (con `error` para mostrar al usuario). `isActive` deja de ser editable manualmente — pasa a ser system-controlled.
- Nuevo endpoint `POST /email/smtp-accounts/:id/verify` + método `verify(id)` en el service para reintentar bajo demanda (caso típico: usuario edita el password con app-password de Gmail y vuelve a verificar).
- **Tests**: 14/14 ✅. Sumamos 4 casos: `create activa si verify OK`, `create deja inactiva si verify falla`, `verify reactiva cuenta inactiva`, `verify desactiva cuenta activa que ya no responde`.
- **Frontend**: dialog editor sin switch isActive (system-controlled, con leyenda explicativa). Nuevo botón "Verificar conexión" (icono `VerifiedIcon`) en cada fila. El chip "Inactiva" muestra el motivo del último fallo en tooltip (`ErrorOutlineIcon`). Snackbar al guardar diferencia entre "creada y verificada (activa)" vs "creada pero la verificación falló: …".
- **Rationale**: caso real reproducido por el usuario — alta de cuenta Gmail con password normal, todo OK, y recién al test send llegaba el error `534-5.7.9 Application-specific password required`. Ahora el feedback llega al guardar.

### 3.C.4.a — SMTP accounts UI + test send (BLOCKER resuelto)
- **Backend**: nuevo `TestSmtpAccountDto` (`smtp-accounts.dto.ts`) y método `SmtpAccountsService.testSend(id, dto)` que carga la cuenta dentro del scope del tenant, valida que esté activa, y delega en `EmailSenderService.sendForAccount()` para mandar un email autocomposeado ("[Massivo] Test de cuenta SMTP …"). Endpoint `POST /email/smtp-accounts/:id/test` con `@CheckPolicies('update', 'SmtpAccount')`.
- **Tests**: `smtp-accounts.service.spec.ts` extendido con 4 casos para `testSend` (envío OK, NotFound, BadRequest si inactive, BadRequest si sender lanza). Total 9/9 ✅.
- **Frontend**: nueva ruta `/dashboard/email/smtp-accounts` con `SmtpAccountsPage.tsx`. Tabla con name/provider chip/host:port/from/estado/acciones (test send, edit, delete). Dialog crear/editar con campos completos (provider smtp|ses con helper, password opcional al editar, sesConfigSet visible solo si provider=ses, switch isActive en edición). Dialog "Enviar prueba" que pide email destino y muestra messageId al éxito. NavRow nuevo en sidebar Email ("Cuentas SMTP", icon `DnsIcon`).
- **Impacto**: ya no hace falta SQL para crear cuentas SMTP — el onboarding de un equipo nuevo se puede completar 100% por UI.

### Docs — `MIGRATION_PLAN.md` v2.0 (reescritura tras audit exhaustivo de AMSA)
- **Audit feature-por-feature** de AMSA Sender (`backend/src/modules/*`, `backend/src/workers/*`, `frontend/src/features/*`, schema Prisma, crons): listado completo de capacidades a portar.
- **Plan reorganizado** con sub-fases granulares ejecutables (estilo `3.A`/`3.B`/`3.C.1...`) marcando estado real (✅/🟡/🆕/⛔).
- **Fase 3** dividida en `3.A` (infra) ✅, `3.B` (tracking/suppression/SES) ✅, **`3.B'`** (One-Click RFC 8058, bounce DSN parsing, EmailEvent metadata extendida) 🆕, `3.C` (campañas + frontend) parcial, **`3.C.4`** (frontend restante: SMTP UI con test send, suppressions UI, drill-down events, métricas, live processing, manual send, preview) 🆕, **`3.C.5`** (pausar/reanudar/forzar cierre) 🆕, **`3.D`** (reportes consolidados con export CSV/XLSX) 🆕.
- **Fase 4** expandida en 11 sub-fases (4.A envío + rate limit per-config / 4.B KMS / 4.C webhook / 4.D sync templates / 4.E campañas + acciones control / 4.F inbox full / 4.G respuestas rápidas / 4.H opt-out / 4.I welcome msg / 4.J live dashboard / 4.K botones templates).
- **Fase 5 nueva** — **Contacts unificados con `externalId` + Timeline cross-canal** (reemplaza módulo `Deudores` de AMSA, generalizado): sub `Contact.externalId` con `@@unique([teamId, externalId])`, `ContactTimelineService` agregador cross-canal, búsqueda avanzada, ficha con timeline, reportes consolidados.
- **Fase 7 nueva** (ex 6) — IA con interface `LlmProvider` y dos implementaciones (`GeminiProvider` + `BedrockProvider`), elección por `AI_PROVIDER` env var + feature flag (operador elige, no usuario final). BYO API key opcional por tenant.
- **Fase 8 nueva** — **Scheduler genérico de reportes**: `ScheduledTask` extendido con `kind` enum (REPORT_EMAIL_SUMMARY/WAPI/CONTACT_ACTIVITY/BOUNCES/SUPPRESSIONS/CUSTOM), engine BullMQ scheduled, `ReportGenerator` interface, entrega por email con adjunto CSV/XLSX (S3 link para >5MB), UI CRUD + ejecución manual + historial.
- **Fase 9 nueva** — Dev Simulator (panel interno gated por `ENABLE_DEV_SIMULATOR` o flag por org): endpoints `/api/dev/simulator/*` (mensaje, status, button, image, doc, audio, sticker, contact, reaction).
- **Fases 10/11/12** — ex 7/8/9 (compliance + admin / hardening + prod / lanzamiento).
- **Excluidos del MVP** confirmados: WhatsApp Web.js (legacy), Gmail OAuth read (reemplazado por reply-to del cliente).
- **Sección nueva** "Mapa AMSA Sender → Massivo App": tabla con cada módulo de AMSA, su destino en Massivo, fase y estado (✅/🟡/🆕/⛔).
- Stack actualizado: AI con Gemini 1.5 Flash + AWS Bedrock (Claude/Nova) switcheable.
- Modelo `Contact` actualizado: agregar `externalId String?` con `@@unique([teamId, externalId])` cuando arranque Fase 5.

### Added — Fase 3 sub-C.3.e (UX polish: notify + confirm + skeletons + responsive)
- **`NotifyProvider`** (`apps/frontend/src/feedback/NotifyProvider.tsx`): Snackbar global bottom-right con hook `useNotify()` (`success/error/info/warning/notify`). Errores duran 8s, resto 4s. Alert filled con close button.
- **`ConfirmProvider`** (`apps/frontend/src/feedback/ConfirmProvider.tsx`): hook `useConfirm()` Promise-based. Soporta `destructive` (botón rojo), `title`, `confirmLabel`, `cancelLabel`. Se usa en delete de templates y campañas + send de campaña.
- **Skeletons** en listas (templates, campañas, dashboard) durante loading inicial.
- **Responsive**: tablas ocultan columnas secundarias en `xs`/`sm`, AppLayout usa `Drawer` mobile en lugar de sidebar persistente, snackbars adaptados.
- **Provider order** en `main.tsx`: `ColorModeProvider > MuiThemeWithMode > ClerkWithTheme > NotifyProvider > ConfirmProvider > TeamProvider > BrowserRouter > App`.

### Added — Fase 3 sub-C.3.d (Realtime dashboard email.report.updated)
- **`CampaignsListPage`** suscrita al socket: en `email.report.updated` re-fetcha la lista (debounced backend ya coalesce 1s).
- **`CampaignDetailPage`** suscrita filtrando por `campaignId` del payload: re-fetcha report en cada update. Counts (PENDING/SENT/FAILED/BOUNCED/COMPLAINED/SUPPRESSED) + opens/clicks/uniqueOpens/uniqueClicks live.
- **`useTeamSocket()`** ya provisto en 3.C.3.a — consumido aquí por primera vez en producción.

### Added — Fase 3 sub-C.3.c (Frontend campaigns: list + detail + CSV + send)
- **`CampaignsListPage`** (`/dashboard/email/campaigns`): tabla MUI con `name/status/template/smtp/contacts/sent/scheduledAt/updatedAt` + chips de status coloreados + botones edit/delete + CTA "Nueva campaña". Dialog de creación con name + (opcional) template/smtp/scheduledAt. Confirm() destructive antes de delete.
- **`CampaignDetailPage`** (`/dashboard/email/campaigns/:id`): edita name/templateId/smtpAccountId/scheduledAt solo si `status ∈ {DRAFT, SCHEDULED, PAUSED}`. Bloque de carga de contactos por **CSV paste** con detección de header `email,name` (o filas planas). Botón **Enviar** con confirm() — POST `/:id/send` (202). Panel de report con counts + opens/clicks.
- **`features/email/campaigns/types.ts`**: `CampaignListItem`, `CampaignDetail`, `CampaignReport`, `CreateCampaignPayload`, `UpdateCampaignPayload`, `CampaignContactInput`, `SmtpAccountListItem`, `CampaignStatus`.
- **CSV parser**: detecta header (`email`/`name`) case-insensitive, normaliza email a lowercase+trim, ignora filas vacías, máx 5000 filas.

### Added — Landing page + GitLab-style layout + Clerk theming
- **`HomePage`** (`apps/frontend/src/pages/HomePage.tsx`): landing moderno estilo SaaS con hero (gradient text), navbar sticky con blur, 6 features grid (Email/WhatsApp/Realtime/Multi-tenant/Analytics/Secure), CTA paper con benefits + dual button, footer. Patrón `<SignedIn><Navigate to="/dashboard"/></SignedIn><SignedOut>...</SignedOut>` para redirección automática.
- **`AppLayout`** (`apps/frontend/src/layouts/AppLayout.tsx`) — **rediseño GitLab-Cloud**: topbar fijo full-width (`TOPBAR_HEIGHT=56`) con hamburguesa mobile, brand gradient, theme toggle, `<UserButton/>`. Body con sidebar sticky desktop / `Drawer` mobile + main scrollable (max-width 1400).
- **`Sidebar`** (`apps/frontend/src/layouts/Sidebar.tsx`) — **colapsable**: `SIDEBAR_WIDTH=248` / `SIDEBAR_COLLAPSED_WIDTH=64`. Estado persistido en `localStorage['massivo:sidebarCollapsed']`. Cuando colapsada, OrgSwitcher se oculta y NavRows muestran solo icono + tooltip a la derecha. NAV_GROUPS: General/Email/WhatsApp/Datos/Cuenta (con disabled "pronto" para los no implementados).
- **`ClerkWithTheme`** (`apps/frontend/src/theme/ClerkWithTheme.tsx`): wrapper de `<ClerkProvider>` que sincroniza `baseTheme` de `@clerk/themes` (`dark` o undefined) con el modo MUI vía `useColorMode()`. Variables de color custom (colorPrimary `#5B5BD6`, colorBackground/Text/InputBackground en dark) y `localization={esES}` de `@clerk/localizations` (Clerk en español).
- **Auth redirects**: `SignInPage` y `SignUpPage` con `forceRedirectUrl="/dashboard"` y `fallbackRedirectUrl="/dashboard"`.
- **`DashboardHome`** (`apps/frontend/src/pages/DashboardHome.tsx`): greeting + ActionCards a Campaigns/Templates como entrada al feature email.

### Changed — Theming dark/light pulido
- **`ThemeProvider`** dividido: `ColorModeProvider` (context-only) + `MuiThemeWithMode` (consumer que construye MUI theme). Permite que `ClerkWithTheme` consuma el contexto y sincronice baseTheme.
- **Paleta dark**: `background.default=#0b0d10`, `paper=#14171c`, `divider=rgba(255,255,255,0.08)`. Light: `#fafafa` / `#ffffff`. Primary `#5B5BD6` en ambos.
- **Component overrides**:
  - `MuiPaper` dark con `boxShadow` custom + inner ring (`inset 0 0 0 1px rgba(255,255,255,0.05)`) — solo si no es `outlined` y `elevation > 0`. `backgroundImage: 'none'` para evitar el filtro lavado MUI.
  - `MuiTableContainer` dark con la misma sombra (resuelve "tablas no se ven en modo oscuro").
  - `MuiCssBaseline` con scrollbar custom (color por modo) + `::selection` con tinte primary.
- **Deps nuevas**: `@clerk/themes`, `@clerk/localizations`.

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
