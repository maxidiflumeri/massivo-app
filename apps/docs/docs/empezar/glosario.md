---
title: Glosario
sidebar_position: 4
---

# Glosario

Términos que vas a leer mucho en esta documentación y en el panel. Si te
encontrás con uno que no está acá, escribinos a
[hola@massivo.app](mailto:hola@massivo.app) y lo agregamos.

## A

**Access Token (Meta)**
: La credencial que te da Meta para que tu app (Massivo en este caso) pueda
mandar mensajes desde tu cuenta de WhatsApp Business. Lo configurás en
**WhatsApp → Números**.

**Audit log**
: Historial cronológico de todas las acciones importantes en tu organización
— quién creó/borró/envió qué. Útil para compliance y para diagnosticar
problemas.

## B

**Bot guiado**
: Un flujo conversacional automatizado que responde a los mensajes de tus
contactos en WhatsApp sin intervención humana. Lo armás visualmente en el
**editor de flujo** con distintos tipos de **nodos**.

**Bot session**
: La conversación en curso entre un contacto y tu bot. Mantiene el estado
de dónde está parado el contacto en el flujo. Si el contacto vuelve a
escribir más tarde, retoma desde el mismo punto.

**Bounce (rebote)**
: Un email que fue rechazado por el servidor del destinatario. Hay 2 tipos:
**hard bounce** (mailbox no existe, irrecuperable — lo agregamos
automáticamente a la suppression list) y **soft bounce** (problema temporal
tipo "casilla llena", reintentable).

## C

**Campaña**
: Un envío masivo definido por: un template + una cuenta SMTP/config WhatsApp
+ una lista de contactos. Puede ser de **Email** o de **WhatsApp**.

**Complaint (queja)**
: Cuando un destinatario marca tu email como spam en su cliente
(Gmail/Outlook). Es **lo más grave** para tu reputación de envío — lo
agregamos automáticamente a la suppression list. >0.1% de queja por mes y
SES te suspende.

**Configuration Set (SES)**
: Un grupo de reglas que AWS SES aplica a tus envíos: dónde publica los
eventos (apertura, click, bounce), qué IP pool usa, etc. Massivo crea uno
automáticamente por team.

**Contacto**
: Una persona (o entidad) en tu base de datos. Puede tener email, teléfono,
identificadores (DNI/CUIT), nombre, y un objeto libre `data` con cualquier
otro atributo. El mismo contacto puede aparecer en campañas de email y de
WhatsApp.

## D

**DKIM (DomainKeys Identified Mail)**
: Estándar que prueba que un email viene realmente de tu dominio. AWS SES
firma cada email con una clave privada cuya pública está publicada como
CNAME en tu DNS. Los servidores receptores la verifican. Sin DKIM tus mails
suelen ir a spam. Ver [dominios verificados](../email/conceptos/dominios-verificados).

**DMARC (Domain-based Message Authentication, Reporting and Conformance)**
: Política que le dice a los servidores receptores qué hacer con mails que
fallan SPF o DKIM (aceptar, cuarentena, rechazar). Es **requerido por
Gmail/Yahoo desde 2024** para envíos masivos. Configurás el TXT en
`_dmarc.tu-dominio`.

**Dominio verificado**
: Tu dominio registrado en AWS SES con DKIM confirmado. Te permite enviar
emails desde direcciones de ese dominio (`info@tu-dominio.com`,
`noreply@tu-dominio.com`, etc.) con buena reputación.

## E

**Email Template**
: El diseño HTML reutilizable de un email, con variables Handlebars
(`{{nombre}}`, `{{empresa}}`) que se reemplazan en cada envío. Lo armás
con el editor drag&drop.

## F

**From (header)**
: La dirección que ve el destinatario como "de quien viene" el email. Tiene
formato `"Nombre" <email@dominio.com>`. Debe estar bajo un dominio
verificado para no ir a spam.

## H

**Handoff (a humano)**
: En un bot, el momento en que el flujo deja de responder automáticamente
y transfiere la conversación a un agente humano. Usás un **nodo de
handoff** en el editor.

**Handlebars**
: El motor de templates que usamos para variables. Sintaxis: `{{variable}}`
para insertar, `{{#if condicion}}...{{/if}}` para condicionales. Ver
[templates de email](../email/conceptos/templates-handlebars).

## I

**Inbox (WhatsApp)**
: La bandeja unificada donde tu team gestiona todas las conversaciones de
WhatsApp del número. Filtros por estado, asignaciones, búsqueda.

## L

**List-Unsubscribe**
: Header que agregamos automáticamente a cada email. Gmail/Yahoo lo usan
para mostrar el botón "Cancelar suscripción" arriba del mail. **Requerido
para envíos masivos** (Gmail/Yahoo 2024).

## M

**MAIL FROM (custom subdomain)**
: Un subdominio dedicado (ej `bounce.tu-dominio.com`) que SES usa como
remitente "técnico" de bounces y notificaciones. Mejora la deliverability
alineando SPF con DKIM. Configurable per dominio.

**Massivo**
: ¡Nosotros!

**Meta Business Account**
: La cuenta empresarial de Facebook/Instagram/WhatsApp donde Meta
administra tus apps. Vas a crear una app dentro de tu Business Account para
tu integración de WhatsApp Business.

## N

**Nodo (de flujo)**
: Cada caja en el editor de flujo del bot. Hay tipos distintos: enviar un
mensaje, hacer una pregunta, condicional, llamar a una API externa, hacer
handoff, etc.

## O

**Opt-out**
: Cuando un contacto te pide explícitamente que no le mandes más mensajes.
En email es vía "Cancelar suscripción" (incluido en el footer); en WhatsApp
es vía keywords (por defecto "BAJA", "STOP"). Lo respetamos automáticamente.

**Organización (Org)**
: El espacio top-level de tu cuenta. Contiene los teams, los dominios
verificados, los miembros, el plan. Una persona puede pertenecer a varias
organizaciones (ej. la suya y la de un cliente).

## P

**Phone Number ID (Meta)**
: Identificador único que Meta le da a tu número de WhatsApp Business. Es
distinto del número de teléfono "humano" (+54 9 11 1234-5678) — es un ID
largo numérico que usás en la API. Lo configurás en **WhatsApp → Números**.

**Plan**
: Tu nivel de servicio: Free / Starter / Business / Enterprise. Define
cuánto podés enviar por mes y cuántos recursos podés tener activos. Ver
[planes y límites](../conceptos/planes-limites-consumo).

## Q

**Quota**
: Cuánto te queda del límite del mes para una métrica (emails, mensajes
WhatsApp, dominios). Massivo aplica **corte parcial** si te pasás.

**Quick Reply (Respuesta rápida)**
: Un snippet de texto pre-armado que un agente puede insertar en el chat
con un click. Útil para FAQ o respuestas estándar. Distinto del bot — esto
es manual.

## R

**Reply-To (header)**
: El email al que se redirigen las respuestas si el destinatario hace
"Responder". Si no lo seteás, las respuestas van al **From**. Útil cuando
enviás desde `noreply@dominio.com` pero querés que las respuestas lleguen
a `info@dominio.com`.

**Report (Email)**
: El registro de un email individual dentro de una campaña. Tiene su
estado (PENDING, SENT, BOUNCED, COMPLAINED, etc.), timestamps, messageId,
y los eventos de apertura/click asociados.

**Report (WhatsApp)**
: Análogo al de email pero para WhatsApp: phone, metaMessageId, status
(SENT, DELIVERED, READ, FAILED).

## S

**SES (Simple Email Service)**
: El servicio de envío de email de AWS que usamos por debajo. Vos no
interactuás con SES directo — Massivo lo abstrae. Pero entender cosas
como sandbox / production, suppression list y configuration sets te ayuda
a diagnosticar problemas.

**SES Sandbox**
: Estado inicial de una cuenta AWS. Hasta que AWS te aprueba production
access:
  - Máx **200 emails / día**, **1 / segundo**
  - Solo podés enviar a destinatarios **previamente verificados**
  Una vez aprobado, los límites suben drásticamente.

**SMTP Account**
: La configuración de la cuenta desde la que tu campaña envía. Puede ser
un servidor SMTP genérico (tipo Gmail con app password, o servidor propio)
o AWS SES (con o sin dominio verificado vinculado).

**SPF (Sender Policy Framework)**
: Record TXT en tu dominio que lista qué servidores están autorizados a
mandar mail desde él. Para SES: `v=spf1 include:amazonses.com ~all`.

**Suppression list (lista de bloqueo)**
: Lista de direcciones que no deben recibir mails tuyos nunca más.
Massivo la mantiene automáticamente: si alguien hace unsubscribe, marca
como spam, o tiene hard bounce, va acá. Se respeta en cada envío.

## T

**Team**
: Unidad de trabajo aislada dentro de una organización. Tiene sus
propias cuentas SMTP, templates, campañas, bots, contactos. Los teams no
ven datos entre sí.

**Tracking**
: La capacidad de saber si un email fue abierto y/o clickeado. Massivo
inyecta un pixel invisible y reescribe los links del template
automáticamente para registrar los eventos.

## W

**WAPI**
: Abreviatura interna que usamos para "WhatsApp API". Vas a ver carpetas
y URLs con `wapi/` — es lo mismo que "WhatsApp".

**Webhook**
: Una URL en Massivo donde un sistema externo (Clerk, Meta, AWS SES) nos
notifica eventos. Por ejemplo, cuando un usuario nuevo se registra, Clerk
nos llama; cuando Meta entrega un mensaje, nos llama; cuando alguien hace
opt-out, SES nos llama.
