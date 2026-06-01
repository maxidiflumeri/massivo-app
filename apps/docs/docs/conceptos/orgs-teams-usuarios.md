---
title: Organizaciones, Teams y usuarios
sidebar_position: 1
---

# Organizaciones, Teams y usuarios

Massivo es una plataforma **multi-tenant**: cada cliente vive en su propio
espacio aislado, sin ver datos de otros. La estructura es jerárquica:

```
Organización
  ├── Team 1
  │   ├── Cuentas SMTP, dominios, templates, campañas, bots, contactos…
  │   └── Usuarios asignados al team
  └── Team 2
      └── Idem
```

## Organización (`Organization`)

Es el **espacio principal** de tu cuenta. Una organización contiene:

- Uno o más **teams**
- Los **dominios de envío** verificados en SES (compartidos por toda la org)
- El **plan contratado** (Free / Starter / Business / Enterprise)
- Los **miembros** de la cuenta
- La configuración general (slug público para webhooks, status, etc.)

**Ejemplos**:

- Una PyME: 1 organización, 1 team. Simple.
- Una agencia con 5 clientes: 1 organización por cliente, cada una con su team
  y sus usuarios.
- Una empresa con división Marketing + Soporte: 1 organización, 2 teams
  (Marketing y Soporte).

## Team

Un team es una **unidad de trabajo aislada** dentro de una organización. Los
datos no se cruzan entre teams:

| Lo que vive en un team | Lo que se comparte a nivel org |
|---|---|
| Cuentas SMTP | Dominios verificados |
| Templates de email y WhatsApp | Plan y límites |
| Campañas | Suscripciones de billing |
| Bots y configuraciones de WhatsApp | Audit log |
| Contactos del email/WhatsApp del team | — |

**Cuándo usar varios teams**:

- Tenés equipos separados (Marketing vs Soporte vs Ventas) que no deben verse
  entre sí.
- Sos una agencia y querés mantener separados los datos de cada cliente.
- Querés probar una nueva estrategia sin contaminar las campañas en vivo.

**Cuándo NO usar varios teams**:

- Sos un usuario individual o un equipo chico: uno solo alcanza.
- Querés dividir solo por permisos (no por aislamiento de datos): mejor usá
  roles.

## Usuario

Cada persona accede a Massivo con su propio **usuario** (autenticado via
Clerk). Un usuario puede:

- Pertenecer a una o varias **organizaciones**
- Tener acceso a uno o varios **teams** dentro de cada organización
- Tener un **rol** distinto en cada lugar

### Roles a nivel organización

| Rol | Puede |
|---|---|
| **OWNER** | Todo. Incluye billing, borrar la organización |
| **ADMIN** | Casi todo menos billing crítico |
| **BILLING** | Cambiar plan, ver facturación |
| **MEMBER** | Solo acceso a los teams que le asignen |

### Roles a nivel team

| Rol | Puede |
|---|---|
| **ADMIN** | Crear/borrar/editar todo lo del team |
| **MEMBER** | Crear y editar campañas, templates, contactos |
| **VIEWER** | Solo lectura |

## Cómo elegir tu estructura

| Tu caso | Estructura sugerida |
|---|---|
| Soy una PyME, uso yo solo o con 1-2 personas | 1 org, 1 team, todos OWNER/ADMIN |
| Tenemos equipos separados de Marketing y Soporte | 1 org, 1 team por equipo, MEMBERs por persona |
| Soy una agencia con varios clientes | 1 org por cliente, 1 team cada una, OWNER vos en todas |
| Soy una agencia y mi cliente quiere ver SUS reportes | 1 org del cliente, MEMBER él con rol VIEWER |

## Próximos pasos

- 📊 Aprendé sobre [planes, límites y consumo](./planes-limites-consumo)
- 🌐 Verificá tu primer dominio en la sección **Email**
