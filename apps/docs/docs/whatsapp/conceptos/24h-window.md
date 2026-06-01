---
title: El 24h window
sidebar_position: 4
---

# El 24h window — la regla de oro

Una de las reglas más importantes de WhatsApp Business API:

:::tip La regla
**Si un contacto te escribió a vos en los últimos 24h, podés
contestarle cualquier cosa. Pasadas las 24h, solo podés mandarle
templates aprobados.**
:::

Esto evita que las empresas usen la API como canal de spam masivo.

## Cómo funciona en detalle

### Cada vez que el contacto te escribe, abre una "ventana de 24h"

Imagínate un contador que arranca cada vez que el contacto te escribe:

```
Tiempo →

12:00  Contacto te escribe: "Hola"
         ↓
         Ventana abierta hasta 12:00 del día siguiente

13:00  Vos le respondés (en cualquier formato — text, image, audio, etc.)
14:00  Vos le mandás otro mensaje (sigue abierta la ventana)
...
11:59  Vos le mandás otro mensaje ✅ (todavía dentro de 24h)
12:01  ❌ Ya pasaron 24h. NO podés mandarle mensaje libre.
         Solo template aprobado.
```

### Si el contacto vuelve a escribir → la ventana se reinicia

```
12:00  Contacto te escribe → ventana 1 hasta 12:00 día sig.
20:00  Contacto vuelve a escribir → ventana 2 hasta 20:00 día sig.

Día siguiente 12:01 → la ventana 1 expira, pero todavía estás dentro
                     de la ventana 2 (hasta las 20:00)

Día siguiente 20:01 → ventana 2 también expirada. Solo template.
```

Las ventanas se **acumulan** — siempre estás dentro del 24h window si
el **último mensaje del contacto** fue hace menos de 24h.

### Si vos le mandás un template y él te responde → reinicia

```
Lunes 10:00  Vos mandás template aprobado: "Promo de la semana"
Lunes 10:30  Contacto responde "Me interesa"
             ↓
             Ventana abierta hasta el martes 10:30
```

Por eso los templates con buttons son tan útiles para bots — el primer
"Quick Reply" del contacto reabre la ventana, y a partir de ahí podés
chatear libremente.

## Qué significa "mensaje libre" vs "template aprobado"

### Mensaje libre (dentro del 24h window)

Cualquier cosa:

- Texto plano
- Imágenes (foto, gif)
- Stickers
- Audios / voicemails
- Documentos (PDF, doc)
- Video
- Ubicación
- Contacto
- Listas interactivas
- Botones de respuesta rápida
- Templates aprobados (también podés usarlos dentro del window — no
  cuesta más)

Costo: **conversación iniciada por usuario** (más barata, las primeras
1000 al mes son gratis).

### Template aprobado (fuera del 24h window)

Solo el template literal, con sus componentes definidos al aprobar.
Las variables se rellenan pero el resto del template **no se puede
modificar al momento de enviar**.

Costo: depende de la **categoría del template** (utility / authentication /
marketing).

## Cómo lo maneja Massivo

### En el inbox

Cuando un contacto te escribe, Massivo crea una **conversación** y
**registra el momento del último inbound**. Eso define el "windowExpiresAt"
de la conversación.

En la UI del inbox:

- **Verde**: dentro del 24h window. El input del chat te deja escribir
  mensaje libre.
- **Amarillo** (faltan menos de 1h para expirar): warning visual.
- **Rojo** (expirada): el input se bloquea para mensajes libres, te
  ofrece elegir un **template** para mandar.

### En las campañas

Las campañas de WhatsApp **siempre usan templates aprobados** — por
diseño. No se chequea el 24h window porque mandás a contactos que en
su gran mayoría no te escribieron primero.

### En los bots

Los bots **viven dentro del 24h window** por definición — el bot
responde a lo que el contacto le escribe. Si el contacto deja de
escribir, el bot **no puede iniciar conversación de nuevo** salvo
que mandes un template.

Hay un nodo "enviar template" en el editor de flujo para casos donde
querés iniciar una conversación (ej. recordatorio post-venta).

## Casos prácticos

### "El cliente me escribió hace 30 min, quiero mandarle un PDF"

Estás dentro del 24h window → mandás el PDF directo, sin template.

### "El cliente me escribió ayer, quiero mandarle una promo"

Pasaron más de 24h → tenés 2 opciones:

1. **Mandar un template aprobado de marketing**: instantáneo pero
   cuesta lo de un mensaje de marketing
2. **Esperar a que el cliente te vuelva a escribir**: gratis pero
   no controlás cuándo

### "Quiero iniciar conversaciones desde cero con leads que dejé el formulario"

Solo con **template aprobado**. Es lo más caro (marketing) pero es lo
correcto. No hay forma de iniciar conversación libre con alguien que
nunca te escribió primero.

### "Mi bot tiene que mandar un recordatorio 7 días después de la compra"

El cliente no te escribió en 7 días → no estás en window. Tenés que
**mandar un template** (categoría utility típicamente). Lo armás en el
bot con un nodo "enviar template".

## Restricciones más finas

Además del 24h window:

- **Rate limit**: Meta limita cuántos mensajes podés mandar por
  segundo. Massivo respeta esto automáticamente.
- **Templates marketing**: Meta tiene un **límite diario** de cuántos
  marketing templates podés mandar a contactos nuevos. Crece con tu
  quality score.
- **Calidad de phone number**: Meta clasifica tus números como High /
  Medium / Low quality. Bajos significan límites más estrictos.

## Tracking del 24h window en el código

Massivo guarda `windowExpiresAt` en la conversación y lo actualiza
automáticamente:

- Cuando recibimos un mensaje inbound → seteamos
  `windowExpiresAt = ahora + 24h`
- Cuando enviamos un mensaje outbound → no afecta el window
- Cuando mandamos un template approved fuera del window → **no**
  reinicia el window (solo el inbound del contacto lo hace)

## Errores comunes

| Síntoma | Causa |
|---|---|
| "Cannot send free-form message: window expired" | Pasaron las 24h desde el último mensaje del contacto. Mandá un template. |
| El input del inbox se bloquea de repente | La ventana expiró mientras tipeabas. Refrescá la UI. |
| El bot deja de responder a un usuario | El usuario no te escribió en mucho tiempo, ventana expirada. Mandale un template para reactivar. |

## Próximos pasos

- 📝 [Templates aprobados](./templates-aprobados): cómo armarlos
- 🔔 [Webhooks de Meta](./webhooks-meta): cómo recibimos los mensajes
  inbound que reinician la ventana
- 📨 [Inbox de WhatsApp](../inbox): cómo gestionar conversaciones
  respetando el window
