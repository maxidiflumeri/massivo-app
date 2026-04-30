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
- Canales soportados en MVP: **Email (SMTP/SES)** y **WhatsApp Business API (Meta)**.
- **Excluir del MVP**: WhatsApp Web.js (Baileys/wweb) — no escala bien en SaaS, alto costo operativo.
- Auth tercerizada con **Clerk**.
- Permisos finos con **CASL**.
- SMTP de envío propio del SaaS (**AWS SES**) + cuentas remitentes que cada equipo configura para usar como `From`.
- **Contacts unificados con timeline cross-canal**: el cliente sube un `externalId` propio en cada CSV; la plataforma resuelve, dado un `externalId` o `email`/`phone`, el historial completo de envíos y eventos del contacto a través de email + WAPI.
- **Inbox conversacional WAPI** completo (asignación, respuestas rápidas, cierre con nota, búsqueda, cola sin asignar, resueltas).
- **Scheduler genérico de reportes**: cualquier reporte de la plataforma se puede agendar (cron) y llega por mail con adjunto CSV/XLSX en el día/hora/recurrencia configurada.
- **IA (Gemini + Bedrock) switcheable** por feature flag + variables de entorno (no se elige al usuario; lo elige el operador).
- **Dev Simulator**: panel interno que simula mensajes/eventos Meta sin cuenta real (mensaje, status, botón, imagen, documento, audio, sticker, contacto, reacción).

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
| IA              | Google Gemini 1.5 Flash + AWS Bedrock (Claude/Nova)  | Provider switcheable por feature flag + env vars (`AI_PROVIDER=gemini\|bedrock`); BYO API key por tenant opcional |
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

- `WapiConfig`, `WapiTemplate`, `WapiCampaign`, `WapiContact`, `WapiReport`, `WapiConversation`, `WapiMessage`, `WapiOptOut`, `WapiQuickReply`, `WapiConversationClosure`
- `SmtpAccount` (ex `CuentaSMTP`), `EmailTemplate`, `EmailCampaign`, `EmailContact`, `EmailReport`, `EmailEvent`, `EmailBounce`, `EmailUnsubscribe`
- `Contact` (unificado, **con `externalId` único por team** — clave que el cliente sube en cada CSV), `Tag`, `ContactList`, `ContactListMember`, `ContactTag`
- `ScheduledTask`, `TaskExecution` (scheduler genérico de reportes)
- `CampaignLog`

> **Sobre `Contact.externalId`**: este campo lo aporta el cliente (CRM externo, ID de cobranza, etc.) y es la clave de agregación para el timeline cross-canal. `@@unique([teamId, externalId])` y `@@index([teamId, externalId])`. Permite que al subir una campaña con CSV que incluya `externalId`, el sistema haga upsert sobre `Contact` y todos los `EmailReport`/`WapiReport`/eventos queden vinculados al mismo `Contact`.

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
>
> **Estado al 2026-04-30**: Fase 0, 1, 2 completas ✅. Fase 3 en curso (3.A, 3.B, 3.C.1/.2/.3.a-e ✅; falta 3.C.4, 3.C.5, 3.D, 3.E).
>
> **Detalle ejecutivo y bitácora viva** en `PROGRESS.md`. Este plan es la fuente arquitectónica; PROGRESS es el estado.

---

### Fase 0 — Setup base ✅ (completada)

- [x] Crear repo `massivo-app` con monorepo (pnpm + Turborepo).
- [x] Setup TypeScript strict, ESLint, Prettier, Husky + lint-staged.
- [x] Setup Docker Compose dev: Postgres, Redis, MailHog.
- [x] Setup CI base (GitHub Actions: lint + typecheck + test).
- [x] Setup Winston scaffolding. *(Sentry + OTEL postergado a Fase 12.)*

**Aceptación:** `pnpm dev` levanta todo; un endpoint dummy responde. ✅

### Fase 1 — Tenancy core + Auth ✅ (completada)

- [x] Schema Prisma con `Organization`, `Team`, `User`, `OrgMembership`, `TeamMembership`, `Plan`, `Subscription`, `UsageCounter`, `AuditLog`.
- [x] Integración Clerk (frontend + backend + webhook).
- [x] `ClerkAuthGuard` + `TenantContextGuard` + `AsyncLocalStorage` context.
- [x] Endpoint `/me/context` con plan flags (Opción A).
- [x] CASL `AbilityFactory` + `@CheckPolicies` + `PoliciesGuard`.
- [x] Prisma tenant extension (modo strict).
- [x] Onboarding idempotente.
- [x] CRUD teams + members.
- [x] Suite tenant-isolation cross-tenant.

### Fase 2 — Migración de modelos de dominio ✅ (completada)

- [x] **2.A — Email**: `SmtpAccount`, `EmailTemplate`, `EmailCampaign`, `EmailContact`, `EmailReport`, `EmailEvent`, `EmailBounce`, `EmailUnsubscribe` tenant-aware. CRUD mínimo de SmtpAccount + EmailTemplate.
- [x] **2.B — WAPI**: `WapiConfig`, `WapiTemplate`, `WapiCampaign`, `WapiContact`, `WapiReport`, `WapiConversation`, `WapiMessage`, `WapiOptOut`. CRUD mínimo de WapiConfig + WapiTemplate. Tokens marcados como encriptables (`*Enc`), encriptación KMS pospuesta a 4.B.
- [x] **2.C — Cross-cutting**: `Contact`, `Tag`, `ContactList`, `ContactListMember`, `ContactTag`, `ScheduledTask`, `TaskExecution`, `CampaignLog`. CRUD mínimo de Contacts + Tags. **TODO**: agregar `Contact.externalId` con `@@unique([teamId, externalId])` cuando arranque Fase 5 (Contacts/Timeline).
- [x] **2.D — Sockets scopeados**: `EventsModule`, `AppGateway` con auth handshake + rooms `org/team/user`, `EventsService.emitToTeam/Org/User`.

---

### Fase 3 — Canal Email (en curso 🟡)

> Subdividida por sub-fases ejecutables. Detalle completo en `PROGRESS.md`.

#### 3.A — Infra de envío ✅
- [x] Driver-based (`EmailSender` interface, `SmtpSender` + `SesSender`), `SmtpAccount.provider`+`sesConfigSet`, `EmailQueueService` (BullMQ jobId=reportId), `EmailWorkerService` (TenantContext + Handlebars).

#### 3.B — Tracking + Suppression + Webhook SES ✅
- [x] **3.B.1** — Tracking saliente (pixel + click rewriter + JWT con `{r,o,t,c}`).
- [x] **3.B.2** — Suppression (`SuppressionService.check/addUnsubscribe`, status `SUPPRESSED`, endpoint público `/api/unsubscribe`).
- [x] **3.B.3** — Webhook SES (SNS validation, tenant resolution por configSet/messageId, Bounce/Complaint/Open/Click/Delivery).

#### 3.B' — Mejoras de tracking/bounce (pendiente 🆕)
- [ ] **3.B.4** — **One-Click unsubscribe RFC 8058**: header `List-Unsubscribe: <mailto:...>, <https://.../unsubscribe?one-click>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Endpoint `POST /api/unsubscribe?t=&one-click=true` que procesa sin click humano (Gmail/Apple Mail).
- [ ] **3.B.5** — **Bounce DSN parsing detallado**: extraer DSN code (5.1.1, 5.7.1, etc.) del SES `bouncedRecipients[].diagnosticCode`, mapear a categoría legible, persistir en `EmailBounce.dsnCode` + `EmailBounce.category`.
- [ ] **3.B.6** — **EmailEvent metadata extendida**: parser de `User-Agent` → `device`, `os`, `browser`. Persistir en `EmailEvent.deviceType`, `osName`, `browserName`. Incluye refactor del modelo (migración aditiva).

#### 3.C — Campañas + Frontend (en curso 🟡)
- [x] **3.C.1** — Backend campaigns CRUD + send + report.
- [x] **3.C.2** — Realtime events `email.report.updated` (debounced 1s).
- [x] **3.C.3** — Frontend (a infra, b templates+Unlayer, c campaigns list+detail+CSV+send, d realtime dashboard, e UX polish: Notify+Confirm+skeletons+responsive+landing+GitLab layout+Clerk theming/ES).
- [ ] **3.C.4 — Frontend features email restantes** (próximo):
  - [ ] **.a** SMTP accounts UI: lista + form (provider smtp|ses, host, port, user, pass, fromEmail, fromName, sesConfigSet?). **Test send** (botón "probar" envía un email de prueba a la cuenta del usuario logueado).
  - [ ] **.b** Suppressions UI (`/dashboard/email/suppressions`): paginada con cursor, filtro por scope GLOBAL/CAMPAIGN, acción "agregar manual" y "eliminar entrada".
  - [ ] **.c** Per-campaign drill-down: tabla paginada de `EmailReport` (status, error, sentAt, firstOpenedAt, firstClickedAt) → drilldown a `EmailEvent` (OPEN/CLICK con IP/UA/url).
  - [ ] **.d** Métricas globales: dashboard con widgets (total enviados últimos 7/30 días, tasa apertura/click, top campañas).
  - [ ] **.e** Live processing view: durante `status=PROCESSING`, progress bar + counts en tiempo real + botón pause.
  - [ ] **.f** Manual send (sin campaña, ad-hoc): vista "Envío rápido" con `to: emails[]` + template-or-html + smtp account → enquola jobs como campaña efímera (`name: "Manual <fecha>"`).
  - [ ] **.g** Test send / preview en editor de templates: botón "Enviar prueba" en `TemplateEditorPage` → envía a email del usuario o a uno indicado.
- [ ] **3.C.5 — Acciones de control campaña** (pendiente 🆕): pausar / reanudar / forzar cierre. Endpoints `POST /api/email/campaigns/:id/pause|resume|force-close`. El worker chequea `EmailCampaign.status` antes de procesar cada job; en `PAUSED` deja el job en delay+retry; en `COMPLETED` por force-close marca todos los `PENDING` restantes como `CANCELED` (status nuevo en el enum).

#### 3.D — Reportes consolidados con export 🆕
- [ ] **3.D.1** — Generadores `ReportGenerator` para email: campaign summary (CSV/XLSX), per-contact activity, bounces/complaints, suppressions snapshot.
- [ ] **3.D.2** — Endpoint `POST /api/email/reports/generate` (sync para datasets chicos, async vía BullMQ + S3 link para grandes).
- [ ] **3.D.3** — UI: botones "Exportar CSV" / "Exportar XLSX" en cada reporte.
- [ ] Integración con scheduler (Fase 8): estos generators son consumibles por `ScheduledTask`.

#### 3.E — Inbound automation (postergado, no MVP) 🟤
- [ ] Gmail OAuth read (sincroniza respuestas de inbox Gmail) — **no se porta**. En SaaS reemplazado por reply-to a mailbox del cliente (fuera de Massivo) + opcional integración por IMAP en una fase muy posterior.

**Aceptación Fase 3:**
- Crear campaña en team A, enviar 50 contactos via SES, reporte muestra ≥45 SENT y eventos OPEN/CLICK con device/OS/browser parseados.
- Cross-tenant 404. Webhook SES procesa team B sin filtración.
- One-Click unsubscribe pasa el test de Gmail Postmaster.
- Cualquier reporte de email es exportable a CSV/XLSX y agendable (vía Fase 8).

---

### Fase 4 — Canal WhatsApp Business API (Meta)

> Schema y CRUD mínimo ya hecho en 2.B. Faltan envío real, inbox, webhooks, sync, UI.

#### 4.A — Infra de envío WAPI
- [ ] **4.A.1** — `WapiSender` (`@nestjs/axios` o `undici`) que llama a Graph API v20+ `/messages`. Manejo de respuestas + errores Meta.
- [ ] **4.A.2** — `WapiQueueService` (BullMQ queue `wapi-send`, jobId=reportId).
- [ ] **4.A.3** — `WapiWorkerService`: rate limiting por `WapiConfig` (campos `dailyLimit` default 200, `delayMinMs`/`delayMaxMs` default 30000/60000 — random jitter entre cada send). Reconstruye TenantContext.
- [ ] **4.A.4** — Detección de rate-limit codes Meta (131056, 130429, 131048): backoff exponencial + circuit breaker per-config.

#### 4.B — Encriptación de tokens
- [ ] KMS-backed encryption para `WapiConfig.accessTokenEnc`, `webhookVerifyTokenEnc`, `appSecretEnc`. Helper `EncryptionService.encrypt/decrypt` con cache. Migración de los `*Enc: string` actuales (quedan placeholders en claro).

#### 4.C — Webhook Meta
- [ ] **4.C.1** — `POST /webhooks/wapi/:configId` (público, `@SkipTenantScope`). `GET` con verify_token único por config. Validación firma con `appSecret`.
- [ ] **4.C.2** — Procesamiento de eventos: `messages` (entrante texto/imagen/audio/doc/sticker/contacto/reacción/botón), `statuses` (sent/delivered/read/failed), `template_status_update`, `account_alerts`.
- [ ] **4.C.3** — Resuelve tenant por `configId` → `WapiConfig` → `(orgId, teamId)` con cliente raíz, corre todo dentro de `TenantContext.run`.

#### 4.D — Sync de templates Meta
- [ ] `POST /api/wapi/templates/sync` por config: pull de templates aprobados desde Graph API, persiste `metaName`, `language`, `category`, `status`, `components` (header/body/footer/buttons como JSON). Cron opcional semanal vía Fase 8.

#### 4.E — Campañas WAPI
- [ ] **4.E.1** — CRUD `/api/wapi/campaigns` (DRAFT/SCHEDULED/PROCESSING/PAUSED/COMPLETED/FAILED).
- [ ] **4.E.2** — `addContacts` con CSV (E.164 + variables del template).
- [ ] **4.E.3** — `send` enquola jobs (uno por contacto) respetando `WapiConfig.dailyLimit` global del día.
- [ ] **4.E.4** — `getReport`: counts (PENDING/SENT/DELIVERED/READ/FAILED) + breakdown por error code Meta.
- [ ] **4.E.5** — Acciones de control: pausar / reanudar / forzar cierre (mismo patrón que 3.C.5).
- [ ] **4.E.6** — Realtime: emit `wapi.report.updated` debounced 1s.

#### 4.F — Inbox conversacional (full)
- [ ] **4.F.1** — Modelos: `WapiConversation` (asignedTo, status `OPEN|ASSIGNED|RESOLVED`, unreadCount, lastMessageAt) ya existe. Agregar `WapiConversationClosure` (resolvedAt, resolvedById, note). Agregar índice por status para cola de "sin asignar".
- [ ] **4.F.2** — Endpoints:
  - `GET /api/wapi/inbox` (mías o todas si admin) + `GET /api/wapi/inbox/unassigned` (cola admin) + `GET /api/wapi/inbox/resolved` (paginado) + `GET /api/wapi/inbox/search?q=`.
  - `GET /api/wapi/inbox/:id` (conversación + mensajes).
  - `POST /:id/take` (asesor toma) / `POST /:id/assign` (admin asigna a userId) / `POST /:id/resolve` (con nota) / `POST /:id/mark-read` / `POST /:id/mark-unread`.
  - `POST /:id/send` (texto/template/respuesta a mensaje específico — ventana 24h).
  - `POST /:id/media` (upload S3) + `GET /:id/media/:mediaId` (download URL firmada).
- [ ] **4.F.3** — Realtime: socket events `wapi.inbox.message.new`, `wapi.inbox.assigned`, `wapi.inbox.resolved`, `wapi.inbox.read`. Rooms `team:{id}` + `user:{id}` para asignaciones personales.
- [ ] **4.F.4** — Frontend `/dashboard/wapi/inbox`: layout chat (lista convs izq + chat centro + ficha contacto der). Filtros (mías/sin asignar/resueltas), búsqueda, asignar, resolver con nota, scroll infinito, marca de leído auto al abrir, indicador de typing (postergado).

#### 4.G — Respuestas rápidas (snippets)
- [ ] Modelo `WapiQuickReply` (id, teamId, shortcut, body, vars). CRUD `/api/wapi/quick-replies`. UI en inbox: tipear `/atajo` → autocomplete + insert con interpolación de vars del contacto.

#### 4.H — Bajas / opt-out
- [ ] Modelo `WapiOptOut` (existe). Endpoint `POST /api/wapi/opt-outs` (manual + auto desde palabras clave en mensaje entrante: "BAJA", "STOP", etc.). Worker chequea opt-out antes de send → marca `WapiReport.status='SUPPRESSED'`. UI `/dashboard/wapi/opt-outs` (lista, agregar, eliminar).

#### 4.I — Mensaje de bienvenida automático
- [ ] `WapiConfig.welcomeMessage` (texto + delaySec). Cuando llega un mensaje entrante de un número que NO tiene `WapiConversation` previa, crear conversación + enviar welcome message tras `delaySec`.

#### 4.J — Live dashboard WAPI
- [ ] `/dashboard/wapi/live`: campañas en curso con progreso live, throughput por config, alertas de daily-limit cerca del 80%/100%, conversaciones nuevas/sin asignar.

#### 4.K — Botones de templates (INBOX/BAJA/IGNORAR)
- [ ] Templates aprobados con quick-reply buttons. Webhook procesa `interactive.button_reply` → matching del payload → acción: agregar a inbox priorizado / opt-out / ignorar (log).

**Aceptación Fase 4:**
- Dos tenants con cuentas Meta distintas envían campañas en paralelo sin interferencia, webhooks llegan al tenant correcto.
- Inbox: asesor ve solo conversaciones del team, admin ve cola sin asignar, asignar+resolver funciona, media sube/baja con URL firmada.
- Opt-out automático por palabra clave funciona.
- Daily limit por config no se excede ni siquiera bajo carga (test con campaña de 1000 contactos y limit=50 → 50 envíos al día 0, resto los próximos días).

---

### Fase 5 — Contacts unificados + Timeline cross-canal 🆕

> Reemplaza el módulo `Deudores` de AMSA con una versión genérica multi-tenant.

#### 5.A — Modelo Contact con `externalId`
- [ ] Migración aditiva: `Contact.externalId String?` con `@@unique([teamId, externalId])` y `@@index([teamId, externalId])`.
- [ ] CSV import (email + WAPI) actualizado: si la fila trae `externalId`, hace upsert sobre `Contact` y vincula `EmailContact`/`WapiContact` por `contactId`. Fallback: dedupe por email/phone.
- [ ] Backfill: vincular `EmailContact`/`WapiContact` históricos al `Contact` correspondiente (job batch idempotente).

#### 5.B — Timeline aggregator
- [ ] Service `ContactTimelineService.getTimeline({contactId|externalId, from?, to?, channel?})`: agrega cronológicamente:
  - `EmailReport` (sent/failed/bounced/complained/suppressed) + `EmailEvent` (open/click).
  - `WapiReport` + `WapiMessage` (in/out con tipo).
  - Acciones manuales (`AuditLog` filtrado por `resourceType='Contact'`).
- [ ] Endpoint `GET /api/contacts/:id/timeline?cursor=&limit=` paginado por timestamp.

#### 5.C — Búsqueda y filtros avanzados
- [ ] Endpoint `GET /api/contacts/search` con filtros: `q` (full-text en email/phone/name/externalId/attributes), `tags[]`, `lastActivityFrom/To`, `channel`, `hasOpened/Clicked/Bounced`. Postgres `tsvector` o `ILIKE` según volumen.
- [ ] Cursor pagination + sort configurable (lastActivity desc default).

#### 5.D — Frontend Contacts
- [ ] **5.D.1** — Lista `/dashboard/contacts`: tabla con name/email/phone/externalId/tags/lastActivity + búsqueda + filtros + bulk actions (tag, untag, delete, export).
- [ ] **5.D.2** — Ficha `/dashboard/contacts/:id`: datos + attributes JSON + tags + suppressions + **timeline cross-canal** (email opens/clicks/bounces + WAPI in/out + acciones manuales) en línea de tiempo unificada.
- [ ] **5.D.3** — Bulk import (CSV paste o upload) con mapeo de columnas → fields/attributes/externalId, preview de 10 filas + dedupe report.

#### 5.E — Reportes consolidados
- [ ] Reportes agregados: por tag, por segmento de attributes, por externalId pattern (ej: "todos los contactos cuyo `externalId` empiece con `EMP-`"). Export CSV/XLSX (vía 3.D / 8).
- [ ] Reporte "actividad por contacto" (fila por mensaje/evento, ideal para auditoría).

**Aceptación Fase 5:**
- Cliente sube CSV con columna `externalId`. Las próximas N campañas que incluyan ese mismo `externalId` se agregan al mismo `Contact`.
- `GET /api/contacts/by-external/:externalId/timeline` devuelve historial completo cross-canal.
- Cross-tenant: dos teams con el mismo `externalId='EMP-001'` ven contactos distintos aislados.

---

### Fase 6 — Billing + Plan enforcement

> Sin cambios estructurales vs plan original. Detalles:

- [ ] **6.A** — Stripe (customer + subscriptions + portal + webhooks `subscription.*`, `invoice.*`).
- [ ] **6.B** — MercadoPago (preapproval + webhook).
- [ ] **6.C** — `UsageGuard` + counters atómicos Redis con persistencia periódica a `UsageCounter`.
- [ ] **6.D** — Notificaciones de cuota (80%/100%) por email + UI banner.
- [ ] **6.E** — Suspensión por impago: `Organization.status=SUSPENDED` → workers rechazan jobs + endpoints devuelven 402.
- [ ] **6.F** — Pricing público + página billing en cuenta (cambio plan, facturas, método pago).
- [ ] **6.G** — CRUD planes en admin panel (Fase 10).

---

### Fase 7 — IA con provider switcheable (Gemini + Bedrock)

#### 7.A — Provider abstraction
- [ ] Interface `LlmProvider` con `complete({prompt, system, maxTokens, temperature}) → {text, usage}` y `chatStream(...)`.
- [ ] `GeminiProvider` (`@google/generative-ai`) — Gemini 1.5 Flash default.
- [ ] `BedrockProvider` (`@aws-sdk/client-bedrock-runtime`) — Claude 3.5 Sonnet o Nova Pro según config.
- [ ] **`AiProviderFactory`** elige según `process.env.AI_PROVIDER` (`gemini`/`bedrock`) o feature flag por org. **No es elección de usuario final** — es del operador.

#### 7.B — Features de IA (heredadas de AMSA)
- [ ] Resumen de conversaciones WAPI (botón en ficha de conversación → genera resumen y lo guarda).
- [ ] Sugerencia de respuestas en inbox (panel lateral con 3 sugerencias contextuales).
- [ ] (Opcional) Generación de copy para campañas email/WAPI.

#### 7.C — Plan-gating + counter
- [ ] CASL `cannot('use', 'AiFeature')` si `!plan.features.ai`.
- [ ] Counter `AI_TOKENS` per-org (incremento por usage retornado).
- [ ] BYO API key opcional: tenant puede pasar su Gemini API key o credenciales AWS para no consumir cuota del SaaS.

**Aceptación Fase 7:**
- Cambiar `AI_PROVIDER` de `gemini` a `bedrock` en env vars y reiniciar → todas las features de IA siguen funcionando idénticas.
- Tenant FREE recibe 403 al llamar feature de IA. Tenant STARTER consume cuota y recibe 429 al excederla.

---

### Fase 8 — Scheduler genérico de reportes 🆕

> "Cualquier reporte de la plataforma se puede agendar y llegar por mail en horario/día/recurrencia configurada."

#### 8.A — Modelo
- [ ] `ScheduledTask` (existe — extender): `kind` enum `REPORT_EMAIL_SUMMARY|REPORT_WAPI_SUMMARY|REPORT_CONTACT_ACTIVITY|REPORT_BOUNCES|REPORT_SUPPRESSIONS|REPORT_CUSTOM`, `cronExpression`, `timezone`, `nextRunAt`, `enabled`, `config: Json` (params del reporte: filtros, formato CSV/XLSX), `recipients: string[]` (emails destinatarios), `attachToEmail: bool`.
- [ ] `TaskExecution` (existe): `status`, `startedAt`, `finishedAt`, `outputS3Key?`, `errorMessage?`, `logs?`.

#### 8.B — Engine
- [ ] BullMQ scheduled jobs (`Queue.add` con `delay` o `repeat.cron`). Resync de `ScheduledTask` enabled al boot.
- [ ] Worker consume job → resuelve `ReportGenerator` por `kind` → genera CSV/XLSX → sube a S3 (`tenants/{orgId}/{teamId}/reports/{taskId}/{execId}.{ext}`) → envía email a `recipients` con adjunto (o link firmado para datasets > 5MB).
- [ ] Reintentos: max 3, backoff exponencial. Falla persiste `TaskExecution.status='FAILED'` + alerta a `org:owner`.

#### 8.C — Generadores (`ReportGenerator` interface)
- [ ] `EmailSummaryReport`, `WapiSummaryReport`, `ContactActivityReport`, `BouncesReport`, `SuppressionsReport`, `ContactExportReport`. Cada uno implementa `generate({teamId, filters, format}) → Buffer`.

#### 8.D — UI
- [ ] `/dashboard/scheduler/tasks`: lista con `name/kind/cron/nextRun/lastRun/enabled`. CRUD. Botón "Ejecutar ahora".
- [ ] Detalle: historial de `TaskExecution` con status + descarga del output.
- [ ] Form de creación: paso 1 elegir reporte, paso 2 filtros, paso 3 cron (UI helper tipo "todos los lunes a las 8 AM" → cron expr), paso 4 destinatarios.

#### 8.E — Detector de tareas huérfanas
- [ ] Job periódico cada 5min que verifica que cada `ScheduledTask.enabled=true` tenga su BullMQ schedule activo. Si no, lo reagenda.

**Aceptación Fase 8:**
- Crear cron "Reporte de email todos los lunes 8 AM, formato XLSX, recipients [a@x, b@x]" → al lunes siguiente llega email con adjunto correcto, `TaskExecution` en SUCCESS.
- Cualquier reporte que la UI permita generar ad-hoc también está disponible para schedule.

---

### Fase 9 — Dev Simulator 🆕

> Panel interno para simular eventos Meta sin cuenta real. Crítico para QA y onboarding de devs.

- [ ] **9.A** — Endpoints `/api/dev/simulator/*` (gated por `ENABLE_DEV_SIMULATOR=true` o flag por org `dev:simulator`):
  - `POST /message` (texto entrante).
  - `POST /button` (respuesta de botón template).
  - `POST /status` (sent/delivered/read/failed para un `wamid`).
  - `POST /image` / `/document` / `/audio` / `/sticker` / `/contact` / `/reaction`.
- [ ] Cada endpoint construye el payload SNS/Meta correspondiente y lo inyecta en el handler de webhook (sin firma — por eso solo se habilita con flag).
- [ ] **9.B** — UI `/dashboard/dev/simulator` (visible solo con flag): formularios por tipo de evento + selector de `WapiConfig` destino + selector de contacto.
- [ ] **9.C** — Audit log de cada simulación (quién, cuándo, qué).

**Aceptación Fase 9:**
- Con `ENABLE_DEV_SIMULATOR=true`, simular un mensaje entrante → aparece en inbox WAPI del team correspondiente. Simular un status `delivered` → `WapiReport` se actualiza.
- Con flag off, los endpoints devuelven 404.

---

### Fase 10 — Compliance + Admin panel

- [ ] **10.A** — Data export GDPR (`POST /me/data-export` → ZIP por email).
- [ ] **10.B** — Right to be forgotten (`DELETE /me`, `DELETE /organizations/:id` cascada).
- [ ] **10.C** — `AuditLog` viewer en UI (filtros por action/actor/resource).
- [ ] **10.D** — Páginas legales (TOS/Privacy/DPA versionadas) + aceptación tracked en signup.
- [ ] **10.E** — Admin panel super-admin (`apps/admin`): lista tenants, métricas globales, suspender/reactivar, impersonate (con audit), CRUD planes.
- [ ] **10.F** — Documentación pública de subprocesores.

---

### Fase 11 — Hardening + Producción

- [ ] **11.A** — Terraform AWS (VPC, ECS Fargate, RDS Postgres Multi-AZ, ElastiCache Redis, ALB, CloudFront, S3, KMS, Secrets Manager, SES, SNS).
- [ ] **11.B** — CI/CD completo (build → test → deploy staging → smoke → prod con approval).
- [ ] **11.C** — Backups Postgres retention 30d + DR runbook.
- [ ] **11.D** — Sentry + OpenTelemetry SDK (deferido desde Fase 0) con tags `orgId/teamId`.
- [ ] **11.E** — Load testing (k6/Artillery): 10k mensajes/min sostenidos.
- [ ] **11.F** — Pen-test interno: aislamiento + OWASP Top 10.
- [ ] **11.G** — WAF rules + status page pública.

---

### Fase 12 — Lanzamiento

- [ ] Landing page de marketing (ya esbozado en Fase 3.C.3.e).
- [ ] Onboarding emails.
- [ ] Documentación pública (Mintlify/Docusaurus): API OpenAPI/Swagger + guías de usuario.
- [ ] Soporte: integrar Intercom o Crisp.
- [ ] Programa beta cerrado → GA.

---

### Mapa AMSA Sender → Massivo App (referencia exhaustiva)

| AMSA (origen)                          | Massivo (destino)                                   | Fase    | Estado |
| -------------------------------------- | --------------------------------------------------- | ------- | ------ |
| `modules/usuarios` + `roles`           | Clerk + CASL + roles fijos por team                 | 1       | ✅     |
| `modules/email/smtp`                   | `EmailModule` SmtpAccount CRUD + Test send (3.C.4.a)| 2.A/3.C | 🟡     |
| `modules/email/templates-email`        | `EmailModule` TemplateEditorPage Unlayer            | 2.A/3.C | ✅     |
| `modules/email/campanias-email`        | `EmailCampaignsModule` + Campaigns UI               | 3.C     | ✅     |
| `modules/email/envio-email` (preview)  | Test send / preview en editor                       | 3.C.4.g | 🆕     |
| `modules/email/manual-email`           | Manual send ad-hoc                                  | 3.C.4.f | 🆕     |
| `modules/email/tracking-email`         | TrackingModule (pixel + click + JWT)                | 3.B.1   | ✅     |
| `modules/email/desuscribir-email`      | UnsubscribeController + One-Click RFC 8058          | 3.B.2/4 | 🟡     |
| `modules/email/ses-webhook`            | SesWebhookModule                                    | 3.B.3   | ✅     |
| `modules/email/reportes-email`         | Reportes consolidados + drill-down + export         | 3.C.4.c/d, 3.D | 🆕 |
| `modules/email/public-email`           | Páginas públicas unsubscribe/preview                | 3.B.2   | ✅     |
| `modules/email/gmail` (OAuth read)     | **NO se porta** — reply-to a mailbox del cliente    | —       | ⛔     |
| `EmailEvento` con device/OS/browser    | `EmailEvent` extendido                              | 3.B.6   | 🆕     |
| `EmailRebote` con DSN code             | `EmailBounce.dsnCode` + category                    | 3.B.5   | 🆕     |
| Pausar/reanudar/forzar cierre campaña  | Acciones de control                                 | 3.C.5/4.E.5 | 🆕 |
| `modules/wapi/config`                  | `WapiConfigModule` + KMS encryption                 | 2.B/4.B | 🟡     |
| `modules/wapi/templates` + sync Meta   | WapiTemplatesModule + sync                          | 4.D     | 🟡     |
| `modules/wapi/campanias`               | WapiCampaignsModule + send + acciones control       | 4.E     | 🆕     |
| `modules/wapi/inbox`                   | WapiInboxModule (full feature)                      | 4.F     | 🆕     |
| `modules/wapi/respuestas-rapidas`      | WapiQuickReplyModule                                | 4.G     | 🆕     |
| `modules/wapi/bajas`                   | WapiOptOutModule                                    | 4.H     | 🆕     |
| `modules/wapi/analitica` + dashboard   | Live dashboard WAPI                                 | 4.J     | 🆕     |
| `modules/wapi/webhook`                 | WapiWebhookController                               | 4.C     | 🆕     |
| Mensaje de bienvenida automático       | `WapiConfig.welcomeMessage`                         | 4.I     | 🆕     |
| `modules/whatsapp/*` (Web.js legacy)   | **NO se porta** — excluido del MVP                  | —       | ⛔     |
| `modules/deudores`                     | **`Contacts` con `externalId` + Timeline cross-canal** | 5    | 🆕     |
| `modules/scheduler` (TareasProgramadas)| Scheduler genérico de reportes (cualquier reporte)  | 8       | 🆕     |
| `modules/configuracion` (per-user)     | **Simplificado**: config por team + valores del plan| 1/6     | ✅/🟡  |
| `modules/dev/simulador`                | Dev Simulator gated por flag                        | 9       | 🆕     |
| `modules/campania-logs` (Redis)        | `CampaignLog` (modelo Prisma) + UI logs en vivo     | 3.C.4.e/4.J | 🆕 |
| `modules/ai` (Gemini + Bedrock)        | LlmProvider switcheable por feature flag            | 7       | 🆕     |
| Realtime sockets (`join_campaña`/inbox)| `EventsService` + rooms scopeadas                   | 2.D     | ✅     |
| Export CSV/XLSX                        | `ReportGenerator` + button en UI + scheduled        | 3.D/8   | 🆕     |
| Audit logs (Winston)                   | `AuditLog` modelo + viewer UI                       | 10.C    | 🆕     |

> **Leyenda:** ✅ hecho · 🟡 parcial · 🆕 nuevo (no estaba antes en el plan o en estado inicial) · ⛔ excluido del MVP

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

- **Versión:** 2.0 — reescritura tras audit exhaustivo de AMSA Sender.
- **Fecha:** 2026-04-30
- **Autor:** plan generado en conversación con el dueño del producto, revisado feature-por-feature contra AMSA.
- **Cambios v2.0**:
  - Fases 0/1/2 marcadas ✅ con detalle.
  - Fase 3 reorganizada en sub-fases granulares (3.A/3.B/3.B'/3.C/3.D/3.E) con estado real.
  - Fase 4 expandida con 11 sub-fases (4.A → 4.K) cubriendo envío, KMS, webhook, sync, campañas, inbox full, quick replies, opt-out, welcome msg, dashboard, buttons.
  - Fase 5 nueva: **Contacts unificados con `externalId` + Timeline cross-canal** (reemplaza módulo `Deudores` de AMSA).
  - Fase 7 nueva (ex Fase 6): IA con `LlmProvider` switcheable Gemini/Bedrock por feature flag + env.
  - Fase 8 nueva: **Scheduler genérico de reportes** (cualquier reporte, agendable, llega por mail con CSV/XLSX).
  - Fase 9 nueva: Dev Simulator (panel interno gated por flag).
  - Fases 10/11/12: ex 7/8/9.
  - Sección nueva "Mapa AMSA Sender → Massivo App" feature-por-feature con estado.
  - Excluidos del MVP confirmados: WhatsApp Web.js (legacy), Gmail OAuth read.
- **Próxima revisión:** al cerrar Fase 3.

> Este plan es un punto de partida ejecutable, no un contrato cerrado. Ajustar según aprendizajes de cada fase. Lo importante no se mueve: aislamiento de tenants, observabilidad, billing y compliance son no-negociables.
