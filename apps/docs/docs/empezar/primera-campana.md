---
title: Tu primera campaña en 10 minutos
sidebar_position: 3
---

# Tu primera campaña de email en 10 minutos

Este tutorial te lleva de cero a enviar tu primer email a un grupo de
contactos, end-to-end. Lo armamos para que lo hagas exactamente como en
producción, **sin pasos de "playground"** — todo lo que hagas acá te sirve
después para campañas reales.

:::info Pre-requisitos
- Una cuenta creada en [panel.massivo.app](https://panel.massivo.app)
- Tener acceso al DNS del dominio que vas a usar para enviar (vamos a
  agregar 3-5 records DNS)
- 5 mails de prueba para enviarles (pueden ser todos tuyos en distintos
  proveedores)
:::

## Paso 1 — Verificá tu dominio (3 min de setup + esperar DNS)

Antes de poder mandar emails desde `@empresa.com` tenés que decirle a AWS SES
que ese dominio es tuyo. Lo hacemos verificando con **DKIM**: 3 registros
CNAME que prueban posesión.

1. En el panel, andá a **Email → Dominios**
2. Click **"Agregar dominio"**
3. Escribí tu dominio (ej `empresa.com` o un subdominio dedicado tipo
   `mail.empresa.com`)
4. Click **"Registrar en SES"**

Te muestra **3 CNAMEs DKIM** que tenés que copiar a tu proveedor de DNS
(Netlify, Route 53, Cloudflare, NS1, GoDaddy, etc.).

:::tip Si tu DNS provider auto-completa tu zone
Los nombres se muestran como **FQDN absoluto** (terminan en tu dominio
completo). Si tu provider auto-agrega tu zone al final, pegá solo la parte
que no incluye tu zone. Ejemplo: si tu zone es `empresa.com` y el CNAME es
`xxx._domainkey.mail.empresa.com`, pegá solo `xxx._domainkey.mail`.
:::

5. Agregalos en tu DNS provider
6. Volvé a la pantalla del dominio en el panel y click **"Verificar ahora"**
   cada par de minutos. AWS suele tardar 5-15 min en propagar.

Cuando los 3 CNAMEs propagen, el card **DKIM** pasa a **Verificado** ✅.

### (Recomendado) Agregá también SPF y DMARC

En la misma pantalla vas a ver dos cards más: SPF y DMARC. Son
**recomendados** pero te van a ahorrar mucho ruido en clientes de mail tipo
Gmail/Yahoo que exigen autenticación completa.

Click "Ver record recomendado" en cada uno y pegalos en tu DNS:

- **SPF** (TXT en tu dominio): `v=spf1 include:amazonses.com ~all`
- **DMARC** (TXT en `_dmarc.tu-dominio`): `v=DMARC1; p=none; rua=mailto:postmaster@tu-dominio`

En 10-15 min ambos pasan a Verificado.

## Paso 2 — Creá una cuenta SMTP linkeada al dominio (1 min)

Ahora le decimos al panel que querés enviar usando ese dominio verificado.

1. **Email → Cuentas SMTP** → **"Nueva cuenta"**
2. **Nombre**: algo descriptivo, ej "Notificaciones generales"
3. **Origen del envío**: elegí **"Dominio verificado: tu-dominio.com"** en el
   dropdown
4. **From (nombre)**: ej "Marketing Empresa"
5. **From (email)**: el panel autosugiere `noreply@tu-dominio` — podés
   cambiarlo (ej `info@tu-dominio` o `hola@tu-dominio`). **Debe terminar en
   tu dominio verificado**.
6. **Reply-To (opcional)**: si querés que cuando alguien le dé "Responder"
   las respuestas vayan a otra casilla (tu mail real de trabajo), ponela
   acá. Si lo dejás vacío, las respuestas van al From.
7. **Guardar**

La cuenta se valida automáticamente. Si el dominio sigue VERIFIED, queda
**Activa** ✅.

:::note ¿Por qué un dominio dedicado y no Gmail / Outlook?
Enviar masivamente desde una casilla personal de Gmail/Outlook viola sus
términos y termina con tu cuenta bloqueada. Con un dominio propio
verificado en SES:
- Llegás a inbox (no a spam) con buena reputación
- Podés enviar millones, no docenas
- Mantenés el control de la deliverability
:::

## Paso 3 — Creá un template (2 min)

Un template es el **diseño** del mail. Después lo asociás a una campaña.

1. **Email → Templates** → **"Nuevo template"**
2. **Nombre**: ej "Bienvenida"
3. **Asunto (subject)**: ej `Hola {{nombre}}, gracias por sumarte`

   :::tip Variables Handlebars
   Las llaves dobles `{{...}}` son variables que se reemplazan por el dato
   del contacto en el momento del envío. `{{nombre}}` → "Juan".
   :::

4. En el editor drag&drop, armá tu HTML. Para empezar usá:
   - Un bloque **Image** con tu logo
   - Un bloque **Text** con el cuerpo del mensaje
   - Un bloque **Button** con tu call-to-action

   Mientras escribís texto, usá `{{nombre}}`, `{{empresa}}` o cualquier
   variable que después vayas a mandar en tus contactos.

5. (Opcional) Click **"Preview"** y cargá un `sampleData` JSON para ver el
   render real. Ej `{"nombre": "Juan", "empresa": "ACME"}`.

6. Click **"Test send"** y mandate el preview a tu propio mail para ver
   cómo queda en Gmail / Outlook antes de mandar a tus contactos.

7. **Guardar**

## Paso 4 — Creá la campaña (1 min)

La campaña es el **envío real**: junta un template + una cuenta SMTP + una
lista de contactos.

1. **Email → Campañas** → **"Nueva campaña"**
2. **Nombre**: ej "Bienvenida — Junio 2026"
3. **Template**: elegí "Bienvenida"
4. **Cuenta SMTP**: elegí la que creaste antes
5. **Programada para**: dejá vacío si querés mandar ahora; setealo a una
   fecha/hora futura si querés programar
6. **Reply-To**: dejá vacío (usa el de la cuenta) o ponele uno específico
   para esta campaña
7. **Guardar**

## Paso 5 — Cargá tus contactos (1 min)

Ahora cargás a quién le vas a mandar.

1. En la campaña recién creada, sección **Contactos**, vas a ver un input
   tipo textarea con drop zone
2. **Pegá tu CSV** o arrastrá un archivo. Formato:

   ```
   email,nombre,empresa
   juan@gmail.com,Juan,ACME
   maria@hotmail.com,María,Beta SA
   ```

3. El primer renglón son los **headers** (los nombres de columna). Las
   columnas reservadas son: `email` (obligatoria), `firstName`, `lastName`,
   `name`, `externalId`, `dni`, `cuit`. Cualquier otra columna va al
   campo `data` y queda disponible como variable en el template.

4. El panel valida el CSV en vivo y te muestra:
   - Cantidad de filas válidas
   - Cantidad con error (con el motivo)
   - Columnas detectadas como chips

5. Si todo OK, click **"Cargar contactos"**

## Paso 6 — Enviá (1 min)

1. Verificá:
   - ✅ Template asignado
   - ✅ Cuenta SMTP activa
   - ✅ Al menos 1 contacto cargado
   - ✅ Plan con cuota disponible (mirá el card "Emails" en el home)

2. Click **"Enviar"** → confirmá

Se encola el envío. Vas a ver:

- La campaña pasa a estado **PROCESSING**
- Los reports van llenándose en tiempo real (PENDING → SENT)
- El log en vivo muestra cada envío individual

:::info Si tu plan llegó al límite
Si los contactos exceden tu cuota mensual, **aplicamos corte parcial**: se
encolan los primeros N que entran en la cuota, y el resto queda CANCELED
con razón `quota-exceeded`. Vas a ver en pantalla un warning amarillo con
el split. Ver [planes y límites](../conceptos/planes-limites-consumo).
:::

## Paso 7 — Mirá el reporte (en vivo)

Mientras los mails se envían (y después), tenés visibilidad total:

- **En la campaña**: contador por estado (SENT / FAILED / BOUNCED / OPENED /
  CLICKED)
- **En la lista de reports**: cada contacto individual con su estado, el
  messageId del SMTP, cuándo se abrió, cuándo hizo click
- **En Email → Métricas**: agregado de todas tus campañas, tasas, top
  campañas

## ¿Y ahora qué?

Listo, ya enviaste tu primera campaña. Próximos pasos lógicos:

- 📊 Explorá [Métricas](https://panel.massivo.app/dashboard/email/metrics)
  para ver tasas históricas
- 📝 Aprendé sobre el [modelo de organizaciones y teams](../conceptos/orgs-teams-usuarios)
  cuando quieras invitar a otra persona
- 💬 Si tu cliente también necesita WhatsApp, mirá la sección **WhatsApp**
- 🤖 Si querés automatizar respuestas, mirá la sección **Bots**

## Errores comunes en el primer envío

| Síntoma | Causa probable | Solución |
|---|---|---|
| El dominio nunca pasa a VERIFIED | Records DNS mal copiados | Re-verificá los CNAMEs, especialmente que no se haya duplicado el sufijo del zone |
| "fromEmail no pertenece al dominio verificado" | Pusiste `info@otro.com` con un dominio distinto seleccionado | Cambiá el fromEmail al dominio verificado, o creá otra cuenta SMTP |
| Mails llegan a spam en Gmail | Falta SPF o DMARC | Agregá los TXT recomendados |
| 0 emails encolados pero contactos cargados | Plan FREE llegó al límite del mes | Subí de plan o esperá al reset del próximo mes |
