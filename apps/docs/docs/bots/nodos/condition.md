---
title: CONDITION
sidebar_position: 6
---

# Nodo CONDITION

**Ramifica el flow según condiciones evaluadas en tiempo real**. No
envía mensaje al contacto — es un nodo **interno** que decide a qué
nodo ir según el estado actual de la sesión, la hora del día, etc.

## Cuándo usarlo

- "Si es cliente VIP → flow A; sino → flow B"
- "Si es fuera del horario de atención → mostrar mensaje 'estamos
  cerrados'"
- "Si la edad es >= 18 → continuar; sino → terminar"
- Cualquier ramificación basada en lógica, no en elección del contacto

(Para ramificar según **elección del contacto en un menú**, usá MENU,
no CONDITION.)

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `branches` | array | ✅ | Lista de condiciones evaluadas en orden. La primera que matchea gana. |
| `elseNextNodeId` | string | — | A dónde ir si **ninguna** branch matchea. |
| `elseGotoTopic` | string | — | Alternativa al `elseNextNodeId`. |

### Cada branch

| Campo | Descripción |
|---|---|
| `id` | Identificador interno (auto-generado) |
| `when` | La condición (3 tipos — ver abajo) |
| `nextNodeId` | A dónde ir si esta branch matchea |
| `gotoTopic` | Alternativa al `nextNodeId` |

## Tipos de condiciones (`when`)

### Tipo 1 — Variable comparison (`kind: var`)

Compara una variable de la sesión contra un valor:

```yaml
when:
  kind: var
  var: edad
  op: eq           # eq | neq | contains | matches
  value: "18"
```

**Operadores disponibles**:

| Operador | Significa | Ejemplo |
|---|---|---|
| `eq` | Igual | `edad eq "18"` |
| `neq` | Distinto | `categoria neq "premium"` |
| `contains` | Contiene como substring | `texto contains "soporte"` |
| `matches` | Matchea regex | `email matches "@empresa\\.com$"` |

**Tipos**:

- Si la variable es **string**, todas las comparaciones se hacen como
  string
- Si es **number**, `eq`/`neq` comparan como número. `contains` y
  `matches` lo coercionan a string primero.
- Si es **boolean**, `eq` con valor `"true"` o `"false"` (como string).

### Tipo 2 — Horario del día (`kind: time`)

Matchea si la hora actual está dentro de un rango horario (en hora del
servidor):

```yaml
when:
  kind: time
  between: ["09:00", "18:00"]
```

Útil para flows tipo "horario de atención":

```
[CONDITION: ¿es hora de atención?]
  ├── time between 09:00-18:00 → [continuar flow normal]
  └── else → [MESSAGE: estamos cerrados, te respondemos mañana]
```

### Tipo 3 — Día de la semana (`kind: weekday`)

Matchea si el día actual está en un set de días:

```yaml
when:
  kind: weekday
  days: [1, 2, 3, 4, 5]  # Lunes a viernes (0 = domingo)
```

Útil para reglas "solo en días hábiles":

```
[CONDITION: ¿día hábil?]
  ├── weekday in [1,2,3,4,5] → [seguir]
  └── else → [MESSAGE: nuestra atención humana es lun-vie]
```

## Múltiples branches

Las branches se evalúan **en orden** — la primera que matchea gana.
Las siguientes no se chequean.

```yaml
kind: CONDITION
branches:
  - when: {kind: var, var: nivel, op: eq, value: "premium"}
    nextNodeId: flow_premium
  - when: {kind: var, var: nivel, op: eq, value: "gold"}
    nextNodeId: flow_gold
  - when: {kind: var, var: nivel, op: eq, value: "basic"}
    nextNodeId: flow_basic
elseNextNodeId: flow_default
```

Lectura:

- Si `nivel == "premium"` → flow_premium
- sino, si `nivel == "gold"` → flow_gold
- sino, si `nivel == "basic"` → flow_basic
- sino → flow_default

## Combinando condiciones AND / OR

CONDITION evalúa **una sola** `when` por branch. Si necesitás AND / OR
combinaciones más complejas:

### AND: encadená 2 CONDITIONs

```
[CONDITION: ¿es cliente?]
  ├── sí → [CONDITION: ¿pagó este mes?]
  │           ├── sí → flow_activo
  │           └── else → flow_moroso
  └── else → flow_lead
```

### OR: una branch por cada alternativa

```yaml
branches:
  - when: {kind: var, var: nivel, op: eq, value: "premium"}
    nextNodeId: flow_vip
  - when: {kind: var, var: nivel, op: eq, value: "gold"}
    nextNodeId: flow_vip   # Misma rama
elseNextNodeId: flow_basico
```

### Lógica más compleja: usá HTTP / SET_VAR con expresión

Si las combinaciones son muchas, mejor:

1. **SET_VAR** una variable derivada con expresión JSONata:
   ```yaml
   kind: SET_VAR
   varName: esVIP
   value: "{{= nivel == 'premium' or nivel == 'gold' }}"
   ```
2. **CONDITION** sobre la variable derivada:
   ```yaml
   when: {kind: var, var: esVIP, op: eq, value: "true"}
   ```

Más limpio.

## Ejemplo completo: horario de atención con override por VIP

```yaml
nodes:
  check_horario:
    kind: CONDITION
    branches:
      - when: {kind: var, var: esVIP, op: eq, value: "true"}
        nextNodeId: atender  # VIP atiende 24/7
      - when: {kind: time, between: ["09:00", "18:00"]}
        nextNodeId: atender
      - when: {kind: weekday, days: [0, 6]}  # Sábado o domingo
        nextNodeId: mensaje_finde
    elseNextNodeId: mensaje_fuera_horario

  atender:
    kind: MESSAGE
    text: "¡Hola! ¿En qué te ayudo?"
    nextNodeId: menu_principal

  mensaje_fuera_horario:
    kind: MESSAGE
    text: "Estamos atendiendo de 9 a 18hs. Te respondemos mañana."

  mensaje_finde:
    kind: MESSAGE
    text: "Los findes solo atendemos urgencias. Si es urgente, escribí URGENTE."
```

## Importante: timezone

El `kind: time` y `kind: weekday` usan **hora local del servidor**, no
la del contacto.

Esto significa:

- Si tu server está en UTC y tu contacto en Argentina (UTC-3), un
  CONDITION de "entre 9 y 18" matchea de **12 a 21 hora Argentina**.
- Tenelo presente al configurar horarios.

Si necesitás respetar la timezone del contacto, hoy hay que hacerlo con
HTTP a un servicio externo. Está en roadmap soportar timezone configurable.

## Buenas prácticas

### Always provide an else

Si las branches no cubren todos los casos posibles y no hay
`elseNextNodeId`, **el flow se rompe** y la conversación queda colgada.
Siempre proveé un default.

### Orden importa

Pongo las branches **más específicas primero**, las más genéricas
después.

```yaml
branches:
  - when: {kind: var, var: pais, op: eq, value: "AR"}
    nextNodeId: arg_specific
  - when: {kind: var, var: pais, op: matches, value: "(AR|UY|PY|BO|CL)"}
    nextNodeId: latam_specific
elseNextNodeId: rest_of_world
```

Si pones LATAM primero, AR nunca matchea su rama específica.

### Documentá lógica compleja

Si tu CONDITION es complejo (muchas branches, regex complicadas), poné
comentarios en el editor (sí, los nodos tienen un campo `note`
opcional) explicando el porqué.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| El bot se queda colgado | Ninguna branch matcheó y no hay elseNextNodeId | Agregar elseNextNodeId |
| La branch que esperaba no matchea | Tipo mismatch (variable es number, comparás con string sin coercer) | Declarar variable con tipo correcto, o usar regex |
| Comparación de horarios cruzando medianoche | `between: [22:00, 06:00]` no se evalúa como esperás | Dividir en 2 branches |
| Regex no matchea aunque parece correcta | Escaping (en YAML hay que escapar `\` como `\\`) | Reescribir en el editor visual, no en raw YAML |

## Próximos pasos

- 🛡️ [SET_VAR](./set-var) — para derivar variables antes de CONDITION
- 🌐 [HTTP](./http) — para obtener datos remotos que después usás en
  condiciones
- 📍 [MENU](./menu) — alternativa para ramificar según elección del
  contacto
