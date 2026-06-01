---
title: Inbox de WhatsApp
sidebar_position: 9
---

# Inbox de WhatsApp

El **inbox** es donde tu team gestiona las conversaciones de WhatsApp.
Cuando un contacto te escribe, aparece acá. Cuando alguien del team le
responde, lo ves en tiempo real.

## Vista principal

**WhatsApp → Inbox** te muestra:

- **Lista de conversaciones** a la izquierda, agrupadas por estado
- **Detalle de conversación** a la derecha cuando seleccionás una
- **Filtros y búsqueda** en el header

## Estados de una conversación

Las conversaciones pasan por estos estados:

| Estado | Significa |
|---|---|
| **UNASSIGNED** | Nadie del team la tomó. Necesita atención. |
| **ASSIGNED** | Un agente específico la tomó. Solo él/ella responde. |
| **WAITING** | El agente dijo "espero al cliente" — la dejó pendiente. Vuelve a UNASSIGNED si el cliente no responde en X tiempo. |
| **RESOLVED** | El agente la cerró. Sale del inbox principal pero se puede reabrir. |
| **BOT** | Un bot está atendiendo activamente. |

## Filtros

Arriba del listado vas a ver tabs para filtrar:

| Filtro | Qué muestra |
|---|---|
| **Mías** | Solo las ASSIGNED al usuario actual |
| **Sin asignar** | Solo UNASSIGNED — las que esperan que alguien las tome |
| **Esperando** | WAITING |
| **Todas activas** | UNASSIGNED + ASSIGNED + WAITING + BOT |
| **Resueltas** | RESOLVED (histórico) |
| **Buscar** | Por nombre del contacto, teléfono, o texto del mensaje |

## El detalle de una conversación

Cuando seleccionás una conversación, ves:

### Header

- **Foto + nombre del contacto** (si está cargado en tus contactos)
- **Teléfono**
- **Estado de la conversación** con badge de color
- **A quién está asignada** (si lo está)
- **24h window status** — verde si activa, amarillo si por expirar, rojo
  si expirada

### Mensajes

Lista cronológica de mensajes, formato chat:

- **Mensajes del contacto** (inbound) a la izquierda
- **Mensajes del team** (outbound) a la derecha
- **Mensajes del bot** marcados con un badge "Bot"
- **Mensajes de sistema** (asignación, resolución, etc.) centrados,
  estilo italic

Cada mensaje muestra:

- Texto / contenido (imagen, audio, doc, etc.)
- Timestamp
- **Estado de envío** (sent / delivered / read) — para outbound
- **Quién lo mandó** (avatar del agente, o "Bot")

### Input para responder

Abajo del todo, el campo para escribir. Soporta:

- **Texto plano**
- **Adjuntar imagen / doc / audio** (clip o drag&drop)
- **Mandar template aprobado** (botón especial cuando el window está
  expirado o querés iniciar)
- **Insertar Quick Reply** (snippet pre-armado, ver
  [Respuestas rápidas](./respuestas-rapidas))

Si el 24h window está expirado, el input de texto se bloquea con un
mensaje "Esta conversación expiró. Mandá un template para reactivarla".

## Acciones desde el detalle

### Asignar / re-asignar

- **Si está UNASSIGNED**: botón "Tomar esta conversación" → te la
  asignás a vos mismo
- **Asignar a otro agente**: click en el avatar del header → "Cambiar
  asignación" → elegís a otro miembro del team

### Marcar como Esperando

Click **"En espera"** → la conversación pasa a WAITING. Si el contacto
no escribe en X horas (configurable, default 24h), vuelve a UNASSIGNED.

Útil cuando:

- Mandaste una pregunta y esperás la respuesta del cliente
- Te pidieron tiempo para resolver algo internamente
- No querés que aparezca como "abierta" en tu queue mientras esperás

### Resolver

Click **"Resolver"** → la conversación pasa a RESOLVED.

Te pide opcionalmente:

- **Nota de resolución**: texto interno, queda en el historial
- **Tags / categorización**: para análisis posterior

La conversación sale del inbox principal pero podés:

- Verla en el filtro "Resueltas"
- Reabrirla si el contacto vuelve a escribir (automático)
- Marcarla manualmente como UNASSIGNED de vuelta si querés

### Reasignar a un bot

Si tenés bots configurados, podés pasar la conversación al bot:

- **"Pasar al bot"** → elegís cuál bot
- El bot toma el control y empieza desde el primer nodo de su flujo

## Notificaciones en vivo

El inbox se actualiza **en tiempo real** vía WebSocket:

- Nuevo mensaje inbound → aparece sin refrescar
- Asignación / resolución por otro agente → el listado se reorganiza
- Sonido + badge en el favicon si tenés notificaciones habilitadas

## El dashboard live

**WhatsApp → Dashboard live** es una vista distinta, más operativa:

- Vista de **todos los agentes del team** y a qué conversaciones están
  asignados ahora mismo
- Vista de **conversaciones UNASSIGNED en cola** ordenadas por
  antigüedad
- Vista de **conversaciones por estado** con contadores
- **Métricas en tiempo real**: tiempo medio de respuesta, conversaciones
  resueltas en la última hora, etc.

Útil para supervisores o team leads que necesitan ver "cómo va el
servicio" sin abrir conversación por conversación.

## Asignación automática (próximamente)

Hoy las conversaciones llegan UNASSIGNED y los agentes las toman
manualmente. En la roadmap está agregar:

- **Round-robin**: rotar entre agentes activos
- **Por habilidad / tag**: ciertos contactos a ciertos agentes
- **Por horario**: nocturno → equipo nocturno

Si te resulta crítico, escribinos a hola@massivo.app.

## Búsqueda y filtros avanzados

En el input "Buscar" del inbox podés buscar:

- **Por teléfono**: matching parcial
- **Por nombre del contacto** (si está en tus contactos)
- **Por texto del mensaje**: matchea contra todos los mensajes de
  todas las conversaciones del team
- **Por tag de resolución**: solo las que cerraste con cierto tag

## Compliance del 24h window en el inbox

El input bloquea automáticamente el envío de texto libre si la ventana
expiró. Para reactivar la conversación tenés que:

1. Click **"Mandar template"** en el input
2. Elegir un template APPROVED
3. Llenar las variables
4. Confirmar

El template sale, llega al contacto. Si el contacto responde, **la
ventana se reabre** y podés mandar texto libre.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| No aparecen mensajes nuevos al refrescar | Webhook caído en Meta | Revisá Meta Console → Webhooks → Recent Deliveries |
| Mensajes inbound llegan pero outbound no | Tu access token expiró | Renová token en Meta y actualizalo en Massivo |
| El input no me deja escribir | 24h window expirada | Mandá un template |
| Asigné la conversación pero otro agente sigue viendo | Race condition con dos asignaciones en paralelo | Refrescá, el último gana |
| El bot no responde aunque hay sesión activa | El último mensaje del contacto activó el bot pero no llegó al worker | Pasá manualmente al bot o re-asignala |

## Próximos pasos

- 🚫 [Opt-out y compliance](./opt-out-compliance) — cómo manejamos el
  "BAJA" automáticamente
- ⚡ [Respuestas rápidas](./respuestas-rapidas) para acelerar respuestas
  manuales
- 🤖 [Crear un bot](../bots/crear-primer-bot) para automatizar respuestas
