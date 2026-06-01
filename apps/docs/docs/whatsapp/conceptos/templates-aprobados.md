---
title: Templates aprobados por Meta
sidebar_position: 3
---

# Templates aprobados por Meta

Los **templates** son mensajes con estructura fija que vos sometés a
Meta para que los revise y apruebe. Una vez aprobados, los podés usar
para **enviar masivamente** o para **iniciar conversaciones**
(fuera del 24h window).

Sin templates aprobados, no podés mandar mensajes outbound. Es la
regla de oro de la API de Meta para evitar spam.

## ¿Por qué Meta exige que sean aprobados?

Para combatir spam y abuso. Sin esto, cualquier empresa podría usar la
API para mandar promos no solicitadas. La aprobación de Meta es una
**revisión humana + automática** que evalúa:

- ¿El template tiene **value para el destinatario**?
- ¿Es **legítimo** (no engañoso, no scam)?
- ¿Cumple las **políticas de WhatsApp**?

## Categorías de templates

Meta clasifica los templates en **3 categorías**, cada una con tarifas
distintas (ver pricing más abajo):

| Categoría | Para qué | Ejemplo |
|---|---|---|
| **UTILITY** | Mensajes funcionales/transaccionales | "Tu pedido #1234 fue despachado" |
| **AUTHENTICATION** | Códigos de verificación, OTPs | "Tu código de seguridad es 123456" |
| **MARKETING** | Promociones, newsletters | "20% off este finde en toda la tienda" |

Marketing es **el más caro**. Utility y Authentication son significativamente
más baratos. Cuando creás un template, **elegís la categoría correcta** —
si abusás (creás un marketing y lo clasificás como utility), Meta lo
detecta y te baja la categoría o te bloquea.

## Estructura de un template

Un template tiene 3 componentes opcionales:

### Header (opcional)

Lo primero que ve el destinatario. Puede ser:

- **Texto** (max 60 chars), eg. "Confirmación de pedido"
- **Imagen** (URL pública)
- **Documento** (PDF)
- **Video**
- **Location**

### Body (obligatorio)

El cuerpo principal del mensaje. Acepta variables tipo `{{1}}`, `{{2}}`,
`{{3}}` — Meta usa numeradas, no nombradas. Massivo te abstrae de
esto: en el editor podés nombrarlas (`{{nombre}}`, `{{empresa}}`) y al
sincronizar las mapeamos a `{{1}}`, `{{2}}` automáticamente.

Ejemplo:

```
Hola {{nombre}},

Tu pedido #{{pedido}} ya fue despachado. Llega en
{{dias}} días hábiles.

Saludos,
{{empresa}}
```

### Footer (opcional)

Texto chico al final, hasta 60 chars. Útil para disclaimers o branding.

### Buttons (opcional)

Botones de acción:

- **Quick Reply**: cuando el contacto le da click, te llega un mensaje
  con el texto del botón. Útil para flows guiados (ver Bots).
- **URL**: abre un link en el navegador del contacto
- **Phone Number**: inicia una llamada al número

Máximo 3 botones por template (con algunas limitaciones combinadas).

### Ejemplo completo

```
[Header: 📦 Tu pedido]
Hola {{nombre}}, tu pedido #{{pedido}} fue despachado.
Llega en {{dias}} días.
[Footer: ACME • Atención 24/7]
[Button 1: 🚚 Trackear envío] (URL)
[Button 2: 💬 Contactar soporte] (Quick Reply)
```

## El proceso de aprobación

### Crear el template en Massivo

1. **WhatsApp → Templates** → **Nuevo template**
2. Llenás: nombre, categoría, idioma, componentes
3. Click **Guardar como borrador**

Massivo lo guarda localmente con estado `DRAFT`. **Todavía no fue
enviado a Meta**.

### Enviar a aprobar

1. En el detalle del template, click **"Enviar a aprobar a Meta"**
2. Massivo llama a la API de Meta con los componentes formateados
3. Meta lo registra en su sistema y le asigna estado `PENDING`
4. En Massivo el template pasa a estado `PENDING_APPROVAL`

### Esperar la respuesta de Meta

Meta revisa generalmente en **1-24 horas**. A veces más si están con
muchos casos.

Resultados posibles:

| Estado Meta | Estado Massivo | Significa |
|---|---|---|
| `APPROVED` | `APPROVED` | Listo para usar en campañas |
| `REJECTED` | `REJECTED` | Meta lo rechazó. Te muestran motivo en el detalle |
| `PAUSED` | `PAUSED` | Meta lo pausó por alta tasa de bloqueos / quejas |
| `DISABLED` | `DISABLED` | Meta lo deshabilitó. Razón: violación políticas. |
| `PENDING_DELETION` | `PENDING_DELETION` | Pediste borrarlo, esperando confirmación |

Massivo recibe webhooks de Meta y **actualiza el estado automáticamente**.

### Motivos comunes de rechazo

| Motivo Meta | Qué significa | Cómo arreglar |
|---|---|---|
| `INVALID_FORMAT` | El template no cumple formato (ej. variable mal puesta) | Corregí, re-enviá |
| `TAG_CONTENT_MISMATCH` | Marcaste como UTILITY pero el contenido es marketing | Cambiá categoría a MARKETING |
| `INCORRECT_CATEGORY` | Idem anterior, distinto wording | Cambiá categoría |
| `INVALID_LANGUAGE` | Idioma no soportado o mal pegado | Usá código ISO (es, en, pt) |
| `PROMOTIONAL_CONTENT_IN_UTILITY` | Mezclaste promoción en un template "utility" | Sacá la promo o cambiá categoría |
| `MISSING_OPT_IN` | El template no tiene mecánica para opt-out | Agregar disclaimer o footer con opt-out info |
| `UNSPECIFIED_LANGUAGE` | Faltó indicar idioma | Setealo |

Si te rechazan, leés el motivo, ajustás y **enviás a aprobar de nuevo**.

### Idiomas

Cada template está atado a **un idioma específico**. Si querés mandar
en español e inglés, tenés que **crear 2 templates** (mismo content
traducido) y ambos pasan revisión por separado.

Massivo te muestra los templates agrupados por nombre, mostrando todos
los idiomas disponibles para ese nombre.

## Variables y mapping

### Variables numeradas (lo que Meta entiende)

```
Hola {{1}}, tu pedido #{{2}} fue despachado.
```

### Variables nombradas (lo que vos manejás en Massivo)

En el editor de Massivo escribís:

```
Hola {{nombre}}, tu pedido #{{pedido}} fue despachado.
```

Cuando sincronizamos con Meta, **mapeamos**:

- `{{nombre}}` → `{{1}}`
- `{{pedido}}` → `{{2}}`

El mapping se guarda en el template. Cuando enviás una campaña, vos
pasás `{nombre: "Juan", pedido: "1234"}` y Massivo lo traduce a Meta.

## Sync automático con Meta

En **WhatsApp → Templates** vas a ver un botón **"Sincronizar desde
Meta"**. Lo usás cuando:

- Creaste templates **directamente en Meta** y querés traerlos a Massivo
- Querés re-confirmar el estado actual

Massivo llama a la API de Meta, trae todos los templates de tu WABA, y
los sincroniza con la DB local.

## Performance y best practices

### Mantener calidad alta

Meta trackea el **quality score** de tus templates:

- Si muchos contactos los bloquean o no responden → el score baja
- Si te quedás muy bajo, Meta los **pausa o disable**

Para mantener calidad alta:

- **Manda solo a contactos que opt-in** (no compres bases)
- **Respetá los opt-outs**
- **No mandes el mismo template 5 veces al mismo contacto**
- **Mensajes con value real, no spam**

### Rotación de templates

Para campañas grandes recurrentes, **rotá entre varios templates con
contenido similar pero distinto wording**. Esto:

- Diversifica el riesgo (si uno cae a PAUSED, los otros siguen)
- Reduce la fatiga del contacto

### Naming convention

Usá nombres descriptivos:

```
✅ orden_confirmada_es
✅ bienvenida_b2b_es
✅ promo_finde_es

❌ template1
❌ test_template
```

## Limitaciones

- **No podés editar un template aprobado**. Si querés cambiar el wording,
  tenés que crear uno nuevo y borrar el viejo.
- **No podés cambiar la categoría** de uno aprobado. Mismo
  workaround: nuevo template.
- **Máx ~250 templates por WABA**.

## Próximos pasos

- ⏰ [El 24h window](./24h-window): cuándo podés mandar sin template
- 🛠 [Crear un template en Massivo](../crear-template)
- 📨 [Crear una campaña de WhatsApp](../crear-campana)
