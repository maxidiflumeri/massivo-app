---
title: Webhooks de Meta
sidebar_position: 5
---

# Webhooks de Meta

Meta te avisa de **eventos** (mensajes entrantes, cambios de estado, etc.)
llamando a una URL que vos configurás. Esos llamados HTTP se llaman
**webhooks**.

Massivo te da una URL por organización para que la pegues en tu app de
Meta. **Lo configurás una vez** y a partir de ahí todo fluye solo.

## Qué eventos te llegan

Una vez configurado, Meta llama a la URL de Massivo cada vez que pasa:

| Evento | Cuándo dispara |
|---|---|
| **messages** | Un contacto te manda un mensaje (texto, imagen, audio, etc.) |
| **message_status** | El estado de un mensaje que mandaste cambió: sent / delivered / read / failed |
| **message_template_status_update** | El estado de uno de tus templates cambió: approved / rejected / paused |
| **account_alerts** | Meta te avisa de cuestiones de la cuenta (calidad baja, etc.) |
| **phone_number_quality_update** | Tu número cambió de quality tier (high / medium / low) |

## Por qué los necesitamos

Sin webhooks, tendríamos que **pollear** a Meta cada N segundos para
preguntar si pasó algo. Eso sería:

- Lento (latencia)
- Caro (millones de calls por día)
- Poco fiable (Meta nos rate-limitearía)

Con webhooks, **Meta nos avisa exactamente cuando algo pasa**, en tiempo
real.

## La URL del webhook

Cada organización en Massivo tiene su **propio webhook slug** (un ID
opaco no adivinable, ej. `wbh_aBcDeFgHiJkLmN012345`).

Tu URL completa es:

```
https://api.massivo.app/api/webhooks/wapi/wbh_aBcDeFgHiJkLmN012345
```

Esa URL es la que vas a pegar en Meta.

:::info ¿Por qué un slug y no el ID directo de la organización?
Porque el ID interno de tu organización en nuestra DB es algo que no
queremos exponer públicamente. El slug es **rotable** — si por alguna
razón se filtra (alguien lo ve en logs, por ej.), podés regenerarlo en
un click y la URL vieja deja de funcionar.
:::

## Cómo se configura en Meta

(El paso a paso completo está en
[Configurar tu número](../configurar-numero), acá solo el resumen.)

### Pre-requisitos en Meta

Tu app de Meta tiene que tener:

- El producto **WhatsApp** activado
- Un **verify token** elegido por vos (cualquier string secreto)

### El handshake inicial

Cuando configurás la webhook URL en Meta, Meta hace un **GET request a
nuestra URL** con un challenge. Massivo lo valida usando el verify token
y responde el challenge. Si Meta lo recibe OK, la URL queda configurada.

A partir de ahí, **Meta empieza a mandarnos POSTs** con cada evento.

### Suscribirse a los eventos

En la consola de Meta, después del handshake, te pide elegir **a qué
fields suscribirte**. Marcá al menos:

- ✅ `messages`
- ✅ `message_template_status_update`

Si querés ver actualizaciones de quality:

- ✅ `phone_number_quality_update`
- ✅ `account_alerts`

## Cómo procesa Massivo cada webhook

### Inbound message (un cliente te escribe)

```
Meta → POST {massivo}/api/webhooks/wapi/{slug}
       Body: { messages: [{ from: "5491100", text: "Hola" }] }

Massivo:
  1. Valida la firma (X-Hub-Signature-256) con el verify token
  2. Encuentra qué team es dueño de ese phone_number_id
  3. Buscar / crear contacto por número
  4. Buscar / crear conversación
  5. Setear windowExpiresAt = ahora + 24h
  6. Guardar mensaje en WapiMessage
  7. Si hay bot activo en la conversación → activar bot
  8. Notificar vía WebSocket al inbox del team (UI se actualiza
     en vivo)
```

### Status update (uno de tus mensajes cambió de estado)

```
Meta → POST {massivo}/api/webhooks/wapi/{slug}
       Body: { statuses: [{ id: "wamid.xxx", status: "delivered" }] }

Massivo:
  1. Encuentra el WapiReport por metaMessageId
  2. Actualiza status (SENT → DELIVERED → READ → FAILED)
  3. Actualiza timestamp correspondiente
  4. Notifica vía WebSocket al detalle de la campaña
```

### Template approved / rejected

```
Meta → POST {massivo}/api/webhooks/wapi/{slug}
       Body: { template_status_update: { name: "promo", status: "APPROVED" } }

Massivo:
  1. Encuentra el WapiTemplate por nombre + idioma
  2. Actualiza status
  3. Notifica al panel de templates
```

## Seguridad — cómo sabemos que el webhook viene realmente de Meta

Meta firma cada webhook con un HMAC SHA256 usando el verify token que
elegiste. Massivo:

1. Recibe el request
2. Lee el header `X-Hub-Signature-256`
3. Re-calcula el HMAC del body con el verify token
4. Si matchea, procesamos. Si no, ignoramos y loggeamos.

Esto protege contra:

- Atacantes que **descubran tu URL** y traten de inyectar mensajes
  falsos
- Race conditions / replays maliciosos

## Cómo rotar el verify token

Si tenés que rotar el verify token (sospechás filtración, rotación
preventiva, etc.):

1. En el panel **WhatsApp → Números → Editar → Rotar verify token**
2. Massivo te da uno nuevo
3. Andá a la consola de Meta → tu app → WhatsApp → Webhooks
4. **Cambiá el verify token**
5. Meta vuelve a hacer el handshake con el nuevo token

Mientras hacés el cambio, hay un **período de 5-10 min** donde los
webhooks pueden no procesar (token viejo no matchea + token nuevo no
configurado en Meta). Hacelo en horario de baja actividad.

## Rotar el webhook slug

Si tu webhook slug se filtró (alguien lo ve en logs, capturas de
pantalla, etc.):

1. **WhatsApp → Números → Editar → Regenerar slug**
2. Massivo te da una URL nueva
3. **Cambiala en Meta** (cambia la URL completa, no solo el verify token)
4. La URL vieja deja de funcionar inmediatamente

## Testing del webhook

### Test desde el panel

En el detalle del número en Massivo hay un botón **"Test webhook"** que:

1. Llama a Meta para mandarte un test event
2. Te muestra si Massivo lo recibió y procesó OK
3. Confirma que la cadena entera funciona

Útil después del setup inicial para confirmar que todo está bien.

### Test desde Meta directamente

En **Meta Console → WhatsApp → Webhooks** hay un botón **"Test"** al
lado de cada field suscripto:

1. Click **Test** en `messages`
2. Meta manda un evento simulado
3. Lo ves llegar al log de Massivo

## Qué pasa si nuestra URL está caída

Meta tiene **retry policy**:

- Si nuestro endpoint responde 5xx, Meta reintenta con exponential
  backoff
- Hasta 30 días de retries por evento
- Una vez procesado OK, Meta no vuelve a mandar el mismo evento

En la práctica, si Massivo está caído por 1 hora, vas a recibir todos
los mensajes cuando vuelva. Si está caído por días, podés perder
algunos.

## Próximos pasos

- 🛠 [Configurar tu número](../configurar-numero) — incluye el setup
  del webhook completo
- 📨 [Crear una campaña de WhatsApp](../crear-campana)
- 💬 [Inbox de WhatsApp](../inbox) — cómo se ven los mensajes inbound
  que llegan vía webhook
