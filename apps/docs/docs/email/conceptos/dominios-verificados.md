---
title: Dominios verificados
sidebar_position: 1
---

# Dominios verificados

Un **dominio verificado** es tu dominio (ej. `empresa.com` o
`mail.empresa.com`) registrado y confirmado en AWS SES — el servicio de
envío de email que usamos por debajo. Verificarlo te permite enviar mails
**desde direcciones de ese dominio** (`info@empresa.com`,
`noreply@empresa.com`, etc.) con **buena reputación** y sin caer en spam.

## ¿Por qué necesito verificar un dominio?

Tres razones que vas a entender muy rápido si alguna vez intentaste mandar
masivamente desde una casilla personal:

1. **Identidad probada**. Los servidores receptores (Gmail, Outlook, etc.)
   chequean si el dominio del remitente realmente autorizó el envío. Sin
   verificación, te marcan como sospechoso.

2. **Reputación dedicada**. Cuando verificás tu dominio, la reputación de
   envío es **tuya**: si vos enviás bien (poca queja, pocos bounces),
   llegás a inbox. Si vos enviás mal, te perjudicás vos solo, no a otros.

3. **Permisos de Gmail/Yahoo 2024**. Desde febrero 2024, Gmail y Yahoo
   **exigen** que los envíos masivos (>5k/día) tengan DKIM + SPF + DMARC
   correctamente configurados. Sin esto, te rechazan o te mandan a spam
   sin chistar.

## ¿Qué tipo de dominio puedo verificar?

- **Apex** (raíz): `empresa.com`
- **Subdominio**: `mail.empresa.com`, `marketing.empresa.com`,
  `notifications.empresa.com`
- **Cualquier nivel**: `noreply.dev.empresa.com.ar`

Lo importante: **vos tenés que poder modificar el DNS** de ese dominio,
porque la verificación requiere agregar 3 registros CNAME.

:::tip ¿Apex o subdominio dedicado?
Recomendamos un **subdominio dedicado a envíos** (ej.
`mail.empresa.com`) en vez del apex, porque:
- Aislás la reputación de tu correo transaccional del corporativo
  (alguien marcando como spam una promo no te afecta el mail interno).
- Es más fácil de monitorear.
- Si en algún momento querés moverte a otro proveedor, no tocás el
  apex.

Para usuarios chicos sin esa complejidad, el apex también funciona.
:::

## ¿Cuántos dominios puedo verificar?

Depende de tu plan:

| Plan | Dominios verificados |
|---|---|
| **Free** | 1 |
| **Starter** | 3 |
| **Business** | 10 |
| **Enterprise** | Ilimitado |

Los dominios **PENDING** y **FAILED** también cuentan contra tu límite —
si no los vas a usar, borralos.

## El flujo de verificación

Cuando agregás un dominio, pasa por estos estados:

```
PENDING ──┬──> VERIFIED ✅ (DKIM confirmado por SES)
          ├──> FAILED ❌ (DNS mal configurado / records borrados)
          └──> TEMPORARY_FAILURE ⏳ (fallo transitorio — retry-able)
```

### `PENDING`

Lo agregaste pero todavía no se verificó. Razones típicas:

- Acabás de crearlo y AWS todavía no chequeó tu DNS
- Agregaste los CNAMEs pero todavía no propagaron globalmente
- **El cache NXDOMAIN de AWS** (ver gotcha más abajo)

Tiempo esperado en este estado: **5-30 min**.

### `VERIFIED` ✅

DKIM confirmado en el DNS. Ya podés:

- Crear cuentas SMTP linkeadas a este dominio
- Enviar emails desde cualquier dirección bajo el dominio

### `FAILED`

Algo salió mal. Razones:

- Los CNAMEs están mal pegados (TTL muy alto, sufijo duplicado, etc.)
- Los records nunca llegaron a propagar
- AWS no pudo leer el DNS del dominio

**Qué hacer**: re-verificá los CNAMEs en tu DNS provider. Cuando estén OK
en herramientas tipo `dig`, click "Verificar ahora" en el detalle del
dominio.

### `TEMPORARY_FAILURE`

AWS no pudo chequear el DNS por un problema transitorio (network blip,
nameserver no respondió, etc.). El poller automático va a reintentar cada
5 min. Sin acción de tu parte.

## El gotcha del cache NXDOMAIN

Cuando creás un dominio en SES, AWS hace un primer lookup DNS. **Si los
CNAMEs todavía no están en tu DNS** (que es el caso normal — los acabás de
ver en el panel), AWS recibe NXDOMAIN y **cachea ese resultado** con el TTL
del nameserver (típicamente 1-4 hs en NS1, GoDaddy, etc.).

Resultado: **incluso después de que agregues los records correctamente** y
te aparezcan en `dig`, **SES sigue diciendo PENDING** hasta que ese cache
expire.

**Workaround inmediato si pasaron más de 1h y no avanza**:

1. Borrá el dominio en el panel (esto borra la identity en SES)
2. Volvé a agregarlo
3. SES genera **3 nuevos CNAMEs** (tokens distintos) y NO tiene cache para
   los nuevos
4. Actualizá los 3 records en tu DNS con los nuevos valores
5. SES verifica en minutos

## Próximos pasos

- 📖 Aprendé sobre [DKIM, SPF y DMARC](./dkim-spf-dmarc) que protegen tu
  deliverability
- 🛠 Andá a [Cómo agregar un dominio](../agregar-dominio) para el paso a
  paso práctico
