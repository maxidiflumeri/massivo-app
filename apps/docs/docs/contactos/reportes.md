---
title: Reportes de contactos
sidebar_position: 7
---

# Reportes de contactos

Análisis **agregado** de tu base de contactos. No te muestra detalle
individual (para eso usá [Buscar y filtrar](./buscar-y-filtrar)), sino
**números y gráficos** para entender tu base como un todo.

## Acceder a los reportes

**Contactos → Reportes de contactos** en el sidebar.

## Métricas principales

### Total de contactos

- **Cantidad total** activos (no en suppression scope team)
- Crecimiento últimos 30 días (cuántos se agregaron)
- Crecimiento últimos 7 días

### Distribución por canal

| Canal | Cuántos contactos |
|---|---|
| Solo email | X (tienen email pero no phone) |
| Solo WhatsApp | Y (tienen phone pero no email) |
| Ambos canales | Z (tienen ambos) |
| Sin canal viable | W (raro, suele ser data sucia) |

Útil para entender **tu mix de canales** y planificar campañas.

### Distribución por tags

Gráfico de barras con tus tags más populares:

```
vip                ████████████ 1.2k
cliente            ████████ 850
lead               ██████ 620
español            ██████ 600
inglés             ██ 180
...
```

Útil para entender **cómo está segmentada tu base**.

### Distribución por lista

Idem para listas — cuántos contactos tiene cada una.

### Crecimiento en el tiempo

Gráfico de líneas con la cantidad de contactos creados / día (o
/semana / /mes según rango).

Ranges:

- Últimos 7 días
- Últimos 30 días
- Últimos 90 días
- Último año

Te muestra **picos de captación** (por ejemplo, después de una
campaña de marketing) o **estancamiento**.

### Estado de suppression

| Categoría | Cantidad |
|---|---|
| Activos (sin suppression) | X |
| Email suppression | Y |
| WhatsApp opt-out | Z |
| Bloqueados ambos | W |

Te indica **qué tan saludable está tu base** desde el punto de vista
deliverability.

:::warning Si tu % de suppression supera 20%
Es señal de que estás mandando a contactos viejos o sin opt-in
adecuado. Considerá:
- Limpiar base (borrar dormidos)
- Re-permission opt-in (mandar template pidiendo confirmación)
- Revisar tu proceso de adquisición
:::

### Engagement (próximamente)

- Distribución por **opens rate** (cuántos opens en últimos 30 días)
- Distribución por **clicks rate**
- **Contactos dormidos**: sin engagement en 60+ días — candidatos a
  re-engagement campaign o cleanup

## Cohorts de adquisición

Análisis por **fecha de creación** del contacto vs **engagement actual**:

```
Cohort  | Total | Activos hoy | %
--------|-------|-------------|------
Jun-26  | 1.200 | 980         | 82%
May-26  | 900   | 720         | 80%
Abr-26  | 1.500 | 1.050       | 70%
Mar-26  | 1.100 | 660         | 60%
```

Te dice:

- Los contactos de adquisición reciente engagement alto (normal)
- A medida que pasa el tiempo, la engagement baja (normal)
- Si la baja es muy abrupta, tu base "envejece mal" — necesitás
  re-engagement strategies

## Tags por engagement

Cruce de **tag** + **engagement rate**:

```
Tag      | Total | Open rate | Click rate
---------|-------|-----------|------------
vip      | 1.200 | 45%       | 12%
cliente  | 850   | 30%       | 7%
lead     | 620   | 25%       | 5%
dormant  | 300   | 5%        | 1%
```

Te dice qué segmentos tienen mejor engagement — útil para targeting.

## Reportes específicos

### Top emails por engagement

Lista de los 50 contactos con **mayor open rate** y **mayor click
rate** en últimos 30 días. Son tus "fans" — considerá:

- Programas de referidos / advocacy
- Surveys / feedback solicitado
- Acceso anticipado a nuevos productos

### Bottom emails por engagement

Lista de los 50 contactos **con menor engagement** o **0 engagement
en últimos 60 días**. Candidatos a:

- Re-engagement campaign
- Cleanup (borrar / desuscribir)

### Distribución por origen

Si etiquetaste tus contactos con tags de origen (ej. `landing-marzo`,
`evento-2026`), reporte de cuántos vienen de cada fuente.

## Exportar reportes

Cada reporte tiene botón **Exportar CSV** o **Exportar PDF**:

- CSV: para Excel / análisis posterior
- PDF: para compartir con stakeholders

## Reportes programados (próximamente)

En roadmap:

- Reporte semanal automático por email al admin del team
- Alertas si la base crece bruscamente / baja bruscamente
- Comparación mes vs mes

## Drill-down

Cada métrica te permite **bajar al detalle** — click en un número o
gráfico te lleva al listado de contactos filtrado por ese segmento.

Ejemplo: click en "VIP open rate 45%" → te abre el listado de
contactos con tag `vip`.

## Refresh

Los datos del dashboard se **calculan en background** y se actualizan
cada ~5 min. Si necesitás datos en vivo después de un import grande,
hacé refresh manual con el botón.

## Reportes vs campañas vs contactos

Para que no te confundas:

| Quiero ver... | Voy a... |
|---|---|
| Cómo le fue a UNA campaña específica | Email → Métricas (campaña-level) |
| Cómo está mi BASE de contactos en general | Contactos → Reportes |
| UN contacto individual y su historial | Contactos → buscarlo → detalle |
| Métricas agregadas DE TODAS las campañas | Email → Métricas (global) |

## Próximos pasos

- 🔍 [Buscar y filtrar contactos](./buscar-y-filtrar) para drill-down
- 🛠 [Importar CSV](./importar-csv) para crecer tu base
- 📊 Email [Métricas](../email/metricas-reportes) para análisis por
  campaña
