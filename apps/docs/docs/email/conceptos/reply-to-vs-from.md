---
title: Reply-To vs From
sidebar_position: 3
---

# Reply-To vs From

Cuando alguien recibe un mail tuyo y le da "Responder", ¿a dónde llega la
respuesta? Acá entran 2 headers que parecen iguales pero hacen cosas
distintas.

## From

El `From` es **el remitente visible**. Es lo que ve el destinatario:

```
De: Marketing Empresa <noreply@empresa.com>
```

Por defecto, **las respuestas van al `From`**. Si lo dejás como
`noreply@empresa.com`, el destinatario le da Responder y... la respuesta
va a una casilla que **probablemente nadie lee**.

## Reply-To

El `Reply-To` es **opcional**. Si lo seteás, el cliente de mail
(Gmail/Outlook) usa esta dirección como destino cuando el destinatario
hace "Responder", **en vez del `From`**.

```
De: Marketing Empresa <noreply@empresa.com>
Responder a: info@empresa.com
```

El destinatario ve "Responder a: info@empresa.com" en la previsualización
del mail, y cuando aprieta Responder, el mail se va para allá.

## ¿Por qué tener From distinto a Reply-To?

Es la práctica estándar:

- **El From** usa tu dominio verificado para tener **buena deliverability**
  (DKIM-firmado por `empresa.com`).
- **El Reply-To** apunta a tu casilla real (`info@empresa.com`,
  `ventas@empresa.com`, tu Gmail personal, etc.) para que **las respuestas
  lleguen a un humano**.

Es el modelo que usan SendGrid, Mailgun, Resend y todas las plataformas
profesionales.

## En Massivo

Configurás Reply-To en **2 lugares**:

### A nivel cuenta SMTP (default)

Al crear o editar una cuenta SMTP, podés setear un `Reply-To` que aplica a
**todas las campañas que usan esa cuenta**.

- Cuenta SMTP: `noreply@empresa.com` (From)
- Reply-To: `info@empresa.com`
- → Todas las campañas con esta cuenta tienen ese Reply-To

### A nivel campaña (override)

Si una campaña específica necesita un Reply-To distinto, lo seteás en la
configuración de la campaña. **Pisa** el de la cuenta SMTP **solo para esa
campaña**.

Ejemplo:

- Cuenta SMTP `noreply@empresa.com`, Reply-To default `info@empresa.com`
- Campaña "Black Friday" → Reply-To override `promos@empresa.com`
- Las respuestas del Black Friday van a `promos`, no a `info`

### Cómo se resuelve

El worker sigue esta cascada:

1. ¿La campaña tiene `replyTo`? → usá ese
2. ¿La cuenta SMTP tiene `replyTo`? → usá ese
3. → No setees Reply-To (el cliente de mail cae al `From`)

## Casos prácticos

### "Quiero que noreply vaya a noreply, no a nadie"

Dejá Reply-To **vacío** en la cuenta SMTP. El destinatario ve `From:
noreply@empresa.com`, y si le da Responder, le sale el mail listo para
`noreply@empresa.com`. Si tenés filtros que mandan ese inbox a la papelera,
literalmente las respuestas se pierden. (Es lo que pasa con casi todos los
mails transaccionales).

### "Envío desde noreply, pero quiero recibir las respuestas en mi Gmail"

Cuenta SMTP:
- From: `noreply@empresa.com`
- Reply-To: `tu-mail@gmail.com`

### "Hago A/B testing y cada campaña responde a un equipo distinto"

Cuenta SMTP:
- Reply-To default: `marketing@empresa.com`

Por campaña:
- Campaña A: Reply-To override `marketing-arg@empresa.com`
- Campaña B: Reply-To override `marketing-mx@empresa.com`

### "Mi cliente quiere que las respuestas lleguen a un CRM externo"

Setealo al mail del CRM (ej. el address generado por HubSpot, Pipedrive,
etc.) como Reply-To. Cada vez que un cliente le responda al mail de
marketing, va a quedar registrado como una nueva entrada en el CRM.

## Validación que aplica Massivo

- El campo Reply-To debe ser un **email válido**
- **No tiene que estar en tu dominio verificado** — puede ser `gmail.com`,
  `hubspot.com`, lo que sea. Es solo un header informativo.

## Próximos pasos

- 📨 Si todavía no lo tenés claro: [Cómo crear una cuenta SMTP](../conectar-cuenta-smtp)
- 🚀 [Cómo crear una campaña](../crear-campana) y configurar Reply-To en
  el override
