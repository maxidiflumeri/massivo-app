---
title: Draft vs Published
sidebar_position: 5
---

# Draft vs Published — editar sin romper producción

Cuando trabajás con bots, hacés cambios todo el tiempo: agregás un
nodo, ajustás un texto, probás una nueva variable. Si esos cambios
afectaran **directamente a tu producción**, sería un caos — cualquier
guardado podría romper la experiencia de los contactos reales.

Por eso Massivo usa el modelo **Draft vs Published**:

- **Draft**: lo que vos estás editando ahora mismo en el panel. **No
  afecta a producción.**
- **Published**: la versión activa que está respondiendo a tus
  contactos en este momento.

## Cómo funciona

### Tu workflow normal

```
Editás un bot en el panel → cambios van al Draft
   ↓
"Guardar" → Draft actualizado en DB (los contactos no ven nada)
   ↓
Repetís hasta estar conforme
   ↓
"Publicar" → Draft pasa a ser el nuevo Published
   ↓
La próxima sesión que arranque usa la versión nueva
```

### Lo que ve cada uno

| Quién | Versión que ve / usa |
|---|---|
| **Vos** en el editor | Draft (con tus últimos cambios) |
| **El motor del bot** procesando inbound | Published |
| **Las sesiones activas** | Published al momento de iniciar la sesión |
| **El simulador** del panel | Draft (para que pruebes los cambios) |

### Qué tienen Draft y Published

Ambos guardan:

- **Topics** (con sus flows y nodos)
- **Router** (las reglas de matching)
- **Variables declarativas**

Cuando publicás, los 3 campos pasan del draft al published.

## Indicador visual: "Cambios sin publicar"

En la UI del editor vas a ver un badge cuando el draft difiere del
published:

- **Sin badge**: draft == published, no hay cambios pendientes
- **Badge azul "Cambios sin publicar"**: hiciste cambios al draft que
  todavía no están en producción

El badge desaparece cuando hacés Publish.

## Las acciones del editor

### Save Draft

Botón **"Guardar"** (azul, no destructivo).

- Persiste el estado actual del editor como nuevo Draft
- **No afecta producción**
- Podés guardar 100 veces sin romper nada

### Publish

Botón **"Publicar"** (verde, requiere confirmación).

- Copia el Draft a Published
- A partir de ahora, **nuevas sesiones usan la versión publicada nueva**
- Las **sesiones que ya estaban activas** siguen con la versión vieja
  hasta que terminen

### Discard Draft (descartar cambios)

Botón **"Descartar cambios"** (rojo, requiere confirmación).

- Copia Published de vuelta al Draft
- **Perdés todos los cambios del draft no publicados**
- Útil cuando te diste cuenta de que la dirección que tomaste estaba
  mal y querés volver al estado conocido bueno

## ¿Y las sesiones que están activas cuando publicás?

Detalle importante: cuando una sesión arranca, **se ata a la versión
publicada en ese momento**. Si vos publicás un cambio mientras hay
sesiones activas:

- Las **sesiones nuevas** después del publish usan la versión nueva
- Las **sesiones que estaban en curso** **siguen con la versión vieja**
  hasta que terminen o expiren

Esto te garantiza que **no rompés a contactos a mitad de conversación**
con un cambio. Una vez que terminan (HANDOFF, fin del flow, TTL), la
próxima sesión usa la nueva versión.

## ¿Y si publico un cambio que rompe todo?

Pasa: publicás algo, te das cuenta 5 min después que está mal y los
contactos se están confundiendo. Tenés 2 opciones:

### Opción A — Rollback rápido editando

1. En el editor, **deshacés los cambios** (manualmente)
2. **Save Draft** y **Publish** de nuevo

Es lo más práctico para fixes chicos.

### Opción B — Versión anterior (próximamente)

Hoy **no hay un botón "rollback a versión anterior"** explícito.
Tenemos en backlog implementar historial de publicaciones para poder
volver a versiones N atrás con un click.

Como workaround: **antes de publicar cambios grandes, exportá tu bot
como JSON** (botón "Exportar"). Si algo sale mal, importás el JSON
viejo y publicás.

## Testing antes de publicar — el simulador

En el detalle del bot hay una sección **Simulador**:

1. Click **"Abrir simulador"**
2. Se abre un chat en una columna lateral
3. Vos tipeas como si fueras el contacto
4. El bot responde según el **draft** (no el published)

Vas a ver:

- Los mensajes del bot tal como aparecerían en WhatsApp real
- Las variables capturadas (panel lateral)
- En qué nodo del flow está el contacto
- Logs de cada nodo procesado

Útil para:

- Probar cambios sin enviar mensajes reales
- Detectar bugs en el flow antes de publicar
- Documentar comportamiento esperado

## Validación al publicar

Cuando hacés Publish, Massivo **valida el draft**:

- ¿Todos los `nextNodeId` apuntan a nodos que existen?
- ¿Todos los `gotoTopic` apuntan a topics que existen?
- ¿Las variables usadas en `{{x}}` están declaradas o se capturan en
  algún nodo previo?
- ¿Los nodos requeridos tienen sus campos obligatorios llenos?

Si la validación falla, **el publish se rechaza** con la lista de
errores. Tenés que arreglarlos y reintentar.

Esto te protege de publicar algo que claramente está roto.

## Timestamps

Cada bot tiene:

- `botDraftUpdatedAt`: cuándo se guardó el draft por última vez
- `botPublishedAt`: cuándo se hizo el último publish

El UI los muestra en el detalle del bot ("Editado hace 5 min,
publicado hace 2 días").

## Mejores prácticas

### Publicar seguido (changes chicos)

Mejor 10 publishes con cambios chicos que 1 publish con todo
acumulado. Si algo sale mal:

- Con cambios chicos: identificás rápido qué línea es la culpable
- Con todo acumulado: 1 hora de bisecting

### Probar siempre con el simulador antes

Es gratis y rápido. **Siempre** simulá antes de publicar, sobre todo
cambios al router o a la lógica de topics.

### Backup antes de cambios grandes

Antes de hacer un refactor grande del bot:

1. **Exportá el JSON** del bot publicado actual
2. Hacé los cambios en el draft
3. Probás con simulador
4. Publicás

Si algo sale mal post-publish, importás el JSON viejo de backup.

### Documentar los topics

Mientras vas armando el bot, ponele **labels descriptivos** a los
topics y comentarios en los nodos. Tu yo de 6 meses adelante te va a
agradecer.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Hice cambios pero los contactos no los ven" | Olvidaste publicar | Click Publicar |
| "Los cambios que descarté volvieron" | Refresco del browser cargó el draft viejo | Refresca el panel |
| "Valida y rechaza el publish con error" | Hay inconsistencias en el draft (links rotos, variables faltantes) | Arregla los errores y republicá |
| "Mi simulador anda raro" | El simulador trabaja con el draft, no con el published | Es lo esperado — el draft es lo que estás editando |

## Próximos pasos

- 🛠 [Crear tu primer bot](../crear-primer-bot) usando este workflow
- 🎨 [Editor de flujo](../editor-de-flujo) — la UI del canvas
