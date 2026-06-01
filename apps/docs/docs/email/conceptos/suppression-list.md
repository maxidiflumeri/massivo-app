---
title: Suppression list (bounces, complaints, unsubscribes)
sidebar_position: 4
---

# La suppression list

La **suppression list** es la lista de direcciones de email que
**no deben recibir mails tuyos**. Massivo la mantiene **automáticamente**
y la respeta en cada envío.

## ¿Por qué existe?

Por 3 razones combinadas:

1. **Legal**: en muchas jurisdicciones (GDPR, LGPD, CASL, CAN-SPAM en EE.UU.)
   estás obligado a respetar el opt-out de tus destinatarios.
2. **Reputación**: insistir con un email que dijo "no me mandes más"
   genera quejas, que destruyen tu deliverability.
3. **Ahorro de cuota**: no tiene sentido gastar tu cuota mensual del plan
   en envíos que igual no van a funcionar.

## ¿Qué se agrega a suppression automáticamente?

### Hard bounces

Un **hard bounce** es un rebote permanente — la dirección no existe
(`5xx Mailbox not found`). Lo agregamos a suppression **inmediatamente**,
porque seguir intentando contra esa dirección:

- Es inútil (nunca va a llegar)
- Daña tu reputación (los proveedores penalizan a quien manda repetido
  a direcciones inexistentes)

### Complaints (quejas)

Cuando alguien marca tu mail como spam en su cliente (Gmail/Outlook), eso
se llama un **complaint**. Es **lo peor que te puede pasar para
deliverability**:

- Gmail/Yahoo te penalizan a vos pero también penalizan a toda la
  reputación de IPs/dominios involucrados
- AWS SES te suspende la cuenta si superás el 0.1% mensual de quejas

Los agregamos a suppression **inmediatamente** y reservamos un slot en
nuestro monitor interno por si se acumulan.

### Unsubscribes (cancelar suscripción)

Cuando un destinatario hace click en el link "Cancelar suscripción" del
footer del email (que Massivo agrega automáticamente, requerido por
Gmail/Yahoo 2024), entran a suppression.

Hay 2 alcances:

| Scope | Significa |
|---|---|
| `campaign` | Solo para esta campaña específica. No recibe más mails **de esa campaña** pero sí de otras. |
| `team` | No recibe **ningún mail** del team. Es el opt-out más fuerte. |

Por defecto Massivo usa `campaign` (más respetuoso del intent del usuario),
pero podés cambiarlo en la configuración.

## ¿Qué se agrega manualmente?

Si te enterás por otro canal (alguien te escribió por WhatsApp, te llamó
por teléfono, etc.) que un contacto no quiere recibir más, podés agregar
su email a la suppression list **manualmente** desde el panel.

- **Email → Desuscriptos** → **"Agregar"**
- Pegás el email, elegís el scope (`team` recomendado para opt-outs
  manuales), opcionalmente agregás un motivo

## ¿Cómo se respeta en cada envío?

Antes de mandar cada email, el worker chequea:

```
Email a mandar: juan@gmail.com (campaña Black Friday)

¿juan@gmail.com está en suppression?
  ├── No → envía ✅
  └── Sí
       ├── Scope team → SKIP (report queda como SUPPRESSED)
       ├── Scope campaign en otra campaña → envía ✅
       └── Scope campaign en ESTA campaña → SKIP
```

Los reports SKIP **no consumen tu cuota mensual**. Vas a verlos en el
detalle de la campaña con estado `SUPPRESSED` y razón
(`hard-bounce` / `complaint` / `unsubscribe-campaign` / `unsubscribe-team` /
`manual`).

## ¿Puedo quitar una dirección de la suppression list?

Sí, pero **pensá bien antes**.

- Hard bounce: si lo agregaste por error y la dirección sí existe, sí
  podés removerlo manualmente. Pero asegurate de que sea cierto, sino el
  próximo envío vuelve a fallar y vuelve a entrar.
- Complaint: **NO recomendamos** removerlo. Si alguien te marcó como spam,
  forzar el envío de nuevo es jurídicamente delicado y prácticamente
  contraproducente.
- Unsubscribe: técnicamente podés removerlo si el usuario te lo pide
  explícitamente, pero documentalo (en un mail o en un audit log).

Lo hacés desde **Email → Desuscriptos** → buscás el email → click
"Remover".

## Estados de un EmailReport relacionados con suppression

| Estado del report | Por qué |
|---|---|
| `SENT` | Se envió OK al SMTP/SES (no quiere decir que llegó al inbox, pero el servidor aceptó) |
| `SUPPRESSED` | No se envió, el destinatario estaba en suppression list |
| `BOUNCED` | Fue enviado y rebotó. Si es hard, **se agrega a suppression automáticamente**. Si es soft, no. |
| `COMPLAINED` | Fue enviado y entregado, pero después el destinatario lo marcó como spam. **Se agrega a suppression automáticamente**. |
| `CANCELED` | No se envió por otra razón (quota, bot, etc.). No tiene que ver con suppression. |

## Compliance — datos para auditoría

Si necesitás demostrar que respetaste un opt-out (típico en una demanda
o una auditoría):

- **Audit log** te muestra cuándo se agregó cada entrada a suppression,
  quién, y por qué
- El **email-report** del usuario en cuestión muestra que el último envío
  fue antes del opt-out, y que los posteriores tienen estado `SUPPRESSED`

## Próximos pasos

- 🛠 [Gestionar desuscriptos](../gestionar-desuscriptos): cómo agregar,
  buscar, remover entradas manualmente
- 📊 [Métricas](../metricas-reportes): cómo monitorear tus tasas de
  bounce/complaint para no caer en suspensión SES
