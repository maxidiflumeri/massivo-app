---
title: Cómo crear una campaña de WhatsApp
sidebar_position: 8
---

# Cómo crear y enviar una campaña de WhatsApp

Una campaña de WhatsApp junta un **template aprobado** + una **config de
WhatsApp (número Meta)** + una **lista de contactos** = un envío masivo
fuera del 24h window.

A diferencia de email, en WhatsApp:

- **Siempre necesitás un template aprobado** (es la regla de Meta)
- **No hay "preview con sample data" tan completo** como email — vas a
  testear con un mensaje real de prueba antes de mandar masivo
- **Cada mensaje cuesta** según la categoría del template

## Paso 1 — Crear la campaña

1. **WhatsApp → Campañas**
2. Click **"Nueva campaña"**
3. Llenás:
   - **Nombre**: ej. "Recordatorio promo finde"
4. Te abre el detalle en estado DRAFT
5. En la sección **Configuración**:
   - **Template**: elegí uno de tus templates **APPROVED**
   - **WapiConfig**: el número de WhatsApp desde el que sale
   - **Programada para** (opcional): fecha+hora futura
   - **Delay entre envíos** (opcional): si querés más conservador que
     el de la config base
6. Click **Guardar**

:::caution Solo templates APPROVED
Si tu template está en PENDING_APPROVAL, REJECTED, PAUSED o
DISABLED, el dropdown te lo muestra pero **no podés enviar** hasta
que sea APPROVED.
:::

## Paso 2 — Cargar contactos con sus variables

En la sección **Contactos** del detalle:

### Formato del CSV

A diferencia del CSV de email, acá las columnas reservadas son
distintas porque WhatsApp usa **teléfono**, no email:

| Columna CSV | Mapea a |
|---|---|
| `phone` | Teléfono en formato E.164 (**obligatoria**) |
| `firstName` o `first_name` | Nombre |
| `lastName` o `last_name` | Apellido |
| `name` | Nombre completo |
| `externalId` o `external_id` | Tu ID externo |

**Cualquier otra columna** va al `data` JSON y se usa como variable del
template.

### Formato del teléfono

Massivo acepta varios formatos y los normaliza a **E.164**:

```
+54 9 11 1234-5678         → +5491112345678  ✅
54 11 1234 5678            → +5491112345678  ✅
1112345678                 → ❌ (sin código de país)
(011) 1234-5678            → ❌ (con código de área local sin código país)
```

**Recomendación**: pasá todo el código de país y celular pegados, con
o sin `+`. Massivo se ocupa del resto.

### Ejemplo de CSV para un template de promo

Si tu template es:

```
Hola {{nombre}},

20% off en {{producto}} solo este finde.
Código: {{codigo}}
```

Tu CSV:

```csv
phone,nombre,producto,codigo
+5491112345678,Juan,Laptop,JUAN20
+5491122334455,María,Auriculares,MARI20
+5491133221100,Pedro,Mouse,PEDRO20
```

### Validación en vivo

El panel valida:

- Número en formato válido
- Variables del template todas presentes en las columnas

Si algún contacto tiene una variable faltante, queda como inválido y
no se manda.

## Paso 3 — Test con vos mismo

**Antes de mandar masivo**, hacé esto:

1. En la sección Contactos, agregás **tu propio número** como un
   contacto temporal (con valores de variables que querés ver)
2. Click **"Test send a 1 contacto"** y elegís tu propio número
3. Te llega el mensaje real en tu WhatsApp

**Confirmá**:

- ✅ El template se ve bien
- ✅ Las variables se reemplazaron correctamente
- ✅ Los botones funcionan (si los tiene)
- ✅ Las imágenes / docs cargan (si los tiene)
- ✅ El tono / wording es lo que esperabas

Si todo OK, **remové tu número de contactos** antes de mandar masivo
(o dejalo si querés recibir la versión para auditar).

## Paso 4 — Mandar masivo

1. Click **"Enviar"** (botón verde, arriba a la derecha)
2. Confirmás el modal — te muestra cuántos contactos válidos hay
3. La campaña pasa a **PROCESSING**

### Cómo se procesa por debajo

- Cada contacto se convierte en un **WapiReport** en estado PENDING
- Un worker procesa de a uno respetando el delay configurado
- Cada envío llama a la API de Meta
- Meta acepta → status SENT → vamos a ver DELIVERED → READ vía webhooks
- Meta rechaza (rate limit, opt-out, número inválido, etc.) → FAILED
  con el motivo

### Lo que pasa en tiempo real

En el detalle de la campaña vas a ver:

- **Contador por estado** PENDING / SENT / DELIVERED / READ / FAILED /
  CANCELED
- **Lista de reports** con cada destinatario
- **Log en vivo** con cada envío individual

## Paso 5 — Monitorear y entender los estados

Los estados que va recorriendo cada WapiReport:

```
PENDING (encolado) ──▶ SENT (Meta lo aceptó) ──▶ DELIVERED (llegó al celu)
                                                        ▼
                                                       READ (el contacto abrió el chat)
```

Si en algún punto falla:

```
PENDING ──▶ FAILED (con error de Meta)
```

Errores típicos de Meta:

| Error | Significa |
|---|---|
| `131008 Required parameter missing` | Faltaba una variable |
| `131009 Parameter format mismatch` | El formato de la variable no coincide con lo que aprobó Meta |
| `131026 Receiver is incapable of receiving this message` | El destinatario no puede recibir (sin WhatsApp, etc.) |
| `131047 Re-engagement window expired` | El contacto no te escribió en 24h y mandaste un mensaje libre (no template) |
| `131048 Spam rate limit` | Tu número está siendo limitado por mala calidad |
| `131056 Pair limit reached` | Máximo de mensajes entre vos y ese contacto en una ventana de tiempo |

Algunos errores son **temporales y reintentables** (`131056` por
ejemplo). Massivo los reintenta con backoff exponencial. Otros son
permanentes y quedan en FAILED.

## Pausar y reanudar

Mismo que email:

- Click **"Pausar"** → la campaña pasa a PAUSED
- Los reports en cola se delay-ean
- Click **"Reanudar"** → vuelve a PROCESSING

## Quota — corte parcial al pasarse del límite

Si tu plan tiene cuota mensual de WhatsApp y la campaña la excede:

- Se encolan los primeros N que entran en la cuota
- Los restantes quedan como **CANCELED** con razón
  `quota-exceeded:plan-FREE`
- Te avisamos con warning amarillo

(Esto es el plan límite de Massivo. Meta también tiene sus propios
límites por quality score, esos son otra cosa.)

## Daily limit per config

Cada WapiConfig tiene un **límite diario** (configurable). Si tu
campaña excede el daily limit:

- Los excedentes se delay-ean (no van a CANCELED)
- Se intentan al día siguiente

Útil para distribuir un envío masivo en varios días — pongas todos los
contactos en una sola campaña, el daily limit los espacia.

## Opt-out automático

Si un contacto te escribe **"BAJA"**, **"STOP"** o cualquiera de las
keywords configuradas (ver [opt-out compliance](./opt-out-compliance)),
Massivo:

1. Lo agrega a la lista de opt-out scope=`team`
2. Las campañas en curso lo skipean (estado CANCELED, razón `opted-out`)
3. Futuras campañas también lo skipean

Es automático e irreversible (técnicamente reversible pero hay que
hacerlo a mano por compliance).

## Reportes y métricas

Ver [Inbox y conversaciones](./inbox) y la sección de métricas de
WhatsApp (próximamente F4 reporte).

## Errores comunes en campañas

| Síntoma | Causa | Solución |
|---|---|---|
| "Template no APPROVED" | Estado del template no es APPROVED | Esperá aprobación o usá otro |
| Todos FAILED con "Parameter mismatch" | Variables del CSV no coinciden con el template | Revisá nombres de columnas |
| Mucho 131008 | Faltan variables obligatorias en algunos contactos | Llená esas columnas o sacá esos contactos |
| Mucho 131048 | Mala quality de tu número | Pausá, bajá volumen, mejorá calidad antes de reactivar |
| Mucho 131056 | Pair rate limit | Espaciá más los envíos (más delay) |

## Próximos pasos

- 💬 [Inbox de WhatsApp](./inbox) para responder cuando los contactos
  contesten tu campaña
- 🤖 [Crear un bot](../bots/crear-primer-bot) que responda
  automáticamente a las respuestas
- 🚫 [Opt-out y compliance](./opt-out-compliance)
