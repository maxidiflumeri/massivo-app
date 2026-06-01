---
title: Cómo crear un template de WhatsApp
sidebar_position: 7
---

# Cómo crear un template de WhatsApp

Ver [Templates aprobados](./conceptos/templates-aprobados) si no sabés
qué es un template ni por qué necesita aprobación de Meta. Esta página
es **práctica**: paso a paso de cómo crearlo y enviarlo a aprobar.

## Crear el template

1. **WhatsApp → Templates**
2. Click **"Nuevo template"**
3. Llenás los metadatos:

| Campo | Qué poner |
|---|---|
| **Nombre interno** | Identificador único, ej. `orden_confirmada` o `bienvenida_b2b` |
| **Idioma** | Código ISO: `es` (español), `en` (inglés), `pt_BR` (portugués Brasil), etc. |
| **Categoría** | UTILITY / AUTHENTICATION / MARKETING |
| **WapiConfig** | A qué número/WABA va asociado |

### Tips para el nombre interno

- **Solo lowercase + underscore**: Meta no acepta espacios ni mayúsculas
- **Descriptivo**: cualquier persona del equipo debería entender qué hace
- **Incluí idioma en el nombre si tenés versiones**: `bienvenida_es` y
  `bienvenida_en`

### Cómo elegir categoría

| Si tu template | Categoría |
|---|---|
| Es una notificación transaccional ("tu pedido fue despachado") | UTILITY |
| Es un código de verificación ("tu OTP es 123456") | AUTHENTICATION |
| Promociona algo ("descuento del 20% este finde") | MARKETING |
| Es un recordatorio amigable ("tu turno es mañana") | UTILITY |
| Es una bienvenida sin promo ("gracias por sumarte") | UTILITY |
| Es una bienvenida con descuento ("gracias por sumarte, te damos 20%") | MARKETING (porque hay incentivo comercial) |

:::caution No clasifiques mal la categoría
Meta detecta cuando un template marketing está clasificado como
utility (para evitar pagar el precio mayor). Las consecuencias:
- Bajan tu quality score
- Te pueden recategorizar de oficio y empezar a cobrarte la diferencia
- En extremos, te disable la cuenta
:::

## Armar los componentes

Un template tiene 4 componentes opcionales-ish:

### Header (opcional)

Lo primero que se ve. Elegís tipo:

- **None**: sin header
- **Text**: hasta 60 chars
- **Image**: URL pública
- **Document**: URL pública a un PDF
- **Video**: URL pública

Para producción **NO uses Image / Document con URL que vos servís
dinámicamente** — Meta cachea, y si tu URL se cae todos los envíos
fallan. Mejor:

- Imágenes estáticas en CDN
- Servir desde S3 + CloudFront

### Body (obligatorio)

El cuerpo del mensaje. Acepta variables nombradas:

```
Hola {{nombre}}, tu pedido #{{pedido}} ya fue despachado.
Llega en {{dias}} días hábiles.

Cualquier consulta, respondé este mensaje.
```

#### Variables

Massivo te permite escribir variables **nombradas** (`{{nombre}}`,
`{{pedido}}`). Cuando enviamos a Meta para aprobar, las **convertimos
a numeradas** (`{{1}}`, `{{2}}`). El mapping queda guardado.

Al enviar la campaña vos pasás:

```json
{ "nombre": "Juan", "pedido": "12345", "dias": "3" }
```

Massivo lo traduce automáticamente a `{1: "Juan", 2: "12345", 3: "3"}`
para Meta.

#### Tips para el body

- **Máximo 1024 caracteres**
- **Sé claro**: el destinatario te lee en una notificación push, no en
  una página de detalle
- **Pocas variables**: 1-3 está bien. 5+ es señal de que el template
  hace demasiado
- **Sin emojis abusivos**: 1-2 al principio, está bien. Tono publicitario
  con 10 emojis = rechazo casi seguro
- **Llamado a acción claro**: si querés que el contacto responda, decilo
  ("Respondé SI para confirmar", "Tocá el botón")

### Footer (opcional)

Texto chico al final. Hasta 60 chars.

Típicos:

```
ACME • Atención: lun-vie 9-18hs
```

```
Si no querés más mensajes, respondé BAJA.
```

### Buttons (opcional)

Hasta 3 botones por template. Tipos:

#### Quick Reply

Cuando el contacto le da click, te llega un mensaje con el texto del
botón. **Es la base de los bots con flujos guiados.**

```
[Button: Confirmar]
[Button: Cambiar]
[Button: Cancelar]
```

#### URL

Abre un link en el navegador del contacto.

```
[Button: Trackear envío] → URL: https://empresa.com/track/{{1}}
```

Las URLs **también pueden tener variables**. Cuando enviás, las
reemplazás como en el body.

#### Phone Number

Inicia una llamada al número.

```
[Button: 📞 Llamar a soporte] → +5491100
```

## Preview en vivo

Mientras armás el template, el panel te muestra una **preview** que
simula cómo se va a ver en el celular del destinatario. Esto te ayuda
a:

- Ver si el wording quedó natural
- Confirmar que los botones no se cortan
- Probar con sample data para asegurar que las variables se rinden bien

## Guardar como borrador

Click **"Guardar"** — el template queda **DRAFT** en Massivo, sin
mandar a Meta todavía.

Útil para:

- Iterar / revisar con el equipo antes de mandar a aprobar
- Tener varios borradores en paralelo y elegir el mejor

## Enviar a aprobar a Meta

Cuando estés conforme:

1. En el detalle del template, click **"Enviar a aprobar a Meta"**
2. Confirmás
3. Massivo llama a la API de Meta
4. Estado pasa a **PENDING_APPROVAL**

### Esperar

Meta tarda **1-24 hs** generalmente. Vas a recibir el resultado vía
webhook automáticamente — no hace falta refrescar nada.

### Si te aprueban ✅

El estado pasa a **APPROVED**. Ya podés usarlo en campañas o en bots.

### Si te rechazan ❌

El estado pasa a **REJECTED** y vas a ver el motivo en el detalle.
Los motivos comunes están en [Templates aprobados →
Motivos de rechazo](./conceptos/templates-aprobados#motivos-comunes-de-rechazo).

Para arreglar:

1. Edití el template (vuelve a DRAFT)
2. Corregí el problema (categoría, wording, variables)
3. Re-enviá a aprobar

## Sincronizar templates desde Meta

Si creaste templates **directamente en la consola de Meta** y querés
traerlos a Massivo:

1. **WhatsApp → Templates** → **"Sincronizar desde Meta"**
2. Massivo trae todos tus templates con sus estados actuales

Útil también cuando:

- Cambiaron de estado y querés re-confirmar (raro porque vienen por
  webhook)
- Recién configuraste un número nuevo en Massivo y querés traer todo
  el inventario existente

## Borrar un template

1. En el detalle del template, click **"Borrar"**
2. Confirmás

Massivo le pide a Meta que lo borre. Estado pasa a
**PENDING_DELETION** y luego **DELETED**.

:::warning No podés des-borrar
Una vez que Meta confirma el borrado, lo perdés. Si después lo querés
de vuelta, tenés que crearlo de cero y esperar aprobación.
:::

## Duplicar un template

Útil para crear variantes o para tener "backup" antes de editar:

1. En el detalle, click **"Duplicar"**
2. Te crea uno nuevo en estado DRAFT con el contenido idéntico
3. Cambiale el nombre y editalo a gusto

## Idiomas múltiples

Si tu audiencia es multilingual, hacés **un template por idioma**:

```
bienvenida_b2b_es
bienvenida_b2b_en
bienvenida_b2b_pt_BR
```

Cuando enviás una campaña, **elegís el template específico** del idioma
que querés mandar. No hay fallback automático entre idiomas — vos
elegís.

## Errores comunes

| Error | Causa | Solución |
|---|---|---|
| "Template already exists" | Ya tenés uno con el mismo nombre + idioma | Cambiale el nombre o usá el existente |
| "Variable format invalid" | Variables mal escritas | Asegurate que usás `{{x}}` con doble llave, sin espacios adentro |
| "Components count mismatch" | Componentes mal armados | Reabri el editor, revisá |
| Pasaron 48hs y sigue PENDING_APPROVAL | Meta tarda más de lo normal | Esperá hasta 7 días; si pasa eso, contactá a Meta |

## Próximos pasos

- 📨 [Crear una campaña usando este template](./crear-campana)
- 🤖 [Usar el template en un bot guiado](../bots/crear-primer-bot) con
  botones de Quick Reply
