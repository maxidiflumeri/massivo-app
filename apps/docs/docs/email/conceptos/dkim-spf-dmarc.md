---
title: DKIM, SPF y DMARC
sidebar_position: 2
---

# DKIM, SPF y DMARC explicados

Son los **3 estándares de autenticación** del correo. Suenan a sopa de
letras pero la idea es simple: cada uno responde a una pregunta distinta
que se hace el servidor que recibe tu mail.

| Estándar | Pregunta que responde |
|---|---|
| **DKIM** | ¿Este mail fue **realmente firmado** por el dominio del remitente? |
| **SPF** | ¿El servidor que mandó el mail está **autorizado** por el dueño del dominio? |
| **DMARC** | Si DKIM o SPF fallan, ¿qué hago con el mail? |

Massivo te muestra los 3 estados en el detalle de cada dominio con badges
visuales tipo SendGrid.

---

## DKIM (DomainKeys Identified Mail)

### Qué hace

DKIM **firma cada email saliente** con una clave criptográfica privada. La
clave pública correspondiente está publicada en tu DNS como 3 CNAMEs
(precisamente los que copiás al verificar tu dominio). El servidor que
recibe el mail:

1. Lee la firma del header del mail
2. Va a tu DNS y busca la clave pública (siguiendo los CNAMEs)
3. Verifica matemáticamente que la firma corresponde a esa clave
4. Si matchea, **probó que el mail vino de tu dominio sin alteraciones**

### Cómo se configura

En Massivo es **automático cuando verificás tu dominio**: al crear el
dominio, te damos 3 CNAMEs DKIM que tenés que pegar en tu DNS. Cuando
propagan, SES los verifica y empieza a firmar todos los mails que mandás
desde ese dominio.

### Estados que ves

- **🟢 VERIFIED**: SES confirmó los 3 CNAMEs. Tus mails se firman.
- **🟡 PENDING**: Esperando propagación DNS o verificación inicial.
- **🔘 MISSING**: No agregaste los CNAMEs (o se borraron).
- **🔴 INVALID/FAILED**: Los CNAMEs están mal pegados.

### Es **obligatorio** para enviar

Sin DKIM verificado no podés enviar desde el dominio. La cuenta SMTP
linkeada a ese dominio queda inactiva.

---

## SPF (Sender Policy Framework)

### Qué hace

SPF es un **registro TXT** en tu dominio que lista qué servidores están
autorizados a mandar mail "en nombre de" ese dominio. El servidor receptor:

1. Mira de qué IP vino el mail
2. Va a tu DNS y lee tu SPF
3. Si la IP del remitente está incluida en SPF, OK. Si no, fail.

### Cómo se configura

Agregás un único registro TXT en tu dominio con este valor:

```
v=spf1 include:amazonses.com ~all
```

- `v=spf1` — marca que es un record SPF versión 1
- `include:amazonses.com` — autoriza a los servidores de AWS SES
- `~all` — soft-fail para cualquier otro origen ("sospechoso pero no
  rechazar")

Si tu dominio **ya tiene un SPF** (por usar Google Workspace, ImprovMX,
etc.), **no lo dupliques** — un dominio solo puede tener UN SPF. Combinalos
así:

```
v=spf1 include:_spf.google.com include:amazonses.com ~all
```

### En Massivo

El panel detecta tu SPF automáticamente y te muestra:

- **🟢 VERIFIED** — el record existe e incluye `amazonses.com`
- **🔘 MISSING** — no hay record SPF en tu dominio
- **🔴 INVALID** — hay SPF pero no incluye `amazonses.com`

### Es **recomendado**

SPF no es estrictamente obligatorio para enviar (DKIM alcanza), pero:

- Te ahorra mucho ruido con Outlook, Yahoo y proveedores corporativos
- Es uno de los 2 mecanismos que DMARC consulta

---

## DMARC (Domain-based Message Authentication, Reporting and Conformance)

### Qué hace

DMARC le dice al servidor receptor **qué hacer cuando un mail falla DKIM
o SPF**. Te da 3 opciones (la "política") en orden de severidad:

| Política | Significa |
|---|---|
| `p=none` | "Si falla, dejá pasar pero avisame por reporte" |
| `p=quarantine` | "Si falla, mandalo a spam" |
| `p=reject` | "Si falla, rechazalo directamente" |

### Cómo se configura

Agregás un registro TXT en el subdominio `_dmarc.tu-dominio`. Ejemplo:

```
v=DMARC1; p=none; rua=mailto:postmaster@tu-dominio.com
```

- `v=DMARC1` — versión 1
- `p=none` — política: solo monitorear, no actuar
- `rua=mailto:...` — dónde te mandan los **reportes agregados** semanales
  (XML con resumen de envíos fallidos y exitosos)

### En Massivo

Lo detectamos automáticamente. Estados:

- **🟢 VERIFIED** — hay un DMARC válido con `p=...`
- **🔘 MISSING** — no hay DMARC
- **🔴 INVALID** — hay TXT pero no es DMARC válido

### Es **muy recomendado**

Desde febrero 2024, **Gmail y Yahoo lo exigen** para envíos masivos
(>5k/día). Sin DMARC tus mails directamente no entran a esos proveedores.

### ¿Qué política poner?

Recomendamos arrancar con `p=none` (monitor mode). Te llegan los reportes,
ves si todo está bien, y después subís a `p=quarantine` o `p=reject`
cuando estés seguro de que no hay falsos positivos.

---

## Cómo se cuenta todo junto

Cuando el servidor receptor (Gmail, etc.) recibe un mail tuyo:

```
Mail llega → Chequea DKIM → Chequea SPF
                              │
                              ▼
                       ¿Algún check OK?
                          │
              ┌───── SÍ ──┴── NO ─────┐
              ▼                       ▼
        Entra a inbox          Lee DMARC → aplica política (none/quarantine/reject)
```

**El mínimo viable** para deliverability decente: **DKIM ✅ + SPF ✅ +
DMARC (`p=none`) ✅**.

## Próximos pasos

- 🛠 Andá a [agregar un dominio](../agregar-dominio) para el paso a paso
- 📊 Cuando todo esté verificado, aprendé sobre [tracking](./tracking-opens-clicks)
