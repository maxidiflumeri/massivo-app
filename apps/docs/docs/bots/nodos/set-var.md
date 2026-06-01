---
title: SET_VAR
sidebar_position: 7
---

# Nodo SET_VAR

**Asigna un valor a una variable de la sesión** y avanza. No envía
nada al contacto — es un nodo **interno** para procesar / transformar
estado.

## Cuándo usarlo

- Setear un flag: `paso_completado = true`
- Inicializar contador: `intentos = 0`
- Derivar una variable a partir de otras: `nombreCompleto = "{{firstName}} {{lastName}}"`
- Coercer un tipo: convertir string a number
- Incrementar / decrementar: `intentos = {{= intentos + 1 }}`
- Marcar branch dentro del flow para usar después en CONDITION

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `varName` | string | ✅ | Nombre de la variable. Pattern: `[a-zA-Z_][a-zA-Z0-9_]*` |
| `value` | string \| number \| boolean | ✅ | El valor a asignar. Si es string, soporta interpolación. |
| `nextNodeId` | string | — | Siguiente nodo |
| `gotoTopic` | string | — | Alternativa al nextNodeId |

## Valores estáticos

Lo más simple — asignar un valor fijo:

```yaml
kind: SET_VAR
varName: idioma
value: "es"
nextNodeId: continuar
```

```yaml
kind: SET_VAR
varName: limiteIntentos
value: 3
nextNodeId: continuar
```

```yaml
kind: SET_VAR
varName: esVIP
value: true
nextNodeId: continuar
```

## Valores con interpolación

Si el valor es un string con `{{x}}`, se sustituyen las variables al
evaluar:

```yaml
kind: SET_VAR
varName: saludo
value: "Hola {{firstName}}!"
nextNodeId: continuar
```

Si `firstName == "Juan"`, queda `saludo = "Hola Juan!"`.

## Valores con expresiones JSONata

Para lógica más compleja, usá `{{= expr }}`:

### Aritmética

```yaml
varName: intentos
value: "{{= (intentos || 0) + 1 }}"
```

Incrementa un contador.

### Condicionales

```yaml
varName: categoria
value: "{{= edad >= 18 ? 'adulto' : 'menor' }}"
```

### Agregaciones

```yaml
varName: precioTotal
value: "{{= $sum(items.precio) }}"
```

### Manipulación de strings

```yaml
varName: emailLowercase
value: "{{= $lowercase(email) }}"
```

### Concatenación

```yaml
varName: nombreCompleto
value: "{{= firstName & ' ' & lastName }}"
```

## Coerción de tipos

Si la variable **está declarada** en Variables declarativas con un
tipo específico, SET_VAR coerciona el valor al tipo:

| Tipo declarado | Si pasás | Resultado |
|---|---|---|
| `string` | `"hola"` o `123` o `true` | `"hola"` / `"123"` / `"true"` |
| `number` | `"42"` o `42` | `42` |
| `number` | `"abc"` | Error, se usa default si está |
| `boolean` | `"true"` / `1` / `"sí"` | `true` |
| `boolean` | `"false"` / `0` / `""` | `false` |

Si la variable **no está declarada**, se guarda como string.

## Ejemplo: contador de intentos con escalamiento

```yaml
nodes:
  pedir_pin:
    kind: CAPTURE
    text: "Tu PIN de seguridad:"
    saveAs: pinIngresado
    nextNodeId: validar_pin

  validar_pin:
    kind: CONDITION
    branches:
      - when: {kind: var, var: pinIngresado, op: eq, value: "{{pinReal}}"}
        nextNodeId: ok
    elseNextNodeId: pin_invalido

  pin_invalido:
    kind: SET_VAR
    varName: intentosPin
    value: "{{= (intentosPin || 0) + 1 }}"
    nextNodeId: check_intentos

  check_intentos:
    kind: CONDITION
    branches:
      - when: {kind: var, var: intentosPin, op: eq, value: "3"}
        nextNodeId: bloqueado
    elseNextNodeId: pedir_pin

  bloqueado:
    kind: HANDOFF
    text: "Has alcanzado el máximo de intentos. Te pasamos con seguridad."

  ok:
    kind: MESSAGE
    text: "PIN correcto. Continuamos..."
```

## Ejemplo: derivar nombre completo

```yaml
nodes:
  pedir_firstName:
    kind: CAPTURE
    text: "¿Cómo te llamás?"
    saveAs: firstName
    nextNodeId: pedir_lastName

  pedir_lastName:
    kind: CAPTURE
    text: "¿Y tu apellido?"
    saveAs: lastName
    nextNodeId: derivar_nombre_completo

  derivar_nombre_completo:
    kind: SET_VAR
    varName: nombreCompleto
    value: "{{firstName}} {{lastName}}"
    nextNodeId: confirmar

  confirmar:
    kind: MESSAGE
    text: "Gracias {{nombreCompleto}}. ¿Es correcto tu nombre?"
```

## Ejemplo: setear un flag para CONDITION posterior

```yaml
nodes:
  pregunta_si_es_cliente:
    kind: MENU
    text: "¿Ya sos cliente nuestro?"
    options:
      - label: "Sí"
        nextNodeId: setear_cliente
      - label: "No"
        nextNodeId: setear_lead

  setear_cliente:
    kind: SET_VAR
    varName: esCliente
    value: true
    nextNodeId: pedir_dni

  setear_lead:
    kind: SET_VAR
    varName: esCliente
    value: false
    nextNodeId: pedir_dni

  pedir_dni:
    kind: CAPTURE
    text: "Tu DNI:"
    saveAs: dni
    nextNodeId: routing

  routing:
    kind: CONDITION
    branches:
      - when: {kind: var, var: esCliente, op: eq, value: "true"}
        nextNodeId: flow_cliente_existente
    elseNextNodeId: flow_lead_nuevo
```

## Variables del sistema vs custom

SET_VAR solo modifica **variables que vos declarás** o creás. Las
**variables del sistema** (`contact.phone`, `contact.firstName`,
`session.startedAt`, etc.) son **read-only** — SET_VAR no las modifica.

## Limitaciones

- **No es atómico cross-nodo**: si dos nodos paralelos modificaran la
  misma variable, gana el último. Pero como el flow es secuencial,
  esto raramente pasa.
- **No persiste cross-session**: las variables viven dentro de la
  sesión. Cuando expira, se pierden. Para persistir, usá HTTP a tu
  backend.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `{{intentos}}` aparece como `NaN` después de SET_VAR | Coerción mal — intentaste sumar string vacío | Inicializá con default y usá `(intentos || 0)` |
| La variable cambia pero CONDITION posterior no la ve | El CONDITION corrió con el valor viejo | Asegurate del orden de los nodos (SET_VAR antes que CONDITION) |
| `JSONata expr` da error | Sintaxis incorrecta | Probar la expresión en https://try.jsonata.org/ |
| Variable boolean queda como string `"true"` | No declaraste el tipo | Declarar como boolean en Variables declarativas |

## Próximos pasos

- 🌳 [CONDITION](./condition) — para ramificar según variables seteadas
- ⌨️ [CAPTURE](./capture) — la fuente principal de variables del flow
- 🌐 [HTTP](./http) — si el valor viene de una API externa
