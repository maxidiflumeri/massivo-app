---
title: Gestionar usuarios del team
sidebar_position: 1
---

# Gestionar usuarios del team

Cómo **invitar** nuevos miembros, **cambiar sus roles**, y
**removerlos** cuando ya no necesitan acceso. Solo OWNERs y ADMINs de la
org pueden hacer esto.

Ver [Permisos y roles](../conceptos/permisos-roles) para entender bien
qué puede hacer cada rol.

## Quién puede gestionar usuarios

| Rol | Puede invitar nuevos | Puede cambiar roles | Puede remover |
|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ (excepto OWNERs) | ✅ (excepto OWNERs) |
| BILLING | ❌ | ❌ | ❌ |
| MEMBER | ❌ | ❌ | ❌ |

## Acceder a la gestión

Hoy no hay una pantalla "Configuración → Usuarios" propia — esto se
maneja desde el **panel de Clerk integrado**. Lo ves:

1. Click en tu **avatar** (arriba a la derecha)
2. **Gestionar organización**
3. Tab **Miembros**

Ahí ves todos los miembros con sus roles.

:::info Próximamente: Configuración nativa
Estamos trabajando en una pantalla "Configuración → Usuarios" propia
de Massivo con UI más integrada al panel y permisos más finos.
Mientras tanto, el panel de Clerk cumple la función.
:::

## Invitar a alguien nuevo

1. En el panel de organización → **Miembros** → **"Invitar miembro"**
2. **Email** de la persona
3. **Rol a nivel organización**: elegí entre:
   - **OWNER** (todo)
   - **ADMIN** (todo menos billing crítico + eliminar org)
   - **BILLING** (solo facturación, sin acceso a datos)
   - **MEMBER** (sin acceso a nada hasta que lo agregues a un team)
4. **Enviar invitación**

La persona recibe un **email con link de invitación**:

- Si **ya tiene cuenta** en Clerk, se loguea y acepta — entra a tu org
- Si **no tiene cuenta**, primero la crea, después acepta y entra

### Tiempo de expiración de la invitación

7 días desde el envío. Si no aceptan, **podés re-enviar** desde el
panel (sin cambiar el email).

### Si la invitación no llega

- Pediles que chequeen spam (los mails de Clerk a veces caen ahí)
- En el panel, **"Re-enviar invitación"**
- Si persiste, copiá el link manualmente (botón "Copiar link") y
  mandáselo por otro canal

## Agregar un miembro a un team

Una vez que aceptaron la invitación a la org, **todavía no tienen
acceso a ningún team**.

1. En el panel de la organización → **Teams** → click el team al que
   querés agregarlo
2. **"Agregar miembro"** → seleccioná de los miembros de la org
3. **Rol a nivel team**:
   - **ADMIN** (todo dentro del team)
   - **MEMBER** (crear/editar campañas, sin borrar configs críticas)
   - **VIEWER** (solo lectura)
4. **Guardar**

A partir de ahora, el usuario ve el team en su selector y puede
trabajar según su rol.

## Cambiar el rol de alguien

### Cambiar rol a nivel organización

1. **Miembros** → click en el usuario
2. **Cambiar rol** → seleccioná el nuevo
3. Confirmás

El cambio es **inmediato**. En su próxima request, el sistema valida
el nuevo rol.

### Cambiar rol a nivel team

1. **Teams** → click el team → **Miembros**
2. Click en el usuario → **Cambiar rol**
3. Elegí nuevo rol
4. Confirmás

### Reglas

- **Siempre tiene que haber al menos 1 OWNER** en la org — no podés
  bajar el rol del último
- Un MEMBER de la org sin acceso a ningún team **no puede usar el
  panel** (entra y no ve nada)

## Remover un miembro

### De un team específico

1. **Teams → click team → Miembros** → click en el usuario
2. **"Remover del team"**
3. Confirmás

El usuario **pierde acceso a ese team** pero **sigue siendo miembro
de la org**.

### De toda la organización

1. **Miembros** → click el usuario
2. **"Remover de la organización"**
3. Confirmás

El usuario **pierde acceso completo** a tu org. Si pertenece a otras
orgs, sigue teniendo acceso a esas.

**No se borra su cuenta de Massivo** — solo deja de pertenecer a tu
organización.

### Qué pasa con su trabajo

- Las **campañas que creó** quedan asociadas a la org (no se borran)
- El **audit log** sigue mostrándolo como creador histórico
- Si era el **único asignado** a conversaciones del inbox, esas
  conversaciones quedan **sin asignar**

Si quien te dejó era una persona clave, **reasigná su trabajo antes
de removerlo**:

- Re-asignar conversaciones del inbox a otros agentes
- Cambiar `createdByUserId` de campañas a otro (manual via API)

## Auto-remoción

Un usuario puede **salir de la org por su cuenta**:

1. Su avatar → **Gestionar organización**
2. **Abandonar organización**

Útil cuando vos no estás disponible y la persona quiere salir. Tiene
los mismos efectos que si vos los removés.

Si era el único OWNER, **no puede irse** hasta que asigne otro OWNER
primero.

## Audit log

Cada acción (invitar, cambiar rol, remover) **queda en el audit log**:

- Quién hizo la acción
- Cuándo
- Sobre quién (target user)
- Qué cambió (rol antes / después)

Útil para compliance HR.

## Buenas prácticas

### Roles mínimos necesarios

Por seguridad, **dale a cada usuario el rol mínimo que necesita**:

- ¿Alguien va a usar el panel a diario y solo crea campañas? → MEMBER de team
- ¿Necesita administrar números de WhatsApp? → ADMIN de team
- ¿Es de Finanzas y solo necesita ver facturas? → BILLING de org
- ¿Es contratista temporal? → MEMBER + acceso a teams específicos.
  Removelo cuando termine.

### Auditá miembros periódicamente

Cada 3 meses revisá la lista de miembros:

- ¿Alguien dejó la empresa y se quedó con acceso?
- ¿Alguien cambió de rol interno y necesita menos / más permisos?

### Documentá quién es quién

En empresas medianas / grandes, **mantené un doc interno** que liste:

- Cada miembro del panel
- Su rol y permisos
- Para qué accede

Cuando alguien se va, sabés exactamente qué tocar.

### Manejo de ex-empleados

Cuando alguien deja la empresa:

1. **Removelo de la org** inmediatamente
2. **Reasigná su trabajo** (conversaciones, campañas en DRAFT)
3. **Audita** si tocó algo crítico recientemente
4. **Rotá secrets** si tenía acceso a configs (access tokens de Meta,
   credenciales SMTP)

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "No puedo cambiar el rol del último OWNER" | Regla del sistema | Promové primero a otro a OWNER |
| El invitado no recibe el mail | Spam filter | Re-enviar o copiar link manual |
| El usuario no ve ningún team | Lo invitaste a la org pero no a ningún team | Agregarlo a un team |
| "Member ya existe" | Ya está en la org con otro email | Buscalo en la lista |
| El usuario removido sigue viendo el panel | Cache del browser | Que cierre sesión y reabra |

## Próximos pasos

- 🔐 [Permisos y roles](../conceptos/permisos-roles) — matriz completa
- 📜 [Audit log](./audit-log) — para auditar acciones de miembros
- 💳 [Cambiar plan / billing](./cambiar-plan-billing)
