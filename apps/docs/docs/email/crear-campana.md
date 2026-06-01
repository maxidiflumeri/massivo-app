---
title: Cómo crear una campaña
sidebar_position: 10
---

# Cómo crear y enviar una campaña

Una campaña junta un **template** + una **cuenta SMTP** + una **lista de
contactos** + opcionalmente **scheduling** y **Reply-To override** = un
envío masivo.

## Paso 1 — Crear la campaña

1. Andá a **Email → Campañas**
2. Click **"Nueva campaña"**
3. Llenás:
   - **Nombre**: identificador, ej. "Newsletter Junio 2026" o
     "Black Friday 2026"
4. Te abre el **detalle de la campaña** en estado DRAFT
5. En la sección **Configuración** asignás:
   - **Template**: elegí de tus templates existentes (si no tenés
     ninguno, [creá uno](./crear-template) primero)
   - **Cuenta SMTP**: la que envía. Tiene que estar **Activa**.
   - **Programada para** (opcional): fecha+hora futura para
     auto-enviar. Si lo dejás vacío, mandás manualmente cuando estés
     listo.
   - **Reply-To** (opcional): pisa el de la cuenta SMTP para esta
     campaña específica. Dejar vacío usa el default.
6. Click **"Guardar"**

## Paso 2 — Cargar contactos

En el detalle de la campaña hay una sección **Contactos** con un área de
drop-zone + textarea.

### Opción A — Pegar CSV en el textarea

Pegá un CSV directamente. Formato:

```csv
email,nombre,empresa
juan@gmail.com,Juan,ACME
maria@hotmail.com,María,Beta SA
pedro@yahoo.com,Pedro,Gamma
```

El primer renglón son los **headers** (nombres de columnas). El panel los
detecta y te muestra chips con las columnas reconocidas.

### Opción B — Subir un archivo CSV

Click **"Subir CSV"** o arrastrá un archivo `.csv` al área. Mismo formato
que arriba.

### Columnas reservadas

Algunas columnas tienen un significado especial — se mapean a campos del
contacto unificado:

| Columna CSV | Mapea a |
|---|---|
| `email` | Email (**obligatoria**) |
| `firstName` o `first_name` | Nombre |
| `lastName` o `last_name` | Apellido |
| `name` | Nombre completo |
| `externalId` o `external_id` | ID externo (tu CRM, ERP, etc.) |
| `dni` | DNI |
| `cuit` | CUIT |
| `phone` | Teléfono (para vincular con WhatsApp si tenés ambos canales) |

**Cualquier otra columna** va al campo `data` (JSON libre) del contacto y
queda disponible como variable en el template (`{{empresa}}`, `{{monto}}`,
etc.).

### Validación en vivo

Mientras pegás o subís el CSV, el panel te muestra **en tiempo real**:

- Cantidad total de filas
- Cantidad de filas válidas
- Lista de errores (primeros 5 + contador)
- Chips con columnas detectadas
- Aviso si falta una columna obligatoria

Cuando todo está OK, click **"Cargar contactos"**. Los contactos se
upsertean en tu base unificada (si ya existían, se mergean) y se asocian
a esta campaña.

## Paso 3 — Verificar pre-envío

Antes de mandar, asegurate:

| ✅ Check | Cómo |
|---|---|
| Template asignado | Lo ves en la sección Configuración |
| Cuenta SMTP activa | Estado verde en el dropdown de cuenta |
| Al menos 1 contacto cargado | Contador en la sección Contactos |
| Plan con cuota disponible | Mirá el card "Emails" en la home |
| Test send hecho | Te mandaste el preview a vos antes |

## Paso 4 — Enviar

### Opción A — Enviar ahora

1. Click **"Enviar"** (botón verde, arriba a la derecha del detalle)
2. Confirmás el modal
3. La campaña pasa a estado **PROCESSING** y empieza a encolar reports

### Opción B — Esperar al schedule

Si configuraste `scheduledAt` futuro, no hagas nada — un scheduler
interno toma la campaña en la hora indicada y la procesa.

Mientras está en SCHEDULED, podés editarla (cambiar template, cuenta,
contactos). Una vez que arranca PROCESSING, **el contenido queda
congelado** (ningún cambio retroactivo afecta los envíos en curso).

## Paso 5 — Ver el envío en vivo

Mientras la campaña está en PROCESSING:

- **Contador por estado**: PENDING (cuántos faltan), SENT, BOUNCED,
  FAILED, COMPLAINED, SUPPRESSED
- **Lista de reports**: cada destinatario individual con su estado,
  messageId, timestamps. Filtrable por estado.
- **Log en vivo**: ves cada envío individual con la dirección, el
  resultado, el messageId

Cuando todos los reports están en estado final (SENT, BOUNCED, FAILED,
etc., ya no quedan PENDING), la campaña pasa a **COMPLETED**.

## Pausar y reanudar

Si te diste cuenta de algo mal en medio del envío:

1. **Click "Pausar"** en el detalle de la campaña
2. La campaña pasa a **PAUSED**
3. Los reports que ya estaban en cola se detienen (se delay-ean 30s y
   re-chequean status)
4. **Hacé los cambios necesarios** (corregir template, agregar / quitar
   contactos)
5. **Click "Reanudar"** → vuelve a PROCESSING

:::info Pausar NO cancela los emails ya enviados
Los reports que ya pasaron a SENT antes de pausar, esos ya salieron. No
podés "des-enviar" un mail. Pausar solo evita los siguientes.
:::

## Force close (cancelar lo pendiente)

Si querés **terminar** una campaña a la fuerza, sin enviar los pendientes:

1. **Email → Campañas** (listado) → encontrá la campaña
2. Click "Cancelar pendientes" → te confirma cuántos pending se van a
   cancelar
3. Los reports PENDING pasan a CANCELED con motivo `campaign-closed`
4. La campaña pasa a COMPLETED

Útil cuando enviaste a 200 de 1000 y te diste cuenta de un error grave.

## Qué pasa si te pasás del límite del plan

Massivo aplica **corte parcial** (ver
[planes y límites](../conceptos/planes-limites-consumo)):

- Los primeros N contactos (que entran en tu cuota mensual remanente) se
  encolan y envían
- Los restantes se crean como reports con estado `CANCELED` y razón
  `quota-exceeded:plan-FREE` (o el plan que sea)
- En la confirmación del envío vas a ver una **alerta amarilla** con el
  split: "X encolados, Y cancelados por cuota"
- Esos Y no consumen tu cuota — quedan documentados para que sepas
  exactamente cuántos no salieron

## Archivar campañas viejas

Si tu listado se vuelve un caos:

1. En el detalle de una campaña COMPLETED, click **"Archivar"**
2. Pasa al filtro "Archivadas" del listado, no aparece en la vista por
   defecto
3. Los reports y métricas se conservan; podés des-archivar cuando quieras

## Duplicar una campaña

Útil para enviar la misma a un segmento distinto, o repetir un envío
mensual:

1. En el detalle, click **"Duplicar"**
2. Crea una campaña nueva en DRAFT con el mismo template / cuenta /
   reply-to. **NO duplica los contactos** — los cargás de nuevo.

## Borrar una campaña

En el listado, click **Borrar**.

:::warning Cuidado: borra los reports también
Borrar una campaña borra **todos sus reports históricos**. Si necesitás
esos datos para análisis posterior, exportá antes o solo **archivá** en
vez de borrar.
:::

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Campaña sin contactos" al intentar enviar | No cargaste contactos | Cargá un CSV o pegá direcciones |
| "Falta templateId" | No asignaste template | Elegí uno en la configuración |
| "Cuenta SMTP inactiva" | La cuenta no pasó verify | Reverificá la cuenta en Email → Cuentas SMTP |
| Quota error: 0 emails encolados | Plan llegó al límite del mes | Esperá al reset o subí de plan |
| 90% en SUPPRESSED | Casi todos los contactos están en suppression | Revisá la suppression list, probablemente importaste contactos viejos que ya optaron out |
| El destinatario dice que no le llegó | Caso 1: hard bounce (mailbox no existe). Caso 2: filtro de spam | Revisá el report individual del destinatario en la lista |

## Próximos pasos

- 📊 [Ver métricas y reportes](./metricas-reportes) post-envío
- 🚫 [Gestionar desuscriptos](./gestionar-desuscriptos) si tu campaña
  trajo muchos opt-outs
