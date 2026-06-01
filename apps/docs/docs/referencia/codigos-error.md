---
title: Códigos de error
sidebar_position: 2
---

# Códigos de error — referencia

Lista de **códigos de error** que podés ver en el panel, en reports
de campañas, en webhooks, y en respuestas de la API.

Para cada uno: qué significa, cuándo aparece, y cómo arreglarlo.

## Errores de Massivo (interno)

Códigos que generamos nosotros, no Meta ni AWS.

### `quota-exceeded:plan-<CODE>`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport / WapiReport con status CANCELED |
| Significa | Excediste el límite mensual de tu plan |
| Solución | Esperá al reset del mes o subí de plan |

Ejemplo: `quota-exceeded:plan-FREE` — pasaste los 1.000 emails/mes del
plan Free.

### `suppressed:<reason>`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport con status SUPPRESSED |
| Significa | El destinatario estaba en la suppression list |
| Solución | Es esperado — no enviamos a opt-outs |

Razones posibles:

- `suppressed:hard-bounce`
- `suppressed:complaint`
- `suppressed:unsubscribe-campaign`
- `suppressed:unsubscribe-team`
- `suppressed:manual`

### `opted-out:<scope>`

| Campo | Valor |
|---|---|
| Aparece en | WapiReport con status CANCELED |
| Significa | El contacto está opt-out en WhatsApp |
| Solución | Esperado — no le mandamos |

Scopes: `opted-out:team`, `opted-out:config`.

### `campaign-closed`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport / WapiReport con status CANCELED |
| Significa | La campaña fue force-closed mientras este report estaba pending |
| Solución | Esperado — vos forzaste el cierre |

### `tenant-mismatch`

| Campo | Valor |
|---|---|
| Aparece en | API responses (HTTP 403) |
| Significa | Intentaste acceder a un recurso que no pertenece a tu team |
| Solución | Confirmá que estás en el team correcto |

### `validation-failed`

| Campo | Valor |
|---|---|
| Aparece en | API responses (HTTP 400) |
| Significa | DTOs validation failed — body mal formateado |
| Solución | Revisá el shape del request contra la API docs |

## Errores de AWS SES (email)

### `MessageRejected`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport con status FAILED |
| Significa | SES rechazó el mensaje |
| Solución | Revisá motivo en el detalle del report |

Sub-motivos:

- `Email address is not verified` — destinatario no verificado en
  sandbox. Verificalo o pedí prod access.
- `Configuration set does not exist` — bug interno, escribinos.
- `Account is throttled` — pasaste el send rate. Esperá.

### `MailFromDomainNotVerified`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport FAILED |
| Significa | Tu dominio MAIL FROM no está verificado en SES |
| Solución | Verificá el dominio en SES — ver [agregar dominio](../email/agregar-dominio) |

### `SendingPausedException`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport FAILED |
| Significa | SES pausó tu envío por baja reputación |
| Solución | URGENTE — revisá bounce / complaint rate, limpiá base, contactá soporte SES |

### `ConfigurationSetSendingPausedException`

| Campo | Valor |
|---|---|
| Aparece en | EmailReport FAILED |
| Significa | El configuration set específico está pausado |
| Solución | Similar al anterior pero scoped al team |

## Errores de Meta WhatsApp Business API

Los códigos son numéricos. Lista de los más comunes:

### `131008` — Required parameter missing

| Aparece en | WapiReport FAILED |
| Significa | Tu CSV tenía contactos sin valor para alguna variable obligatoria del template |
| Solución | Llenar las variables faltantes en tu CSV |

### `131009` — Parameter format mismatch

| Aparece en | WapiReport FAILED |
| Significa | Una variable tiene formato distinto al esperado por el template aprobado |
| Solución | Confirmá tipos (string vs number) |

### `131026` — Receiver is incapable

| Aparece en | WapiReport FAILED |
| Significa | El destinatario no puede recibir (sin WhatsApp instalado, número inválido) |
| Solución | Limpiá tu base — borrá ese número |

### `131047` — Re-engagement window expired

| Aparece en | WapiReport FAILED |
| Significa | Mandaste mensaje libre fuera del 24h window |
| Solución | Usá template aprobado |

### `131048` — Spam rate limit

| Aparece en | WapiReport FAILED |
| Significa | Tu número está con quality LOW y Meta limita |
| Solución | Pausá envío, mejorá targeting, esperá días para que suba quality |

### `131056` — Pair rate limit

| Aparece en | WapiReport FAILED, retry-able |
| Significa | Demasiados mensajes entre vos y ese contacto |
| Solución | Espaciá envíos — Massivo retries automáticamente con backoff |

### `132000` — Template paused

| Aparece en | WapiReport FAILED |
| Significa | El template que usaste fue pausado por Meta por calidad |
| Solución | Usá otro template o esperá que vuelva a APPROVED |

### `132001` — Template disabled

| Aparece en | WapiReport FAILED |
| Significa | Template fue deshabilitado |
| Solución | Crear uno nuevo |

### `133006` — Phone number not registered

| Aparece en | WapiReport FAILED |
| Significa | Tu número Meta no está bien registrado o config rota |
| Solución | Re-verificá en Meta Console |

## Errores de DNS / dominios

### `NXDOMAIN`

| Significa | El DNS no tiene record para el nombre buscado |
| Cuándo | Verificación de DKIM/SPF/DMARC, cuando los records no propagaron |
| Solución | Agregar / corregir record en tu DNS provider |

### `TEMPORARY_FAILURE`

| Aparece en | EmailDomain status |
| Significa | DNS lookup falló transitoriamente (timeout, server caído) |
| Solución | Esperar — el poller reintenta cada 5 min |

### Cache NXDOMAIN

No es un código específico pero un caso conocido:

| Cuándo | Después de agregar records DKIM, SES sigue diciendo PENDING |
| Causa | SES cacheó el "no existe" del primer lookup |
| Solución | Borrá y re-creá la identity en Massivo |

Ver [agregar dominio → workaround NXDOMAIN](../email/agregar-dominio).

## Errores HTTP de la API de Massivo

### `400 Bad Request`

| Significa | Request mal formateado |
| Causa típica | Validation error (campos requeridos, tipos mal) |
| Body | `{ "statusCode": 400, "message": [...] }` |

### `401 Unauthorized`

| Significa | Token de Clerk inválido o expirado |
| Solución | Re-loguearte |

### `403 Forbidden`

| Significa | Tenés sesión pero no permisos para esta acción |
| Causa típica | Rol insuficiente, tenant mismatch |
| Solución | Pedí a un OWNER que te cambie de rol, o cambiá al team correcto |

### `404 Not Found`

| Significa | El recurso no existe en tu scope |
| Causa típica | URL mal, o el recurso pertenece a otro team |
| Solución | Verificá ID y team activo |

### `409 Conflict`

| Significa | El estado del recurso no permite esta acción |
| Causa típica | Editar campaña en PROCESSING, agregar contacto a campaña enviada |
| Solución | Pausar / cancelar antes de editar |

### `429 Too Many Requests`

| Significa | Rate limit propio de Massivo |
| Causa típica | Loop infinito desde tu side |
| Solución | Backoff exponencial |

### `500 Internal Server Error`

| Significa | Bug nuestro |
| Solución | Escribinos a [hola@massivo.app](mailto:hola@massivo.app) con el ID del request si lo tenés |

## Logs y diagnóstico

Para investigar un error específico:

1. **El detalle del report** (Email / WhatsApp report individual) tiene
   el error completo + timestamp
2. **El audit log** tiene los eventos relacionados
3. **Si pedís soporte**, mandanos:
   - Screenshot del error
   - ID del recurso (campaña, contacto, etc.)
   - Cuándo pasó (timestamp aproximado)
   - Qué hacías cuando pasó

Eso nos permite buscar rápido en nuestros logs internos.
