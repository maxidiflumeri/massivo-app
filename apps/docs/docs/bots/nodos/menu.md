---
title: MENU
sidebar_position: 1
---

# Nodo MENU

Muestra un mensaje al contacto con **hasta 3 botones de respuesta
rápida** (Quick Reply de Meta). Cuando el contacto clickea uno, el
bot avanza al nodo configurado para esa opción.

Es **el nodo más usado** para flujos guiados — los botones aseguran
que el contacto no escriba algo inesperado que tu bot no sepa
manejar.

## Cuándo usarlo

- "¿En qué te ayudo?" con 3 opciones predefinidas
- "¿Querés confirmar este pedido?" → Sí / No / Cambiar
- Triage / categorización de la consulta

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `text` | string | ✅ | El cuerpo del mensaje. Soporta variables `{{x}}`. |
| `options` | array | ✅ | Hasta 3 opciones. Cada una con `label` + `nextNodeId` o `gotoTopic`. |
| `header` | string | — | Texto opcional antes del cuerpo (max 60 chars) |
| `footer` | string | — | Texto opcional al pie (max 60 chars) |

### Cada opción

| Campo | Descripción |
|---|---|
| `id` | Identificador interno (auto-generado, único en el bot) |
| `label` | El texto que se muestra al contacto en el botón (max 20 chars por límite de Meta) |
| `nextNodeId` | A qué nodo ir si el contacto elige esta opción |
| `gotoTopic` | Alternativa: saltar al inicio de otro topic |

## Ejemplo

```yaml
kind: MENU
text: "¡Hola {{contact.firstName}}! ¿En qué te ayudo?"
header: "Soporte ACME"
footer: "Atención lun-vie 9-18hs"
options:
  - label: "Soporte técnico"
    gotoTopic: soporte
  - label: "Información comercial"
    gotoTopic: ventas
  - label: "Otra cosa"
    nextNodeId: handoff_humano
```

El contacto ve:

```
┌────────────────────────────┐
│ Soporte ACME               │
│                            │
│ ¡Hola Juan! ¿En qué te     │
│ ayudo?                     │
│                            │
│ Atención lun-vie 9-18hs    │
└────────────────────────────┘
  [Soporte técnico]
  [Información comercial]
  [Otra cosa]
```

## Comportamiento

1. Bot envía el mensaje con los botones a Meta
2. Bot **espera** la respuesta del contacto (sesión persiste, TTL
   aplica)
3. Cuando el contacto clickea un botón:
   - Bot recibe el inbound con el label como texto
   - Bot busca la opción que matchea
   - Avanza al `nextNodeId` o `gotoTopic` correspondiente
4. Si el contacto **escribe algo que no es un botón** (ej. "no sé"):
   - Re-envía el mensaje + botones para que vuelva a elegir
   - O si configurás un fallback en CONDITION posterior, ramifica

## Límites de Meta

- **Máximo 3 botones** por mensaje
- **Máximo 20 chars por label**
- Si necesitás más de 3 opciones, usá un **list message** (no soportado
  todavía en Massivo, está en roadmap) o un **MENU encadenado** (MENU
  inicial con 3 opciones que llevan a 3 MENUs más con sus 3 opciones
  cada uno).

## Buenas prácticas

### Labels cortos y claros

```
✅ "Soporte"
✅ "Comprar"
✅ "Cambiar turno"

❌ "Quiero soporte técnico para mi router que se desconecta"
❌ "Información detallada de precios y promociones"
```

### Header / footer con sparingly

El header gana visibilidad pero satura la pantalla. Usalo solo si
agrega contexto importante. Footer es bueno para disclaimers.

### Siempre ofrecé "Otra cosa"

Para que el contacto pueda salir de tu flow ramificado y llegar a un
HANDOFF si su caso no está cubierto. Sin esa válvula de escape, los
contactos se frustran.

### No anidar más de 2 niveles de MENU

3 niveles de menú profundo = experiencia muy lenta. Considerá
reestructurar con multi-topic + router.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Meta error: too many buttons" | Configuraste 4+ opciones | Limitá a 3 |
| "Meta error: label too long" | Algún label >20 chars | Acortar |
| El bot se queda esperando aunque el contacto eligió | El payload del botón no matchea el label | Verificá que el label sea exactly el mismo (case-sensitive en algunos casos) |
| Contacto eligió pero el bot dice "no entiendo" | No definiste fallback para responses libres | Agregá un CONDITION después que cubra texto libre |

## Próximos pasos

- 💬 [MESSAGE](./message) — para mandar sin botones
- ⌨️ [CAPTURE](./capture) — si necesitás respuesta libre con validación
- 🌳 [CONDITION](./condition) — para lógica más compleja después
