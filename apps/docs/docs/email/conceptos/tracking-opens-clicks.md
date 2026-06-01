---
title: Tracking de opens y clicks
sidebar_position: 5
---

# Tracking de aperturas y clicks

Massivo trackea automáticamente **cuándo se abre cada email** y **qué links
se clickean**, para que veas el comportamiento real de tus destinatarios y
puedas tomar decisiones basadas en datos.

## ¿Cómo funciona el tracking de apertura?

Cuando enviamos un email, **inyectamos un pixel invisible de 1×1** al final
del HTML:

```html
<img src="https://api.massivo.app/api/track/open/<token>" width="1" height="1" />
```

Cuando el cliente de mail del destinatario renderiza el HTML, descarga la
imagen, y nosotros registramos esa descarga como **un evento de apertura**.

### Lo que tenés que saber del tracking de apertura

- **Es opcional para el destinatario**: si tienen las imágenes bloqueadas
  por default (común en Outlook), no se trackea hasta que ellos hagan
  click en "Mostrar imágenes".
- **Apple Mail Protection cambió las reglas**: desde iOS 15, Apple
  **pre-descarga** los pixels en su propia infra. Esto hace que en mails
  abiertos vía Apple Mail parezca que "todos abren". No es preciso pero
  sigue siendo útil como tendencia.
- **El primer open se guarda** (`firstOpenedAt`) y los siguientes incrementan
  el contador pero no sobrescriben el timestamp original.

## ¿Cómo funciona el tracking de clicks?

**Reescribimos cada link** del HTML del template antes de mandarlo.
Original:

```html
<a href="https://empresa.com/producto">Ver producto</a>
```

Lo transformamos a:

```html
<a href="https://api.massivo.app/api/track/click/<token>?u=https%3A%2F%2Fempresa.com%2Fproducto">Ver producto</a>
```

Cuando el destinatario hace click:

1. Su browser va a nuestra URL de tracking
2. Registramos el evento (con dispositivo, browser, hora, etc.)
3. Lo **redirigimos automáticamente** al link original
4. El usuario llega a `empresa.com/producto` como esperaba

El usuario no nota ninguna diferencia. La redirección es instantánea.

### Lo que tenés que saber del tracking de clicks

- **Solo se reescriben links del HTML del body**, no los headers
  (`List-Unsubscribe`) ni links en el footer ya manejados por nosotros
  (cancelar suscripción).
- **El primer click se guarda** (`firstClickedAt`), los siguientes
  incrementan el contador.
- **Cada link individual queda registrado** con su `targetUrl` y
  `targetDomain` — útil para saber **qué link concretamente** estuvo más
  pegando.

## Qué datos capturamos

Por cada evento de open / click capturamos:

- `occurredAt` — timestamp UTC
- `targetUrl` (solo clicks) — el link al que iba el usuario
- `targetDomain` (solo clicks) — el dominio del target
- `ip` — IP del request (la del destinatario, o la del pre-fetcher de
  Apple)
- `userAgent` — string completo
- Lo parseado del UA:
  - `deviceFamily` — Mobile / Desktop / Tablet
  - `osName` y `osVersion` — iOS 17.2, Android 14, Windows 11, etc.
  - `browserName` y `browserVersion` — Chrome 121, Safari 17, Outlook,
    Gmail Web, etc.

## Dónde lo ves en el panel

### En la campaña

En el detalle de cada campaña vas a ver:

- **Contador agregado**: cuántos opens únicos (distinct contacts que
  abrieron) y cuántos clicks únicos
- **Tasa de apertura** (open rate): opens únicos / sent
- **Tasa de click** (click rate): clicks únicos / sent
- **CTOR (Click To Open Rate)**: clicks únicos / opens únicos. Mide
  qué tan buen call-to-action tiene tu mail entre los que lo abrieron.

### En cada Report (un contacto específico)

En la lista de reports de la campaña podés expandir un report individual
y ver:

- `firstOpenedAt` y `firstClickedAt`
- Todos los eventos (cada open, cada click) con timestamps y device info

Esto es muy útil para diagnosticar: "Juan abrió 4 veces pero nunca clickeó,
me hace ruido el botón quizás".

### En métricas globales

**Email → Métricas** te muestra el agregado de todas tus campañas en una
ventana de tiempo (7 o 30 días):

- Totales (sent, failed, bounced, complained, suppressed, pending)
- Unique opens y unique clicks
- Tasas (open / click / bounce / complaint)
- Top campañas por performance

## Edge cases comunes

### "Los opens son demasiado altos para ser reales"

- **Apple Mail Privacy Protection**: si una parte significativa de tu
  audiencia usa Apple Mail/iOS, vas a ver opens inflados. Apple
  pre-descarga el pixel **antes** de que el usuario abra realmente. Es un
  problema de toda la industria, no algo de Massivo.
- **Crawlers anti-phishing**: Outlook 365 y Office hacen pre-fetch del HTML
  para detectar phishing. Puede generar un open falso, especialmente para
  los primeros emails.

### "Los clicks no se cuentan / aparecen menos de los esperados"

- **Bots de seguridad**: algunos clientes corporativos hacen click
  automático en todos los links para escanear seguridad. Esto **infla** los
  clicks (no los reduce).
- **Links abiertos en preview**: algunos clientes (Outlook) abren el link
  en preview sin que el usuario "real" haya clickeado. Cuenta igual.
- **Si un usuario tiene bloqueado JS o reescritura de URL**, el click va
  directo al target sin pasar por nuestro tracker. Estos no los contamos.

### "Quiero apagar el tracking"

Hoy no hay un toggle para deshabilitar tracking. Si tu caso de uso
requiere "no tracking" por compliance, escribinos a
[hola@massivo.app](mailto:hola@massivo.app) — podemos evaluar agregarlo
como feature.

## Próximos pasos

- 📝 [Templates con Handlebars](./templates-handlebars): cómo armar tu
  HTML para que el tracking funcione bien
- 📊 [Métricas y reportes](../metricas-reportes): cómo leer e interpretar
  tus tasas
