# Plan de Implementación — Massivo.app (POC productiva en AWS)

> Documento para pasar a Claude Code. Massivo.app es un SaaS multi-tenant de
> automatización de WhatsApp Business + Email, evolución de AMSA Sender.
> **Sin `whatsapp-web.js`**: solo Meta WhatsApp Business API oficial, inbox,
> bots de atención y email vía AWS SES.

---

## 0. Objetivo

Dejar una POC productiva corriendo en AWS, en **cuenta personal nueva**, con el
dominio `massivo.app` (ya comprado), lista para validar el producto con los
primeros tenants. Bajo costo aprovechando los créditos de cuenta nueva.

---

## 1. Stack final decidido

| Capa            | Servicio / Tecnología                                  | Notas |
|-----------------|--------------------------------------------------------|-------|
| Cuenta AWS      | Nueva personal, **Paid Plan** + budget alert           | NO Free Plan (se autocierra a los 6 meses) |
| DNS             | Route 53 (delegado desde el registrador)               | ~USD 0.50/mes |
| Frontend        | React + Vite → S3 + CloudFront + ACM                   | Cert ACM gratis (solo sirve con CloudFront/ALB) |
| Backend         | NestJS en EC2 `t4g.small` + Docker Compose             | Proceso persistente (webhooks, workers, Socket.io) |
| Reverse proxy   | Nginx + Let's Encrypt (certbot) en la EC2              | HTTPS de la API; gratis |
| Base de datos   | RDS Postgres `db.t4g.micro`                            | Datos reales de tenants → managed backups |
| Cache / Colas   | Redis en container Docker sobre la EC2 (con AOF)       | Efímero; ElastiCache recién cuando escale |
| Email           | AWS SES                                                | 3.000 msgs/mes gratis 12 meses, luego $0.10/1k |
| WhatsApp        | Meta WhatsApp Business API (Graph API + webhooks)      | Cada tenant conecta su propia WABA |
| Logging         | **Winston** (regla de producción, sin `console.log`)   | — |

**Costo estimado runway:** instancia + RDS + SES + S3/CF entra holgado dentro de
los ~USD 33/mes que dan los créditos ($200 / 6 meses). Costo recurrente real tras
créditos ≈ EC2 `t4g.small` + RDS `t4g.micro` (~USD 30-40/mes).

---

## 2. Pre-requisitos manuales (hace Maxi en consola, NO Claude Code)

1. Crear cuenta AWS nueva → en el signup elegir **Paid Plan** (igual recibís los
   hasta USD 200 en créditos, pero la cuenta no se autocierra).
2. Crear un **AWS Budget** con alerta a USD 5 y otra a USD 20.
3. Crear un usuario IAM con permisos (o usar IAM Identity Center) y generar
   **Access Key / Secret** para que Claude Code use el AWS CLI.
4. Tener a mano: credenciales de Meta (App ID, WABA ID por tenant, phone number
   ID, token de sistema, verify token del webhook).

---

## 3. Fases de implementación (para Claude Code)

### Fase 1 — Infra base (AWS CLI / opcional Terraform)
- [ ] Usar la **VPC default** (evita NAT Gateway = ~USD 33/mes que no necesitamos).
- [ ] Lanzar EC2 `t4g.small` (Ubuntu 24, ARM) en subnet **pública**.
- [ ] Asignar una **Elastic IP** y adjuntarla (¡no dejarla sin adjuntar = cobra!).
- [ ] Security Group: abrir 22 (SSH, idealmente restringido a mi IP), 80, 443.
      El puerto de la app (3000) NO se expone; queda detrás de Nginx.
- [ ] RDS Postgres `db.t4g.micro`, 20GB gp3, en la misma VPC, Security Group que
      solo permita acceso desde el SG de la EC2 (no público).
- [ ] Bucket S3 para el frontend + distribución CloudFront.

### Fase 2 — Provisionar la instancia
- [ ] Instalar Docker + Docker Compose plugin.
- [ ] Instalar Nginx + certbot (o correr Nginx en container, a elección).
- [ ] Crear estructura de proyecto y `docker-compose.yml`:

```yaml
services:
  api:
    build: ./backend
    env_file: .env
    depends_on: [redis]
    restart: unless-stopped
    # NO publicar puerto al host directo; Nginx hace proxy
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data        # persistencia AOF → sobreviven jobs BullMQ a reboot
    restart: unless-stopped
volumes:
  redis-data:
```

- [ ] Config Nginx: reverse proxy `api.massivo.app` → `127.0.0.1:3000`, con
      WebSocket upgrade headers para Socket.io.
- [ ] `certbot --nginx -d api.massivo.app` → SSL gratis con renovación automática.

### Fase 3 — Backend NestJS multi-tenant
- [ ] Scaffolding NestJS + Prisma + Postgres.
- [ ] **Multi-tenancy**: campo `tenantId` en todas las tablas + entidad `Tenant`
      (`id`, `slug`, `plan`, `activo`). `TenantGuard` global que inyecta el tenant
      desde el JWT en cada request. Roles por tenant: OWNER / ADMIN / OPERADOR / VIEWER.
- [ ] **Logging con Winston** estructurado en toda la app. **Cero `console.log`.**
- [ ] Módulos:
  - `AuthModule` (JWT con `tenantId` + `role` en el payload).
  - `EmailModule` → AWS SES (SDK v3). Gestión de identidades por tenant.
  - `WhatsappModule` → cliente Graph API (envío de templates, mensajes).
  - `WebhookModule` → endpoint público que recibe webhooks de Meta (verify token
    + procesamiento de mensajes entrantes). Encola en BullMQ.
  - `InboxModule` → Socket.io para conversaciones en tiempo real.
  - `BotModule` → motor de bots de atención (respuestas automáticas a entrantes).
  - `QueueModule` → BullMQ workers (envío de campañas email + WhatsApp), con Redis.
- [ ] **Aislamiento de datos**: middleware/extension de Prisma que fuerce el filtro
      `tenantId` en queries — un query sin filtro = data leak entre clientes.

### Fase 4 — Frontend
- [ ] React + Vite + MUI, con **soporte completo modo claro/oscuro** y diseño moderno.
- [ ] Build → subir a S3 → invalidar CloudFront en cada deploy.
- [ ] Variable de entorno apuntando a `https://api.massivo.app`.

### Fase 5 — Dominio + certificados
- [ ] Delegar `massivo.app` a Route 53 (cambiar nameservers en el registrador).
- [ ] ACM: emitir cert para `massivo.app` y `*.massivo.app` (subdominios por tenant)
      → usarlo **en CloudFront** (frontend). Recordatorio: ACM NO se instala en EC2.
- [ ] Registros Route 53:
  - `massivo.app` / `www` → ALIAS a CloudFront.
  - `api.massivo.app` → A a la Elastic IP de la EC2.
  - (Futuro) `*.massivo.app` → subdominio por tenant.

### Fase 6 — AWS SES
- [ ] Verificar dominio `massivo.app` en SES + configurar **SPF / DKIM / DMARC**
      (ya conocido de AMSA Sender).
- [ ] Solicitar **acceso a producción** (salir del sandbox) vía Service Quotas.
      Tarda 1-3 días → **hacerlo HOY** para que esté listo.
- [ ] Configurar bounce/complaint handling (SNS topic) desde el día uno.

### Fase 7 — WhatsApp Meta
- [ ] Configurar el endpoint de webhook (`/webhook/whatsapp`) con verify token.
- [ ] Por tenant: guardar WABA ID + phone number ID + token. Massivo se aísla:
      cada cliente conecta su propia cuenta Business (vía Embedded Signup más adelante).
- [ ] Probar recepción de un mensaje entrante → encolado → respuesta del bot.

---

## 4. Gotchas / cuidados (no subestimar)

- **NAT Gateway**: ~USD 33/mes solo por existir. No lo creamos; instancia en subnet pública.
- **Elastic IP sin adjuntar**: cobra. Mantenerla siempre adjunta o liberarla.
- **EBS huérfanos / snapshots**: siguen facturando tras borrar la instancia.
- **SES arranca en sandbox**: solo manda a direcciones verificadas hasta pedir producción.
- **Cert ACM ≠ EC2**: solo CloudFront/ALB. La API usa Let's Encrypt.
- **Redis efímero**: con AOF + volumen sobrevive reboots, pero no es backup. OK para POC.
- **RDS no tiene free tier de 12 meses** en cuentas nuevas: lo cubren los créditos.

---

## 5. Checklist de "deploy de mañana"

```
[ ] Cuenta AWS nueva + Paid Plan + budget alert
[ ] Solicitud de producción SES enviada (tarda 1-3 días → primero de todo)
[ ] massivo.app delegado a Route 53
[ ] EC2 t4g.small + Elastic IP + Security Groups
[ ] RDS Postgres t4g.micro (SG privado, solo desde EC2)
[ ] Docker + docker-compose (api + redis con AOF)
[ ] Nginx + Let's Encrypt para api.massivo.app
[ ] Backend NestJS multi-tenant desplegado (Winston, TenantGuard)
[ ] Frontend en S3 + CloudFront + ACM
[ ] Webhook de Meta verificado y recibiendo mensajes
[ ] Prueba end-to-end: enviar email (SES) + enviar/recibir WhatsApp + bot responde
```

---

## 6. Orden sugerido para mañana

1. Cuenta AWS + budget + **solicitud SES producción** (porque tarda).
2. Delegar dominio a Route 53.
3. Infra: EC2 + RDS + S3/CloudFront.
4. Provisionar instancia (Docker, Nginx, certbot).
5. Desplegar backend (skeleton multi-tenant) + conectar RDS y Redis.
6. Desplegar frontend.
7. Configurar webhook Meta + probar flujo completo.