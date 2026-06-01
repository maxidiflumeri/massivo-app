---
title: Planes, límites y consumo
sidebar_position: 2
---

# Planes, límites y consumo

Massivo trabaja con un esquema de **plan + límites mensuales**. Cada plan
define cuánto podés enviar y cuántos recursos podés tener activos en tu
organización.

## Los 4 planes

| Plan | Emails / mes | WhatsApp / mes | Teams | Usuarios | Dominios verificados |
|---|---|---|---|---|---|
| **Free** | 1.000 | 250 | 1 | 2 | 1 |
| **Starter** | 25.000 | 5.000 | 1 | 5 | 3 |
| **Business** | 150.000 | 30.000 | 5 | 20 | 10 |
| **Enterprise** | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado |

:::note Aún definiendo precios
Estamos en programa beta y todavía no publicamos precios. Escribinos a
[hola@massivo.app](mailto:hola@massivo.app) para conocer las condiciones
actuales.
:::

## Cómo se cuentan los envíos

### Emails

Contamos **cada email aceptado por el proveedor SMTP/SES**. Esto incluye:

- ✅ Mails enviados con éxito (estado SENT)
- ✅ Mails que rebotaron después (BOUNCED) — ya consumieron quota al ser enviados
- ❌ Mails que **no se enviaron** por estar en suppression list, ser duplicados,
  o por exceder el límite del plan: **no consumen quota**.

### Mensajes de WhatsApp

Contamos **cada mensaje aceptado por Meta**. No contamos:

- ❌ Mensajes que Meta rechazó por rate limit (se reintentan)
- ❌ Mensajes a contactos en opt-out
- ❌ Mensajes que el bot decidió no enviar (handoff a humano antes del mensaje)

## El período de facturación

El consumo se mide **por mes calendario UTC**. El 1° de cada mes a las 00:00 UTC
los contadores vuelven a cero. En el panel ves la fecha exacta del próximo
reset en la pantalla principal.

## Qué pasa si me paso del límite

Aplicamos **corte parcial**. Por ejemplo: si tu plan Free permite 1.000 emails
y querés mandar una campaña de 1.500:

1. Los **primeros 1.000 destinatarios** se encolan normalmente y se envían.
2. Los **500 restantes** se crean como reports con estado `CANCELED` y razón
   `quota-exceeded:plan-FREE`. **No se envían**.
3. La campaña muestra ambas cifras: "1.000 enviados / 500 cancelados por
   cuota".
4. En el panel home, el card del plan muestra "1.000 de 1.000 — 100% usado".

Cuando llegue el siguiente mes (reset UTC), volvés a tener tu cuota completa
y podés re-enviar a los 500 restantes si querés (creando una campaña nueva).

:::tip Subir de plan en cualquier momento
Si te quedás corto antes de fin de mes, podés subir de plan inmediatamente. Los
contadores no se reinician, pero el límite nuevo aplica al instante.
:::

## Dominios verificados

A diferencia de los envíos, los **dominios verificados son un recurso
acumulativo**: contamos los dominios que tenés **registrados y verificados en
SES**, no por mes.

- Si tu plan permite 3 dominios y querés agregar un 4to, vas a tener que
  borrar uno o subir de plan.
- Los dominios en estado PENDING (esperando DNS) o FAILED **también cuentan
  contra tu límite** — borralos si no los vas a usar.

## Ver tu consumo en tiempo real

En el panel principal (`/dashboard`) hay 3 cards con tu consumo del mes:

- **Emails enviados** — % usado vs total del plan
- **Mensajes de WhatsApp** — % usado vs total del plan
- **Dominios dedicados** — cantidad usada vs total del plan

Los colores cambian según el % de uso:

- **Verde** (0-70%): tranquilo
- **Amarillo** (70-90%): vas justo
- **Rojo** (>90%): casi al límite

## Próximos pasos

- 🌐 Aprendé sobre [dominios verificados](../email/conceptos/dominios-verificados) (próximamente)
- 📊 Revisá tu consumo actual en [el panel](https://panel.massivo.app)
