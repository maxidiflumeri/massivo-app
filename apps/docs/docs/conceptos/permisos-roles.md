---
title: Permisos y roles
sidebar_position: 4
---

# Permisos y roles

Los permisos en Massivo se modelan en **2 niveles** jerárquicos:

1. **Rol de organización** — qué podés hacer a nivel cuenta completa
2. **Rol de team** — qué podés hacer dentro de un team específico

Para hacer algo, **necesitás los permisos correspondientes en ambos
niveles** (el más restrictivo gana).

## Roles de organización

Cuando alguien es miembro de una organización, tiene **uno** de estos
roles:

| Rol | Descripción |
|---|---|
| **OWNER** | El dueño de la organización. Puede hacer todo, incluyendo billing y eliminar la organización. Hay al menos 1 OWNER por organización siempre. |
| **ADMIN** | Casi todo lo que un OWNER puede, pero no puede eliminar la organización ni transferir el ownership. |
| **BILLING** | Solo cambiar de plan y ver/descargar facturación. No accede a datos operativos. Útil para invitar a tu contadora o al área de Finanzas. |
| **MEMBER** | Sin permisos a nivel organización. Solo accede a los teams a los que lo inviten explícitamente. **Es el rol por defecto** cuando invitás a alguien. |

## Roles de team

Dentro de cada team al que pertenecés, tenés **uno** de estos roles:

| Rol | Descripción |
|---|---|
| **ADMIN** | Acceso total al team: crear/editar/borrar todo (campañas, templates, contactos, bots, configs, métricas). Puede invitar más miembros al team. |
| **MEMBER** | Crear/editar campañas, templates y contactos. No puede borrar configuración crítica (cuentas SMTP, configs WhatsApp). |
| **VIEWER** | Solo lectura. Ve todo el team pero no puede crear ni modificar nada. |

## Matriz de permisos detallada

### Email

| Acción | Org role mínimo | Team role mínimo |
|---|---|---|
| Crear / editar campaña | — | MEMBER |
| Enviar campaña | — | MEMBER |
| Pausar / reanudar campaña | — | MEMBER |
| Borrar campaña | — | ADMIN |
| Crear / editar template | — | MEMBER |
| Borrar template | — | ADMIN |
| Crear / editar cuenta SMTP | — | ADMIN |
| Borrar cuenta SMTP | — | ADMIN |
| Agregar / borrar dominio | ADMIN | — |
| Ver suppression list | — | MEMBER |
| Agregar a suppression manualmente | — | ADMIN |
| Ver métricas | — | VIEWER |
| Exportar reports | — | MEMBER |

### WhatsApp

| Acción | Org role mínimo | Team role mínimo |
|---|---|---|
| Crear / editar campaña | — | MEMBER |
| Enviar campaña | — | MEMBER |
| Crear / editar template (no aprobado) | — | MEMBER |
| Enviar template a aprobar a Meta | — | ADMIN |
| Crear / editar config (número WApp) | — | ADMIN |
| Borrar config | — | ADMIN |
| Crear / editar bot | — | ADMIN |
| Publicar bot | — | ADMIN |
| Ver inbox | — | VIEWER |
| Responder en inbox | — | MEMBER |
| Asignar conversación | — | MEMBER |
| Marcar como resuelta | — | MEMBER |
| Ver dashboard live | — | VIEWER |

### Datos

| Acción | Org role mínimo | Team role mínimo |
|---|---|---|
| Ver contactos | — | VIEWER |
| Crear / editar contacto manual | — | MEMBER |
| Borrar contacto | — | ADMIN |
| Importar CSV | — | MEMBER |
| Aceptar / rechazar sugerencia de merge | — | MEMBER |
| Ver reportes de contactos | — | VIEWER |

### Cuenta / organización

| Acción | Org role mínimo | Team role mínimo |
|---|---|---|
| Invitar a miembro a la org | ADMIN | — |
| Cambiar rol de miembro | ADMIN | — |
| Remover miembro | ADMIN | — |
| Crear team | ADMIN | — |
| Borrar team | OWNER | — |
| Invitar a miembro a un team | — | ADMIN |
| Ver audit log | ADMIN | — |
| Cambiar de plan | BILLING o superior | — |
| Eliminar la organización | OWNER | — |
| Transferir ownership | OWNER | — |

## Casos comunes

### "Quiero darle acceso a alguien a UNA campaña pero no a todo"

No se puede a nivel campaña individual — el aislamiento es por team. La
opción es crear un team específico para esa campaña y darle acceso a ese
team.

### "Quiero que mi cliente vea SUS métricas pero no pueda editar nada"

Invitalo a tu organización como **MEMBER** (org-level), y agregalo al team
con rol **VIEWER**. Va a poder navegar todo el team en read-only.

### "Quiero contratar a un freelance para que me arme las campañas"

Invitalo como MEMBER de la org, agregalo al team relevante con rol
**MEMBER**. Puede crear y enviar campañas, pero no borra cuentas SMTP ni
configura dominios. Cuando termine el contrato, lo removés del team.

### "Mi contadora necesita ver las facturas pero no los datos"

Invitala como **BILLING** a la organización. Va a ver el panel de
billing y los planes, pero **no entra a ningún team**.

### "Quiero invitar a alguien para que pueda configurar todo desde cero"

Invitalo como **ADMIN** de la organización. Va a poder crear teams,
verificar dominios, invitar a otros, ver audit log. Lo único que no puede:
eliminar la organización o transferir ownership.

## Reglas que aplica el sistema automáticamente

- **Siempre hay al menos 1 OWNER** en cada organización. No podés bajar el
  rol del último OWNER ni removerlo.
- **El que crea la organización** queda automáticamente como OWNER + ADMIN
  del primer team creado.
- **Cuando invitás a alguien nuevo**, por default queda como MEMBER de la
  org (sin acceso a teams hasta que lo agregues explícitamente).
- **Las acciones críticas quedan registradas en el audit log** con quién,
  cuándo, sobre qué recurso.

## Próximos pasos

- 🏢 Volvé a [orgs, teams y usuarios](./orgs-teams-usuarios) si querés
  refrescar el modelo
- 🔒 Aprendé sobre [multi-tenancy](./multi-tenancy) si te interesa entender
  cómo garantizamos el aislamiento
