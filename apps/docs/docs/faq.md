---
title: Preguntas frecuentes (FAQ)
sidebar_position: 99
---

# Preguntas frecuentes

Lista de preguntas que nos hacen todo el tiempo, agrupadas por tema.
Si tu duda no está acá, escribinos a
[hola@massivo.app](mailto:hola@massivo.app).

## General

### ¿Qué es Massivo?

Una plataforma para mandar **campañas masivas de email y WhatsApp**
y gestionar **conversaciones con bots** + agentes humanos en un solo
panel. Pensada para PyMEs y agencias.

Ver [¿Qué es Massivo?](./empezar/que-es-massivo) para detalle.

### ¿En qué se diferencia de Mailchimp / SendGrid / Twilio?

| | Massivo | Mailchimp / SendGrid | Twilio / 360Dialog |
|---|---|---|---|
| Email | ✅ | ✅ | ❌ |
| WhatsApp | ✅ (oficial) | ❌ | ✅ |
| Bots | ✅ | ❌ | Limitado |
| Markup sobre Meta | ❌ | N/A | ✅ (20-50%) |
| Multi-canal en un solo lugar | ✅ | ❌ | ❌ |
| Foco | PyMEs / agencias LATAM | Email B2C grande | Volumen empresarial |

### ¿Mi cliente paga directo a Meta?

Sí. Los **mensajes de WhatsApp se cobran de Meta a vos directo** — no
hay markup de nuestra parte. Esto es una ventaja vs. plataformas tipo
Twilio que te suben 20-50% sobre el precio de Meta.

Massivo solo cobra por la **plataforma** (panel, multi-team, bots,
soporte, infra).

### ¿Está disponible en mi idioma?

El panel y las docs están en **español**. Próximamente vamos a sumar
**inglés** y **portugués**. Si tu equipo necesita otro idioma,
escribinos.

### ¿Hay app móvil?

No por ahora. El panel funciona bien en **mobile browser** pero no
hay app nativa. Está en roadmap.

## Onboarding y configuración

### ¿Cuánto tarda el setup completo?

Depende de:

- **Verificación de dominio email**: 1-2 horas (DNS + verificación SES)
- **Configuración WhatsApp**: 1-3 días (Meta Business setup +
  verificación) — la mayor parte espera a Meta
- **Primer template aprobado**: 1-24 horas (Meta lo aprueba)
- **Primer bot armado**: 1-3 días según complejidad

**Total realista**: 1 semana hábil para tener todo armado y haber
mandado tu primera campaña.

### ¿Necesito que un developer me ayude?

**Para el setup básico**: no, todo es UI. Vos podés configurar el
dominio, las cuentas SMTP, templates, campañas, contactos.

**Si vas a usar el bot con HTTP nodes** (integrando tu API): sí,
necesitás un developer que te de el endpoint y te ayude a configurar
los headers/body.

### ¿Funciona si solo quiero email, sin WhatsApp?

Sí. Podés usar **solo email** sin tocar nada de WhatsApp. La sidebar
muestra ambas secciones pero las features son independientes.

### ¿Y si solo quiero WhatsApp?

También. Idem.

## Email

### ¿Por qué mis mails caen en spam?

Razones típicas:

1. **Dominio no verificado** (DKIM/SPF/DMARC). Ver
   [dominios verificados](./email/conceptos/dominios-verificados).
2. **From con dominio raro** (gmail / hotmail / personal). Usá
   dominio corporativo.
3. **Subject "salesy"** (todo en mayúsculas, mucho emoji, "GRATIS!!!").
4. **Imagen sin texto** (clientes anti-spam lo detectan).
5. **Sin texto-plain version** (Massivo lo agrega auto, pero algunos
   clientes nuevos custom no).
6. **Mala reputación de IP / dominio** — pasó tiempo enviando mal
   antes.

### ¿Cuánto tarda en verificar el dominio?

5-30 min en el caso normal. Hasta 1-4 horas si hay cache de NXDOMAIN
(ver workaround en [agregar dominio](./email/agregar-dominio)).

### ¿Puedo usar mi servidor SMTP propio en vez de SES?

Sí. Al crear la cuenta SMTP elegís **provider: SMTP** y poniendo host,
puerto, usuario, password.

Caveats:

- Tu servidor SMTP tiene que **permitir relay autenticado**
- Si tu provider SMTP es Gmail / Outlook personal, tenés **límite muy
  bajo** (~500/día)
- Para volumen serio recomendamos **SES con dominio verificado**

### ¿Qué pasa si mi cuenta SMTP queda inactiva?

Massivo te marca la cuenta como **Inactiva** y las campañas que la
usan no pueden enviar. Causas:

- Password rotó y no la actualizaste
- IP del SMTP server bloqueada
- Server caído

Click **"Verificar"** en la cuenta para reintentar el handshake.

### ¿Los emails se trackean siempre?

Sí, por default. Tracking de opens (pixel) + clicks (link rewriting).
Hoy no se puede desactivar. Si tu caso requiere "no tracking" por
compliance, escribinos.

### ¿Puedo programar un envío?

Sí. Al crear la campaña, setealo en "Programada para" con fecha y hora
futura. Un scheduler interno la dispara en el momento.

### ¿Y si Meta cambia los precios de WhatsApp?

Eso le pasa a vos directamente con Meta, no con nosotros. Nuestro
precio de plataforma no se afecta.

## WhatsApp

### ¿Por qué Meta me pide tantos pasos para empezar?

Porque la API de WhatsApp Business **NO ES PARA CUALQUIER COSA**:
Meta filtra muy fuerte para que solo empresas legítimas la usen.

Pasos típicos:

1. Verificar tu Meta Business Account (puede tardar días)
2. Crear la App
3. Registrar tu número en WhatsApp Business API (no normal)
4. Generar System User + access token

Es tedioso pero **una vez por número**.

### ¿Puedo usar un número que ya tengo en WhatsApp normal?

**No directamente.** Si el número está en WhatsApp normal o en
WhatsApp Business app, **primero tenés que darlo de baja** de ese
canal antes de registrarlo en la API.

Una vez en la API, no podés volver a usarlo en WhatsApp normal. Es
uno o el otro.

### ¿Cuál es el costo por mensaje?

Meta te cobra por **conversación** (24h), no por mensaje individual.
Tarifa depende de:

- **Quién la inició** (usuario más barato que empresa)
- **Categoría** (marketing más caro que utility)
- **País del destinatario**

Para tarifas exactas:
[Meta pricing docs](https://developers.facebook.com/docs/whatsapp/pricing).

### ¿Mi cliente final puede contestarme gratis?

Sí. Si **el usuario te escribe primero**, las primeras 1.000
conversaciones mensuales que **vos respondés** son **gratis** (servicio
de Meta).

### ¿Por qué mi template no se aprueba?

Razones comunes:

- **Categoría mal** (marcaste utility pero es marketing)
- **Wording promocional sin ser MARKETING**
- **Variables mal puestas**
- **Demasiado spam-y** (mucho emoji, gritos)

Ver motivos completos en
[Templates aprobados](./whatsapp/conceptos/templates-aprobados).

### ¿Puedo mandar mensajes a quien quiera?

**NO**, dos restricciones:

1. **24h window**: solo mensajes libres a quien te escribió hace
   menos de 24h
2. **Marketing templates**: necesitan opt-in previo del contacto (no
   podés comprar lista y mandar)

Ver [24h window](./whatsapp/conceptos/24h-window).

### ¿Qué pasa si mi quality score baja?

Meta limita tu tasa de envío y eventualmente te suspende. Para
prevenir:

- Respetá opt-outs
- No mandes a contactos que no quieren saber de vos
- Targetá bien tus templates

Si te suspendieron, **pausá envíos, mejorá targeting, esperá días**.

## Bots

### ¿El bot necesita programación?

**Para flujos básicos** (FAQ, menús, captura): no. Es drag&drop
visual.

**Para integraciones con tu backend** (HTTP nodes que llaman a tu API):
necesitás que tu developer te de el endpoint y los headers.

### ¿Puedo tener varios bots por número?

No directamente. Cada WapiConfig (número Meta) tiene **un bot
asignado**. Pero ese bot puede tener **múltiples topics** que se
comportan como bots distintos.

Ver [multi-tema y router](./bots/conceptos/multi-tema-router).

### ¿El bot puede iniciar conversación?

Indirectamente sí — mandás un **template aprobado** con quick reply
buttons, y cuando el contacto los toca, el router del bot capta el
payload y arranca un flow.

Ver [receta: recordatorio post-venta](./bots/recetas/recordatorio-postventa).

### ¿Cuándo el bot pasa la conversación al humano?

Cuando un nodo **HANDOFF** se ejecuta, o un agente pide
**take-over manual** desde el inbox.

Ver [bot vs humano](./bots/conceptos/cuando-bot-vs-humano).

### ¿El bot puede entender lenguaje natural / NLP?

Hoy **no nativo**. El matching es por keyword exact (en MENU options
y router) o por regex (en CONDITION).

Para NLP avanzado, integrás vía **nodo HTTP** llamando a OpenAI /
Anthropic / Dialogflow:

```yaml
nodo:
  kind: HTTP
  url: "https://api.openai.com/v1/chat/completions"
  body:
    model: "gpt-4"
    messages:
      - role: "system"
        content: "Sos un asistente de soporte..."
      - role: "user"
        content: "{{mensajeUsuario}}"
```

Y el resultado lo usás para ramificar.

### ¿Cuántas conversaciones simultáneas puede manejar un bot?

Hoy decenas de miles concurrentes (limitado por la infra del backend
y por rate limits de Meta).

### ¿Cuándo se "pierde" una sesión del bot?

Cuando pasan más de **30 min sin nuevo inbound del contacto** (TTL
configurable per WapiConfig). Al expirar, la próxima vez que el
contacto escriba arranca una sesión nueva.

## Contactos

### ¿Tengo que limpiar mi base periódicamente?

Sí, recomendamos cada 3-6 meses:

- Borrar contactos sin engagement en 6+ meses
- Mergear duplicados pendientes
- Sacar suppressions viejas dudosas

Base saludable = mejor deliverability.

### ¿Puedo importar la base de mi CRM directamente?

Sí — exportás CSV de tu CRM y lo importás en Massivo. Es manual hoy.

Próximamente: **integraciones nativas** con HubSpot, Pipedrive, Zoho.

### ¿Los contactos se sincronizan entre teams?

No — los contactos viven a nivel team. Para compartir, exportás de
uno y importás en el otro.

### ¿Puedo borrar todos los contactos masivamente?

Sí desde el listado: seleccionás "todos los que matchean" → Borrar.

**Cuidado**: es destructivo. Hacé export antes como backup.

## Compliance / legal

### ¿Massivo cumple GDPR?

Sí en cuanto a las herramientas que damos (opt-out, audit log,
suppression list, derecho al borrado). El **uso correcto es
responsabilidad tuya**:

- Vos tenés que asegurar el consentimiento previo de los contactos
- Vos tenés que respetar pedidos de borrado de datos personales
- Vos sos el **data controller**, nosotros somos **data processor**

### ¿Mis datos son míos?

Sí. **Vos sos dueño de tus datos**:

- Contactos
- Templates
- Historial de campañas
- Audit log
- Configuración

Podés exportar en cualquier momento. Si nos vas, te llevás tu base.

### ¿Pueden ver mis contactos / datos los empleados de Massivo?

**No por default.** Solo si nos pedís soporte y autorizás acceso
explícito a un caso específico.

### ¿Dónde se hostean los datos?

AWS — región **us-east-1** (Virginia, USA). Si necesitás datos en otra
región por compliance específico, escribinos.

## Pricing / billing

### ¿Cuándo arranca el cobro?

Estamos en programa beta. Vamos a anunciar fechas con anticipación.
Hoy no se está cobrando.

### ¿Hay descuento por pago anual?

Planeamos ~15-20% de descuento anual cuando arranque el cobro.

### ¿Puedo bajar de plan en cualquier momento?

Sí — aplicará al final del ciclo en curso (no te re-cobramos lo
prorrateado).

### ¿Hay free trial?

El plan **Free** funciona como trial — es realmente gratis con
límites bajos. No hay límite de tiempo.

## Soporte

### ¿Cómo pido ayuda?

- **Email**: [hola@massivo.app](mailto:hola@massivo.app)
- **WhatsApp** (próximamente): número de soporte

Tiempo de respuesta según plan:

- Free / Starter: 48 hs en días hábiles
- Business: 24 hs
- Enterprise: 4 hs (incluyendo fines de semana)

### ¿Cuándo respondemos los fines de semana?

Para clientes Enterprise (24/7). Para el resto, días hábiles.

### ¿Hay status page?

Sí: [status.massivo.app](https://status.massivo.app) (próximamente).
Te avisa de incidentes, maintenances, etc.

### ¿Cómo reporto un bug?

- **Reproducible**: pasos para reproducir + screenshots
- **Quién**: tu nombre + organización
- **Cuándo**: timestamp aproximado
- **IDs**: si tenés IDs de campañas, contactos, etc., dale

Esto nos permite encontrar el problema rápido en logs.

## ¿No está tu pregunta?

Escribinos: [hola@massivo.app](mailto:hola@massivo.app)

Si es útil para más gente, la sumamos a este FAQ.
