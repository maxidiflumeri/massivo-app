---
title: Cómo configurar tu número de WhatsApp
sidebar_position: 6
---

# Cómo configurar tu número de WhatsApp en Massivo

Paso a paso completo desde cero, desde Meta hasta Massivo conectado y
funcionando.

## Pre-requisitos

Antes de empezar, tené listo:

- ✅ Meta Business Account creada (ver
  [Phone Number ID y Access Token](./conceptos/phone-number-id-access-token)
  paso 1)
- ✅ App de Meta tipo Business con WhatsApp activado
- ✅ Tu número registrado en Meta como WhatsApp Business
- ✅ **Phone Number ID** copiado
- ✅ **Access Token permanente** (System User) copiado
- ✅ **WABA ID** (opcional pero recomendado) copiado

Si no tenés todo eso aún, hacelo primero siguiendo la guía linkeada arriba.

## Paso 1 — Crear la config en Massivo

1. En el panel, andá a **WhatsApp → Números**
2. Click **"Nuevo número"** arriba a la derecha
3. Llenás:

| Campo | Qué pegar |
|---|---|
| **Nombre** | Identificador para vos, ej. "Soporte ARG" |
| **Phone Number ID** | El ID de Meta que copiaste |
| **Access Token** | El token permanente del System User |
| **WABA ID** (opcional) | Para que Massivo pueda sincronizar templates |
| **Test mode** | Dejar **off** en producción. Si está en on, los envíos no llegan realmente — solo se loggean. |

4. Click **"Guardar"**

Massivo intenta una **validación inmediata**: llama a Meta con tu
access token y phone number ID. Si todo OK, queda **Activa**. Si algo
falla, te aparece el error (token inválido, sin permisos, phone number
no registrado, etc.).

## Paso 2 — Configurar el webhook en Meta

En el detalle del número recién creado, copias la **URL del webhook** y
el **Verify token**.

### En Meta

1. Andá a [developers.facebook.com](https://developers.facebook.com) →
   tu app → **WhatsApp → Configuration**
2. Sección **Webhook** → **Edit**
3. **Callback URL**: pegás la URL de Massivo, ej.:
   ```
   https://api.massivo.app/api/webhooks/wapi/wbh_aBcDeFgHiJkLmN012345
   ```
4. **Verify Token**: pegás el verify token de Massivo
5. Click **"Verify and Save"**

Meta hace el handshake con Massivo. Si OK, te aparece "Verified" ✅.
Si falla:

- Reconfirmá que la URL no tenga espacios al final
- Reconfirmá que el verify token sea **exactamente** el que ves en
  Massivo (sin extra spaces / line breaks)

### Suscribirse a los webhook fields

Después del handshake, te pide elegir a qué eventos suscribirte.
**Marcá al menos**:

- ✅ **messages** (mensajes inbound)
- ✅ **message_template_status_update** (aprobación / rechazo de
  templates)

Opcional pero recomendado:

- ✅ **phone_number_quality_update**
- ✅ **account_alerts**

## Paso 3 — Test del webhook

Volvé a Massivo, al detalle del número.

Click **"Test webhook"**. Massivo le pide a Meta que envíe un evento de
prueba.

Resultados posibles:

| Status | Significa |
|---|---|
| ✅ **OK** | Meta llamó a Massivo, validamos firma, procesamos. Todo bien. |
| ❌ **Firma inválida** | El verify token no coincide. Revisá que sea el mismo en ambos lados. |
| ❌ **Timeout** | Meta no pudo llegar a la URL. Confirmá que está bien pegada. |
| ❌ **Webhook no suscrito** | Marcá los fields en Meta (paso 2) |

## Paso 4 — Mandar un mensaje de prueba a tu número

Mandate vos mismo un WhatsApp desde tu celular personal **al número
que registraste en Meta**:

1. Mandás "Hola test" desde tu celu
2. En el panel, andá a **WhatsApp → Inbox**
3. Debería aparecer una conversación nueva con tu mensaje

Si aparece, **todo el flujo está funcionando**. Si no:

- Confirmá que el webhook esté suscrito a `messages` en Meta
- Revisá los logs en Meta → tu app → **Webhooks → Recent Deliveries**
  para ver si Meta intentó llamarte

## Paso 5 — Mandar un mensaje saliente de prueba

Desde el inbox, respondé al mensaje que te mandaste. Si el mensaje
**llega a tu celular**, el outbound está funcionando ✅.

(Estás dentro del 24h window porque vos mismo te escribiste hace
segundos — podés mandar texto libre.)

## Paso 6 — Sincronizar templates

Si ya tenías templates en Meta antes de configurar Massivo:

1. **WhatsApp → Templates**
2. Click **"Sincronizar desde Meta"** arriba a la derecha
3. Massivo trae todos tus templates con sus estados actuales

A partir de ahora, los **cambios de estado** (approval, rejection) te
llegan automáticamente vía webhook — no necesitás re-sincronizar a mano.

## Configuración avanzada

### Rate limit personalizado

Por defecto Massivo respeta el rate limit de Meta (varía por número y
calidad). Si querés ser más conservador (ej. para evitar quality drops),
podés setear:

- **Daily limit**: máx mensajes outbound por día (default: el de Meta)
- **Delay entre mensajes**: cuántos ms esperar entre envíos
  consecutivos. Útil para campañas masivas — algunos espacios entre
  mensajes simulan envío "humano".

Estos se setean en el detalle de la config.

### Test mode

Si activás **Test mode** en una config:

- Los envíos **no llegan a Meta de verdad**
- Se loggean como si hubieran salido (status FAKE_SENT)
- Útil para testing de bots / templates sin gastar mensajes reales

**No lo dejes activo en producción** — los clientes reales no van a
recibir nada.

### Asignar config a varios teams

Por defecto un número está vinculado a **un team específico** (el que lo
creó). Si querés que **otros teams usen el mismo número**:

1. **WhatsApp → Números** → editar la config
2. Sección **Teams compartidos** → agregar teams

⚠️ Cuidado: si compartís, **todos los teams ven todos los mensajes
inbound** que llegan a ese número. Útil para soporte centralizado,
pero rompe el aislamiento típico de teams.

## Errores comunes en el setup

| Error | Causa | Solución |
|---|---|---|
| "Access token inválido" | Token expirado o mal copiado | Generá uno nuevo en Meta System Users, pegalo de vuelta |
| "Phone number not found" | El phone number ID no corresponde a tu WABA | Confirmá que copiaste el ID del número correcto en Meta |
| Webhook handshake "Cannot verify" | Verify token no coincide o URL mal pegada | Re-confirmá ambos campos |
| Webhook OK pero los mensajes no llegan al inbox | No te suscribiste al field `messages` | En Meta Console → suscribite |
| Mando un template y "fails immediately" | Tu número está en quality LOW y Meta no deja outbound masivo | Mejorá quality enviando solo a contactos que opt-in, esperá unos días |
| "Rate limit exceeded" | Pasaste el límite por segundo de Meta | Aumentá delay entre envíos en la config |

## ¿Cuántos números puedo configurar?

Sin límite hardcodeado en planes pagos. Casos típicos:

- **1 número**: lo más común para empresas chicas
- **2-3 números**: por país (ARG, MX, ES) o por área (Ventas vs Soporte)
- **5+ números**: agencias multi-cliente con un número por cliente

Cada número es una **WapiConfig** distinta en Massivo y consume
recursos (webhooks, polling, etc.). Si tenés muchos números pero
poco volumen, considerá consolidar.

## Próximos pasos

- 📝 [Crear un template](./crear-template) para mandar a tus contactos
- 📨 [Crear una campaña de WhatsApp](./crear-campana)
- 💬 [Inbox de WhatsApp](./inbox) para gestionar conversaciones entrantes
- 🤖 [Crear tu primer bot](../bots/crear-primer-bot)
