---
title: 'Receta: Recordatorio post-venta'
sidebar_position: 3
---

# Receta: Recordatorio post-venta

Bot que **inicia conversación con el cliente** después de una compra
(o cualquier evento) usando un template aprobado, y ofrece opciones
de seguimiento.

A diferencia de las recetas anteriores que **responden** a mensajes
del cliente, esta **inicia** la conversación desde el backend.

## Para qué sirve

- Confirmar entrega: "¿Recibiste tu pedido?"
- Post-venta: "¿Cómo te fue con el producto?"
- Re-engagement: "Hace tiempo que no nos vemos, ¿algo nuevo?"
- Recordatorios: "Tu turno es mañana, ¿confirmás?"
- Renovaciones: "Tu suscripción vence en 7 días"

## Cómo se inicia desde el backend

Tu sistema (el ERP, el CRM, una scheduled task) llama a la API de
Massivo:

```http
POST https://api.massivo.app/api/wapi/campaigns
{
  "name": "Recordatorio entrega - junio",
  "templateId": "template_recordatorio_entrega_v2",
  "configId": "config_id_de_tu_numero",
  "contacts": [
    {
      "phone": "+5491112345678",
      "data": {
        "nombre": "Juan",
        "pedidoId": "12345",
        "fecha": "2026-06-15"
      }
    }
  ]
}
```

Massivo envía el template aprobado a cada contacto con sus variables
resueltas. Cuando el contacto **responde clickeando un botón** del
template, el router del bot lo capta y entra al flow apropiado.

## El template de WhatsApp

Necesitás un template aprobado con **buttons de Quick Reply** que
envíen payload reconocibles por el router.

Ejemplo de template:

```
Template: "recordatorio_entrega_v2"
Categoria: UTILITY
Idioma: es

Body:
  ¡Hola {{1}}! Tu pedido #{{2}} llega mañana ({{3}}).

  ¿Lo confirmás?

Buttons:
  - Quick Reply: "✅ Confirmar"     payload: "delivery_confirm_{{2}}"
  - Quick Reply: "📅 Reprogramar"   payload: "delivery_reschedule_{{2}}"
  - Quick Reply: "❌ Cancelar"      payload: "delivery_cancel_{{2}}"
```

Cuando enviás la campaña, Meta reemplaza:

- `{{1}}` → "Juan" (nombre)
- `{{2}}` → "12345" (pedidoId)
- `{{3}}` → "lunes 17/6" (fecha)

Y los payloads de los botones quedan como:

- `delivery_confirm_12345`
- `delivery_reschedule_12345`
- `delivery_cancel_12345`

## El bot que procesa las respuestas

El router del bot debe matchear los payloads y entrar al topic
correspondiente:

```yaml
router:
  - kind: template-payload
    pattern: "^delivery_confirm_(?<pedidoId>\\d+)$"
    topic: confirmar_entrega
  - kind: template-payload
    pattern: "^delivery_reschedule_(?<pedidoId>\\d+)$"
    topic: reprogramar
  - kind: template-payload
    pattern: "^delivery_cancel_(?<pedidoId>\\d+)$"
    topic: cancelar_entrega
  - kind: default
    topic: default
```

Las **named groups** (`(?<pedidoId>...)`) **se inyectan como variables
de la sesión** — el bot tiene acceso a `pedidoId` aunque no lo
capturó explícitamente.

### Topic: confirmar_entrega

```yaml
topics:
  - id: confirmar_entrega
    flow:
      startNodeId: actualizar
      nodes:
        actualizar:
          kind: HTTP
          method: PATCH
          url: "https://api.empresa.com/pedidos/{{pedidoId}}/confirmar"
          headers:
            Authorization: "Bearer {{apiToken}}"
          body:
            confirmadoVia: "whatsapp_bot"
            timestamp: "{{= $now() }}"
          saveAs: respConfirmacion
          nextNodeId: agradecer
          errorNodeId: error_confirmacion

        agradecer:
          kind: MESSAGE
          text: |
            ¡Perfecto! Tu confirmación quedó registrada.

            Te esperamos mañana para la entrega 📦
            Si necesitás algo más, escribime.

        error_confirmacion:
          kind: HANDOFF
          text: |
            Hubo un problema confirmando tu entrega. Te paso con un
            agente para que lo resuelva en el momento.

            Pedido: #{{pedidoId}}
          escalate: true
```

### Topic: reprogramar

```yaml
  - id: reprogramar
    flow:
      startNodeId: pedir_fecha
      nodes:
        pedir_fecha:
          kind: CAPTURE
          text: "Dale, ¿para cuándo querés reprogramar la entrega?"
          saveAs: nuevaFecha
          nextNodeId: confirmar_fecha

        confirmar_fecha:
          kind: MENU
          text: "Confirmás reprogramar tu pedido #{{pedidoId}} para {{nuevaFecha}}?"
          options:
            - label: "Sí, confirmar"
              nextNodeId: reprogramar_api
            - label: "Cambiar fecha"
              nextNodeId: pedir_fecha
            - label: "Cancelar todo"
              nextNodeId: handoff_reprog

        reprogramar_api:
          kind: HTTP
          method: PATCH
          url: "https://api.empresa.com/pedidos/{{pedidoId}}/reprogramar"
          headers:
            Authorization: "Bearer {{apiToken}}"
          body:
            nuevaFecha: "{{nuevaFecha}}"
          saveAs: respReprog
          nextNodeId: ok_reprogramado
          errorNodeId: handoff_reprog

        ok_reprogramado:
          kind: MESSAGE
          text: "Listo! Reprogramamos para {{nuevaFecha}}. Te confirmamos por acá cuando salga 🚚"

        handoff_reprog:
          kind: HANDOFF
          text: |
            Para reprogramar te paso con logística.

            Pedido #{{pedidoId}} — nueva fecha solicitada: {{nuevaFecha}}
          escalate: true
```

### Topic: cancelar_entrega

```yaml
  - id: cancelar_entrega
    flow:
      startNodeId: confirmar_cancelar
      nodes:
        confirmar_cancelar:
          kind: MENU
          text: |
            ¿Estás seguro que querés cancelar la entrega de tu pedido
            #{{pedidoId}}?

            Esta acción no se puede deshacer.
          options:
            - label: "Sí, cancelar"
              nextNodeId: cancelar_api
            - label: "No, mejor confirmar"
              gotoTopic: confirmar_entrega

        cancelar_api:
          kind: HTTP
          method: PATCH
          url: "https://api.empresa.com/pedidos/{{pedidoId}}/cancelar"
          headers:
            Authorization: "Bearer {{apiToken}}"
          body:
            motivo: "cancelacion_por_cliente_via_bot"
          saveAs: respCancel
          nextNodeId: ok_cancelado
          errorNodeId: handoff_cancel

        ok_cancelado:
          kind: MESSAGE
          text: |
            Tu pedido #{{pedidoId}} quedó cancelado.

            En 5-7 días hábiles vas a tener el reintegro en tu medio de
            pago original. Cualquier consulta, escribinos.

        handoff_cancel:
          kind: HANDOFF
          text: |
            Te paso con un agente para resolver tu cancelación.

            Pedido #{{pedidoId}}
          escalate: true
```

### Topic: default

```yaml
  - id: default
    flow:
      startNodeId: bienvenida
      nodes:
        bienvenida:
          kind: MESSAGE
          text: |
            ¡Hola! Soy el asistente de ACME.

            Para hablar con un agente, escribí "soporte".
          # Sin nextNodeId → cierra
```

Catch-all para cuando un cliente escribe sin haber recibido el
template (porque siempre puede pasar).

## Métricas / monitoreo

Cuando mandás 1000 templates con esos botones, esperás ver:

- **Tasa de respuesta** (clicks en botones): 30-60% en utility templates
- **Distribución**: si la mayoría confirma, el flow está bien diseñado;
  si la mayoría cancela, hay algo de fondo (mala UX, mal targeting)
- **Errores en HTTP**: si tu API falla más del 5%, los clientes terminan
  en HANDOFF — atención

## Variantes

### Re-engagement con períodos largos

Mismo patrón pero el trigger es "cliente no compró en 90 días":

```
Template: "te_extranamos_v1"
Body: "¡Hola {{1}}! Hace tiempo no te vemos. ¿Querés que te
       contemos las novedades?"
Buttons:
  - "Sí, mostrame" → payload: "reengagement_yes_{{customer_id}}"
  - "No por ahora" → payload: "reengagement_no_{{customer_id}}"
```

El bot procesa: si dice sí → muestra catalogo via FOREACH; si dice no
→ registra preferencia y agradece.

### Confirmar turno médico / servicio

```
Template: "confirmacion_turno_v1"
Body: "Tu turno con Dr. {{1}} es mañana a las {{2}}.
       ¿Asistís?"
Buttons:
  - "Sí, asisto" → confirma en API, recordatorio cierre
  - "Reprogramar" → flow para elegir nuevo turno
  - "Cancelar" → libera el espacio
```

### Encuesta post-servicio (NPS-like)

```
Template: "encuesta_servicio_v1"
Body: "¡Hola! ¿Cómo te fue con el servicio?"
Buttons:
  - "👍 Genial" → mensaje agradecimiento + pedir review en Google
  - "😐 OK" → MENU detalle: "¿qué podríamos mejorar?"
  - "👎 Mal" → HANDOFF al equipo de calidad
```

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| El botón del template no activa el topic correcto | Pattern del router mal escrito | Probar el regex en https://regex101.com |
| Variables del named group no existen en el topic | Sintaxis incorrecta del named group | Usar `(?<varName>...)` exacto |
| El cliente responde con texto libre y no entra a ningún topic | El topic default no está bien configurado | Asegurate de tener un `kind: default` al final |
| Template enviado pero el cliente no recibe | Calidad del número baja + categoría marketing | Verificá quality score; usar UTILITY si aplica |

## Próximos pasos

- 🎯 [Receta: Captura de lead](./capturar-lead)
- 🆘 [Receta: FAQ con handoff](./faq-con-handoff)
- 📨 [Crear campaña de WhatsApp](../../whatsapp/crear-campana) — el
  trigger que dispara el template
