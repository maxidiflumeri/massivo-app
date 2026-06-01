---
title: Cómo importar contactos por CSV
sidebar_position: 4
---

# Importar contactos por CSV

La forma más rápida de cargar masivamente contactos. Massivo te valida
en vivo, detecta duplicados, y upserteas en una sola pasada.

## Pre-requisitos

- Un archivo CSV con tus contactos
- Saber qué columnas tenés y cómo se llaman

## El flujo básico

1. **Contactos** → **"Importar"** (botón arriba a la derecha)
2. Pegás el CSV o subís el archivo
3. Massivo valida en vivo
4. Confirmás
5. Listo

## Formato del CSV

### Headers (primera fila)

Los nombres de las columnas. Detección **case-insensitive**.

### Columnas reservadas

Estas mapean a campos standard del contacto:

| Columna | Mapea a |
|---|---|
| `email` | Email (lowercase auto) |
| `phone` | Teléfono (normalización a E.164 auto) |
| `name` | Nombre completo |
| `firstName` o `first_name` | Nombre |
| `lastName` o `last_name` | Apellido |
| `externalId` o `external_id` | ID externo |
| `dni` | DNI |
| `cuit` | CUIT |
| `tags` | Tags separados por `;` |

### Cualquier otra columna va al `data`

Ejemplo CSV:

```csv
email,phone,name,empresa,cargo,ciudad
juan@x.com,+5491100,Juan Pérez,ACME,CTO,Buenos Aires
maria@y.com,+5491122,María López,Beta SA,COO,Córdoba
```

Resulta en 2 contactos donde:

- `email`, `phone`, `name` van a los campos standard
- `empresa`, `cargo`, `ciudad` van al `data` JSON:

```json
{
  "empresa": "ACME",
  "cargo": "CTO",
  "ciudad": "Buenos Aires"
}
```

## Validación en vivo

Mientras pegás o subís el CSV, el panel te muestra **en tiempo real**:

- **Filas totales**
- **Filas válidas** (las que se van a importar)
- **Filas con error** + motivos
- **Chips con columnas detectadas**
- **Avisos** si:
  - No hay columna identificadora obligatoria (al menos email, phone,
    dni, cuit, externalId)
  - Email mal formateado
  - Phone no parseable

### Ejemplos de errores

| Error | Causa | Solución |
|---|---|---|
| "Falta email/phone/dni/cuit/externalId" | Fila sin ningún identificador | Agregar al menos uno |
| "Email inválido: `juanX@`" | Falta dominio | Corregir |
| "Phone no parseable: `1234`" | Sin código de país | Agregar +54... |
| "Tag con caracter inválido: `vip!`" | Tags solo lowercase + numbers + `-` y `:` | Sanear |

## Manejo de duplicados

### Identificador único matcheado

Si un contacto del CSV matchea un contacto existente por **algún
identificador único** (email, phone, dni, cuit, externalId):

- **No se crea un duplicado**
- El contacto existente **se actualiza** con los nuevos datos del CSV
- Los datos del CSV **sobreescriben** los existentes campo a campo
- El campo `data` se **mergea** (no se sobreescribe completo)
- Los tags se **suman** (unión)

### Política de override

Por defecto, **el CSV gana** — los datos del CSV pisan los existentes.
Para campos donde el CSV viene vacío, el valor existente **se preserva**
(no se borra).

### Si querés append-only (no actualizar existentes)

En el modal de importación hay un toggle **"Solo crear nuevos, no
actualizar existentes"**:

- Activado: si matchea, se skipea (no se importa esa fila)
- Desactivado (default): si matchea, se updatea

## Importar con tags

Columna `tags` separados por `;`:

```csv
email,name,tags
juan@x.com,Juan,vip;español;buenos-aires
maria@y.com,María,lead;mexico
```

Tags `vip`, `español`, `buenos-aires` se crean si no existen y se
asignan a Juan.

## Importar a una lista específica

Opción en el modal: **"Agregar a lista"**:

- Elegís una lista existente
- O creás una nueva on the fly
- Los contactos importados se agregan a la lista

Útil para campañas: importás los destinatarios directamente a la
lista de la campaña.

## Tamaño máximo

| Plan | Máx por import |
|---|---|
| Free | 1.000 |
| Starter | 10.000 |
| Business | 50.000 |
| Enterprise | Sin límite |

Si tu CSV es más grande, **dividilo** en partes y subí varias veces.

## Encoding

Massivo asume **UTF-8**. Si tu CSV tiene caracteres raros (ñ, acentos)
que se ven mal, abrí el archivo en un editor (VS Code, Sublime) y
**guardalo como UTF-8 sin BOM**.

Excel a veces guarda como CP1252 — convertí antes de subir.

## Separador

Default es coma (`,`). Massivo detecta automáticamente si tu CSV usa
`;` o tab.

## Comillas

Para celdas con coma adentro, usá comillas:

```csv
email,name,direccion
juan@x.com,Juan,"Av. Corrientes 1234, CABA"
```

Para comillas dentro de comillas, escapálas duplicando:

```csv
juan@x.com,Juan,"Dice ""hola"""
```

## Vista previa

Antes de confirmar, el modal te muestra una **vista previa de las
primeras 10 filas** — exactamente como van a quedar.

Chequeá:

- Headers detectados correctamente
- Datos no se corrieron de columna
- Variables del `data` quedan bien

Si algo está mal, **cerrá el modal**, ajustá el CSV, volvé a empezar.

## Tras la importación

Un toast verde te confirma:

- **Cuántos se crearon nuevos**
- **Cuántos se actualizaron** (matched existentes)
- **Cuántos se skipearon** por error
- **Cuántos se skipearon** por toggle "solo crear nuevos"

Si hay errores, podés **descargar el reporte de errores** (CSV con las
filas que fallaron + motivo) para corregir y re-importar.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Demasiadas filas para tu plan" | Plan limita import | Dividir en partes |
| "Encoding inválido" | CSV no es UTF-8 | Re-guardalo como UTF-8 |
| Tildes salen como `Ã¡` o `Ã±` | Mismo problema | Idem |
| "Phone no parseable" para muchas filas | Formato de tel no incluye país | Agregar prefijo `+54` o equivalente |
| Tags no se aplican | Caracteres inválidos en el tag | Solo lowercase, números, `-` y `:` |

## Importación recurrente / programada

Si tenés que importar el mismo CSV semanalmente (de tu CRM, por
ejemplo), considerá:

- **API endpoint**: hoy `POST /api/contacts/import` desde tu sistema
- **Sync con CRM** (próximamente): integraciones nativas con HubSpot,
  Pipedrive, etc.

## Próximos pasos

- 🔍 [Buscar y filtrar contactos](./buscar-y-filtrar) los que acabás
  de importar
- 🔄 [Sugerencias de merge](./conceptos/merge-suggestions) si tu
  import generó duplicados
- 📊 [Reportes](./reportes) para análisis post-import
