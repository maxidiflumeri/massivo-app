---
title: MESSAGE
sidebar_position: 2
---

# Nodo MESSAGE

Envía un mensaje de **texto plano** al contacto. **Sin botones, sin
captura de respuesta**.

Si tiene `nextNodeId`, el bot **avanza automáticamente** al siguiente
nodo sin esperar respuesta del contacto. Sin `nextNodeId`, es un nodo
terminal (fin del flow).

## Cuándo usarlo

- Confirmaciones simples: "Listo, te llega tu turno mañana a las 10"
- Information dumps: "Nuestros horarios son lun-vie 9-18hs"
- Encadenar mensajes: tu bot manda 3 mensajes seguidos sin esperar
  respuesta
- Bye: "Gracias por escribirnos, cualquier cosa volvé a contactarnos"
  (fin del flow)

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `text` | string | ✅ | El mensaje. Soporta variables `{{x}}` y JSONata `{{= expr }}`. |
| `nextNodeId` | string | — | Siguiente nodo. Si no se especifica, es terminal. |
| `gotoTopic` | string | — | Alternativa: saltar al inicio de otro topic |

## Ejemplo: confirmación + cierre

```yaml
nodes:
  confirmacion:
    kind: MESSAGE
    text: |
      ¡Perfecto {{nombre}}! Tu reserva está confirmada:

      📅 Fecha: {{fecha}}
      ⏰ Hora: {{hora}}
      📍 Lugar: {{sucursal}}

      Te esperamos.
    # Sin nextNodeId → fin del flow
```

## Ejemplo: encadenar mensajes

```yaml
nodes:
  mensaje1:
    kind: MESSAGE
    text: "¡Hola! Soy el bot de ACME."
    nextNodeId: mensaje2

  mensaje2:
    kind: MESSAGE
    text: "Te voy a hacer un par de preguntas para ayudarte mejor."
    nextNodeId: mensaje3

  mensaje3:
    kind: MESSAGE
    text: "Esto te lleva 1-2 minutos."
    nextNodeId: pregunta_nombre

  pregunta_nombre:
    kind: CAPTURE
    text: "Primero, ¿cómo te llamás?"
    saveAs: nombre
```

El contacto recibe los 3 mensajes consecutivos, después la pregunta.

## Comportamiento

1. Bot envía el mensaje a Meta
2. Si tiene `nextNodeId`:
   - Bot avanza **automáticamente** al siguiente nodo
   - El motor procesa el siguiente nodo (que puede ser otro MESSAGE,
     un CAPTURE, etc.)
   - No hay pausa para el contacto
3. Si **no tiene** `nextNodeId`:
   - El flow termina
   - La sesión se cierra
   - Próximos inbounds del contacto van al inbox como humano-requerido
     (o al bot de nuevo si el router matchea)

## Formato del texto

Soporta el formato standard de WhatsApp:

- `*negrita*` → **negrita**
- `_cursiva_` → _cursiva_
- `~tachado~` → ~~tachado~~
- `` `código` `` → `código`
- Saltos de línea reales (con Enter en el editor)

Y las variables:

- `{{contact.firstName}}` → "Juan"
- `{{= edad >= 18 ? "Adulto" : "Menor" }}` → expresión JSONata

## Cuidado con encadenar muchos MESSAGE seguidos

Si encadenás 5 MESSAGE seguidos sin pausa, el contacto recibe 5
notificaciones en rapid-fire. Puede ser molesto en algunos casos.

**Buena práctica**: máximo 2-3 MESSAGE consecutivos. Si necesitás
decirle mucho, juntá en un solo mensaje con varios párrafos.

## MESSAGE como nodo terminal

Cuando un MESSAGE no tiene `nextNodeId`, marca el **fin del flow**.
La sesión se cierra.

Útil para:

- Despedida después de resolver: "Gracias, cualquier cosa volvé a
  escribir"
- Cierre de un branch que no necesita seguir

Si el contacto vuelve a escribir después, **arranca una sesión nueva**
(el router decide a qué topic entra).

## vs MENU vs HANDOFF

| Necesito | Uso |
|---|---|
| Mandar texto + ofrecer botones de elección | MENU |
| Mandar texto y seguir automático al siguiente paso | MESSAGE (con nextNodeId) |
| Mandar texto + terminar (sin seguir) | MESSAGE (sin nextNodeId) |
| Mandar texto + escalar a humano | HANDOFF |

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "El bot mandó 5 mensajes juntos y abrumó al contacto" | Encadenaste demasiados MESSAGE | Consolidá en uno solo |
| "El bot dice `{{nombre}}` en lugar del nombre" | La variable no existe en sesión | Capturala antes o declarala con default |
| "El flow no termina nunca" | Olvidaste sacar el nextNodeId del último MESSAGE | Quitalo para hacerlo terminal |
| "El emoji no se renderiza" | Algunos emojis no son universales | Probá con emojis comunes (✅ 📅 ⏰ 🚀) |

## Próximos pasos

- 🤝 [HANDOFF](./handoff) — terminar y escalar a humano
- ⌨️ [CAPTURE](./capture) — pedir respuesta libre
- 🎬 [MEDIA](./media) — enviar imagen / doc / video
