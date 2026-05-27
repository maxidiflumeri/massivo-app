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

### 4.N.3 + 4.P — Nodo HTTP del bot, motor de expresiones JSONata y nodo FOREACH ✅

Cierra el módulo "consultas externas" del bot designer. El flow ahora puede consultar APIs externas (con SSRF guard + rate limit + audit), navegar respuestas complejas con expresiones JSONata, e iterar arrays con un nodo FOREACH dedicado. El sandbox tiene un toggle Mock/Real para que el operador pueda probar primero con respuestas hardcoded en el nodo y después activar requests reales sin tener que cablear una WapiConfig de test.

#### Added

##### `apps/backend/src/modules/wapi/bot/expression-engine.ts` (+ spec)
Motor de expresiones JSONata 2.x sandbox (sin eval, sin acceso a globals, ~100 funciones built-in). Tres funciones públicas:
- `compile(expr)` — devuelve `Expression` cacheada (cap 500, vacía al llenarse).
- `evaluateExpression(expr, data)` — async, devuelve el valor crudo (boolean/array/object/etc).
- `interpolateExpressionTokens(template, data)` — reemplaza `{{= expr }}` con representación string, evalúa todos los tokens en paralelo.

Sintaxis opt-in: `{{= expr }}` activa el evaluator; `{{var}}` plano sigue funcionando como antes (retro-compat total con flows ya guardados). Objetos/arrays se serializan a JSON al stringificar; expresiones que tiran en runtime → string vacío (alineado con el comportamiento de `{{var}}` ausente). 24 specs.

##### `apps/backend/src/modules/wapi/bot/wapi-bot-http-ssrf.ts` (+ spec)
SSRF guard puro: blocklist IPv4 (loopback, 10/8, 100.64/10 CGNAT, 127/8, 169.254/16 IMDS, 172.16/12, 192.168/16, 192.0/24, 198.18/15, 224/4 multicast, 240/4 reserved, broadcast) + IPv6 (::1, fc00::/7 ULA, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 doc, 64:ff9b::/96 NAT64, IPv4-mapped ::ffff:* delegado al validator IPv4). `resolveAndValidate(hostname, allowPrivate)` hace DNS lookup propio, valida la IP resuelta y la devuelve; el caller (executor) la usa como `connect.lookup` del undici Agent → **protección anti DNS rebinding** (el Agent no re-resuelve, usa la IP ya validada). 48 specs.

##### `apps/backend/src/modules/wapi/bot/wapi-bot-http-rate-limiter.service.ts`
Token bucket por org en memoria. Lazy refill proporcional al tiempo transcurrido. Capacity configurable vía env `WAPI_BOT_HTTP_PER_ORG_PER_MINUTE` (default 60). Orgs distintas tienen buckets separados.

##### `apps/backend/src/modules/wapi/bot/wapi-bot-http-executor.service.ts` (+ spec)
Servicio Nest que ejecuta nodos HTTP. Dos modos:
- `mock`: devuelve `node.mockResponse` o `{ ok:false, error:'mock-undefined' }`. No toca la red, no toca el rate limiter, no audita.
- `real`: rate-limit per-org → interpolación url/headers/body con `interpolateAsync` (soporta `{{var}}` + `{{= expr }}` JSONata; el body se interpola por leaf string preservando estructura JSON sintácticamente) → URL parse (scheme http/https, http bloqueado en `NODE_ENV=production`) → `resolveAndValidate` (anti-rebinding) → undici fetch con dispatcher custom (la IP resuelta se pasa al `connect.lookup` del Agent) → timeout AbortController clamp [100, 10_000] ms → lectura streaming con cap 1 MB → `redirect: 'manual'` (302 devuelve `redirect-not-followed`) → audit log `wapi.bot.http.executed` con `urlHost`/`method`/`status`/`ok`/`mode`/`durationMs` (NUNCA url completa con querystring ni headers sensibles).

Códigos de error sintéticos (todos como response, nunca exception al caller): `mock-undefined`, `feature-disabled`, `rate-limited`, `interpolation-failed`, `invalid-url`, `invalid-scheme`, `http-not-allowed-in-prod`, `ssrf-blocked`, `redirect-not-followed`, `response-too-large`, `timeout`, `network-error`.

Tests con `http.createServer` real en localhost (no nock): GET/POST con response JSON/text/binario, interpolación url/headers/body JSON-safe (incluso con `"` en valores), todos los errores sintéticos, audit log solo en modo real. 19 specs.

##### Tipo `BotHttpNode` y `BotForeachNode` en `wapi-bot.types.ts` + frontend `types.ts`
- `BotHttpNode`: `kind: 'HTTP'`, `method`, `url`, `headers?`, `body?` (objeto JSON, no string), `timeoutMs?` (clamp 100..10000), `saveAs`, `mockResponse?` (`{status:100..599, body}`), `nextNodeId?`/`errorNodeId?`, `gotoTopic?`/`errorGotoTopic?`. La response se guarda en `session.data[saveAs]` como `{ ok, status, body, error?, durationMs }` + flatten `${saveAs}_ok` / `${saveAs}_status` / `${saveAs}_error` (compat con CONDITION que sólo lee tipos primitivos).
- `BotForeachNode`: `kind: 'FOREACH'`, `items` (expresión JSONata), `itemVar`, `indexVar?`, `bodyNodeId`, `doneNodeId?`/`gotoTopic?`.

Validators backend + cliente espejado en `validateClient.ts` (cliente importa `jsonata` para validar sintaxis de `items` antes de roundtrip al server). Cross-topic check para `gotoTopic`/`errorGotoTopic`. Auto-import en `inferImplicitVariables` de `saveAs` (HTTP) y `itemVar`/`indexVar` (FOREACH).

##### `applyHttpResult` y `applyForeach` en `bot-flow-runtime.ts` (+ spec)
Helpers puros compartidos por engine y sandbox. `applyForeach` administra un stack `data._loops` con frames `{ foreachNodeId, index, items, itemVar, indexVar, prevItem, prevIndex }`: primera entrada evalúa items con JSONata, asigna primer item, pushea frame; re-entradas avanzan índice; al terminar pop frame y restaura valores previos LIFO. Caps `WAPI_BOT_FOREACH_MAX_ITERATIONS` (default 100) y `WAPI_BOT_FOREACH_MAX_NESTED` (default 3). `nextLoopReturnNode(data)` devuelve el `foreachNodeId` topmost del stack — el engine lo usa para "autoreturn implícito": cuando un sub-flow del FOREACH cae a un terminal sin nextNodeId, el chain salta de vuelta al FOREACH para la siguiente iteración sin que el usuario tenga que cablear la edge de retorno. 17 specs.

##### Constantes `BOT_MAX_HTTP_PER_CHAIN=3` y `BOT_MAX_AUTO_CHAIN` subido de 8 → 32
El cap general crece porque FOREACH con 10 items y body de 1 nodo ya consume 21 steps. `BOT_MAX_HTTP_PER_CHAIN` es defensa extra contra runaway (webhook de Meta corta a ~20s; 3 HTTPs × 5s = 15s + I/O DB ya está al borde).

##### UI — `apps/frontend/src/features/wapi/bots/`
- `nodeViews.tsx` — `HttpNodeView` (header `info.dark` + `HttpIcon`, chips method/saveAs/mock-ready, 2 handles source `next`/`error`) + `ForeachNodeView` (header `grey.700` + `LoopIcon` con borde dashed, chip `items` + `item`/`idx`, 2 handles `body`/`done`).
- `NodeEditorDrawer.tsx` — `HttpEditor` (Select method + URL con `VarPickerTextField` y soporte `{{= expr }}` en helper, lista key/value de headers con warning visual en headers sensibles, body como `TextField multiline` con validación JSON on-blur, `timeoutMs` con clamp, switch toggleable "Respuesta simulada" con status + body JSON validados, `NextOrTopicSelect` para ramas ok/error). `ForeachEditor` (TextField `items` con helper de ejemplos JSONata, `itemVar`/`indexVar`, `NextNodeSelect` para `bodyNodeId`, `NextOrTopicSelect` para `doneNodeId`).
- `WapiBotsPage.tsx` — `defaultNodeFor` extendido, `nodeIdPrefix` (`http`/`loop`), botones toolbar HTTP/FOREACH con `HttpIcon`/`LoopIcon`, `rfNodes` mapea `HTTP→http` y `FOREACH→foreach`, `rfEdges` agrega aristas `next` (verde) + `error` (rojo) para HTTP y `body` (azul) + `done` (gris dashed) para FOREACH, `applyConnection` y `disconnectEdges` con casos nuevos, cleanup de refs en delete cubre `nextNodeId`/`errorNodeId`/`bodyNodeId`/`doneNodeId`, `rewriteGotoTopic` cubre `gotoTopic`/`errorGotoTopic`.
- `SandboxDrawer.tsx` — Select **HTTP: Mock | Real** al lado del Select Fuente; primera elección de Real abre confirm dialog destructive "ejecuta requests reales, pueden consumir cuota / mutar datos" y persiste aceptación en `localStorage` (`massivo:bot-sandbox:http-real-accepted`); chip warning persistente cuando Real está activo; cada step muestra una mini-bandeja con `recentHttpCalls` (chips color-coded ok/error con `mode · METHOD host → status · durationMs`). Default Mock en cada apertura por seguridad.
- `flowLayout.ts` — `nodeHeight` y edges para HTTP/FOREACH en dagre.
- `implicitVars.ts` — recolecta `saveAs` (HTTP) y `itemVar`/`indexVar` (FOREACH).

##### `SandboxStepDto.httpMode` + `SandboxStepResult.httpCalls`
Backend DTO valida `httpMode: 'mock'|'real'` (default mock). Response devuelve `httpCalls: SandboxHttpCallSummary[]` cuando hubo HTTPs en el step (vacío si no, omitido para mantener compat de payload chico). El controller `POST /api/wapi/configs/:id/bot/sandbox/step` pasa el flag al service.

#### Changed

##### `interpolate.ts` — async opt-in
`interpolate(template, vars)` se mantiene sync para retro-compat. Nueva `interpolateAsync(template, vars)` detecta `{{=` y delega a `interpolateExpressionTokens` antes de aplicar el `{{var}}` plano. Si el template no contiene `{{=`, fast-path sync sin promise overhead. 17 specs.

##### `WapiBotEngineService.runChain` y `WapiBotSandboxService.step` — ejecutan HTTP/FOREACH
Ambos casos nuevos:
- HTTP: contador `httpCallsInChain` con cap, llama `httpExecutor.execute(node, data, { mode: 'real'|httpMode, configId, nodeId, organizationId })`, aplica `applyHttpResult`, branch por `result.ok` → `nextNodeId|errorNodeId|gotoTopic|errorGotoTopic`. Engine real **siempre** usa `mode: 'real'` (NO se respeta `cfg.isTestMode` para HTTP — `isTestMode` significa "no toques Meta", no "no toques otras APIs"). Sandbox respeta `input.httpMode ?? 'mock'`.
- FOREACH: llama `applyForeach(node, currentId, data, evaluator)` con `evaluator` que es `evaluateExpression` (JSONata). Maneja `nextTopicId` (cross-topic al terminar) y `error` (`items-expr-failed`/`too-many-items`/`max-nested-loops`).

Loop autoreturn implícito: al final de cada iteración del `for`, si `currentId == null` o un nodo terminal sin next se topó, `nextLoopReturnNode(data)` se consulta y, si hay loop activo, `currentId` se setea al `foreachNodeId` topmost para continuar el ciclo.

##### `WapiBotEngineService.deliverNode` y `buildPersistedContent` — async + `interpolateAsync`
Todas las llamadas a `interpolate(node.text, data)` para MESSAGE/MENU/CAPTURE/MEDIA caption/HANDOFF pasaron a `await interpolateAsync(...)`. `buildPersistedContent` y `buildMediaContent` ahora son async. Permite usar `{{= cliente.body.nombre }}` en cualquier campo de texto del flow.

Mismo cambio en `WapiBotSandboxService.buildOutMessage` + `buildMediaOut` + `emit`.

##### `WapiBotEngineService` constructor — `+1 arg (httpExecutor)`
Nuevo parámetro `WapiBotHttpExecutor`. Mocks de specs actualizados (3 instancias en `wapi-bot-engine.service.spec.ts`).

##### `WapiBotSandboxService` constructor — `+1 arg (httpExecutor)`
Idem. 6 instancias actualizadas en `wapi-bot-sandbox.service.spec.ts` con `sed`.

##### `WapiModule` providers
Suma `WapiBotHttpExecutor` y `WapiBotHttpRateLimiterService`. `AuditLogModule` es `@Global` así que `AuditLogService` se inyecta directo sin import explícito.

#### Infra

- Backend: `+jsonata@^2.2.1`, `+undici@^7.x`.
- Frontend: `+jsonata@^2.2.1` (para validación de sintaxis en el editor).
- Env vars nuevas (todas opcionales con defaults):
  - `WAPI_BOT_HTTP_ENABLED=true` — gate del feature.
  - `WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS=false` — sólo dev local (permite apuntar a `localhost:4000` con mock-api).
  - `WAPI_BOT_HTTP_PER_ORG_PER_MINUTE=60` — token bucket capacity.
  - `WAPI_BOT_FOREACH_MAX_ITERATIONS=100` — cap items por loop.
  - `WAPI_BOT_FOREACH_MAX_NESTED=3` — profundidad máxima de loops anidados.

#### Tests

**709/709 backend tests verde** (61 suites). Nuevos: expression-engine.spec (24), wapi-bot-http-ssrf.spec (48), wapi-bot-http-executor.service.spec (19), bot-flow-runtime.spec (17), interpolate.spec (+8 para async). Frontend typecheck verde.

#### 4.P.3 — Nodo MEDIA_FROM_URL + SET_VAR async con JSONata

##### `apps/backend/src/modules/wapi/bot/wapi-bot-media-fetch.service.ts` — MEDIA_FROM_URL (4.P.3)
Nodo nuevo del bot que descarga un binario desde una URL externa (mismas defensas que HTTP node: SSRF guard + rate limit per-org + DNS anti-rebinding + timeout clamp [1000, 30000]ms), detecta MIME por magic bytes (PDF, JPEG, PNG, GIF, WEBP, MP4) con fallback al default del `mediaType` declarado, valida contra `ALLOWED_MIMES_BY_TYPE`, sube a Meta vía `WapiMediaService.uploadToMeta`, y delega el envío al pipeline normal de `deliverNode` construyendo un `BotMediaNode` sintético con el `mediaId` resultante. Audit log `wapi.bot.media-from-url.executed`.

Diseñado para APIs que devuelven binarios sin `Content-Type` correcto (caso real: infraccionesba.gba.gob.ar entrega PDFs sin header → el browser no los renderiza si se manda como link). Códigos de error: `feature-disabled`, `rate-limited`, `interpolation-failed`, `invalid-url`, `invalid-scheme`, `http-not-allowed-in-prod`, `ssrf-blocked`, `timeout`, `network-error`, `response-too-large`, `response-empty`, `redirect-not-followed`, `http-error`, `mime-not-allowed`, `upload-failed`, `mock-undefined`.

`deliverNode` acepta un `nodeOverride` opcional para reutilizar el flujo normal de envío + persistencia + emit. Sandbox respeta el toggle `httpMode` (mock devuelve `mockMediaId`).

##### `apps/backend/src/modules/wapi/bot/bot-flow-runtime.ts` — applySetVar async + JSONata
`applySetVar` pasa a ser async y usa `interpolateAsync`, soporta `{{= expr }}` JSONata además de `{{var}}` plano. Permite derivar variables desde paths anidados (ej. `value: '{{= lastHttp.body.totalRegistros }}'`) y usarlas en CONDITIONs de variable plana downstream. Sin esto, el seguimiento de respuestas HTTP requería un proxy mental.

#### Deferred a 4.P.1

- WHILE loop con cap.
- TRY/CATCH genérico.
- Auth secret manager (OAuth/API keys cifradas KMS) — hoy headers en plano.
- Retries HTTP con backoff jittered.
- Path nav implícito `{{var.path}}` sin `=`.
- Persistencia del bucket rate limit en Redis (hoy in-memory por proceso → multi-instance no comparte cuota).

---

### 5.D.1 — Carga de contactos vía campañas (strong key obligatorio + Contact upsert) ✅

Cambio de modelo de carga: el import standalone de Contacts se elimina; la única vía de carga es **vía creación de campaña** (Email o WAPI). Cada fila del CSV debe traer al menos uno de `externalId` o `dni`, lo que permite que el `Contact` unificado se cree o se mergee correctamente cross-canal y que `EmailContact`/`WapiContact` queden linkeados al mismo Contact (vía `contactId`).

#### Added

##### `apps/backend/src/modules/contacts/contact-upsert.service.ts`
Nuevo servicio reusable. Extrae la lógica de matching/merge que vivía en `ContactImportsService` a un único método público:

```ts
async upsert(input: ContactUpsertInput): Promise<{ contactId: string; outcome: 'created' | 'updated' | 'suggested' }>
```

Cascada interna:
1. `findByStrongKey` (externalId → dni → cuit) → `updateContact` con catch `P2002` (skip strong key conflicts) + `maybeSuggestWeakConflict` (si hay email/phone divergente, crea `ContactMergeSuggestion`).
2. Sino `findByWeakKey` (email → phoneE164) → si row no trae strong key, update directo; si trae strong key, intenta update y si choca P2002 cae a `createContact` + suggestion.
3. Sino `createContact`.

Reusa normalizers de `identity.ts` (`normalizeDni`, `normalizeCuit`, `normalizePhoneE164`, `normalizeEmail`, `normalizeExternalId`). Call inicial a `requireContext()` para enforce `TenantContext`.

`ContactsModule` exporta `ContactUpsertService` para inyección cross-module via `imports: [ContactsModule]`.

##### Strong-key fields en DTOs de campaña
- `apps/backend/src/modules/email/campaigns/email-campaigns.dto.ts` — `CampaignContactDto` gana `externalId/dni/cuit/firstName/lastName` opcionales (`@IsOptional @IsString @MaxLength` 120/20/20/120/120).
- `apps/backend/src/modules/wapi/campaigns/wapi-campaigns.dto.ts` — `WapiCampaignContactDto` mirror.

##### Frontend types
- `apps/frontend/src/features/email/campaigns/types.ts` — `CampaignContactInput` con `externalId/dni/cuit/firstName/lastName` opcionales.
- `apps/frontend/src/features/wapi/campaigns/types.ts` — `WapiCampaignContactInput` mirror.

#### Changed

##### `EmailCampaignsService.addContacts()` y `WapiCampaignsService.addContacts()`
- **Validación fail-fast**: recolecta los índices de filas sin `externalId|dni` y throw `BadRequestException` con el listado (`"Cada fila debe traer externalId o dni. Filas inválidas: 1, 3, 7..."`) **antes de tocar DB**.
- **Per-row sequential** (en lugar del `createMany` previo): por cada fila, `contactUpsert.upsert(...)` para resolver/crear el Contact unificado, después `prisma.scoped.{email|wapi}Contact.create({ contactId, ...})`. El `createMany` no permitía attachear `contactId` distinto por fila.
- Helper local `splitName('Juan Perez')` → `{firstName, lastName}` para retro-compat con CSVs que solo traen `name`.
- **Response shape extendido** (backwards-compat):
  ```ts
  { created: number, contactsCreated: number, contactsUpdated: number, suggestionsCreated: number }
  ```
  `created` sigue siendo el conteo de `EmailContact`/`WapiContact` rows creadas (compat con UI vieja); los 3 nuevos cuentan acciones sobre `Contact` unificado.

##### Frontend de creación de campaña
- `apps/frontend/src/features/email/campaigns/CampaignDetailPage.tsx` — `parseContactsCsv()` reescrito:
  - Reconoce headers `externalId | external_id | idexterno | id_externo | dni | documento | cuit` además de `email/phone/name/firstName/lastName`.
  - Rechaza CSV que no incluya **alguna** strong-key column en el header.
  - Per-row valida que tenga al menos `externalId` o `dni`; si no, error con índice de fila.
- Placeholder de textarea actualizado a `'externalId,email,nombre,apellido\nC-001,juan@ejemplo.com,Juan,Perez\n...'` y copy explicando la regla.
- `apps/frontend/src/features/wapi/campaigns/WapiCampaignDetailPage.tsx` — mismo patrón con `phone` en vez de `email`.

##### Tests de campaña
- `email-campaigns.service.spec.ts` y `wapi-campaigns.service.spec.ts`:
  - Mock `emailContact.create` / `wapiContact.create` (antes `createMany`).
  - Nuevo mock `contactUpsert: { upsert: jest.fn().mockResolvedValue({ contactId: 'k1', outcome: 'created' }) }` como 4to constructor arg.
  - Test rewrite "addContacts requiere strong key + verifica counters `contactsCreated/updated/suggestionsCreated`".
  - Test nuevo "fila sin externalId/dni → BadRequest y no crea nada".
  - Test nuevo "PROCESSING NO permite addContacts → Conflict".

**593/593 backend tests verde**. Backend + frontend typecheck ✅.

#### Removed

- `apps/frontend/src/features/contacts/ContactsImportPage.tsx` — página standalone eliminada.
- Ruta `/dashboard/contacts/import` y botón "Importar CSV" en `ContactsListPage.tsx`.
- Types `ContactImportJob`, `ContactImportJobPage`, `CreateImportRequest` en `apps/frontend/src/features/contacts/types.ts`.
- `apps/backend/src/modules/contacts/contact-imports.{service,controller,dto,service.spec}.ts` — endpoints `GET/POST /api/contacts/imports` ya no existen.

#### Deferred (housekeeping)

Quedan huérfanos sin impacto funcional ni de tests:
- Modelo Prisma `ContactImportJob` (`packages/prisma/prisma/schema.prisma`).
- Subject CASL `'ContactImportJob'` (`packages/permissions/src/ability.ts`).
- Entry `'ContactImportJob'` en `apps/backend/src/common/prisma/tenant-models.ts`.

No se migra el schema (additive previo, sin riesgo); cleanup diferido a un housekeeping pass futuro junto con otras drops controladas.

---

### 5.D — Frontend Contacts (lista + ficha + timeline + merge UI + CSV import) ✅

Cierra la parte UI de Fase 5. Cuatro páginas nuevas montadas sobre los endpoints de 5.A.2/5.A.3/5.A.4/5.B/5.C.

#### Added — `apps/frontend/src/features/contacts/`

##### `types.ts`
Mirror frontend de los DTOs backend: `Contact`, `ContactPage`, `SearchFilters`, `EMPTY_SEARCH_FILTERS`, `MergeSuggestion`, `MergeSuggestionPage`, `TimelineChannel`, `TimelineKind` (union de 16 kinds), `TimelineItem`, `TimelinePage`, `ContactImportJob`, `CreateImportRequest`.

##### `ContactsListPage.tsx` — `/dashboard/contacts`
- Tabla con `name | email | phoneE164 | externalId | updatedAt`. Click en fila → detail.
- Filtros: `q` (search), `channel` (Select: Todos/Email/WhatsApp), `hasOpened/Clicked/Bounced` (Switches), `sort × direction` (6 combos: Última edición ↓↑, Creación ↓↑, Nombre A→Z|Z→A).
- Cursor pagination (`take=limit+1` trick del backend, frontend renderiza "Cargar más").
- Header con CTAs: "Sugerencias de merge" → `/merge`, "Importar CSV" → `/import`.
- Wire a `GET /api/contacts/search?q&channel&hasOpened&hasClicked&hasBounced&sort&direction&cursor&limit=50` (de 5.C).

##### `ContactDetailPage.tsx` — `/dashboard/contacts/:id`
- Panel izquierdo (md=4): identidad completa (externalId/dni/cuit/email/phoneE164/phone con dual-display cuando phone≠phoneE164), metadata (creado/actualizado/teamId), atributos JSON pretty-printed en `<pre>` con max-height 240 + scroll.
- Panel derecho (md=8): timeline cross-canal contra `GET /api/contacts/:id/timeline`. `ToggleButtonGroup` con 4 valores (todo/email/wapi/audit) re-fetchea al cambiar. Cursor pagination "Cargar más" usando el `nextCursor` ISO del backend.
- Cada item de timeline: `Avatar` color-coded por kind (`success.main` para opens/clicks/read, `error.main` para failed/bounced, `info.main` para email base, `success.dark` para wapi base) + 10 iconos distintos (OpenInBrowser/Mouse/Email/Send/Done/DoneAll/ErrorOutline/Inbox/CallMade/History) + `kindLabel()` localizado al español ("Email enviado" / "WhatsApp leído" / "Click en email" / etc) + metadata expandido por kind:
  - `email.*`: campaignName + subject + targetUrl + error
  - `wapi.message.*`: type + mediaCaption (entrecomillado)
  - `wapi.{sent,delivered,read,failed}`: campaignName + error
  - `audit`: action en monospace
- 404 al cargar contact → redirect a `/dashboard/contacts` con notify error.

##### `ContactsImportPage.tsx` — `/dashboard/contacts/import`
- **Origen**: textarea multiline (8-16 rows, monospace 12px) para paste **o** input file `.csv,text/csv,text/plain` con FileReader; chequeo de tamaño 100MB cliente-side.
- **Parser CSV inline custom** (`parseCsv`): maneja `\r\n` → `\n`, comillas dobles con escape `""`, comas dentro de quoted strings, multilínea dentro de quotes, filas vacías filtradas. No depende de librerías externas.
- **Auto-mapping** por header (ES/EN heuristic): `externalId | external_id | id | idcliente | codigo | cliente` → externalId; `dni | documento` → dni; `cuit | cuil` → cuit; `email | correo | mail | e-mail` → email; `phone | telefono | teléfono | celular | movil | móvil` → phone; `firstname | first_name | nombre` → firstName; `lastname | last_name | apellido` → lastName; el resto → `__skip`.
- **Mapping wizard**: Chip con header monospace + Select de 10 opciones (8 target fields + `__attributes` para guardar como custom attribute + `__skip`); cada target field se deshabilita en otros selects una vez asignado (excepto `__attributes` y `__skip` que pueden repetirse).
- **Preview**: tabla de hasta 10 filas mapeadas con `stickyHeader` y max-height 360px, monospace 11px.
- **Validación inline**: al menos 1 identificador en STRONG_KEYS asignado, max 10k filas, no vacío. Alert warning si falla, info si OK.
- **Submit**: `POST /api/contacts/imports` con `{fileName, fileSize, mapping (sin __skip), rows}`. V1 sin polling — el backend procesa síncrono y devuelve el job DONE en la misma response.
- **Resultado**: Chips con counters (status DONE/FAILED en color, total/processed/created/updated/suggested) + lista top-5 de errores + link a `/contacts/merge` si suggested>0.

##### `MergeSuggestionsPage.tsx` — `/dashboard/contacts/merge`
- Filtro Select (PENDING/ACCEPTED/REJECTED), refetch al cambiar.
- Cada card: Chip con `Email: <value>` o `Teléfono: <value>` + timestamp + dos paneles lado-a-lado (responsive: column en xs, row en md+).
- `ContactPanel`: left con border `primary.main`, right con border `divider`. Avatar+nombre+MiniRows con email/phone/external/dni/cuit. IconButton "OpenInNew" → target="_blank" a `/contacts/<id>` para review.
- Botones **Aceptar** (`ConfirmProvider` destructive: "se va a fusionar el de la derecha en el de la izquierda — los identificadores no-null del derecho rellenarán huecos del izquierdo, y el derecho se eliminará. Esta acción no se puede deshacer") + **Rechazar** (ConfirmProvider simple).
- **Detección client-side de strong-key conflict** (externalId/dni/cuit distintos no-null entre left y right) → deshabilita Aceptar + muestra Alert warning explicando. El backend valida igual y throws 400 si se intenta — esta UI sólo evita el roundtrip.
- Optimistic UI: al aceptar/rechazar, el item desaparece de la lista local sin re-fetch.
- Cursor pagination.

#### Routing — `App.tsx`
4 rutas nuevas dentro de `/dashboard`:
- `contacts` → ContactsListPage
- `contacts/import` → ContactsImportPage
- `contacts/merge` → MergeSuggestionsPage
- `contacts/:id` → ContactDetailPage

Orden importante: `:id` queda al final para que `import` y `merge` matcheen primero.

#### Sidebar — `layouts/Sidebar.tsx`
Entry "Contactos" en grupo "Datos" (ContactsIcon) — antes estaba `disabled:true`. Ahora linkea a `/dashboard/contacts`.

#### Deferido a V2
- **Bulk actions (tag/untag/delete/export)**: requerirían endpoints backend `POST /contacts/bulk/{tag,untag,delete}` y `download` para export que aún no existen. Documentado en MIGRATION_PLAN para V2 (probable Fase 5.E).
- **Tests E2E/unit**: el frontend del proyecto actualmente no tiene infra de tests; los flows críticos (search/merge/timeline/import) están cubiertos backend-side con 598 tests.

#### Tests
- **Frontend typecheck ✅**.
- Backend sin cambios (598/598 verde, heredado de 5.C).

---

### 5.C — Búsqueda y filtros avanzados de Contacts ✅

#### Added
- **Endpoint** `GET /api/contacts/search` con filtros avanzados, montado **antes** de `:id` en `ContactsController` (Nest matchea por orden de declaración para rutas con segmentos estáticos vs `:param`). Gate CASL `read Contact`.
- **`SearchContactsQueryDto`** en `contacts.dto.ts`:
  - `cursor` (string, max 64) — id del último contact de la página anterior.
  - `limit` (int 1-200, default 50).
  - `q` (string, max 120) — full-text simple.
  - `tags?: string[]` con `@Transform` que acepta tanto array nativo (`tags=t1&tags=t2`) como CSV string (`tags=t1,t2`); max 50 ids, max 64 chars c/u.
  - `channel?: 'email' | 'wapi'`.
  - `hasOpened?: boolean`, `hasClicked?: boolean`, `hasBounced?: boolean` con `@Transform` string→bool (acepta `true|1|false|0` además de bool nativo, ideal para querystrings).
  - `sort?: 'createdAt' | 'updatedAt' | 'name'`, `direction?: 'asc' | 'desc'`.
- **`ContactsService.search(params)`**: cursor pagination con `take=limit+1` trick + nextCursor de id, mismo pattern que `list()`.

#### Implementación
- **`buildSearchWhere()`** arma el where con:
  - **`q`** → `OR` ILIKE insensitive sobre `firstName | lastName | email | externalId | phoneE164` (mismo set que `list()`).
  - **`tags`** → `tags: { some: { tagId: { in: [...] } } }`. Junction `ContactTag` con PK compuesto `(contactId, tagId)`; el filtro `some` hace que el contact matchee si tiene al menos un tag dentro de la lista.
  - **`channel='email'`** → `emailIdentities: { some: {} }` (existe al menos una `EmailContact` linkeada).
  - **`channel='wapi'`** → `wapiIdentities: { some: {} }`.
  - **`hasOpened|Clicked|Bounced`** (cualquiera true) → **reescribe** `emailIdentities` a `{ some: { reports: { some: <filter> } } }` con `firstOpenedAt: { not: null }` / `firstClickedAt: { not: null }` / `status: 'BOUNCED'`. Pisa el `channel='email'` plano sin perder semántica porque ya implica que el contact tiene al menos una `EmailContact` con un `EmailReport` que cumple. Los flags son combinables (todos van al mismo `reports.some`).
- **Sort configurable**:
  - `sort='createdAt'` o `'updatedAt'` → `[{<field>: dir}, {id: dir}]` con tiebreak por id.
  - `sort='name'` → `[{lastName: dir}, {firstName: dir}, {id: dir}]` para nombres compuestos estables.
  - Default: `updatedAt desc`.
- **Cursor**: por `id` del Contact (no por timestamp, a diferencia de la timeline). Trade-off: cursor estable y no requiere conocer el timestamp del último item, pero sí requiere persistir el id en el frontend.

#### Tests
- **+12 tests** en `contacts.service.spec.ts` (ahora 32 totales, antes 20):
  - `q` construye OR de 5 campos.
  - `tags[]` → `where.tags.some.tagId.in`.
  - `channel='email'` y `channel='wapi'` por separado.
  - `hasOpened=true`, `hasClicked=true`, `hasBounced=true` cada uno verificando el filter correcto.
  - `sort='createdAt' direction='asc'` → orderBy correcto.
  - `sort='name'` → 3 keys (lastName, firstName, id) con default direction desc.
  - Default sort `updatedAt desc`.
  - Cursor + limit con nextCursor del último item del slice.
  - Combinación `q + tags + channel + sort` coexisten correctamente.
  - `hasOpened` con `channel='email'` reescribe a `emailIdentities.some.reports.some` sin perder el filter.

#### Deferido a V2
- **`lastActivityFrom/To`** filter y **`lastActivity desc`** sort. Implementarlos correctamente requiere denormalizar `Contact.lastActivityAt` con backfill SQL (`MAX` de `EmailReport.sentAt | EmailEvent.occurredAt | WapiReport.sentAt | WapiMessage.timestamp`) + bumps en cada productor (EmailWorker, EmailCampaignsService, SesWebhookService, TrackService, WapiWorker, WapiInboxService, WapiWebhookService). El scope es demasiado invasivo para V1 y la UI todavía no lo necesita. Documentado como deferido en `MIGRATION_PLAN.md` (probable Fase 5.E).
- **`tsvector` / Postgres full-text**: ILIKE OR sobre 5 campos alcanza para volumen actual; migrar a tsvector queda para cuando haya datos en producción.

#### Tests totales
- **598/598 backend tests verde** (+13 vs 585: 12 nuevos en `search` + 1 que ya estaba).
- Backend typecheck ✅.

---

### 5.B — Timeline aggregator cross-canal ✅

#### Added
- **`apps/backend/src/modules/contacts/contact-timeline.service.ts`** — agregador de eventos cross-canal sobre un Contact. Lee 5 fuentes y devuelve una lista unificada ordenada por timestamp desc:
  - **EmailReport**: 1 item por report @ `sentAt ?? createdAt` con `kind = email.{status.lowerCase}` (queued/sent/failed/bounced/complained/suppressed/canceled). Filtrado por `EmailContact.contactId IN [...]` precalculado en una query previa.
  - **EmailEvent**: 1 item por evento @ `occurredAt` con `kind = email.opened | email.clicked`. Filtrado por los `reportId` retornados en el paso anterior.
  - **WapiReport**: hasta **4 items por report**, uno por cada timestamp no-null entre `failedAt/readAt/deliveredAt/sentAt`. ID compuesto `wapi.report.{rid}.{event}` para evitar colisiones en el sort.
  - **WapiMessage**: resuelve los phones desde `contact.phoneE164` + `wapiContact.phone`, busca conversaciones con `phone IN [...]` y emite 1 item por mensaje con `kind = wapi.message.{in|out}` según `fromMe`.
  - **AuditLog**: filtrado por `resourceType='Contact' AND resourceId=contactId`. Emite `kind = audit` con `metadata.action`.
- **`contact-timeline.dto.ts`** — `GetTimelineQueryDto` con `cursor (IsISO8601)`, `limit IsInt [1,100]`, `channel IsIn ['email','wapi','audit']`.
- **Endpoint** `GET /api/contacts/:id/timeline` agregado a `ContactsController` (gate `read Contact`).
- **`ContactTimelineService` + `getTimeline()`** wired en `contacts.module.ts`.

#### Implementación
- **Cursor**: ISO timestamp string. Cada fuente filtra `at <= cursorDate`; para `EmailReport` el filtro es composto (`OR sentAt<=cursor / sentAt=null+createdAt<=cursor`).
- **Pagination**: cada fuente usa `take: PER_SOURCE_BUFFER (=200)` como heurística para evitar round-trips adicionales cuando un contact tiene miles de eventos en una sola fuente. Merge in-memory, sort desc por `at` con tiebreak por `id` (string desc), slice `limit` (default 50, max 100), `nextCursor = sliced.last.at.toISOString()` si `items.length > limit`.
- **`channel`** filter (`email | wapi | audit`): cuando está presente, las queries de las otras fuentes no se ejecutan.
- **NotFound** si el Contact no existe en la org del caller (lookup vía `prisma.scoped` ya aplica el org-scope). **BadRequest** si el cursor no parsea como Date.

#### Tests
- **`contact-timeline.service.spec.ts`** — 7 specs:
  - "contacto inexistente → NotFound"
  - "cursor inválido → BadRequest"
  - "agrega email reports + events ordenados desc"
  - "expande WapiReport en hasta 4 entries por status timestamps" (verifica que `failedAt=null` no emite item, y que `wapi.message.in` queda al frente)
  - "canal=audit limita la query a AuditLog" (verifica que `emailContact.findMany` y `wapiContact.findMany` no se llaman)
  - "limit + nextCursor cuando hay más items que el límite"
  - "cursor descarta items posteriores al cursor"
- **585/585 backend tests verde** (+7 vs 578). Backend typecheck ✅.

#### Limitaciones V1 conocidas (mejoras V2)
- Cursor por timestamp ISO **solo** — pierde precisión cuando varios items comparten el mismo `at`. Mejorable a `(at, id)` composito.
- `WapiMessage` matchea sólo por `phone` literal — si el contact tiene phoneE164 `+5491111` y la conversación quedó con `5491111` (sin `+`), no matchea. Normalización deferida a 5.B.2.
- Los modelos WAPI/Email son tenant-scoped — la timeline ve solo eventos del team del usuario actual. Cross-team (visible para OWNER/ADMIN) requeriría bypass del prisma extension. Deferido.

---

### 5.A.4 — Merge backend (accept/reject + relink) ✅

#### Added
- **`apps/backend/src/modules/contacts/contact-merge.service.ts`** — service con `list/accept/reject` para `ContactMergeSuggestion`.
  - `list({ status='PENDING', cursor, limit })` cursor-paginado (default 25, max 100), `include` de left/rightContact con snapshot completo (id + identity keys + profile + createdAt) para que el frontend pueda renderizar el side-by-side sin queries adicionales.
  - `accept(id)`:
    - Throw `NotFoundException` si no existe; `BadRequestException` si la suggestion no está en `PENDING`.
    - `detectStrongKeyConflicts(left, right)` rechaza con 400 si externalId/dni/cuit difieren no-null entre los dos contacts (señal de que NO son la misma persona, no se debería haber sugerido).
    - `buildProfilePatch(left, right)` construye un objeto con sólo los campos de right que están null en left — left wins, right fills gaps. Aplicado a externalId/dni/cuit/email/phoneE164/phone/firstName/lastName/attributes.
    - Todo el merge corre dentro de `prisma.scoped.$transaction(async (tx) => …)`:
      1. `tx.contact.update(left, profilePatch)` si hay cambios.
      2. `tx.emailContact.updateMany` + `tx.wapiContact.updateMany` paralelizados (Promise.all) — relinkean `contactId` de right a left.
      3. `ContactTag` (PK `(contactId, tagId)`): `findMany` de leftTagIds, `deleteMany` de los duplicados en right, después `updateMany` de los que quedan.
      4. Mismo patrón para `ContactListMember` (PK `(listId, contactId)`).
      5. `tx.contactMergeSuggestion.update` a `status=ACCEPTED + decidedByUserId + decidedAt`.
      6. `tx.contact.delete(right)` — cascade limpia `ContactMergeSuggestion` que involucren a right.
    - Retorna `{ mergedContactId, removedContactId, relinked: { emailContacts, wapiContacts, contactTags, contactListMembers } }`.
  - `reject(id)`: marca status `REJECTED + decidedByUserId + decidedAt`. No toca contacts. Mismas validaciones de existencia y estado.
- **`contact-merge.controller.ts`** — endpoints REST:
  - `GET /api/contacts/merge-suggestions` (gate `read ContactMergeSuggestion`).
  - `POST /api/contacts/merge-suggestions/:id/accept` (gate `update`) con `@Audit({ action:'contact.merge.accepted', resourceType:'ContactMergeSuggestion', resourceIdFrom:'param:id', includeBody:false })`.
  - `POST /api/contacts/merge-suggestions/:id/reject` (gate `update`) con `@Audit({ action:'contact.merge.rejected', ... })`.
- **`contact-merge.dto.ts`** — `ListMergeSuggestionsQueryDto` (cursor, limit `[1,100]`, status enum opcional).

#### Changed
- **`packages/permissions/src/ability.ts`**:
  - `MEMBER` gana `can(['read','update'], 'ContactMergeSuggestion', { organizationId })`.
  - `VIEWER` gana `can('read', 'ContactMergeSuggestion', { organizationId })`.
  - OWNER/ADMIN ya tenían `manage` desde 5.A.1.
- **`apps/backend/src/modules/contacts/contacts.module.ts`** — `ContactMergeController` + `ContactMergeService` registrados.

#### Tests
- **`contact-merge.service.spec.ts`** — 8 specs (mocks de `prisma.scoped` + tx con `contact/emailContact/wapiContact/contactTag/contactListMember/contactMergeSuggestion`):
  - "list filtra por status PENDING por default + cursor pagination"
  - "accept happy path: relink + delete right + update suggestion ACCEPTED"
  - "accept: cuando left ya tiene tagId del right → deleteMany duplicates antes de updateMany"
  - "accept rechaza si strong key conflict (dni distinto)"
  - "accept inexistente → NotFound"
  - "accept rechaza si suggestion no está PENDING"
  - "reject marca REJECTED + decidedByUserId"
  - "reject inexistente → NotFound"
- **578/578 backend tests verde** (+8 vs 570). 14/14 permissions verde. Backend typecheck ✅.

#### Notas
- **Frontend pendiente** en 5.D — esta entrega es solo backend.
- El cascade `onDelete: Cascade` sobre `ContactMergeSuggestion → Contact` borra la suggestion cuando se elimina el right. El registro de auditoría queda en `AuditLog` ('contact.merge.accepted') con `resourceId` = suggestion.id.

---

### 5.A.3 — CSV import wizard inline + merge suggestions ✅

#### Added
- **`apps/backend/src/modules/contacts/contact-imports.service.ts`** — procesador in-process de imports.
  - `create(dto)` crea `ContactImportJob` (status `PROCESSING`, `total = rows.length`, `startedAt = now`), llama a `processRows()` y al cerrar pasa a `DONE` con `processed/created/updated/suggested/errors`. Si throw inesperado → `FAILED` con `errors:[{message}]`.
  - `processRows()`: bucle per-row con `try { … } catch { errors.push(...) } finally { processed++ }` — single source of truth para `processed` (no doble cuenta).
  - `applyRow()` cascada:
    1. **Strong match** (`externalId`/`dni`/`cuit`, en ese orden): `updateContact(skipStrongConflicts:true)` (P2002 → reintenta el update sin las strong keys del row, no rompe la fila) + `maybeSuggestWeakConflict` (si row trae email/phone distinto al del contact existente y ese valor lo tiene otro contact en la org → suggestion `EMAIL`/`PHONE`). Counter `updated`.
    2. **Weak match** (`email`/`phoneE164`): si row no trae strong key → `update` directo (`updated`); si trae strong key → `tryUpdateContact` (catch P2002 → `false`); si OK `updated`, si choca → `createContact` + `upsertSuggestion(weakMatch, newContact)` (`suggested`).
    3. Sin match → `createContact` (`created`).
  - `upsertSuggestion()` ordena `(left.id < right.id)` para que la unique `(left, right, matchType)` sea estable; swallowea P2002 (otra fila ya creó la suggestion).
  - `normalizeRow()` reusa `identity.ts` y throwea `'DNI inválido'`/`'CUIT inválido'` (la fila falla pero el job sigue, queda en `errors[]`).
  - `hasAnyIdentifier()`: row sin `externalId/dni/cuit/email/phoneE164` → push a `errors[]` con `'Fila sin identificadores válidos'` (no toca DB).
  - `list()` cursor-paginado (default 25, max 100). `findOne()` con `NotFoundException`.
  - Return types explícitos `ContactImportJobDto` y `ContactImportJobPage` para evitar leak de `Prisma.JsonValue` (TS2742).
- **`contact-imports.controller.ts`** — endpoints REST:
  - `GET /api/contacts/imports` (gate `read ContactImportJob`).
  - `GET /api/contacts/imports/:id` (gate `read ContactImportJob`).
  - `POST /api/contacts/imports` (gate `create ContactImportJob`) con `@Audit({ action:'contact.import.created', resourceIdFrom:'response:id', includeBody:false })`.
- **`contact-imports.dto.ts`** — `CreateContactImportDto` (`fileName`, `fileSize` max 100MB, `mapping` JSON, `options?` JSON, `rows[]` 1-10000 filas con `ImportContactRowDto` validado por class-validator); `ListContactImportsQueryDto`.
- **`contacts.module.ts`** — `ContactImportsController` registrado **antes** de `ContactsController` para que `/contacts/imports` matchee antes que `/contacts/:id`.

#### Changed
- **Estrategia V1**: import inline síncrono — el frontend parsea el CSV y aplica el mapping client-side y postea JSON con `rows[]`. Sin multer, sin BullMQ, sin worker. (V2 podría mover a queue cuando aparezca un cliente con CSVs grandes.)

#### Tests
- **`contact-imports.service.spec.ts`** — 8 specs nuevos (mocks de `prisma.scoped.{contact,contactImportJob,contactMergeSuggestion}`):
  - "crea contact nuevo cuando no hay match (counters.created)"
  - "strong match (externalId) → update sin crear, counters.updated"
  - "weak match (email) sin strong key en row → update"
  - "weak match + row trae strong key con conflicto P2002 → crea contact + suggestion (counters.suggested)"
  - "row sin identificadores válidos → error en errors[], no crea/actualiza"
  - "DNI inválido en row → error pero sigue procesando otras filas"
  - "list con cursor pagination devuelve nextCursor cuando rows > limit"
  - "findOne inexistente → NotFound"
- **570/570 backend tests verde** (+8 vs 562). Backend typecheck ✅.

#### Fixed
- Bug encontrado al correr el spec: `processed++` antes del `continue` (rama "row sin identificadores") doblaba el contador porque el `finally` ya lo incrementa. Removido — ahora `finally { processed++ }` es la única fuente.

---

### 5.A.2 — ContactsService org-scope + cascada de identidad + validators AR ✅

#### Added
- **`apps/backend/src/modules/contacts/identity.ts`** — utilities de normalización/validación:
  - `normalizeDni(raw)` → 7-8 dígitos limpios o `null`. Acepta separadores `12.345.678` → `12345678`.
  - `normalizeCuit(raw)` → 11 dígitos con checksum mod-11 AR válido o `null`. Weights `[5,4,3,2,7,6,5,4,3,2]`, manejo de mod 0/1 (mod=0 → digit=0, mod=1 → digit=9).
  - `normalizePhoneE164(raw)` → `+<digits>` con 8-15 dígitos. Rechaza phones con `0` después de `+` (formato local con prefijo de marcado).
  - `normalizeEmail(raw)` → lowercase + trim.
  - `normalizeExternalId(raw)` → trim, conserva case (es identificador del cliente, no debe normalizarse).
- **`ContactsService` reescrito org-scope** (`apps/backend/src/modules/contacts/contacts.service.ts`):
  - `list({ cursor, limit, q, externalId, dni, cuit, email, phone })` con cursor pagination (`take=limit+1` trick, default 50, max 200). `q` arma `OR` insensitive contra `firstName/lastName/email/externalId/phoneE164`. Filtros normalizados antes del where (DNI con separadores → digits, email lowercased, phone → E164).
  - `findByIdentity({ externalId, dni, cuit, email, phone })` cascada **`externalId > dni > cuit > email > phoneE164`** con cortocircuito al primer hit. Cada paso normaliza el input — input inválido (e.g. DNI `'123'`) se descarta silenciosamente.
  - `create(dto)` exige al menos un identifier válido (externalId/dni/cuit/email/phoneE164) — si no, `BadRequestException`. DNI/CUIT inválidos → `BadRequestException` antes de tocar DB. Strong key duplicado en org (P2002) → `ConflictException`.
  - `update(id, dto)` aplica solo campos presentes en el DTO (no pisa con `undefined`). Misma validación + manejo de P2002.
  - Todas las operaciones llaman `requireContext()` que exige `TenantContext` → `ForbiddenException` si falta. Scope se inyecta vía Prisma extension (`prisma.scoped.contact`).
- **Endpoints REST** (`contacts.controller.ts`):
  - `GET /api/contacts` con filtros y paginación (gate `read Contact`).
  - `GET /api/contacts/by-identity` para resolución cascada por cualquier campo (gate `read Contact`).
  - `GET /api/contacts/:id`, `POST`, `PATCH`, `DELETE`.
  - `@Audit({ action: 'contact.created'|'updated'|'deleted', resourceType: 'Contact', resourceIdFrom: 'response:id'|'param:id' })` en mutaciones.
- **DTOs** (`contacts.dto.ts`):
  - `CreateContactDto`/`UpdateContactDto` con todos los identifiers + nombres + attributes. `email` validado con `@IsEmail` solo si no hay otro identifier (en Create).
  - `ListContactsQueryDto` (cursor, limit con `@Type(() => Number) @IsInt @Min(1) @Max(200)`, q, externalId, dni, cuit, email, phone).
  - `FindByIdentityQueryDto` (mismos campos, todos opcionales).

#### Tests
- **`identity.spec.ts`** — 19 tests cubriendo normalización + validación de cada util.
- **`contacts.service.spec.ts`** — rewrite completo: 13 tests (access control sin contexto, list vacío/clamp/cursor/q/filtros normalizados, findByIdentity cascada/cortocircuito/input inválido, create rechazo sin identifier/normalize/CUIT inválido/extension scope/P2002, update NotFound + parcial, remove NotFound).
- **562/562 backend tests verde** (+32 vs 530 previo).
- **`tenant-isolation.spec.ts`** actualizado: `contactsService.findAll()` → `contactsService.list({})`.

### 5.A.1 — Contacts unificados: schema org-scope + identidad multi-clave + migración con backfill ✅

#### Added
- **Schema Prisma — `Contact` org-scope + identity fields** (`packages/prisma/prisma/schema.prisma`):
  - `Contact.teamId` pasa a opcional (soft-ownership). Nuevos campos: `externalId String?` (clave de negocio del cliente, viene del CSV), `dni String?`, `cuit String?` (sin cifrar — pragmático, DNI/CUIT son identificatorios pero no secretos), `phoneE164 String?` (normalizado `+<digits>`). El `phone` legacy se conserva durante la migración para no romper backfill.
  - Uniques compuestos por org en strong keys: `@@unique([organizationId, externalId])`, `@@unique([organizationId, dni])`, `@@unique([organizationId, cuit])`. Todos nullable — Postgres trata NULLs como distintos, así que múltiples contactos sin DNI/externalId conviven sin conflicto.
  - Índices en weak keys: `@@index([organizationId, email])`, `@@index([organizationId, phoneE164])` (no son unique porque pueden colisionar entre personas distintas).
  - `EmailContact.contactId String?` y `WapiContact.contactId String?` con FK `ON DELETE SET NULL`. Permite linkear identidades del canal al Contact unificado sin perder históricos si se borra el Contact.
- **Tabla `ContactMergeSuggestion`** (queue de fusiones por weak key):
  - Campos: `leftContactId`/`rightContactId` (ambos FK a Contact con cascade), `matchType` enum `EMAIL|PHONE`, `matchValue String`, `status` enum `PENDING|ACCEPTED|REJECTED` default `PENDING`, `decidedByUserId String?`, `decidedAt DateTime?`.
  - Unique `(leftContactId, rightContactId, matchType)` para evitar duplicados de la misma sugerencia.
  - Índices `(organizationId, status)` para listar pendientes rápido y `(organizationId)` para scoping.
- **Tabla `ContactImportJob`** (tracking de imports CSV):
  - Campos: `fileName`/`fileSize`, `status` enum `PENDING|PROCESSING|DONE|FAILED|CANCELLED`, `mapping JSON` (mapeo columna→campo elegido en el wizard), `options JSON?` (flags como dryRun, mergeStrategy), counters `total/processed/created/updated/suggested Int @default(0)`, `errors JSON?`, `startedAt/finishedAt DateTime?`, `createdByUserId String`.
  - Índices `(organizationId, status)` y `(organizationId, createdAt)` para inbox de imports.
- **Migración `20260514100000_contacts_unification`** con SQL idempotente:
  - 3 enums (`ContactMergeSuggestionMatchType`, `ContactMergeSuggestionStatus`, `ContactImportJobStatus`).
  - DROP del unique `(teamId, email)` y `(teamId, phone)` + nuevas constraints/índices org-scope.
  - **Backfill SQL en 5 pasos**: (1) `phoneE164` derivado en Contact existentes con `regexp_replace(phone, '[^0-9]', '', 'g')` y `'+'` prefix si ≥8 dígitos; (2) link `EmailContact.contactId` por `LOWER(TRIM(email))` matching Contacts existentes con tie-break "longest name wins" via `DISTINCT ON ... ORDER BY LENGTH(firstName||lastName) DESC, createdAt ASC`; (3) crear Contact por cada `(orgId, normalized_email)` no linkeado, con `gen_random_uuid()::text` como id, `firstName` desde el `name` del EmailContact con mejor longitud; (4-5) mismo patrón para WapiContact (link por `phoneE164` matching existentes + crear Contact por `(orgId, normalized phone)` no linkeado).
  - Aplicada vía `psql` directo (drift previa) + INSERT manual en `_prisma_migrations`. Resultado en dev: 125 EmailContacts → 2 Contacts únicos, 48 WapiContacts → 1 Contact único (test data tenía sólo 2 emails + 1 phone distintos).
- **Tenant scope** (`apps/backend/src/common/prisma/tenant-models.ts`):
  - `Contact`, `ContactMergeSuggestion`, `ContactImportJob` movidos de `TENANT_SCOPED_MODELS` a `ORG_SCOPED_MODELS`. `Tag` y `ContactList` siguen team-scoped (decisión: las listas/tags son del equipo que las trabaja, los contactos son del cliente final que es global a la org).
- **CASL** (`packages/permissions/src/`):
  - `subjects.ts`: agregados `ContactMergeSuggestion` y `ContactImportJob` al `SubjectName`.
  - `ability.ts`: OWNER/ADMIN ganan `manage` sobre los 3 subjects con condición `{ organizationId }`. MEMBER hace `create/read/update/delete Contact` y `create/read ContactImportJob` (org-scope); ContactList/Tag siguen team-scope con `{ teamId }`. VIEWER read-only sobre `Contact` y `ContactImportJob`.

#### Política de unificación de identidad
- **Cascada de matching**: `externalId > dni > cuit > email > phoneE164`.
- **Strong keys** (`externalId`, `dni`, `cuit`): auto-merge. Uniques de DB lo garantizan — un upsert con strong key match siempre apunta al mismo Contact existente.
- **Weak keys** (`email`, `phoneE164`): si una fila importada matchea por email/phone con un Contact existente cuya strong key es distinta, se crea una `ContactMergeSuggestion PENDING` para resolución manual.
- **DNI/CUIT sin cifrar**: decisión explícita del dueño tras evaluar pros/contras. Razonamiento: son identificatorios pero no secretos (a diferencia de passwords); cifrarlos rompería búsquedas SQL nativas (`WHERE dni = ?` requeriría descifrar cada fila o derivar hash determinista, ambos con costo en performance e ingeniería). Si en el futuro aparecen requisitos regulatorios, se puede agregar columna `dniHash` con HMAC determinista.

### 4.S.3 — Audit Log endpoint + frontend `/dashboard/audit` (Stage 6) ✅

#### Added
- **Backend — `GET /api/audit-logs`** (`apps/backend/src/modules/audit-logs/`):
  - Service + controller + DTO + spec. Cursor pagination (`take=limit+1` trick, default 50, max 200) y filtros opcionales `actorUserId`/`resourceType`/`resourceId`/`action`/`from`/`to`.
  - Tenant-scoped via `prisma.scoped.auditLog` (org-scope, sin teamId).
  - Enriquecimiento del actor en una sola query batch: `User.findMany({ where: { id: { in: actorIds } } })` + map en memoria. Devuelve `{ id, name, email, avatarUrl }` o `null` si fue una acción del scheduler/sistema o si el user fue borrado.
  - Permission gate CASL: `read AuditLog` (OWNER/ADMIN gain). Cualquier rol inferior recibe 403.
- **CASL** — `'AuditLog'` agregado a `SubjectName` en `@massivo/permissions`. `OWNER`/`ADMIN` ganan `can('read', 'AuditLog', { organizationId })`.
- **Frontend — `/dashboard/audit`** (`apps/frontend/src/features/audit/AuditLogPage.tsx`):
  - Header + Paper de filtros (Grid 6 columnas: actor user ID, acción, resourceType, resourceId, datetime-local from/to + botones Aplicar/Limpiar/Refresh).
  - Tabla con fecha, actor (avatar + nombre + email, o chip "sistema"), acción (chip monoespaciado), recurso (type + id), IP.
  - Click en fila → `Drawer` derecho con detalle de campos + bloque `<pre>` con metadata pretty-printed JSON, scrollable, monospace, theme-aware.
  - Botón "Cargar más" con cursor.
- **Sidebar** — entry "Audit log" (HistoryIcon) en grupo "Cuenta".

#### Tests
- +9 service tests: lista vacía, paginación con nextCursor, clamp limit `[1,200]`, cursor con skip:1, filtros combinados, fechas from/to, enrich actor, sin actor, actor borrado.
- 539/539 backend tests verde. Frontend typecheck ✅.

#### Why
- Cierra el bloque 4.S completo. Compliance + debugging cross-team + forensics: ahora cualquier OWNER/ADMIN puede inspeccionar quién hizo qué desde una UI navegable, con metadata JSON sanitizada visible en detalle.
- Diseño "actor enrichment" en batch (no per-row JOIN) mantiene la query simple y aprovecha que la cantidad de actores únicos por página suele ser chica.

### 4.S.2 — Audit Log: cobertura ampliada (Stages 3-5)

#### Added
- **Stage 3 — WAPI inbox/bot/quick-replies/templates**:
  - `WapiBotController` (5 endpoints): `wapi.bot.updated/mediaUploaded/draftSaved/published/draftDiscarded`. Bot config flows con `includeBody:false` (los payloads de flow son enormes).
  - `WapiInboxController` (8 endpoints): `wapi.conversation.messageSent/mediaSent/taken/assigned/unassigned/resolved/reopened/held`. Media con `includeBody:false`.
  - `WapiQuickRepliesController` (3 endpoints): `wapi.quickReply.created/updated/deleted`.
  - `WapiTemplatesController` (5 endpoints): `wapi.template.syncedFromMeta/submittedToMeta/created/updated/deleted`.
- **Stage 4 — Email + SMTP + templates + suppression**:
  - `EmailCampaignsController` (8 endpoints): `email.campaign.created/updated/contactsAdded/sent/paused/resumed/forceClosed/deleted`. `addContacts` con `includeBody:false`.
  - `EmailCampaignSchedulerService` con llamada manual post-send (`actorUserId:null, metadata:{source:'scheduler', name}`) dentro del `TenantContext.run`, paralelo a WAPI scheduler.
  - `SmtpAccountsController` (5 endpoints): `email.smtp.created/verified/testSent/updated/deleted`.
  - `EmailTemplatesController` (3 endpoints): `email.template.created/updated/deleted`. Create/update con `includeBody:false` (payloads HTML/JSON Unlayer).
  - `SuppressionsController` (3 endpoints): `email.suppression.unsubscribeAdded/unsubscribeRemoved/bounceRemoved`.
- **Stage 5 — org-level**:
  - `OrganizationsController` (1 endpoint): `org.webhookSlugRegenerated`.
  - `TeamsController` (3 endpoints): `team.created/updated/deleted`.
  - `TeamMembersController` (3 endpoints): `team.memberAdded/memberRoleChanged/memberRemoved`.

#### Tests
- `email-campaign-scheduler.service.spec.ts` actualizado por la nueva dep `AuditLogService`.
- 232/232 verde en suite combinada (audit/scheduler/inbox/quick-replies/smtp/templates/teams/organizations/email-campaigns/wapi-campaigns/wapi-bot). Backend typecheck ✅.

#### Why
- Completa la cobertura de transacciones de usuario en backend para WAPI + Email + org-level. Todo lo que un usuario puede hacer desde la UI queda registrado con quién/cuándo/qué.
- Los inbound webhooks (Meta, SES, Clerk) siguen sin auditarse — no son transacciones de usuario, tienen su propio logging Winston.
- Stage 6 (frontend `/dashboard/audit` con tabla + filtros) queda como próximo commit.

### 4.S.1 — Audit Log de transacciones de usuario (Stages 1-2)

#### Added
- **Backend — módulo global `AuditLog`** (`apps/backend/src/common/audit/`):
  - `AuditLogService.log(entry)` — fire-and-forget cross-tenant. Toma `actorUserId/organizationId/teamId` del `TenantContext` (con override explícito para jobs) y persiste a `AuditLog`. Si no hay `organizationId` ni override → descarta con WARN. Sanitiza metadata recursivamente con regex `/access[_-]?token|app[_-]?secret|verify[_-]?token|password|secret|api[_-]?key|enc$/i` → `[REDACTED]`. Try/catch interno: si Prisma falla loggea WARN sin propagar.
  - `@Audit({ action, resourceType?, resourceIdFrom?, includeBody? })` — decorator declarativo. `resourceIdFrom` admite `param:<key>`, `body:<key>`, `response:<key>`.
  - `AuditInterceptor` registrado como `APP_INTERCEPTOR` global. Captura `req.body` (a menos que `includeBody:false`), `req.params`, `req.ip` con first-hop de `x-forwarded-for`, y `user-agent`. Escribe vía `tap()` de rxjs → sólo on-success; si el handler tira no se escribe nada.
- **Migración** `20260513100000_audit_log_resource_actor_indexes` con dos índices en `AuditLog`:
  - `(organizationId, resourceType, resourceId)` — historial por recurso.
  - `(actorUserId, createdAt)` — historial por usuario.
- **Cobertura Stage 2** — `@Audit` agregado a:
  - `WapiCampaignsController` (8 endpoints): `wapi.campaign.created/updated/contactsAdded/sent/paused/resumed/forceClosed/deleted`. `addContacts` con `includeBody:false`.
  - `DevSimulatorController` (5 endpoints): `wapi.simulator.inbound.text/media/reaction/button` + `wapi.simulator.status`. Media con `includeBody:false`.
  - `WapiConfigsController` (4 endpoints): `wapi.config.secretsRevealed/created/updated/deleted`.
- **Caso especial scheduler** — `WapiCampaignSchedulerService` ahora llama `auditLog.log({ action: 'wapi.campaign.sent', actorUserId: null, metadata: { source: 'scheduler', name } })` después de cada `send()`, dentro del `TenantContext.run` para heredar org/team.
- **Tests** — +13 (8 `audit-log.service.spec.ts` + 5 `audit.interceptor.spec.ts`) + actualización de `wapi-campaign-scheduler.service.spec.ts` por la nueva dep. 17/17 verde en suite audit+scheduler.

#### Why
- Necesitamos saber quién hizo qué: quién creó una campaña, quién pausó, quién dio de alta SMTP, quién reveló verify tokens, etc., con timestamp + organización + team. Base para compliance, debugging cross-team y forensics.
- El modelo `AuditLog` ya existía desde Fase 1; lo cableamos ahora con un patrón estándar (decorator + interceptor) que escala incrementalmente sin tocar services.
- Stages 3-6 (WAPI inbox/bot, Email/SMTP, org-level, frontend `/dashboard/audit`) quedan para próximos commits.

### 4.R — Scheduler de campañas (WAPI + Email)

#### Added
- **Backend — `WapiCampaignSchedulerService`** (`apps/backend/src/modules/wapi/campaigns/wapi-campaign-scheduler.service.ts`): worker cross-tenant con `setInterval(60s)` que lee campañas `status='SCHEDULED' AND scheduledAt <= NOW()` (batch 50) y dispara `WapiCampaignsService.send()` para cada una bajo un `TenantContext` sintético construido con la `organizationId/teamId` de la fila. Errores per-row son catcheados y loggeados sin tumbar el tick. Multi-instance safe: `send()` marca `PROCESSING` en transacción, así que el segundo worker que intente la misma fila recibe `ConflictException` y se ignora.
- **Backend — `EmailCampaignSchedulerService`** (`email-campaign-scheduler.service.ts`): mismo patrón, equivalente para email-campaigns.
- **Tests** — `wapi-campaign-scheduler.service.spec.ts` y `email-campaign-scheduler.service.spec.ts` (+7 tests netos): tick sin filas, despacho per-row, resiliencia ante fallos, filtro por `SCHEDULED` + `scheduledAt vencido`. **+6 tests** adicionales en los specs de service para cubrir transición DRAFT↔SCHEDULED en `update()`.

#### Fixed
- **`WapiCampaignsService.update()` / `EmailCampaignsService.update()`**: cuando se setea/limpia `scheduledAt` en una campaña, ahora se transiciona el `status` apropiadamente:
  - `DRAFT` + `scheduledAt` futuro → `SCHEDULED` (antes se quedaba en `DRAFT`, por eso una campaña editada con fecha no aparecía en el tab "Programadas").
  - `SCHEDULED` + `scheduledAt: null` → `DRAFT`.
  - `PAUSED` no se toca (sigue siendo `PAUSED` al editar fecha — la pausa la maneja el operador).

#### Why
- Antes: `scheduledAt` se persistía como dato decorativo. No había ningún cron/worker que monitoreara campañas `SCHEDULED` y las disparara en su hora. El botón "Enviar" mandaba al instante sin importar la fecha. Y `update()` no transicionaba a `SCHEDULED` aunque le pusieras fecha, por lo que el tab "Programadas" no se llenaba.
- Ahora: programar una campaña realmente dispara automáticamente. La fila se enquola en el background sin intervención manual y el inventario en "Programadas" refleja el estado real.

### 4.Q — Throttle de envío configurable por línea y por campaña

#### Added
- **Schema — `WapiConfig.sendDelayMinMs / sendDelayMaxMs`**: dos `Int` con defaults 30000/60000 (los mismos que tenía hardcoded el worker via env). Migration `20260512100000_wapi_config_send_delay`. Ahora el throttle vive en BD per-línea en lugar de un único par de envs global.
- **Backend — `WapiWorkerService.jitterMs()` cascada**: resuelve el delay por report en orden `campaign.config.delayMinMs/Max → WapiConfig.sendDelayMinMs/Max → WAPI_DELAY_MIN/MAX_MS env → defaults 30s/60s`. Min/max se ordenan defensivamente por si la BD trae datos sucios. La llamada `sleep(jitterMs(...))` después del send pasa `report.campaign.config` y `report.campaign.configRel`, los dos ya cargados por la query del worker — cero queries extras per-job.
- **Backend — DTO + service validation (`WapiConfig`)**: `CreateWapiConfigDto` / `UpdateWapiConfigDto` aceptan `sendDelayMinMs/Max` con `@Min(1000)` y `@Max(3_600_000)` (1h tope de seguridad). `WapiConfigsService.assertDelayRange()` cruza con valores persistidos en updates parciales — si pasás sólo `sendDelayMinMs`, se compara contra el `sendDelayMaxMs` actual de la fila para no permitir min > max.
- **Backend — Validación `campaign.config` (4.Q)**: `WapiCampaignsService.assertCampaignConfig()` valida que las keys opcionales `delayMinMs/delayMaxMs` (cuando vienen) sean enteros en el rango `[1000, 3_600_000]` y que `delayMinMs ≤ delayMaxMs`. Otras keys del JSON (ej `bodyVars`) pasan intactas.
- **Backend — Live snapshot**: `LiveCampaignSummary` expone `delayMinMs/delayMaxMs` resueltos + `delaySource` (`'campaign' | 'config'`). `LiveConfigUsage` agrega `sendDelayMinMs/Max` (delay base de la línea). El service hace el resolve once-per-snapshot para que el frontend no tenga que duplicar la cascada.
- **Frontend — Sección "Velocidad de envío" en dialog `WapiConfig`** (`apps/frontend/src/features/wapi/configs/WapiConfigsPage.tsx`): dos `TextField` (segundos) min/max con helper text en vivo `~X envíos/min · ~Y/hora` calculado en base al promedio del jitter. Validación local antes del PATCH (min ≥ 1, min ≤ max).
- **Frontend — Override per-campaña en wizard** (`WapiCampaignDetailPage.tsx`): switch "Pisar velocidad de envío para esta campaña" que despliega los TextField de min/max + estimación de throughput. Al guardar, se persiste como `config.delayMinMs/delayMaxMs` (junto a `bodyVars`); apagado limpia esas keys del JSON.
- **Frontend — Tooltip de delay efectivo en `WapiLivePage`**: el nombre de cada campaña activa lleva tooltip "Velocidad efectiva: X–Y entre envíos (override per-campaña / heredado del número). ~Z envíos/min." y un mini chip `Velocidad ★` cuando hay override de campaña. El nombre de cada línea en "Uso de líneas" también lleva tooltip con el delay base.
- **Tests** — `wapi-worker.service.spec.ts` (+5): cascada `campaign > config > env > default`, ordenamiento defensivo de min>max sucio. `wapi-configs.service.spec.ts` (+4): create/update con min>max → 400, update parcial cruza con valor persistido. `wapi-campaigns.service.spec.ts` (+5): valida `delayMinMs/Max` tipo, rango y cruce min/max; pasa `bodyVars` intacto. `wapi-live.service.spec.ts` actualizado: snapshot expone `delaySource` + `sendDelayMin/Max`. **+14 tests netos**.

#### Why
- Antes: throttle único global por env (`WAPI_DELAY_MIN_MS / WAPI_DELAY_MAX_MS`). Cambiar la velocidad implicaba reiniciar el worker, y todas las líneas iban al mismo ritmo independientemente del Tier de Meta de cada número (un número Tier 250k puede ir mucho más rápido que un Tier 1k recién aprobado).
- Ahora: cada línea (`WapiConfig`) tiene su propio par min/max persistido y editable desde la UI; cada campaña puede pisarlo cuando necesita una cadencia distinta puntual (ej. recordatorios urgentes contra promo masiva). El worker resuelve la cascada per-report sin queries extras y el dashboard live muestra la velocidad efectiva con tooltip.

### 4.P — Webhook URL por organización (org-scoped)

#### Added
- **Schema — `Organization.webhookSlug`**: nuevo campo `String @unique`. Slug opaco URL-safe formato `wbh_<22-24 chars base64url>`. Generado en backend con `crypto.randomBytes(18).toString('base64url')`. Migration `20260511100000_organization_webhook_slug` (backfill `wbh_<md5...>` para orgs existentes).
- **Backend — `OrganizationsModule`** (`apps/backend/src/modules/organizations/`): nuevo módulo con `OrganizationsController` (`POST /api/orgs/me/webhook-slug/regenerate`, guard `manage Organization` → OWNER/ADMIN) y `OrganizationsService.regenerateWebhookSlug()`. Cada org puede rotar su slug independientemente; el log queda con `org=<id>` para auditoría.
- **Backend — `WapiWebhookController` org-scoped**: rutas migran de `GET/POST /api/webhooks/wapi` (URL única global) a `GET/POST /api/webhooks/wapi/:slug` (URL por org). Resolución `slug → organizationId` cacheada in-memory TTL 60 s; `verify` y `receive` filtran `WapiConfig.organizationId = orgId` antes de matchear `verify_token` o `phone_number_id`. Slug inexistente → 404 sin leak de info (slug es opaco). Cache es per-proceso; rotación tarda 60 s en converger en flota multi-instancia.
- **Backend — `GET /api/wapi/configs/:id/reveal-secrets`**: endpoint protegido por `manage Organization` que devuelve `{ webhookVerifyToken }` en claro para que el usuario lo pegue en la consola de Meta. Logueado con `WARN` (org/user/config) para auditoría.
- **Backend — Slug en bootstrap**: `ClerkWebhookService.handleOrganizationCreated` genera el slug en `create` (no en `update` para idempotencia bajo retries de Clerk).
- **shared-types — `MeOrganization.webhookSlug`**: surface del slug en `/api/me/context` para que el frontend construya la URL pública sin ida-vuelta extra.
- **Frontend — `WapiConfigsPage` card webhook** (`apps/frontend/src/features/wapi/configs/WapiConfigsPage.tsx`): card top-level con la URL completa (`{API_BASE_URL}/api/webhooks/wapi/{slug}`), botón copiar, y botón **Regenerar URL** (sólo OWNER/ADMIN, con confirm destructive — el usuario tiene que actualizarla en Meta tras rotar). Por fila: botón llave para revelar/ocultar el verify token + botón copiar.
- **Tests** — `wapi-webhook.controller.spec.ts` reescrito (16 tests): scoping por slug en verify y receive, slug inexistente → 404, cache TTL (segunda llamada no re-consulta organization), multi-config misma org, firma inválida → 403, modos dev sin appSecret, payloads ignorados (object distinto, sin phone_number_id), JSON inválido → 400.

#### Why
- Antes: una URL global `/api/webhooks/wapi` para todo el SaaS — válida porque resolvíamos por `phone_number_id`, pero dejaba la puerta abierta a colisiones cuando dos orgs comparten App de Meta o cuando un número se mueve entre apps. También impedía rotación de la URL ante leaks.
- Ahora: cada org tiene su URL, su slug se puede rotar sin afectar a otras orgs, y el reveal del verify token está controlado por policy explícita.

### 4.J — Live Dashboard WAPI

#### Added
- **Backend — `WapiLiveService`** (`apps/backend/src/modules/wapi/live/wapi-live.service.ts`): aggregator del snapshot vivo. Método único `snapshot()` que paraleliza tres `Promise`:
  - `collectCampaigns(since5min)` — `findMany` campañas con `status IN [PROCESSING, PAUSED]` (top 25 ordenado por status/sentAt/createdAt), luego dos `groupBy` paralelos sobre `WapiReport`: totales por (campaignId, status) y throughput de los últimos 5 min. Devuelve por campaña: totals (PENDING/SENT/DELIVERED/READ/FAILED/CANCELED), total agregado, throughput, configName, templateName, startedAt.
  - `collectConfigs(since24h)` — `findMany` configs activas, `groupBy` SENT en 24 h con filtro relacional `campaign.configId IN […]`. Como `groupBy` no agrupa por relaciones, hace un segundo `findMany` para mapear `campaignId → configId`. Devuelve por config: sentLast24h, percent (cap a 100, mismo cómputo que el worker — sin drift), isTestMode.
  - `collectInbox()` — 3 `count` paralelos (UNASSIGNED+escalated, WAITING, escalated total) + `findFirst` de la más antigua sin asignar.
- **Backend — `WapiLiveController`** (`apps/backend/src/modules/wapi/live/wapi-live.controller.ts`): expone `GET /api/wapi/live/snapshot`. Guards `ClerkAuth + TenantContext + Policies(read Campaign)`. Devuelve `LiveSnapshot { campaigns, configs, inbox, generatedAt }`.
- **Backend — Spec `wapi-live.service.spec.ts`** (4 tests): snapshot vacío (3 counts + findFirst en cero), totales por campaña con throughput, percent de configs cap a 100, inbox con 3 counts + más antigua. **478/478 backend tests verde**.
- **Frontend — Página `/dashboard/wapi/live`** (`apps/frontend/src/features/wapi/live/WapiLivePage.tsx`): tres widgets en stack vertical:
  - **Campañas en curso** — tabla con nombre, línea, template, estado, total, funnel (LinearProgress + chips P/S/D/R/F), throughput 5 min, link a detalle.
  - **Uso de líneas (24 h)** — barra de progreso por config con color por umbral (`<80%` success / `80-99%` warning / `100%` error), badge TEST, contador `sent/dailyLimit`.
  - **Inbox snapshot** — 3 KPI cards (sin asignar + edad de la más antigua, en espera, escaladas totales) + link al inbox.
  - **Tiempo real**: chip "● En vivo" cuando socket conectado. Re-fetch debounced (500 ms) ante eventos `wapi.report.updated`, `wapi.report.log`, `wapi.conversation.updated` — coalesce vía `inFlightRef + pendingRef` para no apilar requests.
- **Frontend — `liveApi`** (`features/wapi/live/api.ts`) + types mirror del backend (Date como string ISO).
- **Frontend — Sidebar/Routing**: entry "Dashboard live" (`MonitorHeartIcon`) primero del grupo WhatsApp; ruta `wapi/live` registrada en `App.tsx`.

#### Notes
- No se agregaron eventos socket nuevos: la página usa los emitters existentes del worker, campañas e inbox (`wapi.report.updated`, `wapi.report.log`, `wapi.conversation.updated`). El re-fetch del snapshot agregado mantiene la complejidad acotada — para datos por campaña fina se sigue usando `WapiCampaignDetailPage`.
- `groupBy` con `Promise.all` + cast `as Promise<…>` rompía la inferencia de Prisma (intentaba el overload de array). Patrón adoptado: separar awaits y castear el resultado, no la promise.

### 4.O.6 — Suspensión del bot + estado WAITING (handoff humano completo)

#### Added
- **Schema Prisma — `WapiConversation`** (`packages/prisma/prisma/schema.prisma` + migración `20260510120000_wapi_bot_suspension_waiting`): nuevos campos `escalated: Boolean @default(false)` (visibilidad en inbox), `botSuspended: Boolean @default(false)` (guard de engine), `waitingUntil: DateTime?` (TTL del estado WAITING), `lastAssignedUserId: String?` (auditoría "lo tenía X" tras put-on-hold). Nuevo valor `WAITING` en enum `WapiConversationStatus`. **`WapiConfig`** gana `botWaitingTtlMin: Int @default(120)` (TTL configurable por config).
- **Engine guard inicial** (`wapi-bot-engine.service.ts → handle()`): primera query es `findUnique({ select: { botSuspended: true } })`. Si `botSuspended === true`, retorna `{ handled: false }` antes de tocar nada. Una sola conversación con humano nunca dispara el bot — sin importar qué keyword, payload o estado de sesión llegue.
- **HANDOFF marca + reabre** (`runChain` con node HANDOFF): ahora setea `escalated: true, botSuspended: true` y, si la conversación estaba `RESOLVED`, la reabre (`status: UNASSIGNED, resolvedAt: null, assignedUserId: null`). Único path que vuelve a sacar una RESOLVED del archivo. Test cobertura: spec verifica que mensaje del cliente con escalation handoff levanta los tres flags + reopens si estaba resolved.
- **Webhook detecta WAITING** (`wapi-webhook.service.ts → process()`): si el cliente vuelve a escribir y `existing.status === 'WAITING'`, transición automática a `UNASSIGNED` + `waitingUntil: null`. El cliente "des-escala" su propio espera.
- **Button INBOX setea bot-off** (`button-actions/wapi-button-action.service.ts → applyInboxPriority`): además de `priority: true`, ahora marca `escalated: true, botSuspended: true`. Coherente con HANDOFF — cualquier ruta que pone la conversación en cola humana suspende el bot.
- **Inbox service — filtro escalated uniforme** (`wapi-inbox.service.ts → listConversations`): TODAS las queries del inbox filtran `escalated: true` (cross-rol incluyendo admin — no hay back-door). El bot puede manejar conversaciones automáticas sin que aparezcan en la cola humana hasta que se escalen explícitamente.
- **Inbox service — tab "Mías" con WAITING incluido**: el `mine` tab usa `OR([{ assignedUserId: me, status: ASSIGNED }, { lastAssignedUserId: me, status: WAITING }])`. El operador ve sus conversaciones activas y las que él puso en espera (chip "lo tenías vos"). Búsqueda combina con AND sobre el OR.
- **Inbox service — `assign` / `take` setean bot-off**: además de cambio de status, ahora `botSuspended: true, escalated: true, waitingUntil: null, lastAssignedUserId: userId`. `unassign` limpia `waitingUntil`. `resolve` apaga `botSuspended` y `waitingUntil` (mantiene `escalated` para que aparezca en tab Resueltas). `reopen` reactiva `botSuspended`.
- **Endpoint `POST /api/wapi/inbox/conversations/:id/hold`** (`wapi-inbox.controller.ts → hold`, service → `putOnHold`): "Poner en espera" — pre-condición `status === ASSIGNED`. Calcula `waitingUntil = now + cfg.botWaitingTtlMin*60000`, setea `status: WAITING, lastAssignedUserId: assignedUserId, assignedUserId: null`. Emite `wapi.conversation.updated` con `waitingUntil`. Política CASL `update Conversation`.
- **Worker `WapiBotWaitingExpirerService`** (`bot/wapi-bot-waiting-expirer.service.ts`, registrado en `WapiModule`): setInterval cada 5 min, **no usa `prisma.scoped`** (corre cross-tenant — el filtro `status: 'WAITING' AND waitingUntil < now` es DB-level safe). `findMany` (take: 200) + updates individuales (necesita `teamId/configId/phone` para emitir socket por team). Multi-instance safe: dos workers compitiendo en la misma transacción no duplican (el segundo no encuentra filas), aunque eventos pueden duplicarse — frontend dedupea por `id`. `timer.unref()` para no bloquear procesos. Spec cobertura: 4 tests (no-op vacío, expira N filas, fallo individual no aborta el batch, lifecycle init/destroy).
- **Frontend — types + API**: `WapiConversationStatus` ahora incluye `'WAITING'`; `WapiConversationListItem`/`WapiConversationDetail`/`WapiConversationUpdatedEvent` ganan `waitingUntil: string | null` y `lastAssignedUserId: string | null`. `inboxApi.hold(api, id)` calls `POST /conversations/:id/hold`.
- **Frontend — `ConversationHeader`**: botón "Poner en espera" (`PauseCircleOutlineIcon`, color warning) visible **solo** cuando `isMine` (assignedUserId === currentUserId AND status === ASSIGNED). `StatusChip` para WAITING usa `HourglassBottomIcon` con countdown vivo (`useCountdown` interno con tick cada 30s — precision a segundos no aporta). Si `lastAssignedUserId === currentUserId` durante WAITING, chip extra "lo tenías vos".
- **Frontend — `WapiInboxPage`**: `handleHold` action; `onUpdated` reducer propaga `waitingUntil` y `lastAssignedUserId` desde el evento socket a items y conversation activa.
- **Frontend — `ConversationList`**: chip "En espera" (warning + `HourglassBottomIcon`) en filas con `status === 'WAITING'`, espejando el patrón del chip "Resuelta".
- **Frontend — `WapiSimulatorChatPage`**: pasa `onHold` al `ConversationHeader` para mantener paridad con el inbox real.

#### Tests
- **Backend 474/474 verde**: 5 nuevos en `wapi-inbox.service.spec.ts` (filtro escalated uniforme, assign setea flags, resolve apaga botSuspended manteniendo escalated, putOnHold happy path, putOnHold rechaza non-ASSIGNED), 4 nuevos en `wapi-bot-waiting-expirer.service.spec.ts`, 1 spec ajustado en `wapi-button-action.service.spec.ts` (INBOX ahora también setea escalated+botSuspended). Fix lateral en `me.service.spec.ts`: añadido mock de `ConfigService` (dependencia añadida en sesión previa que rompía un spec pre-existente).

### 4.O.5 — Nodo SET_VAR (asignación interna de variables)

#### Added
- **Tipo `BotSetVarNode`** (backend + frontend): nuevo `kind: 'SET_VAR'` con `varName`, `value: string|number|boolean`, `nextNodeId?` y `gotoTopic?`. **Nodo interno**: no produce mensaje al usuario — sólo asigna `session.data[varName] = value` y avanza al siguiente nodo en la misma vuelta del chain (counted vs `BOT_MAX_AUTO_CHAIN`).
- **Coerción por tipo declarado** (`bot-flow-runtime.ts → applySetVar`): si la variable está declarada en `botVariables`, se coerce al tipo (`number → Number()`, `boolean → ['true','1','yes','si','sí']`, `string → String()` con interpolación `{{otraVar}}`). Si no está declarada, se guarda raw (con interpolación si es string). Centralizado para que engine y sandbox compartan exactamente la misma semántica.
- **Validación** (`wapi-bot.types.ts.validateBotFlow` + `validateClient.ts`): regex de `varName`, type del `value`, finitud del number, exigencia de `nextNodeId | gotoTopic`. SET_VAR queda excluido del check de `text` requerido. `inferImplicitVariables` ahora también escanea `SET_VAR.varName` para sugerir declarar.
- **Engine + Sandbox** (`wapi-bot-engine.service.ts`, `wapi-bot-sandbox.service.ts`): handler en el chain loop después de CONDITION (`applySetVar` + cambio de topic vía `gotoTopic` o `nextNodeId`). `deliverNode`/`buildOutMessage` defensivamente devuelven `null` para SET_VAR (no emite mensaje). 2 specs nuevos en `wapi-bot-engine.service.spec.ts` (interpolación + coerción a number) — 80→82 verdes.
- **Frontend — `SetVarNodeView`** (`nodeViews.tsx`): card visual con header gris + `FunctionsIcon`, borde dashed, chip "interno", muestra `{{varName}} = "valor"` en monospace y warning "sin salida" si no hay destino. Handle de entrada (target) y salida (source/`next`).
- **Frontend — `SetVarEditor`** (`NodeEditorDrawer.tsx`): Select de variables declaradas con `VariableNameField` + input de valor que cambia según el tipo declarado: `number → TextField type="number"` (no deja escribir letras), `boolean → Switch true/false`, `string|undeclared → VarPickerTextField` con interpolación `{{var}}`. Cambiar la variable seleccionada coerce el valor existente al tipo nuevo. Destination con `NextOrTopicSelect` (nodo o gotoTopic).
- **Toolbar + addNode + flowLayout**: botón "SET VAR" en la palette (icono `FunctionsIcon`), `defaultNodeFor('SET_VAR')` con `varName: '', value: ''`, `nodeIdPrefix → 'set'`. Edge gris dashed renderizada para SET_VAR.next, integrado en `disconnectEdges`/`onConnect`/`rewriteGotoTopic`/auto-rewire on delete y `nodeHeight` en `flowLayout.ts`.

### 4.O.4 — Variables declarativas en el bot

#### Added
- **Tipos `BotVariable` + validación** (`wapi-bot.types.ts`): tipos válidos `string|number|boolean`, regex de nombre `^[a-zA-Z_][a-zA-Z0-9_]*$`, unicidad, type-match del `defaultValue`. Helper `inferImplicitVariables` escanea `CAPTURE.saveAs`, `CONDITION.var` y named groups `(?<name>...)` en template-payload patterns para sugerir variables a declarar. Refs `{{var}}` no declaradas siguen funcionando (compat) — sólo aparecen como **warning** en `validateBotConfig` (no bloquean publish).
- **Migración `20260509100000_wapi_bot_variables`**: agrega `botVariables` (jsonb) y `botVariablesDraft` (jsonb) a `WapiConfig`. Aplicada con `npx prisma migrate deploy`.
- **Persistencia draft+publish** en `WapiBotService` (`saveDraft`/`publish`/`discardDraft`/`update`) — mismo patrón draft↔activo que topics+router.
- **`bot-flow-runtime.ts`**: helper `variableDefaults` derivado del array de variables, expuesto en `ResolvedFlow`. Usado por engine y sandbox para sembrar `data` al iniciar sesión.
- **Defaults aplicados al iniciar sesión** en los 3 sites del engine (`wapi-bot-engine.service.ts`) y los 4 sites del sandbox (`wapi-bot-sandbox.service.ts`): `data = { ...variableDefaults, ...seedData }`. El `seedData` del router-restart (template-payload named groups o explicit) sobreescribe el default si lo definió.
- **Frontend — `VariablesPanel.tsx`**: panel CRUD con tabla (name + type Select + description + default editor por tipo), header con count y botón "Importar N implícita(s)" que crea declaraciones para todas las refs detectadas en topics/router. Quick-add row arriba para agregar variables sin abrir modal.
- **Frontend — `VarPickerTextField.tsx`**: wrapper de MUI TextField con adornment `{ }` (DataObjectIcon) que abre un menú con las variables declaradas (muestra type + description) e inserta `{{name}}` en la posición actual del cursor vía `selectionStart`/`selectionEnd`. Aplicado en MESSAGE/MENU/HANDOFF/CAPTURE.text + MEDIA.caption.
- **Frontend — `VariableNameField`** (en `NodeEditorDrawer`): Select con todas las variables declaradas + opción "Otra…" que cae a un TextField libre para nombres ad-hoc. Aplicado en `CAPTURE.saveAs` y `CONDITION.when.var` (los dos lugares donde el flow *escribe* a una variable).
- **`validateClient.validateVariables`**: paridad client-side de la validación del backend (regex, type, type-match del default, unicidad). Errores se ven en el badge "Variables (N) ⚠" del header de `TopicsListView` y en el Alert del editor.
- **Wiring en `WapiBotsPage`**: nuevo `view = 'variables'` con breadcrumb + warning Alert + tip propios; botón Variables en `TopicsListView` con badge de errores; `botVariables` incluido en payload de `saveDraft`. `BotConfigSnapshot`, `UpdateBotPayload`, `SaveBotDraftPayload` y `materialize/discard` cargan `botVariablesDraft ?? botVariables`.

### 4.O.3 — Sandbox + Draft/Publish workflow (Block 3 — UI sandbox panel)

#### Added
- **`SandboxDrawer.tsx`**: drawer lateral (estilo WhatsApp) que corre el bot del config seleccionado en el sandbox. Llama a `POST /api/wapi/configs/:id/bot/sandbox/step` con `phone` (persistido en localStorage) y `source: 'draft'|'published'` (toggle). Renderiza burbujas user/bot, expande media (caption + tipo), muestra botones interactivos (sólo el último mensaje los habilita para evitar respuestas a menus viejos), chip por mensaje con `topicId · nodeId`, banner del `sourceUsed` y de la sesión actual, alerta cuando el flow es `unavailable`. Reset session button. **No toca Meta** — el indicador "Fuente: draft/published" hace explícito qué versión se está probando.
- **Toolbar de `WapiBotsPage` rediseñada**: 4 acciones — "Probar" (abre `SandboxDrawer`), "Descartar" (sólo visible con `hasUnpublishedChanges`, devuelve a la versión publicada), "Guardar borrador" (persiste topics+router en draft via `saveDraft`; aplica `botEnabled`/`botSessionTtlMin` en paralelo via `update()` si cambiaron — knobs runtime, no contenido), "Publicar" (deshabilitado sin draft o con errores; muestra confirm con resumen "Publicado actual: X temas/Y rules vs Borrador a publicar: X temas/Y rules"). Badge "Sin publicar" / "Publicado" con timestamp tooltip refleja el estado del snapshot.
- **`materializeTopics` prefiere `botTopicsDraft`** sobre `botTopics`: el editor abre siempre con el último estado del borrador (no se pierden cambios sin publicar al recargar). Mismo fallback al cargar el router (`botRouterDraft ?? botRouter`).
- **`botApi` extendido** con `saveDraft`, `publish`, `discardDraft`, `sandboxStep`. Tipos `BotConfigSnapshot` con campos draft + `SaveBotDraftPayload`, `SandboxStepRequest`, `SandboxStepResponse`, `SandboxOutMessage`, `SandboxSource`, `SandboxInbound` espejan el backend.

### 4.O.3 — Sandbox + Draft/Publish workflow (Block 2 — sandbox engine)

#### Added
- **`bot-flow-runtime.ts`**: módulo de helpers puros reusable. Extraídos del engine `resolveTopics`, `handleCapture`, `pickConditionBranch`, `matchesBranch`, `parseHHMM` + tipos `BotData` / `ResolvedFlow`. Garantiza que el sandbox interpreta exactamente la misma lógica que prod (un bug en uno se reproduce en el otro). El engine ahora importa desde acá; cambio sin impacto observable (74→74 specs verdes post-refactor).
- **`WapiBotSandboxService`** + endpoint `POST /api/wapi/configs/:id/bot/sandbox/step`. Corre `botTopicsDraft ?? botTopics ?? botFlow` en memoria — no toca Meta ni la DB de sesiones/mensajes. Sesión per `(orgId, configId, userId, phone)` con TTL lazy 30 min y cap de 10k sesiones por proceso. Mismo comportamiento que el motor de prod: router-restart para keyword/template-payload, CAPTURE con validación preset/regex, MENU con buttons (botoneras de hasta 3), MEDIA, MESSAGE/HANDOFF, CONDITION en memoria, chain con `BOT_MAX_AUTO_CHAIN`. Devuelve `{ messages, session, sourceUsed, unavailable?, errors? }`.
- **`SandboxStepDto`** (phone obligatorio, `inbound: text|button` opcional, `reset` / `resetOnly` para limpiar sesión, `source: 'draft'|'published'` con default `'draft'`).
- **Aislamiento multi-tenant verificado**: la key incluye `organizationId`, así dos orgs distintas que ejecuten sandbox con el mismo `configId` y `phone` numérico no colisionan. Cada user tampoco ve la sesión de otro user de la misma org.
- **Tests `wapi-bot-sandbox.service.spec.ts` (+6)**: usa draft cuando existe, `source=published` lo sobreescribe, CAPTURE inválido reentrega el mismo nodo, `reset: true` limpia, aislamiento entre orgs, `unavailable=true` cuando no hay nada que correr. Total bot tests: **80 ✅**.

### 4.O.3 — Sandbox + Draft/Publish workflow (Block 1 — backend draft persistence)

#### Added
- **Migración `20260508140000_wapi_bot_draft_publish`**: agrega 4 columnas a `WapiConfig` — `botTopicsDraft` (jsonb), `botRouterDraft` (jsonb), `botDraftUpdatedAt` (timestamp), `botPublishedAt` (timestamp). El motor de prod sigue ejecutando `botTopics` / `botRouter`; el draft vive aparte para que el editor visual pueda salvarse sin tocar la versión publicada.
- **`WapiBotService.saveDraft(configId, dto)`**: persiste topics+router en las columnas `*Draft` con la misma validación que `update()`. Al guardar, sella `botDraftUpdatedAt = now`. Si sólo se manda router, valida refs contra topics del draft (o de prod como fallback). NO toca la versión publicada.
- **`WapiBotService.publish(configId)`**: copia `botTopicsDraft` → `botTopics`, `botRouterDraft` → `botRouter`, limpia las columnas de draft, sella `botPublishedAt`. Re-valida la coherencia draft↔refs como defensa adicional. 400 si no hay draft o si el draft es inválido.
- **`WapiBotService.discardDraft(configId)`**: limpia las 3 columnas de draft (topics/router/updatedAt). La versión publicada queda intacta.
- **`BotConfigSnapshot` extendido** con `botTopicsDraft`, `botRouterDraft`, `botDraftUpdatedAt`, `botPublishedAt`, `hasUnpublishedChanges` (true si `botDraftUpdatedAt > botPublishedAt` o si nunca se publicó).
- **Endpoints nuevos** en `WapiBotController` (reusan permisos `WapiConfig:read|update`):
  - `PATCH /api/wapi/configs/:id/bot/draft` — `SaveBotDraftDto` (botTopics?, botRouter?).
  - `POST /api/wapi/configs/:id/bot/publish`.
  - `POST /api/wapi/configs/:id/bot/discard-draft`.
- **Tests del servicio** (`wapi-bot.service.spec.ts`, +6 specs): saveDraft no toca prod, publish copia y limpia, discardDraft borra sólo el draft, `hasUnpublishedChanges` con timestamps, publish bloquea si router del draft referencia un topicId que no existe, publish falla sin draft.

### 4.O.2 — UI multi-topic + Router en el editor visual

#### Fixed
- **Router-restart por keyword/template-payload** (`wapi-bot-engine.service.ts` + `wapi-bot-router.service.ts`): un match explícito de keyword o template-payload ahora **interrumpe la sesión activa** y arranca el topic resuelto (mismo patrón que el botón BOT — "el inbound nuevo siempre gana"). Antes la sesión vieja bloqueaba el match: si el cliente había llegado a un nodo terminal (ej. MESSAGE sin next), cualquier inbound de texto reactivaba el topic actual desde su startNode en lugar de evaluar el router. Los matches `default` y el `defaultTopicId` (catch-all) NO interrumpen — sólo se evalúan si la sesión no procesa el inbound. El reason de cierre es `router-restart`. `BotRouterResolution` ahora trae `via: 'keyword'|'template-payload'|'default'|'fallback'`. +2 specs (override sesión activa + fallback no interrumpe MENU).
- **Sesión inválida resetea local var**: en el branch `invalid-state` (current node no es MENU/CAPTURE), el motor ahora setea `session = null` después de cerrarla, así el branch siguiente puede correr el router (antes el const seguía truthy y caía al fallback "restart current topic").

#### Changed
- **`KeywordEditor` (RouterPanel.tsx)**: reemplazado el textfield multilínea con split por coma/newline por **MUI Autocomplete `multiple freeSolo`** — el usuario tipea cada keyword/frase y Enter lo agrega como chip. Acepta espacios sin ambigüedad (frases tipo "buen día" funcionan), dedupe case-insensitive automático. Antes: separar por coma forzaba a evitar espacios o causaba que frases multi-palabra se confundieran con la convención de delimitador.

#### Added
- **Vista lista de temas** (`TopicsListView.tsx`) como entry-point de `/dashboard/wapi/bots`. Tabla con columnas Nombre / ID (monospace) / Nodos / Estado (✓ válido o ⚠ N error(es)) / Acciones, **buscador por nombre o ID**, badge ⭐ para el `defaultTopicId` del router, empty-state con CTA "Crear tema". Botones de header: "Router (N)" y "Nuevo tema". Acciones por fila: **"Editar flow"** (entra al canvas), renombrar y eliminar (deshabilitado si queda 1 solo topic). Reemplaza la fila de tabs scrollable que no escalaba a 40-50 topics — feedback del usuario.
- **Vista canvas y vista router** ahora se navegan vía breadcrumb ("← Temas / [topic name]" o "← Temas / Router") en lugar de tabs. La página es un state machine `view: 'list' | 'topic' | 'router'`. Volver a la lista descarga el canvas hasta reentrar (mejor performance con muchos topics).
- **`TopicDialog.tsx`** — modal MUI para crear/renombrar topics con validación visual (label requerido <60ch, id `^[a-zA-Z0-9_-]+$`, unicidad). Reemplaza los `window.prompt` previos.
- **Tabs por topic** ~~en `/dashboard/wapi/bots` (`WapiBotsPage.tsx`)~~ → reemplazado por lista. Cada `BotTopic` se gestiona ahora desde la tabla. Botones para **agregar** (modal), **renombrar** (modal con cross-rewrite de `gotoTopic` y `BotRouterRule.topicId`) y **eliminar** topic. Filas marcan ⚠ + count de errores si el topic no valida.
- **Tab "Router"** dedicado (`RouterPanel.tsx`): editor de `BotRouterRule[]` con reorder up/down (la 1ª que matchea gana), agregar/eliminar y selector de tema destino. Tipos:
  - `template-payload`: textfield regex + preview de **named groups** (`(?<varName>...)` se listan como chips `{{varName}}`) + validación regex en vivo.
  - `keyword`: textfield multilínea (separador `,` o `\n`) que renderiza chips por keyword.
  - `default`: sólo selector de tema.
  - Selector global `defaultTopicId` (fallback si nada matchea).
- **Selector "Saltar a tema" en cada destino del drawer** (`NodeEditorDrawer.tsx` → `NextOrTopicSelect`): grupos *Nodos del flow actual* + *Saltar a otro tema*, mutuamente excluyentes (encoding interno `node:<id>` / `topic:<id>`). Aplicado en MENU.options, MESSAGE, CAPTURE.next, MEDIA, CONDITION.branches y CONDITION.else. `CAPTURE.retry` queda solo-nodo (sin gotoTopic, intencional — el retry siempre se queda en el topic actual).
- **Backward compat al cargar**: si la cfg trae sólo `botFlow` (legacy 4.N), se materializa como `[{id:'default', label:'Principal', flow}]`. Save consolida siempre `botTopics + botRouter` y manda `botFlow: null` para obsoletar el legacy.
- **Validación cliente cross-topic** (`validateClient.ts`):
  - `validateClient(flow, topicIds?)` — extiende validador de 4.N para aceptar `gotoTopic` como alternativa a `nextNodeId` en cada salida; si se pasan `topicIds`, chequea que los `gotoTopic` referencien topics existentes.
  - `validateTopics(topics)` — valida shape de cada topic (id format, label, no duplicados) + corre `validateClient` por flow con cross-check global.
  - `validateRouter(router, topicIds)` — regex compila, keywords no vacías, topic destino existe, advertencia si hay >1 rule kind `default`.
  - El banner de errores se filtra al contexto activo (topic en vista canvas o router en vista panel) para no abrumar.
- **Tipos frontend** (`types.ts`): `BotTopic`, `BotRouter`, `BotRouterRule`, `BotRouterRuleKind`, `gotoTopic` opcional en cada nodo con destino, `elseGotoTopic` en CONDITION. `BotConfigSnapshot` y `UpdateBotPayload` extendidos con `botTopics` + `botRouter`.

#### Changed
- **Save bloquea ON** si `topicsValidation` o `routerValidation` reportan errores — antes sólo bloqueaba por flow inválido.
- **`onConnect`** (drag desde handles): cuando se conecta a un nodo, se limpia el `gotoTopic` del mismo destino para evitar estados híbridos. La elección entre nodo o topic se hace por el drawer, no drag-and-drop.
- **`rfEdges`** ya no renderiza arrows para destinos `gotoTopic` — sólo intra-topic. Los inter-topic se ven en el chip del nodo (próxima iteración: badge visible en el view).

#### Tests
- No se agregan tests nuevos en esta sub-fase (UI). Typecheck `apps/frontend` + `apps/backend` = verde.

### 4.O.1 — Multi-topic + Router + Feature flag (env + per-org)

#### Added
- **Multi-topic en cada `WapiConfig`** — un bot ahora puede tener varios "temas" (`BotTopic { id, label, flow }`) en `WapiConfig.botTopics: BotTopic[]`. Cada topic tiene su propio `BotFlow` (con start node y nodos `MESSAGE/MENU/CAPTURE/MEDIA/CONDITION/HANDOFF`). Schema `WapiBotSession.currentTopicId: String?` para saber en qué topic está la sesión.
- **Router declarativo** (`WapiConfig.botRouter: BotRouter`): `rules[]` ordenadas con `{ kind: 'template-payload' | 'keyword' | 'default', topicId }`. La primera que matchea gana. `defaultTopicId` como atajo si no hay match.
  - **`template-payload`**: regex contra el payload del botón de un template. Acepta named capture groups que se inyectan en `seedData` y se mergean a `session.data` al iniciar el topic. Ej `^OFERTA_(?<producto>\w+)_(?<plan>\d+)$` matchea `OFERTA_HOSTING_99` → `seedData={producto:'HOSTING',plan:'99'}` accesibles en MESSAGE/CAPTURE como `{{producto}}`.
  - **`keyword`**: lista de strings; match exacto case-insensitive y trimmeado contra `text` inbound. No matchea sustrings.
  - **`default`**: matchea siempre, último recurso.
- **Inter-topic calls (`gotoTopic`)** — todos los nodos que originalmente apuntaban a `nextNodeId`/`retryNodeId`/`branches[].nextNodeId`/`elseNextNodeId` ahora aceptan también `gotoTopic: '<topicId>'`. Cuando el motor encuentra un `gotoTopic`, cambia de topic y arranca por el `startNodeId` del topic destino. Permite armar bots compuestos sin un solo flow gigante.
- **Botón `BOT` en `WapiButtonAction`** — junto a `INBOX`/`BAJA`/`IGNORAR`. Cuando un template lleva un botón con action `BOT` y payload, el webhook llama al router con ese payload (kind `template-payload`); si matchea un topic, abre/reabre la sesión bot en ese topic con `seedData`. **Payload nuevo siempre gana**: si ya había sesión activa, se cierra (`endedReason='router-restart'`) y se arranca limpio en el nuevo topic.
- **Feature flag de dos niveles**:
  - `WAPI_BOT_FEATURE_ENABLED` (env, kill-switch global). Default `false` en prod por seguridad.
  - `Organization.botEnabled: Boolean @default(false)` (per-org grant — pensado como add-on de plan superior; se habilita manualmente con SQL hasta que esté el módulo de billing).
  - **AND lógico**: ambos en `true` para que el feature funcione. Si falla cualquiera, el motor no intercepta inbounds, los endpoints `/api/wapi/configs/:id/bot/*` devuelven `403 Forbidden`, y la UI oculta el item "Bot guiado" del sidebar.
- **`WapiBotFeatureService`** (`apps/backend/src/modules/wapi/bot/wapi-bot-feature.service.ts`): expone `isEnvEnabled()`, `isOrgEnabled(orgId)`, `isEnabled(orgId?)`, `assertEnabled(orgId?)` (lanza `ForbiddenException`). Detecta el `organizationId` del `TenantContext` si no lo recibe. Guard `WapiBotFeatureGuard` aplicado al `WapiBotController`.
- **`WapiBotRouterService`** (`apps/backend/src/modules/wapi/bot/wapi-bot-router.service.ts`): `resolve(router, input) → { topicId, seedData } | null`. Maneja regex inválida silenciosa (rule se ignora), kinds incompatibles (keyword vs template-payload), y caída a `defaultTopicId` si no hay match.
- **`/me/context.organizations[].features`** — nuevo objeto `OrgFeatureFlags { bot: boolean }` con AND de env+org. Lo usa el frontend para gating UI sin hardcodear lógica del lado cliente.
- **Frontend env mirror**: `VITE_WAPI_BOT_FEATURE_ENABLED` para el sidebar (oculta "Bot guiado" si está off — el gating per-org se enforce desde backend con 403). Ambas deben estar `true` para que la UI exponga el feature.

#### Changed
- **`WapiBotEngineService.handle`** — refactor mayor:
  - Gate inicial via `featureService.isEnabled(orgId)`. Si está off, retorna `{ handled: false }` (deja pasar al webhook como si no hubiera bot).
  - `resolveTopics(cfg)` materializa los topics: si `botTopics` está poblado, los usa tal cual; si sólo hay `botFlow` (legacy 4.N), lo wrappea como `topics: { default: { id:'default', flow } }` y sintetiza un router `{ defaultTopicId: 'default' }` — backward compat full.
  - `text` sin sesión → `routerService.resolve(router, { kind:'text', text })`. Si matchea, abre sesión en `currentTopicId` con `seedData`. Si no matchea y hay `defaultTopicId`, va ahí. Si nada matchea, no responde.
  - `followGoto(gotoTopic, nextNodeId, currentTopicId, resolved)` — helper que convierte cualquier salida de nodo (puede ser `gotoTopic` o `nextNodeId` del topic actual) en `{ topicId, nodeId }` para el siguiente paso del chain.
  - `runChain()` extrae el bucle de auto-chain (cap 8) y soporta `gotoTopic` en MESSAGE/MEDIA + CONDITION branches + CAPTURE next/retry + MENU options.
  - `pickConditionBranch` ahora retorna `{ nextNodeId?, gotoTopic? }` (no sólo string).
  - `startTopic(cfg, conversationId, phone, topicId, seedData)` — método público que cierra la sesión activa (si hay) y arranca el chain en el `startNodeId` del topic destino. Usado por el webhook para BOT button action.
- **`WapiWebhookService`** — antes de delegar al engine, chequea `featureService.isEnabled()`. `handleButtonAction` extendida con BOT action: parsea `botRouter` desde la cfg, llama `routerService.resolve()` con el `buttonId` como `template-payload`, y si matchea, llama `botEngine.startTopic(...)`. Si no matchea, fall-through al engine como text inbound vacío.
- **`WapiButtonActionService`** — `BUTTON_ACTIONS` ahora incluye `'BOT'`. La acción BOT en `apply()` sólo loggea (la dispatch real está en el webhook para evitar circular import con el engine).
- **`WapiBotService.update`** — valida `botTopics` primero (con `validateBotTopics`), después `botRouter` con el set de `topicIds` (usa los del patch si vienen, sino lee los existentes para cross-check). Enable guard relajado: acepta `botFlow` (legacy) **o** `botTopics` (nuevo).

#### Schema
- Migración `20260508100000_wapi_bot_topics_and_org_feature_flag` aplicada vía SQL directa (psql/WSL — DLL lock en Windows):
  ```sql
  ALTER TABLE "Organization" ADD COLUMN "botEnabled" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "WapiConfig" ADD COLUMN "botTopics" JSONB, ADD COLUMN "botRouter" JSONB;
  ALTER TABLE "WapiBotSession" ADD COLUMN "currentTopicId" TEXT;
  ```

#### Tests
- `wapi-bot-router.service.spec.ts` (9): template-payload con/sin named groups, keyword case-insensitive exacto, kinds incompatibles, default rule, atajo `defaultTopicId`, primer match gana, regex inválida ignorada, router null → null.
- `wapi-bot-feature.service.spec.ts` (7): env off, org off, ambos on, sin contexto tenant (defensive false), `assertEnabled` lanza `ForbiddenException`, `assertEnabled` pasa cuando ambos on.
- `wapi-bot-engine.service.spec.ts`: constructor extendido con mocks de `feature` (`isEnabled.mockResolvedValue(true)`) y `router` (`resolve.mockReturnValue(null)`) — todos los tests anteriores siguen pasando.
- 5/5 specs `wapi-bot/*` ✅, 66/66 tests pasando.

#### Cómo activarlo
1. **Aplicar la migración** (ya aplicada en dev local):
   ```sql
   -- Las columnas ya están creadas. Para habilitar tu org:
   UPDATE "Organization" SET "botEnabled" = true WHERE id = '<tu-org-id>';
   ```
2. **Variables de entorno** (`.env`):
   ```
   WAPI_BOT_FEATURE_ENABLED=true
   VITE_WAPI_BOT_FEATURE_ENABLED=true
   ```
3. **Reiniciar dev server** (backend + frontend).
4. **Verificar**: ir a `/dashboard/wapi/bots` (debe aparecer "Bot guiado" en el sidebar). El editor visual de 4.N.1/4.N.2 sigue funcionando con el flow legacy; el armado multi-topic + router se expone en backend (UI quedó pendiente para 4.O.2).

#### Pendiente (post-4.O.2)
- Test E2E con un template real con botón `BOT` y payload `OFERTA_X_99` → router → topic correcto.
- Badge visible en los node views cuando una salida tiene `gotoTopic` (hoy queda implícito en el drawer).

### 4.N.2 — Nodos CAPTURE / MEDIA / CONDITION + interpolación `{{var}}`

#### Added
- **Tipo de nodo `CAPTURE`** — espera la próxima respuesta de texto del usuario y la guarda en `session.data[saveAs]`. Configurable:
  - `saveAs` (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) — nombre de variable.
  - `validate` opcional: `{ kind:'preset', preset:'email'|'phone'|'number'|'any' }` o `{ kind:'regex', pattern:string }`.
  - `nextNodeId` (obligatorio) — destino tras captura válida.
  - `retryNodeId` (opcional) — destino si la validación falla; si se omite, se re-entrega el mismo prompt y se mantiene la sesión.
- **Tipo de nodo `MEDIA`** — envía media (`image|video|document|audio`) usando `sendMediaById` (reutiliza `mediaId` ya subido a Meta). Acepta:
  - `mediaId` (string) — `id` que devuelve Meta Graph al subir el binario.
  - `caption?` — sólo para image/video/document (audio no acepta caption por restricción de Meta).
  - `filename?` — recomendado para document.
  - `nextNodeId?` — auto-encadena al siguiente nodo (mismo bucle que MESSAGE).
- **Tipo de nodo `CONDITION`** — branch sin entrega (transparente al usuario). Cada `branch` tiene un `when`:
  - `{ kind:'var', var, op:'eq'|'neq'|'contains'|'matches', value }` — evalúa contra `session.data[var]`.
  - `{ kind:'time', from:'HH:MM', to:'HH:MM' }` — soporta cruce de medianoche (`22:00 → 06:00`).
  - `{ kind:'weekday', days:number[] }` — `0`=domingo … `6`=sábado, hora local del server.
  - `elseNextNodeId` (obligatorio) — fallback si ninguna rama matchea.
- **Interpolación `{{var}}`** (`bot/interpolate.ts`) — todos los textos entregables (`MESSAGE.text`, `MENU.text`, `MEDIA.caption`, `CAPTURE.text`) reemplazan `{{nombre}}` por `session.data[nombre]` antes de enviarse. Tokens sin valor colapsan a `''`. Regex restringida a identificadores válidos (`[a-zA-Z_][a-zA-Z0-9_]*`).
- **Subida de media para el editor** — endpoint `POST /api/wapi/configs/:id/bot/media` (multipart, 100MB) que invoca `WapiMediaService.uploadToMeta` y devuelve `{ mediaId, mediaType, size, mime }`. El editor visual sube el binario una sola vez y persiste el `mediaId` en el nodo MEDIA.
- **Frontend — Drawer extendido** (`NodeEditorDrawer.tsx`):
  - `CaptureEditor`: input `saveAs`, select de validación (preset/regex/none) con campo regex condicional, selects `next` y `retry (opcional)`.
  - `MediaEditor`: file picker (accept según `mediaType`) → upload → muestra `mediaId` resultante, caption (no audio), filename (document), select `next`.
  - `ConditionEditor`: lista de branches con `BranchWhenEditor` (var/time/weekday — chips de días para weekday), `else` obligatorio.
- **Frontend — Vistas custom de nodo** (`nodeViews.tsx`): `CaptureNodeView` (warning, ✓/✗ handles), `MediaNodeView` (success.dark, badge tipo + filename), `ConditionNodeView` (grey.700, un handle por branch + `else`).
- **Frontend — Toolbar** (`WapiBotsPage.tsx`): botones `CAPTURE` / `MEDIA` / `COND` antes de `HANDOFF`. MiniMap coloreado por kind. Auto-layout (dagre) recalcula `nodeHeight` por kind.
- **Schema Prisma** — `WapiBotSession.data Json? @default("{}")`. Migración `20260507120000_wapi_bot_session_data` aplicada vía SQL directa (psql/WSL — `prisma generate` falló por DLL lock en Windows).

#### Changed
- **`WapiBotEngineService.handle`** — máquina de estado:
  - `text` con `currentNodeKind=CAPTURE` → intenta validar; éxito ⇒ persiste `data` y avanza por `nextNodeId`; falla ⇒ `retryNodeId` o re-entrega prompt.
  - `text` con `currentNodeKind=MENU` → re-entrega menú (igual que antes).
  - `text` con cualquier otro estado → cierra sesión y re-arranca desde `startNodeId`.
  - El bucle `deliverChain`: `CONDITION` se evalúa con `pickConditionBranch` y continúa al destino sin entregar; `MESSAGE`/`MEDIA` con `nextNodeId` auto-encadenan.
  - Persistencia: nuevo `system.kind: 'bot-capture' | 'bot-media' | 'bot-condition'` (los tres filtran del inbox del operador junto con `bot-menu` / `bot-message`).
- **`validateBotFlow`** — valida `kind`-aware: regex compilable en CAPTURE, `HH:MM` en CONDITION-time, `days[]` 0..6 en weekday, `audio` sin caption, refs a `nextNodeId`/`retryNodeId`/`branches[].nextNodeId`/`elseNextNodeId` resuelven y no auto-referencian.

#### Tests
- `interpolate.spec.ts` (9 casos): tokens vacíos, valores ausentes, no-string casts, identificadores inválidos preservados literalmente, etc.
- `wapi-bot.types.spec.ts` (+6 casos): CAPTURE con preset email + retry, CAPTURE con regex inválida (rechazada), MEDIA audio + caption (rechazada), MEDIA con `mediaId` vacío, CONDITION con time cruzando medianoche, CONDITION con weekday vacío.
- `wapi-bot-engine.service.spec.ts` (+5 casos): CAPTURE válido → guarda data y entrega siguiente con `{{var}}` interpolado, CAPTURE inválido + retry, CAPTURE inválido sin retry re-entrega prompt, MEDIA → MESSAGE encadena, CONDITION-var con match → branch correcta + interpolación.
- 22 + 17 = 39 specs `wapi-bot/*` pasando (era 27). Frontend `tsc --noEmit` ✅.

#### Cómo probarlo
1. **Editor visual** (`/dashboard/wapi/bots`): elegí una config. Toolbar nueva con `CAPTURE`/`MEDIA`/`COND`.
2. **CAPTURE**: agregar nodo CAPTURE con `text="¿Tu email?"`, `saveAs="email"`, validate preset `email`. Conectar `✓` a un MESSAGE con `text="Gracias {{email}}"`. Marcar el CAPTURE como inicial. Guardar. Mandar texto desde un usuario externo: el bot pide email; si tipea uno inválido, re-entrega el prompt; si tipea uno válido, responde "Gracias usuario@dominio.com".
3. **MEDIA**: agregar MEDIA, elegir tipo `image`, subir un PNG (el editor llama al endpoint de upload y guarda el `mediaId`), conectar a un MESSAGE. Probar inbound — el bot envía la imagen y luego el mensaje.
4. **CONDITION-time**: armar `MENU → CONDITION (time 09:00–18:00) → MESSAGE "horario laboral" / else MESSAGE "fuera de horario"`. Probar a distintas horas (cambiando la hora del server o esperando).

### 4.N.1 — Editor visual del bot (react-flow) + nodo MESSAGE

#### Added
- **Tipo de nodo `MESSAGE`** — texto plano (sin botones). Acepta `nextNodeId` opcional: con él, el motor encadena automáticamente al siguiente nodo en el mismo inbound (`MESSAGE → MESSAGE → MENU/HANDOFF`); sin él, es terminal silencioso (la sesión queda hasta TTL). Tope `BOT_MAX_AUTO_CHAIN=8` para cortar loops accidentales.
- **`validateBotFlow` extendido** — acepta `kind: 'MESSAGE'`, valida `nextNodeId` (debe resolver, no auto-referenciar). Mensajes de error refinados.
- **`WapiBotEngineService.handle`** — ahora ejecuta un bucle de `deliverNode` hasta agotar la cadena de MESSAGE. Última node final determina sesión/end:
  - `HANDOFF` → end + escalate (igual que antes).
  - `MENU` → upsert sesión con su id.
  - `MESSAGE` terminal → upsert sesión apuntando al MESSAGE (siguiente texto del usuario re-arranca el bot).
- **Persistencia outbound** — `system.kind: 'bot-message'` para los MESSAGE del bot (filtrado del inbox del operador junto con `'bot-menu'`).
- **`BotNodePosition` + `position?` en cada nodo** — metadata del editor visual (react-flow). El motor la ignora; sólo persiste para que el flow se renderice idéntico tras recargar.
- **Editor visual con react-flow** — `WapiBotsPage.tsx` reescrito como canvas estilo draw.io:
  - Nodos custom por kind (MENU/MESSAGE/HANDOFF) con colores distintos y handle por opción (MENU) o handle único (MESSAGE).
  - Conectar arrastrando handles → setea `nextNodeId` del MENU-option o del MESSAGE.
  - Borrar edge (Delete/Backspace) → desconecta esa relación en el flow.
  - Auto-layout con dagre (rankdir=LR). Botón `AutoFixHigh` para reordenar.
  - Drag de nodos → persiste `position` en el flow JSON.
  - Toolbar full-bleed: selector de número + switch ON/OFF + TTL + botones Add MENU/MESSAGE/HANDOFF + Auto-layout + Save.
  - Drawer derecho al click sobre nodo: edita texto, opciones (MENU), nextNodeId (MESSAGE), escalate (HANDOFF), marcar como inicial, eliminar nodo (limpia referencias).
  - MiniMap, Background, Controls integrados. Snapshot del estado guardado debajo.
- **Layout** — `/dashboard/wapi/bots` agregado al `isFullBleed` de `AppLayout` (canvas a viewport completo, scroll interno).

#### Changed
- **`isBotInteractionMessage`** — ahora también filtra `system.kind === 'bot-message'` (operator no ve los MESSAGE automáticos del bot).
- **`buildPersistedContent`** — soporta MESSAGE → `{ text, system:{kind:'bot-message'} }`.

#### Tests
- `wapi-bot.types.spec.ts` (+5 casos): MESSAGE con nextNodeId válido, MESSAGE terminal, MESSAGE con nextNodeId fantasma, MESSAGE auto-referencia, MESSAGE con text vacío.
- `wapi-bot-engine.service.spec.ts` (+3 casos): MESSAGE → MENU encadena, MESSAGE → MESSAGE → HANDOFF (3 sendText + ended), MESSAGE terminal upsertea sesión.
- 27/27 specs `wapi-bot/*` pasando. Frontend typecheck ✅.

#### Deps
- `@xyflow/react@latest` (editor de flow), `dagre@latest` (auto-layout), `@types/dagre@dev` en `apps/frontend`.

#### Cómo probarlo
1. **Editor**: ir a `/dashboard/wapi/bots`. Pickear una WapiConfig.
2. **Crear MESSAGE**: click en `MESSAGE` (toolbar). Aparece un nodo nuevo en el centro del canvas. Click → drawer derecho → editar texto.
3. **Conectar nodos**: arrastrar desde el handle (círculo violeta) del MESSAGE → soltar sobre otro nodo. Se crea una flecha. El drawer del MESSAGE refleja el nuevo `nextNodeId`.
4. **Conectar opción de MENU**: arrastrar desde el handle a la derecha de cada opción del MENU al nodo destino. La flecha aparece con la etiqueta de la opción.
5. **Borrar conexión**: clickear la flecha → tecla Delete (o Backspace).
6. **Auto-layout**: si los nodos están desordenados, click en `AutoFixHigh` (varita mágica) → dagre los reordena horizontalmente.
7. **Eliminar nodo**: drawer derecho → "Eliminar". Las referencias a ese nodo (en MENUs y MESSAGE.nextNodeId) se limpian automáticamente.
8. **Marcar inicial**: drawer derecho → "Marcar inicial". La chip START se mueve a ese nodo.
9. **Probar chain MESSAGE en runtime** (Dev Simulator):
   - Diseñar flow: `start (MESSAGE: "Hola!" next→bienvenida) → bienvenida (MESSAGE: "¿En qué te ayudamos?" next→menu1) → menu1 (MENU con opciones)`. Activar Bot ON, Guardar.
   - En `/dashboard/dev/wapi/chat` mandar texto cliente. El bot manda los 3 mensajes en secuencia: 2 MESSAGE + 1 MENU con botones.
   - El operator-view (panel derecho) NO ve los MESSAGE/MENU del bot, solo los inputs del cliente y, si llega a HANDOFF, el handoff.
10. **Validación**: si dejás un MESSAGE con nextNodeId apuntando a un nodo borrado, el Alert lista el error y no podés guardar con `botEnabled=ON`.

### 4.N — Bot guiado por número (menús con botones + handoff a operador)

#### Added
- **Schema** — `WapiConfig.botEnabled Boolean @default(false)`, `botFlow Json?`, `botSessionTtlMin Int @default(30)`. Nuevo modelo `WapiBotSession` (`organizationId`, `teamId`, `configId`, `phone`, `currentNodeId`, `startedAt`, `lastInboundAt`, `expiresAt`, `endedAt?`, `endedReason?`) con `@@unique([configId, phone])` + índices por org/team/expiresAt. Migración `20260507100000_wapi_bot_module`. `WapiBotSession` agregado a `TENANT_SCOPED_MODELS`.
- **`WapiSenderService.sendInteractiveButtons`** — wrapper sobre Meta `interactive` type=button (máx 3 botones, `title` truncado a 20 chars). Tipos `SendInteractiveButtonsInput` exportados.
- **`WapiBotEngineService`** (`apps/backend/src/modules/wapi/bot/wapi-bot-engine.service.ts`) — núcleo del bot:
  - `handle(cfg, input)` retorna `{ handled, ended?, escalate? }`. Detecta inbound (texto / button con prefijo `bot:` / button NO bot).
  - **Disambiguación template (4.K) vs bot**: bot prefija ids con `bot:` (`BOT_OPTION_PREFIX`). Si llega un button con `bot:` y NO hay sesión → `handled=true` silencioso (no rearma flow, evita doble-render). Si NO arranca con `bot:` → `handled=false` y delega al webhook (4.K templates).
  - **Sesión por (configId, phone)** con TTL configurable. Texto inicial sin sesión → entrega `startNode` y crea sesión. Texto con sesión activa → re-renderiza el menú actual (no avanza). Sesión expirada → cierra (`endedReason='expired'`) y rearranca.
  - **HANDOFF terminal** → manda texto, cierra sesión (`endedReason='handoff'`), retorna `ended=true` + `escalate?`. El webhook marca `priority=true` en la conversación si `escalate`.
  - **Persistencia outbound**: cada mensaje del bot queda en `WapiMessage` con `system: { kind: 'bot-menu' | 'bot-handoff' }` y se emite `wapi.message.new` por socket.
  - `endSessionsForConversation(configId, phone, reason)` — cierra todas las sesiones activas de un teléfono (lo llama `WapiInboxService.assign/resolve` para que el operador "tome" la conversación sin que el bot siga interceptando).
- **`validateBotFlow`** (`wapi-bot.types.ts`) — validación estructural: `startNodeId` requerido + existente, MENU con 1–3 opciones, `nextNodeId` resuelve, ids de opción únicos, text no vacío, kind ∈ {MENU, HANDOFF}. Devuelve `{ ok, errors[], flow }`.
- **`WapiBotService` + `WapiBotController`** — `GET /api/wapi/configs/:id/bot` (snapshot) y `PATCH` (update). Bloquea habilitar bot si flow inválido o ausente. CASL reusa `WapiConfig` (read/update).
- **Webhook integration** — `wapi-webhook.service.ts`: `handleInboundMessage` calcula `isBotButton` con `botEngine.isBotButtonId()`; `tryAutoReplies` carga `botEnabled/botFlow/botSessionTtlMin` y llama `botEngine.handle()` **antes** de welcome/optout/4.K. Si `botHandled` → return early. HANDOFF + escalate → `WapiConversation.priority=true` + `wapi.conversation.updated`. 4.K solo dispara cuando `!isBotButton`.
- **Inbox integration** — `WapiInboxService.assign()` y `.resolve()` ahora llaman `botEngine.endSessionsForConversation()` (razones `'operator-assign'` / `'resolved'`). Fin de sesión bot ⇄ ciclo operador.
- **Frontend editor** — `/dashboard/wapi/bots` (`WapiBotsPage.tsx` + `bots/api.ts` + `bots/types.ts`). Selector de WapiConfig, switch `botEnabled`, TTL, selector de nodo inicial, lista vertical de cards (MENU/HANDOFF) con texto + opciones (id, label≤20, nextNodeId via Select). Botones para agregar MENU/HANDOFF/opción. Validación cliente espejada del backend con Alert listando errores. Nueva entrada en sidebar grupo WhatsApp "Bot guiado" (icon `SmartToyIcon`).

#### Changed
- **`WapiWebhookService` constructor** — 8° arg nuevo `WapiBotEngineService`. Tests + spec actualizados.
- **`WapiInboxService` constructor** — 7° arg nuevo `WapiBotEngineService`. Spec actualizado con mock provider.

#### Tests
- `wapi-bot.types.spec.ts` (9 casos del validador): flow mínimo válido, falta/inexistente startNodeId, nextNodeId fantasma, MENU vacío / >3 opciones, ids duplicados, text vacío, kind inválido.
- `wapi-bot-engine.service.spec.ts` (10 casos): bot deshabilitado → handled=false, flow inválido tolerado, texto inicial sin sesión → entrega startNode + crea sesión, button con sesión → avanza, button sin sesión → silencioso, button NO bot → delega, texto con sesión → re-renderiza, HANDOFF → ended+escalate+cierra sesión, sesión expirada → rearranca, `endSessionsForConversation` cierra todas activas.
- `wapi-webhook.service.spec.ts` ampliado con bloque `4.M — bot guiado` (5 casos integrando engine en webhook).
- 161/161 specs wapi pasando. Frontend typecheck ✅.

#### Cómo probarlo (sin Meta)
1. **Habilitar Dev Simulator**: en `.env` del frontend `VITE_ENABLE_DEV_SIMULATOR=true` y backend `ENABLE_DEV_SIMULATOR=true`. Reiniciar ambos.
2. **Crear o pickear una `WapiConfig` con `isTestMode=true`** (el sender no llama Meta cuando está activo, solo logea). En `/dashboard/wapi/configs` editar y marcar Test Mode.
3. **Diseñar el flow**: ir a `/dashboard/wapi/bots`, seleccionar la config, dejar el flow por defecto o customizar (ej: MENU "¿En qué ayudamos?" con opciones Soporte→submenu y Hablar→handoff). Activar **Bot habilitado**, Guardar.
4. **Probar inbound**: ir a `/dashboard/dev/wapi/chat`, pickear la misma config. Mandar texto del cliente (ej "hola"). Debería:
   - Aparecer en el thread del operador el mensaje del cliente.
   - Inmediatamente después, el mensaje del bot con los botones (interactivo). En `isTestMode` el sender no manda nada a Meta, pero queda persistido en `WapiMessage` con `system.kind='bot-menu'` y se ve en el thread.
5. **Click en una opción del bot**: en el chat simulado, hay 3 botones rápidos arriba del composer del cliente — esos son para 4.K (INBOX/BAJA/IGNORAR), NO sirven para el bot. Para simular el reply del cliente al botón del bot, usar `POST /api/dev/wapi/simulate/inbound/button` con `buttonId='bot:<opcionId>'` (ej `bot:soporte`). Curl directo o agregar un input al chat simulado si querés.
6. **Llegar a HANDOFF**: cuando el bot llega a un nodo HANDOFF, debería mandar el texto, cerrar la sesión (verificable en DB: `WapiBotSession.endedReason='handoff'`), y si `escalate=true` la conversación queda con ⭐ (priority) en el inbox.
7. **Tomar la conversación**: en `/dashboard/wapi/inbox` clickear "Tomar". El operador asume control → `endSessionsForConversation('operator-assign')` cierra cualquier sesión activa (si había). Cualquier reply nuevo del cliente NO va a relanzar el bot mientras esté ASSIGNED.
8. **Resolver**: al resolver, también se cierran sesiones (razón `'resolved'`).
9. **Validar errores**: en el editor, intentar guardar con `botEnabled=true` y un MENU sin opciones → debe mostrar Alert + bloquear en backend (`BadRequestException`).

### 4.K — Botones interactivos en templates (INBOX / BAJA / IGNORAR)

#### Added
- **`WapiConversation.priority Boolean @default(false)`** (migration `20260506100000_wapi_conversation_priority`) + índice `(teamId, priority, lastMessageAt)`. Marca conversaciones que deben aparecer destacadas en el inbox.
- **`WapiButtonActionService`** (`apps/backend/src/modules/wapi/button-actions/`) — resuelve y aplica acciones disparadas por botones interactivos de templates. 3 acciones soportadas:
  - **INBOX** → marca `priority=true` en la conversación + emite `wapi.conversation.updated`.
  - **BAJA** → llama `WapiOptOutService.add({scope:'GLOBAL', source:'inbound_button'})`.
  - **IGNORAR** → sólo logea (ack semántico "el cliente entendió, no hay nada que hacer").
  - Resolución: chain `context.id → WapiReport.metaMessageId → WapiCampaign.templateId → WapiTemplate.buttonActions[buttonId]`. Acepta valores `string` (legacy) o `{action, payload?}` (nuevo). Fallback a defaults case-insensitive (`INBOX`/`BAJA`/`IGNORAR`) si no hay match en el template — habilita QA con Dev Simulator sin configurar templates.
  - `apply()` es best-effort: errores se loggean y no rompen el webhook (el inbound del cliente igual quedó persistido).
- **Webhook integration** — nuevo helper `extractButtonInfo(msg)` en `wapi-webhook.service.ts` maneja ambas shapes Meta (`interactive.button_reply.{id,title}` para templates modernos + legacy `button.{payload,text}`). Trigger condition extendida: `isNewConversation || couldTriggerOptOut || buttonInfo`. Cuando llega un button reply, `tryAutoReplies` dispatcha a `handleButtonAction` que resuelve + aplica + dispara `optOutConfirmMessage` en BAJA (paridad con keyword opt-out).
- **Dev Simulator endpoint** — `POST /api/dev/wapi/simulate/inbound/button` arma payload Meta-shaped con `interactive.button_reply` + `context.id` opcional. UI chat simulado (`WapiSimulatorChatPage`) con 3 quick buttons INBOX/BAJA/IGNORAR encima del composer del cliente.
- **Inbox UI — filtro Priorizadas** — `Chip` toggle "Priorizadas" en `ConversationList` (debajo del search, compone con tabs). Backend acepta `?priority=true` con `@Transform` para coerción de boolean desde query string. Badge ⭐ inline al inicio del nombre cuando `item.priority`. Socket handler aplica el campo `priority` en updates en vivo.
- **Templates UI — editor de `buttonActions`** (`WapiTemplatesListPage.tsx`) — IconButton SmartButton (⚙️) por fila → diálogo con filas {combo de QUICK_REPLY del template, Select(INBOX/BAJA/IGNORAR), TextField payload con soporte `{{var}}`}.
  - Combo excluye IDs ya usados en otras filas (no permite duplicados).
  - Estado "(no existe)" en rojo si el mapping legacy apunta a un botón que ya no está.
  - Helper banner con sintaxis Mustache + chips de variables disponibles + Select "Insertar var…" por fila que anexa `{{key}}` al payload.
  - Persistencia: `{ [buttonId]: { action, payload? } }`.
- **Endpoint data-keys de templates** — `GET /api/wapi/templates/:id/data-keys` agrega keys de `WapiContact.data` para todas las campañas que usaron este template (muestra de 200 contactos). Mirror de `wapi-campaigns.getContactDataKeys` pero a nivel template. Devuelve `[]` si nunca se usó.

#### Changed
- **`WapiWebhookService` constructor** — 7° arg nuevo `WapiButtonActionService`. Tests actualizados.
- **`WapiTemplate.buttonActions`** — schema sigue siendo `Json?`, pero ahora se persiste como `{ [buttonId]: { action: 'INBOX'|'BAJA'|'IGNORAR', payload?: string } }`. Lectura backward-compatible con el shape viejo `Record<string, string>`.

#### Tests
- Nueva spec `wapi-button-action.service.spec.ts` (11 casos: resolve con/sin context, ambos shapes, defaults case-insensitive, apply para 3 actions, best-effort error swallowing).
- `wapi-webhook.service.spec.ts` extendida con bloque `4.K — button actions` (5 casos: interactive shape, legacy shape, resolve null, BAJA dispara optOutConfirm, texto NO dispara button actions).
- 30/30 pasando en specs button-action + webhook. Backend + frontend typecheck ✅.

#### Pending
- Renderizado del payload con `{{var}}` en runtime (resolver). Hoy se persiste la plantilla cruda; cuando se necesite, agregar `resolvePayload(payload, contactData)` en `WapiButtonActionService.apply` haciendo un `WapiContact.findFirst({phone, campaignId})` + sustitución regex.

### 4.H + 4.I — Auto-respuestas de WhatsApp (opt-out por keyword + welcome message)

#### Added
- **`WapiConfig.optOutKeywords: String[] @default([])`** (migration `20260505200000_wapi_config_opt_out_keywords`). Lista editable de keywords case-insensitive que disparan opt-out automático cuando llegan como texto inbound. Si vacío, se usan los defaults internos: `BAJA`, `STOP`, `UNSUBSCRIBE`, `CANCELAR`. Match es exacto sobre el body completo del mensaje (post-trim, uppercase) — evitamos falsos positivos como "no quiero la baja del dólar".
- **`WapiOptOutService`** (`apps/backend/src/modules/wapi/opt-out/`) centraliza el estado opt-out por `(team, phone)`. API: `resolveKeywords(cfgKeywords)`, `matchKeyword(body, keywords)`, `check({phone, campaignId})`, `add({phone, scope, campaignId?, reason?, source?})`. Mirror de `SuppressionService` para email — usa `phoneHash` (SHA-256 sobre dígitos del phone normalizado) como key para indexar el unique constraint sin exponer el plano. `add()` es idempotente con `findFirst` previo (Postgres trata múltiples NULL como distintos en compound unique con `campaignId NULL`).
- **Webhook handler con auto-respuestas** — `WapiWebhookService.handleInboundMessage` ahora reemplazó el `wapiConversation.upsert` por `findFirst + create/update` para detectar primera conversación. Tras persistir el `WapiMessage` inbound dispara `tryAutoReplies()` que carga el config completo lazy (sólo si hay disparador) y:
  - **Welcome (4.I)**: si `isNewConversation && cfg.welcomeMessage`, envía el welcome via `sender.sendText` con `isTestMode` plumbed.
  - **Opt-out (4.H)**: si `msg.type='text'`, resuelve keywords del config (o defaults) y matchea body. Si match → `optOut.add(scope='GLOBAL', source='inbound_keyword')` y envía `cfg.optOutConfirmMessage` si está set.
  - Ambos auto-replies persisten un `WapiMessage(fromMe=true, status='sent', content.system={kind:'welcome'|'opt-out-confirm'})` y emiten `wapi.message.new` para que el frontend los vea sin refresh. Errores de envío se loggean pero no rompen el flujo (best-effort).
- **Worker guard opt-out** — `WapiWorkerService.process` chequea `optOut.check({phone, campaignId})` antes del daily limit y del envío. Si está opted-out, marca `WapiReport.status='CANCELED'` con `error='opted-out:global|campaign'`, emite `wapi.report.log` con status FAILED y llama `maybeCompleteCampaign`. Sin pegar a Meta, sin sleep jitter.
- **DTOs + service WapiConfig** — `Create/UpdateWapiConfigDto` aceptan `optOutKeywords?: string[]` validado con `@IsArray @ArrayMaxSize(20) @IsString({each:true})`. `wapi-configs.service` normaliza vía `normalizeKeywords()` (trim, uppercase, dedupe) y lo persiste. `WapiConfigDetail` ahora expone `optOutKeywords: string[]`.
- **UI WapiConfig** — campos `welcomeMessage` y `optOutConfirmMessage` (multiline TextField) con helperText actualizado a "Se envía automáticamente al primer mensaje…" / "…cuando un contacto manda una keyword". Nuevo TextField "Keywords de opt-out (separadas por coma)" con placeholder `BAJA, STOP, UNSUBSCRIBE, CANCELAR`. `parseKeywords()` en el frontend hace split por coma o newline, trim/uppercase/dedupe.

#### Changed
- **`WapiWebhookService` constructor** ahora inyecta `WapiSenderService`, `EncryptionService`, `WapiOptOutService` (antes sólo `prisma/events/media`). Tests del webhook actualizados al nuevo shape (incluye mocks de los 3 services + `wapiConfig.findFirst` + `wapiOptOut.{findFirst, create}`).
- **`WapiWorkerService` constructor** ahora inyecta `WapiOptOutService` (6° arg). Test `wapi-worker.service.spec` actualizado.
- **Reopen de conversación RESOLVED** — la lógica de re-abrir status `RESOLVED → ASSIGNED/UNASSIGNED` que vivía en el helper `shouldReopen()` quedó inlineada en el branch `update` del refactor (ya teníamos el `existing` del `findFirst` previo, no necesitamos un query extra).

#### Notes
- **Tests**: 120/120 wapi tests ✅ (incluye los 11 specs del worker + 12 del webhook + nuevos mocks de opt-out).
- **Schema preexistente**: el modelo `WapiOptOut` ya estaba declarado en `schema.prisma` desde la migration inicial `20260430153841_add_wapi_models` con `phoneHash`, `scope`, `campaignId?`, `reason?`, `source?` y unique `(teamId, phoneHash, scope, campaignId)`. Sólo faltaba el campo `optOutKeywords` en `WapiConfig` y la lógica que lo usara.
- **Pendientes**: UI admin para ver / borrar opt-outs (similar al panel de Suppressions de email). Resuscripción manual desde el inbox.

### 4.M MVP — `WapiConfig.isTestMode` + Chat simulado ida-vuelta + filtro inbox por línea

#### Added
- **`WapiConfig.isTestMode: Boolean @default(false)`** (migration `20260505180000_wapi_config_is_test_mode`). Si está activo, `WapiSenderService.post()` short-circuita: NO pega a Meta, devuelve `metaMessageId = wamid.SIM_<base36>_<random>` y `raw: { simulated: true, body }`. La capa superior persiste el mensaje como si Meta hubiera respondido OK. Cobertura: text + template + media link + media-by-id (todos pasan por `post()`). Plumbed en los 3 callers que arman `WapiSenderConfig` desde DB (`wapi-inbox.service.sendText` / `sendMedia` y `wapi-worker.service` para campañas), todos leen `cfg.isTestMode` del row.
- **DTOs + UI de configs** — `CreateWapiConfigDto` y `UpdateWapiConfigDto` aceptan `isTestMode?: boolean`. `wapi-configs.service` lo persiste en create/update y lo expone en `WapiConfigListItem`/`Detail`. Página de Configs WhatsApp: nuevo Switch "Modo test" con caja amarilla y descripción ("envíos NO van a Meta"); chip "Test" outlined warning en la fila de la tabla cuando está activo.
- **Página `/dashboard/dev/wapi/chat`** (`apps/frontend/src/features/dev/WapiSimulatorChatPage.tsx`) — chat ida-vuelta para dev: split layout 1:1. Top bar: select de WapiConfigs **filtrado a `isTestMode=true`** + inputs de phone/nombre del cliente (persistidos en `localStorage['massivo:dev-chat:state']`). Pane izq "Cliente virtual": composer de texto + adjuntar archivo (auto-detecta type por mime), envíos posten a `/api/dev/wapi/simulate/inbound/text|media`; thread renderizado con `ConversationThread` pero `fromMe` invertido (lo que el operador escribió = incoming para el cliente). Pane der: inbox real reutilizando `ConversationHeader` + `ConversationThread` + `MessageComposer`, con la conversación resuelta por `inboxApi.listConversations({tab:'all', configId, search:phone})`. Socket `wapi.message.new` listener appendea a la conv abierta y re-resuelve si la conv aún no existe (primer inbound). Banner warning si no hay configs en modo test.
- **Sidebar entry "Chat simulado"** (icon `ForumIcon`) en grupo Dev, gated por `VITE_ENABLE_DEV_SIMULATOR=true`. Ruta declarada bajo el guard en `App.tsx`.

### 4.L.1 — Filtro de inbox por WapiConfig (multi-línea)

#### Added
- **`ToggleButtonGroup` "Todas / &lt;cada config&gt;"** en `ConversationList` (sólo se muestra si hay 2+ configs activas). Selección persistida en `localStorage['massivo:wapi-inbox-configId']`. Aplica el filtro `configId` a `inboxApi.listConversations` y al socket: ambos handlers (`wapi.message.new` / `wapi.conversation.updated`) chequean `selectedConfigRef.current` y descartan eventos de otras líneas. Cuando "Todas" está activo en multi-config, cada item lleva un Chip outlined con el label de la línea (deriva de `configLabelById` map).
- **`WapiInboxPage` con `selectedConfigId` state** — carga `/api/wapi/configs`, filtra `isActive`, mapea a `InboxConfigOption[]` y limpia el persistido si la config ya no existe / está inactiva. Cambiar de filtro resetea `selectedId` para evitar mostrar una conv que ya no entra en la vista.

### 4.L MVP — Dev Simulator de WhatsApp (inyectar webhooks sin Meta ni ngrok)

#### Added
- **Módulo `dev`** (`apps/backend/src/modules/dev/`) con endpoints `POST /api/dev/wapi/simulate/inbound/text|media|reaction` y `POST /api/dev/wapi/simulate/status`. Cada uno construye un payload Meta-shaped (`whatsapp_business_account` → `entry[].changes[].value` con `messages` o `statuses`) y lo inyecta en `WapiWebhookService.process(...)` saltando HMAC y la URL pública del webhook. Para media: el archivo viaja por multipart (`FileInterceptor`, cap 100MB), se persiste localmente con `WapiMediaService.persistInboundLocal`, se genera un `mediaId` sintético `sim-${randomBytes(8).hex}` y se pasa al webhook un `mediaOverrides` map para que el handler use el binario local en vez de pegarle a Meta Graph. Wamids generados con prefijo `wamid.SIM_…` para distinguir simulaciones de mensajes reales en logs/DB.
- **`DevSimulatorEnabledGuard`** — devuelve **404** si `ENABLE_DEV_SIMULATOR !== 'true'` (404 en vez de 403 para que el endpoint sea indistinguible de "no existe" en prod). Stack de guards: `DevSimulatorEnabledGuard → ClerkAuthGuard → TenantContextGuard` + `TenantContextInterceptor`.
- **`WapiMediaService.persistInboundLocal(configId, buffer, mime)`** — método público que escribe un buffer al storage local del tenant (`<orgId>/<teamId>/<sha256>.<ext>`) sin tocar Meta. Devuelve el mismo shape que `fetchInboundMedia` para reusar el pipeline.
- **`WapiWebhookService` con `mediaOverrides`** — interfaz `InboundMediaOverride { sha256, size, localPath, mime }` exportada del service. `process(payload, configByPhoneNumberId, mediaOverrides?)` acepta tercer parámetro opcional plumbed via `processValue` → `handleInboundMessage`. En el handler, si hay override para el `mediaId`, se usa directamente (skip `fetchInboundMedia`).
- **UI `/dashboard/dev/wapi/simulator`** (`apps/frontend/src/features/dev/WapiSimulatorPage.tsx`) — selector de `WapiConfig` + 4 cards apiladas (texto / media / reacción / status). Cada card con su submit + feedback banner. Caption disabled para audio/sticker. File input con `accept` por tipo. Reset del file input post-submit en media.
- **Sidebar y router gateados** por `VITE_ENABLE_DEV_SIMULATOR=true` — sección "Dev" con item "Simulador WhatsApp" (icon Science) sólo si la env está activa; ruta sólo se monta si está activa.

#### Changed
- **`WapiModule`** ahora exporta también `WapiWebhookService` (antes sólo `WapiQueueService/SenderService/MediaService`) para que `DevModule` pueda inyectarlo.

#### Notes
- **Tests**: no se agregaron specs para el simulator (utilidad de dev, se prueba manualmente vía la UI). Se corrió la suite completa y los cambios en `WapiWebhookService` (firma con tercer parámetro opcional) y `WapiMediaService` no rompen nada: **359/359 tests backend ✅**.
- **Pendientes 4.L**: modelo `WapiSimulatorVirtualNumber` (perfiles fake reusables), vista chat split (`/dashboard/dev/wapi/chat-simulator` two-pane), audit log de payloads inyectados.

### 4.F.2.d — Media WhatsApp end-to-end (upload Meta + storage local + render por tipo)

#### Added
- **`WapiMediaService`** (`apps/backend/src/modules/wapi/media/`) centraliza todo el lifecycle de media de WhatsApp. `validateUpload(buffer, mime, type?)` chequea mime contra whitelist por tipo y tamaño contra `MEDIA_LIMITS_BY_TYPE` (image 5MB, audio/video 16MB, document 100MB, sticker 100KB/500KB). `uploadToMeta(cfg, file, type)` postea a `POST /v{ver}/{phoneNumberId}/media` con multipart (Buffer + Blob + FormData nativo de Node 22), persiste localmente bajo `<orgId>/<teamId>/<sha256>.<ext>` (idempotente — si el archivo ya existe no se reescribe, mtime preservado) y devuelve `{ mediaId, sha256, size, localPath }`. `fetchInboundMedia(cfg, mediaId)` resuelve URL Meta + sha256 (`GET /v{ver}/{mediaId}`), descarga el binario con Bearer header y persiste local. `openLocal(localPath)` devuelve `{ stream, size }` para `StreamableFile`. Path traversal prevenido en `resolveAbs` (rechaza `..` o paths absolutos).
- **`WapiSenderService.sendMediaById(cfg, input)`** — envío de media usando `media: { id }` (vs `link`). Caption excluido para audio/sticker (regla Meta), filename solo para document.
- **Endpoint `POST /api/wapi/inbox/conversations/:id/media`** — multipart con `FileInterceptor('file', { limits: { fileSize: 100MB } })`. DTO `SendWapiInboxMediaDto` (`type` + `caption?`). Service `sendMedia` valida ventana 24h → `uploadToMeta` → `sendMediaById` → persiste `WapiMessage` con campos media → emite `wapi.message.new` y `wapi.conversation.updated`.
- **Endpoint `GET /api/wapi/inbox/messages/:id/media`** — devuelve `StreamableFile` con `Cache-Control: private, max-age=86400`. Content-Disposition `inline` para image/audio/video, `attachment` para documentos.
- **Webhook descarga inbound automática** — `handleInboundMessage` extrae `mediaId/mime/sha256/caption/filename` per type via `extractMediaInfo(msg)`, llama `media.fetchInboundMedia` para image/audio/video/document/sticker. Falla gracefully: si la descarga revienta (timeout, 404, URL Meta expirada a los 5min), persiste el mensaje sin `mediaLocalPath` con warning. Reactions sólo metadata.
- **Modelo `WapiMessage`** extendido con `mediaId/mediaMime/mediaSha256/mediaSize/mediaFilename/mediaCaption/mediaLocalPath` (todos nullable) + índice `@@index([teamId, mediaSha256])` para queries de dedup. Migración `20260505100000_wapi_message_media_fields`.
- **`ApiClient` (frontend)** — métodos nuevos `postForm<T>(path, FormData)` (no setea Content-Type, lo agrega el browser con boundary) y `getBlob(path)` (GET autenticado que devuelve Blob — necesario porque `<img src>` no carga Authorization headers).
- **`MessageComposer`** — botón AttachFile con `Menu` de tipos (Imagen/Documento/Audio/Video). Click dispara `<input type="file">` oculto con `accept` por tipo. Validación client de tamaño contra los límites de Meta. Si pasa, abre `Dialog` con preview (img/video/audio/icon-card según type) + caption opcional (oculto para audio/sticker) + Cancelar/Enviar. Submit llama `inboxApi.sendMedia(api, id, file, type, caption?)`.
- **`MessageBubble`** extraído a archivo propio con renderers por tipo. Imagen/sticker: hook `useMediaBlobUrl` descarga el blob y crea object URL revocado al desmontar; click abre `Modal` zoom full-screen. Video y audio: `<video controls>` / `<audio controls>` con object URL. Documento: tarjeta clickeable con icon + filename + size; click descarga (no carga blob hasta que el usuario lo pide). Sticker: imagen chica (140px) sin background. Reacción: pill compacto con emoji + timestamp.
- **`.env.example`** — `WAPI_MEDIA_DIR=./uploads/wapi-media`.
- **Tests** — nuevo `wapi-media.service.spec.ts` (5 casos: validateUpload INVALID_MIME / TOO_LARGE; uploadToMeta happy path; uploadToMeta META_UPLOAD_FAILED; fetchInboundMedia happy path; idempotencia). `wapi-inbox.service.spec.ts` con caso `sendMedia happy path`. `wapi-webhook.service.spec.ts` con 2 casos extra de media inbound (happy path con sha256/localPath; failure con localPath null).

#### Changed
- **`WapiInboxService.MessagePayload`** ahora incluye `mediaMime/mediaSize/mediaFilename/mediaCaption` opcionales. `listMessages` los incluye en el `select`.
- **`WapiModule`** registra y exporta `WapiMediaService`.
- **`WapiSenderConfig`/`SendMediaByIdInput`** — tipos nuevos en `wapi-sender.types.ts`.

#### Fixed
- **Tests de webhook 4 casos rotos pre-existentes (Sesión 24)**: faltaba mock de `wapiConversation.findFirst` (usado por `shouldReopen`) y `toHaveBeenCalledWith({ data: ... })` era demasiado estricto sobre el shape top-level del call (la llamada real incluye `select`). Reemplazados por `expect.objectContaining({ data: ... })`. **359/359 tests backend ✅**.

#### Migration
- `20260505100000_wapi_message_media_fields` — `ALTER TABLE WapiMessage ADD COLUMN` para los 7 campos media + `CREATE INDEX WapiMessage_teamId_mediaSha256_idx`. Escrita a mano (Postgres no estaba up al momento del cambio). **Aplicar con `pnpm --filter @massivo/prisma migrate:deploy` antes de probar el feature**.

### 4.F.4 — Inbox conversacional WhatsApp (frontend) + 4.G Quick replies admin

#### Added
- **Página `/dashboard/wapi/inbox`** con layout 2 columnas (lista + thread + composer). Lista con tabs **Mías / Sin asignar / Otras / Resueltas**, search debounced, paginación cursor, badges de no-leído. Thread con look WhatsApp Web (fondo dotted theme-aware, burbujas con tail, agrupación por día con headers Hoy/Ayer/weekday, receipt icons ✓/✓✓/azul, render del subset markdown WhatsApp). Header con avatar, status chip y acciones: Tomar, Resolver/Reabrir, MarkRead/Unread, Asignar, Liberar.
- **Composer** con textarea multiline (Enter envía, Shift+Enter salto), botón send y dropdown de respuestas rápidas activado al tipear `/atajo` (filtro live, navegable con flechas, Enter/Tab para insertar). Banner cuando la ventana 24h está cerrada o la conversación está RESOLVED. Borrador persistido por conversación en `localStorage`, se limpia al enviar exitoso.
- **Listeners socket** `wapi.message.new` (append al thread abierto + reorder en lista, incrementa unread cuando la conv no está abierta) y `wapi.conversation.updated` (mergea status / asignación / `resolvedAt` / `unreadCount` en lista y detail). Auto mark-read al abrir una conversación con mensajes nuevos.
- **`AssignDialog`** con buscador de miembros del team (lista desde `/api/teams/:teamId/members`, avatares + email). **`ResolveDialog`** con nota opcional multiline (max 2000), pasa `null` si está vacío.
- **Página admin `/dashboard/wapi/quick-replies`** (4.G) con CRUD: tabla con atajo (chip monospace), contenido truncado y acciones; editor en `Dialog` con validación de regex `^[a-z0-9][a-z0-9_-]{0,39}$` y body 1-4096 con contador. Eliminación con `useConfirm` destructive.
- **Sidebar** ampliado: grupo WhatsApp ahora muestra **Inbox** (`InboxIcon`) y **Respuestas rápidas** (`BoltIcon`) además de los items existentes.

#### Changed
- `AppLayout` detecta la ruta del inbox y entra en **modo full-bleed**: el `<main>` deja de aplicar `maxWidth: 1400` y el padding clásico, y en su lugar fija altura exacta `calc(100vh - 56px)` con `overflow: hidden` y un padding pequeño (`{ xs: 1, sm: 1.5, md: 2 }`) para dar respiración respecto del sidebar. El inbox queda enmarcado como tarjeta con `border` + `borderRadius: 2`.
- `ConversationHeader` removió un `export { Divider }` espurio y la importación no usada del componente.

#### Fixed
- **Loop de requests a `/api/me/context` (y otros endpoints)**: `useApi()` retornaba un objeto literal nuevo en cada render, lo que invalidaba la identidad referencial del cliente HTTP y disparaba en bucle todos los `useEffect`/`useCallback` que lo tenían como dependencia. Solución: envolver el retorno en `useMemo([request, download])`. Beneficia a todas las pantallas que dependen de `api`.
- **Webhook Meta — `WapiWebhookService.shouldReopen` lanzaba `PrismaClientValidationError`** porque usaba el compound key `teamId_configId_phone` con `findFirst` (sólo válido en `findUnique`). El cast `as never` ocultaba el error en typecheck. Reemplazado por `where: { teamId, configId, phone }`.

### 4.F.3 — Inbox conversacional WhatsApp (backend)

#### Added
- **Modelos Prisma** `WapiQuickReply` y `WapiResolutionNote`. `WapiQuickReply` (scope team) almacena respuestas rápidas con `shortcut` (slug `[a-z0-9_-]{1,40}`) y `body`, `@@unique([teamId, shortcut])`. `WapiResolutionNote` guarda historial de cierres por conversación (modelo separado para soportar resolver → reabrir → resolver múltiples veces sin perder notas previas).
- **Índice compuesto** `WapiConversation @@index([teamId, status, lastMessageAt])` para acelerar el listado del inbox por tab.
- **Permisos CASL** — nuevos subjects `Conversation` y `QuickReply`. Team `MEMBER` recibe `read/update/send` sobre `Conversation` y CRUD sobre `QuickReply`. Team `ADMIN` ya cubre estos via `manage all`.
- **Módulo `wapi/inbox`** con `WapiInboxService` + controller bajo `POST /api/wapi/inbox/*`. Endpoints: `GET conversations` (filtros por tab `mine` / `unassigned` / `others` / `resolved` / `all` + `configId` + `search` + paginación cursor); `GET conversations/:id` y `GET conversations/:id/messages` (cursor); `POST conversations/:id/messages` (envío de texto libre dentro de la ventana 24h, falla con `BadRequest` si la ventana está cerrada o `Conflict` si la conversación está RESOLVED); `POST conversations/:id/read` (marca leído/no leído, resetea `unreadCount`); `POST conversations/:id/take` y `assign` y `unassign` (auto-asignación al responder si estaba UNASSIGNED); `POST conversations/:id/resolve` (acepta `note?` opcional → persiste `WapiResolutionNote`) y `reopen`; `GET conversations/:id/notes` (historial de notas de cierre).
- **Módulo `wapi/quick-replies`** con CRUD completo en `/api/wapi/quick-replies`. Conflict 409 si el `shortcut` ya existe (P2002).
- **Eventos socket adicionales** desde el webhook: además del legacy `wapi.message.inbound`, ahora se emiten `wapi.message.new` (con el mensaje completo serializado para append en la conversación abierta del frontend) y `wapi.conversation.updated` (con el shape mínimo de la conversación para refrescar la lista del inbox sin re-fetchear).
- **Auto-reapertura** en el webhook: si entra un mensaje a una conversación RESOLVED, se vuelve a abrir automáticamente (ASSIGNED si conserva `assignedUserId`, UNASSIGNED si no), limpiando `resolvedAt`.
- **Tests unitarios**: `wapi-inbox.service.spec.ts` (8 casos: filtro `mine`, ventana 24h cerrada, conflicto RESOLVED, happy path con auto-asignación + emisión de eventos, resolve con/sin nota, reopen no-aplicable, listMessages 404) y `wapi-quick-replies.service.spec.ts` (5 casos: create con userId del ctx, P2002 → Conflict, validación de existencia en update y delete).

#### Changed
- **`WapiSenderService`** — sin cambios; el inbox usa `sendText` que ya existía. La inyección sólo agrega un consumer.
- **Tenant-aware Prisma extension** — los nuevos modelos `WapiQuickReply` y `WapiResolutionNote` agregados a `TENANT_SCOPED_MODELS` para que las queries vía `prisma.scoped.*` filtren por `organizationId`/`teamId` automáticamente.

#### Notas
- Frontend (4.F.4) y página admin de quick replies (4.G) quedan pendientes para la próxima sesión.
- Tras correr la migración `20260504232310_wapi_inbox_quick_replies_resolution_notes`, hay que reiniciar el backend para que `pnpm prisma generate` tome los nuevos tipos (el dev server suele lockear el `query_engine-windows.dll.node`).

### 4.F.1.c — Mapeo CSV → variables del template + fixes de envío con vars

#### Added
- **Backend — `WapiCampaign.config.bodyVars`**: el campo `config` de la campaña ahora acepta un objeto `{ bodyVars: string[] }` que mapea cada variable `{{N}}` del template a una columna del `WapiContact.data`. El `WapiWorkerService.buildTemplateComponents` ya leía ese formato; faltaba el camino de escritura (DTO + UI). `UpdateWapiCampaignDto` suma `config?: Record<string, unknown> | null`.
- **Endpoint `GET /api/wapi/campaigns/:id/contacts/data-keys`**: devuelve la unión de claves de `WapiContact.data` para todos los contactos cargados en la campaña (toma una muestra de hasta 200, suficiente para CSVs uniformes). Permite que la UI sugiera columnas existentes sin pedir al usuario que re-pegue el CSV.
- **Frontend — Sección "Variables del template"** en `WapiCampaignDetailPage`: aparece automáticamente cuando se selecciona un template con `{{1}}…{{N}}` en el body. Muestra el texto del body en cursiva como referencia y un dropdown por cada variable, alimentado por las columnas detectadas (CSV recién pegado + `data-keys` del backend). Si todavía no hay columnas conocidas, cae a un TextField de texto libre. Soporta el mapping persistido al re-abrir la campaña.
- **`WapiTemplateDetailFull`** (frontend types): tipo público para consumir `GET /api/wapi/templates/:id` y extraer el body text del JSON `components` (ya devuelto por el endpoint).

#### Changed
- **Validación de envío** en `WapiCampaignDetailPage`: `canSend` ahora exige que las variables del template estén mapeadas (en `campaign.config.bodyVars`) y guardadas. Mensaje de helper actualizado.
- **Parser CSV** (`parseContactsCsv`): las columnas `name` y `nombre` ya no se "consumen" exclusivamente al escalar `contact.name` — ahora se duplican también en `contact.data` para que el worker las pueda referenciar como variables del template. Antes, mapear `{{1}}` → `nombre` siempre fallaba con "columna no existe" porque el parser hoisteaba la columna fuera de `data`.

#### Fixed
- **Meta error #132000 (parameter count mismatch)**: causado porque la UI no permitía mapear vars y el worker mandaba `template: { name, language }` sin `components.parameters` cuando el template tenía `{{N}}`. Resuelto end-to-end con la sección de mapping + persistencia en `campaign.config.bodyVars`.
- **Meta error #131008 (required parameter is missing)**: el worker mandaba `text: ''` cuando la columna mapeada estaba ausente en un contacto. Ahora `buildTemplateComponents` lanza un error descriptivo (`Variable {{N}} (columna "X") está vacía o no existe en este contacto`) que se persiste como `report.error` y queda visible en la sección de envíos. Además se agregó un fallback: si la spec es `name`/`nombre` y no está en `data`, se usa el escalar `contact.name` (rescata contactos cargados antes del fix del parser).

### 4.F.2.c — Renderizado de markdown WhatsApp en preview de templates

#### Added
- **Helper `renderWhatsAppMarkdown`** (`apps/frontend/src/features/wapi/templates/whatsappMarkdown.tsx`): subset de markdown soportado por WhatsApp — `*negrita*`, `_cursiva_`, `~tachado~`, `` `monoespaciado` ``, ` ```bloque código``` ` (multilínea). Tokenizer en dos pasadas: primero monoespaciado/bloque (no nestable), luego negrita/cursiva/tachado (anidable, `findEarliestInline` elige el delimitador más a la izquierda).
- Aplicado en la preview del diálogo de la lista (`WapiTemplatesListPage`) y en la live preview del editor (`WapiTemplateEditorPage`). Header, body y footer todos pasan por el helper.
- Los emojis funcionan vía teclado del SO sin cambios adicionales (Win + `.` en Windows, ⌃⌘Espacio en Mac).

#### Fixed
- **Preview de templates en dark mode**: las burbujas de chat se renderizaban con colores de light mode (fondo crema `#e5ddd5`, burbuja blanca) y eran ilegibles. Ahora las preview detectan `theme.palette.mode` y aplican los colores oficiales de WhatsApp dark (`#0b141a` fondo, `#1f2c34` burbuja, `#e9edef` texto, `#53bdeb` botones, `rgba(255,255,255,0.12)` borders). Aplicado en list page y editor.

### 4.F.2.b — Frontend: editor de templates Massivo → Meta con preview en vivo
- **`WapiTemplateEditorPage`** (`/dashboard/wapi/templates/new`): form completo + live preview side-by-side. Selector de número origen (config), name (validado contra `^[a-z0-9_]{1,512}$`), idioma, categoría (Marketing/Utility/Authentication). Sección Header con tipo `NONE/TEXT/IMAGE/VIDEO/DOCUMENT` — TEXT muestra textfield + samples auto-generados según `{{N}}` detectados; IMAGE/VIDEO/DOCUMENT pide `mediaHandle` (con helper indicando que la upload UI llega en 4.F.2.c). Cuerpo con detección automática de variables `{{1}}…{{N}}` y generación dinámica de inputs de sample por cada var. Footer toggleable. Gestor de buttons (hasta 3) con type-aware fields: QUICK_REPLY sólo texto, URL pide `url`, PHONE_NUMBER pide `phoneNumber` E.164.
- **Live preview**: panel sticky en md+ replicando el bubble WhatsApp del list page (mismos estilos `bgcolor: '#e5ddd5'`, white message bubble) con substitución en vivo de variables — `{{N}}` se reemplaza por el sample correspondiente o queda como placeholder visual.
- **Submit**: payload mapeado al `CreateWapiTemplateMetaDto` del backend (4.F.2.a), POST a `/api/wapi/templates/submit/:configId`. Toast de éxito + redirect a `/dashboard/wapi/templates` donde el nuevo aparece con badge PENDING. Errores Meta surfacean el mensaje devuelto por el service.
- **Botón "Sugerir con IA"**: placeholder que dispara toast "disponible en Fase 6" — esqueleto preparado para enchufar el provider Gemini cuando llegue.
- **CTA "Nuevo template"** en `WapiTemplatesListPage` (junto al "Sincronizar"). Texto de la lista actualizado: ya no dice "creación llega en próxima fase".
- **Routing**: `/dashboard/wapi/templates/new` agregado en `App.tsx`.
- **Layout**: usa flex (no `Grid item` — la versión de MUI Grid del proyecto exige `component` prop, así que migramos a Box flex). Sticky preview en md+.
- **Pendientes intencionales en 4.F.2.b**:
  - **Media upload (4.F.2.c)**: el campo `mediaHandle` para IMAGE/VIDEO/DOCUMENT espera que el usuario lo genere por su cuenta; falta endpoint backend que orqueste la Resumable Upload de Meta + UI con `<input type="file">` que llame a ese endpoint y rellene el campo automáticamente.
  - **Edición de templates existentes**: hoy sólo create. Meta sólo permite editar templates en estados específicos (REJECTED) — agregar el endpoint `PATCH submit` cuando lo necesitemos.
  - **Tests**: form complejo, vale la pena agregar tests pero priorizamos el smoke test manual del dueño primero.

### 4.F.2.a — Backend: posting de templates Massivo → Meta Graph API
- **Motivación**: cerrar la asimetría de 4.D — hoy podemos sincronizar templates aprobados desde Meta hacia Massivo, pero no podemos crear uno nuevo desde Massivo y mandarlo a Meta para revisión. Es bloqueante porque el dueño quiere que el flujo de templates viva 100% dentro de Massivo (sin tocar Meta Business Manager). El frontend (4.F.2.b) consume este endpoint en sesión posterior.
- **DTOs** (`apps/backend/src/modules/wapi/templates-posting/wapi-templates-posting.dto.ts`):
  - `CreateWapiTemplateMetaDto` con `name` (regex `^[a-z0-9_]{1,512}$` — exigencia de Meta), `language` (e.g. `es_AR`), `category` (`MARKETING|UTILITY|AUTHENTICATION`).
  - `TemplateHeaderDto` (`format: NONE|TEXT|IMAGE|VIDEO|DOCUMENT`, `text?`, `textExamples?`, `mediaHandle?`).
  - `TemplateBodyDto` (`text` 1-1024, `examples?: string[][]` shape `[["Ana", "1234"]]`).
  - `TemplateFooterDto` (`text` max 60).
  - `TemplateButtonDto` (`type: QUICK_REPLY|URL|PHONE_NUMBER`, `text` max 25, `url?`, `phoneNumber?`) con `ArrayMaxSize(3)` en buttons (límite Meta).
  - Validación cruzada (URL exige `url`, PHONE_NUMBER exige `phoneNumber`, header TEXT exige `text`, header IMAGE/VIDEO/DOCUMENT exige `mediaHandle`) hecha en el service con `BadRequestException` específico — class-validator no expresa "campo X requerido sólo si Y=Z" sin custom decorators y agrega complejidad innecesaria para 4 reglas.
- **`WapiTemplatesPostingService`** (`templates-posting/wapi-templates-posting.service.ts`):
  - `submit(configId, dto)`:
    1. `requireContext()` — `ForbiddenException` si no hay tenant.
    2. `prisma.scoped.wapiConfig.findFirst` por id (cross-tenant 404 natural por la extension).
    3. `findFirst` en `wapiTemplate` por `(metaName, businessAccountId)` — si existe → `ConflictException` (Meta también lo rechaza, pero anticipar el error es mejor UX y evita gastar un POST contra el rate limit de Meta).
    4. `buildMetaPayload(dto)` — mapeo declarativo de DTO a shape Meta: HEADER component sólo si `format !== 'NONE'`, BODY siempre, FOOTER opcional, BUTTONS array (vacío omitido).
    5. Decripta `accessTokenEnc` con `EncryptionService` (LRU caché del decrypt).
    6. `POST /v20.0/<wabaId>/message_templates` con `Authorization: Bearer <token>` y `Content-Type: application/json`. URL base override por `WAPI_GRAPH_BASE_URL` (mismo env del sender/sync).
    7. Errores Meta non-2xx → `ServiceUnavailableException` con `code` y `message` del payload `error` para que el UI los pueda surface al usuario (ej: "Template name already exists" si pisamos el dedup, "Body text exceeds 1024 chars", etc.).
    8. Persiste local con `metaName, businessAccountId, category, language, status: response.status ?? 'PENDING', components: payload.components, syncedAt: now`. El status default `PENDING` es lo que devuelve Meta el 99% de las veces; si en algún caso devuelve directamente `APPROVED` (templates AUTHENTICATION pre-aprobados) lo respetamos.
  - **Notas**:
    - El `metaTemplateId` que devuelve Meta (response `id`) se loggea pero **NO** se persiste — el modelo `WapiTemplate` no tiene esa columna. La identificación canónica es `(teamId, metaName, businessAccountId)` igual que en sync. Sub-fase futura agregaría la columna si necesitamos delete-from-Meta sin re-fetch.
    - Para header IMAGE/VIDEO/DOCUMENT, Meta exige un `header_handle` obtenido vía Resumable Upload API (3-step: start → upload → commit). Acá lo aceptamos como input (`mediaHandle`) — la sub-fase 4.F.2.c implementará el endpoint de upload (`POST /api/wapi/templates/media-handle/:configId` con multipart) que devuelve el handle. Por ahora si el usuario quiere mandar template con media, tiene que generar el handle por su cuenta o usar TEXT/NONE.
    - Components persisten con shape Meta (`type: 'HEADER'`, `format: 'TEXT'`, etc.) para que el `TemplatePreview` del frontend (4.F.1.b) los renderice idénticos a un template sincronizado, sin necesidad de tener dos render paths.
- **Endpoint** `POST /api/wapi/templates/submit/:configId` agregado a `WapiTemplatesController` con `@HttpCode(201)` y `@CheckPolicies('create', 'WapiTemplate')`. Devuelve el row de `WapiTemplate` recién creado con su `id` y `status` para que el UI pueda navegarlo de inmediato. Anotación explícita `Promise<WapiTemplate>` por el TS2742 (referencia a runtime de Prisma en types inferidos).
- **Wire**: `WapiTemplatesPostingService` registrado en `wapi.module.ts`.
- **Tests** (`wapi-templates-posting.service.spec.ts`, 14 nuevos): sin tenant → Forbidden, config no existe → NotFound, dedup → Conflict, happy path full (header TEXT + body con vars + footer + 3 botones de cada type) verificando shape exacto del payload Meta, header IMAGE sin handle → BadRequest, header IMAGE con handle → `header_handle` array, header TEXT sin text → BadRequest, button URL sin url → BadRequest, button PHONE_NUMBER sin phoneNumber → BadRequest, Graph API 400 con error Meta → ServiceUnavailable preservando mensaje, decryption del accessToken (verifica `Bearer <plaintext>`), Meta sin status en respuesta → default `PENDING`, body sin examples → no incluye `example.body_text`, header NONE → omite el componente HEADER del payload. Backend full: **339/339 ✅** (325 anteriores + 14 nuevos, 0 regresiones).
- **Pendientes intencionales en 4.F.2.a**:
  - **Frontend (4.F.2.b)** — `WapiTemplateEditorPage` con form completo + live preview + AI suggestion placeholder. Va en sesión separada.
  - **Resumable Upload (4.F.2.c)** — endpoint para subir media a Meta y devolver el handle. Sin esto, los templates con header IMAGE/VIDEO/DOCUMENT son inviables desde el UI (sólo posibles vía API directa).
  - **Sync de status post-creación** — los templates entran como PENDING; Meta los revisa async (típicamente ~minutos pero hasta 24h). El status local se actualiza cuando el usuario corre el sync de 4.D, o vía webhook `template_status_update` (4.C los ignora explícitamente — flag para 4.D.1 a futuro).
  - **`metaTemplateId` column** — si necesitamos delete-from-Meta directo sin pasar por el `metaName`, agregar la columna en migration aparte.

### 4.F.1.a + 4.F.1.b — Frontend: admin de WapiConfigs (números) y catálogo de Templates con sync
- **Motivación**: 4.F.1 dejó las campañas operativas pero el usuario no podía crear ninguna campaña real porque no había UI ni para dar de alta un número de WhatsApp (`WapiConfig`) ni para ver/sincronizar los templates aprobados desde Meta. 4.F.2 (editor de templates con posting a Meta) queda postergado hasta cubrir este gap operativo. Ambas pantallas son CRUD/admin sin lógica de negocio nueva — consumen los endpoints REST existentes desde 4.A/4.D.
- **Tipos** (`apps/frontend/src/features/wapi/configs/types.ts`): `WapiConfigListItem` (id, name, phoneNumberId, businessAccountId, isActive, createdAt), `WapiConfigDetail` extiende con `welcomeMessage, optOutConfirmMessage, dailyLimit, updatedAt` (los campos cifrados — accessToken, webhookVerifyToken, appSecret — **NUNCA** los devuelve el backend en `findOne`, así que tampoco existen acá). `CreateWapiConfigPayload` (phoneNumberId/businessAccountId/accessToken/webhookVerifyToken obligatorios, resto opcionales). `UpdateWapiConfigPayload` (todos opcionales + `isActive` boolean — los secrets son string `| null`-able para "deja vacío para no cambiar").
- **`WapiConfigsPage`** (`/dashboard/wapi/configs`): tabla CRUD con columnas Nombre / Phone Number ID / WABA ID / Activo / Creado / acciones. Modal único maneja create y edit con un solo `editing: WapiConfigDetail | null`. En modo edit los 3 campos cifrados (`accessToken`, `webhookVerifyToken`, `appSecret`) son opcionales: placeholder "••••••••" + helper "dejar vacío para no cambiar"; sólo se envían en el PATCH si el usuario tipeó algo. Toggle `showSecrets` con `VisibilityIcon`/`VisibilityOffIcon` global del modal. Switch de `isActive` directo en la fila (PATCH `{ isActive }` sin abrir modal). Empty state con `DnsIcon`. Validación `canSave` exige phoneNumberId+businessAccountId siempre, más accessToken+webhookVerifyToken sólo en create. Delete con `useConfirm`.
- **Tipos templates** (`apps/frontend/src/features/wapi/templates/types.ts`): `WapiTemplateListItem` (id, metaName, category, language, status, createdAt), `WapiTemplateDetail` extiende con `businessAccountId, components: WapiTemplateComponent[] | null, buttonActions, syncedAt`. `WapiTemplateComponent` con `type, format?, text?, buttons?, example?` + `[key: string]: unknown` para los extras de Meta. `WapiSyncSummary` espejo del DTO backend: `{ fetched, created, updated, skipped, pages }`. `WapiConfigOption` mínimo para el dropdown del sync dialog (id, name, phoneNumberId, businessAccountId).
- **`WapiTemplatesListPage`** (`/dashboard/wapi/templates`): listado read-only del catálogo local + acción de sync. Carga `/api/wapi/templates` y `/api/wapi/configs` en paralelo en el primer mount. Tabla con columnas Nombre / Categoría / Idioma / Estado (chip color: APPROVED=success, PENDING/IN_REVIEW=warning, REJECTED=error) / Sincronizado / acciones. Sync dialog: dropdown de configs, botón "Sincronizar" llama `POST /api/wapi/templates/sync/:configId`, al volver muestra los chips del `WapiSyncSummary` (Fetched/Created/Updated/Skipped/Páginas) sin cerrar el dialog. Preview dialog: `TemplatePreview` subcomponent renderiza un mock del bubble de WhatsApp (`bgcolor: '#e5ddd5'` fondo de chat, white message bubble) parseando los `components` por type (HEADER text/image/video/document, BODY con texto crudo, FOOTER en gris pequeño, BUTTONS como botones outlined). Link "Abrir en Meta Business Manager" al template del WABA. Delete avisa "NO lo borra de Meta — sólo del catálogo local; al próximo sync vuelve".
- **Routing + sidebar**: `App.tsx` agrega imports + rutas `/dashboard/wapi/configs` y `/dashboard/wapi/templates`. `Sidebar.tsx`: la entry "Templates" (antes `disabled: true`) ahora linkea al catálogo, y se agrega una nueva entry "Números" (con `DnsIcon`) en la sección WhatsApp. Type-check `@massivo/frontend` queda OK con los archivos nuevos (los 2 errores pre-existentes en `email/campaigns/CampaignDetailPage.tsx` siguen tal cual, no relacionados).
- **Pendientes intencionales en 4.F.1.a/4.F.1.b**: 4.F.1.a no expone los campos `welcomeMessage` / `optOutConfirmMessage` / `dailyLimit` en el form (existen en el DTO backend pero no son críticos para el golden path; agregar después si el usuario los reclama). 4.F.1.b sólo lee y sincroniza — la creación + posting a Meta sale en 4.F.2, junto con el editor visual y el placeholder de IA. No hay tests nuevos: ambas pantallas son admin UI consumiendo endpoints ya cubiertos por specs backend.

### 4.F.1 — Frontend: listado + creación + detalle de campañas WAPI
- **Tipos** (`apps/frontend/src/features/wapi/campaigns/types.ts`): espejo de `email/campaigns/types.ts` adaptado al modelo WAPI. `WapiCampaignStatus` (mismos 6 valores que email), `WapiReportStatus` con `CANCELED` (vs el `BOUNCED|COMPLAINED|SUPPRESSED` de email). `WapiCampaignReport` lleva `funnel: { sent, delivered, read, failed }` derivado de timestamps en el backend (sin `events`: WAPI no tiene EmailEvent). `CampaignContactInput` lleva `phone` en lugar de `email`. `template` expone `{ id, metaName, language, category }`; `configRel` expone `{ id, name, phoneNumberId }`.
- **`WapiCampaignsListPage`** (`/dashboard/wapi/campaigns`): tabla con tabs por estado en la cabecera (`Todas / Borradores / Programadas / En envío / Pausadas / Completadas / Fallidas`), counts en cada tab calculados client-side desde el array. Modal de creación pidiendo solo el nombre (template/config/contactos se cargan en el detalle). Skeleton loaders mientras carga, empty state con ícono de WhatsApp. Suscribe a `wapi.report.updated` para refrescar la lista en vivo cuando una campaña cambia de estado.
- **`WapiCampaignDetailPage`** (`/dashboard/wapi/campaigns/:id`): header con chip de status, banner de processing (cuando `PROCESSING|PAUSED`), bloque de resultados (counts + tasas de entrega y lectura derivadas del funnel), form de configuración (nombre / template / número origen / scheduledAt) editable solo en `DRAFT|SCHEDULED|PAUSED`, sección de envíos paginada y bloque de carga de contactos por CSV. Auto-refresh por socket `wapi.report.updated` filtrado por `campaignId`.
- **Parser CSV de contactos** (`parseContactsCsv`): detecta header con `phone|telefono|teléfono`, normaliza el teléfono (conserva `+` inicial, descarta espacios/guiones/paréntesis) y valida contra el mismo regex E.164 lenient del backend (`^\+?[0-9]{6,20}$`). Columnas extra del CSV se mandan como `data` para que el worker las pueda usar como vars del template (ej: `firstName`).
- **`WapiCampaignProcessingBanner`**: banner de envío en vivo mientras `PROCESSING|PAUSED`. Progress bar (determinate cuando hay datos frescos del groupBy, indeterminate mientras inicia), throughput estimado (envíos/min en ventana rolling de 60s), chips por estado (Pendientes/Enviados/Entregados/Leídos/Fallidos/Cancelados), botones de Pausar/Reanudar/Forzar cierre, y consola colapsable de log con ring buffer de 200 entries que filtra eventos `wapi.report.log` por `campaignId` (soporta múltiples campañas en simultáneo). Status filter (Todos/Enviados/Fallidos/Cancelados) y botón "Limpiar".
- **`WapiCampaignSendsSection`**: tabla paginada con cursor (50 por página) de envíos individuales con filtro por estado, mostrando contacto (name + phone), status chip, sufijo del `wamid` (últimos 12 chars) y timestamps de `sentAt/deliveredAt/readAt`. Tooltip con error completo en filas FAILED. Refresh manual y refresh automático cuando llega socket update (via `refreshKey`).
- **Routing + sidebar**: rutas `/dashboard/wapi/campaigns` y `/dashboard/wapi/campaigns/:id` agregadas en `App.tsx`. Entry "Campañas" en la sección "WhatsApp" del sidebar pasó de `disabled` a link real. Templates queda como `disabled` hasta 4.F.2.
- **No hay nuevos endpoints backend** — el frontend consume los 11 endpoints REST de 4.E + `/api/wapi/templates` y `/api/wapi/configs` (existentes desde 4.A/4.D). Type-check del paquete `@massivo/frontend` queda OK con los archivos nuevos (errores de `tsc -b` en `email/campaigns/CampaignDetailPage.tsx` líneas 66/70 son pre-existentes y no relacionados).
- **Pendientes intencionales en 4.F.1**: verificación visual end-to-end queda al usuario (golden path: crear → addContacts CSV → sync templates → seleccionar template+config → send → ver progreso en vivo). 4.F.2 agrega la creación de templates desde Massivo y posting a Meta. 4.F.3-4.F.4 cubren inbox conversacional.

### 4.E — CRUD completo de campañas WAPI
- **Schema — enum `WapiReportStatus`**: agregado valor `CANCELED` (migration `20260504202315_add_canceled_to_wapi_report_status`). Antes el cierre forzado marcaba reports PENDING como `FAILED` con `error='campaign-closed'`, ensuciando los counts de fallas reales del envío. Ahora `forceClose` los marca `CANCELED` y el funnel agregado los segrega claramente. Espejo del enum `EmailReportStatus`.
- **DTOs** (`wapi-campaigns.dto.ts`): `CreateWapiCampaignDto`, `UpdateWapiCampaignDto`, `WapiCampaignContactDto` (`phone` con regex E.164 lenient `^\+?[0-9]{6,20}$`, sin `IsPhoneNumber` estricto para no bloquear formatos válidos no-i18n), `AddWapiCampaignContactsDto` (ArrayMinSize 1, ArrayMaxSize 5000 — mismo cap que email).
- **`WapiCampaignsService`** — service ahora completo (era placeholder send-only): `create` (`scheduledAt` futuro → SCHEDULED, sino DRAFT), `findAll` (con `_count: { contacts, reports }`), `findOne` (incluye `template { metaName, language, category }` y `configRel { name, phoneNumberId }`), `update` (sólo en estados editables DRAFT/SCHEDULED/PAUSED), `remove` (bloqueado en PROCESSING), `addContacts` (createMany con `phone.trim()`, mismo flujo que email).
- **Control actions** (paridad email): `pause` (PROCESSING → PAUSED), `resume` (PAUSED → PROCESSING + re-enquola PENDING vía BullMQ jobId=reportId — idempotente), `forceClose` (PROCESSING|PAUSED → COMPLETED, marca PENDING como `CANCELED` con `error='force-closed'`).
- **Reportes**: `listReports` (cursor pagination 1-200, filtro por status, incluye `phone, metaMessageId, sentAt, deliveredAt, readAt, failedAt, error, createdAt, contact{id,phone,name}`), `getReport` (groupBy por status con shape completo `{ PENDING, SENT, DELIVERED, READ, FAILED, CANCELED }` + `funnel` derivado de timestamps `WapiReport.sentAt/deliveredAt/readAt/failedAt`). No hay `listReportEvents` (WAPI no tiene `EmailEvent`: los timestamps viven directo en el report).
- **Worker — handling de CANCELED**: `WapiWorkerService.process` ahora hace early-exit si `report.status !== 'PENDING'` (antes el job se procesaba aunque estuviera CANCELED, mandando el mensaje igual — bug latente que se manifestaba en jobs ya enquolados al ejecutar `forceClose`). El branch `campaign COMPLETED|FAILED + report PENDING` ahora marca `CANCELED` (no `FAILED`) con `error='campaign-closed'` para que los jobs huérfanos cierren limpios.
- **Endpoints** (`WapiCampaignsController`): GET `/api/wapi/campaigns`, GET `/:id`, GET `/:id/report`, GET `/:id/reports`, POST `/`, PATCH `/:id`, POST `/:id/contacts`, POST `/:id/send` (existente), POST `/:id/pause`, POST `/:id/resume`, POST `/:id/force-close`, DELETE `/:id`. Policies CASL: `read|create|update|delete|send` sobre `Campaign`.
- **Tests** (24 nuevos en `wapi-campaigns.service.spec.ts` + 1 nuevo en `wapi-worker.service.spec.ts` para el caso "report ya CANCELED → skip"): create (3 casos), update, addContacts (con trim), send (5 casos: happy, sin contactos/templateId/configId, PROCESSING, NotFound), getReport (counts + funnel), pause/resume/forceClose (paridad email), remove, listReports (cursor). Backend full: **325/325 ✅** (300 anteriores + 24 nuevos del service + 1 nuevo del worker; +0 regresiones, el spec del worker se actualizó para `CANCELED`).
- **Pendientes intencionales en 4.E**: UI frontend (4.F — Inbox + admin de campañas WAPI). Deduplicación opcional de `phone` al `addContacts` (hoy el mismo número se acepta dos veces; en email pasa lo mismo, lo dejamos consistente). Cron de campañas SCHEDULED (Fase 8).

### 4.C.1 — Webhook URL única (refactor multi-config)
- **Cambio de contrato**: `POST/GET /api/webhooks/wapi/:configId` → `POST/GET /api/webhooks/wapi` (URL única para todo el SaaS). Motivo: Meta solo permite registrar **una** webhook URL por App, así que dos `WapiConfig` que comparten App (mismo `appSecret`/`webhookVerifyToken`) no se pueden distinguir vía URL — el `:configId` era un bug latente para ese caso.
- **GET verify**: ahora escanea las `WapiConfig` activas, decripta el `webhookVerifyTokenEnc` de cada una y compara timing-safe contra `hub.verify_token`. La primera que matchea gana. Performance: la verify es one-shot al registrar el webhook (no es hot path), y el `EncryptionService` LRU cachea decrypts.
- **POST events**: extrae los `phone_number_id` únicos del payload (`entry[].changes[].value.metadata.phone_number_id`), busca los configs correspondientes en una sola query (`findMany({ phoneNumberId: { in: [...] } })`), valida HMAC con el `appSecret` del primer config encontrado (todos los configs de la misma App lo comparten, así que cualquiera sirve), y le pasa al service un `Map<phoneNumberId, ResolvedWebhookConfig>`. Sin matches → 404.
- **Service**: `WapiWebhookService.process(payload, configByPhoneNumberId)`. Itera entry-by-entry, resuelve config por `phone_number_id`, corre cada `value` en su propio `TenantContext.run` para que la Prisma extension scopée bien por tenant. Si Meta batchea events de N números en un mismo POST, cada uno se procesa contra su tenant correcto.
- **Tests** (5 nuevos en webhook spec, 25/25 totales): match en 2ª config, multi-config (mismo App, dos números) carga ambos en el map, phone_number_id sin config matching → 404, payload sin phone_number_id → ignorado sin tocar DB, multi-tenant en un mismo POST procesa cada entry contra su tenant. Backend full: **300/300 ✅**.

### 4.D — Sync de templates Meta
- **Backend — `WapiTemplatesSyncService`** (`apps/backend/src/modules/wapi/templates-sync/`): pull de templates desde Meta Graph API v20 (`GET /<businessAccountId>/message_templates`) hacia `WapiTemplate`. Carga la `WapiConfig` por id vía `prisma.scoped` (cross-tenant 404 natural), decripta `accessTokenEnc` con `EncryptionService`, pagina por `paging.next` hasta `MAX_PAGES=5` (~500 templates como safety guard contra `paging.next` malformado). Usa `fetch` nativo (Node 22, sin deps); URL base override-able vía `WAPI_GRAPH_BASE_URL` (mismo env que el sender).
- **Upsert idempotente**: por cada template Meta, `findFirst({ metaName, businessAccountId })` (teamId implícito vía scoped). Si no existe → `create`. Si existe y `(status, language, category, components)` son idénticos → `skipped` (no toca `syncedAt`, ahorra DB writes en re-syncs inocentes). Si difieren → `update` con `syncedAt = now`. Comparación de `components` por `JSON.stringify` (suficiente para los shapes de Meta).
- **Errores**: sin tenant context → `ForbiddenException`. Config no encontrada / cross-tenant → `NotFoundException`. Graph API non-2xx (incluye 401 token inválido, 5xx temporales) → `ServiceUnavailableException` con `code` y `message` del error de Meta. Devuelve `SyncSummary { fetched, created, updated, skipped, pages }`.
- **Endpoint** `POST /api/wapi/templates/sync/:configId` agregado a `WapiTemplatesController` con `@CheckPolicies('create', 'WapiTemplate')`. Devuelve el `SyncSummary` para que el UI muestre toast con el desglose.
- **No removemos templates eliminados en Meta**: si un template se borra del lado de Meta, queda en BD con su último `status` conocido. Cleanup manual vía `DELETE /api/wapi/templates/:id`. Esto evita borrar registros referenciados por campañas históricas.
- **Tests** (9 nuevos): `wapi-templates-sync.service.spec.ts`: sin tenant context Forbidden, config no existe NotFound, happy 1 página (2 created), paginación `paging.next` (3 templates en 2 páginas), existing idéntico skipped sin DB write, existing con status distinto updated, Graph API 401 ServiceUnavailable, safety guard MAX_PAGES con `paging.next` infinito (corta en 5), decripta `accessToken` con `EncryptionService` antes de fetch (verifica `Bearer real-token`). Backend full: **295/295 ✅** (286 anteriores + 9 nuevos, 0 regresiones).
- **Pendientes intencionales en 4.D**: cron semanal automatizado (Fase 8 — `ScheduledTask` con `kind=WAPI_TEMPLATES_SYNC`). Procesar `template_status_update` desde el webhook Meta (4.C los ignora) para reflejar APPROVED/REJECTED en tiempo real sin esperar al sync manual.

### 4.C — Webhook Meta WhatsApp Cloud API
- **Backend — `WapiWebhookController`** (`apps/backend/src/modules/wapi/webhook/`): endpoint público bajo `/api/webhooks/wapi/:configId` con `@SkipTenantScope` (Meta no manda Authorization).
  - **GET**: verificación al registrar el webhook en el dashboard de Meta. Espera `hub.mode=subscribe`, compara `hub.verify_token` (timing-safe equal) contra `WapiConfig.webhookVerifyTokenEnc` decriptado, devuelve `hub.challenge` o 403.
  - **POST**: recibe eventos. Valida firma `X-Hub-Signature-256` (HMAC-SHA256 sobre el rawBody con `appSecret` decriptado, comparación constante en tiempo). Si la `WapiConfig` no tiene `appSecret` seteado, acepta sin verificar y loggea warning (modo dev — producción debería tenerlo obligatorio). Lee el rawBody vía `RawBodyRequest<Request>` (ya habilitado en `main.ts:rawBody:true`). Resuelve tenant por `configId` → `(organizationId, teamId)` y delega al service.
- **Backend — `WapiWebhookService`**: procesa el payload Meta `{ object: 'whatsapp_business_account', entry: [{ changes: [{ value: ... }] }] }`:
  - **`statuses[]`** → mapea a `WapiReport` por `metaMessageId` único: `delivered` → DELIVERED + `deliveredAt`, `read` → READ + `readAt` + `deliveredAt` si no estaba, `failed` → FAILED + `failedAt` + `error` desde `errors[0]` (`code:title — message`). `sent` es no-op (ya marcamos SENT en el ack del POST). **No retrocede**: si el report ya está READ y llega un `delivered`, lo ignora. Emite `wapi.report.updated` (debounced) tras cada update.
  - **`messages[]`** (entrantes del usuario) → `upsert WapiConversation(teamId, configId, phone)` con `lastMessageAt`, `window24hAt = now+24h`, `unreadCount++`, `name` desde `contacts[0].profile.name`. Crea `WapiMessage` con `metaMessageId @unique`, `fromMe=false`, `type` crudo de Meta (text/image/audio/video/document/sticker/button/interactive/reaction), `content` con sub-objeto del tipo + `context` para que el inbox de 4.F pueda renderizar todo. Emite `wapi.message.inbound` per mensaje.
  - **Idempotencia**: dup de `metaMessageId` (Meta reintenta hasta 200) → P2002 swallowed con log debug.
- **Tipos** (`wapi-webhook.types.ts`): shapes mínimos del payload de Meta. Texto, media (image/audio/video/document/sticker), button, interactive (button_reply/list_reply), reaction, context. El payload crudo se persiste en `WapiMessage.content` para no perder info.
- **Pendientes intencionales en 4.C**: descarga de media (los `messages.image.id` son media IDs que requieren GET adicional al Graph API + S3 upload — viene en 4.F inbox). Auto-reply welcome message cuando llega mensaje de número sin conversación previa (4.I). Auto-detección de keywords opt-out "BAJA"/"STOP" (4.H). `template_status_update` y `account_alerts` en `entry.changes.field` quedan ignorados (no son `messages`).
- **Tests** (20 nuevos): `wapi-webhook.controller.spec.ts` (10 tests: GET verify happy/mismatch/wrong-mode/not-found, POST signature válida/inválida/sin-appSecret/object-distinto/no-JSON/not-found). `wapi-webhook.service.spec.ts` (10 tests: status delivered/read/read-cuando-DELIVERED/no-retrocede-READ→delivered/failed-con-errors/sent-noop/sin-report-skip + mensaje text/dup-P2002/image-content). Backend full: **286/286 ✅**.

### 4.B — Encriptación de tokens at-rest (AES-256-GCM)
- **Backend — `EncryptionService`** (`apps/backend/src/common/security/`): clase abstracta + impl concreta `AesGcmEncryptionService` detrás de un `SecurityModule` `@Global`. AES-256-GCM con master key desde `MASSIVO_ENCRYPTION_KEY` (hex, 32 bytes) o `MASSIVO_ENCRYPTION_KEY_B64` (base64). IV random per-encrypt (12 bytes), authTag (16 bytes) detecta tampering. Formato versionado `v1:<iv>:<ct>:<tag>` (base64url) — el día que cambiemos de algo o de provider, sólo cambia la versión. **Diseño cloud-agnostic**: NO acopla a AWS KMS / GCP / Vault — para swappearlo más adelante, basta agregar otro impl al `SecurityModule` (`useExisting` cambia y los call sites no se tocan).
- **Cache LRU TTL** (5min, max 256 entries) sobre los valores decriptados — un `WapiConfig` con muchos sends no re-corre AES en cada job.
- **Modo legacy** para dev sin clave: si `MASSIVO_ENCRYPTION_KEY` no está seteada, `encrypt()` es no-op (persiste plaintext) y `decrypt()` devuelve el valor tal cual mientras NO tenga prefijo `v1:`. Detecta y rechaza versiones desconocidas (`v9:...` → error). Un valor `v1:...` con la clave ausente tira (no podemos decriptarlo).
- **`WapiConfigsService.create/update`** ahora encripta `accessToken` / `webhookVerifyToken` / `appSecret` antes de persistir. `update` respeta `appSecret: null` (limpia el campo) sin pasarlo por encrypt.
- **`WapiWorkerService.process`** decripta `cfg.accessTokenEnc` antes de pasarlo al sender — reemplaza el TODO 4.B que estaba ahí desde 4.A.
- **Backward-compat**: las `WapiConfig` sembradas en 2.B con valores plaintext se leen sin error gracias al modo legacy del decrypt — al editarlas vía endpoint, se re-persisten encriptadas.
- **Env**: `.env.example` documenta las dos vars (hex/base64) con el comando para generarla (`openssl rand -hex 32`) y la advertencia de no perder la clave.
- **Tests**: `encryption.service.spec.ts` (11 tests: roundtrip, IV random per-encrypt, tamper detection, versión desconocida, clave de tamaño incorrecto, soporte base64, modo legacy, cache hit). Mocks en `tenant-isolation.spec.ts` y `wapi-configs.service.spec.ts` actualizados. Backend full: **266/266 ✅**.

### 4.A — Infra de envío WhatsApp Cloud API
- **Backend — `WapiSenderService`** (`apps/backend/src/modules/wapi/sender/`): cliente HTTP a Graph API v20 `/messages` usando `fetch` nativo (Node 22 / undici bundled — sin deps nuevas). Métodos `sendText` / `sendTemplate` / `sendMedia` que devuelven `{ metaMessageId, raw }`. Errores Meta normalizados en `WapiSendException` con `{ code, subCode, message, isRateLimit, isAuth, retryable, raw }`. Conoce los códigos de rate limit (130429, 131048, 131056) y de auth (190, 102, 10, 200) para que el worker decida backoff vs FAILED definitivo. URL base override-able vía `WAPI_GRAPH_BASE_URL` (mocks/staging).
- **Backend — `WapiQueueService`** (`apps/backend/src/modules/wapi/queue/`): wrapper sobre BullMQ Queue `wapi-send` con `jobId=reportId` para idempotencia. Mismo `attempts:3 + backoff exponencial` y TTLs que `email-send`. Acepta `delayMs` opcional al enquolar.
- **Backend — `WapiWorkerService`**: BullMQ Worker que procesa los jobs. Por cada job:
  - Reconstruye `TenantContext` desde el payload (orgId/teamId, role sintético `OWNER`/`ADMIN`).
  - Carga `WapiReport` + `WapiContact` + `WapiCampaign(template, configRel)` via `prisma.scoped` — falla naturalmente si el job es de otro tenant.
  - Control actions de campaña (paridad con email 3.C.5): `PAUSED` → `job.moveToDelayed(now + 30s)` y exit; `COMPLETED|FAILED` con report PENDING → marca FAILED con `error='campaign-closed'`.
  - **Rate limiting per-config**: cuenta `WapiReport.SENT` con la misma `configId` en las últimas 24h (filtro `campaign.configId`); si alcanzó `WapiConfig.dailyLimit` (default 200), `moveToDelayed(now + 1h)` y exit.
  - Llama `WapiSenderService.sendTemplate` con `templateName` / `language` del `WapiTemplate` y opcionalmente `components` mapeados desde `WapiContact.data` según `campaign.config.bodyVars` (array de keys).
  - Marca `WapiReport.SENT` con `metaMessageId` + `sentAt`. Emite `wapi.report.updated` (debounced) + `wapi.report.log` (cada transición). Llama `maybeCompleteCampaign` para transicionar `PROCESSING` → `COMPLETED` cuando no quedan PENDING.
  - **Jitter post-envío**: tras un SENT exitoso, sleep `random(WAPI_DELAY_MIN_MS, WAPI_DELAY_MAX_MS)` (defaults 30s/60s). Con `concurrency=1` (default) esto da rate limiting efectivo per-worker.
  - **Backoff exponencial Meta rate-limit**: si el sender tira `WapiSendException` con `isRateLimit=true`, NO marca FAILED — `moveToDelayed(now + min(60s × 2^attempt, 1h))` para no perder el report.
  - Otros errores (auth, 5xx no-retryable, errores no-Meta) → marca FAILED + rethrow para que BullMQ aplique sus retries del `defaultJobOptions`.
- **Endpoint placeholder** `POST /api/wapi/campaigns/:id/send` (`WapiCampaignsController` con `@CheckPolicies('send', 'Campaign')`): valida estado de la campaña (DRAFT/SCHEDULED/PAUSED), templateId/configId/contacts, marca `PROCESSING`, crea un `WapiReport` por contacto en `$transaction`, y enquola un job por cada uno. CRUD completo (create/update/addContacts/control actions/getReport) viene en 4.E.
- **Pendientes intencionales en 4.A**: encriptación KMS de `accessTokenEnc` (4.B) — el worker lee el token en claro con `// TODO 4.B`. Webhook Meta + statuses (delivered/read/failed) (4.C). Opt-out check pre-envío (4.H — requiere agregar `SUPPRESSED` al enum `WapiReportStatus`). Inbox conversacional (4.F).
- **Tests**: `wapi-sender.service.spec.ts` (8 tests: sendText/Template happy path, code 131056 → isRateLimit, code 190 → isAuth, 200 sin messages[].id, 5xx genérico, 429 sin error.code, override de `WAPI_GRAPH_BASE_URL`). `wapi-worker.service.spec.ts` (9 tests: happy path, report not found cross-tenant, PAUSED, COMPLETED+PENDING → FAILED, dailyLimit alcanzado, rate-limit code 131056 → moveToDelayed sin FAILED, error auth → FAILED + rethrow, components con bodyVars del config, transición a COMPLETED). Backend full: **255/255 ✅**.
- **Fix colateral**: `email/reports/report-generator.service.spec.ts` — tipo del buffer pasado a `wb.xlsx.load()` no asignaba bajo strict (Buffer<ArrayBufferLike> vs Buffer requerido por exceljs); cast `as never` puntual. Era TS strict-only — los tests pasaban porque ts-jest es más permisivo.

### 3.D — Reportes consolidados con export (CSV/XLSX)
- **Backend**: nuevo `ReportGeneratorService` (`apps/backend/src/modules/email/reports/`) con 4 generators sync que devuelven `{ filename, mime, buffer }`:
  - `campaign-summary` — una fila por campaña con counts agregados (PENDING/SENT/FAILED/BOUNCED/COMPLAINED/SUPPRESSED/CANCELED) + uniqueOpens/uniqueClicks + openRate/clickRate.
  - `campaign-reports` — detalle por contacto (email, status, sentAt, 1ª apertura, 1er click, count events, smtpMessageId, error). Acepta filtro `status`.
  - `bounces-complaints` — combina `EmailBounce` + `EmailReport.status=COMPLAINED` en un rango (default últimos 30 días, override `fromDate`/`toDate`), ordenado descendente.
  - `suppressions` — snapshot completo de `EmailUnsubscribe` del team.
- **Endpoint** `POST /api/email/reports/generate` con DTO class-validator (`kind`, `format`, `campaignId?`, `status?`, `fromDate?`, `toDate?`). Devuelve binary attachment con `Content-Disposition: attachment; filename="…"`. CASL: requiere `read Campaign` AND `read EmailSuppression` (ambas las tienen los roles MEMBER/ADMIN actuales).
- **Estrategia**: sync-only, single Buffer en memoria, suficiente hasta ~50k filas. Datasets más grandes + scheduler agendable diferidos a Fase 8 (BullMQ + S3).
- **Libs**: `csv-stringify@^6.7.0` (sync API) + `exceljs@^4.4.0` (XLSX con header bold + columnas con width).
- **Frontend**: nuevo componente reutilizable `ExportReportButton` (`apps/frontend/src/features/email/reports/`) con split-menu CSV/Excel. `useApi` extendido con método `download(path, body, fallbackFilename)` que devuelve `{ blob, filename }` parseando `Content-Disposition`, y helper `triggerBlobDownload` que crea un `<a>` temporal con `URL.createObjectURL`. Botones cableados en:
  - `CampaignDetailPage` → "Resumen" + "Detalle por contacto" en el panel de Resultados.
  - `SuppressionsPage` → "Exportar unsubs" + "Exportar bounces/complaints" en el header.
- **Tests**: `report-generator.service.spec` cubre los 4 generators con asserts de header CSV + datos + parseo XLSX (header bold, valores numéricos), errores BadRequest/NotFound, y respeta `fromDate/toDate`. Backend full: **238/238 ✅**.

### 3.C.5 — Control actions de campaña (pausar / reanudar / forzar cierre)
- **Schema**: nuevo valor `CANCELED` en el enum `EmailReportStatus` para reports descartados por force-close. Migración `20260504181455_add_canceled_report_status` aplicada en Postgres local vía WSL.
- **Backend** (`EmailCampaignsService`): tres métodos nuevos con guards de status y notificación por socket (`emitToTeamDebounced`):
  - `pause(id)` — sólo desde `PROCESSING` → `PAUSED` (Conflict en cualquier otro estado).
  - `resume(id)` — sólo desde `PAUSED` → `PROCESSING` y re-encola los reports `PENDING` (idempotente vía `jobId=reportId`).
  - `forceClose(id)` — desde `PROCESSING` o `PAUSED` → `COMPLETED`; `updateMany` marca los `PENDING` como `CANCELED` con `error='force-closed'`.
- **Endpoints** nuevos en `EmailCampaignsController`, todos con `@CheckPolicies((a) => a.can('send', 'Campaign'))`: `POST /api/email/campaigns/:id/pause | /resume | /force-close`.
- **Worker** (`EmailWorkerService.process`): chequea el estado de la campaña antes de enviar:
  - Si `campaign.status === 'PAUSED'` y el report está `PENDING` → `job.moveToDelayed(now+30s, job.token)` y exit (no toca el report).
  - Si `campaign.status` es `COMPLETED`/`FAILED` (force-close) y el report está `PENDING` → marca `CANCELED` con `error='campaign-closed'` y exit.
  - Estrategia "DB-flag + worker check" en lugar de cancelar en BullMQ: idempotente, sobrevive reinicios del worker, sin race con jobs ya tomados.
- **Frontend**: `CampaignProcessingBanner` ahora se muestra también en estado `PAUSED` (icono `PauseCircle`, título "Campaña pausada", barra warning) y recibe `status` + handlers `onPause`/`onResume`/`onForceClose` + flag `actionsBusy`. Tres botones nuevos: Pausar (sólo en PROCESSING), Reanudar (sólo en PAUSED) y Forzar cierre (en ambos, con `useConfirm` destructive). `CampaignDetailPage` cablea las acciones contra los nuevos endpoints con `useNotify` para feedback de éxito/error y refresh de campaign+report tras cada acción.
- **Tests**: `email-campaigns.service.spec.ts` cubre los 3 métodos nuevos y todos los branches de error (Conflict, NotFound) — 7 casos nuevos. `email-worker.service.spec.ts` agrega 2 casos: PAUSED → moveToDelayed sin tocar report ni sender, y COMPLETED por force-close → CANCELED. Backend test suite: **228/228 ✅**.

### 3.C.4.f — Log en vivo por campaña + fix throttle de socket
- **Backend**: `EmailWorkerService` ahora emite un evento `email.report.log` por cada transición de report (`SENT` / `FAILED` / `SUPPRESSED`) con payload `{ campaignId, reportId, email, status, messageId?, error?, ts }`. **No** está throttleado — el frontend se encarga del filtrado y ring buffer. Tests del worker actualizados (7/7 ✅) cubriendo asserts de `email.report.log` en cada transición.
- **Backend**: `EventsService.emitToTeamDebounced` reescrito de debounce puro a **throttle leading+trailing** (1s window): el primer emit del burst sale inmediato + máximo 1 emit/seg con el payload más reciente. El debounce puro nunca disparaba durante un envío activo (cada nueva transición reseteaba el timer), dejando la barra de progreso pegada en 0%. Tests events: 11/11 ✅.
- **Frontend**: `CampaignProcessingBanner` ahora recibe `socket` + `campaignId` y agrega panel **Log en vivo** colapsable, estilo consola dark (monospace, scroll automático), con:
  - Filtro por status (Todos / Enviados / Fallidos / Suprimidos).
  - Ring buffer de los últimos 200 entries.
  - Botón "Limpiar".
  - Cada línea: `[hh:mm:ss] ✓ SENT user@domain.com · msgId=…` (verde / rojo / violeta según status).
- **Multi-campaña**: cada banner filtra los logs por su `campaignId` antes de pushearlos al buffer, así que con varias campañas en simultáneo (hasta 5) cada una sólo ve sus propios eventos. El reset del buffer está atado al cambio de `campaignId`.
- **Fix relacionado**: `handleSend` ahora dispara `loadReport()` además de `load()`, y el banner muestra `LinearProgress` indeterminate + "Iniciando envío…" cuando todos los counts vienen en 0 — evitaba que la barra se viera en 100% durante el primer segundo del envío.

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
