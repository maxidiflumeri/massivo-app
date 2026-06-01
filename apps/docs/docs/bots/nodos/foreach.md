---
title: FOREACH
sidebar_position: 9
---

# Nodo FOREACH

**Itera sobre un array y ejecuta un body de nodos por cada elemento.**
Es **el nodo más avanzado** del bot. Útil para casos donde tu API
devuelve una lista y querés mandar un mensaje por item, o hacer una
operación por cada elemento.

## Cuándo usarlo

- Mandar un MESSAGE por cada producto en el carrito del cliente
- Iterar pedidos del cliente y mandar status de cada uno
- Procesar una lista de items con SET_VAR / HTTP por cada uno
- Cualquier operación batch sobre un array

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `items` | string | ✅ | Expresión JSONata que evalúa a un array |
| `itemVar` | string | ✅ | Variable destino para el item actual |
| `indexVar` | string | — | Variable destino para el índice (0-based) |
| `bodyNodeId` | string | ✅ | Primer nodo del body (que se ejecuta por cada item) |
| `doneNodeId` | string | — | Nodo al que ir cuando la iteración termina |
| `gotoTopic` | string | — | Alternativa al doneNodeId |

## Ejemplo: mostrar lista de pedidos

```yaml
nodes:
  consultar_pedidos:
    kind: HTTP
    method: GET
    url: "https://api.empresa.com/cliente/{{dni}}/pedidos"
    saveAs: respuesta
    nextNodeId: iterar
    errorNodeId: error

  iterar:
    kind: FOREACH
    items: "{{= respuesta.pedidos }}"
    itemVar: pedido
    indexVar: idx
    bodyNodeId: mostrar_pedido
    doneNodeId: cerrar

  mostrar_pedido:
    kind: MESSAGE
    text: |
      Pedido #{{= idx + 1 }}:
      • ID: {{= pedido.id }}
      • Estado: {{= pedido.status }}
      • Total: ${{= pedido.total }}
    # Sin nextNodeId → vuelve al FOREACH para próxima iteración

  cerrar:
    kind: MESSAGE
    text: "Esos son todos tus pedidos. ¿Necesitás algo más?"
```

Si la respuesta de la API tenía 3 pedidos, el contacto recibe **3
mensajes** (uno por pedido) y después el de cierre.

## Cómo funciona el control de flow

```
[FOREACH items: lista, bodyNodeId: body]
   │
   │ items vacío? → ir a doneNodeId
   │ items con N elementos:
   │
   │   iteración 1: itemVar = lista[0], indexVar = 0
   │   ↓ ejecuta el body
   │   ↓ body llega a su nodo terminal (sin nextNodeId)
   │   ↓
   │   iteración 2: itemVar = lista[1], indexVar = 1
   │   ↓ ejecuta el body de nuevo
   │   ↓
   │   ...
   │   iteración N: itemVar = lista[N-1], indexVar = N-1
   │
   │ termina → ir a doneNodeId
```

El **body se ejecuta una vez por elemento**. Cuando el body llega a su
fin (un MESSAGE sin nextNodeId, por ejemplo), el FOREACH **avanza a la
próxima iteración**.

### Cómo el body sabe cuándo terminar

El body debe ser un **flow self-contained** que termina en un nodo
**sin** `nextNodeId` (o con un `nextNodeId` que vuelva a un nodo
controlado). El motor detecta el final del body y pasa al siguiente
item.

Si el body **se desvía** (ej. HANDOFF, gotoTopic), el FOREACH se
**rompe** — la iteración no continúa.

## Límites de seguridad

Para evitar loops infinitos o uso abusivo:

| Límite | Default | Configurable por |
|---|---|---|
| **Max iteraciones por FOREACH** | 100 | `WAPI_BOT_FOREACH_MAX_ITERATIONS` env |
| **Max nesting** (FOREACH dentro de FOREACH) | 3 | `WAPI_BOT_FOREACH_MAX_NESTED` env |

Si tu array tiene más de 100 elementos, **se truncan**. Si necesitás
más, configurá el límite via env (con cuidado).

## Expresiones JSONata para `items`

El campo `items` evalúa una expresión JSONata que **debe devolver un
array**. Algunas opciones útiles:

### Array directo

```yaml
items: "{{= respuesta.pedidos }}"
```

### Filter

```yaml
items: "{{= respuesta.pedidos[status='ACTIVO'] }}"
```

Itera solo los pedidos activos.

### Sort

```yaml
items: "{{= respuesta.pedidos^(fechaCreacion) }}"
```

Itera ordenado por fecha.

### Take primeros N

```yaml
items: "{{= respuesta.pedidos[0..4] }}"
```

Itera los primeros 5 (slice).

### Map / transform

```yaml
items: "{{= respuesta.items.{ \"sku\": sku, \"qty\": cantidad } }}"
```

Itera solo `sku` y `qty` de cada item.

## Acceso al item dentro del body

El `itemVar` y `indexVar` están disponibles **dentro del body** como
variables normales:

```yaml
mostrar_pedido:
  kind: MESSAGE
  text: "Pedido {{= idx + 1 }}: {{= pedido.id }}"
```

Como cualquier variable JSONata.

## Saltar items con CONDITION

Si querés saltar algunos items dentro del body sin terminar la
iteración:

```
[FOREACH items: pedidos, body: chequeo]

chequeo:
  CONDITION
    branches:
      - when: pedido.status == "CANCELADO" → siguiente (terminal sin nextNodeId)
    elseNextNodeId: mostrar
  
mostrar: MESSAGE "Pedido {{pedido.id}} - {{pedido.total}}"
```

Si el CONDITION matchea la rama de cancelado, va al terminal → vuelve
al FOREACH para próxima iteración. Si no, muestra el pedido.

## Nested FOREACH (limitado)

Podés anidar FOREACH dentro de FOREACH, hasta el `MAX_NESTED` (default
3 niveles):

```yaml
iterar_pedidos:
  kind: FOREACH
  items: "{{= pedidos }}"
  itemVar: pedido
  bodyNodeId: iterar_items_del_pedido

iterar_items_del_pedido:
  kind: FOREACH
  items: "{{= pedido.items }}"
  itemVar: item
  bodyNodeId: mostrar_item

mostrar_item:
  kind: MESSAGE
  text: "  • {{= item.sku }}: {{= item.cantidad }}"
```

Cuidado con la **complejidad** y el **número de mensajes**: 3 pedidos
con 5 items cada uno = 15 mensajes. Eso es muchísimo.

## Side-effects dentro del body

Podés tener nodos HTTP, SET_VAR, etc. dentro del body. Útil para
operaciones batch:

```yaml
iterar:
  kind: FOREACH
  items: "{{= pedidosPendientes }}"
  itemVar: p
  bodyNodeId: notificar

notificar:
  kind: HTTP
  method: POST
  url: "https://api.empresa.com/notif/{{= p.id }}"
  saveAs: respNotif
  # Sin nextNodeId → vuelve al FOREACH
```

Esto manda una notificación por cada pedido pendiente.

## Buenas prácticas

### Limitá la cantidad de mensajes outbound

Si tu array tiene 50 elementos y cada body manda un MESSAGE, el
contacto recibe **50 notificaciones consecutivas**. Es horrible.

**Mitigaciones**:

- Filtrá `items` para mandar solo los más relevantes (`[0..4]`)
- Consolidá info en un solo MESSAGE con loop dentro del template
  (Handlebars `{{#each}}`)

### Cuidado con timeouts

Si dentro del body hacés HTTP, **cada iteración suma tiempo**. Con un
límite de 100 iteraciones x 5s de timeout = 500s. Si tu sesión expira
en 30 min, está OK, pero si querés más rápido, paralelizá en tu API
(devolvé un endpoint batch).

### Side-effects que persisten

Las variables seteadas dentro del body **no persisten cross-iteración**
para una misma variable name. Cada iteración resetea (en parte). Si
querés un acumulador (sumar `total` de todos los pedidos):

- Usá SET_VAR fuera del body para inicializar (`total = 0`)
- Dentro del body, SET_VAR `total = {{= total + pedido.monto }}`

(Esto sí persiste porque la variable está en sesión, no en el scope
del body.)

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `items not array` | La expresión JSONata no devolvió array | Verificá con expresión simple primero |
| Iteración no termina | El body tiene un nextNodeId que escapa del control del FOREACH | Asegurate de que el body termine en nodo sin nextNodeId |
| Solo procesa 1 item y se va a doneNodeId | El body llegó a un nodo terminal del flow (no del body) | Reestructurar el body |
| Acumulador no acumula | Le diste el mismo nombre al acumulador y al itemVar | Renombrá |
| Performance horrible | Demasiados HTTP calls secuenciales | Considerar batch endpoint |

## Próximos pasos

- 🌐 [HTTP](./http) — la fuente típica de arrays para FOREACH
- 🛡️ [SET_VAR](./set-var) — para acumular dentro del FOREACH
- 🌳 [CONDITION](./condition) — para skip items
