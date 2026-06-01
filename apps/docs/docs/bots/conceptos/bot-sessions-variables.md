---
title: Sesiones y variables
sidebar_position: 2
---

# Sesiones y variables del bot

Una **sesión** es el estado actual del bot **para un contacto
específico**. Mantiene:

- En qué nodo del flujo está parado
- En qué topic está
- Qué variables capturó hasta el momento
- Cuándo expira por inactividad

Sin sesiones, el bot **no podría tener "memoria"** y cada mensaje del
contacto sería tratado como si fuera el primero.

## Una sesión por (config, teléfono)

La sesión se identifica por la combinación **WapiConfig + número de
teléfono**. Significa:

- **Un contacto + un número Meta** = una sesión activa a la vez
- Si el mismo contacto escribe al mismo número, sigue la misma sesión
- Si el mismo contacto escribe a **otro número Meta** del mismo team,
  se inicia otra sesión independiente

## Cuándo se crea / cuándo se borra

### Se crea automáticamente

Cuando el contacto te escribe y el bot tiene que **pausar para esperar
respuesta** (típicamente después de un MENU, CAPTURE, o algunos casos
de CONDITION). El motor del bot:

1. Procesa el mensaje
2. Avanza al siguiente nodo
3. Si el siguiente nodo es **terminal** (HANDOFF) → no se crea sesión
4. Si requiere esperar respuesta del contacto → **se crea sesión** con
   `currentNodeId` apuntando al nodo de espera

### Se borra automáticamente

| Cuándo | Por qué |
|---|---|
| **Llega a un nodo HANDOFF** | El bot terminó, escala a humano |
| **Llega a un nodo terminal sin `nextNodeId`** | Fin del flujo |
| **TTL expira** (default 30 min sin nuevo inbound) | El contacto abandonó la conversación |
| **El operador pausa el bot manualmente** desde el inbox | Para que el humano tome |

### Se reactiva

Cuando la conversación pasa a **RESOLVED** (un humano la cerró), si el
contacto vuelve a escribir, el bot **se reactiva** para procesar el
nuevo inbound desde el nodo de inicio (a menos que esté suspendido por
otra razón).

## Datos guardados en la sesión

| Campo | Qué guarda |
|---|---|
| `currentNodeId` | Nodo donde está parado el contacto en el flujo |
| `currentTopicId` | Topic al que pertenece el flujo activo |
| `startedAt` | Cuando arrancó la sesión |
| `lastInboundAt` | Último mensaje del contacto |
| `expiresAt` | Cuando expira por TTL |
| `data` | JSON libre con las variables capturadas |

## Variables — el "data" de la sesión

Cada vez que un nodo **CAPTURE** corre, guarda lo que el contacto
respondió en una variable:

```
[CAPTURE: ¿Cómo te llamás? → saveAs: nombre]
   ↓
sesión.data = { nombre: "Juan" }
```

Las variables son **scoped a la sesión** — viven mientras la sesión
está activa.

## Tipos de variables

Massivo soporta **3 tipos**:

| Tipo | Ejemplo |
|---|---|
| `string` | `"Juan"`, `"hola@empresa.com"` |
| `number` | `42`, `1500.50` |
| `boolean` | `true`, `false` |

### Variables declarativas (recomendado)

En el detalle del bot tenés una sección **Variables** donde definís
**de antemano** qué variables va a usar tu bot, su tipo, y un valor por
defecto opcional:

```
| Nombre   | Tipo    | Default | Descripción       |
|----------|---------|---------|-------------------|
| nombre   | string  | —       | Nombre del cliente |
| edad     | number  | 0       | Edad reportada    |
| esCliente| boolean | false   | ¿Ya es cliente?   |
```

Cuando una sesión arranca, **las variables declaradas se siembran con
sus defaults**. Esto es útil porque podés:

- Garantizar que ciertas variables siempre existen
- Evitar `{{nombre}}` rendereado como `undefined`
- Coercionar el tipo cuando un SET_VAR las modifica

### Variables ad-hoc (sin declarar)

Si un nodo `CAPTURE` o `SET_VAR` graba una variable que **no está
declarada**, se crea on-the-fly como `string`. Funcionan pero son
menos seguras (no hay validación, no hay default).

## Cómo usar variables en los nodos

Las variables se usan con **doble llaves** (Handlebars-like):

```
Hola {{nombre}}, tu edad es {{edad}} y vas a recibir un
descuento de {{descuento}}%.
```

Donde se usan:

- Cualquier `text` de un nodo (MENU, MESSAGE, HANDOFF, CAPTURE prompt)
- `caption` y `filename` de MEDIA / MEDIA_FROM_URL
- `url`, `headers`, `body` de HTTP
- `value` de SET_VAR
- `when` de CONDITION (en `value` cuando `kind: 'var'`)

### Expresiones avanzadas con JSONata

Para lógica más compleja podés usar **JSONata** dentro de las llaves
con prefijo `=`:

```
{{= edad >= 18 ? "Adulto" : "Menor" }}

{{= productos[0].nombre }}

{{= $sum(items.precio) }}
```

JSONata permite condicionales, aritmética, acceso a paths, agregaciones
y muchas funciones built-in. Útil sobre todo dentro de nodos `HTTP` o
`FOREACH`.

## Variables del sistema disponibles automáticamente

Algunas variables se inyectan sin que tengas que capturarlas:

| Variable | Qué inyecta |
|---|---|
| `{{contact.phone}}` | Teléfono del contacto |
| `{{contact.name}}` | Nombre si está en tus contactos |
| `{{contact.firstName}}` | First name |
| `{{conversation.id}}` | ID de la conversación |
| `{{session.startedAt}}` | Cuando arrancó la sesión |

## TTL — cuándo expira una sesión

Por defecto **30 minutos sin nuevo inbound**. Esto es configurable per-
WapiConfig:

- **WapiConfig → botSessionTtlMin** = 30 (minutos)

### Qué pasa cuando expira

- La sesión se borra
- Las variables se pierden
- Si el contacto vuelve a escribir, **arranca una sesión nueva** desde
  el inicio del flujo (o del topic correspondiente según el router)

### Ajustar el TTL

| Caso | TTL recomendado |
|---|---|
| Bot de FAQ rápido (consulta 1 cosa y se va) | 15-30 min |
| Bot de captura de lead (varios pasos) | 30-60 min |
| Bot de onboarding multi-día | 24 horas (1440 min) |
| Recordatorios / acción mañana | 7 días o más |

Cuanto más largo el TTL, más sesiones acumuladas en DB (no es problema
hasta volúmenes muy grandes).

## Limitaciones / cosas a saber

### No persisten cross-bot

Si un contacto interactúa con **otro bot** (otra config) en paralelo,
las variables de una sesión no se ven en la otra.

### No persisten cross-session

Cuando la sesión expira, las variables se **pierden**. Si necesitás
recordar algo del contacto entre sesiones, guardalo en el **contacto
unificado** (campo `data` del contacto). Para eso podés usar un nodo
HTTP que llame a tu propio backend o un endpoint nuestro.

### Tamaño del data

El campo `data` está pensado para variables chicas (nombres, IDs,
flags). Si te excedés (>10KB de JSON), considera:

- Guardar referencias en lugar de datos completos
- Limpiar variables que ya no necesitás con un SET_VAR a `null`

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| Bot dice "Hola undefined" | Variable no capturada / fuera de scope | Asegurate de que el CAPTURE corrió antes; o usá `default` en la declaración |
| Sesión "se pierde" en medio del flujo | TTL expiró | Aumentá `botSessionTtlMin` |
| Variables capturadas pero condition no matchea | Tipo mal coercionado | Declará la variable con tipo correcto en variables declarativas |
| Bot vuelve a empezar siempre | La sesión nunca se crea (todos los nodos son auto-avance) | Tiene que haber al menos un CAPTURE o MENU para que se cree sesión |

## Próximos pasos

- 🧭 [Multi-tema y router](./multi-tema-router) si tu bot va a tener
  varios flujos
- 🤖 [Crear tu primer bot](../crear-primer-bot)
- 🎯 [Tipos de nodos](../editor-de-flujo) — referencia completa
