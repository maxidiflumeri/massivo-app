---
title: Límites del plan
sidebar_position: 3
---

# Límites del plan — referencia

Tabla compacta de **todos los límites** por plan, para que tengas
visibilidad rápida sin tener que navegar por varias páginas.

Ver explicación detallada en
[Planes, límites y consumo](../conceptos/planes-limites-consumo).

## Tabla maestra

| Límite | Free | Starter | Business | Enterprise |
|---|---|---|---|---|
| **Volumen mensual** | | | | |
| Emails enviados | 1.000 | 25.000 | 150.000 | ∞ |
| Mensajes WhatsApp | 250 | 5.000 | 30.000 | ∞ |
| **Recursos acumulativos** | | | | |
| Teams | 1 | 1 | 5 | ∞ |
| Usuarios totales | 2 | 5 | 20 | ∞ |
| Dominios verificados | 1 | 3 | 10 | ∞ |
| Cuentas SMTP | ∞ | ∞ | ∞ | ∞ |
| Templates email | ∞ | ∞ | ∞ | ∞ |
| Templates WhatsApp | ∞ | ∞ | ∞ | ∞ |
| Bots | 1 | 5 | ∞ | ∞ |
| Contactos | 5.000 | 50.000 | 500.000 | ∞ |
| **Features** | | | | |
| Multi-team | ❌ | ❌ | ✅ | ✅ |
| AI features | ❌ | ✅ | ✅ | ✅ |
| SSO SAML | ❌ | ❌ | ❌ | ✅ |
| API access | ❌ | ✅ | ✅ | ✅ |
| Webhooks personalizados | ❌ | ❌ | ✅ | ✅ |
| **Operacional** | | | | |
| Retención de audit log | 1 año | 1 año | 3 años | 3 años |
| Retención de event logs | 90 días | 90 días | 1 año | 1 año |
| Concurrent campaigns | 3 | 10 | 50 | ∞ |
| Tamaño máx import CSV | 1.000 filas | 10.000 | 50.000 | ∞ |
| **Soporte** | | | | |
| Canal | Email | Email | Email + Chat | Dedicado |
| SLA respuesta | Best effort | 48h | 24h | 4h |
| SLA uptime | 99.5% | 99.5% | 99.9% | 99.95% |

## Límites individuales por feature

### Email

| Límite | Valor |
|---|---|
| Máx contactos por campaña | 50.000 (Free), 500.000 (Starter+), ∞ (Business+) |
| Máx tamaño template HTML | 100 KB |
| Máx imágenes en template | 20 |
| Máx tamaño imagen | 5 MB |
| Tasas de envío | Según AWS SES (default 200/día sandbox, miles/hora en prod) |
| Reply-To | 1 por cuenta SMTP, 1 override por campaña |

### WhatsApp

| Límite | Valor |
|---|---|
| Máx contactos por campaña | Igual que email |
| Máx templates por WABA | ~250 (de Meta) |
| Máx botones por template | 3 (de Meta) |
| Máx chars en label de botón | 20 (de Meta) |
| Máx chars en body de template | 1.024 (de Meta) |
| Máx chars en footer / header | 60 cada uno (de Meta) |
| Tasa máx outbound | Variable por quality score (de Meta) |
| 24h window | 24 hs (de Meta) |
| Retry máx para errores temporales | 5 |

### Bots

| Límite | Valor |
|---|---|
| Máx nodos por flow | 200 |
| Máx topics por bot | 50 |
| Máx variables declarativas | 100 |
| Máx iteraciones por FOREACH | 100 |
| Máx FOREACH anidados | 3 |
| Máx tamaño de body HTTP request | 1 MB |
| Máx tamaño de response HTTP | 1 MB |
| Timeout HTTP (default / max) | 5s / 10s |
| Timeout MEDIA_FROM_URL | 15s / 30s max |
| TTL session (default) | 30 min |
| TTL session (configurable) | 1 min - 7 días |

### Contactos

| Límite | Valor |
|---|---|
| Máx tags por contacto | 50 |
| Máx listas por contacto | ∞ |
| Máx tamaño data JSON | 16 KB |
| Máx campos en data | 100 |

### Audit log

| Límite | Valor |
|---|---|
| Retención (Free / Starter) | 1 año |
| Retención (Business / Enterprise) | 3 años |
| Búsqueda texto libre | Funcional hasta ~100k eventos / mes |
| Export tamaño máx | 100k filas por export |

## Soft limits vs hard limits

### Soft limits (configurables o negociables)

Estos podemos subirlos para vos si tenés un caso especial:

- Tamaño de import CSV
- Concurrent campaigns
- Retención de logs
- Máx nodos por flow

Escribinos a [hola@massivo.app](mailto:hola@massivo.app) explicando tu
caso de uso.

### Hard limits (técnicos o de Meta/AWS)

Estos no podemos cambiarlos:

- Límites de Meta (templates, buttons, chars)
- Límites de AWS SES (tasas de envío, sandbox vs prod)
- Tamaños máximos de archivos
- Caps de FOREACH anidados (por seguridad del runtime)

## Cómo monitorear tu consumo

En el **home del panel** vas a ver 3 cards con tu consumo del mes:

- Emails enviados: X / Y
- Mensajes WhatsApp: X / Y
- Dominios dedicados: X / Y

Colores:

- 🟢 Verde (0-70%): tranquilo
- 🟡 Amarillo (70-90%): vas justo
- 🔴 Rojo (>90%): casi al límite

## Cuándo subir de plan

Las señales típicas:

| Síntoma | Probablemente necesitás... |
|---|---|
| "Mis campañas no envían a todos por quota" | Subir el plan de volumen |
| "Necesito un nuevo team pero no me deja" | Plan con multi-team (Business+) |
| "Quiero invitar más gente pero no me deja" | Plan con más users |
| "Quiero conectar mi CRM por API" | Starter+ (API access) |
| "Tengo SSO corporativo" | Enterprise |
| "Necesito retención más larga del audit log" | Business+ |
| "Necesito soporte dedicado" | Enterprise |
