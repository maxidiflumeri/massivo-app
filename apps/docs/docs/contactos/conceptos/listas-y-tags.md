---
title: Listas y tags
sidebar_position: 3
---

# Listas y tags — segmentación

Para **agrupar contactos** de manera reusable, Massivo soporta **2
mecanismos** distintos pero complementarios:

| | Tags | Listas |
|---|---|---|
| **Granularidad** | Múltiples por contacto | Múltiples por contacto |
| **Uso típico** | Atributos descriptivos ("vip", "newsletter", "soporte") | Segmentos para campañas concretas ("Promo Junio", "Clientes 2025") |
| **Manejo** | Asignás / removés en cualquier momento | Manuales o auto-pobladas por reglas |

## Tags — atributos rápidos

Un **tag** es una etiqueta corta que aplicás a contactos para
**descriptivamente categorizarlos**.

### Casos típicos

- Comportamiento: `clicker`, `opener`, `dormant`
- Características: `vip`, `b2b`, `b2c`, `enterprise`
- Estado del journey: `lead`, `cliente`, `churned`
- Preferencias: `idioma:es`, `idioma:en`, `recibir-newsletter`
- Origen: `landing-marzo`, `evento-2026`, `referido`

### Agregar tags

#### Manualmente a un contacto

1. **Contactos** → click en el contacto → sección Tags
2. Tipeás un tag nuevo o seleccionás de los existentes
3. Enter para agregar

#### Masivamente desde el listado

1. **Contactos** → seleccionás varios (checkboxes)
2. **Acciones masivas** → **"Agregar tag"**
3. Tipeás el tag
4. **Aplicar**

#### Auto al importar

En el CSV, agregá una columna `tags` separada por `;`:

```csv
email,nombre,tags
juan@x.com,Juan,vip;b2b;español
maria@y.com,María,lead;evento-2026
```

Massivo parsea y aplica los tags al importar.

#### Auto desde el bot

En el bot, podés agregar tags con un nodo `HTTP` que llame a la API de
Massivo:

```yaml
kind: HTTP
method: POST
url: "https://api.massivo.app/api/contacts/{{contactId}}/tags"
body:
  tags: ["interesado", "campaña-junio"]
```

(Próximamente este será un nodo nativo `ADD_TAG`).

### Filtrar contactos por tag

En **Contactos**, usás el filtro de tags arriba de la tabla:

- Seleccionás 1 o más tags
- La lista te muestra solo contactos que **tienen TODOS los tags
  seleccionados** (AND)

Para OR, hoy no hay UI nativa — exportás y filtrás en planilla, o
usás API.

### Buenas prácticas con tags

- **Naming convention consistente**: `idioma:es` mejor que mezclar
  `español`, `es`, `spanish`
- **No multipliques tags innecesarios**: 50 tags poco usados son menos
  útiles que 10 bien definidos
- **Documentá significado** en una guía interna del team

## Listas — segmentos para campañas

Una **lista** es una agrupación de contactos para fines específicos,
típicamente para **mandarles una campaña**.

### Casos típicos

- "Newsletter mensual" — todos los que opt-in a recibir el newsletter
- "Promo Junio 2026" — destinatarios de la campaña específica
- "Clientes premium activos" — segmento para upsells
- "Lead frío" — para flow de re-engagement

### Tipos de lista

**Lista manual**:

- Vos agregás / sacás contactos uno por uno (o masivo)
- No tiene reglas, es estática

**Lista dinámica** (próximamente):

- Definís reglas: "todos los contactos con tag `vip` y que abrieron en
  los últimos 30 días"
- La lista se actualiza automáticamente a medida que contactos
  matchean o dejan de matchear

Hoy solo soportamos manuales. Si necesitás dinámicas, escribinos.

### Crear una lista

1. **Contactos → Listas** → **"Nueva lista"**
2. **Nombre**: identificador
3. **Descripción** (opcional)
4. **Crear**

### Agregar contactos a una lista

**Desde el detalle de la lista**:

1. Abrí la lista
2. **"Agregar contactos"** → seleccionás de tu base
3. **Importar CSV** — sube un CSV de emails / teléfonos para agregar

**Desde el listado de contactos**:

1. Seleccionás varios
2. **Acciones masivas → Agregar a lista**
3. Elegís cuál

**Desde una campaña**:

Cuando creás una campaña y cargás contactos por CSV, opcionalmente
**guardás esa lista** para reutilizar:

- Checkbox "Guardar como lista" al cargar
- Nombre de la lista nueva
- Próxima vez podés mandar otra campaña a la misma lista sin re-importar

### Usar una lista en una campaña

Al crear una campaña:

- **En vez de cargar CSV**, click "Cargar desde lista existente"
- Elegís la lista
- Todos los contactos de la lista quedan asociados a la campaña

### Compartir listas entre teams

Hoy no es posible — las listas viven a nivel team. Si querés
compartir, exportás y volvés a importar en el otro team.

## Tags vs listas — ejemplo combinado

Un caso real:

- **Tags por características**:
  - `vip` (cliente premium)
  - `idioma:es` o `idioma:en`
  - `ubicacion:ARG` o `ubicacion:MX`

- **Listas para campañas**:
  - "Black Friday 2026" — sus integrantes los definís uniendo filtros:
    contactos con tag `cliente` activos en los últimos 6 meses, en
    `ARG` con `idioma:es`

Los tags son **atributos persistentes**. Las listas son **agrupaciones
para una acción**.

## Limitaciones actuales

- Tags y listas son a nivel **team**, no cross-team
- No hay **listas dinámicas** todavía (auto-pobladas por reglas)
- No hay UI nativa para filtros **OR** entre tags
- Máximo **50 tags por contacto** (límite blando, raramente alcanzado)

## Próximos pasos

- 🛠 [Importar contactos por CSV](../importar-csv) — la fuente
  principal de pobladores
- 🔍 [Buscar y filtrar contactos](../buscar-y-filtrar) usando tags
- 📊 [Reportes de contactos](../reportes) — análisis por segmento
