---
title: Phone Number ID y Access Token
sidebar_position: 2
---

# Cómo obtener Phone Number ID, WABA ID y Access Token

Las **3 credenciales** que Meta te da para que Massivo (o cualquier
plataforma) pueda mandar mensajes desde tu número de WhatsApp Business.

Esta página es **muy práctica** — hace falta hacer todo en
[business.facebook.com](https://business.facebook.com) y
[developers.facebook.com](https://developers.facebook.com).

## Pre-requisitos antes de empezar

- Una **cuenta personal de Facebook** (Meta no permite empresas sin que
  haya una persona detrás)
- Un **número de teléfono** que **no** esté en uso en WhatsApp normal ni
  WhatsApp Business app. Tiene que ser "limpio".
- Tu empresa (al menos un **CUIT** o equivalente, un dominio, un nombre
  comercial). No hace falta estar 100% formal — Meta acepta unipersonales.

## Paso 1 — Meta Business Account (si no la tenés)

Si nunca usaste Meta Business, andá a:

👉 [business.facebook.com](https://business.facebook.com)

1. **Crear cuenta** con tu Facebook personal
2. Llenás los datos de tu empresa:
   - Nombre legal
   - Email business
   - Dominio (si tenés)
   - País / región
3. **Verificá tu identidad** si te lo pide (subir documento, esperar
   review). Esto puede tardar **días**. En entornos chicos podés saltearlo
   inicialmente pero te lo pide en algún momento.

## Paso 2 — Crear una App en Meta for Developers

Andá a:

👉 [developers.facebook.com](https://developers.facebook.com) → **Apps
→ Crear App**

1. **Tipo**: elegir **"Negocio"** (Business)
2. **Casos de uso**: WhatsApp / Otro
3. **Nombre**: ej "Massivo Producción ACME"
4. **Email de contacto**: el de la empresa
5. **Cuenta de Meta Business**: enlazás la del paso 1
6. **Crear app**

## Paso 3 — Agregar el producto "WhatsApp" a tu App

En la app recién creada, sidebar izquierdo:

1. **Add product** → buscar **WhatsApp** → **Set up**
2. Te pide elegir un **WhatsApp Business Account** existente o crear uno
   nuevo. Crealo si no tenés.
3. Se crea automáticamente un **número de prueba** y un **token
   temporal de 24h**. Sirve para probar pero **no para producción**.

Pantalla "API Setup" aparece. Vas a ver:

- Test phone number (de Meta, +1...)
- Phone Number ID (largo numérico) — este es para el número de prueba
- WhatsApp Business Account ID
- Temporary access token (válido 24h)

## Paso 4 — Registrar tu número real

El número de prueba sirve para playground, pero para producción
**registrás el tuyo**.

1. En la pantalla WhatsApp → **Phone Numbers** → **Add phone number**
2. Pegás tu número con código de país (`+54 9 11 1234-5678`)
3. **Elegí método de verificación**: SMS o llamada
4. Meta te manda un código → lo pegás → confirmás
5. Te aparece tu número como **registered**

:::caution Cuidado con el número
- El número que registres **NO debe estar en WhatsApp normal ni en
  WhatsApp Business app**. Si lo estaba, Meta te pide que primero lo
  des de baja desde la app.
- Una vez registrado en la API, **ya no podés usarlo en la app de
  WhatsApp Business**. Es uno u otro.
:::

## Paso 5 — Obtener el Phone Number ID

Después de registrar el número:

1. **WhatsApp → API Setup**
2. En el dropdown **From** elegí tu número real (no el de prueba)
3. Te aparece su **Phone Number ID** debajo (numérico largo)
4. **Copialo** — es el primer dato que vas a pegar en Massivo

## Paso 6 — Obtener un Access Token permanente (System User)

El token temporal de 24h sirve para probar. Para producción necesitás
uno permanente. Para eso usás un **System User**.

### Crear System User

1. Andá a [business.facebook.com](https://business.facebook.com) →
   **Settings → Users → System Users**
2. **Add → Crear nuevo system user**
3. **Nombre**: ej "Massivo Integration"
4. **Rol**: Admin
5. **Crear**

### Asignar el WhatsApp Business Account al System User

1. En la pantalla del System User → **Add Assets → WhatsApp Accounts**
2. Elegís tu WhatsApp Business Account
3. **Full control** (necesario para enviar)
4. Guardar

### Generar el token

1. En la pantalla del System User → **Generate New Token**
2. **App**: elegís tu app de WhatsApp
3. **Token expiration**: **Never** (si está disponible) o **60 días**
   (Meta a veces no deja Never; en ese caso programá renovaciones)
4. **Permissions**: marcá
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. **Generate**
6. **¡Copiá el token ahora!** Meta no te lo vuelve a mostrar. Si lo
   perdés, generás uno nuevo desde acá.

## Paso 7 — Obtener el WABA ID (recomendado)

1. **WhatsApp → API Setup**
2. Arriba dice **WhatsApp Business Account ID** — copialo

Massivo lo usa para sync de templates y para subscribirse a webhooks
correctamente.

## Resumen de las 3 cosas que necesitás

| Pieza | De dónde | Cómo guardarla |
|---|---|---|
| **Phone Number ID** | WhatsApp → API Setup | Lo copiás textual |
| **Access Token** | Business Settings → System Users → Generate Token | Lo copiás **una sola vez** al generar |
| **WABA ID** (opcional) | WhatsApp → API Setup, arriba de la pantalla | Lo copiás textual |

## Paso 8 — Pegarlo en Massivo

Ahora pasás a **panel.massivo.app → WhatsApp → Números → Nuevo
número** y pegás esos 3 datos. Ver el how-to en
[Configurar tu número](../configurar-numero).

## Renovación del token

Si tu token es temporal (60 días o menos), tenés que renovarlo
periódicamente:

1. **Business Settings → System Users → tu usuario** → **Generate New Token**
2. Pegás el nuevo en Massivo (Editar el número)

Te recomendamos:

- Programar un recordatorio 1 semana antes del vencimiento
- Configurar el monitoreo de errores en Massivo para detectar errores
  de auth (te avisamos por mail)

## Errores comunes en el setup

| Error | Causa | Solución |
|---|---|---|
| "Phone number ya está en uso" | El número está activo en WhatsApp normal o Business app | Baja primero la cuenta en el celular, esperá unos minutos, retry |
| "Business not verified" | Tu Meta Business Account no completó verificación | Subí docs y esperá review (puede tardar días) |
| Token funciona en pruebas pero falla post-deploy | Generaste un token user-scoped en vez de system user | Volvé a generarlo desde System Users |
| "Permissions insufficient" | El token no tiene `whatsapp_business_messaging` | Al generar marcá todos los permisos relacionados |
| Recibís el código pero te dice "código inválido" | El SMS llega lento, ya expiró | Esperá 5 min y reintentá |

## Próximos pasos

- 📝 [Templates aprobados](./templates-aprobados)
- ⏰ [El 24h window](./24h-window)
- 🛠 [Configurar tu número en Massivo](../configurar-numero)
