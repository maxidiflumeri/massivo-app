---
title: HANDOFF
sidebar_position: 3
---

# Nodo HANDOFF

**Termina el bot y escala la conversación al inbox de humanos**. Es el
nodo que usás cuando el bot llegó a un punto donde necesita
intervención humana.

Cuando el flow llega a un HANDOFF:

1. Bot envía un mensaje final al contacto (configurable)
2. La conversación pasa a estado **suspendido del bot** (`botSuspended
   = true`)
3. Aparece en el inbox de los agentes del team
4. El bot **no vuelve a responder** hasta que un humano resuelva la
   conversación

## Cuándo usarlo

- "Te paso con un agente humano" después de capturar datos
- "Tu caso requiere atención personalizada"
- Final de un flow de captura de lead cuando llegás a `agenteVentas`
- Fallback de algún CONDITION que no pudo resolver automáticamente

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `text` | string | ✅ | Mensaje final al contacto. Soporta variables. |
| `escalate` | boolean | — | Si `true`, marca la conversación como prioridad alta en el inbox |

## Ejemplo: handoff con contexto capturado

```yaml
nodes:
  pedir_problema:
    kind: CAPTURE
    text: "Contame brevemente qué problema estás teniendo:"
    saveAs: problema
    nextNodeId: pedir_urgencia

  pedir_urgencia:
    kind: MENU
    text: "¿Qué tan urgente es?"
    options:
      - label: "Crítico (sistema caído)"
        nextNodeId: escalar_critico
      - label: "Importante"
        nextNodeId: escalar_normal
      - label: "Pregunta general"
        nextNodeId: escalar_normal

  escalar_critico:
    kind: HANDOFF
    text: |
      Entendido, te conectamos con un agente de inmediato.

      Resumen del caso:
      • Problema: {{problema}}
      • Urgencia: CRÍTICO

      Hold tight 🚀
    escalate: true

  escalar_normal:
    kind: HANDOFF
    text: |
      Gracias, en breve un agente se va a poner en contacto con vos.

      Tu consulta: {{problema}}
```

Cuando el agente abre la conversación en el inbox, ya tiene **todo el
contexto que el bot capturó** disponible en variables y en el
historial del chat.

## El flag `escalate`

Si `escalate: true`, la conversación entra al inbox con un **badge de
prioridad** ("Escalado por bot" + prioridad alta).

Útil para diferenciar:

- HANDOFF normal: el cliente llegó al final de un flow de captura
- HANDOFF escalado: el cliente reportó algo crítico, atender ahora

Los filtros del inbox respetan este flag — podés filtrar por
"Escalados" para priorizar.

## Comportamiento

1. Bot envía el `text` final al contacto
2. **Setea** `WapiConversation.botSuspended = true`
3. **Setea** `WapiConversation.escalated = escalate ?? false`
4. Termina la sesión del bot (la borra)
5. La conversación aparece en el inbox de los agentes

A partir de ese momento:

- Los mensajes inbound del contacto van directo al inbox, sin pasar
  por el bot
- Cualquier agente puede tomarla
- El bot no va a responder hasta que la conversación pase a `RESOLVED`

## El "contexto capturado" — cómo lo ve el agente

En el detalle de la conversación, el agente ve:

- **Historial completo del chat** — todos los mensajes del bot y del
  contacto
- **Panel lateral con variables capturadas**: nombre, problema,
  urgencia, etc.
- **Indicador "Escalado por bot"** si `escalate: true`

Esto permite que el agente **arranque ya informado**, sin tener que
re-preguntar todo lo que el bot ya capturó.

## HANDOFF vs MESSAGE-terminal

| Necesito | Uso |
|---|---|
| Cerrar el bot sin pasar a humano (caso completamente automatizado) | MESSAGE sin `nextNodeId` |
| Cerrar el bot pasando al inbox para humano | HANDOFF |

Si usás MESSAGE como terminal, la próxima vez que el contacto escriba,
el bot toma de nuevo. Si usás HANDOFF, queda en el inbox hasta que un
agente lo resuelva.

## Patrones comunes

### Captura → HANDOFF

```
[CAPTURE: nombre] → [CAPTURE: empresa] → [CAPTURE: necesidad]
                                              ↓
                                         [HANDOFF al agente]
```

Bot precalifica, agente cierra.

### MENU → 3 ramas con HANDOFFs específicos

```
[MENU: ¿De qué área?]
  ├── "Soporte" → [HANDOFF: equipo soporte]
  ├── "Ventas"  → [HANDOFF: equipo ventas]
  └── "Otra"    → [HANDOFF: catch-all]
```

Triage rápido al equipo correcto.

### Después de CONDITION fallback

```
[CONDITION: ¿es cliente?]
  ├── Sí → [flow VIP]
  ├── No → [flow lead nuevo]
  └── else → [HANDOFF: caso raro, agente revisa]
```

## Buenas prácticas

### Resumir lo que el bot capturó

En el `text` del HANDOFF, incluí un mini-resumen con las variables
clave:

```
text: |
  Te paso con un agente.

  Resumen:
  • Nombre: {{nombre}}
  • Empresa: {{empresa}}
  • Necesidad: {{necesidad}}

  Aguardá un momento 🙂
```

Esto sirve **al contacto** (sabe que el bot transmitió bien) y
**al agente** (lee de un vistazo qué pasó).

### Tono de transición

Avisá al contacto que se cambia el modo:

- "Te paso con un agente humano" (claro)
- "En un momento un compañero se pone en contacto" (más cálido)
- "Tu caso requiere atención personalizada — un especialista te
  atiende ahora" (más formal)

### No abuses del HANDOFF

Si la mayoría de tus flows terminan en HANDOFF, el bot no está
agregando valor — solo es un menú lindo. Re-evaluá: ¿qué partes
podrías automatizar más?

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| HANDOFF setea botSuspended pero el bot sigue respondiendo | Race condition con un inbound entrante mientras se settea | Es raro, reintentá. Si persiste, reportá bug |
| El agente no ve las variables capturadas | El bot las guardó en sesión, pero la sesión se cerró al HANDOFF | Las variables se guardan también en la conversación, deberían estar disponibles |
| Cuando marco RESOLVED el bot no se reactiva | Bug en la lógica de reset | Reactivá manualmente desde el inbox |

## Próximos pasos

- 💬 [Inbox de WhatsApp](../../whatsapp/inbox) — cómo el agente
  recibe las conversaciones escaladas
- 🤖 [Bot vs humano](../conceptos/cuando-bot-vs-humano)
