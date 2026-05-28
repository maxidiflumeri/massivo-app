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
  - [x] **.g** Test send / preview en editor de templates ✅ — catálogo de variables (base + custom descubierto de campañas previas), Unlayer recibe `mergeTags` (dropdown nativo en bloques de texto), botón "Insertar variable" al lado del Subject, vista previa fullscreen con datos editables + iframe HTML + envío de prueba SMTP sin crear `EmailReport`. Audit `email.template.testSent`.
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

#### 4.H — Bajas / opt-out ✅
- [x] **Auto opt-out por keyword** implementado en `WapiWebhookService` — al recibir mensaje text inbound cuyo body (trim+upper) coincide exactamente con alguna keyword de `WapiConfig.optOutKeywords` (o defaults `BAJA`/`STOP`/`UNSUBSCRIBE`/`CANCELAR` si vacío), persiste `WapiOptOut` GLOBAL y envía `optOutConfirmMessage` como respuesta. **Worker** (`WapiWorkerService`) chequea opt-out antes del daily-limit → marca `WapiReport.status='CANCELED'` con `error='opted-out:<scope>'` (no consume cuota). Servicio dedicado `WapiOptOutService` (mirror de `SuppressionService` email) con `check/add` idempotentes vía `phoneHash` SHA-256. **Endpoint manual + UI** difieren — el MVP cubre el flujo automático end-to-end.

#### 4.I — Mensaje de bienvenida automático ✅
- [x] **Welcome implementado** vía `WapiConfig.welcomeMessage` (sin delaySec — envío inmediato al detectar primera conversación). El webhook reemplaza `wapiConversation.upsert` por `findFirst + create/update` para distinguir conversaciones nuevas; cuando `isNewConversation=true` y hay welcome configurado, envía el texto vía `sendAutoReply` (respeta `cfg.isTestMode` para chat simulado) y persiste `WapiMessage(fromMe=true, content.system={kind:'welcome'})`. Race P2002 mitigado con catch + refetch. Si la primera conversación arranca con keyword opt-out, dispara welcome **y** opt-out confirm en orden (decisión deliberada — saluda + acusa baja).

#### 4.J — Live dashboard WAPI ✅
- [x] **Backend** — `WapiLiveService.snapshot()` (`apps/backend/src/modules/wapi/live/wapi-live.service.ts`) agrega tres recolectores en paralelo:
  - `collectCampaigns(since5min)`: top 25 campañas con `status IN [PROCESSING, PAUSED]` ordenadas por status/sentAt/createdAt; dos `groupBy` paralelos (totales por status y throughput de los últimos 5 min) sobre `WapiReport`.
  - `collectConfigs(since24h)`: configs activas + `groupBy` SENT en 24 h; como `groupBy` no agrupa por relación, hace un segundo `findMany` para mapear `campaignId → configId`. Percent con cap a 100, mismo cómputo que el worker.
  - `collectInbox()`: 3 `count` (UNASSIGNED+escalated, WAITING, escalated total) + `findFirst` de la más antigua sin asignar.
  - Endpoint `GET /api/wapi/live/snapshot` con guards Clerk + Tenant + Policies(`read Campaign`).
  - Spec con 4 tests (snapshot vacío, totales+throughput, percent cap a 100, inbox counts). 478/478 verde.
- [x] **Frontend** — `/dashboard/wapi/live` (`apps/frontend/src/features/wapi/live/WapiLivePage.tsx`) con 3 widgets:
  - **Campañas en curso**: tabla con nombre/línea/template/estado/total/funnel (LinearProgress + chips P/S/D/R/F)/throughput 5 min/link al detalle.
  - **Uso de líneas (24 h)**: barra de progreso por config con color por umbral (`<80%` success / `80-99%` warning / `100%` error), badge TEST, contador `sent/dailyLimit`.
  - **Inbox snapshot**: 3 KPI cards (sin asignar + edad de la más antigua, en espera, escaladas totales) + link al inbox.
  - Chip "● En vivo" con `socket.connected` + re-fetch debounced 500 ms ante eventos `wapi.report.updated` / `wapi.report.log` / `wapi.conversation.updated`. Coalesce `inFlightRef + pendingRef` para no apilar requests.
  - `liveApi.snapshot(api)` + types mirror del backend (Date como string ISO).
  - Sidebar entry "Dashboard live" (`MonitorHeartIcon`) primero del grupo WhatsApp; ruta `wapi/live` en `App.tsx`.
- **Notas**: no se agregaron eventos socket nuevos — la página reutiliza los emitters existentes del worker, campañas e inbox. Pitfall encontrado: `groupBy` con `Promise.all` + cast `as Promise<…>` rompía la inferencia de Prisma (intentaba el overload de array). Patrón adoptado: separar awaits y castear el resultado, no la promise.

#### 4.K — Botones de templates (INBOX/BAJA/IGNORAR) ✅
- [x] **Schema**: `WapiConversation.priority Boolean @default(false)` + índice `(teamId, priority, lastMessageAt)` (migration `20260506100000_wapi_conversation_priority`).
- [x] **`WapiButtonActionService`** resuelve y aplica acciones de botones interactivos. 3 acciones: INBOX (priority=true), BAJA (opt-out global), IGNORAR (log only). Resolución vía `context.id → WapiReport → campaign.templateId → template.buttonActions[buttonId]`. Acepta shape legacy `string` y nuevo `{action, payload?}`. Fallback a defaults case-insensitive.
- [x] **Webhook integration** maneja ambas shapes Meta (`interactive.button_reply` + legacy `button.payload`) vía helper `extractButtonInfo`. Trigger condition: `isNewConversation || couldTriggerOptOut || buttonInfo`. BAJA dispara `optOutConfirmMessage` (paridad con keyword opt-out).
- [x] **Dev Simulator**: endpoint `POST /api/dev/wapi/simulate/inbound/button` + UI quick-buttons en chat simulado.
- [x] **Inbox UI**: filtro Chip "Priorizadas" + badge ⭐ inline. Backend `?priority=true` con `@Transform` boolean.
- [x] **Templates UI**: editor de `buttonActions` con combo de QUICK_REPLY del template, Select de action, TextField payload con soporte `{{var}}` (resolver runtime pendiente). Endpoint `GET /api/wapi/templates/:id/data-keys` agrega keys de `WapiContact.data` para todas las campañas que usaron el template.
- [x] **Tests**: spec `wapi-button-action.service.spec.ts` (11 casos) + bloque `4.K` en `wapi-webhook.service.spec.ts` (5 casos). 30/30 ✅.

#### 4.L — Dev Simulator de chat WhatsApp (focused inbox QA) 🆕
> Sub-fase específica para QA del inbox conversacional: testear ida/vuelta de mensajes sin cuenta Meta real. Reusa la infra de Fase 9 (Dev Simulator) pero presenta una UI de chat tipo two-pane (cliente virtual ↔ inbox del operador).
>
> Activado por `ENABLE_DEV_SIMULATOR=true` (backend) + `VITE_ENABLE_DEV_SIMULATOR=true` (frontend). Solo aplica a entornos dev/staging.

- [ ] **4.L.1** — Modelo `WapiSimulatorVirtualNumber` (id, teamId, configId, phone, displayName) — números virtuales asociados a un `WapiConfig` real del team. CRUD `/api/dev/wapi/virtual-numbers`. *(diferido — el MVP usa `fromPhone` libre como input del operador)*.
- [x] **4.L.2** — Endpoint `POST /api/dev/wapi/simulate/inbound/{text,media,reaction}` (gated). Construye payload Meta-compatible y lo inyecta en `WapiWebhookService.process(...)`. Para media, acepta upload multipart → guarda local con `WapiMediaService.persistInboundLocal` + genera `mediaId` falso `sim-${randomBytes(8).hex}` + pasa `mediaOverrides` map al webhook para que use el binario local en vez de Meta Graph.
- [x] **4.L.3** — Endpoint `POST /api/dev/wapi/simulate/status` (gated). Construye un `statuses[]` payload (sent/delivered/read/failed) → inyecta en webhook → actualiza `WapiMessage.status`. Status `failed` agrega un error sintético al payload.
- [x] **4.L.4** — UI `/dashboard/dev/wapi/simulator` (visible solo con flag): 4 cards apiladas (texto / media / reacción / status) + selector de WapiConfig. Cubre el use case "inyectar payload puntual".
- [x] **4.L.6** — UI `/dashboard/dev/wapi/chat` (chat ida-vuelta): split layout two-pane. Pane izq "cliente virtual" con composer custom que dispara `/api/dev/wapi/simulate/inbound/{text,media}`; pane der reusa `ConversationHeader/Thread/MessageComposer` del inbox real. La conv se resuelve por `inboxApi.listConversations({tab:'all', configId, search:phone})`. Estado de la sesión persistido en `localStorage`. Requiere una `WapiConfig` con `isTestMode=true` (ver 4.M).
- [ ] **4.L.5** — Audit log de cada evento simulado (quién, cuándo, virtualNumber, payload). Reusa la tabla `AuditLog` (ver 9.C / 10.C). *(diferido)*.

#### 4.L.1 — Filtro de inbox por línea (multi-WapiConfig) ✅
- [x] `ToggleButtonGroup` "Todas / &lt;cada config activa&gt;" en `ConversationList` (sólo aparece con 2+ configs activas), persistido en `localStorage['massivo:wapi-inbox-configId']`. El filtro se aplica a `inboxApi.listConversations` y a los handlers de `wapi.message.new` / `wapi.conversation.updated`. En modo "Todas" multi-config, cada item lleva un Chip outlined con el label de la línea.

#### 4.M — `WapiConfig.isTestMode` (sender short-circuit + chat simulado ida-vuelta) ✅
> Permite tener configs de "test" donde los envíos del operador NO pegan a Meta. Combinado con 4.L.6 da un loop completo de QA sin cuenta Meta real.

- [x] Campo nuevo `WapiConfig.isTestMode: Boolean @default(false)` (migration `20260505180000_wapi_config_is_test_mode`).
- [x] `WapiSenderService.post()` short-circuita si `cfg.isTestMode` → devuelve `wamid.SIM_<base36>_<random>` y `raw: { simulated: true, body }` sin HTTP. Cobertura: text + template + media link + media-by-id (todos pasan por el único `post()`).
- [x] `WapiSenderConfig.isTestMode?` en la interfaz; los 3 callers que arman el config (`wapi-inbox.service.sendText`, `wapi-inbox.service.sendMedia`, `wapi-worker.service` para campañas) lo leen del row de DB.
- [x] DTOs `Create/UpdateWapiConfigDto` aceptan `isTestMode?`. `wapi-configs.service` lo persiste y lo expone en `WapiConfigListItem`/`Detail`.
- [x] UI `WapiConfigsPage`: Switch "Modo test" en el dialog de crear/editar (caja warning con descripción) + Chip "Test" outlined warning en la fila de la tabla.

#### 4.N — Bot guiado por número (menú con botones + handoff a operador) ✅
> Permite armar un mini-IVR para WhatsApp: cuando llega un mensaje de un número que no tiene conversación tomada, el bot manda un menú con botones (máx 3 por nodo, límite Meta). Cada opción navega a otro MENU o a un nodo HANDOFF que cierra la sesión y libera la conversación al operador (con prioridad opcional).

- [x] **Schema** (`20260507100000_wapi_bot_module`): `WapiConfig.botEnabled/botFlow/botSessionTtlMin` + modelo `WapiBotSession` con `(configId, phone)` único + TTL via `expiresAt`. `WapiBotSession` agregado a `TENANT_SCOPED_MODELS`.
- [x] **`WapiSenderService.sendInteractiveButtons`** (Meta `interactive` type=button, máx 3, title slice 20).
- [x] **`WapiBotEngineService`** (`apps/backend/src/modules/wapi/bot/`): handler único `handle(cfg, input) → {handled, ended?, escalate?}`. Disambigua bot vs template (4.K) por prefijo `bot:` en option ids. Sesión por `(configId, phone)` con TTL. HANDOFF cierra sesión + retorna escalate. `endSessionsForConversation()` para que el operador "tome" sin que el bot interfiera.
- [x] **`validateBotFlow`** (estructural): startNodeId, MENU 1–3 opciones, nextNodeId resuelve, ids únicos, kind ∈ {MENU, HANDOFF}.
- [x] **CRUD endpoints**: `GET /api/wapi/configs/:id/bot` (snapshot) + `PATCH` (update). CASL reusa `WapiConfig`. Bloquea habilitar bot con flow inválido/ausente.
- [x] **Webhook integration**: bot corre antes que welcome/optout/4.K. Si maneja → return early. HANDOFF + escalate → `WapiConversation.priority=true`.
- [x] **Inbox integration**: `assign()` y `resolve()` cierran sesiones bot del teléfono.
- [x] **Frontend** `/dashboard/wapi/bots`: selector de config, switch enabled, TTL, lista vertical de cards MENU/HANDOFF, validación cliente espejada, sidebar entry "Bot guiado".
- [x] Tests: 9 validador + 10 engine + 5 integración webhook. 161/161 wapi specs ✅.

**Cómo probar (sin Meta)** — ver bloque "Cómo probarlo (sin Meta)" en CHANGELOG 4.N para el smoke-test paso a paso (resumen: usar `isTestMode=true`, diseñar flow en `/dashboard/wapi/bots`, mandar inbound desde `/dashboard/dev/wapi/chat`, validar que el bot responde, llegar a HANDOFF, tomar la conversación → bot deja de interceptar).

#### 4.N.1 — Editor visual del bot (react-flow) + nodo MESSAGE ✅
> Reemplaza la lista vertical de cards por un canvas estilo draw.io con cajas arrastrables, conexiones por handles y auto-layout dagre. Suma un tercer tipo de nodo `MESSAGE` (texto plano sin botones) que puede encadenarse automáticamente para armar narrativas más fluidas (ej: bienvenida + condiciones de servicio + menú).

- [x] **Schema flow extendido**: nuevo `kind: 'MESSAGE'` con `text` + `nextNodeId?`. Cada nodo soporta `position?: {x, y}` (metadata del editor, ignorada por el motor). `BOT_MAX_AUTO_CHAIN=8` cap.
- [x] **`validateBotFlow`** acepta MESSAGE, valida `nextNodeId` (existe + no auto-referencia).
- [x] **`WapiBotEngineService.handle`** loop de delivery: encadena `MESSAGE → MESSAGE → MENU/HANDOFF` en un solo inbound. MESSAGE terminal upsertea sesión apuntando al MESSAGE; el siguiente texto del cliente re-arranca el bot.
- [x] **Persistencia outbound**: `system.kind: 'bot-message'` para los MESSAGE; `isBotInteractionMessage` lo filtra del inbox del operador (paridad con `bot-menu`).
- [x] **Frontend `WapiBotsPage`** reescrito como canvas react-flow:
  - `@xyflow/react` + `dagre` para auto-layout horizontal.
  - Custom node renderers por kind con handles: MENU emite uno por opción (`op-{id}`), MESSAGE uno (`next`), HANDOFF ninguno (es terminal).
  - Drag persiste `position`. Drag desde handle → conexión que setea `nextNodeId`. Click + Delete sobre edge → desconecta.
  - Drawer derecho de edición (texto/opciones/escalate/marcar inicial/eliminar). Eliminar nodo limpia referencias en otros nodos.
  - Toolbar: selector de config, switch ON/OFF, TTL, add MENU/MESSAGE/HANDOFF, AutoFix, Save.
  - `/dashboard/wapi/bots` agregado a `isFullBleed` para que el canvas use el viewport completo.
- [x] Tests: validador +5 casos, engine +3 casos chain. 27/27 specs `wapi-bot/*` ✅. Frontend typecheck ✅. Backend `nest build` ✅.

**Cómo probar** — ver bloque "Cómo probarlo" en CHANGELOG 4.N.1 (resumen: agregar nodos desde toolbar, conectar arrastrando handles, autolayout, probar chain en `/dashboard/dev/wapi/chat`).

#### 4.N.2 — Nodos CAPTURE / MEDIA / CONDITION + interpolación `{{var}}` ✅
> Tres nuevos tipos de nodo que cubren los casos clásicos de un bot transaccional sin escribir código: pedir un dato y guardarlo, mandar imagen/video/documento/audio reusando media subida a Meta, y branchear según variable / hora / día. Más interpolación mustache-style en cualquier texto entregable.

- [x] **Schema**: `WapiBotSession.data Json? @default("{}")` — donde el motor persiste todo lo capturado por nodos CAPTURE. Migración aplicada vía SQL directa (psql/WSL) por DLL lock de `prisma generate` en Windows.
- [x] **Tipos backend** (`wapi-bot.types.ts`): `BotCaptureNode` (`saveAs`, `validate?: regex|preset`, `nextNodeId`, `retryNodeId?`), `BotMediaNode` (`mediaType: image|video|document|audio`, `mediaId`, `caption?`, `filename?`, `nextNodeId?`), `BotConditionNode` (`branches[].when: var|time|weekday`, `elseNextNodeId`).
- [x] **`validateBotFlow`** kind-aware: regex compilable, `HH:MM` (`/^([01]\d|2[0-3]):[0-5]\d$/`), days 0..6 sin duplicados, audio rechaza caption, refs (`nextNodeId` / `retryNodeId` / `branches[].nextNodeId` / `elseNextNodeId`) resuelven y no auto-referencian.
- [x] **Interpolación** (`bot/interpolate.ts`): regex `\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}`. Aplica en `MESSAGE.text`, `MENU.text`, `CAPTURE.text`, `MEDIA.caption`. Tokens sin valor → `''`.
- [x] **Endpoint upload**: `POST /api/wapi/configs/:id/bot/media` (multipart, FileInterceptor 100MB) → `WapiMediaService.uploadToMeta` → devuelve `{ mediaId, mediaType, size, mime }`. No persiste mensaje (no hay conversación en contexto del editor).
- [x] **Engine** (`WapiBotEngineService.handle`):
  - State machine para `text` inbound: si `currentNodeKind=CAPTURE`, intenta `validate`; éxito ⇒ persiste `data[saveAs]` y avanza por `nextNodeId`; falla ⇒ `retryNodeId` o re-entrega prompt. Si `currentNodeKind=MENU`, re-entrega menú. Otro estado: cierra y re-arranca por `startNodeId`.
  - Bucle `deliverChain` (cap 8): `CONDITION` evalúa `pickConditionBranch` (no entrega); `MESSAGE`/`MEDIA` con `nextNodeId` auto-encadenan; `MENU`/`HANDOFF` cortan.
  - `pickConditionBranch`: var (`eq`/`neq`/`contains`/`matches`), time (con cruce de medianoche), weekday (hora local).
  - `deliverNode` kind-branched: `sendInteractiveButtons` / `sendMediaById` / `sendText`, todos con `interpolate(text, sessionData)`.
  - Persistencia outbound: `system.kind: 'bot-capture' | 'bot-media' | 'bot-condition'` (filtrados del inbox del operador).
- [x] **Frontend espejado**: `types.ts`, `validateClient.ts`, `nodeViews.tsx` (3 vistas nuevas), `NodeEditorDrawer.tsx` (CaptureEditor, MediaEditor con upload, ConditionEditor + BranchWhenEditor), `flowLayout.ts` (`nodeHeight` por kind), `WapiBotsPage.tsx` (3 botones de toolbar, edges nuevos `next`/`retry`/`br-${id}`/`else` con colores y labels, MiniMap coloreado, cleanup de refs al borrar).
- [x] Tests: `interpolate.spec.ts` (9), `wapi-bot.types.spec.ts` (+6, total 22), `wapi-bot-engine.service.spec.ts` (+5, total 17). 39/39 specs `wapi-bot/*` ✅. Frontend `tsc --noEmit` ✅.

**Cómo probar** — ver bloque "Cómo probarlo" en CHANGELOG 4.N.2 (resumen: armar `CAPTURE email → MESSAGE "Gracias {{email}}"`, subir imagen en MEDIA, probar branch CONDITION-time).

#### 4.N.3 + 4.P — Nodo HTTP + Motor de expresiones JSONata + nodo FOREACH ✅

> Tres features integradas en un solo entregable. El nodo HTTP es inútil sin poder navegar la respuesta (arrays/objetos anidados); el motor de expresiones JSONata habilita esa navegación y operaciones sobre cualquier tipo de dato (strings/fechas/arrays/números) con ~100 funciones built-in; FOREACH cierra el ciclo permitiendo iterar arrays como sub-flow.

- [x] **Motor de expresiones JSONata** (`expression-engine.ts`): wrapper sandbox de [JSONata 2.x](https://jsonata.org), cache de expresiones compiladas. Sintaxis opt-in `{{= expr }}` para no romper flows guardados (el `{{var}}` plano sigue funcionando idéntico). `interpolateAsync(template, vars)` reemplaza tokens `{{= ... }}` en paralelo y luego aplica el `{{var}}` plano; fast-path sync si el template no tiene `{{=`. Cubre paths, agregaciones (`$sum`/`$count`/`$average`), arrays (`$filter`/`$map`/`$reduce`), strings (`$substring`/`$replace`/`$uppercase`), fechas (`$now`/`$fromMillis`/`$millis`), conversiones. **Sin eval, sin acceso a globals**.
- [x] **Nodo HTTP** (`BotHttpNode`): `method | url | headers? | body? | timeoutMs? | saveAs | mockResponse? | next/error → nextNodeId/errorNodeId | gotoTopic/errorGotoTopic`. La response se guarda en `session.data[saveAs]` como `{ ok, status, body, error?, durationMs }` + flatten `${saveAs}_ok|_status|_error` (compat con CONDITION).
- [x] **SSRF guard con protección anti DNS rebinding** (`wapi-bot-http-ssrf.ts`): blocklist IPv4 (loopback, RFC 1918, CGNAT, IMDS 169.254.169.254, link-local, multicast, reserved) + IPv6 (ULA fc00::/7, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32, NAT64). `resolveAndValidate(hostname, allowPrivate)` hace DNS lookup propio, valida la IP resuelta y la devuelve al caller; el executor pasa esa IP al `connect.lookup` del undici Agent → el Agent NO re-resuelve DNS (anti-rebinding).
- [x] **Executor HTTP** (`WapiBotHttpExecutor`): dos modos `mock | real`. Mock devuelve `node.mockResponse` o `mock-undefined`. Real: rate-limit per-org (`WAPI_BOT_HTTP_PER_ORG_PER_MINUTE=60` token bucket lazy refill) → interpolación url/headers/body con `interpolateAsync` (body como objeto JSON con interpolación por leaf string, imposible romper sintaxis) → URL parse (sólo http/https; http bloqueado en prod) → SSRF → undici fetch con dispatcher custom (timeout clamp 100..10000 ms, `redirect: 'manual'`, lectura streaming cap 1 MB) → audit log `wapi.bot.http.executed` con `urlHost` (NUNCA URL completa con querystring ni headers sensibles). Todos los errores se devuelven como response, nunca exception: `rate-limited` / `invalid-url` / `invalid-scheme` / `http-not-allowed-in-prod` / `ssrf-blocked` / `redirect-not-followed` / `response-too-large` / `timeout` / `network-error` / `interpolation-failed` / `feature-disabled` / `mock-undefined`.
- [x] **Nodo FOREACH** (`BotForeachNode`): itera arrays como sub-flow. `items` (expresión JSONata que devuelve array), `itemVar`/`indexVar?` (variables asignadas por iteración), `bodyNodeId` (primer nodo del sub-flow), `doneNodeId?`/`gotoTopic?`. Stack `session.data._loops` con frames LIFO para anidamiento. Caps `WAPI_BOT_FOREACH_MAX_ITERATIONS=100` y `WAPI_BOT_FOREACH_MAX_NESTED=3`. **Autoreturn implícito**: cuando el body cae a un terminal sin next, el engine consulta `nextLoopReturnNode(data)` y vuelve al FOREACH para la siguiente iteración — el usuario sólo cablea las edges body→primer-nodo y done→siguiente.
- [x] **Caps de chain**: `BOT_MAX_HTTP_PER_CHAIN=3` (defensa contra runaway compuesto: webhook Meta corta a ~20s). `BOT_MAX_AUTO_CHAIN` subido de 8 → 32 para acomodar FOREACH legítimos.
- [x] **Engine real + sandbox** usan el mismo executor + helpers puros (`applyHttpResult`/`applyForeach`/`nextLoopReturnNode`/`interpolateAsync`). El motor de prod siempre llama en modo `real` — `cfg.isTestMode` NO afecta HTTP (significa "no toques Meta", no "no toques otras APIs"). El sandbox respeta `input.httpMode ?? 'mock'`.
- [x] **Toggle Mock/Real en sandbox UI** (`SandboxDrawer`): Select "HTTP: Mock | Real" al lado de Fuente, default Mock; la primera activación de Real dispara confirm dialog destructive y persiste aceptación en `localStorage`. Mini-bandeja por step con `recentHttpCalls` (chips color-coded `mode · METHOD host → status · durationMs`).
- [x] **Editor visual** (`NodeEditorDrawer`): `HttpEditor` (method/url con `VarPickerTextField`, lista key/value de headers con warning en sensibles, body multiline con validación JSON on-blur, toggle "Respuesta simulada" con status + body JSON), `ForeachEditor` (items con helper de ejemplos JSONata, itemVar/indexVar, selects bodyNodeId/doneNodeId). `WapiBotsPage` agrega botones toolbar HTTP/FOREACH, mapping kind→type para react-flow, edges nuevas (HTTP `next` verde/`error` rojo; FOREACH `body` azul/`done` gris dashed), cleanup en delete, rewrite de `gotoTopic`/`errorGotoTopic` al renombrar topics.
- [x] **Auditoría**: cada request real → `auditLog.log({ action: 'wapi.bot.http.executed', metadata: { configId, nodeId, urlHost, method, status, ok, mode, durationMs } })`. Headers sensibles no se loguean.
- [x] **709/709 backend tests verde** (61 suites). Específicos nuevos: expression-engine.spec (24), wapi-bot-http-ssrf.spec (48), wapi-bot-http-executor.service.spec (19), bot-flow-runtime.spec (17), interpolate.spec (+8 async). Frontend typecheck verde.

**Env vars nuevas** (todas opcionales con defaults seguros):
- `WAPI_BOT_HTTP_ENABLED=true`
- `WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS=false` (dev local)
- `WAPI_BOT_HTTP_PER_ORG_PER_MINUTE=60`
- `WAPI_BOT_FOREACH_MAX_ITERATIONS=100`
- `WAPI_BOT_FOREACH_MAX_NESTED=3`

**Diferido a 4.P.1**: WHILE loop, TRY/CATCH genérico, auth secret manager (OAuth/API keys cifradas con KMS), retries HTTP con backoff jittered, path nav implícito `{{var.path}}` sin `=`, persistencia del bucket rate limit en Redis (hoy in-memory → multi-instance no comparte cuota).

#### 4.O.1 — Multi-topic + Router + Feature flag (env + per-org) ✅
> Soporte para múltiples temas (topics) por config con un router declarativo que decide qué topic abrir según template-payload (regex con named groups → seedData) o keyword exacto. Inter-topic calls vía `gotoTopic`. Botón `BOT` en templates (4ª acción, junto a INBOX/BAJA/IGNORAR). Todo el feature gateado por env (`WAPI_BOT_FEATURE_ENABLED`) AND per-org (`Organization.botEnabled`) — default false en prod, se cobra como add-on de plan superior.

- [x] **Schema** (`20260508100000_wapi_bot_topics_and_org_feature_flag`): `Organization.botEnabled Boolean @default(false)`, `WapiConfig.botTopics Json?`, `WapiConfig.botRouter Json?`, `WapiBotSession.currentTopicId String?`. Aplicada via SQL directa (DLL lock).
- [x] **Tipos** (`wapi-bot.types.ts`): `BotTopic { id, label, flow }`, `BotRouterRule` (template-payload con `pattern`, keyword con `keywords[]`, default), `BotRouter { rules[], defaultTopicId? }`. `gotoTopic?: string` opcional en MESSAGE/MEDIA/CAPTURE/MENU options/CONDITION branches/CONDITION else. Validators `validateBotTopics`, `validateBotRouter`, `validateGotoTopic`.
- [x] **`WapiBotFeatureService`** + **`WapiBotFeatureGuard`** (lanza 403): AND de env + per-org. Aplicado al `WapiBotController`. Webhook + engine también chequean.
- [x] **`WapiBotRouterService.resolve(router, input)`**: matchea por kind, inyecta named groups en `seedData`, fall-back a `defaultTopicId`, regex inválida silenciosa.
- [x] **Engine**: gate al inicio, `resolveTopics(cfg)` materializa multi-topic o legacy `botFlow` como `topics.default`, `runChain()` con soporte `gotoTopic` en todos los puntos de salto, `startTopic()` público para BOT button action (cierra sesión activa y arranca limpio).
- [x] **Webhook + ButtonAction**: `BUTTON_ACTIONS` incluye `'BOT'`. Webhook parsea router de la cfg, llama `resolve()` con buttonId como template-payload, dispara `engine.startTopic()` si matchea.
- [x] **CRUD**: `PATCH /api/wapi/configs/:id/bot` acepta `botTopics?` + `botRouter?`. Validación cruzada (router rules deben referenciar topics existentes).
- [x] **`/me/context`**: `OrgFeatureFlags { bot: boolean }` por org. `VITE_WAPI_BOT_FEATURE_ENABLED` en frontend para gating del sidebar.
- [x] Tests: router (9) + feature service (7) + engine refactor (mocks nuevos en constructor, todos los specs anteriores siguen pasando). 5/5 specs, 66/66 tests ✅.

**Cómo activarlo** — `UPDATE "Organization" SET "botEnabled"=true WHERE id='<org-id>';` + `WAPI_BOT_FEATURE_ENABLED=true` y `VITE_WAPI_BOT_FEATURE_ENABLED=true` en `.env`. Default false en prod por seguridad.

#### 4.O.2 — UI multi-topic + Router en el editor visual ✅
> Cierra el feature de 4.O.1 con la capa de UI. Ahora `/dashboard/wapi/bots` permite armar topics, router y `gotoTopic` sin tocar la API.

- [x] **`types.ts` espejado**: `BotTopic`, `BotRouter`, `BotRouterRule`, `BotRouterRuleKind`, `gotoTopic` opcional en MENU.options / MESSAGE / CAPTURE / MEDIA / CONDITION.branches, `elseGotoTopic` en CONDITION. Snapshot + Update payload extendidos.
- [x] **Validador cliente** (`validateClient.ts`): `validateClient(flow, topicIds?)` acepta `gotoTopic` como alternativa a `nextNodeId` (si se pasan `topicIds` cross-checkea referencias). `validateTopics(topics)` y `validateRouter(router, topicIds)` nuevos para el editor multi-topic.
- [x] **Vista lista (`TopicsListView.tsx`) + breadcrumb nav** en `WapiBotsPage.tsx`: state `topics: BotTopic[]` + `activeTopicId` + `view: 'list'|'topic'|'router'` (default `list`). CRUD de topics vía `TopicDialog.tsx` modal (add/rename con cross-rewrite de `gotoTopic` y `BotRouterRule.topicId`/eliminar). La tabla tiene buscador por nombre/ID, columna de errores con count, ⭐ para `defaultTopicId` y botón "Editar flow" que entra al canvas. Backward compat: si la cfg trae sólo `botFlow`, se materializa como `[{id:'default', label:'Principal', flow}]`. Save manda `botTopics + botRouter` siempre, con `botFlow: null`. **Decisión UX**: tabs scrollables se reemplazaron por tabla post-implementación tras feedback del usuario (no escala a 40-50 topics).
- [x] **`NextOrTopicSelect`** en `NodeEditorDrawer.tsx`: select agrupado *Nodos del flow actual* + *Saltar a otro tema*, mutuamente excluyentes. Aplicado a 6 puntos de salto (MENU options, MESSAGE next, CAPTURE next, MEDIA next, CONDITION branches, CONDITION else). `CAPTURE.retry` queda solo-nodo (intencional).
- [x] **`RouterPanel.tsx`**: editor de `BotRouterRule[]` con reorder up/down, add/eliminar y selector global `defaultTopicId`. Editor por kind:
  - `template-payload`: regex con preview de **named groups** (chips `{{varName}}`) + validación regex en vivo.
  - `keyword`: input multilínea (separador `,` o `\n`) con chips por keyword.
  - `default`: solo selector.
- [x] **Smoke**: typecheck `apps/frontend` + `apps/backend` ✅. No tests UI nuevos (alineado con la convención del repo: validateClient y types ya están cubiertos por el espejo backend).

**Cómo probar**:
1. Crear un tema nuevo desde el botón "+" → renombrar (cambia id+label, refresca refs).
2. En MENU/MESSAGE/CAPTURE/MEDIA/CONDITION abrir el drawer y elegir un destino del grupo "Saltar a otro tema".
3. Tab "Router" → agregar rule `template-payload` con `^OFERTA_(?<plan>\d+)$` y dispatch a un topic. El editor lista `{{plan}}` como variable capturada.
4. Save → ver en `WapiConfig.botTopics` (jsonb) los topics persistidos. Si después editás el `botFlow` legacy via SQL, al recargar el editor lo va a materializar como topic `default`.

**Pendiente (post-4.O.2)**:
- Test E2E con template real + botón `BOT` + payload con named groups → verificar que el router abra el topic con `seedData`.
- Badge visible en los node views cuando una salida tiene `gotoTopic` (hoy queda implícito en el drawer).

#### 4.O.3 — Sandbox + Draft/Publish workflow ✅ (smoke E2E pendiente)
> Permite probar cambios del bot en un emulador interno antes de publicar a producción. Hoy el editor escribe directo a la versión activa: si el número está conectado a WhatsApp real, cualquier cambio impacta a clientes reales sin staging. Multi-tenant: cada `WapiConfig` (1 por número) tiene su propio draft + sandbox; el sandbox es per-org y no usa tokens de Meta.

**Bloque 1 — Backend draft persistence ✅**
- [x] Migración `20260508140000_wapi_bot_draft_publish`: agrega `botTopicsDraft` (jsonb), `botRouterDraft` (jsonb), `botDraftUpdatedAt` (timestamp), `botPublishedAt` (timestamp) a `WapiConfig`. Aplicada con el workaround DDL-lock + `INSERT INTO _prisma_migrations`.
- [x] `WapiBotService.saveDraft`: persiste topics+router en columnas `*Draft` con la misma validación que `update()`. Sella `botDraftUpdatedAt`. NO toca prod.
- [x] `WapiBotService.publish`: copia draft → activo, limpia draft, sella `botPublishedAt`. 400 si no hay draft o el draft tiene refs inválidas.
- [x] `WapiBotService.discardDraft`: limpia draft, deja prod intacta.
- [x] `BotConfigSnapshot` extendido con `botTopicsDraft`, `botRouterDraft`, `botDraftUpdatedAt`, `botPublishedAt`, `hasUnpublishedChanges` (timestamps comparados).
- [x] Endpoints: `PATCH /api/wapi/configs/:id/bot/draft`, `POST /api/wapi/configs/:id/bot/publish`, `POST /api/wapi/configs/:id/bot/discard-draft` (reusa CASL `WapiConfig:read|update`).
- [x] +6 specs en `wapi-bot.service.spec.ts` (saveDraft no toca prod, publish copia y limpia, discardDraft sólo borra draft, `hasUnpublishedChanges` con timestamps, publish bloquea con router inválido o sin draft). Total bot tests: **74 ✅**.

**Bloque 2 — Sandbox engine core (backend) ✅**
- [x] Extraer helpers puros (`resolveTopics`, `handleCapture`, `pickConditionBranch`) a `bot-flow-runtime.ts`. Engine refactoreado para importarlos — sandbox y prod usan el MISMO código de runtime, no se pueden divergir. 74→74 specs post-refactor.
- [x] `WapiBotSandboxService` con sesión in-memory keyed por `${orgId}:${configId}:${userId}:${phone}`, TTL lazy 30 min, cap 10k sesiones por proceso. Mismo behaviour que prod: router-restart, CAPTURE preset/regex, MENU buttons, MEDIA, CONDITION, chain `BOT_MAX_AUTO_CHAIN`.
- [x] Endpoint `POST /api/wapi/configs/:id/bot/sandbox/step` con `SandboxStepDto`. Devuelve `{ messages, session, sourceUsed, unavailable?, errors? }`. NO toca Meta ni DB de sesiones/mensajes.
- [x] Aislamiento multi-tenant: la key incluye `organizationId`, dos orgs distintas con mismo configId+phone no colisionan. Cada user tampoco ve la sesión de otro user.
- [x] +6 specs (`wapi-bot-sandbox.service.spec.ts`): draft over published, source=published override, CAPTURE inválido reentrega, reset, aislamiento orgs, unavailable.

**Bloque 3 — UI sandbox panel (frontend) ✅**
- [x] Toolbar del editor `WapiBotsPage` reemplazado: "Guardar borrador" (saveDraft) + "Publicar" (con confirm dialog mostrando publicado actual vs. borrador) + "Descartar" (sólo visible con draft) + "Probar" (abre SandboxDrawer).
- [x] Badge "Sin publicar" / "Publicado" con timestamp tooltip — refleja `hasUnpublishedChanges`/`botPublishedAt` del snapshot.
- [x] `materializeTopics` prefiere `botTopicsDraft` sobre `botTopics` para arrancar el editor con el último borrador en curso. Mismo fallback al cargar el router.
- [x] `SandboxDrawer.tsx` — chat estilo WhatsApp lateral, llama a `/sandbox/step` con `phone` (persistido en localStorage), `source` (draft|published toggle), inbound text+button. Reset session button, indicador `topicId · nodeId` por mensaje + `sourceUsed` chip. NO pasa por Meta.
- [x] `botApi` extendido con `saveDraft`, `publish`, `discardDraft`, `sandboxStep`. Tipos `BotConfigSnapshot` (con campos draft) + `SandboxStepRequest/Response/OutMessage` espejan el backend.
- [x] `botEnabled`/`botSessionTtlMin` siguen yendo por `update()` (knobs runtime, no contenido) — `handleSaveDraft` los aplica si cambiaron, además de persistir el draft. Un draft inválido no se intenta guardar.

**Bloque 4 — Tracking + smoke** _en progreso_
- [x] Tracking files actualizados (CHANGELOG, PROGRESS, MIGRATION_PLAN).
- [ ] Smoke E2E manual: editar topic, guardar borrador → ver badge "sin publicar" → probar en sandbox → publicar → verificar que prod recibe los cambios.
- [ ] Commit final.

#### 4.O.4 — Variables declarativas en el bot ✅
> Permite declarar variables tipadas (`string|number|boolean`) con valor por defecto a nivel del bot, e insertarlas con un picker en cualquier TextField. Las referencias `{{var}}` no declaradas siguen funcionando como antes (compat) — sólo aparecen como warning de validación. Los defaults se aplican al iniciar/reiniciar la sesión.

**Backend ✅**
- [x] Tipos `BotVariable` + `validateBotVariables` + `inferImplicitVariables` en `wapi-bot.types.ts`. Tipos válidos: `string|number|boolean`. Valida regex `^[a-zA-Z_][a-zA-Z0-9_]*$`, unicidad, type-match del default.
- [x] Migración `20260509100000_wapi_bot_variables`: agrega `botVariables` (jsonb) y `botVariablesDraft` (jsonb) a `WapiConfig`. Aplicada con `npx prisma migrate deploy`.
- [x] Persistencia draft+publish en `WapiBotService` (`saveDraft`/`publish`/`discardDraft`/`update`) — mismo patrón que topics+router.
- [x] `bot-flow-runtime.ts`: `variableDefaults` derivados del array de variables, expuestos en `ResolvedFlow`.
- [x] Defaults aplicados al iniciar sesión en los **3 sites** del engine (`wapi-bot-engine.service.ts`) y los **4 sites** del sandbox (`wapi-bot-sandbox.service.ts`): `data = { ...variableDefaults, ...seedData }` (seedData del router-restart pisa el default si lo definió).
- [x] Validación cross-cutting en `validateBotConfig`: refs `{{var}}` no declaradas → warnings (no bloquean publish).

**Frontend ✅**
- [x] `VariablesPanel.tsx`: CRUD con tabla (name TextField + type Select + description + default editor por tipo), header con count y botón "Importar N implícita(s)" (escanea `CAPTURE.saveAs`, `CONDITION.var`, named groups en template-payloads).
- [x] `VarPickerTextField.tsx`: TextField con adornment `{ }` que abre menú de variables declaradas e inserta `{{name}}` en la posición del cursor (vía `selectionStart`/`selectionEnd`). Aplicado en MESSAGE/MENU/HANDOFF/CAPTURE.text + MEDIA.caption.
- [x] `VariableNameField` (en `NodeEditorDrawer`): Select de variables declaradas con opción "custom…" para introducir nombres ad-hoc. Aplicado en `CAPTURE.saveAs` + `CONDITION.when.var`.
- [x] `validateClient.validateVariables`: paridad client-side (regex, type, type-match del default, unicidad).
- [x] Wiring en `WapiBotsPage`: nuevo `view='variables'` con breadcrumb + warning Alert + tip; botón Variables en `TopicsListView` con badge de errores; payload `botVariables` en `saveDraft`.

**Pendiente (post-4.O.4)**:
- Smoke E2E: declarar `nombre` con default `"cliente"` → mensaje `"Hola {{nombre}}"` sin CAPTURE → debe interpolar el default. Confirmar que las refs no declaradas devuelven literal `{{x}}` (compat).

#### 4.O.5 — Nodo SET_VAR (asignación interna de variables) ✅

Permite que el flow asigne valores a variables sin pedírselos al usuario. Útil para precargar defaults condicionales (p.ej. asignar `prioridad="alta"` en una rama de CONDITION sin un CAPTURE), preparar payloads de handoff o normalizar datos derivados.

**Backend ✅**
- [x] `BotSetVarNode` con `kind: 'SET_VAR'`, `varName`, `value: string|number|boolean`, `nextNodeId? | gotoTopic?` (`wapi-bot.types.ts` + `validateBotFlow` + `inferImplicitVariables`). Excluido del check de `text` requerido.
- [x] `applySetVar` en `bot-flow-runtime.ts`: coerce al tipo declarado en `botVariables` (number → `Number()`, boolean → `['true','1','yes','si','sí']`, string → interpola `{{var}}` con `interpolate()`). Sin declarar → escribe raw (string interpolado, otros tipos directos). `ResolvedFlow` ahora expone `variableTypes: Map<string, BotVariableType>`.
- [x] Engine + Sandbox: handler en el chain loop después de CONDITION — no llama a `deliverNode`, avanza solo al `nextNodeId` o cambia topic vía `gotoTopic`. Defensivamente `deliverNode`/`buildOutMessage` retornan null para SET_VAR.
- [x] 2 specs nuevos en `wapi-bot-engine.service.spec.ts`: (a) interpolación + no entrega de mensaje; (b) coerción de string `'42'` a number cuando la variable está declarada como number. Total: 80→82 verdes.

**Frontend ✅**
- [x] `BotSetVarNode` mirror en `types.ts` + validación en `validateClient.ts`.
- [x] `SetVarNodeView` en `nodeViews.tsx`: card con header gris + `FunctionsIcon`, borde dashed, chip "interno", muestra `{{varName}} = "valor"` en monospace, warning "sin salida" si falta destino. Handles target/source.
- [x] `SetVarEditor` en `NodeEditorDrawer.tsx`: `VariableNameField` para varName + input por tipo (number → `type="number"`, boolean → Switch, string|undeclared → `VarPickerTextField` con interpolación). Cambiar la variable coerce el valor existente al nuevo tipo.
- [x] Toolbar: botón "SET VAR" en `WapiBotsPage` con `FunctionsIcon`, `defaultNodeFor('SET_VAR')` con `varName: '', value: ''`, `nodeIdPrefix → 'set'`. Edge gris dashed (igual que else de CONDITION) para `next`. Integrado en `onConnect`/`disconnectEdges`/`rewriteGotoTopic`/auto-rewire on delete + `flowLayout.ts`.

**Pendiente (post-4.O.5)**:
- Smoke en sandbox: nodo SET_VAR antes de un MESSAGE con `{{varName}}` → confirmar que el mensaje renderiza el valor asignado. Confirmar que el chain no genera un mensaje extra.

#### 4.O.6 — Suspensión del bot + estado WAITING ✅

Cierra el ciclo handoff humano: una vez que un operador toma una conversación (vía botón INBOX, HANDOFF del bot o `take`/`assign` manual), el bot **no vuelve a responder** hasta que la conversación se resuelva. Suma estado intermedio **WAITING** ("respondí, espero al cliente") con TTL configurable que vuelve la conversación a `UNASSIGNED` si el cliente no escribe.

**Backend ✅**
- [x] Schema: `escalated`, `botSuspended`, `waitingUntil`, `lastAssignedUserId` en `WapiConversation` + `botWaitingTtlMin` en `WapiConfig` + valor `WAITING` en enum `WapiConversationStatus`. Migración `20260510120000_wapi_bot_suspension_waiting`.
- [x] Engine guard: `handle()` consulta `botSuspended` antes de cualquier procesamiento — corta seco si está suspendido. HANDOFF marca `escalated:true, botSuspended:true` y reabre RESOLVED si aplica.
- [x] Webhook: cliente que vuelve a escribir sobre WAITING dispara transición automática a `UNASSIGNED + waitingUntil:null`.
- [x] Button INBOX: además de priority, marca `escalated+botSuspended`.
- [x] Inbox service: filtro `escalated:true` uniforme (cross-rol — admin scope verificado, sin back-door); `mine` con OR `(ASSIGNED-mías + WAITING-lastMine)`; `assign/take` setean `botSuspended+escalated`, limpian `waitingUntil`, persisten `lastAssignedUserId`; `resolve` apaga botSuspended+waitingUntil (mantiene escalated); `reopen` reactiva botSuspended.
- [x] Endpoint `POST /api/wapi/inbox/conversations/:id/hold` → `putOnHold`: pre-check ASSIGNED, calcula `waitingUntil = now + cfg.botWaitingTtlMin*60000`, status → `WAITING`, `lastAssignedUserId ← assignedUserId`, `assignedUserId ← null`. Emite socket `wapi.conversation.updated`.
- [x] Worker `WapiBotWaitingExpirerService`: setInterval 5min, cross-tenant (no scoped), `findMany + update` individuales (necesita teamId/configId/phone para emitir socket), `unref()` para no bloquear procesos. Multi-instance safe (DB-level filter).
- [x] Tests: 5 nuevos en `wapi-inbox.service.spec`, 4 nuevos en `wapi-bot-waiting-expirer.service.spec`, 1 ajustado en `wapi-button-action.service.spec`. **474/474 verde**.

**Frontend ✅**
- [x] Types: `WapiConversationStatus` con `WAITING` + `waitingUntil`/`lastAssignedUserId` en list/detail/event types. `inboxApi.hold()`.
- [x] `ConversationHeader`: botón "Poner en espera" (PauseCircleOutlineIcon, warning) sólo visible si `isMine`. `StatusChip` para WAITING con `HourglassBottomIcon` + countdown vivo (`useCountdown` tick 30s). Chip "lo tenías vos" cuando `lastAssignedUserId === currentUserId`.
- [x] `WapiInboxPage.handleHold` + reducer del evento socket actualiza `waitingUntil`/`lastAssignedUserId` en items y conv activa.
- [x] `ConversationList`: chip "En espera" en filas con `status === WAITING`.
- [x] `WapiSimulatorChatPage`: pasa `onHold` para paridad.

**Pendiente (post-4.O.6)**:
- Smoke E2E manual: (1) cliente escribe → bot atiende, (2) operador hace "Take" → bot deja de responder, mensajes del cliente quedan en inbox sin respuesta automática, (3) operador responde + "Poner en espera" → status WAITING con countdown visible, (4) cliente vuelve a escribir antes del TTL → conversación a UNASSIGNED automáticamente, (5) cliente no responde → worker la devuelve a UNASSIGNED tras `botWaitingTtlMin`, chip "lo tenía X" sigue visible.

#### 4.P — Webhook URL por organización (org-scoped) ✅

**Status**: COMPLETADO en sesión 40 (2026-05-07).

**Implementado**:
- Schema `Organization.webhookSlug String @unique` + migration `20260511100000_organization_webhook_slug` (backfill `wbh_<md5>` para orgs existentes; nuevas orgs reciben `wbh_<base64url>` desde `crypto.randomBytes(18)`).
- `OrganizationsModule` con `OrganizationsController.regenerateWebhookSlug()` (`POST /api/orgs/me/webhook-slug/regenerate`, gate `manage Organization`).
- `WapiWebhookController` migrado a rutas `:slug` con cache slug→orgId TTL 60 s. Verify y receive filtran `WapiConfig.organizationId = orgId`. Slug inexistente → 404 sin info-leak.
- Endpoint `GET /api/wapi/configs/:id/reveal-secrets` (gate `manage Organization`) que devuelve `{ webhookVerifyToken }` en claro con log WARN para auditoría.
- `ClerkWebhookService.handleOrganizationCreated` setea slug en create (idempotente bajo retries).
- `MeOrganization.webhookSlug` surface en `/api/me/context`.
- Frontend `WapiConfigsPage`: card top-level con URL completa + copiar + regenerar (gated OWNER/ADMIN, confirm destructive); por fila botón llave para revelar/ocultar verify token + copiar.
- Tests `wapi-webhook.controller.spec.ts` 16/16 verde — scoping por slug, cache, multi-config, errores.

**Decisiones tomadas (vs plan original)**:
- **No mantenemos URL legacy** `/api/webhooks/wapi` sin slug. La ruta antigua se reemplaza directo — no hay tráfico productivo (estamos pre-launch). Si en el futuro hay clientes que requieren transición, se reintroduce con `@Deprecated()` log.
- Cache slug→orgId in-memory per-proceso (TTL 60 s). Multi-instancia tarda 60 s en converger tras regenerate — aceptable. Migrar a Redis sólo si crece tráfico.

**Sigue del plan original (textual)**:

> **Motivación.** Hoy hay **una sola URL de webhook** (`/api/webhooks/wapi`) compartida por todo el SaaS. Cuando Meta llama el GET de verificación, el controller **escanea todas las `WapiConfig` activas** y matchea por `webhookVerifyToken` (timing-safe). Para el POST, el routing al tenant se resuelve por `phoneNumberId` del payload.
>
> Esto funciona porque cada org trae su propia Meta App (cada `WapiConfig` tiene su `accessTokenEnc`/`appSecretEnc`/`webhookVerifyTokenEnc` distintos), pero tiene tres problemas: (1) la verificación es O(N) sobre todas las configs del SaaS, (2) si por bug el `phoneNumberId` resolviera mal, podría haber cross-leakage entre tenants, (3) los logs no dicen a qué tenant pertenece el evento hasta que se resuelve.
>
> **Solución.** URL por organización con un slug opaco: `/api/webhooks/wapi/:slug`. El `slug` no es el `orgId` directo (no exponemos IDs internos) sino un campo random per-org. El verify y el resolve quedan scopeados a esa org.

**Backend**
- [ ] **Schema** — `Organization.webhookSlug: String @unique` (24 chars random, formato `wbh_` + base62). Migración aditiva con backfill por SQL function (gen_random_uuid + base64) o trigger temporal. **No nullable** — todas las orgs existentes obtienen slug en la migración.
- [ ] **Generación al crear org** — hook en `OrganizationsService.create` (o donde se crea el `Organization`) que genera el slug. `crypto.randomBytes(18).toString('base64url')` da 24 chars URL-safe.
- [ ] **Endpoint `POST /api/orgs/me/webhook-slug/regenerate`** — guard `update Organization` (admin de la org). Genera nuevo slug, invalida el viejo. Devuelve `{ slug, fullUrl }`. Útil ante leak sospechoso. Audit log de la rotación.
- [ ] **Webhook controller** — nueva ruta `@Get(':slug')` y `@Post(':slug')`:
  - Resuelve `Organization.webhookSlug → organizationId` (cache in-memory con TTL 60s — el slug cambia muy rara vez).
  - 404 si no matchea (sin filtrar info — mensaje genérico "webhook not found").
  - GET verify: scan limitado a `WapiConfig.where({ organizationId, isActive })` (en lugar de scan global). Sigue timing-safe.
  - POST events: resolve `WapiConfig` por `phoneNumberId` **scopeado a la org** (`where: { organizationId, phoneNumberId }`). Si el `phoneNumberId` no pertenece a esta org → 404 con log warning (intento cross-org indica mal-config en Meta o ataque).
- [ ] **Ruta legacy** `/api/webhooks/wapi` (sin slug) — mantenerla durante transición con `@Deprecated()` log + header `X-Massivo-Webhook-Deprecated: true`. Sigue funcionando con scan global como hoy. **Decisión a tomar**: ¿plazo de remoción? Sugerencia: 90 días desde release.
- [ ] **Tests**:
  - Verify con slug correcto + token de config de la org → matchea.
  - Verify con slug correcto + token de config de **otra** org → 403 (no debe matchear cross-org).
  - Slug inválido → 404 sin info.
  - POST con slug + phoneNumberId de otra org → 404 + log.
  - Legacy URL sigue funcionando + emite warning.
  - Endpoint `regenerate` rota slug y un GET con slug viejo da 404.

**Frontend**
- [ ] **`WapiConfigsPage`** — card al tope de la página "Webhook de Meta" con:
  - URL completa: `{API_BASE_URL}/api/webhooks/wapi/{org.webhookSlug}` con botón copiar (single-click).
  - Texto explicativo breve: "Configurá esta URL en tu Meta App → WhatsApp → Configuración → Webhooks. Es única para tu organización."
  - Link a docs Meta (https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks).
  - Botón "Regenerar" (gated `update Organization`) con `ConfirmDialog` que advierte: "Esto invalida la URL actual. Tendrás que actualizarla en Meta o el webhook dejará de funcionar."
- [ ] **Endpoint para revelar verify token** — `GET /api/wapi/configs/:id/reveal-secrets` (gated `update Config`) devuelve `{ webhookVerifyToken }` desencriptado. UI: botón ojo en la columna Token de la tabla (paridad con el patrón ya usado para accessToken). Audit log de la revelación.
- [ ] **Hook `useActiveOrganization`** o similar que exponga `webhookSlug` (ya viene por Clerk metadata o lo agregamos a `/api/me`). Decisión: probablemente extender el endpoint `/api/me` con `organization.webhookSlug` para no consultar Clerk en cada render.

**Aceptación**
- Org A crea config con `phoneNumberId=123`. Org B crea config con `phoneNumberId=456`. Meta llama `GET /api/webhooks/wapi/{slugA}?hub.verify_token={tokenA}&hub.challenge=xyz` → devuelve `xyz`. Misma llamada con `{tokenB}` → 403. Llamada con slug inexistente → 404.
- POST con slug A y payload con `phoneNumberId=456` → 404 + log warning (no procesa).
- Operador admin regenera el slug; el GET con el slug viejo da 404; el dashboard muestra la URL nueva.
- Verify token visible en la UI con botón ojo (con audit log de la revelación).

**Notas / decisiones abiertas**
- ¿Dejamos la URL legacy `/api/webhooks/wapi` indefinidamente o le ponemos sunset date? Recomendación: sunset 90 días + banner en `WapiConfigsPage` cuando el último `WapiConfig` activo de la org tenga >30 días desde creación (proxy de "ya pueden migrar").
- Cache del slug→orgId: empezar con 60s TTL en proceso. Si crece tráfico, mover a Redis.
- Formato del slug: `wbh_` + 22 chars base62. Prefijo facilita identificarlo en logs y diferenciarlo de otros tokens.

#### 4.Q — Throttle configurable por línea / campaña ✅

> **Motivación.** Hoy el delay entre envíos sucesivos vive sólo como env (`WAPI_DELAY_MIN_MS` / `WAPI_DELAY_MAX_MS`, defaults 30s/60s) — no se puede ajustar por UI ni por línea/campaña. Con `WAPI_WORKER_CONCURRENCY=1` (default) el throughput resultante es ≈ 1.3 mensajes/min ≈ 80/hora. Para campañas urgentes o líneas con quality rating alto necesitamos poder bajar el delay; para líneas nuevas (rating en construcción) necesitamos poder subirlo.
>
> El daily limit per `WapiConfig` ya existe (`dailyLimit`, default 200) — esto es complementario: **cota diaria** (cap), no **rate** (velocidad).

**Backend**
- [x] **Schema** — `WapiConfig.sendDelayMinMs Int @default(30000)` + `WapiConfig.sendDelayMaxMs Int @default(60000)`. Migración aditiva `20260512100000_wapi_config_send_delay`.
- [x] **Override per-campaña** — `WapiCampaign.config` (JSON) acepta opcional `{ delayMinMs?: number, delayMaxMs?: number }`. Validado en `assertCampaignConfig()` (rango `[1000, 3_600_000]`, min ≤ max).
- [x] **Worker** — `WapiWorkerService.jitterMs({campaignConfig, configRel})` resuelve cascada `campaign override → config → env → default 30s/60s`, ordena lo/hi defensivamente.
- [x] **DTOs + validación** — `Create/UpdateWapiConfigDto.sendDelayMinMs/Max` con `@IsInt @Min(1000) @Max(3_600_000)`. Service `assertDelayRange()` cruza con valor persistido en updates parciales.
- [x] **Tests** — +5 worker (cascada + min>max sucio), +4 configs service (range + partial update), +5 campaigns service (`assertCampaignConfig`), live spec actualizado con `delaySource/sendDelayMin*`.

**Frontend**
- [x] **`WapiConfigsPage`** — sección "Velocidad de envío" con TextField min/max (segundos) + helper en vivo `~X envíos/min · ~Y/hora`. Validación local antes del PATCH.
- [x] **Wizard de campaña** (`WapiCampaignDetailPage`) — switch "Pisar velocidad de envío para esta campaña" + Collapse con min/max + estimación. Persiste como `config.delayMinMs/Max`; off limpia las keys.
- [x] **Live dashboard** (`WapiLivePage`) — tooltip sobre nombre de campaña con velocidad efectiva (`delayMin–Max`, source `campaign|config`, throughput estimado), mini chip `Velocidad ★` cuando hay override; tooltip sobre nombre de línea con su delay base.

**Aceptación**
- Editar `WapiConfig` y bajar `sendDelayMinMs` a 5000 / `sendDelayMaxMs` a 10000 → próximas campañas que no overrideen corren a ≈ 8 mensajes/min en vez de 1.3.
- Crear campaña con override `{ delayMinMs: 60000, delayMaxMs: 120000 }` → el worker espera entre 60-120s aunque el config diga 5-10s.
- Validación `min > max` en UI muestra error inmediato; backend devuelve 400 si llega un body inválido.
- En live dashboard, hover sobre nombre de la línea muestra "Delay: 5-10s (≈8 msg/min)".

**Notas / decisiones abiertas**
- ¿`sendDelayMinMs` debería tener cap superior? Ej. 10 minutos = 600000ms. Sin cap, alguien podría poner 1h y pensar que el worker está roto.
- ¿Mover `WAPI_WORKER_CONCURRENCY` a la UI también? No por ahora — multi-worker sync requiere coordinación cross-proceso (Redis), queda para cuando se necesite escalar.
- ¿Mostrar al guardar una preview "con estos delays, una campaña de 1000 contactos tarda ≈ X horas"? Útil pero post-MVP.

#### 4.R — Scheduler de campañas (WAPI + Email) ✅

> **Motivación.** Hasta ahora `scheduledAt` era decorativo: ningún worker monitoreaba campañas `SCHEDULED` para dispararlas en su hora, y `update()` no transicionaba el status cuando se editaba la fecha — el tab "Programadas" quedaba siempre vacío. Esto aplica idéntico para WAPI y Email.

**Backend**
- [x] **`WapiCampaignSchedulerService` cross-tenant** — `setInterval(60s)` lee `WapiCampaign` con `status='SCHEDULED' AND scheduledAt <= NOW()` (batch 50) y dispara `WapiCampaignsService.send()` per-row bajo un `TenantContext` sintético construido con la `organizationId/teamId` de la campaña. Multi-instance safe via la transición a `PROCESSING` en transacción dentro de `send()`.
- [x] **`EmailCampaignSchedulerService`** — equivalente para email-campaigns.
- [x] **Fix transición `update()`** — DRAFT + scheduledAt → SCHEDULED, SCHEDULED + scheduledAt:null → DRAFT, PAUSED no se toca. Aplicado en ambos services.
- [x] **Tests** — +7 tests de scheduler (tick happy/empty/resiliente, filtro por status+scheduledAt) +6 tests de transición en update services.

**Aceptación**
- Crear o editar una campaña WAPI/Email con fecha futura → aparece en el tab "Programadas".
- Llegada la hora, el scheduler la mueve a `PROCESSING` y enquola los reports automáticamente sin que nadie apriete "Enviar".
- Borrar la fecha de una campaña SCHEDULED → vuelve a DRAFT y deja de estar en "Programadas".

**Notas / decisiones abiertas**
- TICK_MS=60s elegido como balance entre granularidad (puntualidad ±60s) y carga de DB. Si alguna vez se necesita programación al segundo, bajar.
- El scheduler usa `setInterval` simple en lugar de `@nestjs/schedule` para mantener la dep mínima — mismo patrón que `WapiBotWaitingExpirerService`.

#### 4.S — Audit Log de transacciones de usuario ✅

> **Motivación.** Necesitamos saber quién hizo qué en el sistema: quién creó una campaña, quién dio de alta SMTP, quién la pausó, quién agregó contactos, quién reveló secrets, etc. — con timestamp, organización y team. Base para compliance, debugging cross-team y forensics. El modelo `AuditLog` ya existe en Prisma desde Fase 1; lo cableamos ahora.
>
> **Estrategia.** Pattern decorator + interceptor (estándar Nest): un `@Audit({...})` por endpoint mutante + `AuditInterceptor` global que escribe sólo on-success vía `tap()`. Cero acoplamiento en services, fácil de cubrir incrementalmente, fail-closed (si falla la escritura no rompe la acción del usuario).
>
> Se descompone en sub-stages para poder ir commiteando incrementalmente.

##### 4.S.1 — Stage 1: infraestructura base ✅
- [x] **`AuditLogService.log(entry)`** (`apps/backend/src/common/audit/audit-log.service.ts`): cross-tenant, fire-and-forget. Toma `actorUserId` + `organizationId` + `teamId` del `TenantContext` (con override explícito para jobs cross-tenant). Si no hay `organizationId` ni override → descarta con WARN. Sanitiza metadata recursivamente con regex `/access[_-]?token|app[_-]?secret|verify[_-]?token|password|secret|api[_-]?key|enc$/i` → `[REDACTED]`. Try/catch interno: si falla `prisma.auditLog.create` loggea WARN pero no propaga.
- [x] **`@Audit({ action, resourceType?, resourceIdFrom?, includeBody? })`** (`audit.decorator.ts`): `SetMetadata` clave `audit_metadata`. `resourceIdFrom` admite `param:<key>`, `body:<key>`, `response:<key>`.
- [x] **`AuditInterceptor`** (`audit.interceptor.ts`): registrado como `APP_INTERCEPTOR` global. Lee metadata via `Reflector`, captura `req.body` (a menos que `includeBody:false`), `req.params`, `req.ip` (con `x-forwarded-for` first-hop), `req.headers['user-agent']`. Usa `tap()` de rxjs para escribir audit sólo on-success — si el handler tira, no se escribe nada.
- [x] **`AuditLogModule`** global con `APP_INTERCEPTOR`. Registrado en `app.module.ts`.
- [x] **Migration** `20260513100000_audit_log_resource_actor_indexes`: dos índices nuevos en `AuditLog` para queries comunes en futuro panel:
  - `(organizationId, resourceType, resourceId)` — listar historial de un recurso específico.
  - `(actorUserId, createdAt)` — listar historial de un usuario.
- [x] **Tests** — +13 (8 service: contexto, override, sin org descarta, prisma falla, sanitización profunda, etc. + 5 interceptor: sin decorator, response:id, param:id, error no audita, x-forwarded-for, includeBody:false).

##### 4.S.2 — Stage 2: cobertura WAPI campaigns + 4.L.5 + 4.P reveal ✅
- [x] `WapiCampaignsController` — `@Audit` en create/update/addContacts/send/pause/resume/forceClose/remove (8 endpoints; `addContacts` con `includeBody:false` por payloads grandes).
- [x] `DevSimulatorController` (4.L.5 pendiente) — `@Audit` en text/media/reaction/button/status (5 endpoints; media con `includeBody:false`).
- [x] `WapiConfigsController` — `@Audit` en revealSecrets (4.P pendiente) + create/update/remove.
- [x] **Caso especial** — `WapiCampaignSchedulerService` no pasa por HTTP. Llamada manual a `auditLog.log({ action: 'wapi.campaign.sent', actorUserId: null, metadata: { source: 'scheduler', name } })` después de cada `send()`, dentro del `TenantContext.run` para que herede org/team.

##### 4.S.3 — Stage 3: cobertura WAPI inbox/bot/quick-replies/templates ✅
- [x] `WapiBotController` — bot.updated/mediaUploaded/draftSaved/published/draftDiscarded (sandbox/step queda sin auditar — preview in-memory sin side-effects).
- [x] `WapiInboxController` — messageSent/mediaSent/taken/assigned/unassigned/resolved/reopened/held (8 endpoints; mediaSent con includeBody:false).
- [x] `WapiQuickRepliesController` — created/updated/deleted.
- [x] `WapiTemplatesController` — syncedFromMeta/submittedToMeta/created/updated/deleted.
- [x] **Sin opt-out controller** — el opt-out se procesa internamente en `WapiButtonActionService` y `WapiWebhookService` por keyword inbound; no es transacción de usuario.

##### 4.S.4 — Stage 4: cobertura Email + SMTP + templates ✅
- [x] `EmailCampaignsController` — created/updated/contactsAdded/sent/paused/resumed/forceClosed/deleted (8 endpoints; contactsAdded con includeBody:false).
- [x] `EmailCampaignSchedulerService` — manual log post-send (paralelo a 4.S.2 WAPI).
- [x] `SmtpAccountsController` — smtp.created/verified/testSent/updated/deleted.
- [x] `EmailTemplatesController` — template.created/updated/deleted (create/update con includeBody:false — payloads HTML/JSON Unlayer pesados).
- [x] `SuppressionsController` — suppression.unsubscribeAdded/unsubscribeRemoved/bounceRemoved.

##### 4.S.5 — Stage 5: org-level ✅
- [x] `OrganizationsController` — `org.webhookSlugRegenerated`.
- [x] `TeamsController` — team.created/updated/deleted.
- [x] `TeamMembersController` — team.memberAdded/memberRoleChanged/memberRemoved.

##### 4.S.6 — Stage 6: frontend `/dashboard/audit` ✅
- [x] **Backend `GET /api/audit-logs`** (`apps/backend/src/modules/audit-logs/`): cursor pagination (`take=limit+1` trick, default 50, max 200), filtros opcionales `actorUserId` / `resourceType` / `resourceId` / `action` / `from` / `to`. Tenant-scoped por `prisma.scoped.auditLog` (org-scope). Enriquece cada fila con datos del actor (`User.findMany` + map) — `name`, `email`, `avatarUrl`. Permission gate: `read AuditLog` (CASL).
- [x] **CASL** — agregado `'AuditLog'` a `SubjectName`. `OWNER` y `ADMIN` ganan `can('read', 'AuditLog', { organizationId })`. Otros roles no ven el panel.
- [x] **Frontend `/dashboard/audit`** (`apps/frontend/src/features/audit/AuditLogPage.tsx`): tabla con fecha + actor (avatar+nombre+email) + acción (chip mono) + recurso (type+id) + IP. Filtros con campos para actor user ID, acción, resourceType/Id, rango de fechas (datetime-local). Botón "Cargar más" con cursor. Click en fila → drawer derecho con detalle completo + metadata JSON pretty-printed (preformateado, scrollable, monospace).
- [x] **Sidebar** — entry "Audit log" en grupo "Cuenta" con icono History.
- [x] **Tests** — +9 service tests (vacío, paginación, clamp limit, cursor, filtros combinados, fechas, enrich actor, sin actor, actor borrado).

**Aceptación final 4.S**
- Crear/pausar/borrar/asignar cualquier recurso aparece como fila en `AuditLog` con `actorUserId` correcto (Clerk userId), `organizationId` y `teamId` de la sesión, `action` con namespace canónico, `metadata` sin secrets en claro.
- Acciones del scheduler quedan registradas con `actorUserId=NULL` y `metadata.source='scheduler'` para distinguirlas.
- Frontend permite filtrar y exportar el historial.

**Notas / decisiones**
- No hookeamos Prisma middleware: queremos audit a nivel **acción de usuario** (UI), no a nivel **mutación de DB**. Una acción puede tocar N tablas; una mutación puede ser side-effect de un job y no le pertenece a nadie. Decorator + interceptor es lo correcto.
- Los webhooks de Meta/Clerk **no** se auditan en este módulo — son inbound, no transacciones de usuario. Tienen su propio logging con Winston.
- `AuditLog.metadata` es `Json?`. Cap implícito al payload: el body completo del request, sanitizado. Si en el futuro hay endpoints con payloads enormes, agregar `includeBody:false`.

**Aceptación 4.L:**
- Crear un virtual number `+5491100000001` ligado a un `WapiConfig` de prueba.
- Desde el chat-simulator: el cliente virtual escribe "hola" → aparece en el inbox real del team. El operador responde con texto / foto / audio / documento → el simulator muestra el mensaje en la vista cliente con caption + media renderizada. Reacciones (cliente → operador) y botones (template inbound) funcionan end-to-end. Statuses delivered/read se reflejan en los checks azules del operador.
- Con `ENABLE_DEV_SIMULATOR=false`, los endpoints devuelven 404 y la UI no aparece en el sidebar.

**Aceptación Fase 4:**
- Dos tenants con cuentas Meta distintas envían campañas en paralelo sin interferencia, webhooks llegan al tenant correcto.
- Inbox: asesor ve solo conversaciones del team, admin ve cola sin asignar, asignar+resolver funciona, media sube/baja con URL firmada.
- Opt-out automático por palabra clave funciona.
- Daily limit por config no se excede ni siquiera bajo carga (test con campaña de 1000 contactos y limit=50 → 50 envíos al día 0, resto los próximos días).

---

### Fase 5 — Contacts unificados + Timeline cross-canal 🆕

> Reemplaza el módulo `Deudores` de AMSA con una versión genérica multi-tenant.

#### 5.A — Contact unificado a nivel organización + identidad multi-clave
- [x] **5.A.1** — Schema: `Contact` pasa a **org-scope** (`teamId` opcional para soft-ownership). Nuevos campos de identidad: `externalId`, `dni`, `cuit`, `email`, `phoneE164`. Uniques por org en strong keys (`externalId`, `dni`, `cuit`); índices en weak keys (`email`, `phoneE164`). `EmailContact` y `WapiContact` ganan `contactId String?` con FK `ON DELETE SET NULL`. Nuevas tablas `ContactMergeSuggestion` (left/right + matchType `EMAIL|PHONE` + status `PENDING|ACCEPTED|REJECTED`) y `ContactImportJob` (file metadata + mapping JSON + counters total/processed/created/updated/suggested + status). Migración + backfill SQL idempotente en `20260514100000_contacts_unification` (DISTINCT ON con "longest name wins"). `tenant-models.ts` mueve `Contact`/`ContactMergeSuggestion`/`ContactImportJob` a `ORG_SCOPED_MODELS`. CASL: OWNER/ADMIN `manage` sobre los 3 subjects; MEMBER CRUD `Contact` + create/read `ContactImportJob`; VIEWER read-only.
- [x] **5.A.2** — `ContactsService` org-scope: CRUD por `organizationId`, búsqueda multi-clave (cascada `externalId > dni > cuit > email > phoneE164`), endpoints `GET /api/contacts` (list paginado con cursor + filtros `q/externalId/dni/cuit/email/phone`), `GET /api/contacts/by-identity` (resolución por cualquier identidad), `GET /api/contacts/:id`, `POST /api/contacts`, `PATCH /api/contacts/:id`, `DELETE /api/contacts/:id`. `@Audit` en mutaciones. Validación AR: DNI (7-8 dígitos) + CUIT (checksum mod-11). Util `identity.ts` con `normalizeDni/Cuit/Email/PhoneE164/ExternalId`. Tests +24 (identity util + service).
- [x] **5.A.3** — CSV import wizard inline: `POST /api/contacts/imports` (JSON con `fileName/fileSize/mapping/rows[]`; frontend parsea CSV y aplica mapping client-side, V1 sin multer ni queue). Procesador in-process aplica cascada de identidad: strong key (externalId/dni/cuit) → auto-update; weak key (email/phone) sin strong key en row → update; weak match + row con strong key → si conflicto P2002 al update, crea Contact nuevo + `ContactMergeSuggestion` (status PENDING, ordering `left.id < right.id` para uniqueness estable, `matchType EMAIL|PHONE`). Counters `total/processed/created/updated/suggested` + `errors[]` (rows sin identificadores válidos / DNI/CUIT inválido siguen procesando). Endpoints `GET /api/contacts/imports` (lista paginada) + `GET /api/contacts/imports/:id`. `@Audit('contact.import.created')` en POST. Validación V1: max 10k rows, max 100MB. Tests +8 (service spec con mocks de prisma.scoped). 570/570 backend tests verde.
- [x] **5.A.4** — Merge backend: `GET /api/contacts/merge-suggestions?status=PENDING|ACCEPTED|REJECTED&cursor&limit` con cursor pagination + `include` de left/rightContact (snapshot completo). `POST /api/contacts/merge-suggestions/:id/accept` corre dentro de `prisma.scoped.$transaction`: copia campos no-null del right a left donde left tiene null (`buildProfilePatch`); rechaza si hay conflicto en strong keys (externalId/dni/cuit distintos no-null en ambos lados → 400); relinkea `EmailContact.contactId` + `WapiContact.contactId` (updateMany simple); para `ContactTag` y `ContactListMember` hace `findMany` de tagIds/listIds del left, `deleteMany` de duplicados en right (PK compuesto rompería el updateMany), luego `updateMany` del resto; marca suggestion `status=ACCEPTED + decidedByUserId + decidedAt`; `delete` right (cascade limpia ContactMergeSuggestions involucrando right). Devuelve `{ mergedContactId, removedContactId, relinked: { emailContacts, wapiContacts, contactTags, contactListMembers } }`. `POST :id/reject` marca REJECTED + decidedBy/At sin tocar contacts. `@Audit('contact.merge.accepted'|'contact.merge.rejected')` en ambos. CASL: MEMBER `read+update`, VIEWER `read` (OWNER/ADMIN ya tenían `manage`). Tests +8 (list filtra PENDING + cursor; accept happy path con relink counts; accept con dedupe de tags/lists ya en left; accept rechaza strong-key conflict; accept NotFound; accept ya decidida → 400; reject happy path; reject NotFound). 578/578 backend tests verde. **Frontend en 5.D**.

#### 5.B — Timeline aggregator ✅
- [x] Service `ContactTimelineService.getTimeline(contactId, { cursor?, limit?, channel? })`: agrega cronológicamente desde 5 fuentes:
  - `EmailReport` (1 entry @ `sentAt ?? createdAt` con `kind = email.{status.lowerCase}`: queued/sent/failed/bounced/complained/suppressed/canceled).
  - `EmailEvent` (1 entry @ `occurredAt` con `kind = email.opened|email.clicked`).
  - `WapiReport` (hasta 4 entries por report — uno por cada timestamp no-null entre `sentAt/deliveredAt/readAt/failedAt`, con `kind = wapi.{event}`).
  - `WapiMessage` (1 entry @ `timestamp` con `kind = wapi.message.{in|out}` según `fromMe`, vía `WapiConversation.phone IN [contact.phoneE164, ...wapiContact.phone]`).
  - `AuditLog` (1 entry @ `createdAt` con `resourceType='Contact'` AND `resourceId=contactId`).
- [x] Endpoint `GET /api/contacts/:id/timeline?cursor=ISO&limit=&channel=email|wapi|audit`. Cursor por timestamp ISO (V1: pierde precisión cuando hay items con el mismo `at`; mejorable a `(at,id)` en V2). Buffer `PER_SOURCE_BUFFER=200` por fuente, merge in-memory, sort desc por `at` (tiebreak por id), slice `limit` (default 50, max 100). `NotFoundException` si Contact no existe; `BadRequestException` si cursor inválido. Tests +7 (NotFound, cursor inválido, email reports+events, wapi reports expandido, channel=audit aislando queries, limit+nextCursor, cursor filtra futuros).

#### 5.C — Búsqueda y filtros avanzados ✅
- [x] Endpoint `GET /api/contacts/search` con filtros: `q` (ILIKE OR contra `firstName/lastName/email/externalId/phoneE164`), `tags[]` (`tags.some.tagId.in`), `channel=email|wapi` (existe `emailIdentities`/`wapiIdentities`), `hasOpened/Clicked/Bounced` (Prisma nested filter sobre `emailIdentities.some.reports.some` — `firstOpenedAt not null`/`firstClickedAt not null`/`status=BOUNCED`). `tags`/`hasOpened|Clicked|Bounced` con coerción string→array y string→bool desde query (`@Transform`). DTO `SearchContactsQueryDto` con validación exhaustiva. Sin `tsvector` en V1 (ILIKE alcanza para volumen actual).
- [x] Cursor pagination por `id` + sort configurable: `sort=createdAt|updatedAt|name` × `direction=asc|desc` (default `updatedAt desc`). `sort=name` ordena por `lastName, firstName, id` con la misma direction. Endpoint registrado **antes** de `:id` en el controller (Nest route order). Tests +12 en `contacts.service.spec.ts` (q, tags, channel email/wapi, hasOpened/Clicked/Bounced, sort+direction, sort=name, default sort, cursor+limit, combinación q+tags+channel+sort, hasOpened con channel=email se reescribe sin perder reports filter).
- [x] **Deferido a V2**: `lastActivityFrom/To` filter + `lastActivity desc` sort. Requiere denormalización (`Contact.lastActivityAt` + backfill SQL + bumps en `EmailWorker`/`WapiWorker`/`WapiInbox.send`/`SesWebhook`/`WapiWebhook`/`TrackService`) — demasiado invasivo para V1; documentado para Fase 5.E o futuro.
- [x] 598/598 backend tests verde.

#### 5.D — Frontend Contacts ✅
- [x] **5.D.1** — Lista `/dashboard/contacts`: tabla con name/email/phone/externalId + search (`q`) + filtros (channel email|wapi, hasOpened/Clicked/Bounced) + sort configurable (updatedAt|createdAt|name × asc|desc) + cursor pagination + click-to-detail. Wire al endpoint `GET /api/contacts/search` de 5.C. Sidebar entry "Contactos" en grupo "Datos" (ContactsIcon). **Bulk actions deferidas a V2** (tag/untag/delete/export — backend no las tiene aún, requeriría endpoints `POST /contacts/bulk/{tag,untag,delete}` y `download` para export).
- [x] **5.D.2** — Ficha `/dashboard/contacts/:id`: panel de identidad (externalId/dni/cuit/email/phoneE164/phone) + metadata (creado/actualizado/team) + atributos JSON pretty-printed + **timeline cross-canal** unificado contra `GET /api/contacts/:id/timeline` con toggle de canal (todo/email/wapi/audit), iconos y colores por kind (queued/sent/delivered/read/failed/opened/clicked/bounced/complained/suppressed/canceled/message.in/message.out/audit), metadata expandido por tipo (subject+campaignName+targetUrl+error en email; type+caption en wapi.message; campaignName+error en wapi.report; action en audit) + cursor pagination "Cargar más". 404 redirige a la lista.
- [x] **5.D.3** — Bulk import `/dashboard/contacts/import`: textarea para paste o file upload (.csv, max 100MB) → parser CSV inline (maneja quotes + `""` escape + multilínea quoted) → mapping wizard (Chip header + Select per column con auto-detect ES/EN: externalId/dni/cuit/email/phone/firstName/lastName/__attributes/__skip; deshabilita opciones ya tomadas para evitar duplicados, excepto __attributes y __skip) → preview de hasta 10 filas mapeadas en tabla monoespaciada + validación inline (al menos un identificador asignado, max 10k filas) + `POST /api/contacts/imports` inline (V1 sin polling porque el backend procesa síncrono y devuelve el job DONE) → muestra counters (total/processed/created/updated/suggested) + lista de errores (top 5) + link directo a `/dashboard/contacts/merge` si `suggested > 0`.
- [x] **5.D.X** — Merge UI `/dashboard/contacts/merge`: filtro por status (PENDING/ACCEPTED/REJECTED), cards con dos paneles lado a lado (left = "gana donde tiene valor" en azul, right = "rellena nulls"), Chip con matchType+matchValue, botones Aceptar (vía `/accept`) + Rechazar (vía `/reject`) con `ConfirmProvider` (destructive en Aceptar), detección **client-side** de strong-key conflict (externalId/dni/cuit distintos no-null) que deshabilita Aceptar y muestra Alert; el backend igual valida y rechaza con 400 si se intenta. Cursor pagination.
- [x] Frontend typecheck ✅. 4 páginas nuevas: `ContactsListPage`, `ContactDetailPage`, `MergeSuggestionsPage`, `ContactsImportPage`. Ruta `/dashboard/contacts/{,:id,/merge,/import}`. **Sin tests E2E ni unit por ahora** (decisión: el frontend del proyecto actualmente no tiene infra de tests; los flows críticos están cubiertos en backend).

#### 5.D.1 — Carga de contactos vía campañas (strong key obligatorio + Contact upsert) ✅
- [x] **Decisión de diseño**: la carga de contactos siempre es **vía creación de campaña** (Email/WAPI). El flujo standalone `/dashboard/contacts/import` se elimina; cada fila del CSV de campaña debe traer **al menos uno de `externalId | dni`** para que el `Contact` unificado se cree o se mergee correctamente cross-canal.
- [x] **Backend reusable**: nuevo `ContactUpsertService.upsert(input) → { contactId, outcome: 'created'|'updated'|'suggested' }` que extrae la cascada de matching/merge de `ContactImportsService` (strong key `externalId>dni>cuit` con `findFirst` sucesivos → updateContact con catch P2002 + `maybeSuggestWeakConflict`; weak key `email>phoneE164` con condicional según haya o no strong key en el row; sino create). `ContactsModule` lo `exports` para inyección cross-module.
- [x] **Email campaigns**: `EmailCampaignsService.addContacts()` rewrite — fail-fast `BadRequestException` si alguna fila no trae `externalId|dni`; per-row `contactUpsert.upsert(...)` + `prisma.scoped.emailContact.create({ contactId, ...})` (cambio `createMany` → `create` para attachear `contactId` por fila); response `{ created, contactsCreated, contactsUpdated, suggestionsCreated }`. DTO `CampaignContactDto` con `externalId/dni/cuit/firstName/lastName` opcionales.
- [x] **WAPI campaigns**: `WapiCampaignsService.addContacts()` mirror del cambio (`phone` en lugar de `email`).
- [x] **Frontend**: `parseContactsCsv()` en `CampaignDetailPage` (email) y `WapiCampaignDetailPage` (wapi) reescrito para reconocer headers de strong key (`externalId|external_id|idexterno|id_externo|dni|documento|cuit`), rechazar CSV sin strong-key column, validar per-row. Tipos `CampaignContactInput`/`WapiCampaignContactInput` extendidos con los 5 nuevos campos. Placeholders + copy actualizados.
- [x] **Removed**: `ContactsImportPage.tsx`, ruta `/dashboard/contacts/import`, botón "Importar CSV" del `ContactsListPage`, types `ContactImportJob`/`ContactImportJobPage`/`CreateImportRequest`, backend `ContactImportsService` + controller + DTO + spec.
- [x] **Tests**: specs de campaña actualizados (mock `contactUpsert.upsert`, mock `emailContact.create`/`wapiContact.create`, 4to constructor arg) + 2 nuevos casos (sin strong key → BadRequest; PROCESSING → Conflict). **593/593 backend tests verde**. Backend + frontend typecheck ✅.
- [x] **Housekeeping diferido**: el modelo Prisma `ContactImportJob`, el subject CASL `'ContactImportJob'` y la entry en `tenant-models.ts` quedan huérfanos sin impacto. Cleanup diferido a un pass futuro (no se migra schema; sin riesgo).

#### 5.E — Reportes consolidados ✅
- [x] **Reportes agregados**: `POST /api/contacts/reports/aggregated` con `groupBy=tag|attribute|externalIdPattern`. Tag agrega `_count.contacts` + emailContactCount/wapiContactCount via `distinct: ['contactId']` sobre `emailContact`/`wapiContact`. Attribute fetcha contacts capeados (`MAX_LIST_ROWS`) y agrupa por valor JS post-fetch (Postgres JSONB no permite groupBy directo en Prisma; cap secundario `MAX_AGGREGATED_GROUPS=5_000`). ExternalIdPattern usa Prisma `startsWith` y reporta una fila resumen con counts. Validación BadRequest si falta `attributeKey` (modo attribute) o `externalIdPrefix` (modo externalIdPattern).
- [x] **Reporte "actividad por contacto"**: `POST /api/contacts/reports/activity/:contactId`. Loop interno con cursor sobre `ContactTimelineService.getTimeline` hasta `MAX_ACTIVITY_ROWS=10_000`. Filtra `dateFrom`/`dateTo` en memoria post-fetch (más simple que pushar al cursor del timeline). Columnas: `at, channel, kind, subject, campaignName, error, direction (in|out para wapi.message.*), metadata (JSON stringify del resto)`. NotFound si el Contact no existe.
- [x] **Lista filtrada de contacts**: `POST /api/contacts/reports/list`. Reusa `ContactsService.search` con los mismos filtros (q/tags/channel/hasOpened/hasClicked/hasBounced/sort/direction) en loop con cursor hasta `MAX_LIST_ROWS=50_000`. Enriquece cada contact con `tagsLabels` (names joined) + `emailCount`/`wapiCount` via `groupBy` (una query por aggregate, sin N+1).
- [x] **Export CSV/XLSX**: helper `serialize()` factoriza ambos formatos. CSV con `csv-stringify/sync` + `quoted_string: true`. XLSX con ExcelJS, freeze pane row 1, header bold, anchos configurables. Headers HTTP `Content-Disposition: attachment; filename="{kind}-{slug}.{format}"`.
- [x] **Audit**: cada generador llama `AuditLogService.log({ action: 'contacts.report.generated', resourceType: 'Contact', metadata: { kind, format, rowCount, filterSummary } })`. El activity report incluye `resourceId: contactId`.
- [x] **CASL**: los 3 endpoints chequean `a.can('read', 'Contact')`. Cualquier TeamRole (MEMBER+ADMIN+VIEWER) puede exportar — alineado con el resto del módulo.
- [x] **Frontend**: nueva página `/dashboard/contacts/reports` (`ContactsReportsPage.tsx`) con selector de tipo + forms condicionales + botones CSV/XLSX. Botón "Exportar" en `ContactsListPage` (dropdown CSV/XLSX que pasa los filtros aplicados). Botón download (icono) en el header de Timeline en `ContactDetailPage` (dropdown CSV/XLSX que respeta el channel filter activo). Helper `contactReportsApi.ts` reusa `api.download()` + `triggerBlobDownload()` ya existentes en `apps/frontend/src/api/client.ts`. Sidebar entry "Reportes de contactos" en grupo "Datos".
- [x] **Tests**: `contact-reports.service.spec.ts` con 18 casos (3 reportes × ~6 escenarios c/u incluyendo XLSX parseable, cursor pagination, caps, errores y audit). **728/728 backend tests verde**. Backend + frontend typecheck ✅.
- [x] **Async + S3**: deferido a Fase 8 (scheduler genérico de reportes) — la infra de buffer-in-memory alcanza para los caps actuales.

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
  - Fase 4 expandida con 12 sub-fases (4.A → 4.L) cubriendo envío, KMS, webhook, sync, campañas, inbox full, quick replies, opt-out, welcome msg, dashboard, buttons, dev chat-simulator.
  - Fase 5 nueva: **Contacts unificados con `externalId` + Timeline cross-canal** (reemplaza módulo `Deudores` de AMSA).
  - Fase 7 nueva (ex Fase 6): IA con `LlmProvider` switcheable Gemini/Bedrock por feature flag + env.
  - Fase 8 nueva: **Scheduler genérico de reportes** (cualquier reporte, agendable, llega por mail con CSV/XLSX).
  - Fase 9 nueva: Dev Simulator (panel interno gated por flag).
  - Fases 10/11/12: ex 7/8/9.
  - Sección nueva "Mapa AMSA Sender → Massivo App" feature-por-feature con estado.
  - Excluidos del MVP confirmados: WhatsApp Web.js (legacy), Gmail OAuth read.
- **Próxima revisión:** al cerrar Fase 3.

> Este plan es un punto de partida ejecutable, no un contrato cerrado. Ajustar según aprendizajes de cada fase. Lo importante no se mueve: aislamiento de tenants, observabilidad, billing y compliance son no-negociables.
