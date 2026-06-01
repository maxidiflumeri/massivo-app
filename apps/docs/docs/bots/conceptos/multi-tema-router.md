---
title: Multi-tema y Router
sidebar_position: 3
---

# Multi-tema y Router

Un bot **no tiene que ser un solo flujo gigante**. Lo dividís en
**varios temas (topics)** independientes y un **router** decide a cuál
entrar según lo que el contacto escriba.

Este modelo escala mucho mejor que armar un flujo monolítico con
condicionales gigantes.

## El modelo: Topics + Router

### Topics

Un **topic** es **un flujo completo y autocontenido** con:

- Un identificador único (ej. `soporte`, `ventas`, `default`)
- Un label human-friendly (ej. "Soporte técnico")
- Un flow con sus nodos y conexiones

Un bot puede tener **N topics** en paralelo. Cada uno representa un
**caso de uso distinto**.

### Router

El **router** es la lógica que **decide a qué topic entrar** cuando un
contacto inicia conversación (o cuando llega un nuevo inbound sin
sesión activa).

Tiene 3 tipos de reglas, en orden de prioridad:

| Tipo de regla | Cuándo matchea |
|---|---|
| `template-payload` | El contacto vino de un template aprobado de Meta — extraemos info del payload |
| `keyword` | El texto del contacto matchea una keyword (exact, case-insensitive) |
| `default` | Catch-all si nada matcheó arriba |

## Ejemplo concreto

Bot con 3 topics:

```yaml
topics:
  - id: soporte
    label: "Soporte técnico"
    flow: [...]
  - id: ventas
    label: "Información comercial"
    flow: [...]
  - id: default
    label: "Catch-all"
    flow: [...]

router:
  - kind: keyword
    pattern: ["soporte", "ayuda", "problema"]
    topic: soporte
  - kind: keyword
    pattern: ["precio", "comprar", "cotizacion"]
    topic: ventas
  - kind: default
    topic: default
```

### Casos:

**Caso 1**: contacto escribe `"Hola, necesito soporte"`
→ Router matchea `keyword: soporte`
→ Entra al topic `soporte`

**Caso 2**: contacto escribe `"¿Cuánto sale?"`
→ No matchea ninguna keyword
→ Router cae al `default`
→ Entra al topic `default` (que puede ser un MENU general que pregunta
"¿en qué te ayudo?" y reenvía a topics específicos)

**Caso 3**: contacto viene de hacer click en un botón de un template
con payload `"start_onboarding"`
→ Router matchea `template-payload: ^start_onboarding`
→ Entra al topic `onboarding`

## Router por template-payload

Cuando mandás un template con un **Quick Reply button**, el botón tiene
un **payload** opaco (string que vos definís). Cuando el contacto le
da click, Meta nos manda ese payload como mensaje inbound.

Ejemplo:

```
Template: "promo_finde_2026"
  Body: "¡20% off este finde!"
  Buttons:
    - Quick Reply: "Me interesa" → payload: "promo_2026_interest"
    - Quick Reply: "No gracias" → payload: "promo_2026_decline"
```

Cuando el contacto clickea "Me interesa", recibimos:

```
{ text: "Me interesa", payload: "promo_2026_interest" }
```

El router puede matchear con regex:

```yaml
- kind: template-payload
  pattern: "^promo_2026_interest$"
  topic: convertir_interesado
```

**Las regex pueden tener named groups** que se inyectan como variables
de la sesión:

```yaml
- kind: template-payload
  pattern: "^pedido_(?<pedidoId>\\d+)_(?<accion>cancelar|confirmar)$"
  topic: gestionar_pedido
```

Si el payload es `pedido_12345_confirmar`:

- Topic activado: `gestionar_pedido`
- Variables inyectadas:
  - `pedidoId = "12345"`
  - `accion = "confirmar"`

Y dentro del topic podés usar `{{pedidoId}}` y `{{accion}}` libremente.

Esto es **muy poderoso** para flujos transaccionales — mandás templates
con buttons que llevan info estructurada, y el bot procesa con todo el
contexto.

## Router por keyword

El más simple. Matchea **exact text** (después de trim + lowercase):

```yaml
- kind: keyword
  pattern: ["soporte", "ayuda", "problema"]
  topic: soporte
```

Si el contacto escribe `"Soporte"`, `"soporte"`, `"SOPORTE"`,
`"  ayuda  "` → matchea.

Si escribe `"necesito soporte técnico"` → **no matchea** (no es exact).

Para matching más loose usá una regex en `template-payload` o un
**nodo CONDITION con `kind: var, op: contains`** dentro del flujo
default.

## Router default

El catch-all. Si ninguna regla anterior matcheó, se entra al topic
default.

**Siempre tené un topic default**. Si no, los mensajes que no matchean
caen al inbox como humano-requerido (no es necesariamente malo, pero
suele no ser lo que querés).

## Saltar entre topics: `gotoTopic`

Algunos nodos aceptan un campo `gotoTopic` que **salta al inicio de
otro topic**:

```
[MENU: ¿En qué te ayudo?]
  ├── "Soporte" → gotoTopic: soporte
  ├── "Ventas" → gotoTopic: ventas
  └── "Otra cosa" → [HANDOFF]
```

Cuando el contacto elige "Soporte", la sesión se mueve al topic
`soporte` y empieza desde su nodo inicial.

`gotoTopic` está disponible en casi todos los nodos como alternativa a
`nextNodeId`. Usás uno o el otro.

## Cuándo dividir en topics vs un flujo grande

| Caso | Topics o flujo? |
|---|---|
| El bot solo hace una cosa (ej. captura de lead) | 1 topic = todo el flujo |
| El bot tiene 2-3 ramas independientes | 1 topic con MENU al inicio que ramifica |
| El bot tiene 5+ ramas independientes con flujos largos | N topics + router |
| El bot maneja flows que se inician desde distintos templates | N topics + router por template-payload |
| Quiero que el contacto pueda saltar entre flows en cualquier momento | N topics + nodos con `gotoTopic` |

## Patrón recomendado: topic `default` como hub

Tener un topic `default` con un MENU inicial que ramifica a otros
topics:

```yaml
topics:
  - id: default
    flow:
      startNodeId: hub
      nodes:
        hub:
          kind: MENU
          text: "¡Hola! ¿En qué te ayudo?"
          options:
            - {label: "Soporte", gotoTopic: soporte}
            - {label: "Ventas", gotoTopic: ventas}
            - {label: "Otra cosa", nextNodeId: humano}
        humano:
          kind: HANDOFF

  - id: soporte
    flow: [...flow de soporte completo...]

  - id: ventas
    flow: [...flow de ventas completo...]

router:
  - kind: keyword
    pattern: ["soporte"]
    topic: soporte
  - kind: keyword
    pattern: ["precio", "comprar"]
    topic: ventas
  - kind: default
    topic: default
```

Beneficios:

- Si el contacto sabe lo que quiere y escribe keyword → entra directo
- Si no sabe, el menú lo guía
- Cada topic se edita / publica independiente
- Podés desactivar un topic sin romper los otros

## Limitaciones

- **Solo 1 topic activo por sesión a la vez** (no podés estar en
  paralelo en 2 topics)
- **Variables NO se comparten entre topics directamente** — cuando saltás
  a otro topic con `gotoTopic`, las variables capturadas se preservan en
  la sesión. Pero el cambio de topic puede sobreescribir si el nuevo
  topic captura algo con el mismo nombre de variable.

## Próximos pasos

- 🤖 [Cuándo bot vs humano](./cuando-bot-vs-humano)
- 📝 [Draft vs Published](./draft-vs-published) — cómo editás un bot
  sin romper producción
- 🛠 [Editor de flujo](../editor-de-flujo) — la UI donde armás los
  topics
