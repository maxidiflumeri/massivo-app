---
title: 'Receta: FAQ con escalamiento'
sidebar_position: 2
---

# Receta: FAQ con escalamiento

Bot de **preguntas frecuentes** que responde automáticamente lo común
y deriva a humano cuando la pregunta no está cubierta.

Ideal para reducir el volumen de tickets simples del equipo de soporte.

## Para qué sirve

- Responder al 70-80% de las consultas con FAQ automáticas
- El otro 20-30% va a humano con contexto
- El equipo se enfoca en casos genuinos

## El flow

```
Cliente: cualquier mensaje
   ↓
Bot: "¿Qué necesitás?"
   [Horarios] [Sucursales] [Mi pedido] [Otra cosa]

   ↓ Horarios → MESSAGE con info
   ↓ Sucursales → MESSAGE con info
   ↓ Mi pedido → CAPTURE pedidoId → HTTP a API → MESSAGE con status
   ↓ Otra cosa → CAPTURE descripción → HANDOFF con contexto
```

## El JSON

```yaml
topics:
  - id: default
    flow:
      startNodeId: main_menu
      nodes:
        main_menu:
          kind: MENU
          text: "¡Hola! Soy el asistente de ACME. ¿Qué necesitás?"
          options:
            - label: "Horarios"
              nextNodeId: info_horarios
            - label: "Sucursales"
              nextNodeId: info_sucursales
            - label: "Mi pedido"
              nextNodeId: pedir_id_pedido
            - label: "Otra cosa"
              nextNodeId: capturar_consulta

        info_horarios:
          kind: MESSAGE
          text: |
            Nuestros horarios:

            📅 Lunes a viernes: 9-18hs
            📅 Sábados: 10-13hs
            📅 Domingos: cerrado

            ¿Algo más?
          nextNodeId: continuar_o_terminar

        info_sucursales:
          kind: MESSAGE
          text: |
            Estamos en:

            📍 Av. Corrientes 1234, CABA
            📍 Cabildo 4567, CABA
            📍 Boulogne Sur Mer 890, Vicente López

            Si querés ver en mapa: https://empresa.com/sucursales

            ¿Algo más?
          nextNodeId: continuar_o_terminar

        pedir_id_pedido:
          kind: CAPTURE
          text: "¿Cuál es el número de pedido? (solo dígitos)"
          saveAs: pedidoId
          validate:
            kind: regex
            pattern: "^\\d+$"
          nextNodeId: consultar_pedido
          retryNodeId: pedido_id_invalido

        pedido_id_invalido:
          kind: MESSAGE
          text: "El número de pedido tiene que ser solo dígitos (ej. 12345)."
          nextNodeId: pedir_id_pedido

        consultar_pedido:
          kind: HTTP
          method: GET
          url: "https://api.empresa.com/pedidos/{{pedidoId}}"
          headers:
            Authorization: "Bearer {{apiToken}}"
          timeoutMs: 5000
          saveAs: pedido
          nextNodeId: mostrar_pedido
          errorNodeId: pedido_no_encontrado

        mostrar_pedido:
          kind: MESSAGE
          text: |
            Tu pedido #{{pedidoId}}:

            📦 Estado: {{= pedido.status }}
            🚚 Tracking: {{= pedido.tracking ? pedido.tracking : "Aún no disponible" }}
            📅 Llegada estimada: {{= pedido.deliveryDate ? pedido.deliveryDate : "Por confirmar" }}

            ¿Necesitás algo más?
          nextNodeId: continuar_o_terminar

        pedido_no_encontrado:
          kind: MENU
          text: |
            No pude encontrar el pedido #{{pedidoId}}. Puede ser:
            • Número incorrecto
            • Pedido reciente (puede tardar unas horas en aparecer)
            • Pedido de hace más de 6 meses

            ¿Qué hacemos?
          options:
            - label: "Reintentar con otro número"
              nextNodeId: pedir_id_pedido
            - label: "Hablar con alguien"
              nextNodeId: handoff_pedido_no_encontrado

        handoff_pedido_no_encontrado:
          kind: HANDOFF
          text: "Te paso con un agente para que te ayude con tu pedido."
          escalate: false

        capturar_consulta:
          kind: CAPTURE
          text: "Contame brevemente qué necesitás:"
          saveAs: consulta
          nextNodeId: handoff_otra_cosa

        handoff_otra_cosa:
          kind: HANDOFF
          text: |
            Gracias, te paso con un agente.

            Tu consulta: {{consulta}}
          escalate: false

        continuar_o_terminar:
          kind: MENU
          text: "¿Algo más en lo que pueda ayudarte?"
          options:
            - label: "Sí, otra consulta"
              nextNodeId: main_menu
            - label: "No, gracias"
              nextNodeId: despedida

        despedida:
          kind: MESSAGE
          text: "¡Listo! Cualquier cosa volvé a escribirnos. ¡Saludos!"
          # Sin nextNodeId → cierra el flow

router:
  - kind: default
    topic: default

variables:
  - name: apiToken
    type: string
    description: "Token de la API"
    defaultValue: "REEMPLAZAR"
```

## Métricas que esperamos ver

Con un FAQ de este estilo, en operación real:

| Métrica | Valor esperado |
|---|---|
| Conversaciones resueltas por el bot (sin HANDOFF) | 60-75% |
| Conversaciones que llegan a HANDOFF | 25-40% |
| Tiempo medio del bot | 30-90 seg |
| Tiempo ahorrado al equipo | ~70% de los tickets de FAQ |

## Cómo mejorarlo iterativamente

### Mes 1 — Versión básica (como arriba)

Salí con 3-4 FAQs comunes. Mirá qué pasa.

### Mes 2 — Datos para decidir qué más automatizar

Revisá las conversaciones que llegaron a HANDOFF en el inbox. Tomá
las **5 razones más comunes** y agregá nodos para ellas.

Ejemplo: si muchos clientes preguntan "cómo cambio mi dirección de
envío" → agregá un branch nuevo para eso con HTTP a tu backend.

### Mes 3+ — Bot con personalidad

Para mejorar tasa de resolución sin tantos HANDOFFs:

- Capturás nombre al inicio y lo usás en todo el flow
- Agregás emojis, tono más conversacional
- Detección de "no entiendo" y reformulación de pregunta

## Variantes

### Con multi-tema

Si tus FAQs son por área (Soporte, Ventas, Cuentas), dividí en topics
y usá keywords en el router:

```yaml
router:
  - kind: keyword
    pattern: ["soporte", "ayuda", "problema"]
    topic: soporte
  - kind: keyword
    pattern: ["comprar", "precio", "cotizacion"]
    topic: ventas
  - kind: keyword
    pattern: ["pedido", "envío", "tracking"]
    topic: pedidos
  - kind: default
    topic: default
```

Cada topic con su sub-FAQ.

### Con fuzzy matching de FAQ

Más avanzado: cuando el contacto escribe libremente, hacés HTTP a un
servicio de búsqueda (Algolia, ElasticSearch, vector search con
OpenAI embeddings) y mostrás los top 3 resultados como botones.

```yaml
caputrar_pregunta:
  kind: CAPTURE
  text: "Hacé tu pregunta, intento responderte:"
  saveAs: pregunta

buscar_faq:
  kind: HTTP
  method: GET
  url: "https://api.empresa.com/faq/search?q={{= $encodeUriComponent(pregunta) }}"
  saveAs: resultados

mostrar_resultados:
  kind: MENU
  text: "Encontré estas respuestas:"
  options:
    - label: "{{= resultados[0].titulo }}"
      nextNodeId: mostrar_respuesta_0
    - label: "{{= resultados[1].titulo }}"
      nextNodeId: mostrar_respuesta_1
    - label: "Ninguna sirve"
      nextNodeId: handoff
```

## Próximos pasos

- 🎯 [Receta: Captura de lead](./capturar-lead)
- 🔔 [Receta: Recordatorio post-venta](./recordatorio-postventa)
