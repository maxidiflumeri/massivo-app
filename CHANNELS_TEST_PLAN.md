# Plan de pruebas — multicanal (WhatsApp · Messenger · Instagram · Webchat)

> Cierre del milestone multi-canal + bot único + inbox unificado (rama
> `feat/multichannel-bot`). Dos tiers: **A) pruebas en dev sin Meta** (simuladores +
> widget) y **B) apps reales de Meta + pruebas en modo desarrollo**. Webchat se prueba
> 100% sin Meta. Diseño: [CHANNELS_BOT_DESIGN.md](./CHANNELS_BOT_DESIGN.md) · avances:
> [CHANNELS_BOT_PROGRESS.md](./CHANNELS_BOT_PROGRESS.md).

---

## 0. Pre-requisitos

- Backend y frontend levantados; DB local migrada (ojo: **VPN del trabajo rompe el
  engine de Prisma** → desconectar).
- **Flags de dev** (para simuladores + widget):
  - Backend: `ENABLE_DEV_SIMULATOR=true`
  - Frontend: `VITE_ENABLE_DEV_SIMULATOR=true` (+ `VITE_API_BASE_URL` apuntando al backend)
- **Un bot publicado** (sección Bots → crear → diseñar flow/topics → publicar). El mismo
  bot se reusa en todos los canales.
- Para el tier B (Meta real): cuenta en **Meta Business Suite** + una **app** en
  developers.facebook.com + una **URL pública HTTPS** del backend (deploy AWS o un túnel
  `ngrok http 3001` / `cloudflared`).

---

## A. Pruebas en DEV (sin Meta)

> Validan el camino completo **canal → ingest agnóstico → bot → inbox → respuesta** sin
> depender de Meta. WhatsApp/Messenger/Instagram usan canales en **modo test** (el envío
> del bot no pega a Meta, se short-circuita con un id `SIM_`). Webchat usa el socket real.

### A.1 — Bot responde por cada canal (simuladores)
Para **Messenger** (`Dev → Chat Messenger`) e **Instagram** (`Dev → Chat Instagram`):
1. Elegí el bot publicado en el selector → **Conectar canal** (crea un Channel en modo test).
2. Escribí como cliente (PSID/IGSID) un mensaje que dispare un topic del bot.
3. **Esperado:** el bot responde en el panel; los botones (quick replies) son clickeables.
4. Abrí **Conversaciones → Inbox**: la conversación aparece con el **badge del canal**
   correcto y el historial completo.

WhatsApp: `Dev → Simulador WhatsApp` / `Chat simulado` (camino legacy, ya andaba).

### A.2 — Webchat end-to-end (socket real)
1. **Canales → Agregar canal → Webchat** → nombre → crear (no pide credenciales).
2. Abrí la **ruedita** del canal Webchat → sección **Widget** → copiá la **widget key**.
3. Conectale el bot publicado desde la tarjeta (selector de bot).
4. `Dev → Widget Webchat` → pegá la widget key → **Conectar** (chip "Conectado").
5. Escribí como visitante → **esperado:** el bot responde en vivo; los botones funcionan.
6. **Inbox:** la conversación aparece con badge **Webchat**.

### A.2b — Widget embebible (loader + iframe, como lo verá el cliente)
1. En la ruedita del canal Webchat copiá el **snippet `<script>`** (sección Widget).
2. Pegalo en un HTML cualquiera (un `.html` local servido por http, o una página de prueba)
   y abrilo en el navegador.
3. **Esperado:** aparece la **burbuja flotante** abajo a la derecha; al abrirla, el iframe
   muestra el chat; escribís y el bot responde; el ✕ cierra el panel.
4. (Dev) El loader se sirve desde `{frontendOrigin}/webchat/v1.js` y el iframe desde
   `{frontendOrigin}/webchat.html?key=...` — verificá que ambos resuelvan.

### A.3 — Handoff a operador (humano) por canal
Para Webchat (y opcional Messenger/IG en test):
1. Dispará en el bot un nodo **HANDOFF** (o el flujo que escale) → la conversación pasa a
   prioridad/“esperando” en el inbox.
2. Desde el **Inbox**, tomá la conversación y respondé como operador.
3. **Esperado:**
   - Webchat: el mensaje del operador **llega al widget del visitante** en vivo.
   - Messenger/IG en test: se persiste y emite al inbox (no pega a Meta por estar en test).
4. Verificá que **el bot queda suspendido** mientras el humano atiende (no pisa al operador).

### A.4 — Multi-canal con un solo bot
1. Con el **mismo bot** conectado a Messenger(test) + Instagram(test) + Webchat,
   generá una conversación en cada uno.
2. **Esperado:** las 3 conviven en el inbox con sus badges; el bot responde igual en las 3;
   el filtro por canal del inbox las separa bien.

### A.5 — Regresión WhatsApp (que no rompimos nada)
1. Simulador WhatsApp → conversación con bot → responde y aparece en inbox.
2. Campañas / Templates / Respuestas rápidas: smoke rápido (siguen apuntando a `?kind=WHATSAPP`).

**Checklist tier A**
- [ ] Messenger sim: bot responde + inbox badge
- [ ] Instagram sim: bot responde + inbox badge
- [ ] Webchat: bot responde en vivo + inbox badge
- [ ] Widget embebible: snippet → burbuja flotante → chat en un HTML de prueba
- [ ] Handoff: operador → visitante (webchat) OK + bot suspendido
- [ ] Multi-canal: un bot, 3 canales, filtro del inbox OK
- [ ] WhatsApp: sin regresión

---

## B. Apps reales de Meta + pruebas en modo desarrollo

> **Clave:** en **Modo desarrollo** de la app, las personas con rol en la app
> (admin/desarrollador/tester) pueden mandar mensajes reales y todo funciona **sin App
> Review**. Así probás Messenger/IG reales con TUS cuentas antes de pedir App Review (que
> sólo hace falta para el público general). El webhook necesita una **URL pública HTTPS**
> → deploy o túnel.

### B.0 — Exponer el backend (para el webhook)
- Producción: el backend en AWS con su dominio HTTPS.
- Local: `ngrok http 3001` → usás la URL `https://….ngrok.app` como base del webhook.
- La **callback URL** que pega cada canal en Meta es la que muestra massivo en
  **Canales** (tarjeta) / la ruedita: `{baseUrl}/api/channels/{kind}/{webhookSlug}`.
- El **verify token** es el que cargás vos en el alta del canal en massivo.

### B.1 — Crear la app (developers.facebook.com)
1. **My Apps → Create App.**
2. Caso de uso: elegí el de **mensajería** (agrega Messenger/Instagram) o **"Other" → tipo
   Business**.
3. Asociá la app a tu **Business Portfolio** (tu cuenta de Meta Business Suite).

### B.2 — Messenger
1. En la app → **Add Product → Messenger → Set up.**
2. **Connect a Page:** elegí tu página de Facebook → genera un **Page Access Token**.
   (Recomendado: crear un **System User token** en *Business Settings* para que **no expire**.)
3. **Webhooks:**
   - Callback URL = la de massivo (`{baseUrl}/api/channels/messenger/{slug}`).
   - Verify token = el que cargaste en el canal en massivo.
   - Suscribí los **fields**: `messages`, `messaging_postbacks` (mín.), y opcionales
     `messaging_optins`, `message_deliveries`, `message_reads`.
4. **Suscribí la Página a la app** (Messenger → Webhooks → "Add/Subscribe Page").
5. En **massivo → Canales → Agregar canal → Messenger:** Page ID, Page Access Token,
   verify token (el mismo) y **App Secret** (Settings → Basic → App Secret, valida la firma HMAC).
6. **Prueba (modo desarrollo):** desde tu Facebook (rol admin/tester de la app) mandá un DM
   a la página → **esperado:** el bot responde y la conversación cae en el inbox con badge
   Messenger.

### B.3 — Instagram (DMs)
> Requiere una cuenta de Instagram **Professional** (Business/Creator) **vinculada a la
> Página de Facebook** de arriba.
1. En la misma app → **Add Product → Instagram** (Instagram Graph API / mensajería).
2. Vinculá la cuenta de IG (a través de la Página).
3. **Webhooks (objeto `instagram`):** Callback URL `{baseUrl}/api/channels/instagram/{slug}`,
   mismo esquema de verify token; suscribí el field **`messages`**.
4. Permisos que pedirá la app para producción: `instagram_basic`,
   `instagram_manage_messages`, `pages_manage_metadata`, `pages_messaging`.
5. En **massivo → Canales → Agregar canal → Instagram:** "Instagram account ID" (el id de
   la cuenta IG business — el que llega en `entry[].id`), Page Access Token (el de la página
   vinculada), verify token y App Secret.
6. **Prueba (modo desarrollo):** desde tu IG (rol en la app) mandá un DM a la cuenta →
   **esperado:** el bot responde + inbox con badge Instagram.

> ⚠️ **Cabo a confirmar en esta prueba:** que el id que Meta manda en `entry[].id` para IG
> sea efectivamente el que cargaste como "Instagram account ID". Si difiere (o si usás la
> nueva *Instagram API with Instagram Login*), se ajusta el matcheo — hoy reusa la columna
> `pageId` y es reversible.

### B.4 — WhatsApp (real, ya existía)
- Canal WhatsApp con Phone Number ID + WABA + token de Cloud API + webhook
  (`{baseUrl}/api/channels/whatsapp/{slug}`). Prueba: mensaje real → bot responde.

### B.5 — App Review (sólo para público general)
- Cuando quieras atender a usuarios que **no** tienen rol en la app, enviá la app a **App
  Review** pidiendo `pages_messaging` (Messenger) e `instagram_manage_messages` (IG).
- Hasta entonces, el modo desarrollo alcanza para probar con tus cuentas.

**Checklist tier B**
- [ ] Backend público (deploy o túnel) + callback URLs verificadas (GET hub.challenge OK)
- [ ] Messenger: DM real (modo dev) → bot responde + inbox
- [ ] Instagram: DM real (modo dev) → bot responde + inbox + **id de `entry[].id` confirmado**
- [ ] WhatsApp: mensaje real → bot responde (regresión)
- [ ] (Opcional) App Review iniciado para público

---

## C. Notas / cabos abiertos
- **Widget Webchat embebible:** ✅ hecho (loader `public/webchat/v1.js` + iframe
  `webchat.html`). Deploy: el host estático debe servir `webchat.html` y `/webchat/v1.js`
  como archivos reales (antes del fallback SPA a `index.html`).
- **Historial al reconectar** el visitante de Webchat: hoy el estado vive en el cliente
  durante la sesión (no se rehidrata al recargar).
- **Hardening Webchat:** restringir orígenes permitidos por canal (hoy el gateway usa
  CORS `*`) para que la widget key no se pueda reusar en otros dominios.
- **Consolidar inbound de WhatsApp** sobre `ConversationIngestService` (hoy sigue por
  `WapiWebhookService.process`).
