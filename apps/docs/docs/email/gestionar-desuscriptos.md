---
title: Gestionar desuscriptos
sidebar_position: 12
---

# Gestionar la suppression list

La **suppression list** (lista de bloqueo) la mantiene Massivo
automáticamente para vos. Pero hay momentos en que necesitás
intervenirla manualmente.

Ver [Conceptos: Suppression list](./conceptos/suppression-list) para el
background completo de qué es y cuándo se llena automáticamente.

## Acceder a la lista

**Email → Desuscriptos** (en el sidebar).

Vas a ver la lista completa con:

- **Email** del contacto bloqueado
- **Scope**: `campaign` (solo para una campaña) o `team` (para todo el
  team)
- **Razón**: cómo entró (`hard-bounce`, `complaint`, `unsubscribe`,
  `manual`)
- **Cuándo entró** (timestamp)
- **Notas** (opcional, agregás vos)

## Filtros disponibles

Arriba de la lista hay filtros para:

- **Por razón**: solo hard bounces, solo complaints, solo unsubscribes,
  solo manual
- **Por scope**: solo campaign-scope, solo team-scope, todos
- **Buscar por email**: matching parcial

Útil cuando tu lista crece y querés analizarla por categoría.

## Agregar un email manualmente

Si te enterás por otro canal (WhatsApp, llamada, email directo a vos)
que un contacto no quiere más:

1. Click **"Agregar"** arriba a la derecha
2. **Email**: pegás la dirección
3. **Scope**: elegí `team` (recomendado para opt-outs manuales — bloquea
   en todas las campañas)
4. **Razón**: dejá `manual`
5. **Notas** (opcional): documentá brevemente. Ej. "Me lo pidió por
   WhatsApp 2026-06-01"
6. **Guardar**

A partir de ahora, **ninguna campaña** intenta enviarle a esa dirección.

## Importar varios emails desde CSV

Útil si te llegó una lista grande para bloquear (típico en un proceso de
GDPR compliance):

1. Click **"Importar CSV"** arriba a la derecha
2. Pegás o subís un CSV. Formato mínimo:

```csv
email
juan@gmail.com
maria@hotmail.com
pedro@yahoo.com
```

Formato extendido (con scope y notas):

```csv
email,scope,reason,notes
juan@gmail.com,team,manual,Pidió por teléfono
maria@hotmail.com,campaign,manual,Opt-out de la campaña X
```

3. El panel valida cada fila y te muestra cuántas se agregaron y cuántas
   ya existían
4. Click **"Importar"**

## Buscar un email específico

En el input "Buscar" pegás el email completo o parcial. Es matching
substring case-insensitive.

Útil cuando alguien te dice "no me llegó tu mail" — buscás si está en
suppression. Si está, le explicás por qué; si no está, el problema es
otro (filtro de spam, hard bounce no detectado, etc.).

## Editar una entrada

Click en una fila para abrir su detalle. Podés editar:

- **Scope**: cambiar de `campaign` a `team` (más restrictivo) o al
  revés
- **Notas**: agregar contexto si después surge algo

**No podés** editar el email (cambialo borrando y volviendo a agregar)
ni la razón original (es histórico).

## Remover un email de suppression

:::warning Pensá antes de remover
- **Hard bounce**: solo removelo si confirmás que la dirección ahora sí
  existe. Sino, el próximo envío rebota y vuelve a entrar.
- **Complaint**: **NO recomendamos remover**. El destinatario te marcó
  como spam — si le volvés a mandar y te marca de nuevo, te juega muy en
  contra para SES.
- **Unsubscribe**: técnicamente podés removerlo si el destinatario te
  pide volver a recibir explícitamente, pero **documentalo** (en las
  notas o por mail).
- **Manual**: la razón sos vos. Removelo cuando vos juzgues que es
  apropiado.
:::

Para remover:

1. Buscá el email en la lista
2. Click en la fila para abrir detalle
3. Click **"Remover"** abajo a la derecha
4. Confirmás

A partir de ahora, las campañas vuelven a poder enviarle.

## Exportar la lista

Click **"Exportar"** arriba a la derecha. Te da:

- **CSV** con todos los emails + scope + razón + timestamp + notas

Útil para:

- Compartir con tu equipo de compliance
- Importar en otra plataforma si migrás
- Auditoría / demostrar cumplimiento

## Audit log

Cada acción (agregar, remover, importar masivo) **queda registrada** en
**Cuenta → Audit log** con:

- Quién hizo la acción
- Cuándo
- Qué email se tocó
- Qué scope/razón antes y después

Imprescindible si después tenés una demanda o auditoría legal por
manejo de datos personales.

## Las 4 reglas que el sistema aplica automáticamente

Aunque puedas manipular suppression manualmente, hay **4 cosas que el
sistema hace siempre, sin que vos puedas desactivarlas**:

1. **Hard bounce → suppression scope=team**: si SES reporta que la
   dirección no existe, va a suppression automáticamente con scope
   `team`.
2. **Complaint → suppression scope=team**: si alguien marca tu mail
   como spam, va a suppression automáticamente con scope `team`.
3. **Unsubscribe click → suppression**: cuando alguien hace click en
   "Cancelar suscripción" del footer, va a suppression. Scope por
   defecto es `campaign`, pero podés cambiarlo en config para que sea
   `team`.
4. **Suppression respetada en cada envío**: antes de enviar cada
   email, chequeamos suppression. Si está, salta como SUPPRESSED y
   **no consume cuota**.

Estas 4 reglas son por compliance — no las podemos hacer opcionales sin
romper el modelo legal de la plataforma.

## Errores comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Importo 500 mails y solo se agregan 200 | Los otros 300 ya estaban en suppression | El panel te muestra cuántos eran duplicados |
| Removí un email y la campaña sigue sin enviarle | Caché de evaluación de suppression. Espera 1 min. | Si persiste, retomar la campaña fuerza re-evaluación |
| Un mail que nunca usé está en suppression como `hard-bounce` | El servidor de SES devolvió hard-bounce para una identidad similar/typo | Removelo si confirmás que existe |
| Una persona me dice "saqué mi unsubscribe" pero sigue bloqueado | El click hizo opt-out, hay que removerlo manualmente | Buscalo y removelo desde la lista. Documentá en notas. |

## Próximos pasos

- 📊 [Métricas](./metricas-reportes): cómo monitorear tus bounce y
  complaint rates antes de que sean un problema
- 📋 [Conceptos: suppression list](./conceptos/suppression-list) si
  todavía no te quedó claro el modelo
