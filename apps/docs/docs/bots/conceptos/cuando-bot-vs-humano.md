---
title: Bot vs humano — cuándo se activa cada uno
sidebar_position: 4
---

# Cuándo el bot toma vs cuándo lo hace un humano

Un bot bien diseñado **convive con agentes humanos**. No es "todo bot"
o "todo humano" — depende de la situación.

Esta página explica cuándo el motor de Massivo decide que el bot
responda automáticamente, cuándo le pasa la conversación al inbox, y
cómo el agente puede tomar / soltar el control.

## La pregunta que se hace Massivo en cada inbound

Cuando llega un mensaje del contacto:

```
¿La WapiConfig tiene botEnabled = true?
   │
   ├── NO → mensaje al inbox (humano)
   │
   └── SÍ
        │
   ¿La feature de bots está habilitada para la org?
        │
        ├── NO → mensaje al inbox (humano)
        │
        └── SÍ
             │
        ¿La conversación tiene botSuspended = true?
             │
             ├── SÍ → mensaje al inbox (humano)
             │
             └── NO → BOT procesa
                     │
                     ¿El motor del bot pudo manejar el mensaje?
                          │
                          ├── NO (flow inválido / no handled)
                          │   → mensaje al inbox (humano)
                          │
                          └── SÍ → bot respondió, todo bien
```

## Las 4 puertas de activación

### Puerta 1 — `WapiConfig.botEnabled`

Es un flag del **número Meta**: vos decidís si querés bot en ese número.

- **OFF**: el bot nunca activa para este número. Todo va al inbox.
- **ON**: el bot puede activar (si pasa las siguientes puertas).

Lo configurás en **WhatsApp → Números → Editar config → Bot habilitado**.

### Puerta 2 — Feature flag de la organización

Massivo tiene un **kill-switch global de la feature de bots**
(env-level) y un **toggle por organización** (`Organization.botEnabled`).

- Si el global está OFF (raro, sería un freeze por incidente nuestro),
  ningún bot funciona para nadie
- Si tu organización no tiene la feature habilitada (típicamente por
  plan), no tenés bots disponibles

Esto **es independiente de la config del número** — son dos capas
separadas. Una organización sin la feature no puede crear bots ni
verlos en el editor.

### Puerta 3 — `WapiConversation.botSuspended`

Una conversación específica puede tener el bot **suspendido**. Cuando
está suspendido:

- El motor del bot **no procesa** los inbound de esa conversación
- Todos los mensajes van al **inbox para humano**

Cómo se setea a `true`:

| Cuándo | Quién |
|---|---|
| El flujo del bot llega a un nodo HANDOFF | El propio bot |
| Un agente humano toma la conversación manualmente | El agente desde la UI |
| Un agente pausa el bot en una conversación | El agente desde la UI |

Cómo se libera (vuelve a `false`):

| Cuándo | Resultado |
|---|---|
| La conversación pasa a `RESOLVED` (un agente la cerró) | Próximos inbounds vuelven a procesarse por el bot |
| Un agente reactiva manualmente el bot en la conversación | Idem |

### Puerta 4 — El flow puede o no manejar el mensaje

Aún si las 3 puertas anteriores dejan pasar, el motor evalúa si **el
flow tiene un nodo apropiado** para procesar este mensaje:

- Si la sesión está en un MENU y el contacto eligió una opción válida →
  bot procesa
- Si la sesión está en un CAPTURE y el contacto respondió → bot captura
- Si el contacto manda algo inesperado y no hay manejo (no hay router
  default, etc.) → "no handled" → mensaje al inbox

## El nodo HANDOFF — escalamiento explícito

El nodo **HANDOFF** es el mecanismo "oficial" del bot para **escalar al
humano**:

```
[CAPTURE: ¿Cuál es tu problema? → saveAs: problema]
   ↓
[MESSAGE: Gracias, te paso con un agente]
   ↓
[HANDOFF: te conectamos]
```

Cuando el flow llega al HANDOFF, Massivo:

1. Setea `WapiConversation.botSuspended = true`
2. Setea `WapiConversation.escalated = true` (visible como prioridad en
   inbox)
3. Termina la sesión del bot
4. La conversación aparece en el inbox de los agentes con badge
   "Escalado por bot"

Útil para que el bot **haga el pre-trabajo** (capturar datos, calificar
lead) y **handoff con contexto**: el agente ve todo lo que el bot
capturó.

## Take-over manual desde el inbox

Si un agente está mirando una conversación y se da cuenta que **el bot
no va a poder con esto**, puede tomar manualmente:

1. En el detalle de la conversación, click **"Tomar manualmente"**
2. `botSuspended` se setea a `true`
3. La sesión del bot se cierra
4. A partir de ahí, el agente responde libremente

El bot **no va a interferir** con lo que el agente escriba. Cualquier
inbound nuevo del contacto se queda en la conversación, sin pasar por
el motor del bot.

## Reactivación del bot

Después de un take-over manual o un HANDOFF, **el bot vuelve a actuar
solo cuando la conversación se RESUELVE**:

1. Agente marca conversación como `RESOLVED`
2. `botSuspended` se resetea a `false`
3. Si el contacto vuelve a escribir **más tarde**, el bot toma desde el
   inicio del flow (o del topic correspondiente según el router)

Esto significa que **el bot no "interrumpe" a un humano en pleno
trabajo** — solo retoma cuando el ciclo se cierra.

### Reactivación manual

Si querés que el bot retome **antes** de marcar como resuelto:

- En el detalle de la conversación, click **"Reactivar bot"**
- `botSuspended` vuelve a `false`
- El próximo inbound lo procesa el bot

## El estado WAITING — el contraparte humano

El humano también tiene un mecanismo para **decir "espero al cliente"**:

- En el inbox, click **"En espera"**
- La conversación pasa a estado `WAITING`
- Se setea un `waitingUntil` (timestamp futuro, default 2 horas)
- Si el contacto **no escribe** antes de `waitingUntil`, la
  conversación vuelve a `UNASSIGNED` automáticamente
- Si el contacto **sí escribe**, el agente la sigue atendiendo

Esto es **mientras el agente humano está activo** — no afecta al bot
(que sigue suspendido si estaba suspendido).

## Conviviendo bot + humano: el patrón típico

```
1. Contacto escribe por primera vez
   → Bot toma, ofrece menú
   → Capture nombre y problema
   → Si es FAQ simple → bot responde y cierra
   → Si es complejo → HANDOFF al inbox

2. Agente toma la conversación
   → Resuelve el caso
   → Marca como RESOLVED

3. Contacto vuelve a escribir días después
   → Bot toma de nuevo (porque la conversación está resuelta)
   → Repite el flow, eventualmente captura contexto
```

Bot hace el 80% de FAQ, humano hace el 20% complejo. El bot también
hace **triage / pre-cualificación** para que el humano arranque con
contexto.

## Test mode — bot que no manda mensajes reales

En la **WapiConfig** hay un toggle **Test mode**. Cuando está activo:

- El bot procesa normal (avanza por el flow, captura variables, etc.)
- Los mensajes outbound del bot **NO se envían a Meta**, solo se
  loggean
- Útil para probar un bot **sin gastar mensajes reales** ni molestar
  a contactos reales

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| El bot no responde nada | `botEnabled = false` o feature deshabilitada | Activá ambos toggles |
| El bot responde algunas conversaciones y otras no | Algunas conversaciones están con `botSuspended = true` por HANDOFF previo | Marcalas como RESOLVED para liberar |
| Mensajes al inbox aunque el bot está activo | El flow no maneja ese tipo de inbound (no hay topic default) | Agregar topic default catch-all |
| El bot interrumpe al agente | Take-over no funcionó | Re-tomá la conversación, el toggle debe persistir |
| HANDOFF no aparece como "escalado" en el inbox | Bug visual a veces | Refrescá el inbox |

## Próximos pasos

- 🧭 [Multi-tema y router](./multi-tema-router) para tener un topic
  default catch-all
- 📝 [Draft vs Published](./draft-vs-published)
- 🛠 [Crear tu primer bot](../crear-primer-bot)
