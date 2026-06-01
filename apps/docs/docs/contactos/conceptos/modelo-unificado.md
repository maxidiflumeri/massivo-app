---
title: El modelo de contacto unificado
sidebar_position: 1
---

# El modelo de contacto unificado

Un **contacto** en Massivo es una **persona o entidad** con la que te
comunicás. A diferencia de plataformas que tienen "contactos de email"
y "contactos de WhatsApp" por separado, Massivo usa **un modelo
unificado**: el mismo contacto puede recibir mails y WhatsApps.

Esto te permite:

- Tener una **visión 360° del cliente** (qué le mandaste por email y
  por WhatsApp)
- **Mergear duplicados** automáticamente cuando subiste el mismo
  contacto desde distintas fuentes
- **Tags y listas compartidas** entre los 2 canales

## Qué guarda un contacto

| Campo | Descripción | Obligatorio |
|---|---|---|
| `email` | Email del contacto | — (opcional, pero útil) |
| `phone` | Teléfono en E.164 | — (opcional, pero útil) |
| `name` | Nombre completo | — |
| `firstName` / `lastName` | Componentes del nombre por separado | — |
| `externalId` | Tu ID en sistemas externos (CRM, ERP) | — |
| `dni` | DNI argentino | — |
| `cuit` | CUIT argentino | — |
| `data` | JSON libre con cualquier otro atributo | — |
| `tags` | Etiquetas (ver listas y tags) | — |

**Al menos uno de** `email`, `phone`, `dni`, `cuit`, `externalId` tiene
que estar — para que el contacto se pueda identificar.

## Identificadores únicos

Estos campos son **únicos a nivel team** — no podés tener 2 contactos
con el mismo email en el mismo team:

- `email` (lowercase)
- `phone` (normalizado a E.164)
- `externalId`
- `dni`
- `cuit`

Cuando importás o creás un contacto que matchea uno de estos, Massivo
**no crea duplicado** — actualiza el existente.

## El campo `data` — JSON libre

Para cualquier atributo que no esté en los campos standard, usás `data`:

```json
{
  "empresa": "ACME",
  "cargo": "CTO",
  "ciudad": "Buenos Aires",
  "fechaAlta": "2026-01-15",
  "ltv": 25000,
  "preferenciaIdioma": "es"
}
```

Estos atributos quedan disponibles como **variables** en:

- Templates de email (`{{empresa}}`, `{{cargo}}`)
- Templates de WhatsApp
- Mensajes de bots (`{{contact.data.empresa}}`)

## Cómo se crean los contactos

| Vía | Cuándo |
|---|---|
| **Importar CSV** | Manual, al subir un archivo en Contactos o Campañas |
| **Carga en campaña** | Cuando cargás contactos en una campaña, también se upsertean en tu base |
| **API** (próximamente) | Para sincronizar automáticamente desde tu CRM |
| **WhatsApp inbound** | Si llega un mensaje de un teléfono que no tenés, se crea contacto auto con solo el `phone` |

## Mergeo automático cross-canal

Cuando subís contactos desde fuentes distintas, Massivo intenta
**mergear** automáticamente:

### Ejemplo

Hoy a las 10:00 subiste un CSV con:

```csv
email,nombre
juan@empresa.com,Juan Pérez
```

Crea: `Contact_X { email: "juan@empresa.com", name: "Juan Pérez" }`.

Hoy a las 14:00 cargás otra campaña de WhatsApp con:

```csv
phone,nombre,email
+5491100,Juan,juan@empresa.com
```

Massivo detecta que **ese email ya existe** → **actualiza** `Contact_X`
con `phone: "+5491100"`. **No crea un duplicado**.

Resultado: `Contact_X { email, phone, name }` — un solo registro
unificado.

### Cuando no puede mergear automático

Si los identificadores no matchean exact, Massivo **no mergea** sin
preguntarte, pero te muestra una **sugerencia de merge** (ver
[merge suggestions](./merge-suggestions)).

Ejemplo:

- Contact A: `email: juan@empresa.com, name: Juan Pérez`
- Contact B: `phone: +5491100, name: Juan Pérez`

Mismo nombre, **distinto identificador**. Massivo te sugiere:
"Estos 2 parecen ser la misma persona, ¿querés mergearlos?"
Vos decidís.

## Aislamiento por team

Los contactos viven a nivel team:

- El team Marketing tiene sus contactos
- El team Ventas tiene los suyos
- **No se ven entre teams**

Si querés compartir contactos cross-team, hoy lo hacés exportando+
importando entre teams. Está en roadmap permitir contactos
"compartidos a nivel org".

## Visión 360°

En el detalle de un contacto (Contactos → click un row) vas a ver:

- **Datos básicos**: email, phone, nombre, identifiers
- **Tags y listas** asignadas
- **Historial de envíos**:
  - Email: campañas en las que estuvo, opens / clicks
  - WhatsApp: campañas, conversaciones, status de mensajes
- **Variables del `data`** prolijamente mostradas
- **Audit log relacionado** (quién lo creó, quién lo editó)

Esta vista te da un **registro completo de tu relación** con ese
contacto.

## Próximos pasos

- 🔄 [Sugerencias de merge](./merge-suggestions) cuando hay duplicados
  detectables
- 🏷️ [Listas y tags](./listas-y-tags) para segmentar
- 🛠 [Importar contactos por CSV](../importar-csv)
