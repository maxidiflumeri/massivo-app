---
title: HTTP
sidebar_position: 8
---

# Nodo HTTP

**Dispara un request HTTP a una API externa** y guarda la respuesta en
una variable. Permite integrar tu bot con tu backend, CRM, ERP,
proveedores externos, etc.

Es **el nodo más poderoso** del bot para casos transaccionales:
consultar status de pedido, validar identidad, crear tickets, etc.

## Cuándo usarlo

- Consultar status de pedido contra tu backend
- Validar cliente contra tu CRM
- Crear ticket de soporte en Zendesk / Freshdesk
- Procesar pago / consulta de saldo
- Cualquier integración con API externa

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `method` | enum | ✅ | `GET` / `POST` / `PUT` / `PATCH` / `DELETE` |
| `url` | string | ✅ | URL absoluta. Soporta interpolación `{{x}}` y `{{= expr }}`. |
| `headers` | object | — | Headers HTTP. Values soportan interpolación. |
| `body` | any | — | JSON body. Leaf strings soportan interpolación. Se serializa para POST/PUT/PATCH. |
| `timeoutMs` | number | — | Timeout en ms. Default 5000, max 10000. |
| `saveAs` | string | ✅ | Nombre de variable donde guardar la response. |
| `mockResponse` | object | — | Solo para test mode. Forza una response sin llamar a la API. |
| `nextNodeId` | string | — | Siguiente nodo si response status es 2xx |
| `errorNodeId` | string | — | Siguiente nodo si error (network, timeout, non-2xx) |
| `gotoTopic` / `errorGotoTopic` | string | — | Alternativas a los nextNodeId |

## Ejemplo: consultar status de pedido

```yaml
nodes:
  pedir_pedido_id:
    kind: CAPTURE
    text: "¿Cuál es tu número de pedido?"
    saveAs: pedidoId
    validate:
      kind: regex
      pattern: "^\\d+$"
    nextNodeId: consultar
    retryNodeId: id_invalido

  consultar:
    kind: HTTP
    method: GET
    url: "https://api.empresa.com/pedidos/{{pedidoId}}"
    headers:
      Authorization: "Bearer {{= apiToken }}"
      Accept: "application/json"
    timeoutMs: 5000
    saveAs: pedido
    nextNodeId: mostrar_status
    errorNodeId: error_consulta

  mostrar_status:
    kind: MESSAGE
    text: |
      Tu pedido #{{pedidoId}}:

      📦 Estado: {{= pedido.status }}
      🚚 Tracking: {{= pedido.tracking}}
      📅 Llegada estimada: {{= pedido.deliveryDate}}

  error_consulta:
    kind: HANDOFF
    text: "No pudimos consultar tu pedido en este momento. Te pasamos con un agente."
```

## El campo `saveAs`

La response de la API se guarda en la variable nombrada en `saveAs`.

**Lo que se guarda**:

- Si la response es JSON (Content-Type `application/json`): el objeto
  parseado
- Si es texto plano: el string
- Si está vacía (204): `null`

Después accedés a campos del JSON con notación de paths:

```
{{pedido.status}}           → response.status
{{pedido.cliente.nombre}}   → response.cliente.nombre
{{= pedido.items[0].sku }}  → response.items[0].sku
```

## Interpolación en url, headers, body

### URL

```yaml
url: "https://api.empresa.com/cliente/{{dni}}/saldo"
url: "https://api.empresa.com/q?email={{= $encodeUriComponent(email)}}"
```

### Headers

```yaml
headers:
  Authorization: "Bearer {{apiToken}}"
  X-Request-Id: "{{conversation.id}}-{{= $now() }}"
  Content-Type: "application/json"   # Auto-completado si tenés body JSON
```

### Body

Para `POST`/`PUT`/`PATCH`:

```yaml
body:
  cliente:
    dni: "{{dni}}"
    nombre: "{{nombre}}"
  monto: "{{= monto * 1.21 }}"
  notas: "Solicitado vía bot"
```

Massivo serializa esto a JSON, interpola las strings, y manda. Auto-
agrega `Content-Type: application/json` si no lo pusiste vos.

## Manejo de errores

| Tipo de error | Resultado |
|---|---|
| **Network error** (DNS, conexión) | va a `errorNodeId` |
| **Timeout** | va a `errorNodeId` |
| **Status 2xx** (200, 201, 204, etc.) | va a `nextNodeId`, response en `saveAs` |
| **Status 3xx** (redirects) | Massivo sigue redirects automáticamente |
| **Status 4xx / 5xx** | va a `errorNodeId`. Response del error queda en `saveAs` por si querés mostrarla |

### Patrón típico de error handling

```
HTTP → nextNodeId: ok
     → errorNodeId: fallo

ok:    MESSAGE con datos de la response
fallo: MESSAGE genérico ("algo salió mal") o HANDOFF
```

Para distinguir tipos de error fino, usá CONDITION después del
errorNodeId que ramifique según `{{= response.status }}` o similar.

## Timeout

Por defecto 5 segundos. Máximo 10 segundos.

Si tu API es **lenta** (>10s), HTTP no es la herramienta — considerá:

- Optimizar tu API
- Usar webhook patterns (HTTP dispara la operación async, otro
  webhook notifica al bot cuando termina)
- Si es para mostrar un status que llega lento: el bot puede pedirle
  al usuario que vuelva más tarde

## Seguridad — SSRF guard

Massivo bloquea requests HTTP hacia:

- IPs **private** (10.x, 192.168.x, 172.16-31.x)
- IPs **loopback** (127.x, ::1)
- IPs **link-local** (169.254.x)
- Hostnames internos sin TLD (`http://internal`, `http://localhost`)

Esto previene SSRF — un atacante no puede usar tu bot para escanear
tu red interna.

**Workaround si necesitás llamar a un servicio interno**: exponelo
públicamente con auth fuerte, o usá un reverse proxy con dominio
público.

## Max response size

Massivo descarga **máximo 1MB de response**. Si tu API devuelve más,
se trunca y queda como string parcial.

Si necesitás manejar responses grandes, **filtralas en la URL** con
query params, o pediles a tu API que devuelva un summary.

## Mock para test mode

Si la WapiConfig tiene **test mode** activo, podés forzar una response
sin llamar realmente a la API:

```yaml
kind: HTTP
url: "https://api.empresa.com/cliente/{{dni}}"
saveAs: cliente
mockResponse:
  status: 200
  body:
    nombre: "Cliente Test"
    saldo: 5000
    activo: true
nextNodeId: continuar
errorNodeId: fallo
```

En test mode, Massivo no llama a la API — usa el `mockResponse`
directamente. Útil para probar el flow sin generar tráfico real ni
necesitar la API live.

En modo producción, `mockResponse` se ignora.

## Casos de uso comunes

### GET — consultar datos

```yaml
method: GET
url: "https://api.empresa.com/pedidos/{{pedidoId}}"
saveAs: pedido
```

### POST — crear recurso

```yaml
method: POST
url: "https://api.crm.com/leads"
body:
  email: "{{email}}"
  source: "bot_whatsapp"
  campaign: "{{campaign}}"
saveAs: leadCreado
```

### PATCH — update

```yaml
method: PATCH
url: "https://api.empresa.com/pedidos/{{pedidoId}}"
body:
  status: "CONFIRMED"
saveAs: pedido
```

### DELETE — borrar

```yaml
method: DELETE
url: "https://api.empresa.com/turnos/{{turnoId}}"
saveAs: respuestaBorrado
```

## Buenas prácticas

### Usá `errorNodeId` siempre

No dejes el error como "no manejado". Si tu API falla, el flow se
queda colgado y el contacto no sabe qué hacer.

### Timeout corto, retry en el flow

5 segundos es el sweet spot. Si necesitás más para casos lentos,
considerá:

```
[HTTP timeout 5s]
  ├── nextNodeId: ok
  └── errorNodeId: reintentar

[CONDITION: ¿es timeout o error real?]
  ├── timeout → [SET_VAR intentos++] → [HTTP de nuevo]
  └── error real → [HANDOFF]
```

### Headers de auth: rotá tokens

No hardcodees tokens de API en `headers` con valor literal. Mejor:

- Guardalos en variables de la sesión seteadas en SET_VAR al inicio
- O en una variable declarativa con default

Así cuando rotás el token, solo cambiás un lugar.

### Logs estructurados

En el panel de detalle del bot vas a ver, por cada ejecución de HTTP:

- URL llamada (con variables resueltas)
- Status response
- Tiempo de respuesta
- Si fue ok / error / timeout

Útil para diagnosticar problemas en producción.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "URL not allowed" | SSRF guard detectó IP privada | Usá URL pública |
| Timeout sistemático | Tu API es lenta | Optimizá o cambiá patrón |
| `response.campo` aparece como `undefined` | El JSON path no existe | Verificá el shape de la response con un MESSAGE de debug |
| Token caducó pero no actualizaste | Token hardcodeado | Movelo a variable |
| Error 4xx pero no entiendo cuál | El error response queda en `saveAs` | Loggealo con un MESSAGE: `{{= $string(response) }}` |

## Próximos pasos

- 🎬 [MEDIA_FROM_URL](./media#media_from_url) — variante para descargar
  y mandar archivos
- 🛡️ [SET_VAR](./set-var) — para procesar la response antes de usarla
- 🔄 [FOREACH](./foreach) — para iterar arrays devueltos por la API
