# Avances: multi-canal + bot único + inbox unificado

> Log vivo para continuar entre sesiones. **Plan:** [CHANNELS_BOT_PLAN.md](./CHANNELS_BOT_PLAN.md).
> **Diseño:** [CHANNELS_BOT_DESIGN.md](./CHANNELS_BOT_DESIGN.md).
> **Rama:** `feat/multichannel-bot`.

---

## Estado actual

**Fase en curso:** **Fase 0 COMPLETA** (0a+0b) + **Fase 1: 1a–1d COMPLETAS** (1d
verificado: migración aplicada + cero drift + backend/frontend tsc limpio + specs
verdes). Próximo: **1e** (inbox unificado API+UI + rename de contrato) o **1g**
(rename de clases/módulo del bot). **Pendiente smoke runtime de 1d** (Chat simulado).

**Última actualización:** sesión 3 (2026-06-05).

**Commits en `feat/multichannel-bot` (en orden):**
- `8f13e21` — 0a: entidad `Bot` + migración/backfill + wiring backend
- `7a91895` — 0b backend: API `/api/bots` bot-centric + connect/disconnect
- `93567c2` — 0b frontend base: `botsApi` + tipos
- `6bf17db` — 0b frontend UI: editor bot-centric + selector en Números
- `c16348a` — Bots a sección propia del sidebar + ruta `/dashboard/bots`
- `b13b741` — dialog propio para crear bot (reemplaza window.prompt)
- `212fd0a` — fix Chat simulado muestra conversaciones manejadas por el bot
- `8b25093` — fix connect endpoint POST
- `63a09b6` — **1a**: capa de abstracción de canal + `WhatsAppAdapter`
- `0618f65` — **1b**: engine + inbox envían vía adapter; guard 24h → capability

**✅ Probado en runtime por el usuario:** crear bot, editar/publicar, conectar a un
número (Números), y el bot responde end-to-end en el Chat simulado.

### Para retomar mañana
1. `git checkout feat/multichannel-bot`. **Ojo:** 1c y 1d están en el working tree
   **sin commitear** — commitear antes de seguir.
2. **Smoke runtime de 1d PENDIENTE:** levantar backend (DB ya migrada) + Chat
   simulado → confirmar upsert Conversation con `channelKind`, Message con
   `channelId`+`externalId`, socket llega al inbox con keys legacy, BotSession por
   `channelId_externalUserId`. (No se pudo correr en la sesión: VPN del trabajo
   rompía la conexión del engine de Prisma — desconectar VPN para usar la DB local.)
3. Seguir por **1e** (inbox unificado: API `/api/inbox` + UI badge/filtro de canal +
   rename del contrato socket/DTO a `channelId`/`externalUserId`) y/o **1g** (rename
   de clases/módulo del bot `WapiBot*`→`Bot*`, `WapiConversationStatus`, etc.).
4. **Cabos sueltos de 1d (para 1e):** (a) **El contrato HTTP/socket mantiene keys
   legacy** `configId`/`phone`/`window24hAt` (mapeadas en la frontera de inbox/
   webhook/waiting-expirer/campaigns/live) → el frontend NO se tocó; 1e renombra el
   contrato. (b) `parseInbound` sigue **sin consumirse por el flujo vivo** (la
   persistencia del webhook usa el payload Meta directo); rewirearlo cuando se
   limpie. (c) `parseStatus` aún no existe. (d) Enum Prisma se llama **`ChannelType`**
   (no `ChannelKind`) por colisión con el legacy `ChannelKind {EMAIL,WAPI}` de
   CampaignLog. (e) Clases `WapiBot*Service` y enum `WapiConversationStatus` NO se
   renombraron (van en 1g).

**Verificación 0a:**
- ✅ Migración `20260603120000_extract_bot_entity` aplicada a la DB local + backfill
  verificado (2 bots creados, 2 configs linkeadas, nombres derivados OK).
- ✅ Specs bot + webhook: **255/255 verde**. Typecheck backend: limpio.
- ⚠️ Fallos NO relacionados (pre-existentes en main, confirmado por `git stash`):
  5 tests de email (`email/tracking/prepare-html`, `email/webhook/ses-webhook`) +
  `common/security/encryption.service.spec` (flaky bajo carga paralela, pasa aislado).

---

## Cómo retomar (lectura rápida para la próxima sesión)

1. `git checkout feat/multichannel-bot`
2. Leer la sección "Checklist" abajo: lo marcado `[x]` está hecho, seguir por el
   primer `[ ]`.
3. Si hay migración sin aplicar: `pnpm --filter @massivo/prisma exec prisma migrate deploy && prisma generate`.
4. Correr `pnpm typecheck` + specs del bot para confirmar verde antes de seguir.

---

## Checklist

### Sesión 1 — Docs + arranque
- [x] Diseño/arquitectura → `CHANNELS_BOT_DESIGN.md`
- [x] Plan ejecutable → `CHANNELS_BOT_PLAN.md`
- [x] Doc de avances → este archivo
- [x] Rama creada `feat/multichannel-bot`

### Sub-fase 0a — Backend: extraer la definición del bot ✅ COMPLETA
- [x] **0a.1** Schema: `model Bot` + `WapiConfig.botId` (+back-relations Org/Team; columnas `bot*` deprecadas, se mantienen)
- [x] **0a.2** Migración SQL `20260603120000_extract_bot_entity` con backfill idempotente (id `'bot_'||configId`)
- [x] **0a.3** Refactor `WapiBotService` → opera sobre `Bot` (helper `resolveBot` con lazy-create, snapshot igual) + spec actualizado
- [x] **0a.4** Wiring webhook: `tryAutoReplies` Y `handleButtonAction` (path BOT button-action) toman campos de bot de `config.bot` + spec
- [x] **0a.4b** Sandbox: `loadConfig` lee la relación `bot` y mapea a `CfgSnapshot` + spec
- [x] **0a.4c** `Bot` agregado a `TENANT_SCOPED_MODELS` (scoping org+team del `prisma.scoped.bot`)
- [x] **0a.5** Verificado: me/inbox/controller intactos · `prisma generate` · typecheck limpio · 255/255 specs

### Sub-fase 0b — Bot como entidad de primera clase
**Backend COMPLETO** (commit `7a91895`):
- [x] API `/api/bots` (CRUD) + draft/publish/discard/sandbox bot-centric (`BotsController`)
- [x] `WapiBotService`: métodos por botId (list/create/get/update/saveDraft/publish/discard/delete) con helpers `apply*` compartidos
- [x] Conectar/desconectar canal: `POST|DELETE /api/bots/:botId/channels/:configId` (`setConfigBot`)
- [x] `sandbox.stepByBot` (sandbox por botId)
- [x] Compat: `/api/wapi/configs/:id/bot/*` sigue andando (delega a `apply*`)
- [x] Upload de media: queda config-scoped (mediaId de Meta por-WABA)
- [x] Tests `bots.service.spec` 10/10; suite wapi 402/402; typecheck limpio

**Frontend — COMPLETO** (UI bot-centric, ver git log de la rama):
- [x] `bots/types.ts`: `BotSnapshot`, `BotListItem`, `ConnectedChannel`
- [x] `bots/api.ts`: `botsApi` (bot-centric); `botApi` (config-scoped) intacto
- [x] **`WapiBotsPage.tsx`** migrado a bot-centric:
  - estado `bots/selectedBotId/snapshot:BotSnapshot`; effects → `botsApi.list/get`
  - handlers saveDraft/publish/discardDraft → `botsApi.*(api, selectedBotId)`
  - toolbar: dropdown de **bots** + "Crear bot" (`window.prompt` → `botsApi.create`) + borrar (`botsApi.remove`); chip con nº de canales conectados
  - `materializeTopics(snap: BotSnapshot)`
  - `NodeEditorDrawer`: `configId={mediaConfigId}` (= primer canal conectado; media sigue config-scoped)
  - `SandboxDrawer`: migrado a `botsApi.sandboxStep(api, botId)`
- [x] **Página Números** (`WapiConfigsPage.tsx`): columna "Bot" con `<Select>` por canal (conectar/desconectar vía `botsApi.connectChannel/disconnectChannel`); `WapiConfigListItem.botId` agregado (back + front)

**Verificación:**
- [x] Backend bootea + rutas `/api/bots` mapeadas + recompila limpio en watch + typecheck + wapi 402/402
- [x] Frontend typecheck limpio (turbo: 7/7 paquetes relevantes; sólo falla `@massivo/docs` por `tsconfig --ignoreDeprecations`, pre-existente y ajeno)
- [ ] **Smoke-test runtime autenticado PENDIENTE** (Clerk gate, no headless): login → crear bot → editar/publicar → conectar a un número → confirmar respuesta. `vite build` aislado falla por errores pre-existentes en `inbox/api.ts` y `DashboardHome.tsx` (no de este trabajo).

**Notas / mejoras futuras:**
- Create-bot usa `window.prompt` — reemplazar por un dialog MUI.
- (opcional) Mover tipos del bot a `packages/shared-types`.
- `handleButtonAction` path `action:'BOT'`→`startTopic` sigue sin test propio (heredado de 0a).

### Sub-fase 0c — Cleanup
- [ ] Migración drop de columnas `bot*` en `WapiConfig`

### Fase 1 — Abstracción de canal + unificación + inbox omnicanal
(sub-fases detalladas en CHANNELS_BOT_PLAN.md → FASE 1)
- [x] **1a** Capa de abstracción (módulo `channels/`): tipos `ChannelAdapter`/`Inbound`/`Outbound`/`Capabilities` + `WhatsAppAdapter` (envuelve `WapiSenderService`, capabilities) + `ChannelAdapterRegistry` + registrado en `app.module`. Aditivo, adapter spec 6/6, typecheck limpio.
- [x] **1b** Rewire engine `deliverNode` + inbox `sendText/sendMedia` al `WhatsAppAdapter`; guard de ventana 24h → `capabilities.freeformWindow`. `WhatsAppAdapter` movido a `WapiModule` (sin ciclo con `ChannelsModule`). Specs engine/inbox con mock-adapter que reenvía al sender → 408/408 wapi+channels, typecheck limpio.
- [x] **1c** `parseInbound` + webhook genérico `/api/channels/:kind/:slug` (alcance "liviana"; ver bitácora sesión 2). `parseInbound(payload)→InboundMessage[]` en `WhatsAppAdapter` (parser puro, aditivo — lo consume 1d). Lógica del webhook extraída a `WhatsAppWebhookHandler` (compartida por `/api/webhooks/wapi/:slug` legacy y `/api/channels/whatsapp/:slug` genérica). **La persistencia (`WapiWebhookService.process`) NO se tocó.** 424/424 wapi+channels, typecheck limpio. **Sin commitear (working tree).**
- [x] **1d** Modelo unificado `Channel/Conversation/Message/BotSession` (rename big-bang, greenfield). Migración `20260605120000_rename_channel_entities` aplicada + **cero drift**. Enum `ChannelType` (no `ChannelKind` por colisión legacy). Contrato HTTP/socket mantiene keys legacy (`configId`/`phone`/`window24hAt`/`metaMessageId`/`configRel`) mapeadas en la frontera → frontend intacto. Backend+frontend tsc limpio; specs verdes (full backend salvo 5 email pre-existentes). **Sin commitear; smoke runtime pendiente.**
- [ ] **1e** Inbox unificado (API `/api/inbox` + UI con badge/filtro de canal)
- [ ] **1f** Cleanup de tablas/columnas `Wapi*` legacy
- [ ] **1g** Relocar/renombrar el módulo del bot (sacar de `wapi/`, quitar prefijo `Wapi`) — propuesta del usuario; recomendado hacerlo justo después de 1d (ver PLAN §1g)

### Fases siguientes
- [ ] Fase 2 — Messenger · Fase 3 — Instagram · Fase 4 — Webchat

---

## Bitácora (qué se hizo y por qué)

### Sesión 3 — 2026-06-05 (Fase 1d)
- **Implementada toda la Fase 1d** (rename big-bang `WapiConfig→Channel`,
  `WapiConversation→Conversation`, `WapiMessage→Message`, `WapiBotSession→BotSession`;
  greenfield). Decisiones del dueño: rename completo (no coexistencia) + greenfield.
- **Schema** (`schema.prisma`): 4 modelos renombrados + enum `ChannelType`
  (WHATSAPP/INSTAGRAM/MESSENGER/WEBCHAT — se llama `ChannelType` y no `ChannelKind`
  porque ya existía `enum ChannelKind {EMAIL,WAPI}` legacy en CampaignLog). Campos:
  `configId→channelId`, `phone→externalUserId`, `window24hAt→freeformWindowAt`,
  `metaMessageId→externalId`; nuevos `Channel.kind`, `Conversation.channelKind`
  (denorm), `Message.channelId` (denorm, para unique `[channelId, externalId]`).
  Back-relations Organization/Team/Bot/WapiCampaign actualizadas.
- **Migración** `20260605120000_rename_channel_entities`: SQL hand-written idempotente
  (RENAME, preserva datos) — enum → rename tablas → rename columnas → columnas nuevas
  → backfill denorm → SET NOT NULL → rename PK/FK/índices → unique compuesto Message.
  Aplicada con `migrate deploy`; `migrate diff --exit-code` = **No difference detected**.
  (Ojo: el engine de Prisma no conecta a la DB local detrás de la VPN del trabajo;
  desconectar VPN.)
- **Repoint de código** (~17 archivos no-spec): accesores `prisma.scoped.wapiX→.x`
  (sed), `tenant-models.ts` (4 entradas), casts `prismaSession`/waiting-expirer raw,
  bot-engine (sesión por `channelId_externalUserId` + Message `channelId`/`externalId`),
  webhook (Conversation `channelKind:'WHATSAPP'` + Message `channelId`), inbox,
  contact-timeline, worker/campañas/live (relación `configRel→channel`).
- **Decisión clave**: el **contrato HTTP/socket NO cambió** — se mapean las keys
  legacy en la frontera (DTOs, emits, `toCampaignApiShape`, BotListItem). Por eso el
  frontend no se tocó y su tsc sigue limpio. El rename del contrato es 1e.
- **Specs** (~18 suites): sed de accesores/keys + fixes de mock-data y call-arg asserts
  (manteniendo keys legacy en asserts de output). Resultado: full backend **782/787**
  (los 5 rojos son email `prepare-html`/`ses-webhook`, pre-existentes y ajenos).
- **Bug encontrado en runtime por el usuario** (bots page): `Bot.findMany` seguía
  pidiendo la relación `configs` (renombrada a `channels`) en un `select as never`
  (invisible a tsc). Corregido en `listBots` + spec. Lección: barrer relaciones
  renombradas en selects/includes casteados, no confiar sólo en tsc.

### Sesión 2 — 2026-06-05
- **Implementada la Sub-fase 1c (alcance "liviana", elegido por el usuario).** La
  alternativa "completa" (rewire de `process` a `InboundMessage[]`) se descartó por
  solaparse con 1d y tocar el service más testeado del webhook.
- **Decisión de diseño:** como el modelo `Channel` no existe hasta 1d y la
  persistencia está moldeada al payload de Meta, 1c se acota a (a) el parser puro y
  (b) el routing genérico, sin tocar persistencia. `parseInbound` queda **aditivo**
  (mismo patrón que los tipos de 1a): listo para que 1d lo consuma.
- **Archivos tocados:**
  - `apps/backend/src/modules/channels/adapter.types.ts` — `parseInbound?` en `ChannelAdapter`
  - `apps/backend/src/modules/channels/adapters/whatsapp.adapter.ts` (+ `.spec.ts`) — `parseInbound` + helpers (`toInbound`/`mapType`/`mapMedia`)
  - `apps/backend/src/modules/wapi/webhook/whatsapp-webhook.handler.ts` (+ `.spec.ts`) — **NUEVO**: lógica verify/receive + HMAC + slug-cache extraída del controller
  - `apps/backend/src/modules/wapi/webhook/wapi-webhook.controller.ts` (+ `.spec.ts`) — adelgazado a alias delgado que delega en el handler
  - `apps/backend/src/modules/channels/channels-webhook.controller.ts` (+ `.spec.ts`) — **NUEVO**: webhook genérico `/api/channels/:kind/:slug`, dispatch por kind
  - `apps/backend/src/modules/wapi/wapi.module.ts` — provee+exporta `WhatsAppWebhookHandler`
  - `apps/backend/src/modules/channels/channels.module.ts` — registra `ChannelsWebhookController`
- **Verificación:** typecheck limpio · `npx jest src/modules/wapi src/modules/channels` → **424/424** (sumó 19 tests de 1c). El único rojo del repo sigue siendo `email/webhook/ses-webhook` (pre-existente, ajeno).
- **Pendiente:** boot autenticado / smoke runtime del endpoint nuevo (Clerk gate, no headless) — el endpoint es público pero conviene probarlo end-to-end cuando se levante el server.

### Sesión 1 — 2026-06-03
- Exploración completa de arquitectura de canales/bot/inbox (backend + frontend).
- Decisión: extraer `Bot` manteniendo firma `CfgForEngine` → motor y ~9.000 líneas
  de specs sin cambios; frontend intacto en 0a.
- Escritos los 3 docs. Creada rama.
- **Implementada y verificada toda la Sub-fase 0a.** Archivos tocados:
  - `packages/prisma/prisma/schema.prisma` — `model Bot` + `WapiConfig.botId` + back-relations
  - `packages/prisma/prisma/migrations/20260603120000_extract_bot_entity/migration.sql` — DDL + backfill
  - `apps/backend/src/common/prisma/tenant-models.ts` — `Bot` en `TENANT_SCOPED_MODELS`
  - `apps/backend/src/modules/wapi/bot/wapi-bot.service.ts` (+ `.spec.ts`)
  - `apps/backend/src/modules/wapi/webhook/wapi-webhook.service.ts` (+ `.spec.ts`)
  - `apps/backend/src/modules/wapi/bot/wapi-bot-sandbox.service.ts` (+ `.spec.ts`)
- **Aún sin commitear** (working tree). El usuario pidió no tocar main y probar local.
- Nota: la migración YA está aplicada a la DB local (`prisma migrate deploy` corrió
  también las 4 migraciones de email que estaban pendientes).

### Hueco de cobertura conocido (no bloqueante)
- El path `action: 'BOT'` → `botEngine.startTopic` en `handleButtonAction` no tiene
  test propio en el webhook spec (sólo `startTopic` mockeado). Se preservó la
  cobertura previa; vale agregar un test en 0b o cuando se toque esa zona.

### Cómo arrancar 0b (próxima sesión)
1. API: crear `BotController`/`BotService` bot-centric (`/api/bots`, CRUD) +
   draft/publish/discard/sandbox por `botId`. Reusar la lógica de `WapiBotService`
   (ya opera sobre `Bot`); falta exponerla por `botId` en vez de `configId`.
2. Endpoint para setear/limpiar `WapiConfig.botId` (conectar bot ↔ número).
3. Frontend `apps/frontend/src/features/wapi/bots/`: `api.ts` → `/api/bots/...`;
   `WapiBotsPage` selecciona/crea Bot (hoy selecciona config); selector "Bot
   conectado" en la página de Números. Resolver upload de media sin config-scope
   (ver Riesgos en el PLAN).

---

## Touchpoints mapeados (referencia rápida)

**Backend — definición del bot vive hoy en `WapiConfig`:**
- `schema.prisma:629-704` (columnas `bot*` en `WapiConfig`) · `:960-988` (`WapiBotSession`)
- `wapi-bot.service.ts` — CRUD del bot (get/update/saveDraft/publish/discardDraft)
- `wapi-webhook.service.ts:466-536` — arma `CfgForEngine` y llama `botEngine.handle`
- `wapi-bot-engine.service.ts:52-65` — `CfgForEngine` (mezcla canal + bot)
- `wapi-bot-sandbox.service.ts` — verificar fuente de datos
- **No tocar:** `me.service.ts` (lee `Organization.botEnabled`), `inbox`
  (`botSuspended` en conversación, `botWaitingTtlMin` en config)

**Frontend (Phase 0b):**
- `apps/frontend/src/features/wapi/bots/` — `WapiBotsPage.tsx`, `api.ts` (endpoints
  `/api/wapi/configs/:id/bot/*`), `types.ts` (tipos espejados), `SandboxDrawer.tsx`,
  `NodeEditorDrawer.tsx`
- Ruta: `App.tsx` → `/dashboard/wapi/bots` (sin config en URL; dropdown interno)
