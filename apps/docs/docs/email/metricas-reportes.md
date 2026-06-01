---
title: Métricas y reportes
sidebar_position: 11
---

# Métricas y reportes de email

Massivo te da **3 niveles de detalle** de tus envíos. Decidís a qué
profundidad querés bajar según lo que necesites entender.

## Nivel 1 — Métricas globales

**Email → Métricas** te muestra el agregado de **todas tus campañas** en
una ventana de tiempo. Por defecto los últimos 30 días, pero podés
cambiar a 7.

### Lo que ves

#### Totales por estado

| Métrica | Qué cuenta |
|---|---|
| **Sent** | Emails aceptados por el SMTP/SES (no garantiza inbox) |
| **Failed** | Errores técnicos (autenticación, conexión, formato) |
| **Bounced** | Rebotados después del envío (hard + soft) |
| **Complained** | Marcados como spam por el destinatario |
| **Suppressed** | No enviados porque el destinatario estaba en
  suppression list |
| **Pending** | Aún en cola (campañas en curso) |

#### Eventos de engagement

- **Unique opens**: cuántos contactos distintos abrieron al menos un mail
- **Unique clicks**: cuántos contactos distintos clickearon al menos un
  link

#### Tasas (rates)

| Tasa | Fórmula | Buen rango |
|---|---|---|
| **Open rate** | `unique opens / sent` | 15-25% (B2B), 20-30% (B2C). Mayor a 30% sospechá Apple Mail inflando. |
| **Click rate** | `unique clicks / sent` | 1-5% típico. 5%+ es muy bueno. |
| **Bounce rate** | `bounced / sent` | Mantenelo por debajo de **2%**. Más alto y SES te penaliza. |
| **Complaint rate** | `complained / sent` | Mantenelo por debajo de **0,1%** (1 cada 1000). Más alto y SES te suspende. |

:::warning Si tu complaint rate sube de 0.1%
AWS SES envía warnings y eventualmente te suspende la cuenta. Pausá
**inmediatamente** la campaña sospechosa, revisá tu suppression list,
chequeá si estás mandando a gente que nunca optó in. Mejor cortar y
perder volumen que perder toda la cuenta.
:::

#### Top campañas

Ranking de las campañas con mejor performance en la ventana
seleccionada. Útil para saber **qué funcionó** y replicar el approach.

## Nivel 2 — Detalle de campaña

Click en una campaña desde el listado o desde "Top campañas".

### Lo que ves

- **Estado actual** y timestamps (creada, programada, enviada, completada)
- **Configuración**: template, cuenta SMTP, Reply-To efectivo
- **Contadores por estado** (PENDING / SENT / BOUNCED / etc.)
- **Tasas específicas de esta campaña**: open rate, click rate, bounce
  rate, complaint rate
- **Lista de reports** (todos los destinatarios) con filtros por estado
  y búsqueda

### Para qué te sirve

- **Diagnóstico**: "Esta campaña tuvo 8% de bounce, ¿qué pasó?" → click
  en filtro "BOUNCED" → ves la lista de mails que rebotaron, hash en mano
  para mejorar tu base.
- **Optimización**: comparás 2 campañas similares, ves cuál abrió
  mejor, entendés por qué.
- **Compliance / auditoría**: necesitás demostrar que mandaste a tales
  destinatarios → exportás la lista.

## Nivel 3 — Detalle de un report individual

Click en un destinatario específico desde la lista de reports.

### Lo que ves

- **Email del destinatario** y su `contact` asociado
- **Estado y motivo**: si fue SUPPRESSED, por qué (hard-bounce / complaint
  / unsubscribe / manual). Si fue FAILED, el error message.
- **Timestamps**: createdAt (cuándo se encoló) / sentAt (cuándo se envió
  realmente) / firstOpenedAt / firstClickedAt
- **smtpMessageId**: el ID que devolvió el servidor SMTP/SES — útil para
  cross-referenciar con logs externos
- **Subject y HTML renderizados**: cómo recibió el mail exactamente este
  destinatario (incluyendo sus variables resolvidas)
- **Eventos de tracking**: cada open y cada click registrado con
  timestamp, device, OS, browser, IP, link clickeado

### Para qué te sirve

- "Juan dice que no recibió el mail. ¿Lo mandamos?" → buscás el report
  de Juan → ves su estado. Si fue SENT, ves el messageId y podés pedirle
  a Juan que busque ese ID en sus logs.
- "El mail llegó pero el link estaba mal" → buscás un report → ves el
  HTML renderizado tal cual lo recibió → confirmás dónde estuvo el bug.
- "¿En qué cliente lo abrió Juan?" → ves los eventos de tracking con
  device/OS/browser.

## Exportar

En el listado de reports de cada campaña, click **"Exportar"** (botón
arriba a la derecha). Te da opciones:

| Formato | Para qué |
|---|---|
| **CSV** | Hojas de cálculo, análisis en Excel |
| **XLSX** | Si querés que las fechas/números mantengan tipos |
| **JSON** | Si vas a procesarlo programáticamente |

Filtros disponibles:

- Por **estado** (solo BOUNCED, solo SENT, etc.)
- Por **rango de fechas** (sentAt entre X e Y)
- (Próximamente) Por **campaign tag**, segmento, etc.

## Eventos en tiempo real

Mientras una campaña está PROCESSING, no hace falta refrescar la pantalla
manualmente:

- El **log en vivo** muestra cada envío individual a medida que ocurre
- Los **contadores se actualizan** vía WebSocket
- El **estado de la campaña** transiciona automáticamente a COMPLETED
  cuando termina

## Métricas que NO tenemos (todavía)

Para que esperes con claridad lo que falta:

- **Mapas de calor** (heatmap de clicks por link). Sí tenés click rate
  por link individual, pero no visual.
- **Cohorts** de engagement a lo largo del tiempo. Sí ves campañas
  individuales.
- **Forecast** de engagement. Análisis predictivo, próxima fase.
- **A/B testing nativo**. Hoy lo simulás duplicando la campaña con
  variantes y comparando manualmente.

Si alguno te resulta crítico, escribinos a
[hola@massivo.app](mailto:hola@massivo.app).

## Buenas prácticas

- **Revisá tus métricas semanalmente** mínimo. Reaccionar tarde a un
  pico de bounces es perder la cuenta.
- **Si una campaña tiene >5% bounce o >1% complaint, pausala**
  inmediatamente y diagnosticá.
- **Limpiá tu base regularmente**: contactos que no abrieron en 6 meses
  → suspendé o sacalos. Mantener mailing list saludable mejora a todos
  tus envíos.
- **Compará con tu benchmark**, no con el de otros. Lo que importa es
  que vos mejores tus tasas, no compararte con "la industria".

## Próximos pasos

- 📋 [Suppression list](./conceptos/suppression-list): qué hacer cuando
  un destinatario tiene bounce / complaint
- 🧹 [Gestionar desuscriptos](./gestionar-desuscriptos)
