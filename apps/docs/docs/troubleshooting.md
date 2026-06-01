---
title: Troubleshooting
sidebar_position: 100
---

# Troubleshooting — los problemas más comunes

Si algo no anda, **probá lo de acá antes de escribirnos** — la
mayoría se resuelve en 5 min siguiendo los pasos.

## Email

### Mi dominio no se verifica

**Síntomas**: estado del dominio queda en PENDING después de
horas / días.

**Diagnóstico**:

1. **¿Los 3 CNAMEs DKIM están bien?** Probá desde tu terminal:
   ```bash
   dig CNAME abc123._domainkey.tu-dominio.com +short
   ```
   Tiene que devolver `abc123.dkim.amazonses.com`. Si devuelve nada,
   los records no propagaron.

2. **¿Sufijo duplicado?** Algunos DNS providers (NS1, Netlify, GoDaddy)
   auto-completan tu zone. Si pusiste el FQDN completo, queda
   `abc123._domainkey.tu-dominio.com.tu-dominio.com` — mal.

3. **¿Cache NXDOMAIN?** Pasaron más de 1h y dig confirma que los CNAMEs
   están bien pero SES sigue PENDING → es el cache de Amazon. Borrá y
   re-creá la identity para forzar nuevos tokens.

Solución completa: ver
[agregar dominio](./email/agregar-dominio#el-gotcha-del-cache-nxdomain).

### Mi cuenta SMTP queda Inactiva

**Síntomas**: después de guardar, el badge dice "Inactiva" con
tooltip de error.

**Causas y soluciones**:

| Error | Solución |
|---|---|
| `Authentication failed` | Password rotada / mal escrita. Update en cuenta SMTP. |
| `Connection refused` | Host/puerto mal. Confirmá con tu proveedor. |
| `STARTTLS required` | Estás usando puerto 25 / sin TLS. Cambiá a 587 (STARTTLS) o 465 (TLS directo). |
| `Mailbox not found` | Tu fromEmail no existe en el servidor. Cambialo. |
| `Daily limit exceeded` | Gmail / Outlook personal te limitó (~500/día). Usá SES. |

### Mis mails llegan pero caen en spam

Ver FAQ → [¿Por qué mis mails caen en spam?](./faq#por-qué-mis-mails-caen-en-spam).

Checklist rápida:

- [ ] DKIM verificado (estado VERIFIED)
- [ ] SPF agregado y verificado
- [ ] DMARC agregado y verificado (incluso con p=none)
- [ ] From con dominio verificado (no Gmail / Hotmail)
- [ ] Subject sin mayúsculas exageradas ni "!!!"
- [ ] Body con texto + imágenes (no solo imagen)
- [ ] Link a unsubscribe (Massivo lo agrega auto)

Si seguís cayendo, probá con
[mail-tester.com](https://www.mail-tester.com) para diagnóstico
detallado.

### El destinatario dice "no me llegó"

1. **Buscalo en Reports** de la campaña por su email
2. Confirmá el **status**:
   - SENT → Massivo entregó al SMTP/SES. Pediles que busquen el
     `smtpMessageId` en sus logs.
   - SUPPRESSED → estaba en suppression list. Mostraste el motivo.
   - FAILED → fallo técnico. Razón en el detalle.
   - BOUNCED → hard o soft bounce, ver detalle.

Si no figura en absoluto: no fue cargado en la campaña (problema de
CSV / scope).

### "Quota exceeded" pero no había llegado al límite

Causa típica: corte parcial detectó cuota llena por **otra campaña en
paralelo** que se procesó antes.

Solución: esperá al próximo mes o subí de plan.

## WhatsApp

### Templates no se aprueban

Ver [Templates aprobados → motivos de rechazo](./whatsapp/conceptos/templates-aprobados#motivos-comunes-de-rechazo).

Soluciones más comunes:

- Cambiar categoría (UTILITY → MARKETING si es promo)
- Remover emojis excesivos
- Hacer el wording más conciso y menos "salesy"
- Asegurarte de que las variables tengan formato `{{1}}`, `{{2}}`
  (Massivo lo maneja, pero si editás raw, revisá)

### Webhook de Meta no llega

**Síntomas**: tus contactos te escriben pero no aparecen en el inbox.

**Diagnóstico**:

1. En **Meta Console → tu app → Webhooks → Recent Deliveries** —
   ¿Hubo intentos de llamada a tu URL?
   - Sí + 2xx → llegó OK. Bug en Massivo, contactanos.
   - Sí + 4xx/5xx → algo se rompió en el receive. Mirá el error.
   - No → Meta no intentó. Confirmá que estás suscripto al field
     `messages`.

2. **¿Tu webhook está bien suscripto?** Re-validá en Meta Console.

3. **¿Verify token está bien?** Si lo rotaste en un lado pero no en
   el otro, Meta rechaza el handshake.

### "Spam rate limit" (131048)

Tu número Meta tiene quality LOW. Soluciones:

1. **Pausá envíos masivos inmediatamente**
2. **Audita tu base**: ¿estás mandando a contactos que no opt-in?
3. **Mejorá templates**: menos promocional, más value
4. **Esperá 3-7 días** sin actividad para que la quality suba
5. **Re-activá con volumen bajo** y monitorea

### "Re-engagement window expired" (131047)

Mandaste mensaje libre cuando ya pasaron las 24h del último inbound.
Solución: mandá un template aprobado para reactivar la conversación.

### "Pair rate limit" (131056)

Demasiados mensajes con el mismo contacto en poco tiempo. Massivo
**reintenta automáticamente** con backoff exponencial. Si pasa mucho,
espaciá envíos en la WapiConfig.

## Bots

### El bot no responde

**Diagnóstico**:

1. **¿`botEnabled` está en true?** WapiConfig → Editar → confirmá toggle.

2. **¿La feature está habilitada para tu org?** Si tu plan no incluye
   bots, no funcionan. Subí de plan o pedinos.

3. **¿La conversación está suspendida?** Si previamente hubo HANDOFF y
   no se cerró, el bot está suspended. Marcá como RESOLVED para
   reactivar.

4. **¿El bot tiene un flow válido?** En el editor, ¿hay errores de
   validación (rojo)? Arreglálos y publicá.

5. **¿Hay un topic default que matchee?** Si el contacto escribe algo
   que ningún router matchea, va al inbox. Agregá un topic default.

### El bot avanza pero a un nodo equivocado

**Diagnóstico**:

1. Abrí el **simulador** y reproducí el flow
2. Mirá el log de cada paso — qué nodo se ejecutó, qué decisión tomó
3. Si CONDITION elige mal: confirmá tipos (string vs number)
4. Si MENU no matchea opciones: confirmá labels exact

### Variables no se interpolan (la doble llave aparece literal)

Causas:

- **Variable no capturada todavía**: confirmá que el CAPTURE corrió
  antes del nodo que la usa
- **Variable mal escrita**: `{{ nombre }}` con espacios no funciona
  igual que `{{nombre}}` (sí funciona si es JSONata con `=`)
- **Variable no existe en sesión**: declarala con default

### El simulador funciona pero en WhatsApp real no

El simulador usa el **draft**. Tenés que **publicar** para que el bot
real lo use. Click "Publicar".

### HTTP del bot falla con "URL not allowed"

SSRF guard detectó IP privada. Tu URL tiene que ser **pública** (no
`localhost`, no IP interna). Si tu API es interna, exponela vía un
reverse proxy con dominio público.

## Inbox

### Mensajes inbound no aparecen en el inbox

Mismo diagnóstico que "Webhook de Meta no llega" arriba. El inbox se
puebla de los webhooks.

### Asignar conversación no se persiste

Race condition: si dos agentes asignan a la misma vez, gana el último.
Refrescá la UI para ver el estado real.

### El input no me deja escribir

La 24h window expiró. Mandá un template para reactivar.

## Performance

### El panel anda lento

Causas:

- **Mucha data en sesión**: si tenés > 50k contactos / > 100k reports,
  algunas vistas pueden tardar 2-5s
- **Filtros complejos**: combinar varios filtros en buscar contactos
  puede ser pesado
- **Tu connection**: probá con otra red para descartar

Solución general: **filtros más específicos**, **listas pre-pobladas**
para casos frecuentes.

### Los reports tardan en actualizar

Los reports se actualizan **vía WebSocket en tiempo real**. Si no se
actualizan:

- Refrescá la página
- Confirmá que tenés conexión a internet estable
- Si seguís sin ver updates, contactanos — puede ser bug

## Login y autenticación

### No puedo loguearme

- **¿Probaste con otro browser?** Cookies del browser anterior pueden
  estar corruptas
- **¿Magic link no llega?** Chequeá spam
- **¿Cuenta deshabilitada?** Si un OWNER te removió de la org, no podés
  loguearte a esa org. Pedile que te re-invite.

### Sesión expira muy rápido

Por default Clerk mantiene sesión por días. Si expira rápido:

- **Browser en modo incógnito**: las cookies se borran al cerrar.
- **VPN / proxy** que cambia tu IP frecuentemente.

## Webhooks / API

### "401 Unauthorized" en la API

Token de Clerk inválido o expirado. Re-loguéate y obtené uno nuevo.

### "403 Forbidden"

Tenés sesión pero no permisos. Causas:

- Rol insuficiente — pedile a OWNER que te cambie
- Estás en team equivocado — cambialo desde el selector

### Webhooks que mandamos a tu sistema no llegan

Si configuraste un webhook custom y no te llegan eventos:

- ¿Tu URL es pública? (no `localhost`, no IP privada)
- ¿Devuelve `200 OK`? Si devuelve 5xx, reintentamos pero abandonamos
  después de varios fallos.
- ¿Validás bien la firma HMAC? Si rechazás por firma, no procesamos —
  pero te mandamos igual.

## Cosas que **NO** son problemas

Por las dudas:

- **"Mando un mail desde noreply@ y nadie responde"** → es esperado.
  Configurá Reply-To al mail real que querés recibir respuestas.
- **"El bot manda 3 mensajes seguidos"** → los MESSAGE encadenados sin
  CAPTURE en medio son automáticos. Es por design.
- **"Open rate del 80%"** → casi seguro es Apple Mail Privacy Protection.
  No es real, no es tu mérito.
- **"Templates aprobados muestran emojis raros en algunos clientes"** →
  algunos emojis no son universales. Probá con emojis comunes.

## Cuándo escribirnos

Si después de todo esto sigue sin funcionar:

📧 [hola@massivo.app](mailto:hola@massivo.app)

Incluí:

- **Qué estabas haciendo** cuando pasó
- **Screenshots** del error
- **Timestamp aproximado**
- **IDs relevantes** (campaña, contacto, dominio, etc.)
- **Steps to reproduce** si los tenés

Nos ayudás a ayudarte rápido.
