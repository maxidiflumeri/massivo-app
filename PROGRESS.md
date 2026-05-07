# Massivo App — Estado del proyecto

> **Archivo vivo.** Cualquier IA o desarrollador que retome el trabajo debe leer este archivo + `MIGRATION_PLAN.md` antes de avanzar. Al terminar cada sesión, **actualizá esta página** y commiteá los cambios.

---

## Prompt de arranque para IAs (copiar/pegar al iniciar sesión)

```
Estoy retomando la migración de AMSA Sender → Massivo App. Antes de proponer
  nada, leé estos archivos en este orden y resumime el estado actual:
  1. PROGRESS.md — buscá la sección "Estado actual" (línea ~30) y la última                                                                                                                          bitácora "2026-05-04 — Sesión 25" para ver qué quedó hecho y los bugs
     resueltos al cierre.                                                                                                                                                                         2. MIGRATION_PLAN.md — para entender el roadmap general.                                                                                                                                        3. CHANGELOG.md — sección [Unreleased], últimas entradas 4.F.3, 4.F.4 y 4.G.                                                                                                                                                                                                                                                                                                                    Contexto rápido del último cierre:
  - 4.F.3 (backend inbox WhatsApp) ✅, 4.F.4 (frontend inbox) ✅, 4.G (admin de
    quick replies) ✅. Smoke test funcional pasó (curl simulado al webhook crea
    conversación, aparece en /dashboard/wapi/inbox vía socket).
  - Hay 4 commits locales sin pushear sobre origin/main (si todavía no pusheé,
    preguntame antes de hacerlo).

  Convenciones del repo (recordatorio):
  - TypeScript strict, prohibido `any` salvo justificación.
  - Logger Winston, nunca console.*.
  - DTOs con class-validator en endpoints.
  - UI con dark/light mode.
  - Toda query a modelo tenant-aware DEBE filtrar por organizationId + teamId
    (vía prisma.scoped).
  - Mensajes de commit en español.

  Próximo paso pendiente (según PROGRESS.md): smoke test extendido del inbox
  en multi-pestaña y después decidir entre 4.F.2.d (media upload Meta) o 4.H
  (opt-out automático con keywords). NO avances sin que te confirme cuál de
  los dos elijo.

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

- **Fase actual:** Fase 4 — Canal WhatsApp Cloud API (**sub-A ✅, sub-B ✅, sub-C ✅, sub-D ✅, sub-E ✅, sub-F.1 ✅, sub-F.1.a ✅, sub-F.1.b ✅, sub-F.1.c ✅ (mapping vars), sub-F.2.a ✅, sub-F.2.b ✅, sub-F.2.c ✅ (markdown + dark mode preview), sub-F.2.d ✅ (media upload Meta + storage local + render por tipo), sub-F.3 ✅ (inbox backend), sub-F.4 ✅ (inbox frontend), sub-G ✅ (quick replies admin), sub-H ✅ (opt-out por keyword + worker guard), sub-I ✅ (welcome message), sub-J ✅ (live dashboard WAPI), sub-P ✅ (webhook URL org-scoped + reveal verify token), sub-K ✅ (botones interactivos: INBOX/BAJA/IGNORAR + payload variable), sub-L (MVP ✅ + ✅ chat ida-vuelta con `isTestMode`; pendiente virtual numbers + audit log), sub-L.1 ✅ (filtro inbox por línea), sub-M ✅ (`isTestMode` + chat simulado), sub-N ✅ (bot guiado por número con menús + handoff), sub-N.1 ✅ (editor visual react-flow + nodo MESSAGE encadenable), sub-N.2 ✅ (CAPTURE/MEDIA/CONDITION + interpolación `{{var}}`), sub-O.1 ✅ (multi-topic + router + feature flag env+per-org), sub-O.2 ✅ (UI multi-topic + router en el editor visual), sub-O.3 ✅ (Sandbox + Draft/Publish — Bloques 1-3 ✅: backend draft/publish + sandbox engine + UI con `SandboxDrawer` chat; falta smoke E2E manual), sub-O.4 ✅ (variables declarativas con defaults aplicados al iniciar sesión + panel CRUD + VarPicker en TextFields + Selects en CAPTURE.saveAs y CONDITION.var), sub-O.5 ✅ (nodo SET_VAR — asignación interna con coerción por tipo), sub-O.6 ✅ (suspensión bot + estado WAITING)**; pendiente **smoke E2E 4.O.3/4.O.6 con bot real, virtual numbers + audit log de 4.L, sub-Q (throttle configurable por línea/campaña — planeado en MIGRATION_PLAN, no implementado)**)
- **Fases completadas:** Fase 0 ✅ + Fase 1 ✅ + Fase 2 ✅ + **Fase 3 ✅** (3.E inbound postergado, decisión del dueño)
- **Última actualización:** 2026-05-07 (Sesión 40 — **4.P Webhook URL org-scoped**. Schema `Organization.webhookSlug String @unique` (formato `wbh_<22-24 chars>`) + migration `20260511100000_organization_webhook_slug` con backfill `wbh_<md5>` para orgs existentes; nuevas orgs reciben slug desde `crypto.randomBytes(18).toString('base64url')` en `ClerkWebhookService.handleOrganizationCreated`. Nuevo `OrganizationsModule` con endpoint `POST /api/orgs/me/webhook-slug/regenerate` (gate `manage Organization`). `WapiWebhookController` migrado de URL única global a rutas `:slug` (`GET/POST /api/webhooks/wapi/:slug`) — verify y receive filtran `WapiConfig.organizationId = orgId`; cache slug→orgId in-memory TTL 60s; slug inexistente → 404 sin info-leak. Endpoint `GET /api/wapi/configs/:id/reveal-secrets` (gate `manage Organization`) que devuelve `{ webhookVerifyToken }` en claro con log WARN para auditoría. `MeOrganization.webhookSlug` surface en `/api/me/context`. Frontend `WapiConfigsPage`: card top-level con la URL completa (`{API_BASE_URL}/api/webhooks/wapi/{slug}`) + botón copiar + botón **Regenerar URL** (gated OWNER/ADMIN, confirm destructive); por fila botón llave para revelar/ocultar verify token + botón copiar. Tests `wapi-webhook.controller.spec.ts` reescritos: 16/16 verde — scoping por slug, cache (segunda llamada no re-consulta organization), multi-config misma org, slug inexistente → 404, firma inválida → 403, dev sin appSecret, payloads ignorados. Backend typecheck ✅ + frontend typecheck ✅. **No mantenemos URL legacy**: la ruta antigua se reemplaza directo (estamos pre-launch). Migración pendiente de aplicar localmente: `prisma migrate reset` lo aplicaría junto a otras drift (decidir cuándo). Sesión 39 anterior — **4.J Live Dashboard WAPI**. Backend: nuevo módulo `wapi/live` con `WapiLiveService.snapshot()` que paraleliza tres recolectores: `collectCampaigns(since5min)` (findMany top 25 con status PROCESSING/PAUSED + dos `groupBy` paralelos sobre WapiReport para totales por (campaignId,status) y throughput 5min), `collectConfigs(since24h)` (findMany configs activas + groupBy SENT 24h + segundo findMany para mapear campaignId→configId — Prisma groupBy no agrupa por relaciones), `collectInbox()` (3 counts paralelos UNASSIGNED+escalated, WAITING, escalated total + findFirst de la más antigua sin asignar). Endpoint `GET /api/wapi/live/snapshot` con guards Clerk+Tenant+Policies(read Campaign). Spec con 4 tests (478/478 verde). Fix typing groupBy: separar awaits y castear el resultado, no la promise — el `as Promise<…>` dentro de `Promise.all` rompe la inferencia de overload. Frontend: nueva página `/dashboard/wapi/live` con 3 widgets en stack (Campañas en curso con tabla + funnel chips + LinearProgress + throughput; Uso de líneas con barras color por umbral 80/100% y badge TEST; Inbox snapshot con 3 KPI cards + edad de la más antigua + link a inbox); chip "● En vivo" con FiberManualRecordIcon (verde/gris según `socket.connected`); re-fetch debounced 500ms ante eventos `wapi.report.updated`/`wapi.report.log`/`wapi.conversation.updated` con coalesce vía `inFlightRef+pendingRef` para no apilar requests; `liveApi.snapshot(api)` + types mirror del backend; sidebar entry "Dashboard live" (MonitorHeartIcon) primero del grupo WhatsApp; ruta `wapi/live` en App.tsx. Frontend typecheck ✅ limpio. Sesión 38 anterior — **4.O.6 Suspensión bot + estado WAITING**. Backend: schema Prisma extendido con `escalated`/`botSuspended`/`waitingUntil`/`lastAssignedUserId` en `WapiConversation` + `botWaitingTtlMin` en `WapiConfig` + valor `WAITING` en enum `WapiConversationStatus`; engine guard inicial (`if botSuspended return`) + acción HANDOFF marca `escalated:true, botSuspended:true` y reabre si estaba RESOLVED; webhook detecta WAITING → vuelve a UNASSIGNED al recibir mensaje del cliente; button INBOX setea `priority+escalated+botSuspended`; inbox service filtra siempre por `escalated=true` (uniforme cross-rol — admin scope verificado), `mine` retorna OR(ASSIGNED-mías + WAITING-lastMine), `assign/take` setean `botSuspended+escalated` y limpian `waitingUntil`, `resolve` apaga `botSuspended` y `waitingUntil` (mantiene escalated), `reopen` reactiva `botSuspended`; nuevo endpoint `POST /api/wapi/inbox/conversations/:id/hold` → `putOnHold` calcula `waitingUntil = now + cfg.botWaitingTtlMin*60000` y emite socket; nuevo worker `WapiBotWaitingExpirerService` (setInterval 5min, cross-tenant, findMany+update individuales, `unref()` para no bloquear procesos) que devuelve WAITING vencidas a UNASSIGNED. 474/474 tests verdes (5 nuevos en inbox, 4 nuevos en expirer, 1 fix en me.service.spec por ConfigService dep). Frontend: `WapiConversationStatus` con WAITING + `waitingUntil`/`lastAssignedUserId` en list/detail/event types + `inboxApi.hold()`; `ConversationHeader` con botón "Poner en espera" (PauseCircleOutlineIcon) visible solo si isMine, `StatusChip` muestra WAITING con countdown vivo (`useCountdown` tick 30s) y chip "lo tenías vos" cuando `lastAssignedUserId===currentUserId`; `WapiInboxPage.handleHold` + `onUpdated` reducer propaga `waitingUntil`/`lastAssignedUserId`; `ConversationList` muestra chip "En espera" en filas WAITING; `WapiSimulatorChatPage` actualizado con `onHold`. Frontend typecheck ✅ (solo errores pre-existentes en bots/validateClient/RouterPanel). Migración aplicada: `20260510120000_wapi_bot_suspension_waiting`. Sesión 37 anterior — 4.O.5 Nodo SET_VAR.)
- **Branch principal:** `main`
- **Próximo paso al volver**: smoke test de **4.N + 4.N.1 (bot guiado con editor visual)** end-to-end. Pasos detallados:
  0. **Editor visual nuevo** (4.N.1): `/dashboard/wapi/bots` ahora es un canvas estilo draw.io (react-flow). Probar: agregar nodos con Toolbar (MENU/MESSAGE/HANDOFF), drag para mover, conectar handles (círculos violetas) → setea `nextNodeId`, click sobre nodo → drawer derecho para editar texto/opciones/escalate, botón AutoFix (varita) reordena con dagre. Click sobre flecha + Delete borra la conexión. Eliminar nodo limpia referencias.
  0a. **Probar nodo MESSAGE**: armar `start (MESSAGE: "Hola!" → bienvenida) → bienvenida (MESSAGE: "¿Qué necesitás?" → menu1) → menu1 (MENU)`. En `/dashboard/dev/wapi/chat` con bot ON, mandar "hola" → llegan 3 mensajes en cadena (2 textos + 1 menú con botones). El operator-view filtra los `bot-message` y `bot-menu` (solo ve handoff o mensajes humanos).
  Resto del smoke (igual que antes):
  1. Backend + frontend running, con `ENABLE_DEV_SIMULATOR=true` y `VITE_ENABLE_DEV_SIMULATOR=true`.
  2. Asegurar que la `WapiConfig` esté en `isTestMode=true` (sino el sender intenta pegarle a Meta y falla).
  3. Abrir `/dashboard/wapi/bots`, seleccionar la config, dejar el flow por defecto (MENU → HANDOFF), tildar **Bot habilitado**, Guardar. Si hay error de validación la UI lo muestra con Alert.
  4. Abrir `/dashboard/dev/wapi/chat`, pickear la misma config. Mandar texto desde el "cliente virtual" (ej "hola"). Esperado:
     - El thread del operador muestra el mensaje del cliente.
     - Inmediatamente el bot manda el menú con botones (queda persistido como `WapiMessage` con `system.kind='bot-menu'`, visible en el thread).
     - En DB: `SELECT * FROM "WapiBotSession" WHERE phone='<phone>'` → debería existir una row con `currentNodeId='start'` (o el id que armaste).
  5. Para simular el reply al botón del bot, hacer `POST http://localhost:3001/api/dev/wapi/simulate/inbound/button` con `{ "configId": "...", "from": "<phone>", "buttonId": "bot:<opcionId>", "buttonTitle": "..." }`. Verificar que el bot avanza al siguiente nodo (curl debe verse en logs del backend, y aparece nuevo mensaje del bot en el thread).
  6. Llegar a un nodo HANDOFF: el bot manda el texto final, cierra la sesión (`endedReason='handoff'`), y si el HANDOFF tenía `escalate=true`, la conversación queda con ⭐ en `/dashboard/wapi/inbox`.
  7. Tomar la conversación con "Tomar" en el inbox. Mandar otro texto del cliente: el bot ya NO debería responder (el assign cierra cualquier sesión activa con `endedReason='operator-assign'`).
  8. Resolver y reabrir → mandar texto del cliente de nuevo: como ya no hay sesión activa, el bot rearranca con el startNode.
  9. Edge case: editar el flow a algo inválido (MENU sin opciones), tildar enabled, Guardar → backend devuelve 400 (`BadRequestException`) y la UI muestra el error.

  **Todo el detalle del 4.N en CHANGELOG sección "4.N — Bot guiado por número" (incluye guía paso-a-paso) y MIGRATION_PLAN.md sub-sección 4.N.**

  Después del smoke: commitear, y el siguiente bloque pendiente es **4.J (live dashboard de campañas WAPI)** o cerrar **4.L** completo (virtual numbers + audit log). Decidir cuál arrancar.
- **Cómo testear el inbox sin Meta (recordatorio)**:
  1. Tener una `WapiConfig` activa con `appSecretEnc = NULL` (en dev el webhook acepta sin verificar firma — ver `wapi-webhook.controller.ts:156-162`).
  2. POST a `http://localhost:3001/api/webhooks/wapi` con payload Meta válido (object `whatsapp_business_account`, entry → changes → field `messages`, value con `metadata.phone_number_id`, `contacts[]` y `messages[]` con `from`, `timestamp`, `type=text`, `text.body`).
  3. La conversación aparece en `/dashboard/wapi/inbox` tab "Sin asignar" en tiempo real vía socket.
- **Último commit:** Sesión 27 — **4.L MVP Dev Simulator de WhatsApp** (módulo `dev` en backend con guard `ENABLE_DEV_SIMULATOR=true`; endpoints `POST /api/dev/wapi/simulate/inbound/text|media|reaction` y `POST /api/dev/wapi/simulate/status` que arman payloads Meta-shaped y los inyectan en `WapiWebhookService.process(...)`; webhook + media services extendidos con `mediaOverrides` map y `persistInboundLocal` para saltar Meta Graph en uploads inbound simulados; UI nueva `/dashboard/dev/wapi/simulator` con 4 cards (texto/media/reacción/status) y selector de WapiConfig; sidebar y router gateados por `VITE_ENABLE_DEV_SIMULATOR=true`. 359/359 tests backend ✅ (no se agregaron tests nuevos para el simulator — es una utilidad de dev). Sesión 26 anterior — **4.F.2.d media WhatsApp end-to-end** (backend `WapiMediaService` con upload/download Meta + storage local sha256-dedup; `WapiSenderService.sendMediaById`; endpoints `POST /api/wapi/inbox/conversations/:id/media` (multipart) y `GET /api/wapi/inbox/messages/:id/media` (StreamableFile autenticado); webhook descarga inbound automáticamente; modelo `WapiMessage` extendido con 7 campos media + índice por sha256; frontend composer con botón Attach (Imagen/Doc/Audio/Video) + preview pre-envío con caption opcional; `MessageBubble` extraído a archivo aparte con renderers por tipo (imagen click-to-zoom, video/audio con controls, documento como tarjeta descargable, sticker compacto, reacción como pill). 359/359 tests backend ✅. Sesión 25 anterior — **4.F.4 frontend inbox + 4.G quick replies admin**. Nueva ruta `/dashboard/wapi/inbox` con layout 2 columnas (lista + thread). Lista con tabs (Mías / Sin asignar / Otras / Resueltas), search debounced, paginación cursor, badges de no-leído. Thread estilo WhatsApp Web con fondo dotted theme-aware, agrupación por día, burbujas con tail, receipt icons (✓/✓✓/azul), markdown WhatsApp reusando `renderWhatsAppMarkdown` de 4.F.2.c. Header con avatar, status chip, acciones (Tomar/Resolver/Reabrir/MarkRead/Asignar/Liberar). Composer con textarea multiline, dropdown de quick replies por `/atajo` (filtro live, navegable con flechas, Enter/Tab para insertar), banner cuando la ventana 24h está cerrada o la convo está RESOLVED, draft autoguardado en localStorage por conversación. Dialogs `AssignDialog` (lista del team con buscador + avatares) y `ResolveDialog` (nota opcional). Listeners socket sobre `wapi.message.new` (append + reorder lista) y `wapi.conversation.updated` (refresca status/asignación). Auto mark-read al abrir conversación con no-leídos. Página `/dashboard/wapi/quick-replies` para CRUD admin con validación de regex de shortcut. Sidebar actualizado con entradas Inbox y Respuestas rápidas. Typecheck frontend ✅.
- **Commits anteriores:** Sesión 24 — **4.F.3 backend inbox WhatsApp**. Modelos Prisma `WapiQuickReply` + `WapiResolutionNote` (este último con historial para resolver↔reabrir múltiples veces). Subjects CASL nuevos `Conversation` y `QuickReply` con permisos para MEMBER. Módulos `wapi/inbox` y `wapi/quick-replies` con CRUD completo. Endpoints inbox: list con filtros por tab (mías / sin asignar / otras / resueltas / all), search, configId, paginación cursor; get + messages con cursor; send text con validación de ventana 24h y auto-asignación; mark read/unread; take/assign/unassign; resolve con nota opcional; reopen; list de notas. Webhook ahora emite `wapi.message.new` y `wapi.conversation.updated` (además del legacy `wapi.message.inbound`) y reabre automáticamente si entra mensaje a conversación RESOLVED. Tests: 12 casos pasando (8 inbox + 5 quick-replies). Migración aplicada: `20260504232310_wapi_inbox_quick_replies_resolution_notes`. **Tras pull, reiniciar backend** para que `prisma generate` corra con el DLL liberado.
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

| AMSA Sender (origen)                                 | Massivo App (destino)                                           | Cuándo se porta |
| ---------------------------------------------------- | --------------------------------------------------------------- | --------------- |
| `backend/src/modules/wapi/`                          | `apps/backend/src/modules/wapi/` (multi-tenant)                 | Fase 4          |
| `backend/src/modules/email/`                         | `apps/backend/src/modules/email/` (multi-tenant)                | Fase 3          |
| `backend/src/workers/wapi-worker.service.ts`         | `apps/backend/src/workers/` (con tenant context)                | Fase 4          |
| `backend/src/workers/email-worker.service.ts`        | `apps/backend/src/workers/` (con tenant context)                | Fase 3          |
| `backend/src/modules/ai/gemini.service.ts`           | `apps/backend/src/modules/ai/`                                  | Fase 6          |
| `frontend/` (componentes Unlayer, inbox, dashboards) | `apps/frontend/src/features/`                                   | Fases 3-6       |
| `prisma/schema.prisma` (modelos de dominio)          | `packages/prisma/schema.prisma` (con `organizationId`/`teamId`) | Fase 1-2        |

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
- [x] **4.E — Campañas WAPI** ✅ (Sesión 21 / 2026-05-04): migration `add_canceled_to_wapi_report_status` (enum `CANCELED`). DTOs `Create/Update/AddContacts/Contact` con phone E.164 lenient (`^\+?[0-9]{6,20}$`). `WapiCampaignsService` extendido con `create`/`findAll`/`findOne` (con includes template+configRel+\_count)/`update`/`remove`/`addContacts`/`pause`/`resume`/`forceClose`/`listReports`/`getReport`. `forceClose` ahora marca PENDING como `CANCELED` (antes FAILED), funnel limpio. `getReport` devuelve counts por status + funnel `{sent,delivered,read,failed}` derivado de timestamps WapiReport. `WapiWorkerService` con early-exit si `report.status≠PENDING` (fix de bug latente: jobs huérfanos post-forceClose enviaban igual). Branch campaign COMPLETED|FAILED + report PENDING → ahora marca CANCELED. Endpoints completos en controller. Tests 24/24 (service) + 1 nuevo (worker). Backend full **325/325 ✅**. Pendientes: dedup de phone en `addContacts` (consistente con email), cron de campañas SCHEDULED (Fase 8).
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
- [x] Generar primera migración + seed de planes (FREE, STARTER, BUSINESS, ENTERPRISE). _(Nota: Se generó el esquema y script seed; la migración contra DB viva queda pendiente para correr localmente)_.
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

| #   | Decisión                                                                | Razón                                                                                    |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Repositorio nuevo separado de AMSA Sender                               | AMSA está vendido a Ana Maya SA y queda congelado.                                       |
| 2   | Opción A: empezar limpio, copiar lógica de AMSA selectivamente por fase | Codebase más limpio multi-tenant desde el primer commit, sin atajos heredados.           |
| 3   | Shared DB + `organizationId` + `teamId`                                 | Más barato, escala bien hasta cientos/miles de tenants.                                  |
| 4   | Postgres 16 (cambio desde MySQL de AMSA)                                | Mejor RLS, índices parciales, JSONB, mejor encaje con multi-tenant.                      |
| 5   | Jerarquía 3 niveles: Organization → Team → User                         | Estándar SaaS B2B. Org = billing, Team = aislamiento operativo.                          |
| 6   | Auth tercerizada con Clerk                                              | Ahorra 4-6 meses de auth, viene con Organizations + invitaciones + SSO.                  |
| 7   | Authz con CASL                                                          | Permisos finos de dominio, integración limpia con NestJS y Prisma.                       |
| 8   | Billing con Stripe (internacional) + MercadoPago (LATAM)                | Cobertura de ambos mercados.                                                             |
| 9   | Email con AWS SES (configuration set por tenant)                        | SMTP propio del SaaS; los clientes dan de alta cuentas remitentes para usar como `From`. |
| 10  | WhatsApp solo Business API (Meta), NO Web.js                            | Web.js no escala bien en SaaS, alto costo operativo.                                     |
| 11  | Monorepo con pnpm + Turborepo                                           | Estándar moderno, buena DX, builds incrementales.                                        |
| 12  | Node 22 LTS, pnpm 9.15                                                  | LTS actuales.                                                                            |

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

| Archivo             | Para qué                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `MIGRATION_PLAN.md` | Plan maestro inmutable. Solo se modifica si cambia una decisión arquitectónica de fondo.                 |
| `PROGRESS.md`       | Estado actual, próximo paso, decisiones, bitácora. Se actualiza en cada sesión.                          |
| `CHANGELOG.md`      | Historial de cambios entregados (features, fixes, infra, docs). Se actualiza al completar funcionalidad. |
| Commits             | Detalle granular de cada cambio. Mensajes en español, descriptivos.                                      |

---

## Bitácora de sesiones

### 2026-05-06 — Sesión 35 (Claude Opus 4.7) — Sub-fase 4.O.2 (UI multi-topic + router en el editor visual)

- **Contexto**: continuación inmediata de Sesión 34. Backend de 4.O.1 cerrado (multi-topic, router, feature flag env+per-org, BOT button action). El dueño pidió cerrar el feature con la UI: "avanza con todo el front y UI asi se termina completo y luego lo testeo completo". Antes de arrancar, hubo un mini-bloque de soporte: (1) DBeaver con `FATAL: invalid value for parameter "TimeZone": "America/Buenos_Aires"` → fix vía `dbeaver.ini` con `-Duser.timezone=America/Argentina/Buenos_Aires`; (2) "Bot guiado" no aparecía en el sidebar porque faltaba `VITE_WAPI_BOT_FEATURE_ENABLED=true` (las vars de Vite necesitan prefijo `VITE_*`); (3) `403 "Sin contexto de organización"` al entrar al editor — `WapiBotFeatureGuard` corría antes del `TenantContextInterceptor`, así que `TenantContext.current()` era null. Fix: leer `request.tenantContext.organizationId` directo (lo deja sincrónicamente el `TenantContextGuard`).
- **Tracking de tasks**: 10 tasks (#70–79) creadas y cerradas — explorar → tipos → api → validateClient → drawer (gotoTopic) → page (tabs por topic) → router panel → validación visual → smoke → tracking.
- **Frontend — `types.ts`** espejado del backend 4.O.1: `BotTopic`, `BotRouter`, `BotRouterRule`, `BotRouterRuleKind`, `gotoTopic?: string` opcional en `BotMenuOption`, `BotMessageNode`, `BotCaptureNode` (también `nextNodeId` ahora opcional), `BotMediaNode`, `BotConditionBranch`. `elseGotoTopic?: string` en `BotConditionNode`. `BotConfigSnapshot` y `UpdateBotPayload` extendidos con `botTopics: BotTopic[] | null` + `botRouter: BotRouter | null`.
- **Frontend — `validateClient.ts`** extendido: `validateClient(flow, topicIds?)` acepta `gotoTopic` como alternativa a `nextNodeId` en cada salida; helper `checkGoto` agrega errores si el topic referenciado no existe (cuando se pasan `topicIds`). Nuevas funciones `validateTopics(topics)` (cross-check de gotoTopic refs entre topics, ids únicos, format `^[a-zA-Z0-9_-]+$`) y `validateRouter(router, topicIds)` (regex compila, keywords no vacías, topic destino existe, advertencia si >1 rule kind `default`).
- **Frontend — `NodeEditorDrawer.tsx`**: nuevo helper `NextOrTopicSelect({nextNodeId, gotoTopic, allIds, topics, onChange, ...})` con select agrupado *Nodos del flow actual* + *Saltar a otro tema*, encoding interno `node:<id>` / `topic:<id>`, devuelve patch mutuamente excluyente. Aplicado a 6 puntos de salto: MENU.options, MESSAGE.next, CAPTURE.next, MEDIA.next, CONDITION.branches, CONDITION.else. `CAPTURE.retry` queda solo-nodo (decisión consciente — el retry se queda en el topic actual). Prop `availableTopics?: TopicOption[]` agregada al drawer y enhebrada por todos los sub-editors.
- **Frontend — `WapiBotsPage.tsx`** refactor mayor: state pasa de `flow: BotFlow` a `topics: BotTopic[]` + `activeTopicId: string` + `router: BotRouter` + `view: 'topic'|'router'`. Helper `materializeTopics(snap)` para backward compat: si `botTopics` no viene, materializa el `botFlow` legacy como `[{id:'default', label:'Principal', flow}]` (o un EMPTY_FLOW si tampoco hay flow). Tabs scrollables por topic con badge ⚠ por topic con errores + tab pseudo "Router". Botones add/rename/delete topic — `renameTopic` cambia id+label y reescribe `gotoTopic` en todos los flows + `topicId` en todas las rules. Auto-layout topic-by-topic en load. Save manda siempre `botTopics + botRouter` con `botFlow: null` para obsoletar el legacy.
- **Frontend — `RouterPanel.tsx`** (nuevo): selector global `defaultTopicId` (fallback) + lista de rules con reorder up/down (no drag-drop — alcanza para ≤10 rules y evita meter una dep nueva). Cada `RuleCard` muestra el destino topic resuelto (con warning si no existe). Editores por kind:
  - `TemplatePayloadEditor`: textfield regex con monospace + validación en vivo (`new RegExp(pattern)`), `extractNamedGroups(pattern)` lista las `(?<name>...)` como chips `{{name}}` (preview).
  - `KeywordEditor`: input multilínea con split por `,`/`\n`, chips por keyword.
  - `DefaultEditor`: solo selector.
- **Validación visual**: el banner contextual sólo muestra errores del topic activo (en vista canvas) o errores del router (en vista panel) — el resto de los topics quedan marcados con ⚠ en su tab. Save bloquea ON si `topicsValidation.ok && routerValidation.ok` no es true.
- **`onConnect`** ajustado: cuando se conecta drag-drop a un nodo, se limpia el `gotoTopic` del mismo destino (evita estados híbridos donde un MENU option tenga ambos seteados — el drawer ya garantiza mutex pero el drag bypass-eaba esa lógica).
- **Smoke**: `apps/frontend tsc --noEmit` ✅ + `apps/backend tsc --noEmit` ✅. Sin tests UI nuevos (alineado con la convención: validateClient y types ya están cubiertos por el espejo backend + tests unitarios de `wapi-bot.types.spec.ts`).
- **Refactor UX post-implementación (mismo día)**: el dueño revisó la UI con tabs scrollables y planteó el problema de escala: "si llego a tener 40 o 50 temas, va a ser dificil de gestionar en el formato que esta ahora". Pidió tabla con buscador como entry-point + botón de acción "ingresar al flow" por fila. Refactor:
  - **`TopicsListView.tsx`** (nuevo): tabla MUI con columnas Nombre / ID (monospace) / Nodos (chip) / Estado (✓ válido o ⚠ N error(es)) / Acciones (Editar flow + rename + delete). Buscador por nombre o ID con `InputAdornment + SearchIcon`. ⭐ icon para `defaultTopicId` del router. Empty-state con CTA "Crear tema". Botones de header: "Router (N)" (color warning si tiene errores) + "Nuevo tema".
  - **`TopicDialog.tsx`** (nuevo): modal MUI para create/rename con validación visual (label requerido <60ch, id `^[a-zA-Z0-9_-]+$`, unicidad). Reemplaza los `window.prompt` del approach previo. Warning visible cuando se cambia un id existente (cross-rewrite).
  - **`WapiBotsPage.tsx`** rewrite: state machine `view: 'list'|'topic'|'router'` (default `list`), tabs eliminados. Breadcrumb Paper "← Temas / [topic name]" o "← Temas / Router" en vistas no-list, con botón rename inline en breadcrumb del topic. Volver a la lista descarga el canvas (mejor performance con muchos topics).
  - **Smoke**: `apps/frontend tsc --noEmit` ✅ EXIT=0 post-refactor. Sin cambios de tipos/contratos backend (puro UI).
- **Bugs encontrados al testear (mismo día)** — el dueño probó el flujo en el chat-simulator y reportó: (1) el editor de keywords con split por coma confunde si querés frases con espacios ("buen día" se rompía); (2) typeando un keyword con sesión activa, el bot iniciaba el topic 'default' en lugar del topic matched. Fixes:
  - **Bug router-restart**: el `const session` de `WapiBotEngineService.handle` quedaba truthy después del `endSession('invalid-state')`, así que `if (!nextNodeId && !session)` (router resolution) nunca se evaluaba y caía al fallback "restart current topic". Cambiado a `let session` + reset a null al cerrar. Adicionalmente, **matches explícitos del router (keyword/template-payload) ahora interrumpen la sesión activa** con reason `router-restart` y arrancan el topic matched (mismo patrón que BOT button action). Los matches `default` y `defaultTopicId` siguen como catch-all (no interrumpen). `BotRouterResolution.via` agregado para distinguir tipos de match.
  - **UX KeywordEditor**: reemplazado el textfield multilínea con `Autocomplete multiple freeSolo` — chips con Enter, dedupe case-insensitive, frases con espacios sin problema.
  - **Tests**: +2 en `wapi-bot-engine.service.spec.ts` (override de sesión activa + fallback no interrumpe MENU). Specs router actualizadas con el campo `via`. Total: 68/68 ✅. Backend + Frontend tsc EXIT=0.
- **Pendiente (post-4.O.2)**:
  - Test E2E con template real + botón `BOT` + payload `OFERTA_HOSTING_99` → router con regex `^OFERTA_(?<producto>\w+)_(?<plan>\d+)$` → topic `oferta` con MESSAGE "Te interesa el {{producto}} plan {{plan}}".
  - Badge visible en los node views cuando una salida tiene `gotoTopic` (hoy queda implícito en el drawer — el rfEdges no se renderiza para inter-topic).

### 2026-05-06 — Sesión 34 (Claude Opus 4.7) — Sub-fase 4.O.1 (multi-topic + router + feature flag env+per-org)

- **Contexto**: continuación de Sesión 33. Con 4.N.2 cerrado (CAPTURE/MEDIA/CONDITION + interpolación), el dueño pidió: (1) que un mismo bot pueda tener varios "temas" para no armar un solo flow gigante; (2) un router que decida el topic según el payload del botón de un template (regex con named groups → seedData) o keyword exacto; (3) un botón nuevo `BOT` para templates (4ª acción junto a INBOX/BAJA/IGNORAR) con la regla "el payload nuevo siempre gana" (si hay sesión activa, se cierra y se arranca limpio en el nuevo topic); (4) feature flag global env-based + per-org (cobramos como add-on de plan superior). Eligió **opción B** (estricto, default false en prod, se habilita manualmente con SQL) y autorizó full autonomía: "dale anda x B y cuando termines me das el SQL para prenderlo. Avanza y no me pidas permiso para nada".
- **Schema** (`20260508100000_wapi_bot_topics_and_org_feature_flag`): `Organization.botEnabled Boolean @default(false)`, `WapiConfig.botTopics Json?`, `WapiConfig.botRouter Json?`, `WapiBotSession.currentTopicId String?`. Aplicada via SQL directa por DLL lock (mismo workaround que 4.N.2: `wsl bash -c "PGPASSWORD=… psql -h 127.0.0.1 …"` + INSERT en `_prisma_migrations`). Touchpoints sin generated types usan `as never` cast (patrón establecido).
- **Backend — tipos** (`wapi-bot.types.ts`):
  - `BotTopic { id, label?, flow }`. Cada topic es un `BotFlow` autónomo.
  - `BotRouterRule`: `{ kind: 'template-payload', pattern, topicId }` | `{ kind: 'keyword', keywords[], topicId }` | `{ kind: 'default', topicId }`.
  - `BotRouter { rules[], defaultTopicId? }`.
  - `gotoTopic?: string` agregado como alternativa opcional a `nextNodeId`/`retryNodeId`/`branches[].nextNodeId`/`elseNextNodeId` en MESSAGE/MEDIA/CAPTURE/MENU options/CONDITION branches/CONDITION else.
  - Validators: `validateBotTopics` (ids únicos, flow válido por topic), `validateBotRouter(router, topicIds)` (rules referencian topics existentes), `validateGotoTopic` (mutex con nextNodeId).
- **Backend — `WapiBotFeatureService`** (`wapi-bot-feature.service.ts`):
  - `isEnvEnabled()` lee `WAPI_BOT_FEATURE_ENABLED === 'true'`.
  - `isOrgEnabled(orgId)` query a `Organization.botEnabled` (cast `as never` por gen lock).
  - `isEnabled(orgId?)` AND lógico, defensivo (sin orgId/sin contexto → false).
  - `assertEnabled(orgId?)` lanza `ForbiddenException` si falla.
  - `WapiBotFeatureGuard` aplicado al `WapiBotController` — endpoints `/api/wapi/configs/:id/bot/*` devuelven 403 si falla.
- **Backend — `WapiBotRouterService`** (`wapi-bot-router.service.ts`):
  - `resolve(router, input) → { topicId, seedData } | null`. Maneja kinds incompatibles (keyword no matchea template-payload), regex inválida silenciosa (rule se ignora), keyword case-insensitive y trimmeado (no parcial), named groups en template-payload → `seedData`, fall-back a `defaultTopicId`.
- **Backend — engine** (`wapi-bot-engine.service.ts` refactor mayor):
  - Constructor recibe `WapiBotFeatureService` + `WapiBotRouterService` (más los 4 deps anteriores).
  - `handle()`: gate inicial via `featureService.isEnabled(orgId)` (si off → `{ handled: false }`, deja pasar como si no hubiera bot).
  - `resolveTopics(cfg)`: si `botTopics` poblado, usa multi-topic; si sólo hay legacy `botFlow`, lo wrappea como `{ topics: { default: { id:'default', flow } }, router: { defaultTopicId:'default' } }` — backward compat full.
  - `text` sin sesión → `routerService.resolve(router, { kind:'text', text })`. Si matchea, abre sesión en `currentTopicId` con `seedData` mergeado en `session.data`. Si no matchea + hay `defaultTopicId`, va ahí. Si nada matchea, no responde.
  - `followGoto(gotoTopic, nextNodeId, currentTopicId, resolved)`: helper que convierte cualquier salida (gotoTopic o nextNodeId) en `{ topicId, nodeId }` para el siguiente paso del chain.
  - `runChain()` extrae el bucle de auto-chain (cap 8) y soporta `gotoTopic` en MESSAGE/MEDIA + CONDITION branches + CAPTURE next/retry + MENU options.
  - `pickConditionBranch` ahora retorna `{ nextNodeId?, gotoTopic? }`.
  - `startTopic(cfg, conversationId, phone, topicId, seedData)`: método público que cierra sesión activa (`endedReason='router-restart'`) y arranca limpio en el `startNodeId` del topic destino. Llamado por el webhook en BOT button action.
  - `upsertSession` incluye `currentTopicId`.
- **Backend — webhook** (`wapi-webhook.service.ts`):
  - Inyecta `WapiBotFeatureService` + `WapiBotRouterService`.
  - `wapiConfig` select extendido con `botTopics, botRouter`.
  - `botFeatureOn = await this.botFeature.isEnabled()` antes de delegar al engine.
  - `handleButtonAction` ahora recibe la cfg completa + `botFeatureOn`. Para action `'BOT'`: parsea router via `parseRouter()`, llama `routerService.resolve()` con `{ kind:'template-payload', payload: buttonId }`, si matchea → `botEngine.startTopic(...)`. Si no matchea, fall-through.
- **Backend — button actions** (`wapi-button-action.service.ts`): `BUTTON_ACTIONS = ['INBOX','BAJA','IGNORAR','BOT']`. La acción BOT en `apply()` sólo loggea (la dispatch real está en el webhook para evitar circular import service↔engine).
- **Backend — DTOs + service**:
  - `wapi-bot.dto.ts`: `botTopics?: unknown[] | null`, `botRouter?: Record<string, unknown> | null`.
  - `wapi-bot.service.ts`: `update()` valida topics primero, después router con `topicIdsForRouter` (del patch o leyendo existentes para cross-check). Enable guard relajado: acepta `botFlow` (legacy) **o** `botTopics`. `get()` devuelve los nuevos campos.
- **Backend — `/me`** (`me.service.ts`): inyecta `ConfigService`, agrega `features: { bot: botEnvOn && orgBotEnabled }` a cada `MeOrganization`.
- **Backend — module wiring** (`wapi.module.ts`): registra `WapiBotFeatureService`, `WapiBotFeatureGuard`, `WapiBotRouterService` y exporta `WapiBotFeatureService`.
- **Shared types** (`packages/shared-types`): `OrgFeatureFlags { bot: boolean }`, `MeOrganization.features: OrgFeatureFlags`.
- **Frontend** (`apps/frontend/src/layouts/Sidebar.tsx`): item "Bot guiado" condicional a `import.meta.env.VITE_WAPI_BOT_FEATURE_ENABLED === 'true'`. El gating per-org se enforce server-side via 403.
- **`.env.example`**: agregadas `WAPI_BOT_FEATURE_ENABLED=false` y `VITE_WAPI_BOT_FEATURE_ENABLED=false` con docstring explicando que ambos default false en prod por seguridad y que la org necesita además `Organization.botEnabled=true`.
- **Tracking de tasks**: 12 tasks (#58–69) creadas y cerradas — schema → env → feature service → tipos → router → engine refactor → gating → BOT action → CRUD → /me → tests → tracking.
- **Tests**:
  - `wapi-bot-router.service.spec.ts`: 9 casos (template-payload con/sin named groups, keyword case-insensitive exacto, kinds incompatibles, default rule, atajo `defaultTopicId`, primer match gana, regex inválida ignorada, router null → null).
  - `wapi-bot-feature.service.spec.ts`: 7 casos (env off, org off, ambos on, sin contexto tenant defensive, `assertEnabled` lanza/pasa).
  - `wapi-bot-engine.service.spec.ts`: constructor extendido con mocks de `feature` (`isEnabled.mockResolvedValue(true)`) y `router` (`resolve.mockReturnValue(null)`) — todos los specs anteriores siguen pasando.
  - 5/5 specs `wapi-bot/*`, 66/66 tests ✅.
- **Errores y workarounds**:
  - `prisma generate` EPERM por DLL lock → SQL directa via WSL psql + INSERT en `_prisma_migrations` (idem 4.N.2).
  - Primer draft de `WapiBotFeatureService` usaba `this.prisma.client.organization` (incorrecto — `PrismaService extends PrismaClient`, no hay `.client`). Fix: `this.prisma.organization` directo.
  - Circular import potencial entre `WapiButtonActionService` y `WapiBotEngineService` → resuelto manteniendo la dispatch BOT en el webhook (el button action service sólo loggea).
- **Pendiente (4.O.2)**:
  - **UI editor multi-topic + router**: hoy se editan vía `PATCH /api/wapi/configs/:id/bot { botTopics, botRouter }` directo. Para 4.O.2: tabs por topic en el editor visual, panel router con drag-reorder de rules.
  - **Test E2E**: template real con botón `BOT` y payload `OFERTA_HOSTING_99` → router con regex `^OFERTA_(?<producto>\w+)_(?<plan>\d+)$` → topic `oferta` con MESSAGE "Te interesa el {{producto}} plan {{plan}}".
- **SQL para activar el feature en la org del dueño** (entregado al usuario, ver mensaje final de la sesión).

### 2026-05-06 — Sesión 33 (Claude Opus 4.7) — Sub-fase 4.N.2 (CAPTURE / MEDIA / CONDITION + interpolación `{{var}}`)

- **Contexto**: continuación inmediata de Sesión 32. Con el editor visual cerrado en 4.N.1, el dueño pidió sumar los tres tipos de nodo que cubren el grueso de un bot transaccional sin escribir código: pedir-y-guardar (CAPTURE), enviar media (MEDIA), branchear por variable/hora/día (CONDITION). El nodo HTTP queda diferido a 4.N.3 por su superficie de seguridad propia (SSRF, timeouts, auth).
- **Schema**: `WapiBotSession.data Json? @default("{}")` — donde el motor persiste lo capturado por CAPTURE. Migración `20260507120000_wapi_bot_session_data` aplicada vía SQL directa: `prisma generate` falló en Windows con `EPERM` por DLL lock (`query_engine-windows.dll.node` retenido por el dev server). Workaround: `wsl bash -c "PGPASSWORD=… psql -h 127.0.0.1 -U massivo -d massivo -c '…'"` (TCP + password — el peer auth por socket usaba el user equivocado).
- **Backend — tipos**: `BotCaptureNode` (`saveAs` validado contra `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, `validate?: regex|preset` con presets `email|phone|number|any`, `nextNodeId`, `retryNodeId?`); `BotMediaNode` (`mediaType`, `mediaId`, `caption?` — rechazado en audio, `filename?`, `nextNodeId?`); `BotConditionNode` (`branches[].when: var|time|weekday`, `elseNextNodeId`).
- **Backend — `validateBotFlow`** kind-aware: helper `validateNextRef` (resuelve + no auto-ref), regex CAPTURE compilable, `HH:MM` con `/^([01]\d|2[0-3]):[0-5]\d$/`, days 0..6 sin duplicados.
- **Backend — interpolación**: `bot/interpolate.ts` con regex `\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}`. Aplica en MESSAGE/MENU/CAPTURE text y MEDIA caption antes de enviar. 9 specs en `interpolate.spec.ts`.
- **Backend — engine**: `handle` reescrito como state machine pequeña.
  - `text` con `currentNodeKind=CAPTURE`: `handleCapture` valida; éxito ⇒ `persistSessionData(data[saveAs] = body)` + chain por `nextNodeId`; falla ⇒ chain por `retryNodeId` o re-entrega prompt.
  - `text` con `currentNodeKind=MENU`: re-entrega menú (igual que antes).
  - `text` en cualquier otro estado: `endSession` + restart desde `startNodeId`.
  - `button` con MENU: `opt.nextNodeId` (igual que antes).
  - Bucle `deliverChain` (cap `BOT_MAX_AUTO_CHAIN=8`): CONDITION evalúa `pickConditionBranch` (no entrega, transparente al usuario) y continúa al destino; MESSAGE/MEDIA con `nextNodeId` auto-encadenan.
  - `pickConditionBranch`: var (eq/neq/contains/matches), time (con cruce de medianoche — `from > to` invierte el rango), weekday (hora local del server, `0=Sunday`).
  - `deliverNode` kind-branched: `sendInteractiveButtons` / `sendMediaById` / `sendText`, todos con `interpolate(text, sessionData)` antes de enviar.
  - Persistencia outbound: `system.kind: 'bot-capture' | 'bot-media' | 'bot-condition'` (filtrados del inbox del operador junto con `bot-menu`/`bot-message`).
- **Backend — endpoint upload**: `POST /api/wapi/configs/:id/bot/media` (multipart, FileInterceptor 100MB) → `WapiBotService.uploadFlowMedia` → `WapiMediaService.uploadToMeta`. No persiste mensaje (no hay conversación en contexto del editor); sólo devuelve `{ mediaId, mediaType, size, mime }` para que el editor guarde el `mediaId` en el nodo.
- **Frontend — espejado**: `types.ts` (mirror), `validateClient.ts` (kind-aware con helper `checkRef`), `api.ts` (`uploadMedia`), `flowLayout.ts` (`nodeHeight` por kind para que dagre no superponga).
- **Frontend — vistas**: `CaptureNodeView` (warning, dos handles `next`/`retry` con label ✓/✗), `MediaNodeView` (success.dark, badge tipo + filename), `ConditionNodeView` (grey.700, un handle por branch `br-${id}` + `else` punteado).
- **Frontend — drawer**: `CaptureEditor` (saveAs sanitizado, select preset/regex/none con campo regex condicional, `NextNodeSelect` reusable para next + retry), `MediaEditor` (file picker con `mediaAccept(type)`, sube via `botApi.uploadMedia`, muestra `mediaId` resultante, caption no audio, filename sólo document), `ConditionEditor` + `BranchWhenEditor` (var/time/weekday con chips de días). Drawer ahora requiere prop `configId` para el upload.
- **Frontend — page**: `WapiBotsPage.tsx` extendido — 3 botones nuevos (`CAPTURE`/`MEDIA`/`COND`), edges con labels y colores por tipo (`✓` verde / `✗` rojo para CAPTURE; gris sólido para branches CONDITION; gris punteado para `else`), `applyConnection`/`disconnectEdges`/`deleteSelectedNode` extendidos para limpiar refs en los nuevos kinds, `defaultNodeFor` y `nodeIdPrefix` extendidos, MiniMap coloreado por kind (capture warning, media success, condition grey).
- **Tracking de tasks**: 8 tasks (#50–57) creadas y cerradas en orden — Schema → tipos backend → interpolación → engine → frontend types/validator → nodeViews/drawer → page → tracking.
- **Tests**:
  - `interpolate.spec.ts`: 9 casos.
  - `wapi-bot.types.spec.ts`: +6 casos (CAPTURE preset email + retry; CAPTURE regex inválida rechazada; MEDIA audio + caption rechazada; MEDIA con `mediaId` vacío; CONDITION time cruzando medianoche; CONDITION weekday vacío). Total 22.
  - `wapi-bot-engine.service.spec.ts`: +5 casos (CAPTURE válido guarda data + entrega siguiente con `{{var}}` interpolado; CAPTURE inválido + retry; CAPTURE inválido sin retry re-entrega prompt; MEDIA → MESSAGE encadena; CONDITION-var con match → branch correcta + interpolación). Total 17. Mock de `sender` ampliado con `sendMediaById`.
  - 39 specs `wapi-bot/*` ✅. Frontend `tsc --noEmit` ✅.
- **Errores y workarounds**:
  - `prisma generate` EPERM por DLL lock → SQL directa via WSL psql.
  - WSL psql peer auth fail → `PGPASSWORD=… psql -h 127.0.0.1` para forzar TCP.
  - TS error en `BranchWhenEditor` (uso erróneo de conditional types) → reemplazado por unión literal `'eq' | 'neq' | 'contains' | 'matches'`.
  - Mock spec engine sin `sendMediaById` → agregado al typing y al objeto.
- **Pendiente**:
  - **4.N.3 (futuro)**: nodo `HTTP` con SSRF guard, timeouts, auth.
  - Smoke E2E con un usuario externo real (CAPTURE → interpolación → MEDIA → CONDITION-time).

### 2026-05-05 — Sesión 32 (Claude Opus 4.7) — Sub-fase 4.N.1 (editor visual react-flow + nodo MESSAGE)

- **Contexto**: continuación inmediata de Sesión 31. El dueño probó el bot 4.N y pidió:
  1. Bug fix: el bot respondía con burbuja vacía en dev. Causa: `MessageBubble.extractText` no manejaba `type='interactive'` (leía `c[type].body` como string cuando es objeto). Fix con handler explícito → `inter?.body?.text ?? inter?.header?.text`.
  2. Bot buttons clickeables directo desde el bubble, no en una fila aparte. Fix: prop chain `onInteractiveButtonClick` `MessageBubble` → `ConversationThread` → page.
  3. En el chat del operator, ocultar la interacción del bot — solo ver el handoff. Fix: `isBotInteractionMessage` filtra `system.kind='bot-menu'` (outbound) + inbound con `bot:` button reply, preserva `bot-handoff`.
  4. Dev chat pegado a la viewport como inbox, scroll interno solamente. Fix: agregar `/dashboard/dev/wapi/chat` al `isFullBleed` de `AppLayout`.
  5. **Sumar nodo MESSAGE** (texto sin botones) al editor de bot.
  6. **Reescribir el editor** como diagrama de flujo visual estilo draw.io.
- **Decisión técnica**: `@xyflow/react` (~150KB, MIT, MUI-friendly) + `dagre` para auto-layout. `position?: {x, y}` opcional en cada nodo, persistida en el flow JSON pero ignorada por el motor.
- **Backend — nodo MESSAGE**:
  - `BotMessageNode { kind: 'MESSAGE', text, nextNodeId? }`. Con `nextNodeId` el motor encadena automáticamente al siguiente en el mismo inbound; sin él es terminal silencioso.
  - `validateBotFlow` extendido: acepta MESSAGE, valida `nextNodeId` (debe resolver, no auto-referenciar).
  - `WapiBotEngineService.handle` reescrito: ahora corre un loop de `deliverNode` con tope `BOT_MAX_AUTO_CHAIN=8`. La sesión queda en el último nodo del chain. `MESSAGE → MESSAGE → HANDOFF` en un solo inbound del cliente envía 3 mensajes secuenciales y cierra la sesión.
  - `buildPersistedContent` para MESSAGE → `{ text:{body}, system:{kind:'bot-message'} }`.
  - `isBotInteractionMessage` (frontend) extendido a `bot-message`.
  - Tests: validador +5 (acepta MESSAGE+next, MESSAGE terminal, rechaza fantasma/auto-ref/text vacío). Engine +3 (chain MESSAGE→MENU upsertea sesión en MENU, MESSAGE→MESSAGE→HANDOFF emite 3 sendText + ended, MESSAGE terminal upsertea en el MESSAGE).
  - `nest build` ✅ tras agregar type annotation explícita en el loop (`const node: BotNode | undefined = flow.nodes[currentId]`) para esquivar TS7022.
- **Frontend — editor visual** (`apps/frontend/src/features/wapi/bots/`):
  - `flowLayout.ts`: dagre con `rankdir=LR`, ancho 240, alto base 110 + 22px por opción de MENU.
  - `nodeViews.tsx`: 3 custom node renderers (MENU/MESSAGE/HANDOFF) con MUI. MENU tiene un Handle source por opción (`op-{id}`). MESSAGE tiene `next`. HANDOFF no tiene source. Todos tienen target a la izquierda. Chip `START` para el inicial. Estilos por kind con colores (primary/info/secondary).
  - `NodeEditorDrawer.tsx`: drawer derecho que se abre al click sobre nodo. Edita texto, opciones (MENU con id/label/nextNodeId via Select), nextNodeId (MESSAGE), escalate (HANDOFF). Botones "Marcar inicial" y "Eliminar" (limpia referencias en otros nodos).
  - `validateClient.ts`: extraído del page; espejo cliente del backend con MESSAGE.
  - `WapiBotsPage.tsx` reescrito en `ReactFlowProvider`. Toolbar con selector de config + switch ON/OFF + TTL + add MENU/MESSAGE/HANDOFF + AutoFix + Save. Canvas con MiniMap+Controls+Background. Drag persiste position al flow. `onConnect` setea `nextNodeId` (`applyConnection`). Borrar edge con Delete/Backspace dispara `disconnectEdges` que parsea el `id` del edge (formato `${source}__${handle}__${target}`) y limpia. Eliminar nodo limpia referencias automáticamente.
  - `/dashboard/wapi/bots` agregado al `isFullBleed` de `AppLayout`.
- **Deps**: `@xyflow/react`, `dagre`, `@types/dagre` instaladas en `apps/frontend`.
- **Validaciones**: 27/27 specs `wapi-bot/*` pasando. `pnpm --filter @massivo/backend build` ✅. `pnpm --filter @massivo/frontend typecheck` ✅. Lint solo arrastra warnings pre-existentes.
- **Tracking**: CHANGELOG sección `4.N.1` con guía de prueba paso a paso. MIGRATION_PLAN sub-sección `4.N.1`. PROGRESS estado actual + próximo paso actualizados.
- **Próximo paso al volver**: smoke test con el dueño del editor visual (drag, conectar, autolayout, chain MESSAGE en runtime). Si confirma, el dueño mencionó que pediría más tipos de nodos ("despues de eso te pido algunos nodos mas q estoy pensando, pero vamos por partes").

### 2026-05-05 — Sesión 31 (Claude Opus 4.7) — Sub-fase 4.N (bot guiado por número, end-to-end)

- **Contexto**: con 4.K cerrado en Sesión 30, el dueño pidió avanzar autónomo con **bot guiado** (mini-IVR) sin pedir confirmaciones. Originalmente etiquetado "4.M" en notas internas; se renumeró a **4.N** porque 4.M ya estaba ocupado por `WapiConfig.isTestMode`.
- **Schema** (`20260507100000_wapi_bot_module`):
  - `WapiConfig.botEnabled Boolean @default(false)`, `botFlow Json?`, `botSessionTtlMin Int @default(30)`.
  - Modelo nuevo `WapiBotSession` con `(organizationId, teamId, configId, phone, currentNodeId, startedAt, lastInboundAt, expiresAt, endedAt?, endedReason?)` y `@@unique([configId, phone])` + índices por org/team/expiresAt.
  - `WapiBotSession` agregado a `TENANT_SCOPED_MODELS`.
  - Para regenerar Prisma client hubo que matar el backend (`taskkill //PID <pid> //F`) porque sostenía `query_engine-windows.dll.node`.
- **Backend — `WapiSenderService.sendInteractiveButtons`**: wrapper sobre Meta `interactive` type=button. Máx 3 botones, `title` truncado a 20 chars (límite Meta). Tipos `SendInteractiveButtonsInput` exportados.
- **Backend — `WapiBotEngineService`** (`apps/backend/src/modules/wapi/bot/`):
  - `handle(cfg, input) → { handled, ended?, escalate? }`. Inputs: `kind: 'text'|'button'`. Para button incluye `buttonId` y opcional `contextMetaMessageId` (para distinguir si está respondiendo a un template message).
  - **Disambiguación clave bot vs template (4.K)**: bot prefija ids con `bot:` (`BOT_OPTION_PREFIX`). `isBotButtonId()` chequea el prefijo. Si llega button con `bot:` y NO hay sesión → `handled=true` silencioso (no rearma flow para evitar spam). Si NO arranca con `bot:` → `handled=false` y delega al webhook (4.K).
  - **Sesión por (configId, phone)** con TTL configurable. Texto inicial sin sesión → entrega `startNode` y crea sesión. Texto con sesión activa → re-renderiza el menú actual (no avanza). Sesión expirada → cierra (`endedReason='expired'`) y rearranca.
  - **HANDOFF terminal**: manda texto, cierra sesión (`endedReason='handoff'`), retorna `ended=true` + `escalate?`.
  - **Persistencia**: cada outbound del bot queda en `WapiMessage` con `system: { kind: 'bot-menu' | 'bot-handoff' }` y se emite `wapi.message.new` por socket.
  - `endSessionsForConversation(configId, phone, reason)` — cierra todas las sesiones activas. Lo llama `WapiInboxService.assign/resolve`.
- **Backend — `validateBotFlow`** (`wapi-bot.types.ts`): valida startNodeId (existe en nodes), MENU con 1–3 opciones, nextNodeId resuelve, ids de opción únicos, text no vacío, kind ∈ {MENU, HANDOFF}. Devuelve `{ ok, errors[], flow }`.
- **Backend — CRUD**: `WapiBotService.get(configId)` snapshot, `update(configId, dto)` valida flow y bloquea habilitar bot sin flow. `WapiBotController` expone `GET/PATCH /api/wapi/configs/:id/bot`. CASL reusa `WapiConfig` (read/update) — no nuevo subject. DTO con `class-validator`: `botFlow?: Record<string, unknown> | null` (validación estructural en el service).
- **Backend — Webhook integration** (`wapi-webhook.service.ts`):
  - Constructor: 8° arg `WapiBotEngineService`.
  - `handleInboundMessage` calcula `isBotButton = buttonInfo ? botEngine.isBotButtonId(buttonInfo.buttonId) : false`.
  - `tryAutoReplies` selecciona también `botEnabled, botFlow, botSessionTtlMin` y llama `botEngine.handle()` **antes** de welcome/optout/4.K. Si `botHandled` → return early.
  - HANDOFF + escalate → `WapiConversation.update({priority: true})` + emit `wapi.conversation.updated`.
  - 4.K (button actions de templates) sólo dispara cuando `!isBotButton`.
- **Backend — Inbox integration** (`wapi-inbox.service.ts`): constructor + 7° arg `WapiBotEngineService`. Helper `endBotSessionsFor(conversationId, reason)`. Llamado desde `assign()` (`'operator-assign'`) y `resolve()` (`'resolved'`) para que el operador asuma sin que el bot intercepte.
- **Frontend — `/dashboard/wapi/bots`** (`WapiBotsPage.tsx` + `bots/api.ts` + `bots/types.ts`):
  - Selector de WapiConfig, switch `botEnabled`, TextField TTL (1–1440), selector de nodo inicial.
  - Lista vertical de cards (MENU/HANDOFF). MENU: lista de opciones con id, label (≤20), nextNodeId via Select de nodos existentes (muestra "(no existe)" si target falta). Botón "Agregar opción" disabled si ya hay 3.
  - HANDOFF: switch `escalate`.
  - Validación cliente espejada del backend con Alert listando errores. Bloquea guardar con `enabled=true` + flow inválido.
  - Sidebar: nueva entrada "Bot guiado" en grupo WhatsApp con `SmartToyIcon`.
- **Tests**:
  - `wapi-bot.types.spec.ts`: 9 casos del validador.
  - `wapi-bot-engine.service.spec.ts`: 10 casos del engine (bot disabled, flow inválido, texto inicial, button avanza, button sin sesión silencioso, button NO bot, texto con sesión, HANDOFF, sesión expirada, endSessionsForConversation).
  - `wapi-webhook.service.spec.ts`: bloque `4.M — bot guiado` con 5 casos integrando engine.
  - `wapi-inbox.service.spec.ts`: agregado mock `WapiBotEngineService` en el test module (sino los specs viejos rompían por dep no resuelta).
  - **161/161 wapi specs ✅**. Frontend typecheck ✅.
- **Errores de la sesión**:
  - **Prisma EPERM** al regenerar client por DLL del backend tomada en Windows. Resuelto matando el proceso.
  - **TS2345** en controller por mismatch DTO ↔ service input: la DTO tipa `botFlow?: Record<string, unknown> | null` pero el service esperaba `BotFlow | null`. Fix: cambiar el input del service a `unknown` (validación estructural ya está en `validateBotFlow`).
  - **TS2554** en webhook spec por nuevo arg constructor (8 vs 7).
  - **9 specs de inbox failing** tras agregar dep `WapiBotEngineService` — fix con mock provider.
- **Decisiones clave**:
  - **Prefijo `bot:` en option ids**: única forma robusta de disambiguar reply de botón bot vs button reply de template (4.K) sin guardar metadata extra en cada outbound. Aprovecha que el id del button es lo único que vuelve en el inbound.
  - **Sesión silenciosa en button sin sesión**: si un cliente vuelve a clickear un botón viejo después de que la sesión expiró (o que el operador la cerró), NO queremos rearmar el flow desde cero — eso sería confuso. Mejor `handled=true` silent y dejar que el operador maneje.
  - **Validación cliente espejada del backend**: redundante a propósito. El backend es la única fuente de verdad pero el cliente da feedback inmediato sin round-trip.
  - **CASL reusa WapiConfig**: no proliferar subjects para una funcionalidad que es sub-config de la línea.
  - **No graph viz para el editor**: lista vertical es suficiente para 2–10 nodos, que es el sweet spot. Si crece, react-flow después.
- **Pendiente para el dueño al volver**: smoke test paso-a-paso (ver "Próximo paso al volver" arriba). Después: commitear y decidir entre **4.J live dashboard** o cerrar **4.L** (virtual numbers + audit log).

### 2026-05-05 — Sesión 30 (Claude Opus 4.7) — Sub-fase 4.K (button actions) + arranque 4.M (bot guiado)

- **Contexto**: con 4.H + 4.I cerradas (Sesión 29), el dueño aprobó avanzar con 4.K. Tres acciones soportadas para botones interactivos de templates: **INBOX** (priorizar conversación con ⭐), **BAJA** (opt-out global) e **IGNORAR** (log only). Resolución vía `WapiTemplate.buttonActions[buttonId]` con fallback a defaults case-insensitive (`INBOX`/`BAJA`/`IGNORAR`).
- **Schema**: `WapiConversation.priority Boolean @default(false)` + índice `(teamId, priority, lastMessageAt)`. Migración `20260506100000_wapi_conversation_priority` aplicada.
- **Backend — `WapiButtonActionService`** (`apps/backend/src/modules/wapi/button-actions/`):
  - `resolve({buttonId, contextMetaMessageId})` → busca template via `WapiReport.metaMessageId → campaign.templateId → template.buttonActions`. Acepta valores `string` (legacy) y `{action, payload?}` (nuevo). Fallback a defaults case-insensitive.
  - `apply({...})` → INBOX hace `wapiConversation.update(priority=true)` + emite `wapi.conversation.updated`; BAJA llama `optOut.add(scope='GLOBAL', source='inbound_button')`; IGNORAR sólo logea. Best-effort: errores no rompen webhook.
- **Backend — Webhook integration** (`wapi-webhook.service.ts`): nuevo helper `extractButtonInfo(msg)` maneja ambas shapes Meta (`interactive.button_reply` + legacy `button.payload`). Trigger condition extendida: `isNewConversation || couldTriggerOptOut || buttonInfo`. `tryAutoReplies` ahora dispatcha a `handleButtonAction` que resuelve/aplica + dispara `optOutConfirmMessage` en BAJA (paridad con keyword opt-out).
- **Dev Simulator — endpoint button** (`POST /api/dev/wapi/simulate/inbound/button`): arma payload Meta-shaped con `interactive.button_reply` + `context.id` opcional. UI chat simulado (`WapiSimulatorChatPage`) con 3 quick buttons INBOX/BAJA/IGNORAR sobre el composer del cliente para QA rápido.
- **Inbox UI — filtro Priorizadas**: `Chip` toggle "Priorizadas" debajo del search en `ConversationList` (compone con tabs). Badge ⭐ inline al inicio del nombre cuando `item.priority`. Backend acepta `?priority=true` con `@Transform` para coerción de query string boolean. Socket handler aplica el campo `priority` en updates en vivo.
- **Templates UI — editor de `buttonActions`** (`WapiTemplatesListPage.tsx`): IconButton SmartButton (⚙️) por fila → diálogo con filas {combo de QUICK_REPLY del template, Select(INBOX/BAJA/IGNORAR), TextField payload con soporte `{{var}}`}. Muestra warning si template no tiene QUICK_REPLY. Combo excluye IDs ya usados en otras filas (no permite duplicados). Estado "(no existe)" en rojo si el mapping legacy apunta a un botón que ya no está. Helper banner con sintaxis Mustache + chips de variables disponibles + Select "Insertar var…" por fila que anexa `{{key}}` al payload.
- **Backend — endpoint data-keys de templates**: `GET /api/wapi/templates/:id/data-keys` agrega keys de `WapiContact.data` para todas las campañas que usaron este template (muestra de 200 contactos). Mirror de `wapi-campaigns.getContactDataKeys` pero a nivel template (porque un template puede usarse en múltiples campañas). Devuelve `[]` si nunca se usó — UI cae a fallback "tipear a mano".
- **Persistencia del payload**: el shape persistido es `{ [buttonId]: { action, payload? } }`. El resolver del backend acepta también el shape legacy `Record<string, string>` (backward compat). El renderizado del payload con `{{var}}` queda **pendiente** para una sub-fase futura — hoy se persiste la plantilla cruda; cuando se necesite resolver en runtime, se agrega un `resolvePayload(payload, contactData)` en `WapiButtonActionService.apply` haciendo un `WapiContact.findFirst({phone, campaignId})` y sustitución regex.
- **Tests**: nueva spec `wapi-button-action.service.spec.ts` con 11 casos (resolve con/sin context, ambos shapes, defaults case-insensitive, apply para 3 actions, best-effort error swallowing). Spec `wapi-webhook.service.spec.ts` extendida con bloque `4.K — button actions` (5 casos: interactive shape, legacy shape, resolve null, BAJA dispara optOutConfirm, texto NO dispara button actions). **30/30 ✅** en specs button-action + webhook. Frontend + backend typecheck ✅.
- **Decisiones clave**:
  - **Defaults case-insensitive** (`INBOX`/`BAJA`/`IGNORAR`): permite QA con Dev Simulator sin tener que configurar `buttonActions` en cada template. Se aplican sólo si no hay match en el template explícito.
  - **Combo de buttonId + filtro de duplicados**: prefiere UX guiada sobre flexibilidad. Si el usuario tipea un id custom (vía import legacy), se muestra como "(no existe)" pero no se borra.
  - **Sólo QUICK_REPLY en el editor**: URL/Phone buttons no disparan webhook, así que no tienen sentido ahí.
  - **Payload con `{{var}}` deferido**: el editor permite escribir la plantilla pero el resolver aún no la renderiza. Decisión: no agregar runtime hasta que haya un caso de uso concreto (ej. routing por categoría) — hoy el payload se guarda como metadato.

### 2026-05-05 — Sesión 29 (Claude Opus 4.7) — Sub-fase 4.H (opt-out por keyword) + 4.I (welcome message)

- **Contexto**: con el chat simulado funcionando end-to-end (Sesión 28), el dueño aprobó avanzar con 4.H + 4.I juntos por compartir el patrón "auto-reply en webhook handler". Welcome se dispara en primera conversación, opt-out en match de keyword sobre body de texto inbound. Ambos testeables vía el chat simulado sin tocar Meta.
- **Schema — sólo un campo nuevo**: descubrimos que el modelo `WapiOptOut` ya existía en `schema.prisma` desde la migración inicial `20260430153841_add_wapi_models` (con `phoneHash`, `scope`, `campaignId?`, `reason?`, `source?`, unique `(teamId, phoneHash, scope, campaignId)`) y ya estaba registrado en `tenant-models.ts`. Las relaciones inversas `wapiOptOuts` también estaban declaradas en `Organization` y `Team`. Sólo faltaba el campo `optOutKeywords: String[] @default([])` en `WapiConfig`. Migración nueva: `20260505200000_wapi_config_opt_out_keywords` (aplicada). El `prisma generate` falló de nuevo con EPERM por el DLL del backend pero los tipos en `index.d.ts` quedaron actualizados — `client.d.ts` puede estar desfasado, hay que generar al volver.
- **Backend — `WapiOptOutService`** (`apps/backend/src/modules/wapi/opt-out/`): mirror de `SuppressionService` para email. API:
  - `resolveKeywords(cfgKeywords | null)` → si está vacío usa los defaults `[BAJA, STOP, UNSUBSCRIBE, CANCELAR]`, si no usa los del config; siempre normaliza a UPPERCASE/trim/no-vacíos.
  - `matchKeyword(body, keywords)` → match **exacto** sobre el body completo post-trim/UPPER. Decisión clave: NO substring match — evitamos falsos positivos como "no quiero la baja del dólar" o "stop me from dying laughing". Si el cliente quiere bajar tiene que mandar la keyword sola.
  - `check({phone, campaignId?})` → busca en `WapiOptOut` por `phoneHash` con `OR: [{scope:'GLOBAL'}, {scope:'CAMPAIGN', campaignId}]` si hay campaignId, sino sólo GLOBAL. Devuelve `{optedOut, scope?}`.
  - `add({phone, scope, campaignId?, reason?, source?})` → idempotente con `findFirst` previo (Postgres trata múltiples NULL distintos en compound unique con `campaignId NULL`, igual que el patrón de email).
  - `phone-hash.ts`: SHA-256 sobre dígitos del phone normalizado (trim + replace `\D+`).
- **Backend — `WapiWebhookService` reformulado**: el `wapiConversation.upsert` se reemplazó por `findFirst + create/update` para detectar primera conversación (necesario para 4.I). El branch `update` inlinea la lógica de reopen RESOLVED→ASSIGNED/UNASSIGNED que vivía en el helper `shouldReopen()` (ya teníamos `existing` del findFirst, evitamos un query extra). El branch `create` captura `P2002` y refetchea para handlear race contra dos webhooks del mismo phone+config simultáneos (raro, pero posible). El service inyecta ahora `WapiSenderService`, `EncryptionService`, `WapiOptOutService` además de los previos.
- **Backend — `tryAutoReplies()` y `sendAutoReply()`**: tras persistir el `WapiMessage` inbound, si `isNewConversation || msg.type==='text'` se carga el config completo (lazy: una sola query, sólo si hay disparador). Welcome se dispara si `isNewConversation && cfg.welcomeMessage.trim()`. Opt-out se dispara si `inboundText && match`. En el match → `optOut.add(scope='GLOBAL', source='inbound_keyword')` y luego, si `cfg.optOutConfirmMessage.trim()`, envía la confirmación. `sendAutoReply()` llama `sender.sendText(...)` con `isTestMode: cfg.isTestMode` plumbed (compatibilidad con chat simulado), persiste `WapiMessage(fromMe=true, status='sent', content.system={kind:'welcome'|'opt-out-confirm'})` y emite `wapi.message.new`. Errores se loggean pero no rompen el flujo (best-effort) — el inbound ya quedó persistido y el operador puede responder manual si la auto-reply falla.
- **Backend — Worker guard opt-out** (`WapiWorkerService.process`): antes del daily limit y del envío, llama `optOut.check({phone, campaignId})`. Si está opted-out, marca `WapiReport.status='CANCELED'` con `error='opted-out:global|campaign'`, emite `wapi.report.log` con status FAILED para que el dashboard muestre el motivo, y llama `maybeCompleteCampaign`. Sin pegar a Meta, sin sleep jitter. Este check viene **antes** del daily limit porque el opt-out es un cancel definitivo y queremos evitar consumir cuota del config.
- **Backend — DTOs + service**: `Create/UpdateWapiConfigDto` aceptan `optOutKeywords?: string[]` validado con `@IsArray @ArrayMaxSize(20) @IsString({each:true})`. `wapi-configs.service` normaliza vía `normalizeKeywords()` (trim, uppercase, dedupe, drop vacíos) y persiste. `WapiConfigDetail` expone `optOutKeywords: string[]`.
- **Frontend — UI WapiConfig**: campos `welcomeMessage` y `optOutConfirmMessage` (multiline TextField) con helper actualizado a "Se envía automáticamente al primer mensaje…" / "…cuando un contacto manda una keyword". TextField nuevo "Keywords de opt-out (separadas por coma)" con placeholder `BAJA, STOP, UNSUBSCRIBE, CANCELAR` y helper que aclara "match case-insensitive y exacto". Helper `parseKeywords()` en frontend: split por coma o newline, trim/uppercase/dedupe.
- **Tests**: actualicé `wapi-webhook.service.spec` (constructor con 6 args, mocks de `wapiConversation.{create,update,findFirst}` en vez de `upsert`, mocks de `wapiConfig.findFirst` y `wapiOptOut.{findFirst,create}` y los 3 services nuevos) y `wapi-worker.service.spec` (constructor con 6 args + mock de `WapiOptOutService.check`). **120/120 tests wapi ✅** (12 suites). Frontend typecheck ✅.
- **Decisiones clave**:
  - **Welcome y opt-out pueden coexistir en el mismo inbound**: si el primer mensaje del cliente es exactamente "BAJA", se envía primero el welcome y después la confirmación de opt-out. El cliente queda opted-out pero recibió ambos mensajes. Decisión simple porque no hay regla de "skip welcome si va a haber opt-out" — el welcome es per-config, el opt-out es por mensaje y sólo aplica al texto exacto.
  - **`scope=GLOBAL` por default** para opt-outs vía webhook: cuando alguien manda STOP, queremos que NO le lleguen más mensajes de NINGUNA campaña del team. El scope CAMPAIGN se mantiene en el modelo para uso futuro (admin UI).
  - **Match exacto vs substring**: elegí exacto. Cliente que quiere bajarse puede mandar "BAJA" sola. Substring rompe casos genuinos. Si en el futuro queremos relajar, agregamos un toggle al config.
- **⚠️ Pendiente al cierre**: igual que Sesiones 26/28 — `pnpm prisma generate` falló con `EPERM` por el DLL del backend en uso. Migración SQL ya aplicada en DB. Antes de testear: detener backend → `pnpm prisma generate` (desde `packages/prisma/`) → reiniciar backend.

### 2026-05-05 — Sesión 28 (Claude Opus 4.7) — Sub-fase 4.L.1 (filtro inbox por línea) + 4.M (`isTestMode` + chat simulado ida-vuelta)

- **Contexto**: tras Sesión 27 quedó disponible el Dev Simulator de WhatsApp. El dueño tenía 2 `WapiConfig` activas y notó que el inbox mezclaba conversaciones de ambas líneas → primer pedido: filtro UI por línea, "tal cual como lo hicimos en AMSA Sender". Resuelto en `ConversationList` con un `ToggleButtonGroup` "Todas + 1 botón por config" (sólo aparece con 2+ configs activas), persistido en `localStorage['massivo:wapi-inbox-configId']`. El filtro se aplica a las queries de `/api/wapi/inbox/conversations` y a los handlers de socket (descartan eventos cuyo `configId` no matchee). Cuando el filtro está en "Todas" en multi-config, cada item lleva un Chip outlined con el label de la línea (`configLabelById` map). El cambio de filtro resetea `selectedId` para no dejar abierta una conv que ya no entra en la vista. Si la config persistida ya no está activa, se limpia.
- **Bug menor — sidebar Dev no aparecía**: el dueño había seteado los ENV pero no veía el item "Simulador WhatsApp". Causa: typo `VITE_ENABLE_DEV_SIMULATOR=tru` en `.env` (faltaba la `e`). El check es `=== 'true'`. Corregido en `.env`. Recordatorio: `import.meta.env.*` se inlinea al startup de Vite — requiere reiniciar el dev server tras tocar `.env`.
- **Contexto del próximo pedido**: tras validar que el simulator funcionaba, el dueño pidió convertirlo en un **chat ida-vuelta** ("como podría tener una config de test, q lo q responda desde el inbox tambien llegue al chat de dev"). Decisión arquitectónica clave: introducir `WapiConfig.isTestMode` en vez de detectar phoneNumberIds especiales — explícito sobre mágico. Cuando una config tiene `isTestMode=true`, el sender NO pega a Meta y devuelve un wamid simulado.
- **Backend — `WapiConfig.isTestMode: Boolean @default(false)`** (migration `20260505180000_wapi_config_is_test_mode`, aplicada). En `WapiSenderService.post()` (único entry point para text/template/media/media-by-id) hay un short-circuit al inicio: si `cfg.isTestMode` → `return { metaMessageId: 'wamid.SIM_<base36>_<random>', raw: { simulated: true, body } }` sin HTTP. La capa superior persiste el mensaje como si Meta hubiera respondido OK, dispara los socket emits normales (`wapi.message.new`), y el message queda en DB con `metaMessageId` que empieza con `wamid.SIM_` — útil para distinguir simulaciones en logs/queries.
- **Backend — `WapiSenderConfig.isTestMode?` plumbed**: la interfaz acepta el flag opcional, los 3 callers que arman el config desde DB lo leen del row:
  - `wapi-inbox.service.sendText` y `sendMedia` (operador respondiendo desde el inbox)
  - `wapi-worker.service` (campañas template — ya cargaba `cfg = report.campaign.configRel` con todos los fields)
- **Backend — `wapi-configs` DTOs + service**: `CreateWapiConfigDto` y `UpdateWapiConfigDto` ahora aceptan `isTestMode?: boolean` (validado con `@IsBoolean`). El service lo persiste en create/update. `WapiConfigListItem` y `WapiConfigDetail` exponen el flag (con fallback `?? false` por seguridad).
- **Frontend — toggle "Modo test" en WapiConfigsPage**: en el dialog de crear/editar, una caja warning con `Switch` color warning + descripción ("envíos NO van a Meta — devuelven un wamid simulado y quedan persistidos como sent. Usalo con la suite Dev (chat simulado)..."). En la fila de la tabla, un Chip "Test" outlined warning al lado del nombre cuando `isTestMode=true`. El form persiste el flag en create y update.
- **Frontend — Página `/dashboard/dev/wapi/chat`** (`apps/frontend/src/features/dev/WapiSimulatorChatPage.tsx`):
  - **Top bar**: select de `WapiConfig` filtrado a `isActive && isTestMode` (con auto-pick si hay sólo una), inputs `phone` y `nombre` del cliente virtual, botón refresh. Estado persistido en `localStorage['massivo:dev-chat:state']`. Si hay configs pero ninguna en modo test → banner warning explicando cómo activar el toggle.
  - **Layout split 1:1** (md+; xs apila):
    - **Pane izquierdo "Cliente virtual"** — header amarillo con avatar genérico + Chip "Inbound (Meta)". Thread renderizado con `ConversationThread` (reusado del inbox real) **pero con `fromMe` invertido** (cada mensaje clonado con `!m.fromMe` antes de renderear): así, lo que escribió el operador desde el pane derecho se ve como mensaje incoming en el pane izquierdo. Composer custom: textarea multiline (Enter envía, Shift+Enter newline), botón attach que auto-detecta `WapiInboxMediaType` por `file.type` (image/video/audio/else=document). Submit posta a `/api/dev/wapi/simulate/inbound/text` o `/api/dev/wapi/simulate/inbound/media`.
    - **Pane derecho "Inbox del operador"** — reusa `ConversationHeader` + `ConversationThread` + `MessageComposer` con la conversación resuelta vía `inboxApi.listConversations({tab:'all', configId, search:phone, limit:5})` filtrando por `phone` exacto. Operador envía con `inboxApi.sendText` / `sendMedia` (que llaman al backend, que pasa por `cfg.isTestMode` → no toca Meta). Ambos panes hacen append local + escuchan `wapi.message.new` filtrando por `conversationId`. Si todavía no hay conv resuelta y entra un evento que matchea `configId+phone`, se re-resuelve.
  - **Sidebar entry "Chat simulado"** (icon `ForumIcon`) en grupo Dev, encima de "Simulador WhatsApp". Ruta declarada bajo `DEV_SIMULATOR_ENABLED && <Route path="dev/wapi/chat" ...>` en `App.tsx`.
- **⚠️ Pendiente al cierre**: `pnpm prisma generate` falló durante la sesión con `EPERM` porque el backend dev server tenía el DLL `query_engine-windows.dll.node` en uso. La **migración SQL ya está aplicada en DB** (verificado por `migrate deploy`), pero el Prisma client TypeScript tiene los tipos viejos sin `isTestMode`. **Antes de tocar nada al volver: detener backend dev → `pnpm -C packages/prisma prisma generate` → reiniciar backend**. Con eso desbloqueado, los cambios del sender + service + DTOs typecheckean.
- **Reflexión arquitectónica**: el patrón "flag explícito en DB + short-circuit en el único entry point HTTP" salió muy limpio. La alternativa (detectar phoneNumberIds simulados, o un service decorator que envuelva al sender) habría requerido tocar mucho más código. El short-circuit en `post()` cubre los 4 send types (text/template/media link/media-by-id) sin duplicación.

### 2026-05-05 — Sesión 27 (Claude Opus 4.7) — Sub-fase 4.L MVP (Dev Simulator de WhatsApp)

- **Contexto**: tras aplicar la migración pendiente de Sesión 26 (`20260505100000_wapi_message_media_fields`), el dueño quiso testear inbound pero no tiene ngrok configurado. Decidió implementar **4.L (Dev Simulator)** ahora para destrabar el smoke test end-to-end de inbox + media sin depender de Meta. Alcance del MVP: endpoints + UI funcionales para inyectar inbound (texto/media/reacción) y status updates. Posterga para más adelante: modelo `WapiSimulatorVirtualNumber`, audit log, vista chat split (cliente virtual ↔ inbox).
- **Backend — `WapiMediaService.persistInboundLocal(configId, buffer, mime)`**: nuevo método público que escribe un buffer al storage local del tenant resuelto desde `configId`, sin tocar Meta. Devuelve `{ sha256, size, mime, localPath }` con el mismo shape que `fetchInboundMedia` para que el resto del pipeline no necesite branching.
- **Backend — `WapiWebhookService` extendido con overrides**:
  - Nueva interfaz `InboundMediaOverride { sha256, size, localPath, mime }` exportada del service.
  - `process(payload, configByPhoneNumberId, mediaOverrides?: Map<string, InboundMediaOverride>)` acepta tercer parámetro opcional. Plumbed via `processValue` → `handleInboundMessage`.
  - En `handleInboundMessage`: antes de llamar a `fetchInboundMedia`, busca `mediaOverrides?.get(mediaId)`. Si hay match, usa el override directamente (skip Meta Graph). Si no, fallback al flujo normal con try/catch.
- **Backend — Módulo `dev` (`apps/backend/src/modules/dev/`)**:
  - `dev.module.ts`: importa `WapiModule` (que ahora exporta también `WapiWebhookService`, antes sólo exportaba `WapiQueueService/SenderService/MediaService`).
  - `dev-simulator.controller.ts`: 4 endpoints bajo `/api/dev/wapi/simulate/`:
    - `POST inbound/text` — JSON `{ configId, fromPhone, fromName?, body }`.
    - `POST inbound/media` — multipart `file` + form fields `{ configId, fromPhone, fromName?, type, caption? }`. Cap 100MB (mismo que el inbox real).
    - `POST inbound/reaction` — JSON `{ configId, fromPhone, targetMetaMessageId, emoji }`.
    - `POST status` — JSON `{ configId, metaMessageId, recipientPhone, status: sent|delivered|read|failed }`. Si status=`failed`, agrega un error sintético al payload.
  - `DevSimulatorEnabledGuard` chequea `ENABLE_DEV_SIMULATOR === 'true'` y devuelve **404** (no 403) si está apagado para que el endpoint sea indistinguible de "no existe" en prod.
  - Stack de guards: `DevSimulatorEnabledGuard → ClerkAuthGuard → TenantContextGuard` + `TenantContextInterceptor`. El usuario está autenticado y scopeado al team; la resolución del tenant del webhook es server-side a partir de `configId`.
  - `dev-simulator.service.ts`: `resolveConfig(configId)` lee `phoneNumberId/businessAccountId/organizationId/teamId` con `prisma.scoped.wapiConfig.findFirst`. `simulateInboundText/Media/Reaction` arman un `WapiWebhookPayload` Meta-shaped y llaman `webhook.process(payload, singleConfigMap(cfg), overrides?)`. Para media: `media.persistInboundLocal` primero → fake `mediaId = sim-${randomBytes(8).hex}` → payload con el sub-objeto correcto por type → `mediaOverrides` map con esa entry. Caption excluido para audio/sticker (regla Meta). `simulateStatus` arma payload con `statuses: [...]` (sin contacts/messages). `fakeWamid()` genera `wamid.SIM_${randomBytes(12).hex.toUpperCase()}` para que sean distinguibles de wamids reales en logs/DB.
  - Registrado en `app.module.ts`.
- **Frontend — `/dashboard/dev/wapi/simulator`** (`apps/frontend/src/features/dev/WapiSimulatorPage.tsx`):
  - Selector de WapiConfig en card superior (lista todas, deshabilita inactivas).
  - 4 cards apiladas: **Inbound texto** (from phone + name + body), **Inbound media** (from phone + tipo select + caption + file picker con `accept` por tipo), **Inbound reacción** (from phone + emoji + target wamid), **Status update** (recipient phone + status select + meta message id).
  - Cada card tiene su propio submit + feedback banner (success/error). Reset del file input post-submit en media.
  - Caption disabled cuando tipo=`audio` o `sticker`.
- **Frontend — gating con env**:
  - `App.tsx`: `const DEV_SIMULATOR_ENABLED = import.meta.env.VITE_ENABLE_DEV_SIMULATOR === 'true'` y la ruta sólo se monta si está activo.
  - `Sidebar.tsx`: nueva sección "Dev" con item "Simulador WhatsApp" (icon Science) sólo si la env está activa.
- **Decisiones**:
  - **No virtual numbers todavía**: el MVP usa `fromPhone` libre como input del operador. Para QA inicial alcanza; el modelo `WapiSimulatorVirtualNumber` (con avatar/profile name por número) queda para una iteración posterior cuando quede claro qué reusar de la vista chat split.
  - **No audit log**: por ahora sólo log debug del service. Si se decide auditar para post-mortem de smoke tests, se agrega un modelo `DevSimulatorAuditEntry` después.
  - **Override map vs duplicar webhook handler**: pasar `mediaOverrides` a `webhook.process` mantiene un único code path para inbound (mismo upserts, mismos eventos socket, misma normalización). El simulator es transparente al inbox real.
  - **`fakeWamid` con prefijo `SIM_`**: evita colisiones con wamids reales y facilita filtrar simulaciones en queries/logs.
  - **404 en vez de 403 cuando el flag está off**: hardening defensivo — en prod el endpoint ni siquiera existe desde la perspectiva del cliente.
- **Tests**: no se agregaron specs nuevos para `DevSimulatorService` — es una utilidad de dev y se prueba manualmente vía la UI. Se corrió la suite completa para verificar que los cambios en `WapiWebhookService` (firma con tercer parámetro opcional) y `WapiMediaService` (método nuevo) no rompen nada: **359/359 tests backend ✅**. `tsc --noEmit` ✅ en backend y frontend.
- **Pendientes intencionales**:
  - **Modelo `WapiSimulatorVirtualNumber`** + UI de admin (perfiles fake con name/avatar reusables entre tests).
  - **Vista chat split** (`/dashboard/dev/wapi/chat-simulator`): two-pane con cliente virtual a la izquierda + inbox del operador a la derecha; ida/vuelta natural sin forms separados. El MVP actual cubre el use case "inyectar payload puntual"; el split es para "tener una conversación".
  - **Audit log** de payloads inyectados (qué se mandó, cuándo, por quién).
- **Próximo paso**: el dueño hace el smoke test end-to-end con el simulator. Después decide entre **4.H (opt-out keywords)** o iterar sobre 4.L (virtual numbers + chat split).

### 2026-05-05 — Sesión 26 (Claude Opus 4.7) — Sub-fase 4.F.2.d (media WhatsApp end-to-end) + 4.L planificado

- **Contexto**: el dueño confirmó que el smoke test de Sesión 25 (inbox + quick replies) pasó OK y autorizó arrancar 4.F (entendido como **4.F.2.d media upload Meta**). Pidió además agregar al plan una sub-fase de "dev chat-simulator" (sub B en su mensaje) con dos números virtuales para testear ida/vuelta del inbox sin Meta real, y dejar la implementación para **después** de 4.F.2.d. Decisión de storage: filesystem local (simple, sin S3 hasta producción), porque Meta sólo retiene los uploads 30 días y los URLs de descarga inbound expiran a los 5 minutos — sin cache local, los threads históricos mostrarían media rota.
- **Backend — `WapiMediaService`** (`apps/backend/src/modules/wapi/media/`):
  - `wapi-media.types.ts`: `WapiMediaType` ('image'|'audio'|'video'|'document'|'sticker'), `MEDIA_LIMITS_BY_TYPE` (image 5MB, audio/video 16MB, document 100MB, sticker 100KB/500KB), `ALLOWED_MIMES_BY_TYPE` (whitelist de mimes que Meta acepta), `EXTENSION_BY_MIME`, `detectTypeFromMime` y `WapiMediaException` (con `details` field — no `cause`, que conflictúa con `Error.cause` base member).
  - `wapi-media.service.ts`: 4 métodos públicos. `validateUpload(buffer, mime, type?)` valida mime + tamaño contra los límites, opcionalmente fuerza el type. `uploadToMeta(cfg, file, type)` sube a `POST /v{ver}/{phoneNumberId}/media` (multipart con `Buffer`+`Blob`+`FormData` nativo de Node 22), persiste localmente por sha256 (path `<orgId>/<teamId>/<sha256>.<ext>`, idempotente — si el archivo ya existe no se reescribe), devuelve `{ mediaId, sha256, size, localPath }`. `fetchInboundMedia(cfg, mediaId)` hace 2 calls: `GET /v{ver}/{mediaId}` para resolver URL + sha256, después GET binario con Bearer header (Meta exige), persiste local. `openLocal(localPath)` devuelve `{ stream, size }` para el StreamableFile del controller. Path traversal prevenido en `resolveAbs` (rechaza `..` o paths absolutos).
  - Config resuelve via `prisma.scoped.wapiConfig` + decrypt de `accessTokenEnc` con `EncryptionService`.
  - Registrado como provider + export en `WapiModule`.
- **Backend — sender**: `WapiSenderService.sendMediaById(cfg, input)` agregado. Usa `media: { id }` en el payload (vs `link` del envío sin upload previo). Caption excluido para audio/sticker (regla Meta), filename sólo para document.
- **Backend — inbox**:
  - `WapiInboxService.sendMedia(conversationId, dto, file)` orquesta: valida ventana 24h → resuelve config encriptado → `media.uploadToMeta` → `sender.sendMediaById` → persiste `WapiMessage` con los 7 campos media (`mediaId/mediaMime/mediaSha256/mediaSize/mediaFilename/mediaCaption/mediaLocalPath`) → emite `wapi.message.new` y `wapi.conversation.updated`.
  - `getMessageMediaMeta(messageId)` devuelve `{ localPath, mime, filename, size }` para el endpoint de descarga.
  - `MessagePayload` extendido con `mediaMime/mediaSize/mediaFilename/mediaCaption` opcionales — el `select` de `listMessages` ahora los incluye.
  - Endpoints en el controller: `POST conversations/:id/media` con `FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } })` (cap superior = 100MB, validación fina la hace el service); `GET messages/:id/media` con `StreamableFile`, `Cache-Control: private, max-age=86400`, Content-Disposition `inline` para image/audio/video y `attachment` para documentos.
- **Backend — webhook**: `handleInboundMessage` extrae `mediaId` + `mime` + `sha256FromMeta` + `caption` + `filename` per type via helper `extractMediaInfo(msg)`. Después llama `media.fetchInboundMedia` para image/audio/video/document/sticker. Falla gracefully: si la descarga revienta (timeout, 404, 5min URL expirada), se persiste el mensaje **sin** `mediaLocalPath` y se loguea warning — los datos del thread no se pierden. Reactions no descargan binario (sólo metadata). Tests del webhook actualizados con mock `media: { fetchInboundMedia: jest.fn() }` y mock `wapiConversation.findFirst` que faltaba desde 4.F.3 (pre-existing bug del que también colaba 4 tests).
- **Schema + migración**: `WapiMessage` agrega `mediaId/mediaMime/mediaSha256/mediaSize/mediaFilename/mediaCaption/mediaLocalPath` (todos nullable) + índice `@@index([teamId, mediaSha256])` para queries de dedup. Migración `packages/prisma/prisma/migrations/20260505100000_wapi_message_media_fields/migration.sql` escrita a mano porque Postgres en WSL no estaba up al momento del cambio — el dueño tiene que arrancarlo y correr `pnpm --filter @massivo/prisma migrate:deploy` antes del smoke test. `prisma generate` ya se corrió.
- **Frontend — `ApiClient`**: agregué `postForm<T>(path, FormData)` (no setea Content-Type, lo hace el browser con boundary) y `getBlob(path)` (GET autenticado que devuelve Blob — necesario porque `<img src>` no carga Authorization headers).
- **Frontend — `MessageComposer`**: botón AttachFile con `Menu` que dispara `<input type="file">` oculto con `accept` por tipo (jpg/png/webp para imagen, mp3/ogg/aac para audio, mp4/3gpp para video, pdf/doc/xls/etc para documento). Validación client de tamaño contra `MEDIA_LIMITS_MB` (matchea backend). Si pasa, abre `Dialog` con `MediaPreview` (img/video/audio/icon-card según type) + `TextField` para caption opcional (oculto para audio/sticker porque Meta no acepta caption ahí) + Cancelar/Enviar. Submit llama `inboxApi.sendMedia(api, id, file, type, caption?)`.
- **Frontend — `MessageBubble`** (extraído a archivo propio `MessageBubble.tsx`):
  - Imagen/sticker: hook `useMediaBlobUrl(messageId, true)` descarga el blob via `api.getBlob(inboxApi.mediaPath(id))` y crea object URL (revocado al desmontar). Click abre `Modal` zoom full-screen.
  - Video: `<video controls>` con object URL.
  - Audio: `<audio controls>` con object URL.
  - Documento: tarjeta clickeable con `InsertDriveFileIcon` + filename + size formateado. Click descarga (no carga el blob hasta que el usuario lo pide).
  - Sticker: rendered como imagen pero más chico (140px max) y sin background.
  - Reacción: pill compacto con el emoji + timestamp (sin meta de check/status — no aplica). **Limitación conocida**: no está anchored al mensaje original, queda como bubble propio. El anchoring real requiere refactor del thread para mantener un index de reactions por `metaMessageId` — diferido.
  - Mensajes sin media binaria (location/contacts/interactive/button) caen al fallback de italics + emoji existente.
  - Caption se extrae primero de `mediaCaption` (campo nuevo, persistido en send), después del fallback `content[type].caption`.
- **`MIGRATION_PLAN.md`**: agregada sub-fase **4.L — Dev Simulator de chat WhatsApp (focused inbox QA)** con 5 sub-items (modelo `WapiSimulatorVirtualNumber`, endpoints `simulate/inbound` + `simulate/status`, UI two-pane `chat-simulator`, audit log). Aclara que reusa la infra de Fase 9 (Dev Simulator general) pero presenta una vista chat split (cliente virtual ↔ inbox del operador) que es lo que el dueño pidió. Activado por `ENABLE_DEV_SIMULATOR=true`. Nota explícita de que se implementa **después** de cerrar 4.F.
- **`.env.example`**: agregada `WAPI_MEDIA_DIR=./uploads/wapi-media`.
- **Tests**: nuevo `wapi-media.service.spec.ts` con 5 casos (validateUpload INVALID_MIME, TOO_LARGE; uploadToMeta happy path; uploadToMeta META_UPLOAD_FAILED; fetchInboundMedia happy path; idempotencia — mtime no cambia en re-write del mismo sha256). `wapi-inbox.service.spec.ts` con un test extra "sendMedia happy path: sube a Meta, persiste con campos media, emite eventos". `wapi-webhook.service.spec.ts` con 2 tests extra de media inbound (happy path con sha256/localPath; failure case con localPath null) + arreglos de mocks pre-existentes. **359/359 tests backend ✅**. Frontend `tsc --noEmit` ✅.
- **Decisiones**:
  - **Storage local con sha256 como key**: ahorra espacio (mismo binario reusado por N conversaciones se guarda una sola vez), facilita garbage collection futuro (cron que borra archivos sin referencias). Path `<orgId>/<teamId>/<sha256>.<ext>` mantiene aislamiento por tenant en disco también.
  - **Cap superior multer = 100MB**: el más grande de los límites por tipo. La validación fina por tipo la hace `WapiMediaService.validateUpload` (porque multer no sabe de qué tipo es el upload hasta haberlo leído).
  - **Endpoint de descarga retorna `StreamableFile`**: evita cargar el archivo entero en memoria. Cache-Control private 24h porque el contenido es inmutable (sha256 = key).
  - **Frontend usa `getBlob` + object URL en lugar de `<img src>` directo**: necesario porque el endpoint requiere Bearer token y `<img>` no permite headers custom. El browser cachea el response gracias a Cache-Control.
- **Pendientes intencionales en 4.F.2.d**:
  - **Smoke test end-to-end del dueño**: subir imagen/audio/doc desde composer → verificar que llega a Meta → ver el render en el otro WhatsApp. Recibir media inbound → ver que se descarga al disco y renderiza. Falta porque requiere número Meta real conectado.
  - **Aplicar migración**: el dueño tiene que arrancar Postgres en WSL y correr `pnpm --filter @massivo/prisma migrate:deploy`. Sin esto el backend tira error al primer media insert.
  - **Reaction anchoring**: hoy las reactions son bubbles sueltos. Refactor del thread para indexar por `metaMessageId` y renderizarlas como overlay del bubble target — diferido.
  - **Garbage collection de media local**: cron que borra archivos en `WAPI_MEDIA_DIR` sin referencias en `WapiMessage.mediaSha256` — diferido a Fase 11 (hardening).
- **Próximo paso**: **smoke test del dueño**. Después decidir entre **4.H (opt-out automático con keywords)** o **4.L (dev chat-simulator)** que destrabaría QA sin Meta.

### 2026-05-04 — Sesión 25 (Claude Opus 4.7) — Sub-fase 4.F.4 (frontend inbox) + 4.G (quick replies admin)

- **Contexto**: continuación inmediata de 4.F.3 con autorización del dueño _"perfecto, avanza con la siguientefase"_. Backend del inbox ya estaba completo, había que armar la UI en React + MUI con look moderno (Front/Intercom/Chatwoot) y reutilizar patrones existentes (NotifyProvider, ConfirmProvider, useApi, useTeamSocket).
- **Estructura de archivos** (`apps/frontend/src/features/wapi/inbox/`): `types.ts` (espejo de los DTOs del backend), `api.ts` (clientes `inboxApi` y `quickRepliesApi` con helper `qs`), `formatters.ts` (`formatPhone`, `formatRelative`, `formatTime`, `formatDateHeader` con Hoy/Ayer, `isWindowOpen`, `initials`), y los componentes:
  - **`ConversationList.tsx`** — sidebar 360px con título "Inbox", search `TextField`, scrollable Tabs, lista de filas con `Avatar`+`Badge` para unread, preview con check de fromMe, RESOLVED chip, campaignName subtitle, "Cargar más" para cursor.
  - **`ConversationThread.tsx`** — fondo WhatsApp (`#efeae2` light / `#0b141a` dark) con dotted radial, mensajes ordenados asc, date dividers tipo Hoy/Ayer/weekday, `MessageBubble` con tail logic (corner agudo cuando cambia el sender o pasan >60s), `ReceiptIcon` con doble check azul para `read`, fallback de italics + emoji para tipos no-texto, render del markdown WhatsApp via `renderWhatsAppMarkdown`. Auto-scroll al fondo al recibir nuevos mensajes (con `lastIdRef`).
  - **`ConversationHeader.tsx`** — barra superior con avatar, nombre/teléfono, status chip (Sin asignar warning outlined / Asignada primary outlined / Resuelta success), botones Tomar (login icon, sólo si no es mía), Resolver/Reabrir, MarkRead/Unread toggle según `unreadCount`, MoreVert con menu (Asignar, Liberar).
  - **`MessageComposer.tsx`** — textarea multiline (Enter envía, Shift+Enter salto), botón send + botón quick replies (Bolt icon). Detección de `/` al inicio o después de `\n` con regex `(^|\n)\/([a-z0-9_-]*)$` que abre `Popper` con `WapiQuickReply[]` filtrado live. Navegable con flechas, Enter/Tab inserta, Escape cierra. Banner Alert warning cuando ventana 24h cerrada (con sugerencia de usar template) y banner info cuando la convo está RESOLVED. Borrador persistido por conversación en `localStorage[massivo:wapi:draft:<id>]`, se borra al enviar exitoso.
  - **`AssignDialog.tsx`** — fetch a `/api/teams/:teamId/members`, lista filtrable por nombre/email con avatares.
  - **`ResolveDialog.tsx`** — note opcional multiline (max 2000), pasa `null` si está vacío.
  - **`WapiInboxPage.tsx`** — orchestrator. Estado para tab/search/items/cursors/selectedId/conversation/messages/dialogs/quickReplies/currentUserId. Search debounced 300ms. Al cambiar tab resetea selección. Al seleccionar carga `getConversation` + `listMessages` en paralelo y auto-marca como leído si tenía `unreadCount > 0`. Listeners socket con `useTeamSocket()`: `wapi.message.new` append al thread abierto + reorder en lista (mueve la convo al tope, actualiza preview, incrementa unread si no está abierta y no es nuestra) y `wapi.conversation.updated` que mergea status/asignación/resolvedAt en lista y detail. Empty state con `ChatBubbleOutlineIcon`.
- **Quick replies admin** (`apps/frontend/src/features/wapi/quick-replies/WapiQuickRepliesPage.tsx`): tabla con columnas Atajo (Chip monospace `/slug`) / Contenido (truncado 2 líneas) / Acciones (editar, eliminar con `useConfirm` destructive). Editor en `Dialog` con validación de regex `^[a-z0-9][a-z0-9_-]{0,39}$` y body 1-4096 con contador. Reusa `quickRepliesApi`.
- **Routing y navegación**: agregadas rutas `/dashboard/wapi/inbox` y `/dashboard/wapi/quick-replies` en `App.tsx`. Sidebar grupo WhatsApp ahora muestra: **Inbox** (`InboxIcon`) → Campañas → Templates → **Respuestas rápidas** (`BoltIcon`) → Números.
- **Identidad del usuario**: `WapiInboxPage` consulta `/api/me/context` al montar para obtener el `user.id` interno (no el `clerkUserId`) y lo pasa a `ConversationHeader` para que pueda determinar `isMine` (`assignedUserId === currentUserId`).
- **Verificación**: `pnpm --filter @massivo/frontend typecheck` ✅ exit 0.
- **Decisiones de diseño**:
  - El layout es 2 columnas (sin panel derecho de detalles tipo Front) — mantiene la UI más simple. Si el dueño quiere ver historial de notas + datos del contacto en un panel a la derecha, lo agregamos como toggle desde el header.
  - El `MessageComposer` solo manda texto. Cuando se sume media upload (4.F.2.d), agregaremos botón attach con dropdown (Imagen / Documento / Audio).
  - Quick replies hoy son globales por team. Si surge necesidad de scoping por usuario o categorías, lo modelamos en una iteración futura.
  - El "Tomar" del header llama a `inboxApi.take(id)` que internamente hace assign al `ctx.userId`. La auto-asignación al responder a una UNASSIGNED ya estaba en backend (4.F.3) — el `take` explícito es para los casos donde el operador quiere reservar la convo antes de tipear.
  - Auto mark-read al abrir respeta el comportamiento estándar de inboxes (Front, Slack, Gmail). El usuario puede después hacer "marcar como no leído" desde el header.
- **Pendientes intencionales en 4.F.4**:
  - Subir media en respuesta (espera 4.F.2.d).
  - Indicador "está escribiendo…" — Cloud API no envía typing events nativos, se postergó.
  - Deep links a la conversación (sin URL parameter por ahora — el `selectedId` vive en estado local).
  - Vista del historial de notas de cierre dentro de la convo — endpoint listo (`/notes`), falta UI (panel lateral o en el header).
- **Smoke test post-implementación (esta misma sesión, después del primer commit)**:
  - **Bug 1 — loop de `/api/me/context`**: el dueño detectó que el endpoint `/api/me/context` se llamaba en bucle desde `WapiInboxPage`. Causa raíz: `useApi()` en `apps/frontend/src/api/client.ts` retornaba un objeto literal nuevo en cada render, y todos los `useEffect`/`useCallback` con `[api]` como dependencia (carga de currentUser, quick replies, `reloadList`, listeners socket) se re-ejecutaban en cada render. **Fix**: envolver el objeto retornado en `useMemo<ApiClient>(..., [request, download])`. `request` y `download` ya estaban memoizados con `useCallback`, así que ahora la identidad del cliente sólo cambia cuando cambia `getToken` o `activeTeamId`. Beneficia a todas las pantallas existentes, no sólo al inbox.
  - **Bug 2 — webhook 404 → 403 → Prisma error**: el dueño probó el `curl` del seed manual y encontró tres problemas en orden: (a) la URL real es `/api/webhooks/wapi` (hay `app.setGlobalPrefix('api')` en `main.ts`, lo había olvidado al armar el ejemplo); (b) verificación de firma Meta con `appSecret` lo rechazaba — solución dev: setear `appSecretEnc = NULL` en la `WapiConfig` y el controller (`wapi-webhook.controller.ts:156-162`) acepta sin firmar con un warning; (c) **bug de 4.F.3**: `WapiWebhookService.shouldReopen` usaba el compound key `teamId_configId_phone` con `findFirst`, pero ese atajo sólo es válido en `findUnique`. El `as never` que tenía la línea hacía que TS no lo detectara. **Fix**: cambiar a `where: { teamId, configId, phone }` (la unicidad la garantiza el constraint del schema; `findFirst` con esos tres campos devuelve a lo sumo 1 registro).
  - **Ajuste UX 1 — inbox con scroll de página**: el inbox heredaba el padding y `maxWidth: 1400` del `<main>` de `AppLayout.tsx`, lo que hacía que el `100vh` calculado por el inbox excediera el viewport disponible y apareciera scroll en la página completa (en vez de scroll interno del thread/lista). **Fix**: agregado `useLocation()` en `AppLayout.tsx` y flag `isFullBleed` que detecta `pathname.startsWith('/dashboard/wapi/inbox')`. En modo full-bleed, el `<main>` setea `height: calc(100vh - 56px)`, `overflow: hidden`, y omite el wrapper `maxWidth`. El topbar mide 56px (no 64 como había puesto inicialmente). El `WapiInboxPage` ahora usa `flex: 1; minHeight: 0` y hereda altura del padre.
  - **Ajuste UX 2 — inbox pegado al sidebar**: a pedido del dueño, agregado padding `{ xs: 1, sm: 1.5, md: 2 }` al modo full-bleed del `<main>` para dar respiración entre el sidebar y el inbox. El contenedor del inbox ahora tiene `border: 1, borderColor: divider, borderRadius: 2, overflow: hidden` para verse como tarjeta enmarcada (estilo Front/Linear).
- **Estado al cierre**: typecheck frontend y backend ✅. Smoke test exitoso: el `curl` simulado al webhook crea la conversación, aparece en la tab "Sin asignar" en tiempo real, el inbox se ve enmarcado sin scroll de página.
- **Próximo paso al volver mañana**:
  1. Smoke test extendido por el dueño: responder al cliente, validar que `wapi.message.new` se propaga del backend al frontend (escribir `pnpm logs:tail` mientras se opera), tomar/asignar/resolver con nota, reabrir, crear y usar quick replies (probar con `/atajo` en el composer), abrir el inbox en dos pestañas y validar sincronización de unread counts y status.
  2. Decisión: ¿seguimos con **4.F.2.d (media upload Meta)** para terminar la suite WhatsApp o saltamos a **4.H (opt-out automático con keywords en inbound)** que es más alta prioridad de negocio?
  3. Pendientes técnicos abiertos: deep links a la conversación (URL param), panel lateral de notas de cierre (endpoint `/notes` listo), historial de asignaciones, vista de detalle de contacto.

### 2026-05-04 — Sesión 24 (Claude Opus 4.7) — Sub-fase 4.F.3 (backend inbox WhatsApp)

- **Contexto**: el dueño autorizó avanzar con el inbox conversacional con la siguiente directiva: _"que sea similar al de amsa sender, basandonos en la interfaz de whatsapp web, pero mejorando la UI, q sea mas moderno y segun estandares de inbox del mercado para el manejo de whatsapp, tene en cuenta la seccion de respuestas rapidas, poder marcar como leido o no leido el mensaje"_. Después agregó: _"el poder cerrar o resolver la conversacion con nota, q tambien esta en Amsa sender"_. Decidí splittar en backend (esta sesión) + frontend (próxima) para entregar la API completa antes de empezar a iterar UI.
- **Modelos Prisma**: agregados `WapiQuickReply` y `WapiResolutionNote` en `packages/prisma/prisma/schema.prisma` con relaciones a Organization, Team y (sólo el segundo) WapiConversation. `WapiQuickReply` con `@@unique([teamId, shortcut])` para evitar colisiones de slug. `WapiResolutionNote` se modeló como tabla separada (no como columna de `WapiConversation`) porque el dueño puede resolver→reabrir→resolver la misma conversación N veces y queremos historial completo. Agregado también el índice compuesto `WapiConversation @@index([teamId, status, lastMessageAt])` para acelerar el listado por tab. Migración aplicada: `20260504232310_wapi_inbox_quick_replies_resolution_notes`. Tenant scoping: `WapiQuickReply` y `WapiResolutionNote` agregados a `TENANT_SCOPED_MODELS` en `tenant-models.ts`.
- **Permisos CASL**: agregados subjects nuevos `Conversation` y `QuickReply` en `packages/permissions/src/subjects.ts`. En `ability.ts`, team `MEMBER` recibe `read/update/send` sobre `Conversation` (puede leer cualquier convo del team, asignarse, marcar leído, resolver, responder) y CRUD completo sobre `QuickReply`. Team `ADMIN` ya cubre estos via `manage all`. Tests existentes siguen verdes (14 ✅).
- **Módulo `wapi/inbox`** (`apps/backend/src/modules/wapi/inbox/`):
  - **DTOs**: `ListWapiConversationsQueryDto` con tabs `mine|unassigned|others|resolved|all`, `configId`, `search`, paginación cursor; `ListWapiMessagesQueryDto` con cursor; `SendWapiInboxTextDto` con body (1-4096 chars) y `previewUrl?`; `AssignWapiConversationDto`, `ResolveWapiConversationDto` (note opcional), `MarkReadStateDto`.
  - **Service** `WapiInboxService`:
    - `listConversations(query)` — filtra por tab (mapea `mine` → `assignedUserId = ctx.userId AND status = ASSIGNED`, `others` → `status = ASSIGNED AND assignedUserId != ctx.userId`, `unassigned` → `UNASSIGNED`, `resolved` → `RESOLVED`, `all` → todas no-resueltas), search insensitive sobre `phone` y `name`, orden `lastMessageAt desc, id desc`. Incluye el último mensaje (subselect take 1) para preview. Devuelve `nextCursor`.
    - `getConversation(id)` y `listMessages(id, query)` — cursor-based, validan que la convo exista (404 si no).
    - `sendText(id, dto)` — valida ventana 24h (BadRequest si está cerrada), conflicto si la convo está RESOLVED, llama `WapiSenderService.sendText` con la config del tenant (decripta accessToken), persiste `WapiMessage(fromMe=true, type=text, status=sent)`, refresca `lastMessageAt` y `firstReplyAt`, **auto-asigna** si la convo estaba UNASSIGNED (status → ASSIGNED, assignedUserId → ctx.userId — patrón AMSA Sender). Emite eventos `wapi.message.new` y `wapi.conversation.updated` al room del team.
    - `setReadState(id, read)` — toggle de leído: `read=true` resetea `unreadCount` y setea `lastReadAt`, `read=false` lo vuelve a 1 (suficiente como flag — el frontend sólo necesita "tiene mensajes nuevos sí/no" en la lista).
    - `take/assign/unassign` — manipulan `status` y `assignedUserId`. `take` es sugar para `assign(ctx.userId)`. Falla con Conflict si la convo está RESOLVED.
    - `resolve(id, dto)` — set `status=RESOLVED, resolvedAt=now`. Si vino `note`, persiste `WapiResolutionNote(authorUserId=ctx.userId)`. Falla con Conflict si ya estaba RESOLVED.
    - `reopen(id)` — vuelve a `ASSIGNED` (si tenía dueño) o `UNASSIGNED` (si no), limpia `resolvedAt`. Falla con Conflict si no estaba RESOLVED.
    - `listResolutionNotes(id)` — historial ordenado desc.
  - **Controller** bajo `POST /api/wapi/inbox/*`. Todos con `@CheckPolicies` sobre el subject `Conversation`.
- **Módulo `wapi/quick-replies`** (`apps/backend/src/modules/wapi/quick-replies/`): CRUD plano con `WapiQuickRepliesService` y controller bajo `/api/wapi/quick-replies`. Validación `shortcut` con regex `^[a-z0-9][a-z0-9_-]{0,39}$`. Conflict 409 si el shortcut ya existe (P2002 capturado). Policies sobre subject `QuickReply`.
- **Webhook (`wapi-webhook.service.ts`)**:
  - Agregada **auto-reapertura**: si entra un mensaje a una convo RESOLVED, vuelve a ASSIGNED (si conserva `assignedUserId`) o UNASSIGNED (si no), limpia `resolvedAt`. Implementado vía helper `shouldReopen` que se llama dentro del `update` del upsert.
  - Agregados **eventos socket** adicionales: además del legacy `wapi.message.inbound` (que se mantiene para no romper consumers existentes de 3.E), ahora emite `wapi.message.new` (con el mensaje completo serializado para que el frontend lo append a la conversación abierta sin re-fetchear) y `wapi.conversation.updated` (con shape de la convo para refrescar la entry en la lista del inbox).
- **Tests** (`wapi-inbox.service.spec.ts` + `wapi-quick-replies.service.spec.ts`): 12 casos (8 + 5) cubriendo filtro `mine`, ventana 24h cerrada, conflicto RESOLVED, happy path con auto-asignación + emisión de eventos, resolve con/sin nota persistida, reopen no-aplicable, listMessages 404, create con userId del ctx, P2002 → Conflict, validación de existencia en update y delete. Todos verdes.
- **Verificación**: `tsc --noEmit` ✅ en backend tras corregir 3 errores menores (objetos posiblemente undefined en cursor pagination + nombre de propiedad de `WapiSendException` que es `detail` no `error`). Tests backend ✅. Tests permisos ✅.
- **Issue conocido (no bloqueante)**: durante `prisma generate` el dev server tenía lockeado `query_engine-windows.dll.node`. La migración SQL se aplicó OK; el cliente Prisma cargado en runtime se regenera al reiniciar el backend. **Después del pull, el dueño debe reiniciar el backend antes de tocar las nuevas APIs.**
- **Pendientes intencionales en 4.F.3**:
  - **Subir media en respuesta**: el composer del frontend (próxima sesión) podría querer mandar imágenes/PDFs. Hoy el inbox sólo manda texto. Cuando se sume, el endpoint `POST conversations/:id/messages` puede aceptar discriminated union por `type`, o un endpoint separado `POST conversations/:id/media`. Decidiremos cuando se prototipe el composer.
  - **Notas durante la conversación (no de cierre)**: AMSA Sender tiene notas internas mid-conversation; en Massivo por ahora sólo modelamos notas de cierre. Si el dueño lo pide, agregar `WapiInternalNote` con flag `internal=true` o reutilizar `WapiResolutionNote` con un campo `kind`.
  - **Etiquetas / labels** sobre conversaciones: pendiente para post-MVP.
  - **Búsqueda dentro del thread**: hoy `search` opera sobre la lista (phone/name); buscar dentro de los mensajes de una convo abierta queda para después.
- **Próximo paso recomendado**: **4.F.4 — Frontend del inbox**. Layout 2 columnas (lista a la izq + thread a la der, con panel de detalles colapsable opcional a la derecha estilo Front/Intercom). Lista con tabs (Mías / Sin asignar / Otras / Resueltas), search, filtro por config. Thread con burbujas tipo WhatsApp Web (markdown re-usando `whatsappMarkdown.tsx` de 4.F.2.c), agrupación por fecha, grupos por sender, indicador de read receipt en mensajes salientes (estado del WapiReport), banner cuando la ventana 24h está cerrada (con CTA a iniciar campaña con template). Composer con: textarea, dropdown de quick replies (trigger con `/`, fetch al endpoint nuevo), emoji picker, botón attach (placeholder/disabled hasta media upload), draft persistido en localStorage. Header de la conversación con acciones: Tomar / Asignar (modal con lista del team) / Resolver (dialog con nota opcional) / Marcar como leído/no leído. Listeners de socket sobre `wapi.message.new` y `wapi.conversation.updated`. Página separada `/dashboard/wapi/quick-replies` para CRUD admin (4.G).

### 2026-05-04 — Sesión 23 (Claude Opus 4.7) — Mapeo CSV→vars del template + markdown preview + dark mode fixes (4.F.1.c + 4.F.2.c)

- **Contexto**: smoke test del dueño post-4.F.2.b detectó dos issues bloqueantes/UX: (a) la preview del template se veía mal en dark mode (burbujas con colores light) y no soportaba markdown WhatsApp; (b) al asignar un template con `{{N}}` a una campaña, no había forma de mapear las columnas del CSV a las variables — el envío fallaba con Meta error #132000 ("Number of parameters does not match").
- **4.F.2.c — Markdown WhatsApp en preview + dark mode**:
  - Helper nuevo `apps/frontend/src/features/wapi/templates/whatsappMarkdown.tsx` que tokeniza el subset oficial de WhatsApp en dos pasadas (mono/bloque primero, sin nesting; después negrita/cursiva/tachado, anidables vía `findEarliestInline`). Render con `<strong>`, `<em>`, `<span>` con line-through, `<Box component="code">` y `<Box component="pre">` con `bgcolor` theme-aware.
  - Aplicado en list page (diálogo de preview) y editor (live preview): header, body y footer pasan por `renderWhatsAppMarkdown`.
  - **Dark mode**: las burbujas usaban `#e5ddd5` (cream) y `#fff` hardcodeado. Migrado a callbacks `(t) => t.palette.mode === 'dark' ? '#0b141a' : '#e5ddd5'` (fondo chat), `#1f2c34/#fff` (burbuja), `#e9edef/text.primary` (texto), `#53bdeb/#0084ff` (botones), `rgba(255,255,255,0.12)/divider` (borders). Aplicado list + editor.
  - Emojis: ya funcionaban con teclado del SO (Win+`.`) — no requirió cambios.
- **4.F.1.c — Mapeo CSV → vars del template**:
  - **Backend `UpdateWapiCampaignDto`** (`apps/backend/src/modules/wapi/campaigns/wapi-campaigns.dto.ts`): suma `config?: Record<string, unknown> | null`. El service ya pasaba `dto as never` a Prisma, así que persiste sin más cambios. El worker (`WapiWorkerService.buildTemplateComponents`) ya leía `campaign.config.bodyVars` desde 4.A — sólo faltaba el camino de escritura.
  - **Endpoint nuevo `GET /api/wapi/campaigns/:id/contacts/data-keys`** (`wapi-campaigns.controller.ts` + `getContactDataKeys` en service): toma muestra de hasta 200 `WapiContact` y devuelve la unión ordenada de keys de `data`. Suficiente para CSVs uniformes; permite poblar el dropdown de mapping sin pedir re-pegar el CSV. Policy: `read Campaign`.
  - **Frontend `WapiCampaignDetailPage`**: nueva sección "Variables del template (N)" que aparece cuando el template seleccionado tiene `{{N}}` en el body. Fetch on-demand de `/api/wapi/templates/:id` (full detail con `components`) cuando cambia `templateId` — extrae el body text del componente type=BODY y cuenta vars con regex `/\{\{(\d+)\}\}/g`. Muestra el body en cursiva como referencia. Por cada `{{N}}`: dropdown con las columnas detectadas (CSV en pantalla + `data-keys` del backend mergeados y deduplicados); fallback a TextField libre si no hay columnas conocidas. Estado `bodyVars: string[]` sincroniza tamaño con `bodyVarsCount` y se inicializa desde `campaign.config.bodyVars`. `handleSave` incluye `config: { bodyVars }` en el PATCH; `handleUploadContacts` re-fetcha `data-keys` para refrescar las sugerencias después de subir CSV nuevo. `canSend` exige `varsSatisfied` (todos los slots no vacíos en el saved config).
  - **Parser CSV** (`parseContactsCsv`): cambio sutil pero clave — `name`/`nombre` ya no son `else if` (se "consumían" exclusivamente en el escalar), ahora son `if` separado y caen también al bloque `if (v) data[h] = v`. Resultado: la columna queda en ambos lados (`contact.name` para el listado UI, `contact.data.nombre` para mapping de templates).
- **Errores Meta resueltos**:
  - **#132000 (parameter count mismatch)**: el frontend no permitía mapear vars y el worker mandaba template sin parameters. Resuelto end-to-end con la sección de mapping + persistencia.
  - **#131008 (required parameter is missing)**: el worker mandaba `text: ''` cuando la columna estaba ausente. `buildTemplateComponents` ahora throwea `Variable {{N}} (columna "X") está vacía o no existe en este contacto` con índice y nombre — visible en la columna error de la sección de envíos. Fallback agregado: si la spec es `name`/`nombre` y `data[spec]` está vacío, usa `contact.name` (rescata contactos cargados antes del fix del parser, sin tener que re-cargar CSV).
- **Verificación**: `tsc -b --noEmit` ✅ en backend y frontend (los 2 errores TS pre-existentes en `email/CampaignDetailPage` siguen ahí, no nuestros). Smoke test del dueño confirmado: _"funciono de 10!"_ tras todos los fixes.
- **Pendientes intencionales en 4.F.1.c / 4.F.2.c**:
  - **Header con vars**: el worker hoy sólo arma component `body`. Si un template tiene `{{N}}` en el header, no se manda el parameter del header. Es nicho — la mayoría de los templates tienen vars sólo en el body. Cuando se necesite, agregar `headerVars` al `campaign.config` y otro componente `{ type: 'header', parameters }` en `buildTemplateComponents`.
  - **Tests del posting + mapping**: no hay tests automáticos del nuevo `getContactDataKeys` ni de la integración worker→Meta con vars. El flow está cubierto por specs existentes de send + el smoke test manual; agregar tests cuando estabilicemos el shape final del config (cuando se sume header vars).
  - **Renombramiento 4.F.2.c**: el item original "Resumable Upload Meta" del plan ahora se renombra a **4.F.2.d** porque el slot 4.F.2.c se usó para markdown+darkmode. Documentado en el header de fase actual.
- **Próximo paso recomendado**: **4.F.3-4 — Inbox conversacional WAPI**. Modelos `WapiConversation` y `WapiMessage` ya existen desde 2.B; el inbound webhook (4.C) ya populea `WapiMessage` con direction=INBOUND. Falta: (a) endpoint backend `GET /api/wapi/conversations` (lista paginada con last message preview), (b) `GET /api/wapi/conversations/:id/messages` (thread paginado), (c) `POST /api/wapi/conversations/:id/messages` (send dentro de ventana 24h, valida que el último mensaje INBOUND fue ≤ 24h), (d) frontend `/dashboard/wapi/inbox` con lista lateral + thread + composer estilo WhatsApp Web. Alternativa: **4.F.2.d media upload** (3-step Resumable Upload), pero es más nicho — el inbox desbloquea casos de uso completos (responder consultas en vivo). Mi voto: inbox.

### 2026-05-04 — Sesión 22 (Claude Opus 4.7) — Sub-fase 4.F.1 (frontend de campañas WAPI)

- **Decisión de scope**: tras cerrar 4.E el dueño autorizó arrancar el frontend con la directiva _"q sea lo mas simple e intuitivo de usar. Siguiendo con el mismo estilo q ya le estamos dando a massivo app en el modulo de los mails"_. También adelantó un requerimiento de 4.F.2: _"los templates se puedan crear desde massivo app y postearlos en meta, quiero q sea con todas las posbilidades de templates para el uusuario, facil y sencillo. A futuro, incluir sugerencia de IA"_. Decidí dividir 4.F en sub-sub-fases para entregar valor incremental: **4.F.1** (esta sesión: listado + creación + detalle + processing banner + sends section + carga CSV de contactos), **4.F.2** (templates con creación desde Massivo + post a Meta + preview + AI placeholder), **4.F.3-4.F.4** (inbox conversacional).
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

### 2026-05-04 — Sesión 22 (continuación 3) — Sub-fase 4.F.2.b (frontend editor de templates)

- **Decisión de scope**: con 10% de tokens restantes, el dueño autorizó intentar 4.F.2.b. Apunté a entregar el editor funcional con preview en vivo + submit, sin tests automáticos (form complejo, prioridad smoke test del dueño primero).
- **`WapiTemplateEditorPage`** (`/dashboard/wapi/templates/new`): form en 2 columnas (form izq, preview sticky der) usando Box flex porque la versión de MUI Grid del proyecto exige `component` prop y rompe con `item xs md` syntax (TS2769). Migré a `Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}`.
  - **Detección de vars**: helper `detectVars(text)` con regex `/\{\{(\d+)\}\}/g` busca el N máximo. Effect sincroniza `headerTextExamples`/`bodyExamples` arrays cuando cambia el count, generando inputs de sample dinámicamente.
  - **Buttons editor**: hasta 3, type-aware (QUICK_REPLY texto/QUICK_REPLY, URL pide `url` adicional, PHONE_NUMBER pide `phoneNumber`). Add/remove con state local.
  - **Validación client-side**: `canSubmit` chequea name regex, idioma, configId, body texto+1024 chars, header (TEXT exige text, IMAGE/VIDEO/DOCUMENT exige mediaHandle), footer (si enabled exige text), buttons (cada uno texto + url/phone si aplica). Sin esto el backend tira BadRequest pero ahorramos round-trip.
  - **Submit**: builds payload exacto al `CreateWapiTemplateMetaDto`, POST a `/api/wapi/templates/submit/:configId`. Notifica + redirect a la lista. El nuevo aparece con badge PENDING.
  - **Preview**: replica el `TemplatePreview` del list (no extraído porque era más rápido duplicar — ~50 líneas — que crear un componente compartido). Substitución de vars en vivo via `buildPreviewText`.
  - **Botón "Sugerir con IA"**: placeholder con toast "disponible en Fase 6". Estructura preparada para enchufar Gemini.
- **CTA "Nuevo template"** en `WapiTemplatesListPage` con `RouterLink` a la ruta nueva. El "Sincronizar" pasó de contained a outlined para no competir visualmente. Texto explicativo actualizado.
- **Routing**: `App.tsx` agrega `wapi/templates/new` y el import.
- **Verificación**: `tsc -b --noEmit` ✅ para los archivos nuevos. Los 2 errores TS pre-existentes en `email/CampaignDetailPage` siguen tal cual. Smoke test del dueño pendiente (golden path: ir a `/wapi/templates`, click "Nuevo template", llenar form con vars en body, agregar 2 botones, ver preview, submit, verificar que aparece PENDING en la lista, revisar en Meta Business Manager que existe).
- **Pendientes intencionales en 4.F.2.b**:
  - **4.F.2.c — Resumable Upload Meta**: hoy `mediaHandle` se pide al usuario que lo genere por afuera. La sub-fase implementaría endpoint backend (3-step: start → upload → commit) + UI con `<input type="file">` que rellena el campo automáticamente.
  - **Edición de templates**: Meta sólo permite editar en ciertos estados (REJECTED). Agregar cuando se necesite — endpoint backend separado.
  - **Tests del editor**: form complejo, vale agregar Vitest cuando se estabilice. Priorizamos UX manual primero.
  - **Reuso de TemplatePreview**: hoy duplicado entre list y editor. Si crece la lógica de preview, extraer a shared component (probablemente cuando 4.F.2.c agregue render real de imagen/video).
- **Próximo paso**: **smoke test del dueño** + decidir si seguir con 4.F.2.c (media upload) o saltar a 4.F.3 (inbox conversacional). Mi voto: **inbox** — los media headers son nicho y el inbox desbloquea casos de uso completos. La directiva del dueño manda.

### 2026-05-04 — Sesión 22 (continuación 2) — Sub-fase 4.F.2.a (backend templates Massivo→Meta)

- **Decisión de scope**: tras smoke-test exitoso del golden path (crear config → sync templates → crear campaña → enviar) confirmado por el dueño, autorizó arrancar 4.F.2 con la directiva _"hace todo el backend y cuando termines vemos si llegamos con el frontend"_. Le advertí honestamente que 4.F.2 entera (backend + frontend del editor) no entra en lo que queda de sesión sin riesgo de quedar a la mitad. Subdividí en **4.F.2.a** (esta — backend posting service + endpoint + tests), **4.F.2.b** (frontend editor + preview + AI placeholder, sesión nueva), **4.F.2.c** (Resumable Upload para media headers, futura).
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

- **Decisión de scope**: tras cerrar 4.F.1, el dueño avisó _"no puedo crear campaña completa xq aun no tengo como crear una config y ver templates, asi q avancemos con eso primero, nose como sigue el plan"_. Propuse sub-dividir 4.F en **4.F.1.a** (CRUD de configs/números — sin esto no se puede sincronizar templates ni elegir desde dónde mandar), **4.F.1.b** (catálogo read-only + sync — con esto el usuario ya puede operar el golden path completo) y dejar **4.F.2** (editor de templates con posting a Meta) como sub-fase posterior. Aceptado _"perfecto avanza dale"_ + warning de uso de tokens al 78% — bundleé las dos en una sola sesión para no quedar a la mitad.
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

- **Decisión de scope**: el dueño autorizó _"si dale"_ sobre 4.E después de cerrar Sesión 20 (4.D + 4.C.1). Paridad con email 3.C: cierre del CRUD que en 4.A quedó como placeholder send-only. La infra de envío (`WapiQueueService`/`WapiWorkerService`) ya estaba — faltaba wiring del CRUD + control actions con el patrón de 3.C.5.
- **Migration `add_canceled_to_wapi_report_status`** — `WapiReportStatus` enum ahora tiene `PENDING/SENT/DELIVERED/READ/FAILED/CANCELED`. Decisión consultada al dueño antes de tocar schema: _"si por A"_. Opción A elegida (enum dedicado) sobre opción B (reutilizar `FAILED` + `error='force-closed'`) porque ensucia los counts de fallas reales del envío — un `forceClose` no es una falla, es una cancelación administrativa, y al ver el funnel `FAILED:50` no querés tener que segregar entre fallas Meta vs cancelaciones tuyas.
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

- **Decisión de scope**: el dueño dijo _"avanza"_ después de 4.C, así que continué en orden con 4.D. La idea: Massivo necesita conocer los `WapiTemplate` aprobados antes de poder lanzar campañas, y crearlos a mano vía CRUD existente es frágil (cambios de status en Meta — APPROVED/REJECTED — no se ven). 4.D agrega un sync explícito tirando del Graph API.
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
- **Sub-fase 4.C.1 (refactor in-session)** — Antes de commitear, el dueño preguntó: _"el webhook va a ser un webhook x config? imaginando q alguien puede subir 2 numeros de 2 apps distintas o 2 numeros de la misma app entonces el webhook es el mismo"_. Acertó: el diseño original `/api/webhooks/wapi/:configId` solo soporta 1 config = 1 Meta App. Si dos configs comparten App, Meta solo permite registrar una webhook URL en la App, así que pierde eventos del segundo config. Refactor in-session a URL única:
  - **`GET /api/webhooks/wapi`** (sin `:configId`): escanea todas las `WapiConfig` activas, decripta `webhookVerifyTokenEnc` de cada una, compara timing-safe contra `hub.verify_token`. Primera que matchea gana. Es one-shot (registro de webhook), N decrypts cacheados por LRU del `EncryptionService`.
  - **`POST /api/webhooks/wapi`** (sin `:configId`): parsea rawBody, extrae los `phone_number_id` únicos (`entry[].changes[].value.metadata.phone_number_id`), `findMany({ phoneNumberId: { in: [...] } })` para resolver configs. Valida HMAC con el `appSecret` del primer config — todos los configs de la misma App comparten ese secreto, así que cualquiera sirve. Le pasa al service un `Map<phoneNumberId, ResolvedWebhookConfig>`. Sin matches → 404.
  - **`WapiWebhookService.process(payload, configByPhoneNumberId)`**: itera entry-by-entry, resuelve config por `phone_number_id`, corre cada `value` en su propio `TenantContext.run`. Si Meta batchea events de N números en un mismo POST, cada uno se procesa contra su tenant correcto (caso real cuando un team tiene 2 números bajo la misma App).
  - **Decisión**: la opción alternativa era modelar `WapiMetaApp` separado (App ⊃ WABAs ⊃ phoneNumbers) con URL `/webhooks/wapi/app/:metaAppId`. Más correcta conceptualmente pero requiere migración + cambio de UX (crear App primero, después configs). Para MVP, el lookup por payload es suficiente y no requiere schema changes.
  - **Tests adicionales** (5 nuevos): match en 2ª config (escanea todas), multi-config carga ambos en map, phone_number_id sin matching → 404, payload sin phone_number_id → ignorado sin DB, multi-tenant entry processing.
  - **Verificación final**: backend full **300/300 ✅** (295 de 4.D + 5 nuevos de 4.C.1, 0 regresiones). `tsc --noEmit` clean.
- **Próximo paso**: **4.E — CRUD completo de campañas WAPI**. Paridad con email 3.C: create/update/addContacts/control actions (PAUSE/RESUME/FORCE_CLOSE)/getReport/realtime. La infra de envío (`WapiQueueService` + `WapiWorkerService`) ya está de 4.A — falta el wiring del CRUD y los control actions con el patrón de 3.C.5. Alternativa: **4.F — Inbox conversacional** (modelos ya existen de 2.B, el inbound ya entra de 4.C, falta UI + take/assign/resolve + media S3).

### 2026-05-04 — Sesión 19 (Claude Opus 4.7) — Sub-fase 4.C (webhook Meta WhatsApp Cloud API)

- **Decisión de scope**: continuar Fase 4 en orden — el dueño dijo _"perfecto, avanza con el 4C"_ después de 4.B. 4.C cubre el inbound del canal WAPI: verify del registro del webhook + recepción de `statuses` (delivered/read/failed) y `messages[]` entrantes (base del inbox que viene en 4.F).
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

- **Decisión arquitectónica del dueño**: cloud-agnostic. La frase exacta fue _"no quiero que massivo app quede acoplado solo a soluciones de AWS, xq si en un momento tendria q cambiar de entorno, complicaria las cosas. Quiero quedar lo mas abstracto e independiente posible"_. Descartado AWS KMS-only; elegido AES-256-GCM con master key en env detrás de una abstracción `EncryptionService` (clase abstracta) — el día que se quiera swapear a KMS / Vault / GCP, sólo cambia el `useExisting` del `SecurityModule`, los call sites no se tocan.
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
