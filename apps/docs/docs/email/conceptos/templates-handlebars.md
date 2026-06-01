---
title: Templates con Handlebars
sidebar_position: 6
---

# Templates con Handlebars

Un **template** es el diseño HTML de tu email, **reutilizable** y con
**variables** que se reemplazan con datos del contacto al momento del
envío.

Massivo usa **Handlebars**, un motor de templates muy difundido y simple
de aprender.

## Estructura básica

Un template tiene:

- **Nombre interno** (ej. "Bienvenida Junio"): cómo lo identificás vos
- **Subject** (asunto): el "subject" del mail, también puede tener
  variables
- **HTML del body**: el contenido que verá el destinatario
- **Diseño JSON** (interno): la representación del editor drag&drop
- (Opcional) **Cuenta SMTP asignada por default**: si querés que las
  campañas nuevas con este template tomen una cuenta automáticamente

## Variables: `{{nombre}}`

La sintaxis básica de Handlebars es **doble llaves**:

```html
<p>Hola {{nombre}},</p>
<p>Gracias por sumarte a {{empresa}}.</p>
```

Cuando enviás a un contacto con `data: { nombre: "Juan", empresa: "ACME" }`,
el render final es:

```html
<p>Hola Juan,</p>
<p>Gracias por sumarte a ACME.</p>
```

### ¿De dónde salen las variables?

De **3 lugares** del contacto, en este orden de prioridad:

1. **Campos del contacto unificado**: `name`, `email`, `firstName`,
   `lastName`, `dni`, `cuit`, `externalId`
2. **`data` JSON libre del contacto**: cualquier key que hayas mandado en
   el CSV o por API. Ejemplos: `nombre`, `empresa`, `producto`, `monto`,
   `linkUnico`, etc.
3. **Variables del sistema** (ver más abajo)

### Si una variable no existe

Por defecto Handlebars **renderiza vacío** (string `""`). Esto puede dar
mails feos tipo "Hola ,". Mitigaciones:

- **Validá tu CSV antes de importar**: el panel te avisa si te faltan
  columnas o hay filas inválidas
- **Usá `default` (helper de Handlebars)**: `Hola {{nombre default="amigo"}}`
- **Condicionales** (ver abajo): no renderizar la sección si la variable
  está vacía

## Condicionales: `{{#if}} ... {{/if}}`

Para mostrar contenido solo si una variable existe (o es truthy):

```html
{{#if empresa}}
  <p>Tu empresa: {{empresa}}</p>
{{/if}}
```

Si querés un fallback:

```html
{{#if empresa}}
  <p>Tu empresa: {{empresa}}</p>
{{else}}
  <p>Todavía no nos contaste de qué empresa sos.</p>
{{/if}}
```

## Loops: `{{#each}} ... {{/each}}`

Si el `data` del contacto incluye un array, podés iterarlo:

Contact:
```json
{
  "nombre": "Juan",
  "productos": ["Laptop", "Mouse", "Teclado"]
}
```

Template:
```html
<p>Hola {{nombre}}, te enviamos:</p>
<ul>
{{#each productos}}
  <li>{{this}}</li>
{{/each}}
</ul>
```

Render:
```html
<p>Hola Juan, te enviamos:</p>
<ul>
  <li>Laptop</li>
  <li>Mouse</li>
  <li>Teclado</li>
</ul>
```

## Variables del sistema disponibles

Además de los datos del contacto, podés usar:

| Variable | Qué inyecta |
|---|---|
| `{{unsubscribeUrl}}` | El link único de "Cancelar suscripción" del destinatario. **Lo agregamos automáticamente en el footer del mail si no lo ponés vos**. |
| `{{senderLabel}}` | El nombre comercial de tu organización (auto-rellena el footer). |
| `{{currentYear}}` | El año actual (útil para copyright). |

Si querés ocultar el footer automático de Massivo, simplemente **incluí vos
estas variables en tu HTML** — detectamos que ya estás manejando
unsubscribe y no agregamos nada extra.

## El editor drag & drop

En el panel, **Email → Templates → Nuevo template** te abre un editor
visual con bloques pre-armados:

| Bloque | Para qué |
|---|---|
| **Text** | Párrafos de texto con formato (negrita, links, etc.) |
| **Heading** | Títulos H1/H2/H3 |
| **Image** | Imágenes (URL externa o subida) |
| **Button** | Botones con CTA, color customizable |
| **Divider** | Línea separadora |
| **Spacer** | Espacio vertical configurable |
| **HTML** | Bloque de HTML libre (para casos complejos) |
| **Columns** | Layout en 2 o 3 columnas |

El editor genera el HTML por debajo. Si querés tocarlo a mano, podés
abrir la "vista HTML" en cualquier momento.

## Preview con sample data

Antes de mandar, podés ver cómo queda el render real con datos de prueba.

1. En el editor, click **"Preview"**
2. Pegá un JSON con los datos esperados:

```json
{
  "nombre": "Juan Pérez",
  "empresa": "ACME",
  "productos": ["Laptop", "Mouse"]
}
```

3. Ves el render exacto que recibirían tus destinatarios

## Test send

Te lo mandás a vos mismo antes de mandar a la audiencia real:

1. En el editor (o en el listado), click **"Test send"**
2. Pegás tu mail (debe estar **verificado en SES** si todavía estás en
   sandbox)
3. (Opcional) Pegás el sample data JSON
4. Te llega el mail a tu inbox, igual que como le va a llegar a tus
   destinatarios

:::tip Test send es tu mejor amigo
**Siempre** hacelo antes de mandar masivo. Te ahorra:
- Ver en Gmail mal renderizado lo que en el editor se veía bien
- Detectar que el subject quedó mal formateado
- Confirmar que las variables se reemplazan como esperabas
:::

## Limitaciones a tener en cuenta

- **HTML compatible con clientes de email**: NO es HTML web normal. Olvidate
  de Flexbox, Grid CSS, animaciones, JS, etc. Tenés que usar `<table>` para
  layouts complejos. El editor drag&drop te abstrae de esto.
- **CSS inline**: los clientes de email modernos soportan `<style>` en
  `<head>`, pero los viejos (Outlook 2007-2013, Yahoo) no. Si querés
  máxima compatibilidad, el editor te genera CSS inline.
- **Imágenes pesadas**: comprimí tus imágenes antes de subirlas. Mails de
  >100KB caen en spam más seguido.

## Próximos pasos

- 🛠 [Cómo crear un template paso a paso](../crear-template)
- 📨 [Crear una campaña que use tu template](../crear-campana)
