---
title: Gestionar duplicados
sidebar_position: 6
---

# Gestionar duplicados

Hay 3 mecanismos para resolver duplicados:

1. **Auto-merge** al importar (cuando matchea identificador único)
2. **Sugerencias de merge** para casos dudosos
3. **Merge manual** cuando lo detectás vos

## Auto-merge (automático)

Sin que vos hagas nada — cuando importás o creás un contacto que ya
existe por **identificador único** (email, phone, DNI, CUIT, externalId),
se updatea en lugar de duplicar.

Ver [Importar CSV](./importar-csv#manejo-de-duplicados).

## Sugerencias de merge

Para casos donde Massivo detecta posibles duplicados pero no son
100% seguros, te da una sugerencia que vos aceptás o rechazás.

Ver [Sugerencias de merge](./conceptos/merge-suggestions).

## Merge manual

Si encontrás un duplicado **navegando** la base y querés mergearlos
sin esperar la sugerencia automática:

### Cómo hacerlo

1. **Contactos** → encontrá los 2 (o más) contactos a mergear
2. Seleccionalos con checkboxes
3. **Acciones masivas → Mergear**
4. Te muestra el editor de merge:
   - **Elegí el contacto "ganador"** (el que queda)
   - **Para cada campo conflictivo**, elegís qué valor preservar
   - **Tags y listas se unifican** automáticamente
   - **Data JSON se mergea campo a campo** con tu decisión
5. **Confirmar**

Los otros contactos se borran, todos los envíos históricos se
re-asignan al ganador.

### Caveats — igual que merge desde sugerencia

- **Es destructivo**: los perdedores se borran
- **No se puede deshacer** automáticamente
- **Hacé export antes** si tenés dudas (para rollback manual)

## Encontrar duplicados que el sistema no detectó

A veces hay duplicados que **ni el auto-merge ni las sugerencias
detectan**. Casos comunes:

- Mismo contacto con typo en el nombre ("Juan Pérez" vs "Juan Peréz")
- Variantes ortográficas ("María José" vs "Maria Jose")
- Distintos emails de la misma persona ("juan.perez@x.com" vs
  "juanperez@x.com")

### Workflow para encontrarlos

1. **Exportá** tu base completa a CSV
2. Abrilo en Excel / Google Sheets
3. Ordená por nombre o email
4. Visualmente identificás candidatos
5. En el panel, buscás por nombre, encontrás los duplicados, mergeás
   manual

Para bases grandes (50k+), esto se vuelve impráctico — considerá:

- Herramientas de matching fuzzy (Talend, OpenRefine)
- Algoritmos custom de tu lado
- API de Massivo + scripting

## Política de tratamiento

### Mergear vs borrar — cuándo cada uno

| Caso | Acción |
|---|---|
| Detectaste que sí son la misma persona | Merge |
| Detectaste que NO son la misma persona pero matchearon | Rechazar la sugerencia |
| Contacto duplicado pero es spam / fake | Borrar uno (no mergear) |
| Contactos viejos sin actividad | Borrar masivo |

### Antes de mergear masivo

Hacé **backup** de tu base de contactos:

1. **Contactos → Exportar → Todos** → CSV
2. Guardalo localmente con fecha (ej. `contactos-backup-2026-06-01.csv`)
3. Después hacés el merge masivo
4. Si algo sale mal, podés re-importar el backup (sí, vas a generar
   duplicados a la inversa, pero tenés tus datos a salvo)

## Auditoría de merges

Cada merge queda en **Cuenta → Audit log**:

- Quién lo hizo (usuario o sistema)
- Cuándo
- IDs originales de los contactos
- Campos preservados
- Tags y listas que se unificaron

Útil para compliance y para post-mortems.

## El caso especial — borrar duplicado en vez de mergear

Si los 2 contactos son **independientes** (uno legítimo, uno spam o
test), no querés mergear — querés **borrar uno**.

1. Encontrá el "malo" (spam, test, etc.)
2. Detalle → **Borrar**
3. El borrado **NO afecta al otro**

El borrado **es destructivo**:

- El contacto desaparece de la base
- Los envíos históricos que tenía quedan **huérfanos** (`contactId`
  null en EmailReport / WapiReport) — siguen existiendo pero no podés
  navegar al contacto
- Las suppression entries del email/phone **permanecen** (no se borran)

Si te equivocás borrando, necesitás re-importar.

## Próximos pasos

- 🔄 [Sugerencias de merge](./conceptos/merge-suggestions) — workflow
  automatizado
- 🛠 [Importar CSV](./importar-csv) — el principal vector de duplicados
  para prevenir
- 📊 [Reportes](./reportes) para detectar bases "sucias"
