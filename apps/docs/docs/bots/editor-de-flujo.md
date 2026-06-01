---
title: El editor de flujo
sidebar_position: 7
---

# El editor de flujo

El editor es donde armás visualmente tu bot. Está basado en
[React Flow](https://reactflow.dev/) — un canvas infinito donde
arrastrás nodos y los conectás con líneas.

## Acceder al editor

**WhatsApp → Bot guiado** → seleccionás el bot que querés editar.

Vas a ver:

- **Canvas central**: el flow visual con sus nodos y conexiones
- **Sidebar izquierdo**: lista de topics con sus nodos
- **Sidebar derecho**: detalle del nodo seleccionado (config inline)
- **Toolbar superior**: acciones (Guardar, Publicar, Simular, Exportar)

## Navegación del canvas

| Acción | Cómo |
|---|---|
| **Pan** (mover el canvas) | Click + drag sobre área vacía, o flechas del teclado |
| **Zoom** | Scroll del mouse, o botones +/- de la toolbar |
| **Centrar todo** | Botón "Fit view" |
| **Resetear zoom** | Doble click en área vacía |

El **mini-mapa** abajo a la derecha te muestra una vista general
cuando el flow es grande.

## Agregar un nodo

1. Click derecho en el canvas → "Agregar nodo"
2. Elegí el tipo del menú: MENU, MESSAGE, CAPTURE, etc.
3. El nodo aparece centrado en el lugar del click
4. Se selecciona automáticamente para que lo configures

Alternativa: **drag&drop** desde el panel lateral de tipos de nodos.

## Configurar un nodo

Click sobre un nodo para seleccionarlo. En el sidebar derecho aparecen
sus campos editables según el tipo:

- **MENU**: text, options (label + qué nodo), header, footer
- **MESSAGE**: text, nextNodeId
- **CAPTURE**: text (prompt), saveAs, validate, nextNodeId, retryNodeId
- **HANDOFF**: text, escalate
- **MEDIA**: mediaType, mediaId, caption, nextNodeId
- **CONDITION**: branches (with/else)
- **SET_VAR**: varName, value, nextNodeId
- **HTTP**: method, url, headers, body, saveAs, nextNodeId, errorNodeId
- **FOREACH**: items, itemVar, bodyNodeId, doneNodeId

Ver detalles de cada tipo en la sección [Tipos de nodos](./nodos/menu).

## Conectar nodos

Cada nodo tiene **handles** (círculos en los bordes) para conectar:

- **Handle izquierdo (input)**: a dónde llegan las flechas que apuntan
  a este nodo
- **Handle derecho (output)**: desde dónde salen las flechas hacia
  otros nodos

Conectar:

1. Click + drag desde un handle output al input de otro nodo
2. Aparece una flecha

Para nodos con **múltiples outputs** (MENU, CONDITION, CAPTURE,
HTTP), cada salida tiene su propio handle etiquetado.

## Editar y borrar

| Acción | Cómo |
|---|---|
| **Editar nodo** | Click → editás en el sidebar |
| **Mover nodo** | Drag |
| **Duplicar nodo** | Click derecho → Duplicar |
| **Borrar nodo** | Seleccionar + tecla Delete, o click derecho → Borrar |
| **Borrar conexión** | Click en la flecha + Delete |

## Multi-topic

En el sidebar izquierdo vas a ver la lista de **topics**. Cada topic
es un canvas independiente.

| Acción | Cómo |
|---|---|
| **Cambiar de topic** | Click en el topic deseado en el sidebar |
| **Crear topic nuevo** | "Nuevo topic" arriba del listado |
| **Renombrar topic** | Click derecho → Renombrar |
| **Borrar topic** | Click derecho → Borrar (cuidado, no se puede deshacer) |

## El nodo de inicio

Cada topic tiene **un nodo de inicio** marcado especialmente en el
canvas (verde + flag "Start"). Es desde donde arranca el bot cuando
una sesión nueva entra al topic.

Para cambiar cuál es el nodo de inicio:

- Click derecho en otro nodo → "Marcar como nodo de inicio"

## Router (panel separado)

El router no está en el canvas — tiene su propia pantalla. Click
**Router** en el sidebar izquierdo.

Vas a ver una lista de reglas:

| Tipo | Pattern | Topic destino |
|---|---|---|
| keyword | `["soporte", "ayuda"]` | soporte |
| template-payload | `^promo_2026_(.*)$` | promo_2026 |
| default | — | default |

Las reglas se evalúan en orden. La primera que matchea gana.

Para reordenar: drag&drop. Para editar: click en la regla. Para
agregar: botón "Nueva regla" abajo.

## Variables declarativas

Click **Variables** en el sidebar izquierdo. Lista de variables del
bot con tipo y default.

| Nombre | Tipo | Default | Descripción |
|---|---|---|---|
| nombre | string | — | Nombre del cliente |
| esCliente | boolean | false | ¿Ya es cliente? |
| monto | number | 0 | Monto de la operación |

Las declarás acá para tener type-safety. Cuando un nodo CAPTURE o
SET_VAR las modifica, Massivo coerciona al tipo correcto.

## Simulador

Botón **Simulador** en la toolbar.

Se abre un panel chat al costado donde podés interactuar con tu bot
**en el draft**, sin enviar mensajes reales:

- Tipeás como si fueras el contacto
- El bot responde
- Ves las variables capturadas en panel lateral
- Ves en qué nodo está el flow
- Logs detallados de cada paso

Ver [simulador](./crear-primer-bot#paso-7-probar-con-el-simulador)
para detalle.

## Validación

Mientras editás, el editor te marca **errores en tiempo real**:

| Marca | Significa |
|---|---|
| 🔴 Borde rojo en un nodo | El nodo tiene un error de config (campo faltante, valor inválido) |
| 🔴 Flecha roja | Apunta a un nodo que no existe (link roto) |
| ⚠️ Warning amarillo | Algo cuestionable pero válido (ej. variable sin declarar) |

Pasando el mouse por encima de cada marca te muestra el detalle.

**El publish está bloqueado si hay errores**.

## Acciones de la toolbar

| Botón | Qué hace |
|---|---|
| **Guardar** | Persiste el draft en DB |
| **Publicar** | Copia draft a published, lo activa para producción |
| **Descartar cambios** | Restaura draft desde el último published |
| **Simulador** | Abre el chat de prueba |
| **Exportar JSON** | Te baja el bot como JSON (backup) |
| **Importar JSON** | Reemplaza el draft con un JSON subido |
| **Volver al listado** | Sale del editor |

## Atajos de teclado

Útiles para trabajar rápido:

| Atajo | Acción |
|---|---|
| `Ctrl/Cmd + S` | Guardar draft |
| `Ctrl/Cmd + Shift + P` | Publicar |
| `Ctrl/Cmd + Z` | Undo (deshacer última acción) |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Delete` | Borrar nodo / flecha seleccionado |
| `Ctrl/Cmd + D` | Duplicar nodo seleccionado |
| `F` o `Ctrl/Cmd + 0` | Fit view |

## Layout automático

Si tu flow se vuelve un caos visual, en la toolbar tenés **"Auto-layout"**:

- Reposiciona todos los nodos siguiendo el flow desde el start
- Top-to-bottom o left-to-right según preferencia
- No cambia la lógica, solo la disposición visual

## Limitaciones del editor

- **No hay copy-paste cross-bot** todavía. Para copiar nodos entre
  bots distintos, exportá JSON y editá.
- **Undo limitado a 50 acciones** en memoria. No es persistente
  across sessions.
- **No hay versionado histórico** todavía (solo Draft vs Published).

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Los cambios desaparecieron al refrescar" | No guardaste el draft | Siempre Save antes de cerrar |
| "No puedo publicar, dice errores" | Hay validation errors | Revisá los nodos marcados en rojo |
| "Las conexiones se borran solas" | Borraste un nodo destino → la conexión queda huérfana | Re-conectalas o borralas |
| "El simulador no usa los últimos cambios" | El simulador trabaja con el draft. Asegurate de haber guardado. | Save Draft → re-abrir simulador |

## Próximos pasos

- 🤖 [Crear tu primer bot](./crear-primer-bot) — paso a paso end-to-end
- 📦 [Tipos de nodos](./nodos/menu) — referencia detallada
