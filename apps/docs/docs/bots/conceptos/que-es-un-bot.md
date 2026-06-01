---
title: ¿Qué es un bot guiado?
sidebar_position: 1
---

# ¿Qué es un bot guiado?

Un **bot guiado** es un **flujo de conversación automatizado** que
responde a los mensajes de tus contactos en WhatsApp **sin
intervención humana**. Lo armás visualmente arrastrando nodos en un
editor, conectándolos para definir qué pasa según lo que el contacto
escribe o elige.

## ¿Para qué sirve un bot?

Casos típicos donde un bot resuelve mucho:

| Caso | El bot hace |
|---|---|
| **FAQ automático** | Responde preguntas frecuentes sin pasar por agente humano |
| **Triage / categorización** | Pregunta "¿qué necesitás?" y dirige al área correcta |
| **Captura de leads** | Pide datos básicos (nombre, mail, empresa) antes de pasar a un vendedor |
| **Recordatorios** | "Tu turno es mañana a las 10, ¿confirmás?" con botón sí/no |
| **Onboarding** | Guiar paso a paso a un cliente nuevo |
| **Status / consulta de pedido** | "¿Cuál es tu número de pedido?" → consulta API → responde |

## Cuándo NO usar un bot

Igual de importante saber **cuándo el bot no agrega valor**:

- **Conversaciones de soporte complejo**: si el caso es único y requiere
  empatía / criterio humano, el bot frustra más que ayuda. Mejor que
  un agente humano atienda desde el principio.
- **Sales conversations finales**: cerrar una venta importante por bot
  rara vez funciona. El bot pre-califica, el humano cierra.
- **Quejas o reclamos**: el cliente quiere hablar con una persona.
  Mandalo directo al inbox.

**Regla general**: el bot es bueno para **acelerar lo repetitivo y
automatizable**. Lo único e importante mandalo al humano.

## Vs Quick Replies vs Templates: la diferencia

| | Bot | Quick Reply | Template |
|---|---|---|---|
| **Quién dispara** | Automático | Agente humano | Backend (vos / Massivo) |
| **Cuándo** | Cuando el contacto te escribe | Cuando el agente responde manual | Cuando vos querés iniciar |
| **Tipo de mensaje** | Cualquiera (texto, botón, media) | Texto (snippet) | Template aprobado por Meta |
| **Para qué** | Respuestas automáticas en el inbox | Acelerar respuestas humanas | Iniciar conversación fuera del 24h window |
| **Caso típico** | FAQ, captura de lead, triage | Snippets repetitivos del equipo | Recordatorio post-venta, promo |

## Cómo funciona un bot en alto nivel

Cuando un contacto te escribe:

```
Contacto → "Hola"
   ↓
Meta envía webhook a Massivo
   ↓
Massivo busca bot configurado para ese número
   ↓
¿Hay bot habilitado y la conversación no está suspendida?
   │
   ├── NO → mensaje va al inbox para humano
   │
   └── SÍ
         ↓
       Bot procesa según el nodo actual del contacto
         ↓
       Bot responde (mensaje, botones, captura)
         ↓
       Bot avanza al siguiente nodo según la respuesta
         ↓
       Espera el próximo mensaje del contacto
```

El bot mantiene **una sesión por contacto** que recuerda dónde está
parado. Si el contacto deja de escribir y vuelve más tarde (dentro
del TTL configurado), retoma desde el mismo punto.

## El editor de flujo: arrastrar y conectar

Los bots se diseñan visualmente en un **editor de flujo** (canvas).
Cada nodo es una caja con un tipo (MENU, MESSAGE, CAPTURE, etc.) y
los conectás con flechas para definir qué pasa después de cada paso.

Ejemplo simple de un bot de FAQ con escalamiento:

```
[MENU: ¿En qué te ayudo?]
   ├── "Horarios" → [MESSAGE: lun-vie 9-18hs]
   ├── "Sucursales" → [MESSAGE: Av. Corrientes 1234]
   └── "Otra cosa" → [HANDOFF: te paso con un agente]
```

Cada nodo tiene **configuración** (qué texto mostrar, qué botones,
qué condiciones) y **conexiones** (a qué nodo va después según la
respuesta del contacto).

## Multi-tema (Topics)

Un bot puede tener **varios "temas" (topics)** en paralelo, con
flujos distintos cada uno. Un **router** decide a qué topic entrar
según el mensaje del contacto.

Ejemplo:

```
Bot con 3 topics:
  - "soporte" — activado por keyword "soporte" o "ayuda"
  - "ventas" — activado por keyword "comprar" o "precio"
  - "default" — catch-all si no matchea ningún otro

Si el cliente dice "Quiero saber precios":
  → Router matchea topic "ventas"
  → Entra al flujo de ventas
```

Esto te permite armar **un bot grande compuesto de varios flujos
chicos**, en vez de un monolítico con if/else.

## Variables y persistencia

Cuando el bot le pregunta algo al contacto y este responde, el dato se
guarda como **variable en la sesión**. Esa variable se puede usar más
adelante en el flujo:

```
[CAPTURE: ¿Cómo te llamás? → saveAs: nombre]
   ↓
[MESSAGE: Hola {{nombre}}, en qué te ayudo?]
```

Las variables se mantienen mientras la sesión está activa (TTL
configurable, default 30 min sin actividad).

## Draft vs Published

Cuando editás un bot, **trabajás sobre un draft** (borrador). Los
cambios **no afectan a los contactos reales** hasta que hagas
**Publish** (publicar).

Esto te deja:

- Iterar sin riesgo
- Probar cambios con el simulador interno antes de publicar
- Rollback si publicaste algo que se rompió

Más detalle en [Draft vs Published](./draft-vs-published).

## Suspensión y reactivación

El bot **puede ser pausado** para una conversación específica:

- Cuando el bot llega a un nodo **HANDOFF**, suspende el bot en esa
  conversación y la pasa al inbox de humanos
- Un agente humano puede pausar el bot manualmente para tomar control
- Cuando la conversación se marca como RESOLVED, el bot **se reactiva**
  para futuros inbounds

Esto permite **convivir bot + humanos** sin pisarse.

## Próximos pasos

- 💡 [Sesiones y variables](./bot-sessions-variables) para entender
  el estado
- 🧭 [Multi-tema y router](./multi-tema-router) para bots compuestos
- 🤖 [Cuándo bot vs humano](./cuando-bot-vs-humano) para reglas de
  activación
- 🛠 [Crear tu primer bot](../crear-primer-bot)
