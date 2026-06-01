---
title: 'Receta: Capturar lead y derivar a vendedor'
sidebar_position: 1
---

# Receta: Capturar lead y derivar a vendedor

Bot que **pre-cualifica un lead nuevo**, captura sus datos básicos, y
hace HANDOFF a un vendedor con todo el contexto.

## Para qué sirve

- Reducir la fricción del primer contacto
- Que tus vendedores reciban **leads ya pre-cualificados**, no
  cualquier mensaje
- Capturar datos automáticamente que después van a tu CRM (con HTTP)

## El flow completo

```
Cliente: cualquier mensaje
   ↓
Bot: "¿Buscás info comercial?"
   [Sí, quiero saber más] [No, otra cosa]
   ↓
[Si Sí]
   ↓
Bot: "¿Cómo te llamás?" → CAPTURE → nombre
   ↓
Bot: "Tu email para mandarte info?" → CAPTURE con validate email → email
   ↓
Bot: "¿En qué empresa trabajás?" → CAPTURE → empresa
   ↓
Bot: "¿Cuándo te gustaría que un vendedor te contacte?"
   [Hoy mismo] [Esta semana] [No urgente]
   ↓ urgencia
   ↓
HTTP POST a /crm/leads con todos los datos
   ↓
[Si HTTP OK]
   ↓
HANDOFF: "Listo {{nombre}}, en breve un vendedor te contacta"
   con escalate=true si "Hoy mismo"

[Si NO] → MENU principal del bot

[Si HTTP ERROR] → HANDOFF normal sin el CRM
```

## El JSON del bot (estructura)

```yaml
topics:
  - id: default
    flow:
      startNodeId: arrancar
      nodes:
        arrancar:
          kind: MENU
          text: "¡Hola! Soy el asistente de ACME. ¿Buscás info comercial?"
          options:
            - label: "Sí, quiero saber más"
              nextNodeId: pedir_nombre
            - label: "No, otra cosa"
              gotoTopic: otra_cosa

        pedir_nombre:
          kind: CAPTURE
          text: "¡Buena! Empecemos con tu nombre, ¿cómo te llamás?"
          saveAs: nombre
          nextNodeId: pedir_email

        pedir_email:
          kind: CAPTURE
          text: "Hola {{nombre}}, tu email para mandarte info?"
          saveAs: email
          validate: {kind: preset, preset: email}
          nextNodeId: pedir_empresa
          retryNodeId: email_invalido

        email_invalido:
          kind: MESSAGE
          text: "Ese no parece un email válido. Intentemos de nuevo."
          nextNodeId: pedir_email

        pedir_empresa:
          kind: CAPTURE
          text: "Perfecto. ¿En qué empresa trabajás?"
          saveAs: empresa
          nextNodeId: pedir_urgencia

        pedir_urgencia:
          kind: MENU
          text: "¿Cuándo te gustaría que te contacte un vendedor?"
          options:
            - label: "Hoy mismo"
              nextNodeId: set_urgente
            - label: "Esta semana"
              nextNodeId: set_normal
            - label: "No urgente"
              nextNodeId: set_baja

        set_urgente:
          kind: SET_VAR
          varName: urgencia
          value: "alta"
          nextNodeId: crear_lead

        set_normal:
          kind: SET_VAR
          varName: urgencia
          value: "media"
          nextNodeId: crear_lead

        set_baja:
          kind: SET_VAR
          varName: urgencia
          value: "baja"
          nextNodeId: crear_lead

        crear_lead:
          kind: HTTP
          method: POST
          url: "https://api.empresa.com/crm/leads"
          headers:
            Authorization: "Bearer {{apiToken}}"
            Content-Type: "application/json"
          body:
            nombre: "{{nombre}}"
            email: "{{email}}"
            empresa: "{{empresa}}"
            urgencia: "{{urgencia}}"
            fuente: "bot_whatsapp"
            telefono: "{{contact.phone}}"
          timeoutMs: 5000
          saveAs: respuestaCrm
          nextNodeId: decidir_handoff
          errorNodeId: handoff_sin_crm

        decidir_handoff:
          kind: CONDITION
          branches:
            - when: {kind: var, var: urgencia, op: eq, value: "alta"}
              nextNodeId: handoff_urgente
          elseNextNodeId: handoff_normal

        handoff_urgente:
          kind: HANDOFF
          text: |
            ¡Gracias {{nombre}}! Tu solicitud quedó registrada.

            Como dijiste que es urgente, un vendedor te contacta YA.

            Resumen:
            • Email: {{email}}
            • Empresa: {{empresa}}
            • Urgencia: ALTA
          escalate: true

        handoff_normal:
          kind: HANDOFF
          text: |
            ¡Gracias {{nombre}}! Tu solicitud quedó registrada.

            Un vendedor se va a contactar con vos dentro de las próximas
            48hs.

            Resumen:
            • Email: {{email}}
            • Empresa: {{empresa}}
          escalate: false

        handoff_sin_crm:
          kind: HANDOFF
          text: |
            ¡Gracias {{nombre}}! Te derivamos con un vendedor que va a
            tomar tus datos:

            • Email: {{email}}
            • Empresa: {{empresa}}

            En breve te contactamos.
          escalate: true  # Si CRM falla, prioridad alta

  - id: otra_cosa
    flow:
      startNodeId: dudas
      nodes:
        dudas:
          kind: MENU
          text: "Sin problema. ¿Qué necesitás?"
          options:
            - label: "Soporte"
              gotoTopic: soporte
            - label: "Información de horarios"
              nextNodeId: horarios
            - label: "Hablar con alguien"
              nextNodeId: handoff_otro

        horarios:
          kind: MESSAGE
          text: "Lun-vie 9-18hs. Sábados 10-13hs."

        handoff_otro:
          kind: HANDOFF
          text: "Te paso con un agente."

  - id: soporte
    flow:
      startNodeId: soporte_arrancar
      nodes:
        soporte_arrancar:
          kind: HANDOFF
          text: "Para soporte técnico te paso directamente con el equipo."
          escalate: true

router:
  - kind: default
    topic: default

variables:
  - name: apiToken
    type: string
    description: "Token de la API del CRM"
    defaultValue: "REEMPLAZAR_EN_CONFIG"
  - name: nombre
    type: string
  - name: email
    type: string
  - name: empresa
    type: string
  - name: urgencia
    type: string
    defaultValue: "media"
```

## Lo que el vendedor recibe

Cuando llega al inbox con el HANDOFF, el vendedor ve:

- **Chat completo** del bot con el cliente (todas las preguntas y
  respuestas)
- **Panel de variables**:
  - nombre: "Juan Pérez"
  - email: "juan@empresa.com"
  - empresa: "ACME"
  - urgencia: "alta"
- **Badge "Escalado por bot"** + "Urgencia: ALTA" si era urgente

Empieza la conversación ya sabiendo a quién está hablando y qué quiere.

## Variantes posibles

### Más campos capturados

Si tu venta requiere más info, agregás más CAPTURE:

- DNI / CUIT
- Tamaño de empresa (MENU con rangos)
- Presupuesto (MENU con rangos)
- Producto de interés

### Calificación con BANT

Después de capturar, podés usar CONDITION para **calificar** y derivar
a distintos vendedores:

```yaml
calificar:
  kind: CONDITION
  branches:
    - when: {kind: var, var: tamañoEmpresa, op: eq, value: "Enterprise (500+ empleados)"}
      nextNodeId: handoff_enterprise
    - when: {kind: var, var: tamañoEmpresa, op: eq, value: "Mid-market (50-500)"}
      nextNodeId: handoff_midmarket
  elseNextNodeId: handoff_smb
```

Cada handoff puede asignarse a un team distinto si lo configurás.

### Disqualify temprano

Si después de algunas preguntas detectás que **no es un lead apto**
(presupuesto chico, fuera del target), enviás un MESSAGE explicando y
NO hacés HANDOFF — economizás tiempo del equipo.

```yaml
chequeo_presupuesto:
  kind: CONDITION
  branches:
    - when: {kind: var, var: presupuesto, op: eq, value: "menos de $5k"}
      nextNodeId: disqualify_smb
  elseNextNodeId: continuar_handoff

disqualify_smb:
  kind: MESSAGE
  text: |
    Gracias por tu interés. Nuestros productos arrancan en $10k,
    no creemos ser el mejor fit para tu caso. Cuando crezcas, te
    esperamos!
  # Sin nextNodeId → fin del flow
```

## Métricas para trackear

Algunos datos útiles a medir después:

- **Conversion rate**: cuántas conversaciones llegan al HANDOFF /
  total
- **Drop-off por paso**: cuántos abandonan en cada CAPTURE
- **% de leads alta urgencia**: para staffing del equipo
- **Tiempo medio del bot**: cuánto tarda el cliente en pasar por todo
  el flow

Hoy no tenemos dashboard nativo de bot. Trackealo en tu CRM destino.

## Próximos pasos

- 🆘 [Receta: FAQ con escalamiento](./faq-con-handoff)
- 🔔 [Receta: Recordatorio post-venta](./recordatorio-postventa)
