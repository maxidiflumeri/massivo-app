---
title: Cómo agregar un dominio
sidebar_position: 7
---

# Cómo agregar y verificar un dominio

Paso a paso para registrar tu dominio en AWS SES desde Massivo, agregar
los registros DNS correspondientes, y dejarlo verificado y listo para
enviar.

:::info Pre-requisitos
- Acceso al panel con un usuario que tenga rol **ADMIN** o **OWNER** en
  la organización
- Acceso al **panel de DNS** de tu dominio (Netlify, Cloudflare,
  Route 53, NS1, GoDaddy, Namecheap, etc.)
- Tu plan tiene **dominios disponibles** (ver tu cuota actual en la home
  del panel)
:::

## Paso 1 — Crear el dominio en el panel

1. Andá a **Email → Dominios** en el sidebar
2. Click **"Agregar dominio"** (arriba a la derecha)
3. Escribí el dominio que querés verificar:
   - Apex: `empresa.com`
   - Subdominio: `mail.empresa.com`, `notificaciones.empresa.com`
4. Click **"Registrar en SES"**

El panel le pide a AWS SES que cree una **identity** para tu dominio. La
respuesta de SES incluye **3 tokens DKIM** que se transforman en 3 CNAMEs
que tu DNS tiene que servir.

## Paso 2 — Copiar los 3 registros CNAME

Te redirige al detalle del dominio. Vas a ver:

- **Estado: PENDING** (todavía sin verificar)
- **3 cards de verificación** (DKIM, SPF, DMARC) — todos en estado
  inicial
- Una **tabla con 3 registros CNAME** abajo

Cada record tiene:

- **Nombre** (FQDN absoluto, ej. `abc123._domainkey.empresa.com`)
- **Tipo**: CNAME
- **Valor** (ej. `abc123.dkim.amazonses.com`)

:::warning Atención al copy-paste
Los nombres se muestran como **FQDN absoluto** (terminan en tu dominio).
Algunos DNS providers (Netlify, GoDaddy, NS1) **auto-completan tu zone al
final**. En ese caso, pegá solo la parte **antes** de tu zone.

Ejemplo: si tu zone es `empresa.com` y el FQDN es
`abc123._domainkey.empresa.com`, pegá solo **`abc123._domainkey`** en el
campo "Name" del DNS.

Otros providers (Route 53, Cloudflare) aceptan el FQDN completo. Si
dudás, probá con el FQDN entero — si el sistema te lo rechaza o lo deja
duplicado, sacale el sufijo.
:::

## Paso 3 — Agregar los CNAMEs en tu DNS

Andá al panel de tu proveedor de DNS. Para cada uno de los 3 records:

1. Crear un nuevo record CNAME
2. Pegar el **Name** (con la consideración de arriba sobre el sufijo)
3. Pegar el **Value** (siempre completo, terminando o no con punto según
   lo que acepte tu provider)
4. **TTL: 300** (5 min, el mínimo razonable)
5. Guardar

Repetí para los 3. **Los 3 son obligatorios** — si te falta uno, SES no
verifica.

### Ejemplos por proveedor

**Netlify / NS1 / GoDaddy** (auto-completa zone):

| Type | Name | Value |
|---|---|---|
| CNAME | `abc123._domainkey` | `abc123.dkim.amazonses.com` |

**Route 53 / Cloudflare** (acepta FQDN):

| Type | Name | Value |
|---|---|---|
| CNAME | `abc123._domainkey.empresa.com` | `abc123.dkim.amazonses.com` |

## Paso 4 — Esperar la propagación + verificación SES

Pasan 2 cosas en paralelo:

1. **DNS propaga**: tus CNAMEs se distribuyen a los DNS resolvers
   globales. Tiempo típico: 5-15 min (depende del TTL y del provider).
2. **SES verifica**: AWS chequea periódicamente. La primera vez puede
   tardar más (ver gotcha del cache).

### Verificar manualmente desde el panel

En el detalle del dominio, click **"Verificar ahora"**. Llamamos a SES en
ese momento y refrescamos el estado.

### Verificar desde tu terminal

Si tenés acceso a una terminal con `dig`:

```bash
dig CNAME abc123._domainkey.empresa.com +short
```

Si te devuelve `abc123.dkim.amazonses.com`, **el DNS está OK**. Si la
verificación en el panel sigue PENDING, es porque AWS todavía no lo
detectó (típicamente cache de NXDOMAIN — ver más abajo).

## Paso 5 — DKIM verifica → estado VERIFIED ✅

Cuando los 3 CNAMEs propagan **y** AWS los detecta:

- El estado del dominio pasa a **VERIFIED**
- El card **DKIM** se pone verde

Ya podés crear cuentas SMTP linkeadas a este dominio.

## Paso 6 (Recomendado) — Agregar SPF y DMARC

En el mismo detalle del dominio vas a ver 2 cards más: **SPF** y **DMARC**.
Por defecto están en estado MISSING. Vamos a verificarlos también.

### SPF

1. Click **"Ver record recomendado"** en el card SPF
2. Copiar:
   - **Name**: tu dominio (o el prefijo si tu zone auto-completa)
   - **Type**: TXT
   - **Value**: `v=spf1 include:amazonses.com ~all`
3. En tu DNS, crear un record TXT con esos valores
4. Esperar 5-15 min
5. Click **"Verificar ahora"** en el panel

:::caution Si ya tenés un SPF
Tu dominio puede tener un **solo** SPF. Si ya tenés uno por usar Google
Workspace, ImprovMX, etc., **NO agregues otro**. En su lugar, combinalos:

```
v=spf1 include:_spf.google.com include:amazonses.com ~all
```
:::

### DMARC

1. Click **"Ver record recomendado"** en el card DMARC
2. Copiar:
   - **Name**: `_dmarc` (o `_dmarc.tu-dominio` según tu provider)
   - **Type**: TXT
   - **Value**: `v=DMARC1; p=none; rua=mailto:postmaster@tu-dominio.com`
3. Crear el record TXT
4. Esperar y verificar

## El gotcha del cache NXDOMAIN — qué hacer si pasaste horas en PENDING

Si llevás **más de 1 hora** con el dominio en PENDING **y** confirmaste
con `dig` que los CNAMEs están bien en el DNS, es muy probable que AWS
SES esté cacheando NXDOMAIN del primer lookup (cuando todavía no habías
agregado los records).

**Solución rápida**:

1. **Borrá el dominio** desde el panel (botón "Borrar" en el detalle)
2. Esto elimina la identity en SES, invalidando su cache
3. Volvé a **agregar el dominio** con el mismo nombre
4. SES genera **3 nuevos CNAMEs** (tokens distintos a los anteriores)
5. **Actualizá los 3 CNAMEs en tu DNS** con los nuevos valores
6. Esperá unos minutos — SES verifica casi inmediatamente porque no
   tiene cache para los nuevos

Esto funciona porque cada identity nueva = nuevos tokens = lookup nuevo
desde cero, sin pasar por el cache.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "El plan no permite más dominios" | Llegaste al límite del plan | Borrá dominios viejos o subí de plan |
| "El dominio ya está registrado en tu organización" | Ya lo agregaste antes | Lo encontrás en el listado, no necesitás crearlo de nuevo |
| Estado nunca pasa a VERIFIED | Cache NXDOMAIN | Borrá y re-creá el dominio (ver arriba) |
| "Verificación fallida" después de varias horas | CNAMEs mal pegados | Confirmá con `dig` cada uno; si están mal, corregilos en tu DNS y re-verificá |

## Próximos pasos

- 📨 [Conectar una cuenta SMTP linkeada a este dominio](./conectar-cuenta-smtp)
- 📝 [Crear tu primer template](./crear-template)
