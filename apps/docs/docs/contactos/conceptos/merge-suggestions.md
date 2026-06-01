---
title: Sugerencias de merge (deduplicación)
sidebar_position: 2
---

# Sugerencias de merge (deduplicación)

Cuando Massivo detecta que **2 o más contactos podrían ser la misma
persona**, genera una **sugerencia de merge** que vos tenés que
aceptar o rechazar manualmente.

A diferencia del **merge automático** (que pasa cuando un identificador
clave matchea), las sugerencias son para casos **dudosos** que
requieren tu criterio.

## Cuándo se genera una sugerencia

Massivo escanea tus contactos periódicamente y detecta:

- **Mismo email** en 2 contactos (después de normalización)
- **Mismo phone** en 2 contactos (después de E.164)
- **Mismo nombre completo** + **algún otro campo en común**
- **Mismo DNI** o **mismo CUIT** sin que estén ya linkeados

## Estados de una sugerencia

| Estado | Significa |
|---|---|
| `PENDING` | Massivo la detectó, esperando tu decisión |
| `ACCEPTED` | Vos aceptaste — los contactos se mergearon |
| `REJECTED` | Vos rechazaste — Massivo NO vuelve a sugerir lo mismo |

## Tipos de match

Cada sugerencia tiene un `matchType`:

| Tipo | Confianza |
|---|---|
| `EMAIL` | Mismo email — alta confianza |
| `PHONE` | Mismo teléfono — alta confianza |
| `DNI` | Mismo DNI — muy alta |
| `CUIT` | Mismo CUIT — muy alta |
| `NAME` | Mismo nombre completo — baja (muchos nombres se repiten) |

## Acceder al panel de sugerencias

**Contactos → Sugerencias de merge** en el sidebar (o desde el banner
arriba del listado cuando hay sugerencias pending).

Vas a ver una lista de pares con:

- **Contact A** vs **Contact B** (los 2 candidatos)
- **Match type** (cómo se detectó)
- **Campos que coinciden** (highlighted)
- **Campos que NO coinciden** (para que evalúes si son la misma persona)
- **Cuándo se detectó**

## Aceptar una sugerencia

Click **"Aceptar y mergear"**:

1. Massivo te muestra el **contacto resultante**: una combinación de
   los campos de ambos, con tu decisión campo por campo
2. Para cada campo donde ambos contactos tenían valor (distinto):
   - "Email de A" vs "Email de B" → vos elegís cuál
   - "Phone de A" vs "Phone de B" → vos elegís cuál
3. Para tags y listas: se **unifican** (unión)
4. Para el `data` JSON: se **mergean campo a campo** (vos elegís
   conflictos)
5. **Confirmar merge**:
   - El contacto "ganador" se actualiza con la decisión
   - El otro contacto se **borra**
   - El historial de envíos se **re-asigna** al ganador
   - El audit log registra el merge

### El merge no se puede deshacer

:::warning Es destructivo
Una vez confirmado el merge, **no se puede revertir automáticamente**.
El contacto "perdedor" se borra de la DB.

Si te das cuenta después que era un error, vas a tener que:
- Re-crear el contacto perdedor (con sus datos, que tendrías que tener
  guardados por otro lado)
- Volver a importar tu base original

**Recomendamos**: antes de mergear en masivo, exportá tu base de
contactos (Contactos → Exportar) por si querés rollback manual.
:::

## Rechazar una sugerencia

Click **"Rechazar"**:

- La sugerencia pasa a estado `REJECTED`
- **No se vuelve a sugerir el mismo par**
- Los 2 contactos quedan separados

Útil cuando son personas distintas con coincidencias circunstanciales
(2 "Juan Pérez" en tu base son personas distintas).

## Estrategia recomendada

### Workflow mensual de housekeeping

1. **Una vez al mes**, andá a Sugerencias de merge
2. Revisá los **PENDING**
3. Aceptá los obvios (mismo email + mismo nombre = misma persona)
4. Rechazá los falsos positivos (mismo nombre, distinto todo)
5. **Quedan los dudosos** — investigá caso por caso o dejá pending

Tu base de contactos queda más limpia con el tiempo.

### Antes de una campaña grande

Si vas a mandar una campaña grande a tu base completa, **chequeá
sugerencias pending antes**. Si ignorás y mandás, podés:

- Mandar 2 veces al mismo destinatario (mala UX)
- Consumir cuota duplicada

## Auto-merge agresivo (opcional)

En settings de la organización podés activar **auto-merge agresivo**:

- Massivo mergea **automáticamente** cuando matchType es EMAIL, PHONE,
  DNI o CUIT (los 4 altos confianza)
- Solo te pregunta para `NAME` matches
- Acelera la limpieza pero **NO te pregunta antes** de mergear

:::caution Cuidado con auto-merge
Si tu base tiene casos legítimos donde el mismo email pertenece a 2
personas distintas (caso raro pero existe: emails compartidos
familiares, emails @gmail.com falsos), el auto-merge los va a fusionar
sin preguntarte.
:::

## Auditoría

Cada merge queda registrado en **Cuenta → Audit log**:

- Quién (usuario o automático)
- Cuándo
- Qué contactos se mergearon (IDs originales)
- Qué decisiones se tomaron campo por campo

Útil para compliance y para diagnosticar quejas tipo "alguien borró mi
contacto".

## Próximos pasos

- 🛠 [Importar contactos por CSV](../importar-csv) — la fuente
  principal de nuevos contactos
- 🔄 [Gestionar duplicados manualmente](../gestionar-duplicados) si
  prefieres no usar sugerencias automáticas
- 🏷️ [Listas y tags](./listas-y-tags) para segmentar después del
  cleanup
