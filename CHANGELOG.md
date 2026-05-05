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
