# Avances: multi-canal + bot único + inbox unificado

> Log vivo para continuar entre sesiones. **Plan:** [CHANNELS_BOT_PLAN.md](./CHANNELS_BOT_PLAN.md).
> **Diseño:** [CHANNELS_BOT_DESIGN.md](./CHANNELS_BOT_DESIGN.md).
> **Rama:** `feat/multichannel-bot`.

---

## Estado actual

**Fase en curso:** Fase 0 → **0a COMPLETA** + **0b backend COMPLETO** + **0b frontend
base lista**. Próximo: migración de UI de 0b (`WapiBotsPage` → bot-centric +
selector "Bot conectado" en Números) — requiere verificación runtime.

**Última actualización:** sesión 1 (2026-06-03).

**Commits en `feat/multichannel-bot`:**
- `8f13e21` — Phase 0a: entidad `Bot` + migración/backfill + wiring backend
- `7a91895` — Phase 0b backend: API `/api/bots` bot-centric + connect/disconnect

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

**Frontend — base lista (no rompe nada), UI pendiente:**
- [x] `apps/frontend/.../bots/types.ts`: `BotSnapshot`, `BotListItem`, `ConnectedChannel`
- [x] `apps/frontend/.../bots/api.ts`: `botsApi` (bot-centric) agregado; `botApi` (config-scoped) intacto
- [ ] **`WapiBotsPage.tsx`**: migrar de config-centric a bot-centric:
  - estado `configs/selectedConfigId/snapshot:BotConfigSnapshot` → `bots/selectedBotId/snapshot:BotSnapshot`
  - effect 1 (línea ~217): `botsApi.list(api)` en vez de `GET /api/wapi/configs`
  - effect 2 (línea ~232): `botsApi.get(api, selectedBotId)`
  - handlers `handleSaveDraft/handlePublish/handleDiscardDraft` (líneas ~790/838/878): `botsApi.*(api, selectedBotId, …)`
  - toolbar dropdown (línea ~945): listar **bots** + botón "Crear bot" (`botsApi.create`) + borrar (`botsApi.remove`)
  - `materializeTopics(snap)`: acepta `BotSnapshot` (mismos campos `bot*`) — revisar firma
  - `NodeEditorDrawer` (prop `configId`): pasar `snapshot.connectedChannels[0]?.configId` para upload de media; si no hay canal conectado, deshabilitar media con hint
  - `SandboxDrawer`: migrar a `botsApi.sandboxStep(api, botId, …)` (hoy usa `botApi.sandboxStep(configId)`)
- [ ] **Página Números (`features/wapi/configs/`)**: selector "Bot conectado" por config (`botsApi.connectChannel/disconnectChannel`)
- [ ] **Verificación runtime** (pendiente, requiere dev server): crear bot → editar → conectar a número → confirmar que responde
- [ ] (opcional) Mover tipos del bot a `packages/shared-types`

### Sub-fase 0c — Cleanup
- [ ] Migración drop de columnas `bot*` en `WapiConfig`

### Fases siguientes
- [ ] Fase 1 — Unificar Channel/Conversation/Message/BotSession + inbox omnicanal
- [ ] Fase 2 — Messenger · Fase 3 — Instagram · Fase 4 — Webchat

---

## Bitácora (qué se hizo y por qué)

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
