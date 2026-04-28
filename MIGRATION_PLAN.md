# Massivo App — Plan de Migración a SaaS Multi-Tenant

> **Documento maestro de implementación.** Este plan describe la construcción de **Massivo App**, una plataforma SaaS multi-tenant de envío masivo multicanal (WhatsApp Business API, Email), basada en el código fuente de **AMSA Sender** (sistema interno de Ana Maya SA, que queda congelado y NO se modifica).
>
> Cualquier IA o desarrollador que tome este documento debe poder ejecutar el plan sin contexto adicional.

---

## 1. Contexto y objetivos

### 1.1 Origen

**AMSA Sender** es un sistema desarrollado a medida para Ana Maya SA. Está en producción, vendido al cliente, y NO se debe modificar como parte de esta migración. Sigue su curso de mantenimiento separado.

### 1.2 Producto nuevo: Massivo App

- **Repositorio nuevo** (no se toca AMSA Sender).
- Se parte de un **fork inicial** de AMSA Sender para conservar la lógica de negocio probada (workers, integraciones Meta, tracking de email, inbox, IA), pero refactorizado a multi-tenant desde el día 1.
- **NO migrar datos de AMSA Sender** a Massivo App. Son productos independientes.

### 1.3 Objetivos del MVP de Massivo App

- SaaS multi-tenant con **shared DB + `organizationId` + `teamId`**.
- Onboarding self-service con planes, billing y límites por uso.
- Canales soportados en MVP: **WhatsApp Business API (Meta)** y **Email (SMTP)**.
- **Excluir del MVP**: WhatsApp Web.js (Baileys/wweb) — no escala bien en SaaS, alto costo operativo.
- Auth tercerizada con **Clerk**.
- Permisos finos con **CASL**.
- SMTP de envío propio del SaaS (**AWS SES**) + cuentas remitentes que cada equipo configura para usar como `From`.

### 1.4 Stack target

| Capa            | Tecnología                                           | Notas                                                                        |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Backend         | NestJS 11 + TypeScript estricto                      | Mismo stack base                                                             |
| ORM             | Prisma 6 + PostgreSQL                                | **Cambio**: Postgres en lugar de MySQL (mejor RLS, índices parciales, JSONB) |
| Colas           | BullMQ 5 + Redis 7                                   | Queues prefijadas por `tenantId`                                             |
| Realtime        | Socket.IO 4                                          | Rooms scopeadas por `org:{orgId}:team:{teamId}`                              |
| Frontend        | React 19 + Vite 6 + MUI 7                            | Mismo stack                                                                  |
| Auth            | **Clerk**                                            | Organizations + roles built-in                                               |
| Authz           | **CASL** (`@casl/ability` + `@casl/prisma`)          | Permisos de dominio                                                          |
| Email editor    | Unlayer (react-email-editor)                         | Igual que AMSA                                                               |
| Email transport | AWS SES (SMTP + SNS para webhooks)                   | SES propio del SaaS                                                          |
| WhatsApp API    | Meta Graph API v20+                                  | Tokens por tenant                                                            |
| IA              | Google Gemini 1.5 Flash (o superior)                 | API key por tenant opcional, default del SaaS                                |
| Billing         | **Stripe** (internacional) + **MercadoPago** (LATAM) | Webhooks de subscription                                                     |
| Logging         | Winston                                              | + correlation ID por request                                                 |
| Observabilidad  | OpenTelemetry + Grafana/Loki/Tempo                   | Métricas y trazas por tenant                                                 |
| Errores         | Sentry                                               | Tags `orgId`/`teamId`                                                        |
| Storage         | AWS S3                                               | Adjuntos, exportes, backups por tenant                                       |
| Infra           | Docker + AWS (ECS Fargate o EC2 + ALB)               | Multi-AZ                                                                     |
| CI/CD           | GitHub Actions                                       | Tests + deploy                                                               |
| IaC             | Terraform                                            | Infra como código                                                            |

---

## 2. Modelo de tenancy

### 2.1 Jerarquía

```
Organization (tenant — unidad de billing)
  └── Team (workspace operativo)
        ├── Memberships (User ↔ Team con rol)
        └── Recursos (templates, sender accounts, WAPI configs, contactos, campañas)
User (puede pertenecer a múltiples orgs y múltiples teams dentro de cada org)
```

### 2.2 Reglas duras

1. **Organización** es la unidad de facturación. Plan, suscripción, límites se asocian a la org.
2. **Team** es la unidad de aislamiento de recursos. Templates, contactos, campañas, configs WAPI, cuentas remitentes SMTP cuelgan del team.
3. Toda organización se crea con un team **"General"** automático en el onboarding. Si el plan del cliente no incluye multi-team, la UI oculta la creación de teams adicionales.
4. **Roles a nivel org** (gestionados por Clerk Organizations): `org:owner`, `org:admin`, `org:billing`, `org:member`.
5. **Roles a nivel team** (gestionados en Massivo DB): `team_admin`, `team_member`, `team_viewer`.
6. Un usuario puede tener distinto rol en distintos teams de la misma org.
7. **Permisos finos** (ej: `campaign:delete`, `wapi-config:edit`) se modelan con CASL sobre roles de team + flags del plan.
8. **Toda query a DB DEBE filtrar por `organizationId` Y `teamId`**. Sin excepción. Se enforza vía Prisma extension (ver sección 5.4).
9. **Plan free / individual**: oculta UI de teams, opera siempre sobre el team "General".
10. **No se permite mover recursos entre teams** en el MVP. Feature postergada.

### 2.3 Modelo de datos (Prisma — extracto core)

```prisma
model Organization {
  id              String   @id @default(cuid())
  clerkOrgId      String   @unique
  name            String
  slug            String   @unique
  planId          String
  plan            Plan     @relation(fields: [planId], references: [id])
  stripeCustomerId String? @unique
  status          OrgStatus @default(ACTIVE) // ACTIVE, SUSPENDED, CANCELED
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  teams           Team[]
  memberships     OrgMembership[]
  subscriptions   Subscription[]
  usageCounters   UsageCounter[]
  auditLogs       AuditLog[]

  @@index([status])
}

model Team {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name            String
  slug            String
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())

  memberships     TeamMembership[]
  // Recursos del team:
  wapiConfigs     WapiConfig[]
  smtpAccounts    SmtpAccount[]
  emailTemplates  EmailTemplate[]
  wapiTemplates   WapiTemplate[]
  contacts        Contact[]
  campaigns       Campaign[]
  // ...

  @@unique([organizationId, slug])
  @@index([organizationId])
}

model User {
  id              String   @id @default(cuid())
  clerkUserId     String   @unique
  email           String   @unique
  name            String?
  avatarUrl       String?
  createdAt       DateTime @default(now())

  orgMemberships  OrgMembership[]
  teamMemberships TeamMembership[]
}

model OrgMembership {
  id              String   @id @default(cuid())
  userId          String
  organizationId  String
  role            OrgRole  // OWNER, ADMIN, BILLING, MEMBER
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
}

model TeamMembership {
  id              String   @id @default(cuid())
  userId          String
  teamId          String
  role            TeamRole // ADMIN, MEMBER, VIEWER
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  team            Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, teamId])
}

model Plan {
  id              String   @id @default(cuid())
  code            String   @unique // FREE, STARTER, BUSINESS, ENTERPRISE
  name            String
  priceMonthlyUsd Decimal
  features        Json     // { multiTeam: bool, ssoSaml: bool, ai: bool, ... }
  limits          Json     // { emailsPerMonth, wapiMessagesPerMonth, contacts, teams, members }
  isPublic        Boolean  @default(true)
}

model Subscription {
  id              String   @id @default(cuid())
  organizationId  String
  planId          String
  provider        BillingProvider // STRIPE, MERCADOPAGO
  externalId      String   // stripe sub id o mp preapproval id
  status          SubStatus // ACTIVE, PAST_DUE, CANCELED, TRIALING
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean @default(false)

  organization    Organization @relation(fields: [organizationId], references: [id])
  plan            Plan @relation(fields: [planId], references: [id])

  @@index([organizationId])
}

model UsageCounter {
  id              String   @id @default(cuid())
  organizationId  String
  metric          UsageMetric // EMAILS_SENT, WAPI_MESSAGES_SENT, CONTACTS, AI_TOKENS
  periodStart     DateTime
  periodEnd       DateTime
  value           BigInt   @default(0)

  organization    Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, metric, periodStart])
  @@index([organizationId, metric])
}

model AuditLog {
  id              String   @id @default(cuid())
  organizationId  String
  teamId          String?
  actorUserId     String?
  action          String   // 'campaign.created', 'wapi-config.updated', etc.
  resourceType    String?
  resourceId      String?
  metadata        Json?
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId, createdAt])
  @@index([organizationId, action])
}
```

### 2.4 Modificaciones a modelos heredados de AMSA

Cada modelo de dominio (campañas, contactos, templates, configs, reportes, conversaciones, mensajes, etc.) suma los campos:

```prisma
organizationId  String
teamId          String
organization    Organization @relation(fields: [organizationId], references: [id])
team            Team         @relation(fields: [teamId], references: [id])

@@index([teamId])
@@index([organizationId])
```

**Modelos afectados** (renombrados sin acentos para portabilidad):

- `WapiConfig`, `WapiTemplate`, `WapiCampaign`, `WapiContact`, `WapiReport`, `WapiConversation`, `WapiMessage`, `WapiOptOut`
- `SmtpAccount` (ex `CuentaSMTP`), `EmailTemplate`, `EmailCampaign`, `EmailContact`, `EmailReport`, `EmailEvent`, `EmailBounce`, `EmailUnsubscribe`
- `Contact` (unificado), `Tag`, `ContactList`
- `ScheduledTask`, `TaskExecution`
- `CampaignLog`

---

## 3. Auth con Clerk

### 3.1 Decisiones

- **Clerk** maneja: signup, signin, magic link, OAuth (Google/Microsoft), MFA, passkeys, organizations, invitaciones, SSO/SAML (planes business+).
- La `Organization` de Clerk **es** nuestra `Organization` (1:1, espejada vía webhook).
- El `User` de Clerk se espeja en nuestra DB para poder relacionarlo con `TeamMembership`.
- Clerk **no maneja teams**. Teams son nuestros y se gestionan en Massivo DB.
- Frontend usa `<ClerkProvider>`, `<SignIn>`, `<OrganizationSwitcher>`, `<UserButton>`.
- Backend recibe JWT de Clerk en `Authorization: Bearer <token>`.

### 3.2 Sincronización Clerk ↔ Massivo

Webhook de Clerk → endpoint `/webhooks/clerk` que maneja:

- `user.created` / `user.updated` / `user.deleted`
- `organization.created` / `organization.updated` / `organization.deleted`
- `organizationMembership.created` / `organizationMembership.updated` / `organizationMembership.deleted`

Cada evento se procesa idempotentemente (chequeo por `clerkUserId` / `clerkOrgId`).

### 3.3 Flujo de request autenticado

1. Frontend envía request con `Authorization: Bearer <clerkJwt>` y header `X-Team-Id: <teamId>` (o cookie).
2. `ClerkAuthGuard` (NestJS) valida el JWT contra JWKS de Clerk → extrae `clerkUserId` y `clerkOrgId`.
3. `TenantContextGuard` resuelve `organizationId` (por `clerkOrgId`), valida que el `teamId` solicitado pertenece a esa org y que el user es miembro del team.
4. Inyecta `RequestContext { userId, organizationId, teamId, orgRole, teamRole }` en el request (vía `AsyncLocalStorage`).
5. `CaslAbilityFactory` construye el `Ability` para ese contexto y lo deja disponible.

---

## 4. Authorization con CASL

### 4.1 Modelo

- Subjects: `Campaign`, `Contact`, `Template`, `WapiConfig`, `SmtpAccount`, `Team`, `Organization`, `Member`, `Billing`, `Inbox`, `Analytics`.
- Actions: `manage`, `create`, `read`, `update`, `delete`, `send`, `export`.

### 4.2 Reglas base por rol

```ts
// org-level
if (orgRole === 'OWNER' || orgRole === 'ADMIN') {
  can('manage', 'Organization', { id: orgId });
  can('manage', 'Team', { organizationId: orgId });
  can('manage', 'Member');
}
if (orgRole === 'BILLING' || orgRole === 'OWNER') {
  can('manage', 'Billing', { organizationId: orgId });
}

// team-level
if (teamRole === 'ADMIN') {
  can('manage', 'all', { teamId });
}
if (teamRole === 'MEMBER') {
  can(['create', 'read', 'update', 'send'], ['Campaign', 'Template', 'Contact'], { teamId });
  can('read', ['WapiConfig', 'SmtpAccount', 'Analytics'], { teamId });
}
if (teamRole === 'VIEWER') {
  can('read', 'all', { teamId });
}

// plan gates
if (!plan.features.ai) cannot('use', 'AiFeature');
if (!plan.features.multiTeam) cannot('create', 'Team');
```

### 4.3 Aplicación

- Decorator `@CheckPolicies(...)` en controllers.
- Helper `prismaWithAbility` (`@casl/prisma` `accessibleBy`) para auto-filtrar queries.
- Frontend recibe `permissions` calculados en `/me/context` y los usa para mostrar/ocultar UI (sin reemplazar el check de backend).

---

## 5. Aislamiento de datos y código

### 5.1 Prisma extension obligatoria

Todas las queries de modelos tenant-aware pasan por una **Prisma client extension** que:

- Inyecta `organizationId` y `teamId` desde `AsyncLocalStorage` si no están presentes.
- Rechaza queries de modelos tenant-aware sin esos filtros (modo strict).
- Logging de queries que violan la regla → Sentry alert.

```ts
// backend/src/prisma/tenant-extension.ts
prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = TenantContext.current();
        if (TENANT_AWARE_MODELS.has(model) && ctx) {
          args.where = { ...args.where, organizationId: ctx.organizationId, teamId: ctx.teamId };
        }
        return query(args);
      },
    },
  },
});
```

### 5.2 Decorator para skip explícito

Para operaciones cross-tenant legítimas (admin panel, jobs de billing) se usa `@SkipTenantScope()` que setea un flag en el context.

### 5.3 BullMQ multi-tenant

- Todas las queues llevan prefijo: `bull:{env}:{queueName}` y los jobs incluyen `{ organizationId, teamId, ... }` en el data.
- **Rate limiting por tenant** (no global): usar `Queue.rateLimitGroup(orgId)` o un wrapper que retrasa jobs cuando el contador del tenant excede el plan.
- **Aislamiento de fallas**: jobs de un tenant en backoff no bloquean otros (BullMQ ya lo hace por job, pero validar que workers no compartan estado mutable).
- Worker, al iniciar el job, reinstala el `TenantContext` con los IDs del job antes de hacer cualquier query.

### 5.4 Sockets

- Cada socket se autentica con JWT Clerk + teamId.
- Se une a rooms: `org:{orgId}`, `team:{teamId}`, `user:{userId}`.
- Eventos se emiten **siempre** a una room scopeada, jamás globalmente.

### 5.5 Storage S3

- Bucket único; prefijos `tenants/{orgId}/{teamId}/...`.
- Política IAM del backend: solo el backend escribe; URLs firmadas para download.
- Adjuntos de email, exportes CSV, backups de configs, archivos de templates.

### 5.6 Webhooks entrantes (Meta WAPI, AWS SNS)

**Problema crítico**: webhooks externos no traen `organizationId`. Hay que resolverlo de forma determinística.

- **Meta WAPI**: cada `WapiConfig` tiene su propio webhook URL: `/webhooks/wapi/{configId}` con `verify_token` único por config. Al recibir un evento, se resuelve el `WapiConfig` por `configId` → de ahí se obtiene `organizationId`/`teamId`.
- **AWS SES (SNS)**: usar **configuration set** por tenant, o incluir `tenant-id` en headers `X-SES-CONFIGURATION-SET` + tag custom. El webhook resuelve por `messageId` → `EmailReport` → tenant.
- **Tracking (open/click)**: el token JWT firmado del pixel/link incluye `orgId`, `teamId`, `campaignId`, `reportId`.

---

## 6. Billing

### 6.1 Proveedores

- **Stripe** (default internacional): subscriptions, customer portal, webhooks.
- **MercadoPago** (LATAM): preapprovals, webhooks.
- Selección por país detectado en signup o por elección manual.

### 6.2 Planes (sugeridos para MVP)

| Plan       | Precio | Multi-team | Miembros | Mails/mes | WAPI msgs/mes | SSO | IA          |
| ---------- | ------ | ---------- | -------- | --------- | ------------- | --- | ----------- |
| Free       | USD 0  | No         | 2        | 1.000     | 250           | No  | No          |
| Starter    | USD 29 | No         | 5        | 25.000    | 5.000         | No  | Sí (límite) |
| Business   | USD 99 | Sí (5)     | 20       | 150.000   | 30.000        | No  | Sí          |
| Enterprise | Custom | Sí (∞)     | ∞        | Custom    | Custom        | Sí  | Sí          |

### 6.3 Enforcement de límites

- Antes de cada acción que consume cuota: `UsageGuard` verifica `UsageCounter` del período actual contra `plan.limits`.
- Workers chequean límite **antes** de procesar el job. Si supera, marcan el job/campaña como `BLOCKED_BY_QUOTA` y notifican.
- Alertas a `org:owner` cuando se alcanza 80%, 100%.

### 6.4 Webhooks de billing

- `/webhooks/stripe` valida firma con `STRIPE_WEBHOOK_SECRET`.
- `/webhooks/mercadopago` valida con secret config.
- Eventos: `subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
- En `payment_failed` reiterado → `Organization.status = SUSPENDED`, workers rechazan jobs.

---

## 7. Observabilidad y compliance

### 7.1 Logging

- Winston con formato JSON, correlation ID por request, `orgId`/`teamId` en todos los logs.
- Logs a stdout → recolectados por Loki / CloudWatch.

### 7.2 Métricas y trazas

- OpenTelemetry SDK en NestJS y workers.
- Métricas custom: `messages_sent_total{tenant, channel}`, `campaign_duration_seconds`, `webhook_processing_seconds`, `quota_usage_ratio`.
- Trazas distribuidas request → worker → API externa (Meta/SES).

### 7.3 Errores

- Sentry con tags `orgId`, `teamId`, `userId`, `feature`.
- PII scrubbing (no enviar contenidos de mensajes/contactos).

### 7.4 Auditoría

- Tabla `AuditLog` registra: cambios de plan, cambios de roles, creación/borrado de configs WAPI/SMTP, exports de datos, login fallidos, cambios de templates aprobados, etc.
- Vista en UI para `org:admin`.

### 7.5 Compliance

- **GDPR / Ley 25.326 (AR)**:
  - Endpoint `POST /me/data-export` (genera ZIP, envía link al email).
  - Endpoint `DELETE /me` (right to be forgotten — borrado lógico + scheduled hard delete a 30 días).
  - Endpoint `DELETE /organizations/:id` (delete completo de org, cascada).
- **Términos y condiciones** + **política de privacidad** versionadas; aceptación tracked.
- **DPA** (Data Processing Agreement) descargable para enterprise.
- **Subprocesores** documentados: AWS, Clerk, Stripe, Meta, Google, Sentry, etc.

### 7.6 Seguridad

- Secrets en AWS Secrets Manager (no en `.env` en prod).
- Rotación automática de tokens WAPI / SMTP cada 90 días con alertas.
- Encriptación at-rest de credenciales sensibles (`WapiConfig.token`, `SmtpAccount.password`) usando KMS.
- CSP estricto en frontend, HSTS, secure cookies.
- Rate limiting por IP en endpoints públicos (signup, login fallback, webhooks).
- WAF (AWS WAF o Cloudflare) para bloqueo de bots/abuse.

---

## 8. Estructura del repositorio

```
massivo-app/
├── apps/
│   ├── backend/         # NestJS API + workers
│   ├── frontend/        # React + Vite
│   └── admin/           # Admin panel (super-admin sobre todos los tenants)
├── packages/
│   ├── shared-types/    # tipos compartidos front/back (DTOs, eventos socket)
│   ├── permissions/     # CASL abilities + plan features
│   └── prisma/          # schema + client extensions
├── infra/
│   ├── terraform/       # AWS infra
│   └── docker/          # Dockerfiles, docker-compose
├── .github/workflows/   # CI/CD
└── docs/                # Documentación adicional
```

Monorepo con **pnpm workspaces** + **Turborepo**.

---

## 9. Plan de ejecución por fases

> Cada fase termina con: tests verdes, deploy a staging, demo verificada, criterios de aceptación cumplidos.

### Fase 0 — Setup base (1 semana)

- [ ] Crear repo `massivo-app` con monorepo (pnpm + Turborepo).
- [ ] Setup TypeScript strict, ESLint, Prettier, Husky + lint-staged.
- [ ] Setup Docker Compose dev: Postgres, Redis, MailHog.
- [ ] Setup CI base (GitHub Actions: lint + typecheck + test).
- [ ] Setup Sentry, OTEL, Winston scaffolding.
- [ ] Copiar lógica reutilizable de AMSA Sender (workers, integración Meta, Unlayer, tracking) a `apps/backend` como módulos sin tenant todavía.
- [ ] Migrar de MySQL a Postgres (ajustar tipos Prisma, índices, JSON → JSONB).

**Aceptación:** `pnpm dev` levanta todo; un endpoint dummy responde.

### Fase 1 — Tenancy core + Auth (2 semanas)

- [ ] Schema Prisma con `Organization`, `Team`, `User`, `OrgMembership`, `TeamMembership`, `Plan`, `AuditLog`, `UsageCounter`.
- [ ] Integración Clerk en frontend (`<ClerkProvider>`, sign-in, organization switcher).
- [ ] `ClerkAuthGuard` + `TenantContextGuard` + `AsyncLocalStorage` context.
- [ ] Webhook `/webhooks/clerk` (sincronización users/orgs/memberships).
- [ ] Endpoint `/me/context` (devuelve user + orgs + teams + permissions).
- [ ] CASL: `AbilityFactory`, decorator `@CheckPolicies`, `PoliciesGuard`.
- [ ] Prisma tenant extension (auto-inject `organizationId`/`teamId`).
- [ ] Onboarding: signup → crear org → crear team "General" → seed plan FREE.
- [ ] CRUD de teams (con plan-gate).
- [ ] CRUD de invitaciones a org y assignment a teams.

**Aceptación:** flujo completo signup → crear org → invitar miembro → asignar a team → loguear como miembro y ver dashboard del team.

### Fase 2 — Migración de modelos de dominio (2 semanas)

- [ ] Refactor de modelos heredados con `organizationId` + `teamId` + índices.
- [ ] Refactor de servicios y controllers para usar `TenantContext`.
- [ ] Refactor de queries Prisma → todas pasan por extension.
- [ ] Testing exhaustivo de aislamiento (contract tests: user de tenant A no puede leer datos de tenant B).
- [ ] Sockets: rooms scopeadas.
- [ ] Tests de integración con dos tenants concurrentes.

**Aceptación:** suite de tests de aislamiento verde; auditoría manual de queries sin filtro.

### Fase 3 — Canal Email (2 semanas)

- [ ] Modelo `SmtpAccount` por team (cuentas remitentes que el cliente da de alta).
- [ ] Configurar AWS SES propio del SaaS (configuration set por tenant, SNS topics).
- [ ] Worker email (heredado AMSA) refactorizado a multi-tenant.
- [ ] Tracking pixel + click rewriter con JWT que incluye tenant.
- [ ] Webhook SES → resuelve tenant por `configurationSet` o `messageId`.
- [ ] Editor Unlayer integrado.
- [ ] CRUD de templates email por team.
- [ ] CRUD de campañas email + ejecución + reporte.
- [ ] Suppression list (bounces, complaints, unsubscribes) por team.
- [ ] Endpoint público de unsubscribe (token JWT).

**Aceptación:** crear campaña en team A, enviar a 50 contactos via SES, ver reporte y eventos correctamente atribuidos.

### Fase 4 — Canal WhatsApp Business API (Meta) (2-3 semanas)

- [ ] Modelo `WapiConfig` por team (phone_number_id, waba_id, token, app_secret, webhook_verify_token).
- [ ] Encriptación de tokens con KMS.
- [ ] Webhooks Meta por config: `/webhooks/wapi/:configId` con verify token único.
- [ ] Sync de templates Meta por config.
- [ ] Worker WAPI refactorizado a multi-tenant.
- [ ] Inbox conversacional por team (conversaciones, mensajes, asignación a agentes, ventana 24h).
- [ ] Botones de templates (INBOX/BAJA/IGNORAR).
- [ ] Opt-out registry por team.
- [ ] Analítica WAPI por team y por agente.

**Aceptación:** dos tenants con cuentas Meta distintas envían campañas en paralelo sin interferencia; webhooks llegan al tenant correcto.

### Fase 5 — Billing + Plan enforcement (2 semanas)

- [ ] Integración Stripe: customer, subscriptions, customer portal, webhooks.
- [ ] Integración MercadoPago: preapproval, webhook.
- [ ] CRUD de planes (super-admin).
- [ ] `UsageGuard` en endpoints + checks en workers.
- [ ] Counters de uso (incremento atómico Redis + persistencia periódica a `UsageCounter`).
- [ ] Notificaciones de cuota (80%, 100%).
- [ ] Suspensión por impago.
- [ ] Página de pricing pública.
- [ ] Página de billing en cuenta (cambiar plan, ver facturas, método de pago).

**Aceptación:** upgrade/downgrade entre planes, webhook de pago fallido suspende org, cuota se resetea al inicio de período.

### Fase 6 — IA + features avanzadas (1-2 semanas)

- [ ] Integración Gemini con API key default del SaaS + opción de BYO API key por tenant.
- [ ] Resumen de conversaciones (heredado AMSA).
- [ ] Sugerencia de respuestas (heredado AMSA).
- [ ] Plan-gating de features de IA.
- [ ] Counter `AI_TOKENS` para enforcement.

**Aceptación:** features de IA operan con cuotas correctas; tenant sin plan IA recibe 403.

### Fase 7 — Compliance + Admin panel (1-2 semanas)

- [ ] Endpoint data export (GDPR).
- [ ] Endpoint delete account / delete org (right to be forgotten).
- [ ] Audit log viewer en UI.
- [ ] Páginas legales: TOS, Privacy, DPA.
- [ ] Aceptación de TOS en signup.
- [ ] Admin panel super-admin: lista de tenants, métricas globales, suspender/reactivar, impersonate (con audit).
- [ ] Documentación pública de subprocesores.

**Aceptación:** auditor puede revisar logs de cualquier acción sensible; super-admin puede operar sin acceder a datos de tenant sin loggearlo.

### Fase 8 — Hardening + Producción (2 semanas)

- [ ] Terraform para infra AWS: VPC, ECS Fargate, RDS Postgres Multi-AZ, ElastiCache Redis, ALB, CloudFront, S3, KMS, Secrets Manager.
- [ ] Pipeline CI/CD completo: build → test → deploy staging → smoke tests → deploy prod (con approval).
- [ ] Backups automáticos Postgres con retention 30d.
- [ ] Disaster recovery runbook.
- [ ] Load testing (k6 o Artillery): 10k mensajes/min sostenidos.
- [ ] Pen-test interno: aislamiento de tenants, OWASP Top 10.
- [ ] WAF rules.
- [ ] Status page pública.

**Aceptación:** sistema soporta 100 tenants concurrentes con 10k msgs/min sin degradación; tests de seguridad pasan.

### Fase 9 — Lanzamiento (1 semana)

- [ ] Landing page de marketing.
- [ ] Onboarding emails.
- [ ] Documentación de usuario (Mintlify o Docusaurus).
- [ ] Soporte: integrar Intercom o Crisp.
- [ ] Programa beta cerrado.
- [ ] GA.

---

## 10. Criterios de aceptación globales

Antes de declarar Massivo App listo para vender:

- [ ] **Aislamiento de tenants**: imposible (verificado por test suite y pen-test) que un tenant lea/modifique datos de otro.
- [ ] **Sin downtime durante deploys** (rolling update con health checks).
- [ ] **RTO < 1h, RPO < 15min** (backups + replicación).
- [ ] **Cobertura de tests** > 70% en backend, contract tests de aislamiento al 100%.
- [ ] **Webhooks idempotentes** (Stripe, Meta, SES, Clerk).
- [ ] **Logs sin PII** (mensajes, contactos, contenido de templates no se loggean en claro).
- [ ] **Documentación**: API pública (OpenAPI/Swagger), guía de onboarding, runbooks de incidentes.
- [ ] **Plan free funcional** (acquisition channel).
- [ ] **Plan enterprise vendible** (SSO + SAML + DPA + SLA).

---

## 11. Reglas globales de código (heredadas de AMSA + nuevas)

### Heredadas

- TypeScript estricto. Prohibido `any` salvo justificación explícita.
- Logger Winston siempre, nunca `console.*`.
- DTOs con `class-validator` en todos los endpoints.
- `HttpException` o filtros globales para errores HTTP, nunca `throw new Error()` crudo.
- Workers BullMQ con retry y manejo de errores exhaustivo.
- UI siempre dark/light mode (MUI `useTheme` / `sx`).

### Nuevas en Massivo

- **Toda query a modelo tenant-aware DEBE pasar por la Prisma extension** o ser explícitamente decorada con `@SkipTenantScope()`.
- **Ningún endpoint sin `ClerkAuthGuard` + `TenantContextGuard` + `PoliciesGuard`**, salvo: webhooks, healthchecks, endpoints públicos de tracking/unsubscribe.
- **Todos los logs incluyen** `orgId`, `teamId`, `userId`, `correlationId`.
- **Todas las acciones sensibles** (cambios de plan, configs, miembros, exports) generan `AuditLog`.
- **Secrets nunca en código ni en `.env` de prod**: AWS Secrets Manager.
- **Migraciones Prisma reversibles** o documentadas como no reversibles (ej. drops).
- **Feature flags** para rollouts (Unleash, GrowthBook o flags simples en DB) cuando un cambio impacte múltiples tenants.

---

## 12. Riesgos y mitigaciones

| Riesgo                                  | Impacto | Mitigación                                                                |
| --------------------------------------- | ------- | ------------------------------------------------------------------------- |
| Data leak entre tenants                 | Crítico | Prisma extension + tests de aislamiento + pen-test antes de GA            |
| Costo Clerk a escala                    | Medio   | Diseño abstrae auth detrás de un módulo; migración a Better Auth posible  |
| Vendor lock-in Clerk                    | Medio   | Espejar todos los users/orgs en DB local desde día 1                      |
| Webhooks Meta perdidos                  | Alto    | Retry con DLQ, monitoreo de gap, reconciliación periódica via API         |
| Bounces SES afectan reputación          | Alto    | SES separado por tenant (configuration set) + suppression list por tenant |
| Costo IA descontrolado                  | Medio   | Cuotas estrictas + alerts + circuit breaker por tenant                    |
| Performance Postgres con muchos tenants | Medio   | Índices correctos + partitioning futuro si supera ~500 tenants grandes    |
| Compliance GDPR                         | Alto    | Data export + delete + DPA + subprocesores publicados desde día 1         |

---

## 13. Glosario

- **Tenant** = Organization (cliente que paga).
- **Workspace** = Team (espacio operativo dentro de una org).
- **Member** = User con membership en una org y/o team.
- **Plan** = nivel de suscripción con features y límites.
- **Quota** = límite numérico mensual de uso (mails, mensajes, etc.).
- **Tenant-aware model** = modelo Prisma con `organizationId` (y normalmente `teamId`).
- **SOR** = System of Record.
- **DLQ** = Dead Letter Queue (BullMQ failed jobs).

---

## 14. Estado del documento

- **Versión:** 1.0
- **Fecha:** 2026-04-28
- **Autor:** plan generado en conversación con el dueño del producto.
- **Próxima revisión:** al iniciar Fase 1.

> Este plan es un punto de partida ejecutable, no un contrato cerrado. Ajustar según aprendizajes de cada fase. Lo importante no se mueve: aislamiento de tenants, observabilidad, billing y compliance son no-negociables.
