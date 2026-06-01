---
title: Audit log
sidebar_position: 2
---

# Audit log

El **audit log** es el **historial cronológico de todas las acciones
importantes** que pasaron en tu organización. Sirve para compliance,
debugging y para detectar comportamiento sospechoso.

## Acceder

**Cuenta → Audit log** en el sidebar. Solo lo ven OWNERs y ADMINs de
la organización.

## Qué se loggea

Massivo loggea **automáticamente** estos eventos:

### Acciones sobre campañas

- `email.campaign.created` / `updated` / `deleted` / `sent` /
  `paused` / `resumed` / `forceClosed`
- `email.campaign.contactsAdded`
- `wapi.campaign.created` / `updated` / etc.

### Acciones sobre templates

- `email.template.created` / `updated` / `deleted`
- `wapi.template.created` / `submitted` / `approved` / `rejected`

### Acciones sobre dominios y cuentas SMTP

- `email.domain.created` / `verified` / `deleted`
- `email.smtp.created` / `updated` / `deleted`

### Acciones sobre WapiConfig

- `wapi.config.created` / `updated` / `deleted`
- `wapi.config.tokenRotated`

### Acciones sobre bots

- `wapi.bot.created` / `published` / `discardedDraft`
- `wapi.bot.suspendedForConversation` / `reactivatedForConversation`

### Acciones sobre contactos

- `contact.created` / `updated` / `deleted` / `merged`
- `contact.imported` (masivo)
- `contact.suppressed`

### Acciones sobre usuarios

- `org.member.invited` / `roleChanged` / `removed`
- `team.member.added` / `roleChanged` / `removed`

### Acciones sobre suppression

- `email.suppression.added` / `removed`
- `wapi.optout.added` / `removed`

## Qué contiene cada entrada

| Campo | Descripción |
|---|---|
| `id` | UUID único |
| `actorId` | Usuario que hizo la acción (null si fue automático) |
| `actorEmail` | Email del actor (denormalizado para histórico) |
| `action` | El tipo de acción (string como `email.campaign.sent`) |
| `resourceType` | Tipo de recurso afectado (`EmailCampaign`, `Contact`, etc.) |
| `resourceId` | ID del recurso afectado |
| `metadata` | JSON libre con detalles específicos (qué cambió, valores antes/después, etc.) |
| `ip` | IP desde donde se hizo la acción |
| `userAgent` | UA del browser/cliente |
| `createdAt` | Timestamp UTC |

## Filtros

Arriba de la tabla:

| Filtro | Para qué |
|---|---|
| **Buscar** | Texto libre — matchea action, actorEmail, resourceId |
| **Por actor** | Solo eventos de un usuario específico |
| **Por acción** | Solo cierto tipo (ej. solo `*.deleted`) |
| **Por recurso** | Solo eventos sobre cierto resourceType |
| **Por fecha** | Rango específico |

## Ver detalle de un evento

Click en una fila te abre el detalle:

- Todos los campos anteriores
- **Metadata completo** (qué cambió específicamente)
- **Link al recurso afectado** si todavía existe

Ejemplo de metadata para un `email.campaign.sent`:

```json
{
  "campaignId": "c_abc123",
  "campaignName": "Newsletter Junio",
  "enqueued": 1000,
  "quotaSkipped": 50,
  "templateId": "t_xyz",
  "smtpAccountId": "s_def"
}
```

Ejemplo de metadata para `contact.merged`:

```json
{
  "winnerId": "ct_111",
  "loserIds": ["ct_222", "ct_333"],
  "fieldDecisions": {
    "email": "winner",
    "phone": "loser_222",
    "name": "winner"
  }
}
```

## Casos de uso

### Compliance / auditoría externa

Una auditoría legal te pide:

- Probar que respetaste un opt-out el día X → audit log filtrado por
  `*.suppression.added` para ese contacto
- Probar quién accedió a datos sensibles → audit log por
  `contact.viewed` (próximamente)

Exportá el audit log al rango pedido y lo entregás.

### Debug "qué pasó con esta campaña"

Una campaña no se mandó como esperabas:

1. Filtrá por `resourceId: <campaign-id>`
2. Ves toda la cronología:
   - Quién la creó
   - Qué cambios sufrió
   - Quién hizo el envío
   - Si se pausó, quién y cuándo
   - Si se cerró forzadamente, motivo

### Detectar acceso no autorizado

Revisás periódicamente:

- Acciones de usuarios ex-empleados (deberían ser cero)
- Acciones desde IPs raras (fuera de tu país habitual)
- Acciones en horarios fuera de oficina

Si ves algo sospechoso, **investigá** y eventualmente:

- Rotá tokens / passwords
- Remové acceso si confirmás compromise

## Exportar

Click **Exportar** te baja CSV con los eventos filtrados.

Opciones:

- Todos los filtrados
- Solo los seleccionados (con checkboxes)

Útil para llevar a planilla / DataLake / SIEM tuyo.

## Retención

Los eventos se retienen **por 1 año** en planes Free / Starter, y
**3 años** en Business / Enterprise.

Si necesitás retención mayor (compliance bancaria, etc.), **exportá
periódicamente** y guardá en tu propio storage.

## Eventos automáticos vs manuales

Algunos eventos los genera **el sistema sin actor humano**:

- Webhooks recibidos de Meta / SES
- Decisiones del bot (HANDOFF, suspensión)
- Cron jobs (limpieza, polling de dominios)

Para estos, `actorId` es `null` y `actorEmail` es algo como
`system:bot-engine` o `system:email-worker`.

## Limitaciones

- **No loggeamos lecturas** (solo modificaciones). Si alguien solo
  miró un contacto sin tocarlo, no aparece. Esto cambia próximamente.
- **No persistimos secrets**: el metadata nunca contiene tokens,
  passwords ni datos sensibles del contacto (solo IDs).
- **Buscar texto libre puede ser lento** en orgs con millones de
  eventos. Usá filtros específicos.

## Próximos pasos

- 🔐 [Permisos y roles](../conceptos/permisos-roles) — quién puede
  hacer qué
- 👥 [Gestionar usuarios](./gestionar-usuarios) — para revisar
  miembros tras detección de algo raro
