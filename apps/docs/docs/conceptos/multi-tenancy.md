---
title: Multi-tenancy y aislamiento
sidebar_position: 3
---

# Multi-tenancy y aislamiento de datos

Massivo es una plataforma **multi-tenant**: muchas organizaciones (clientes,
agencias, empresas) usan la misma infra al mismo tiempo, pero los datos
están **completamente aislados** entre ellos.

Esto es un detalle técnico, pero importa entenderlo porque:

- Define **qué puede ver cada usuario**
- Define **cómo se factura el consumo**
- Es la base de cómo te recomendamos estructurar tu organización si sos
  una agencia con varios clientes

## ¿Qué significa "multi-tenant"?

Imaginate que vivís en un edificio. Cada departamento es **una
organización**:

- Cada uno tiene **su propia llave** (autenticación)
- Cada uno tiene **sus propias cosas adentro** (datos)
- Nadie puede entrar al departamento de otro
- Pero todos comparten el ascensor, la electricidad, el portero (la infra)

En software, "multi-tenant" significa exactamente eso: misma plataforma,
datos separados.

## Cómo funciona el aislamiento en Massivo

### A nivel organización

Tu organización tiene:

- **Sus contactos** — los de la organización A no aparecen en la B
- **Sus dominios verificados** — el dominio que verificaste vos no le sirve
  a otra organización (cada una tiene que verificar los suyos)
- **Sus campañas, templates, bots, métricas, audit log**
- **Su consumo y plan**

Aunque varias organizaciones corran en la misma instancia técnica, **no hay
forma técnica de que vean datos entre sí**. Toda query a la base de datos
filtra por `organizationId` automáticamente — no es una decisión que el
desarrollador tome cada vez, es una garantía de la plataforma.

### A nivel team

Dentro de una organización, los **teams también están aislados entre sí**
para la mayoría de los recursos:

| Recurso | Aislado por team | Compartido org-wide |
|---|---|---|
| Cuentas SMTP | ✅ | |
| Templates de email | ✅ | |
| Templates de WhatsApp | ✅ | |
| Campañas | ✅ | |
| Bots | ✅ | |
| Configs de WhatsApp | ✅ | |
| Contactos | ✅ | |
| Tags / listas | ✅ | |
| Dominios verificados | | ✅ |
| Plan y límites | | ✅ |
| Audit log | | ✅ (lo ven solo OWNER/ADMIN) |
| Miembros de la org | | ✅ |

**Ejemplo práctico**: Si tu organización tiene team "Marketing" y team
"Soporte", una persona MEMBER de Marketing **no ve** las campañas, contactos
ni bots de Soporte. Pero ambos teams **comparten** el dominio
`empresa.com` que verificó el OWNER de la organización.

## Por qué importa para vos

### Si sos una PyME con tu propio negocio

Probablemente con **1 organización + 1 team** te alcance. Todos los
usuarios del team ven todo. Mucho más simple.

### Si sos una agencia con varios clientes

Tenés **2 maneras** de modelarlo, cada una con trade-offs:

**Opción A — 1 organización por cliente** (recomendada)

```
Tu agencia
  ├── Organización "Cliente ACME"
  │     └── Team "Default"
  ├── Organización "Cliente Beta"
  │     └── Team "Default"
  └── Organización "Cliente Gamma"
        └── Team "Default"
```

- Vos sos OWNER en las 3 organizaciones
- Tu cliente puede tener acceso a su propia organización (o no, si lo
  manejás vos solo)
- **Cada cliente tiene su propio plan y consumo** — facturás por separado
- **Aislamiento total** entre clientes

**Opción B — 1 organización con 1 team por cliente** (no recomendada)

```
Tu agencia
  └── Organización "Mi agencia"
        ├── Team "ACME"
        ├── Team "Beta"
        └── Team "Gamma"
```

- **Un solo plan compartido** entre todos los clientes — más barato pero
  el consumo se mezcla
- Más complejo invitar a un cliente al panel sin que vea los otros
- Útil si todos los "clientes" son en realidad **divisiones internas** de
  una misma empresa, no clientes externos

### Si sos un cliente final invitado

Si te invitaron a una organización, vas a ver solo la información de **esa
organización específica**. Si sos parte de varias (ej. en tu trabajo y en
un proyecto personal), las cambiás desde el selector arriba a la izquierda.

## Lo que el aislamiento te garantiza

- **Privacidad**: tus contactos, campañas y métricas no son visibles para
  otras organizaciones, ni siquiera para nosotros como operadores de la
  plataforma (excepto cuando vos nos pedís soporte y nos das acceso
  explícito).
- **Compliance**: cumplir GDPR, LGPD, ARG. Habeas Data es viable porque tus
  datos están técnicamente separados.
- **No interferencia**: si otra organización tiene un bug, una racha de
  bounces, o una campaña con alto volumen, **no afecta la tuya**.

## Lo que el aislamiento NO te garantiza (todavía)

Hay 2 cosas que están compartidas a nivel infra y que en algún momento
vamos a aislar mejor:

1. **Reputación de envío en SES**: actualmente todos los dominios
   verificados de Massivo conviven en la misma cuenta AWS. Si una
   organización tiene >5% de bounce o >0.1% de quejas, eventualmente afecta
   la reputación de toda la cuenta. Por eso **monitoreamos activamente** y
   eventualmente vamos a ofrecer **dedicated IPs** premium.

2. **Recursos de cómputo**: en planes Free/Starter compartís infra de
   cómputo. En Business/Enterprise eventualmente vamos a ofrecer
   workers dedicados.

## Próximos pasos

- 👥 Entendé bien [orgs, teams y usuarios](./orgs-teams-usuarios)
- 🔐 Mirá la matriz de [permisos y roles](./permisos-roles)
- 📊 Aprendé sobre [planes y límites](./planes-limites-consumo)
