---
title: Buscar y filtrar contactos
sidebar_position: 5
---

# Buscar y filtrar contactos

A medida que tu base crece (mil, diez mil, cien mil contactos),
**encontrar uno específico o un segmento** se vuelve crítico. Massivo
te da búsqueda + filtros combinables.

## La pantalla principal

**Contactos** (sidebar). Vas a ver:

- **Buscador** arriba — para búsquedas rápidas
- **Filtros** debajo — para segmentar
- **Tabla** con resultados — paginada
- **Acciones masivas** sobre los seleccionados

## Búsqueda rápida

El input grande arriba — usá para buscar **un contacto específico**:

- **Email** (parcial o completo)
- **Teléfono** (parcial o completo, ignora formato)
- **Nombre** (parcial)
- **DNI** o **CUIT** (exacto)
- **External ID** (exacto)

Ejemplos:

| Buscás | Tipeás |
|---|---|
| Un contacto por email | `juan@empresa` |
| Por teléfono | `911100` (sin código país está OK) |
| Por nombre | `juan p` (matchea Juan Pérez, Juan Paz) |
| Por DNI | `12345678` |

Es **case-insensitive** y matchea **substring** (no exact por
default).

## Filtros combinables

Debajo del buscador, hay chips de filtro:

### Por canal

- **Solo con email** (tienen `email` no null)
- **Solo con phone** (tienen `phone` no null)
- **Ambos** (tienen los dos)

Útil para campañas — si vas a mandar email, querés solo los que tienen
email.

### Por tags

Multi-select:

- Elegís 1 o más tags
- Matchea contactos que tienen **TODOS** los tags seleccionados (AND)

Para OR entre tags, hoy no hay UI nativa (workaround: exportar y
filtrar en planilla).

### Por listas

Elegís una lista existente. Filtra a los contactos miembros de esa
lista.

### Por estado de suppression

- **Activos** (no en suppression list)
- **En suppression** (algún canal)
- **Solo email suppression**
- **Solo WhatsApp suppression**

### Por fecha

- **Creados en** un rango de fechas
- **Modificados en** un rango de fechas

Útil para "los que cargué la semana pasada".

### Por engagement (próximamente)

- **Abrieron un mail en últimos N días**
- **Clickearon un link en últimos N días**
- **No abrieron en últimos N días** (dormidos)
- **Respondieron WhatsApp en últimos N días**

## Combinar filtros + búsqueda

Los filtros se aplican **en conjunto** (AND).

Ejemplo:

- Búsqueda: `gmail.com`
- Tag: `vip`
- Solo con email: sí
- Creados en últimos 30 días

Te da todos los contactos con email de Gmail, que tienen tag vip, que
están activos en email, creados en último mes.

## Vista tabla

Las columnas que ves son configurables:

| Columna | Mostrar |
|---|---|
| Email | Por default |
| Phone | Por default |
| Name | Por default |
| Tags | Por default (chips) |
| Creado | Por default |
| Modificado | Configurable |
| External ID | Configurable |
| DNI / CUIT | Configurable |
| Campos del `data` (ej. `empresa`, `ciudad`) | Configurable |

Click en el icono de columnas (arriba a la derecha de la tabla) para
mostrar / ocultar.

### Ordenar

Click en el header de cualquier columna para ordenar asc / desc.

### Paginación

- **20 filas** por página por default
- Botón abajo para cambiar a 50 / 100
- Navegación con flechas

## Acciones individuales por contacto

Click en una fila → te abre el **detalle**:

- Datos básicos editables
- Tags asignables
- Listas en las que está
- **Historial 360**:
  - Email: campañas, opens, clicks
  - WhatsApp: campañas, conversaciones, status
- Audit log relacionado

Desde el detalle podés:

- **Editar** datos
- **Agregar/sacar** tags y listas
- **Borrar** contacto
- **Agregar a suppression**
- **Ver historial**

## Acciones masivas

Seleccionás varios contactos (checkboxes) y arriba de la tabla aparece
una toolbar:

| Acción | Qué hace |
|---|---|
| **Agregar tag** | Aplica un tag a todos los seleccionados |
| **Remover tag** | Saca un tag |
| **Agregar a lista** | Adiciona a una lista existente o nueva |
| **Remover de lista** | Saca de una lista |
| **Exportar** | Bajás un CSV con los seleccionados |
| **Borrar** | Borra masivo (con confirmación) |
| **Agregar a suppression** | Bloquea masivo |

### Selección rápida

- **Todos en la página actual**: checkbox del header
- **Todos los que matchean los filtros actuales** (incluso fuera de la
  paginación): botón "Seleccionar todos los X resultados"

Cuidado con borrados masivos sobre **TODOS los resultados** — confirma
2 veces.

## Exportar

Click **Exportar** te baja CSV con:

- Columnas standard del contacto
- Campos del `data` desplegados como columnas separadas
- Tags concatenados con `;`

Opciones:

- **Solo seleccionados** (si tenías selección)
- **Todos los que matchean filtros actuales**
- **Todos los contactos** (sin filtros)

Tamaño máximo según plan (igual que import).

## Vista por columnas del data

Si tus contactos tienen campos en `data` (ej. `empresa`, `ciudad`),
podés:

1. Click en config de columnas
2. **"Mostrar campos del data"**
3. Elegís cuáles agregar como columnas

Útil para tener vista tipo CRM con campos personalizados.

## Performance

Con **1.000 contactos**: instantáneo.

Con **10.000 contactos**: filtros y búsqueda responden en menos de 1
seg.

Con **100.000+**:

- Búsqueda por **identificador único** (email, phone, DNI) sigue
  instantánea (índices de DB)
- Búsqueda por **nombre** o **substring de email** puede tardar 2-5
  seg
- Considerá **listas pre-segmentadas** en vez de filtros on-the-fly
  para casos frecuentes

## Próximos pasos

- 🛠 [Importar más contactos por CSV](./importar-csv)
- 🏷️ [Listas y tags](./conceptos/listas-y-tags) para segmentar mejor
- 📊 [Reportes](./reportes) para análisis agregado
