---
title: CAPTURE
sidebar_position: 4
---

# Nodo CAPTURE

**Hace una pregunta al contacto y captura su respuesta libre en una
variable**. A diferencia de MENU (que tiene opciones cerradas), CAPTURE
acepta cualquier texto que el contacto escriba — opcionalmente
validándolo contra un patrón.

## Cuándo usarlo

- Pedir datos personales: nombre, email, edad, dirección
- Pedir un número: cantidad, monto, ID de pedido
- Pedir descripción libre: "¿cuál es tu problema?"
- Cualquier caso donde necesitás texto del contacto, no una elección
  de menú

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `text` | string | ✅ | El prompt / pregunta al contacto |
| `saveAs` | string | ✅ | Nombre de variable donde guardar la respuesta. Pattern: `[a-zA-Z_][a-zA-Z0-9_]*` |
| `validate` | object | — | Regla de validación (ver abajo) |
| `nextNodeId` | string | — | Nodo siguiente si valida OK |
| `retryNodeId` | string | — | Nodo siguiente si valida FAIL (típicamente vuelve al CAPTURE) |
| `gotoTopic` | string | — | Alternativa al `nextNodeId` |

## Sin validación

El caso más simple — aceptás cualquier texto:

```yaml
kind: CAPTURE
text: "¿Cómo te llamás?"
saveAs: nombre
nextNodeId: siguiente_paso
```

Lo que el contacto responda queda en `{{nombre}}`.

## Con validación: regex personalizada

```yaml
kind: CAPTURE
text: "¿Cuál es tu CUIT? (formato 20-12345678-9)"
saveAs: cuit
validate:
  kind: regex
  pattern: "^\\d{2}-\\d{8}-\\d$"
nextNodeId: capture_ok
retryNodeId: capture_fail
```

Si matchea la regex → va a `capture_ok` con `{{cuit}}` seteado. Si no
matchea → va a `retryNodeId` (típicamente otro nodo que dice "formato
inválido, intentá de nuevo").

## Con validación: presets

Para casos comunes, usá presets ya armados:

| Preset | Valida |
|---|---|
| `email` | Email válido (con @ y dominio) |
| `phone` | Teléfono en formato E.164 o local con código de país |
| `number` | Número entero o decimal |
| `any` | Cualquier texto no vacío (equivalente a sin validate) |

Ejemplo:

```yaml
kind: CAPTURE
text: "¿Cuál es tu email?"
saveAs: email
validate:
  kind: preset
  preset: email
nextNodeId: email_ok
retryNodeId: email_fail
```

## Patrón típico: loop de retry

Para que el bot insista hasta que el contacto responda bien:

```yaml
nodes:
  pedir_email:
    kind: CAPTURE
    text: "Tu email para mandarte la cotización:"
    saveAs: email
    validate:
      kind: preset
      preset: email
    nextNodeId: continuar
    retryNodeId: email_invalido

  email_invalido:
    kind: MESSAGE
    text: "Ese no parece un email válido. Intentemos de nuevo."
    nextNodeId: pedir_email  # vuelve al CAPTURE
```

El contacto reintenta hasta que el bot lo acepta.

## Patrón: handoff después de N intentos fallidos

Si el contacto no acierta el formato después de varias tentativas,
escalá a humano:

```yaml
nodes:
  pedir_dni:
    kind: CAPTURE
    text: "Tu DNI (sin puntos, 7 u 8 dígitos):"
    saveAs: dni
    validate:
      kind: regex
      pattern: "^\\d{7,8}$"
    nextNodeId: continuar
    retryNodeId: incrementar_intentos

  incrementar_intentos:
    kind: SET_VAR
    varName: intentosDni
    value: "{{= (intentosDni || 0) + 1 }}"
    nextNodeId: chequear_intentos

  chequear_intentos:
    kind: CONDITION
    branches:
      - when: {kind: var, var: intentosDni, op: eq, value: "3"}
        nextNodeId: handoff_dni
    elseNextNodeId: pedir_dni  # volver a pedir

  handoff_dni:
    kind: HANDOFF
    text: "Parece que estás teniendo problemas con el formato del DNI. Te paso con un agente."
```

## Cómo el bot recibe la respuesta

Cuando un CAPTURE está activo:

1. Bot envía el `text` al contacto
2. **Pausa** y espera el próximo inbound del contacto
3. Cuando llega el inbound:
   - Si NO hay `validate` → guarda lo recibido en `saveAs` → va a `nextNodeId`
   - Si hay `validate`:
     - **Valida** la respuesta
     - Si OK → guarda + va a `nextNodeId`
     - Si FAIL → va a `retryNodeId` **sin guardar** la variable

## Coerción de tipos

Si declaraste la variable en **Variables declarativas** con tipo
distinto a string, Massivo coerciona:

| Tipo declarado | Coerción |
|---|---|
| `string` | Se guarda tal cual el texto |
| `number` | Se intenta `Number(input)`. Si falla, va a `retryNodeId`. |
| `boolean` | `"sí"`, `"si"`, `"yes"`, `"1"`, `"true"` → `true`. Resto → `false`. |

Útil cuando el siguiente paso espera tipo específico (un CONDITION
que compara contra un número, por ejemplo).

## Variables especiales que captura

CAPTURE solo captura el **texto del mensaje**. Si el contacto manda
una imagen, audio, doc, etc. en lugar de texto, **el CAPTURE no la
guarda** y va al `retryNodeId` (o se queda esperando si no hay retry,
hasta TTL).

Para capturar media específica, considera usar un MENU previo que diga
"mandame una foto" y un nodo posterior que detecte si el inbound tiene
attachment.

## Buenas prácticas

### Sé claro en el prompt

```
✅ "Tu email para enviarte la cotización (ej. juan@empresa.com):"
✅ "¿Cuál es tu DNI? (sin puntos, ej. 12345678)"

❌ "Email"
❌ "Mandame tu DNI"
```

### Validación con mensajes claros en retry

```
retryNodeId apunta a:

[MESSAGE: "Ese no parece un DNI válido. Tiene que tener 7 u 8 dígitos sin puntos, ej. 12345678. Intentemos de nuevo:"]
   ↓
[CAPTURE original de nuevo]
```

### Considerá el flujo "salir" durante un CAPTURE

¿Qué pasa si el contacto se cansa y dice "olvidate"? El CAPTURE lo
toma como input válido (si no hay validate) y avanza con valor raro.

**Solución**: usá `validate` con `preset` que rechace "cancelar",
"olvidate", "salir", etc. y mandalas a un nodo de salida:

```yaml
validate:
  kind: regex
  pattern: "^(?!(?i)(cancelar|salir|olvidate|nada)).+$"
```

(Acepta cualquier cosa **excepto** esas keywords).

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| El bot acepta cualquier respuesta como válida | No configuraste `validate` | Agregá un preset o regex |
| El loop se queda infinito en retry | El `retryNodeId` apunta al mismo CAPTURE sin avisar al contacto que está mal | Agregá un MESSAGE explicativo en el medio |
| `{{capturado}}` aparece como `undefined` | El CAPTURE no corrió todavía o falló | Confirmá que el flow llegue al CAPTURE antes del uso de la variable |
| El contacto mandó "5" pero CONDITION compara como string vs number | Coerción no aplicada | Declarar la variable como `number` en Variables declarativas |

## Próximos pasos

- 🌳 [CONDITION](./condition) — para ramificar según la variable
  capturada
- 🛡️ [SET_VAR](./set-var) — para procesar / transformar variables
- 🌐 [HTTP](./http) — para usar la variable capturada en una API call
