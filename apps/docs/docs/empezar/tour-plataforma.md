---
title: Tour de la plataforma
sidebar_position: 2
---

# Tour de la plataforma

Esta es una recorrida rápida de lo que vas a ver al entrar al panel
[panel.massivo.app](https://panel.massivo.app), grupo por grupo. Una vez que
ubiques cada cosa, podés saltar a las secciones específicas para profundizar.

## Login y selección de team

Al ingresar te identificás con tu mail (lo manejamos vía Clerk, podés usar
Google también). Después de loguearte:

- Si pertenecés a **una sola organización** y **un solo team**, entrás directo
  al dashboard.
- Si pertenecés a **varios teams**, vas a ver un **selector arriba a la
  izquierda** para cambiar entre ellos. Cada team es un espacio aislado —
  todos los datos que veas y todo lo que crees pertenecen al team activo.

## Topbar

Arriba del todo tenés:

- **Logo Massivo** (vuelve al inicio)
- **Selector de team** (si tenés varios)
- **Avatar** con tu nombre — click para gestionar tu perfil, cerrar sesión
  o cambiar de organización

## Sidebar (menú lateral)

Está organizado en **5 grupos**. Podés colapsar el sidebar con la flecha del
borde — útil cuando trabajás en pantallas más chicas.

### General

- **Inicio**: tu dashboard principal. Muestra el consumo del mes (emails,
  WhatsApp, dominios) en cards visuales con barras de progreso, y tus
  últimas campañas de email y WhatsApp para retomar trabajo rápido.

### Email

| Item | Para qué |
|---|---|
| **Campañas** | Crear, enviar y monitorear envíos masivos por email |
| **Templates** | Plantillas HTML con editor drag&drop y variables Handlebars |
| **Dominios** | Verificar tus dominios en SES con DKIM/SPF/DMARC visual |
| **Cuentas SMTP** | Configurar la cuenta desde la que envías (SMTP propio o SES con dominio verificado) |
| **Desuscriptos** | Lista de contactos que opt-out — los excluimos automáticamente de tus campañas |
| **Métricas** | Dashboard con tasas de apertura, click, bounce, complaint |

### WhatsApp

| Item | Para qué |
|---|---|
| **Dashboard live** | Vista en tiempo real de las conversaciones activas y a quién están asignadas |
| **Inbox** | Bandeja unificada donde gestionás todas las conversaciones |
| **Campañas** | Envíos masivos por WhatsApp usando templates aprobados por Meta |
| **Templates** | Plantillas que Meta debe aprobar antes de poder usarlas en envíos masivos |
| **Respuestas rápidas** | Snippets pre-armados que los agentes pueden insertar con un click |
| **Bot guiado** | Editor visual de flujos automatizados para tus conversaciones |
| **Números** | Configuración de tu cuenta de WhatsApp Business (Meta) — phone number ID, access token, etc. |

### Datos

| Item | Para qué |
|---|---|
| **Contactos** | Lista unificada de contactos (email + teléfono + identificadores) con búsqueda y filtros |
| **Reportes de contactos** | Análisis agregado: cuántos por tag, lista, segmento, etc. |

### Cuenta

| Item | Para qué |
|---|---|
| **Audit log** | Historial de todas las acciones importantes (quién creó/borró/envió qué) |
| **Documentación** | Acceso directo a esta documentación |
| **Configuración** | (próximamente) ajustes generales de la organización |

## Cómo está organizada esta documentación

Cada sección del panel tiene su contraparte en esta docs, dividida en
**4 tipos de páginas** (framework Diátaxis):

| Tipo | Para qué | Cuándo usar |
|---|---|---|
| **Conceptos** | Entender el *mental model* | "Qué es DKIM y por qué lo necesito" |
| **How-to** | Resolver una tarea concreta | "Cómo verificar un dominio paso a paso" |
| **Tutoriales** | Aprender haciendo end-to-end | "Tu primera campaña de email en 10 min" |
| **Referencia** | Lookup rápido | "Todos los campos de la pantalla de campaña" |

## Próximos pasos

Ahora que sabés dónde está todo, mandá tu primer email para entender el flow
completo end-to-end:

➡️ [Tu primera campaña en 10 minutos](./primera-campana)
