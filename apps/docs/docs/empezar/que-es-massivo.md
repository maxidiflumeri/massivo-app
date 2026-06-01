---
title: ¿Qué es Massivo?
sidebar_position: 1
---

# ¿Qué es Massivo?

Massivo es una plataforma para **enviar campañas masivas** y **gestionar
conversaciones** combinando dos canales en un solo lugar:

- **Email marketing** con tus propios dominios verificados
- **WhatsApp Business API** con tu número oficial de Meta

Todo desde un panel único, sin tener que armar la infra ni hacer setup técnico
de cero.

## Para qué te sirve

- **PyMEs**: enviar newsletters por email, hacer remarketing por WhatsApp, dar
  soporte conversacional centralizado.
- **Agencias**: gestionar varias marcas o clientes desde un mismo panel, con
  separación de datos por team.
- **E-commerce**: notificaciones transaccionales, recuperar carritos
  abandonados, atención post-venta.
- **Servicios profesionales**: bots de pre-calificación de leads, recordatorios
  de turnos, FAQ automatizada.

## Qué incluye

### Email

- **Dominios verificados** en AWS SES: agregás tu dominio (ej `empresa.com`),
  agregás 3 registros DNS, y SES lo verifica automáticamente.
- **DKIM, SPF y DMARC** auto-trackeados con badges visuales tipo SendGrid: ves
  el estado de cada uno y te decimos qué falta.
- **Templates** con editor drag & drop y variables Handlebars
  (`{{nombre}}`, `{{empresa}}`, etc.).
- **Campañas** con importación de contactos por CSV, programación, pausa /
  reanudación y reportes en tiempo real.
- **Tracking** de aperturas, clicks y desuscriptos automáticos.
- **Reply-To configurable** por cuenta o por campaña: enviás desde
  `noreply@tuempresa.com` pero las respuestas van a tu casilla real.

### WhatsApp

- **Tu propia cuenta de WhatsApp Business**: usás tu número y pagás los
  mensajes directo a Meta (sin markup de plataforma).
- **Templates aprobados por Meta** con sync automático.
- **Inbox unificado** con asignación a agentes, marcado de resoluciones y
  notas internas.
- **Dashboard en vivo** para ver el estado de las conversaciones del team en
  tiempo real.
- **Opt-out automático** y compliance.

### Bots

- **Editor de flujo visual** para armar conversaciones automatizadas.
- **Nodos pre-armados**: mensajes, preguntas con opciones, condicionales,
  llamadas a API, handoff a humano, etc.
- **Sesiones persistentes** por contacto: el bot recuerda dónde se quedó.
- **Modo guiado o libre** combinados.

### Contactos

- **Modelo unificado** entre email y WhatsApp: un contacto puede tener mail,
  teléfono, DNI, CUIT, etc.
- **Sugerencias de merge** automáticas cuando detectamos duplicados.
- **Importación por CSV** con detección automática de columnas.
- **Tags y listas** para segmentar.

## Lo que NO hace (al menos por ahora)

- **No es un CRM**. No tracking de oportunidades, etapas de venta ni
  pipelines. Si necesitás eso, integrás Massivo con tu CRM.
- **No vende mensajes de WhatsApp**. Vos contratás directo con Meta y nosotros
  somos solo la plataforma. Esto te da control y precios sin markup.
- **No es para envíos transaccionales de alto volumen tipo "millones por día"**.
  Estamos diseñados para PyMEs y agencias con volúmenes razonables.

## Próximos pasos

- 📖 Aprendé el [modelo conceptual](../conceptos/orgs-teams-usuarios) (organizaciones, teams, planes)
- 📊 Entendé tu [plan y consumo](../conceptos/planes-limites-consumo)
- 📧 Cuando estés listo: andá al [panel](https://panel.massivo.app)
