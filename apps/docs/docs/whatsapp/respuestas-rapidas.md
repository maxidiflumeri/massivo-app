---
title: Respuestas rápidas (Quick Replies)
sidebar_position: 10
---

# Respuestas rápidas

Las **respuestas rápidas** son **snippets de texto pre-armados** que
los agentes pueden insertar con un click cuando responden manualmente
en el inbox.

A diferencia de los **bots** (que responden automáticamente sin
intervención humana), las quick replies son **manuales**: el agente
elige cuál insertar.

## Para qué sirven

Casos típicos:

- **FAQ recurrentes**: "¿Cómo llego a la sucursal?" → snippet con
  dirección + horarios + link a Google Maps
- **Respuestas standard**: "Gracias por contactarnos, en un momento te
  ayudo" → mientras buscás la info para el cliente
- **Disclaimers legales**: "Esta promo es válida hasta el 31/12 sujeta a
  términos y condiciones..."
- **Saludos / cierres**: "Saludos cordiales, equipo de soporte ACME"

## Crear una quick reply

1. **WhatsApp → Respuestas rápidas**
2. Click **"Nueva"**
3. Llenás:

| Campo | Qué poner |
|---|---|
| **Shortcut** | Atajo corto, ej. `/sucursal`. Empieza con `/`. |
| **Título** | Para que sea fácil de buscar en la UI |
| **Texto** | El cuerpo del mensaje. Puede tener variables (ver abajo) |
| **Categoría** (opcional) | Para agrupar |

4. Click **Guardar**

## Variables en quick replies

Soportamos las mismas variables que en templates de email (Handlebars).
Las que **conocemos automáticamente del contacto**:

- `{{contact.name}}` — nombre del contacto en la conversación
- `{{contact.firstName}}`
- `{{contact.phone}}`
- `{{agent.name}}` — el nombre del agente que está respondiendo
- `{{agent.email}}`

Ejemplo:

```
Hola {{contact.firstName}},

Gracias por contactarte con nosotros. Soy {{agent.name}} y
te ayudo en lo que necesites.
```

Cuando el agente inserta el snippet, las variables se reemplazan
automáticamente con los datos de la conversación actual.

## Usar quick replies desde el inbox

Cuando estás respondiendo una conversación:

### Opción A — Tipear el shortcut

En el input del chat, escribís el shortcut (ej. `/sucursal`) y le das
**Tab** o **Enter**. El snippet se expande in-place.

### Opción B — Buscar desde el botón

Click el icono ⚡ del input → se abre un dropdown con todas las quick
replies del team. Buscás por título o shortcut.

### Opción C — Atajos de teclado

- **Ctrl/Cmd + K**: abrir buscador de quick replies sin mouse
- **Tipear /**: lista las quick replies cuyo shortcut empiece con `/`

## Compartido a nivel team

Las quick replies son **a nivel team**. Todos los miembros del team
ven las mismas. No están a nivel agente individual.

Si tu organización tiene varios teams, **cada team tiene las suyas**.
No hay sharing entre teams (todavía).

## Categorías

Si tu lista crece, podés agrupar por categorías:

- Saludos
- FAQ
- Disclaimers
- Cierres
- Información de productos

En el listado, filtrás por categoría. En el dropdown del inbox, las
quick replies se agrupan visualmente por categoría.

## Editar / borrar

En el listado:

- Click **Editar** → modificás
- Click **Borrar** → se elimina (no afecta mensajes ya enviados)

Las quick replies usadas en el pasado quedan **literales en los
mensajes** que el agente envió. Borrar el snippet no afecta el
histórico.

## Importar / exportar masivo

Si tenés muchas y querés gestionarlas en planilla:

- **Exportar a CSV** desde el listado → te bajás todas
- **Importar CSV** → subís las que armaste en planilla

Formato:

```csv
shortcut,title,text,category
/sucursal,Dirección sucursal centro,"Estamos en Av. Corrientes 1234, CABA. Horarios: lun-vie 9-18hs",FAQ
/saludo,Saludo standard,"Hola {{contact.firstName}}, gracias por contactarnos",Saludos
```

## Mejores prácticas

### No abuses

Si toda tu interacción es quick replies, el contacto va a sentir que
habla con un bot. Quick replies son para **acelerar lo repetitivo**, no
para reemplazar la conversación.

### Mantenelas actualizadas

Una quick reply con info desactualizada es peor que ninguna. Revisá
periódicamente:

- ¿Las direcciones siguen siendo correctas?
- ¿Los horarios cambiaron?
- ¿El producto del que habla se sigue ofreciendo?

### Tono y voz

Las quick replies definen el tono de tu marca. Acordá con tu equipo:

- ¿Tuteo, voseo, usted?
- ¿Emojis sí o no?
- ¿Despedida estándar?

Documentalo en categorías o en una intro como nota.

### Onboarding de agentes nuevos

Cuando entra alguien nuevo al team:

- Las quick replies existentes son **automáticamente disponibles** para
  él/ella
- Es una **excelente herramienta de onboarding**: leyéndolas el agente
  nuevo aprende el tono, las respuestas standard y los procesos

## Quick replies vs Bots vs Templates: cuándo usar cada uno

| Necesito | Uso |
|---|---|
| Acelerar respuestas manuales repetitivas | Quick Reply |
| Responder automáticamente sin agente (FAQ, triage) | Bot |
| Iniciar conversación fuera del 24h window | Template |
| Mandar masivo a una lista de contactos | Campaña con Template |

## Próximos pasos

- 💬 [Inbox](./inbox) para usar quick replies en conversaciones
- 🤖 [Bots](../bots/crear-primer-bot) si querés automatizar respuestas
  sin agente humano
