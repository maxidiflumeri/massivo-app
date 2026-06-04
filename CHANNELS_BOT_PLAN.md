# Plan ejecutable: multi-canal + bot único + inbox unificado

> **Diseño / arquitectura:** ver [CHANNELS_BOT_DESIGN.md](./CHANNELS_BOT_DESIGN.md).
> Este documento es el **plan de ejecución** (qué tocar, en qué orden, cómo
> probar). El log de avances vive en [CHANNELS_BOT_PROGRESS.md](./CHANNELS_BOT_PROGRESS.md).
>
> **Rama de trabajo:** `feat/multichannel-bot` (NO tocar `main`).

---

## 0. Convenciones de trabajo

- **Rama:** todo el código va a `feat/multichannel-bot`. No mergear a `main` hasta
  validar local.
- **Migraciones:** son **SQL hand-written + idempotente** (convención del repo, ver
  `packages/prisma/prisma/migrations/20260514100000_contacts_unification/`). Se
  generan con `prisma migrate diff` para el schema y se completa el backfill a mano.
  Carpeta `migrations/<timestamp>_<nombre>/migration.sql`.
- **Cómo aplicar migración local:** `pnpm --filter @massivo/prisma exec prisma migrate deploy`
  (aplica las pendientes) + `prisma generate`. La DB de dev corre en el docker
  compartido `~/infra` (db `massivo` en `dev-postgres`).
- **Cómo probar:** `pnpm test` (turbo) o `pnpm --filter backend test`. La red de
  seguridad del refactor son los specs del bot (`apps/backend/src/modules/wapi/bot/*.spec.ts`,
  ~9.000 líneas). **Criterio de "hecho" de cada paso: typecheck + specs verdes.**
- **Typecheck:** `pnpm typecheck`.

---

## 1. Principio que hace todo esto de bajo riesgo

El motor del bot recibe un objeto `CfgForEngine`
(`apps/backend/src/modules/wapi/bot/wapi-bot-engine.service.ts:52-65`) que **mezcla
campos de canal** (`phoneNumberId`, `accessTokenEnc`, `isTestMode`) **con campos de
bot** (`botEnabled`, `botFlow`, `botSessionTtlMin`, `botTopics`, `botRouter`,
`botVariables`). Lo arma el webhook (`wapi-webhook.service.ts:466-536`).

**Estrategia:** mantener la firma `CfgForEngine` igual y cambiar SOLO **de dónde
salen los campos de bot** (de `config.bot` en vez de `config`). Así:
- El motor y sus specs **no cambian** (siguen recibiendo el mismo shape).
- Los endpoints siguen `/wapi/configs/:id/bot/*` → **el frontend no cambia en 0a**.
- La migración es incremental y reversible (las columnas viejas se mantienen
  deprecadas hasta el cleanup).

---

## FASE 0 — Extraer `Bot` de `WapiConfig`

> Objetivo: el bot pasa a ser entidad propia. Entregable de valor inmediato: **un
> mismo `Bot` se puede conectar a varios números de WhatsApp** (1 `Bot` → N
> `WapiConfig`). Se hace en dos sub-fases para acotar riesgo por sesión.

### Sub-fase 0a — Backend: extraer la definición del bot (ESTA SESIÓN)

Comportamiento idéntico al actual. Frontend intacto. Endpoints intactos.

#### Paso 0a.1 — Schema Prisma: modelo `Bot` + `WapiConfig.botId`
Archivo: `packages/prisma/prisma/schema.prisma`

- Crear `model Bot` con los campos de **definición** del bot (copia de las columnas
  `bot*` de `WapiConfig`):
  - `enabled` (← `botEnabled`), `sessionTtlMin` (← `botSessionTtlMin`)
  - `flow` (← `botFlow`), `topics` (← `botTopics`), `router` (← `botRouter`),
    `variables` (← `botVariables`)
  - `topicsDraft`, `routerDraft`, `variablesDraft`, `draftUpdatedAt`, `publishedAt`
  - `organizationId`, `teamId`, `name`, timestamps + relaciones.
- Agregar a `WapiConfig`: `botId String?` + `bot Bot? @relation(...)` +
  back-relation `configs WapiConfig[]` en `Bot`.
- **Mantener** las columnas `bot*` en `WapiConfig` por ahora (deprecadas; se dropean
  en 0c/cleanup). `botWaitingTtlMin` **se queda en `WapiConfig`** (es TTL de "hold"
  del inbox, no definición de bot — ver Decisiones).

#### Paso 0a.2 — Migración SQL con backfill
Carpeta: `packages/prisma/prisma/migrations/<ts>_extract_bot_entity/migration.sql`

- `CREATE TABLE "Bot"` + índices + FK org/team.
- `ALTER TABLE "WapiConfig" ADD COLUMN "botId" TEXT` + FK (`ON DELETE SET NULL`).
- **Backfill idempotente:** por cada `WapiConfig` con datos de bot
  (`botFlow IS NOT NULL OR botTopics IS NOT NULL OR botEnabled = true OR
  botTopicsDraft IS NOT NULL OR ...`) y `botId IS NULL`:
  - `INSERT INTO "Bot"` copiando las columnas + `organizationId`/`teamId` del config,
    `name = COALESCE(config.name, 'Bot ' || config.phoneNumberId)`.
  - `UPDATE "WapiConfig" SET botId = <nuevo bot> WHERE id = <config>`.
  - 1 Bot por config-con-bot (preserva exactamente el comportamiento actual). El
    "compartir un bot entre configs" es capacidad nueva que se usa después por UI.

#### Paso 0a.3 — Refactor `WapiBotService` → opera sobre `Bot`
Archivo: `apps/backend/src/modules/wapi/bot/wapi-bot.service.ts`

- Helper privado `resolveBot(configId, { create })`: lee `config.botId`; si existe
  carga el `Bot`; si no y `create=true`, crea un `Bot` (org/team del config) y setea
  `config.botId` (en transacción); devuelve el Bot o null.
- `get(configId)`: resuelve bot (sin crear). Si no hay → snapshot vacío (mismo shape
  `BotConfigSnapshot`, todo null/defaults). Si hay → mapear campos del Bot.
- `update` / `saveDraft`: `resolveBot(create=true)`, escribir en `Bot`.
- `publish` / `discardDraft`: `resolveBot(create=false)`; si no hay bot → comportarse
  como "nada para publicar/descartar".
- `uploadFlowMedia`: **sin cambios** (usa `config.isTestMode`, es media/canal).
- **El shape de retorno `BotConfigSnapshot` NO cambia** (sigue con `configId`) → API
  y frontend intactos.

#### Paso 0a.4 — Wiring del webhook al `Bot`
Archivo: `apps/backend/src/modules/wapi/webhook/wapi-webhook.service.ts:466-536`

- En el `select` del config, reemplazar las columnas `bot*` por
  `bot: { select: { enabled, sessionTtlMin, flow, topics, router, variables } }`.
- Al armar el `CfgForEngine` para `botEngine.handle(...)`, tomar los campos de bot
  de `cfg.bot` (con guards si `cfg.bot` es null → bot off).
- El gate `cfg.botEnabled && (cfg.botTopics || cfg.botFlow)` pasa a
  `cfg.bot?.enabled && (cfg.bot.topics || cfg.bot.flow)`.

#### Paso 0a.5 — Verificación
- `wapi-bot-sandbox.service.ts`: confirmar si lee columnas `bot*` del config; si sí,
  apuntarlo al Bot (probablemente ya usa `WapiBotService` o un snapshot — verificar).
- `me.service.ts`: **sin cambios** (usa `Organization.botEnabled`).
- `inbox`: **sin cambios** (`botSuspended` en conversación; `botWaitingTtlMin` en config).
- `pnpm typecheck` + specs del bot verdes.
- Actualizar `CHANNELS_BOT_PROGRESS.md`.

### Sub-fase 0b — Bot como entidad de primera clase (PRÓXIMA(S) SESIÓN(ES))

Entrega la UX "diseño un bot y elijo a qué números conectarlo".

- **API nueva** `/api/bots` (CRUD de Bot) + `/api/bots/:botId/{draft,publish,discard,sandbox}`.
  Mantener `/wapi/configs/:id/bot/*` como alias deprecado o migrar el front de una.
- **WapiConfig**: endpoint para setear `botId` (conectar/desconectar bot a número).
- **Frontend** (`apps/frontend/src/features/wapi/bots/`):
  - `WapiBotsPage` deja de seleccionar config → selecciona/crea **Bot**.
  - `api.ts`: endpoints `/api/bots/...`.
  - En la página de Números (config): selector "Bot conectado".
  - Sandbox/NodeEditor reciben `botId` en vez de `configId` (el upload de media de
    nodos necesita un config con token Meta → resolver vía un config conectado o
    permitir elegir; ver Decisiones/Riesgos).
  - Mover tipos del bot a `packages/shared-types` (hoy espejados en
    `apps/frontend/.../bots/types.ts`).

### Sub-fase 0c — Cleanup (cuando 0a+0b estén estables)

- Migración que **dropea** las columnas `bot*` de `WapiConfig`
  (`botEnabled`, `botFlow`, `botSessionTtlMin`, `botTopics`, `botRouter`,
  `botVariables`, `bot*Draft`, `botDraftUpdatedAt`, `botPublishedAt`).
- Mantener `botWaitingTtlMin` (renombrar a `waitingTtlMin` opcional).

---

## FASE 1 — Unificar canal + conversación (resumen; detalle en DESIGN §2-§6)

- Crear `Channel`, `Conversation`, `Message`, `BotSession` unificados.
- Migrar datos WhatsApp (`WapiConfig`→`Channel(WHATSAPP)`, `WapiConversation`→`Conversation`, etc.).
- `BotSession` pasa de `(configId, phone)` → `(channelId, externalUserId)` + `botId` denormalizado.
- Introducir `ChannelAdapter` (registry) + `WhatsAppAdapter` (re-empaque del sender/webhook actual).
- El motor (`deliverNode`) envía vía `adapter.send`; el guard de 24h pasa a `capabilities.freeformWindow`.
- Inbox unificado: API `/api/inbox/conversations` + UI con badge/filtro de canal.

## FASE 2 — Messenger · FASE 3 — Instagram · FASE 4 — Webchat

Ver DESIGN §3.2, §7 y §10. Messenger primero (primo de WhatsApp, misma Graph API).
Cuello de botella: App Review de Meta — arrancar trámite temprano.

---

## Registro de decisiones (Phase 0)

1. **`botWaitingTtlMin` se queda en `WapiConfig`** (Phase 0). Es el TTL del estado
   WAITING ("hold" del inbox), comportamiento de conversación, no definición de bot.
   Lo usa `wapi-inbox.service.ts:807-809`. Revisitar en Fase 1 (¿va a Channel?).
2. **Sesiones siguen llaveadas `(configId, phone)`** en Phase 0. La unificación de
   `BotSession` es Fase 1. El motor sigue buscando por `(cfg.id, phone)`.
3. **Endpoints siguen config-scoped en 0a** (`/wapi/configs/:id/bot/*`). Los
   bot-centric (`/api/bots/...`) son 0b. Así el frontend no se toca en 0a.
4. **Columnas `bot*` se mantienen deprecadas** durante 0a/0b; se dropean en 0c. Dual
   source temporal, pero TODAS las lecturas backend pasan por `Bot` → las columnas
   viejas quedan como dato muerto hasta el drop.
5. **Backfill = 1 Bot por config-con-bot** (1:1 inicial). "Compartir un bot entre
   configs" es capacidad nueva vía UI (0b), no cambia datos existentes.
6. **`me.service.ts` no se toca**: lee `Organization.botEnabled` (gate per-org),
   distinto de `WapiConfig.botEnabled` (on/off del bot de ese número).

## Riesgos / watch-outs (Phase 0)

- **Upload de media de nodos** (`uploadFlowMedia`) necesita un config con token Meta
  (sube a Graph). Al volverse el bot independiente del canal (0b), el editor debe
  resolver con QUÉ config subir (un config WhatsApp conectado al bot, o test-mode).
  En 0a no es problema (sigue config-scoped). Resolver el diseño en 0b.
- **Prisma client cacheado**: el código ya usa `as never`/casts porque el client a
  veces no está regenerado en dev. Tras tocar schema: `prisma generate` + reiniciar
  dev server.
- **Idempotencia del backfill**: el `INSERT ... WHERE botId IS NULL` debe poder
  re-correrse sin duplicar Bots.
