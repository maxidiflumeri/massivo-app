# Diseño: multi-canal + bot único + inbox unificado

> Objetivo: pasar de "un bot por WABA de Meta + inbox solo-WhatsApp" a
> **un bot que se diseña una vez y se conecta a N canales** (WhatsApp, Instagram,
> Messenger, Webchat), con un **inbox omnicanal**.
>
> Estado actual relevante (verificado en código):
> - Toda la config del bot vive como columnas de `WapiConfig` (`botFlow`,
>   `botTopics`, `botRouter`, `botVariables` + drafts + TTLs). El bot se diseña
>   **por WABA**. → `packages/prisma/prisma/schema.prisma:629-704`
> - La sesión del bot se llavea por `(configId, phone)`. → `schema.prisma:960-988`
> - El runtime del bot ya es **puro y agnóstico al canal** ("sin logger, sin DB,
>   sin sender"). → `apps/backend/src/modules/wapi/bot/bot-flow-runtime.ts:1-9`
> - El acoplamiento a WhatsApp en el motor está concentrado en `deliverNode`
>   (~90 líneas). → `wapi-bot-engine.service.ts:760-836`
> - El inbox ya es ~85% agnóstico: de ~20 campos de `WapiConversation` solo
>   `phone`, `window24hAt` y `configId` tienen sabor a canal. → `schema.prisma:811-865`
> - El router ya recibe un input discriminado (`text | template-payload`) y es
>   casi agnóstico. → `wapi-bot-router.service.ts:29-31`

---

## 1. Principio rector: separar 3 conceptos hoy fusionados

Hoy `WapiConfig` mezcla tres responsabilidades. El diseño las separa en entidades
ortogonales:

| Concepto | Pregunta que responde | Hoy vive en | Pasa a |
|---|---|---|---|
| **Canal** (conexión/connector) | "cómo mando/recibo bytes a una plataforma" | `WapiConfig` (creds + transporte) | `Channel` |
| **Bot** (el cerebro) | "qué hace el asistente" | `WapiConfig.bot*` | `Bot` (entidad propia) |
| **Conversación** (estado runtime) | "quién está hablando, asignación, historial" | `WapiConversation` / `WapiMessage` / `WapiBotSession` | `Conversation` / `Message` / `BotSession` |

La relación clave que habilita tu requisito:

```
Bot (1) ──< (N) Channel ──< (N) Conversation ──< (N) Message
                                      │
                                      └── BotSession (por conversación)
```

**Un `Bot` se diseña una vez** y se conecta a varios `Channel` vía
`Channel.botId`. Un número de WhatsApp, una cuenta de IG, una página de Messenger
y un widget de webchat pueden apuntar todos al **mismo** `Bot`.

---

## 2. Modelo de datos nuevo

### 2.1 `Bot` — el cerebro, diseñado una vez

Extrae **tal cual** las columnas `bot*` de `WapiConfig`. Los shapes JSON
(flow/topics/router/variables) **no cambian** → el runtime no se toca.

```prisma
model Bot {
  id             String   @id @default(cuid())
  organizationId String
  teamId         String
  name           String
  enabled        Boolean  @default(true)

  // Versión publicada (lo que corre prod) — copiado de WapiConfig.botTopics/botRouter/botVariables
  topics         Json?    // BotTopic[]
  router         Json?    // BotRouter
  variables      Json?    // BotVariable[]

  // Versión en edición (sandbox) — copiado de WapiConfig.bot*Draft
  topicsDraft    Json?
  routerDraft    Json?
  variablesDraft Json?
  draftUpdatedAt DateTime?
  publishedAt    DateTime?

  // Flow legacy (single-flow pre-topics) para backward compat de migración
  flow           Json?

  // Config de runtime
  sessionTtlMin  Int      @default(30)
  waitingTtlMin  Int      @default(120)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  team           Team         @relation(fields: [teamId], references: [id], onDelete: Cascade)
  channels       Channel[]
  sessions       BotSession[]

  @@index([organizationId])
  @@index([teamId])
}
```

### 2.2 `Channel` — la conexión a una plataforma

Reemplaza la parte de I/O de `WapiConfig`. Las credenciales son un JSON cifrado
con shape **por kind** (solo el adapter de ese canal lo lee).

```prisma
enum ChannelKind {
  WHATSAPP    // hoy "WAPI"
  INSTAGRAM
  MESSENGER
  WEBCHAT
  EMAIL       // ya existe; queda fuera del scope del bot pero entra al enum unificado
}

enum ChannelStatus {
  ACTIVE
  DISABLED
  PENDING_AUTH
  ERROR
}

model Channel {
  id             String        @id @default(cuid())
  organizationId String
  teamId         String
  name           String
  kind           ChannelKind
  status         ChannelStatus @default(ACTIVE)

  // Credenciales cifradas, shape por kind (ver §10 — modelo de alta):
  //  WHATSAPP  : { phoneNumberId, businessAccountId, accessToken, verifyToken, appSecret }
  //  MESSENGER : { appId, appSecret, verifyToken, pageId, pageAccessToken }
  //  INSTAGRAM : { appId, appSecret, verifyToken, pageId, igBusinessAccountId, pageAccessToken }
  //  WEBCHAT   : { widgetKey, allowedOrigins[] }
  credentialsEnc String

  // Ajustes operativos por canal (lo que hoy son columnas sueltas de WapiConfig)
  settings       Json?    // { sendDelayMinMs, sendDelayMaxMs, dailyLimit, optOutKeywords[], welcomeMessage, ... }
  isTestMode     Boolean  @default(false)

  // Bot conectado (nullable: un canal puede no tener bot)
  botId          String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  team           Team           @relation(fields: [teamId], references: [id], onDelete: Cascade)
  bot            Bot?           @relation(fields: [botId], references: [id], onDelete: SetNull)
  conversations  Conversation[]
  sessions       BotSession[]

  @@index([organizationId])
  @@index([teamId])
  @@index([teamId, kind])
}
```

### 2.3 `Conversation` — unificada (reemplaza `WapiConversation`)

Casi todo es rename/carry-over. Cambios conceptuales: `phone→externalUserId`,
`window24hAt→freeformWindowAt`, `configId→channelId`, + `channelKind`
denormalizado para filtrar rápido en el inbox.

```prisma
model Conversation {
  id                 String   @id @default(cuid())
  organizationId     String
  teamId             String
  channelId          String
  channelKind        ChannelKind          // denormalizado para el inbox
  externalUserId     String               // phone | IG-scoped-id | webchat-session-id
  displayName        String?
  avatarUrl          String?

  status             ConversationStatus @default(UNASSIGNED)  // enum sin cambios
  assignedUserId     String?
  lastAssignedUserId String?
  lastMessageAt      DateTime?
  firstReplyAt       DateTime?
  resolvedAt         DateTime?
  unreadCount        Int      @default(0)
  lastReadAt         DateTime?
  priority           Boolean  @default(false)
  escalated          Boolean  @default(false)
  botSuspended       Boolean  @default(false)
  waitingUntil       DateTime?

  // Generaliza window24hAt: ventana de freeform del canal.
  // null en WEBCHAT = siempre abierta; con fecha en canales Meta (24h).
  freeformWindowAt   DateTime?

  campaignName       String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  channel  Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)
  messages Message[]
  notes    ResolutionNote[]

  @@unique([teamId, channelId, externalUserId])  // era [teamId, configId, phone]
  @@index([organizationId])
  @@index([teamId, status, lastMessageAt])
  @@index([teamId, channelKind, lastMessageAt])  // inbox filtra por canal
  @@index([teamId, escalated, lastMessageAt])
  @@index([assignedUserId])
}
```

### 2.4 `Message` — unificada (reemplaza `WapiMessage`)

`content` ya es JSON flexible y las columnas de media ya son genéricas → casi sin
cambios. Ojo con la **idempotencia**: hoy `metaMessageId @unique` global; un id
externo solo es único **dentro de un canal** → unique compuesto.

```prisma
model Message {
  id             String   @id @default(cuid())
  organizationId String
  teamId         String
  conversationId String
  channelId      String
  externalId     String?  // era metaMessageId (en webchat lo generamos nosotros)
  fromMe         Boolean
  type           String   // "text" | "interactive" | "image" | ...
  content        Json
  status         String   // "sent" | "delivered" | "read" | "failed"
  timestamp      DateTime

  // media (ya genérico hoy)
  mediaId        String?
  mediaMime      String?
  mediaSha256    String?
  mediaSize      Int?
  mediaFilename  String?
  mediaCaption   String?
  mediaLocalPath String?

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([channelId, externalId])  // idempotencia por canal (era metaMessageId global)
  @@index([conversationId, timestamp])
}
```

### 2.5 `BotSession` — unificada (reemplaza `WapiBotSession`)

**Decisión de diseño (importante):** la sesión es por **conversación**, no por
bot. La misma persona en WhatsApp y en IG son dos hilos distintos (distinto
`externalUserId`, distinto canal) → dos sesiones, aunque sea el mismo bot. Eso
es correcto: no se pueden mezclar (ventanas, identidades y transporte distintos).
`botId` se guarda denormalizado (lo aporta el canal) para que el motor sepa qué
flow correr.

```prisma
model BotSession {
  id             String   @id @default(cuid())
  organizationId String
  teamId         String
  botId          String                 // NUEVO: qué bot corre (lo da channel.botId)
  channelId      String
  externalUserId String                 // era phone
  currentNodeId  String
  currentTopicId String?
  data           Json?    @default("{}")
  startedAt      DateTime @default(now())
  lastInboundAt  DateTime @default(now())
  expiresAt      DateTime
  endedAt        DateTime?
  endedReason    String?

  bot      Bot     @relation(fields: [botId], references: [id], onDelete: Cascade)
  channel  Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, externalUserId])  // era [configId, phone]
  @@index([botId])
  @@index([expiresAt])
}
```

---

## 3. La capa de abstracción de canal (los adapters)

Un registro de `ChannelAdapter`, uno por kind. Es el **único** lugar donde vive
el código específico de plataforma. Es el mismo patrón que ya usás en Email
(`EmailSender` + `SesSender`/`SmtpSender`).

### 3.1 Tipos normalizados

```ts
// Mensaje entrante normalizado (lo que el webhook/gateway produce)
interface InboundMessage {
  channelId: string;
  channelKind: ChannelKind;
  externalUserId: string;        // id del que escribe
  externalMessageId: string;     // para idempotencia
  timestamp: Date;

  type: 'text' | 'interactive_reply' | 'image' | 'audio' | 'document' | 'location' | 'unknown';
  text?: string;
  interactiveReplyId?: string;   // cuando el usuario toca un botón/quick-reply
  media?: { id?: string; url?: string; mime: string; sha256?: string; filename?: string; caption?: string };

  // Contexto de entrada/routing — GENERALIZA template-payload:
  //  WhatsApp: botón de template      → source:'template'
  //  IG/Messenger: ad referral / m.me → source:'ad' | 'link'
  //  Webchat: data del widget         → source:'link'
  referral?: { payload: string; source: 'ad' | 'template' | 'link' | 'menu' };

  senderProfile?: { name?: string; avatarUrl?: string };
}

// Mensaje saliente normalizado (lo que el motor/inbox quiere mandar)
type OutboundMessage =
  | { kind: 'text'; to: string; text: string; previewUrl?: boolean }
  | { kind: 'buttons'; to: string; text: string; header?: string; footer?: string;
      buttons: { id: string; title: string }[] }
  | { kind: 'media'; to: string; mediaType: string; mediaId?: string; url?: string;
      caption?: string; filename?: string };

// Qué sabe hacer cada canal (el motor/inbox lo consultan antes de enviar)
interface ChannelCapabilities {
  interactiveButtons: { supported: boolean; max: number };  // WA=3, Messenger quick replies≈13, webchat=∞
  mediaTypes: string[];
  freeformWindow: { enforced: boolean; hours?: number };     // WA/IG/MSGR: true/24h; webchat: false
  templates: boolean;                                        // solo WhatsApp (outbound fuera de ventana)
}

interface ChannelAdapter {
  kind: ChannelKind;
  capabilities: ChannelCapabilities;

  // INBOUND: valida firma + parsea payload del proveedor → normalizado.
  // Devuelve [] si el evento no es un mensaje (status, etc.).
  verifyAndParse(req: RawWebhookRequest, channel: Channel): Promise<InboundMessage[]>;
  parseStatus?(req: RawWebhookRequest, channel: Channel): Promise<StatusUpdate[]>;

  // OUTBOUND:
  send(channel: Channel, msg: OutboundMessage): Promise<{ externalMessageId: string }>;
}
```

### 3.2 Implementaciones

| Adapter | Reutiliza | Notas |
|---|---|---|
| `WhatsAppAdapter` | `WapiSenderService` + parse de `wapi-webhook.service.ts` | Re-empaque de código existente. Cero lógica nueva. |
| `MetaMessagingAdapter` (base) | — | Base compartida IG+Messenger (misma Graph API, mismo envelope de webhook). |
| `MessengerAdapter` | `MetaMessagingAdapter` | Difiere en campo de entry + payloads de send (quick replies, generic templates). |
| `InstagramAdapter` | `MetaMessagingAdapter` | Igual que Messenger, distinto permiso/entry. |
| `WebchatAdapter` | infra Socket.IO existente | `send()` empuja por WS al room del visitante; `verifyAndParse` lo alimenta el WS gateway, no un webhook HTTP. Sin ventana, botones ricos. |

---

## 4. Cambios en el motor (mínimos)

- **Runtime puro** (`bot-flow-runtime.ts`, `expression-engine`, `interpolate`,
  `sandbox`): **sin cambios**.
- `WapiBotEngineService` → `BotEngineService` (agnóstico):
  - Recibe `InboundMessage` (en vez de payload Meta crudo).
  - Carga `Bot` vía `channel.botId` + `BotSession` por `(channelId, externalUserId)`.
  - Corre el mismo runtime.
  - `deliverNode`: arma un `OutboundMessage` y llama `adapter.send(channel, out)`
    en vez de `this.sender.sendText(...)`. El mapeo nodo→mensaje se mantiene; solo
    cambia el dispatch final. → hoy en `wapi-bot-engine.service.ts:792-836`.
  - **Guard de capabilities**: antes de mandar botones, clamp a
    `capabilities.interactiveButtons.max`; antes de freeform, chequear
    `freeformWindow` contra `conversation.freeformWindowAt`.
- `WapiBotRouterService` → `BotRouterService` (ya casi agnóstico):
  - `BotRouterInput`: `{kind:'text'}` queda igual; `{kind:'template-payload'}` →
    `{kind:'referral', payload, source}` alimentado por `InboundMessage.referral`.
  - El mecanismo regex named-groups → seedData se preserva intacto.
- `WapiBotFeatureService` → `BotFeatureService`: mismo gate env + plan
  (`features.bot`), solo rename de módulo.

> **El activo más grande acá**: las ~9.000 líneas de tests del bot
> (`wapi-bot-*.spec.ts`) son la red de seguridad para hacer este refactor sin
> romper comportamiento. Mantenerlos verdes es el criterio de "hecho" de la Fase 0.

---

## 5. Flujos

### 5.1 Inbound

- **WhatsApp / IG / Messenger** (webhook HTTP):
  `POST /api/channels/:kind/:slug`
  → resolver `Channel` por (org, kind, provider-id)
  → `adapter.verifyAndParse(req, channel)`
  → por cada `InboundMessage`: upsert `Conversation` + `Message` (idempotente por
    `[channelId, externalId]`)
  → si `channel.botId` y bot enabled y `!botSuspended` →
    `BotEngineService.handle(inbound, channel)`
  → si no → welcome / opt-out / inbox.

- **Webchat** (WebSocket):
  el widget del visitante emite un evento → el WS gateway construye
  `InboundMessage` → mismo camino downstream. `adapter.send` responde por WS al
  room del visitante. Reusa la infra Socket.IO que hoy emite eventos al inbox del
  agente (`events.emitToTeam`).

### 5.2 Outbound (respuestas del inbox)

- `inbox.sendText/sendMedia` → `adapter.send`. El guard de 24h
  (`wapi-inbox.service.ts:348-351,454-457`) se vuelve un chequeo de
  `capabilities.freeformWindow` contra `conversation.freeformWindowAt`.

---

## 6. Inbox unificado

Un solo inbox, una sola cola, badge de canal por conversación. La UI:
- Lista única de conversaciones con ícono de canal por fila + filtro por canal.
- Composer **dirigido por capabilities**: banner de ventana solo en canales Meta;
  selector de botones limitado a `capabilities.interactiveButtons.max`; webchat
  muestra "online/offline".
- API: `/api/inbox/conversations...` (renombra `/wapi/inbox/...`). Todos los
  endpoints actuales (`take`, `assign`, `unassign`, `resolve`, `reopen`, `hold`,
  `read`, `notes`) ya son agnósticos → se mueven 1:1.
- Evento realtime `wapi.message.new` → `conversation.message.new` con campo
  `channelKind`.

---

## 7. Plan de migración (por fases)

> Cada fase es deployable y deja el sistema funcionando. El orden ataca primero el
> refactor (riesgo alto, valor inmediato: "un bot, muchos números") y deja los
> canales nuevos para cuando la base está sólida.

### Fase 0 — Extraer `Bot` de `WapiConfig` (refactor, comportamiento idéntico)
1. Crear tabla `Bot`.
2. Backfill: por cada `WapiConfig` con `botEnabled`, crear un `Bot` copiando las
   columnas `bot*`; setear `WapiConfig.botId`.
3. Mover `bot/` fuera de `wapi/` a un módulo agnóstico; el engine recibe tipos
   normalizados; cablear `WhatsAppAdapter` para comportamiento idéntico.
4. **Criterio de hecho:** todos los `wapi-bot-*.spec.ts` verdes.
5. **Valor entregado ya:** un bot se diseña una vez y se conecta a varios números
   de WhatsApp (1 Bot → N WapiConfig). Resuelve tu requisito para WhatsApp.

### Fase 1 — Unificar canal + conversación
6. Crear `Channel`, `Conversation`, `Message`, `BotSession` unificados.
7. Migrar datos WhatsApp: `WapiConfig`→`Channel(kind=WHATSAPP)`,
   `WapiConversation`→`Conversation`, `WapiMessage`→`Message`,
   `WapiBotSession`→`BotSession`.
8. Apuntar `WhatsAppAdapter` + inbox + engine a los modelos unificados.
9. Inbox unificado (API + UI con badge/filtro de canal).

### Fase 2 — Messenger (primer canal nuevo, el más fácil)
10. `MetaMessagingAdapter` base + `MessengerAdapter`.
11. App review de Meta (`pages_messaging`). **Empezar temprano: es el camino crítico.**
12. Crear `Channel(kind=MESSENGER)`, conectar un `Bot` existente. Inbox + bot
    funcionan automáticamente.

### Fase 3 — Instagram
13. `InstagramAdapter` (extiende base Meta). Permiso `instagram_manage_messages`.
14. Igual que Messenger.

### Fase 4 — Webchat
15. `WebchatAdapter` + WS gateway para visitantes + widget embebible.
16. `Channel(kind=WEBCHAT)`. Sin API externa ni ventana. Bot + inbox automáticos.

---

## 8. Esfuerzo y riesgos

| Fase | Esfuerzo | Riesgo principal |
|---|---|---|
| 0 — Extraer Bot | Medio | Refactor con red de tests; migración de datos bot*. |
| 1 — Unificar canal/conv | Medio-Alto | Migración de datos del inbox en vivo; idempotencia compuesta. |
| 2 — Messenger | Bajo-Medio | **App review de Meta (semanas, no código).** |
| 3 — Instagram | Bajo | Igual que Messenger (mismo base). |
| 4 — Webchat | Medio | Widget + WS gateway al visitante (forma distinta, pero sin fricción de API). |

### Watch-outs
- **Idempotencia**: id externo único solo por canal → `@@unique([channelId, externalId])`.
- **Identidad cross-canal**: un `Contact` puede tener phone + IG-id + email. El
  modelo `Contact` ya unifica por externalId/dni/cuit/email/phone y ya tiene
  `wapiIdentities`/`emailIdentities`. Agregar identidades de IG/Messenger como
  links análogos → misma persona en WhatsApp + IG → un `Contact` → un timeline.
  (Conecta con `contact-timeline.service.ts` existente.)
- **Draft/Publish**: el workflow se mueve con el `Bot` (`bot*Draft` → `Bot.*Draft`).
- **Campañas**: hoy `WapiCampaign` es por-config y usa templates de WhatsApp.
  **Fuera de scope** de este milestone (bot + inbox + canales). Las campañas
  siguen andando en WhatsApp vía `WhatsAppAdapter` sin tocar. Necesitarán el mismo
  tratamiento channel-aware más adelante (workstream aparte).
- **App review de Meta**: el cuello de botella de Fases 2-3. Arrancar el trámite
  apenas se decida el roadmap.

---

## 9. Cambio de UI/UX (resumen)

- Hoy el bot se diseña en `/wapi/configs/:id/bot*` (atado a la WABA).
- Nuevo: sección **"Bots"** donde se diseña el bot una vez; en cada **Channel** se
  elige qué `Bot` conectar (un dropdown). Mismo editor de flow/topics/sandbox,
  solo cambia dónde vive y a qué se enlaza.

---

## 10. Modelo de alta de canal (onboarding de credenciales)

**Decisión: BYO-credentials por tenant** (igual que WhatsApp hoy). Cada cliente da
de alta el canal en su tenant cargando sus propias credenciales; el dueño de la
plataforma también lo da de alta con su cuenta para testear.

El diseño ya lo soporta sin cambios: las credenciales viven en
`Channel.credentialsEnc` por tenant, y solo el adapter de ese kind las lee. El
webhook por-tenant existente (`Organization.webhookSlug`) generaliza: el cliente
apunta el webhook de **su** app de Meta a `/api/channels/:kind/:slug`, y el backend
resuelve el `Channel` por (slug → org) + page id / phone id del payload.

### Diferencia clave vs WhatsApp: el App Review recae en cada cliente

En el modelo "cada cliente tiene su propia app de Meta", para IG/Messenger en modo
**Live** cada cliente debe pasar **su** app por App Review de Meta
(`pages_messaging`, `instagram_manage_messages`). Pasos por cliente:

1. Crear app en Meta Developers.
2. Agregar producto Messenger/Instagram.
3. Configurar webhook callback URL + verify token → apuntando a Massivo.
4. Generar token de página (idealmente **System User token**, no expira).
5. Suscribir su página a su app (`POST /{page-id}/subscribed_apps`).
6. **Enviar la app a App Review** (días/semanas + formulario técnico).

Es fricción real para clientes no-técnicos. Con WhatsApp se tolera por cómo
funciona WABA; en IG/Messenger el modelo app-por-cliente es más pesado.

### Testing del dueño de la plataforma: sin App Review

En **Dev Mode**, una app de Meta puede mensajear a usuarios con rol en la app
(admin/dev/tester) **sin App Review**. → El dueño prueba IG/Messenger end-to-end
con su propia cuenta de inmediato. El App Review solo bloquea cuando hay que
mensajear a end-users reales de los clientes.

### Alternativa futura: modelo plataforma (OAuth / Embedded Signup)

Lo que usan ManyChat / Respond.io / Intercom: **una sola app de Meta** propiedad de
Massivo; el cliente conecta su IG/Página vía **Facebook Login (OAuth)** y autoriza
sin tocar la consola de Meta. Massivo pasa App Review **una sola vez** para toda la
plataforma.

- **No** es para el primer cut: BYO-credentials valida más rápido y habilita el
  testing propio sin esperar revisión.
- El diseño lo soporta sin romper nada: OAuth es otro modo de **poblar el mismo
  `Channel.credentialsEnc`** (el flujo entrega un page access token que se guarda
  igual). Migrar a este modelo no toca adapters ni motor; solo agrega un flujo de
  alta alternativo.
- Adoptarlo cuando el onboarding por cliente sea el cuello de botella.
