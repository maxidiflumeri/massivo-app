---
title: Meta WhatsApp Business API
sidebar_position: 1
---

# Meta WhatsApp Business API — el modelo

WhatsApp (que es de Meta) tiene **3 productos distintos** y es crucial
entender cuál usamos. Spoiler: Massivo usa la **WhatsApp Business
Platform / Cloud API**, también llamada **API oficial**.

## Los 3 productos de WhatsApp

| Producto | Para quién | Cómo se interactúa |
|---|---|---|
| **WhatsApp** | Personas | Tu celular |
| **WhatsApp Business** (app) | Comerciantes chicos | App específica en el celular |
| **WhatsApp Business API** | Empresas / plataformas | API HTTP de Meta |

Massivo es una plataforma sobre la 3ra: la **API oficial**. No usamos
ningún truco tipo `whatsapp-web.js` ni soluciones no oficiales, porque:

- **Cumplimiento legal** — Meta puede banearte si usás soluciones no
  oficiales
- **Estabilidad** — la API oficial tiene SLA, las no oficiales pueden
  romperse de un día para el otro
- **Volumen serio** — para mandar masivamente o tener bots, necesitás
  oficial

## Vos sos el dueño de tu número, no Massivo

Esto es **muy importante** para entender el modelo de negocio y la
ventaja de Massivo:

- **Vos** abrís una **Meta Business Account** con tus datos
- **Vos** creás una app dentro de tu Business Account
- **Vos** registrás un número de WhatsApp Business
- **Vos** le pagás a Meta directamente por los mensajes que mandás
- **Massivo** es solo la **plataforma de gestión** que envuelve la API

Esto significa:

- **Sin markup** sobre los precios de Meta — nuestros competidores
  (Twilio, MessageBird, 360Dialog) te cobran un 20-50% extra por cada
  mensaje. Nosotros no.
- **Transparencia** — vos ves directamente en tu billing de Meta cuánto
  pagás
- **Portabilidad** — si te querés ir de Massivo, te llevás tu número y
  tu cuenta. No hay vendor lock-in.

## El bestiario de IDs y tokens

Para conectar WhatsApp a Massivo necesitás **3 cosas** que Meta te da:

### Phone Number ID

Un ID numérico largo (ej. `123456789012345`) que identifica tu número
de WhatsApp Business **dentro de la API de Meta**. No es el número
"humano" (`+54 9 11 1234-5678`) — ese también lo registrás en Meta,
pero para la API se usa el Phone Number ID.

Lo encontrás en el **Meta Business Suite → WhatsApp → API Setup**.

### WhatsApp Business Account ID (WABA ID)

Otro ID numérico que identifica tu **cuenta de WhatsApp Business** en
Meta (que puede tener varios Phone Numbers asociados). Lo necesitamos
para algunas operaciones (templates, webhooks).

### Access Token

La credencial que autentica tus requests a la API de Meta. Vas a tener
2 tipos:

- **Token temporal de 24h** — el que te da Meta cuando recién creás la
  app. Bueno para probar.
- **Token permanente** — el que generás vinculando un System User a tu
  app. **Es el que debés usar en producción**.

Massivo encripta tu access token cuando lo guarda. Solo aparece
desencriptado en memoria al momento de hacer cada request a Meta.

## El proceso de onboarding con Meta

Resumido (lo cubrimos en detalle en [Configurar tu número](../configurar-numero)):

```
1. Crear Meta Business Account (si no la tenés)
   └── Asociar tu empresa real, dominio, contacto
2. Crear una App tipo "Business"
   └── Agregarle el producto "WhatsApp"
3. Registrar un número (en Meta) como WhatsApp Business
   └── Verificar por SMS o llamada
4. Generar un access token permanente (System User)
5. Configurar webhook URL (la te da Massivo)
6. Pegar las 3 piezas en Massivo:
   - Phone Number ID
   - Access Token
   - WABA ID (opcional pero recomendado)
```

## Conceptos clave para usar bien la API

### Templates aprobados

Para mandar mensajes **fuera del 24h window** (más abajo), necesitás
**templates aprobados por Meta**. Son mensajes con estructura fija
que vos sometés a Meta para revisión, y Meta te aprueba (o rechaza)
en general en pocas horas.

Ver [Templates aprobados](./templates-aprobados).

### El "24h window"

Si un contacto te escribió a vos en los últimos 24h, podés contestarle
con cualquier mensaje libre (text, image, video, etc.). Pasadas las
24h, solo podés usar templates aprobados.

Ver [24h window](./24h-window).

### Webhooks

Meta te avisa por **webhooks HTTP** cuando:

- Un contacto te manda un mensaje
- Un mensaje que mandaste fue entregado / leído / falló
- Tu template cambió de estado (aprobado / rechazado)

Massivo expone una URL única por organización para que Meta nos avise.
Tu trabajo es solo **configurar esa URL en tu app de Meta**, una vez.

Ver [Webhooks de Meta](./webhooks-meta).

## Precios de Meta — un overview rápido

Meta cobra **por conversación**, no por mensaje individual. Una
conversación dura 24h.

- **Iniciada por usuario** (te escribió primero): gratis las primeras
  1000 al mes, después algunos centavos por conversación
- **Iniciada por empresa** (con template): te cuestan más
- **Conversaciones de servicio** (post-venta, soporte): tarifa
  intermedia
- **Conversaciones de marketing**: tarifa más alta

Los precios **cambian por región**. Para tarifas exactas, consultá la
[documentación oficial de Meta](https://developers.facebook.com/docs/whatsapp/pricing).

**Massivo no participa de esa facturación** — vos le pagás a Meta
directamente. Nosotros solo cobramos por la plataforma.

## Próximos pasos

- 🔐 [Phone Number ID y Access Token](./phone-number-id-access-token):
  cómo obtenerlos paso a paso
- 📝 [Templates aprobados](./templates-aprobados): cómo armar y
  someter templates
- ⏰ [El 24h window](./24h-window): la regla de oro del envío en
  WhatsApp
- 🛠 [Configurar tu número en Massivo](../configurar-numero)
