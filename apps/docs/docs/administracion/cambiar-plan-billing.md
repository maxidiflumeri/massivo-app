---
title: Cambiar de plan y billing
sidebar_position: 3
---

# Cambiar de plan y billing

Cómo subir / bajar de plan, ver tu facturación y cambiar el medio
de pago. Solo OWNERs y BILLING pueden hacer esto.

:::info Estado actual del billing
Estamos en **programa beta** y el flujo de cobro automático todavía no
está activo. Para cambiar de plan o consultar facturación, **escribinos
a [hola@massivo.app](mailto:hola@massivo.app)** y lo hacemos manual.

Esta página describe **cómo va a ser** cuando salga el módulo nativo
de billing. Lo dejamos documentado para que sepas qué esperar.
:::

## Acceder a billing

**Cuenta → Configuración → Billing** (próximamente).

Vas a ver:

- **Plan actual** + features + límites
- **Próxima fecha de cobro**
- **Método de pago** registrado
- **Histórico de facturas**
- **Botones**: cambiar plan, cambiar método de pago, descargar facturas

## Los 4 planes

| | Free | Starter | Business | Enterprise |
|---|---|---|---|---|
| **Emails/mes** | 1.000 | 25.000 | 150.000 | Ilimitado |
| **WhatsApp/mes** | 250 | 5.000 | 30.000 | Ilimitado |
| **Teams** | 1 | 1 | 5 | Ilimitado |
| **Usuarios** | 2 | 5 | 20 | Ilimitado |
| **Dominios verificados** | 1 | 3 | 10 | Ilimitado |
| **Multi-tenant** | ❌ | ❌ | ✅ | ✅ |
| **AI features** | ❌ | ✅ | ✅ | ✅ |
| **SSO SAML** | ❌ | ❌ | ❌ | ✅ |
| **Soporte** | Email | Email | Prioritario | Dedicado |
| **Precio** | $0 | Por confirmar | Por confirmar | Por confirmar |

Ver detalle completo en [planes y límites](../conceptos/planes-limites-consumo).

## Subir de plan (upgrade)

### Cuándo

- Te estás pasando del límite mensual y te importa más volumen
- Necesitás features que solo están en plan superior (multi-tenant,
  AI, SSO)
- Crece tu equipo y necesitás más usuarios

### Cómo (cuando esté activo el flow)

1. **Billing → Cambiar plan**
2. Elegís el nuevo plan
3. Te muestra **proporcional**: cuánto te cobramos hoy (prorrateo) +
   cuánto vas a pagar el próximo ciclo
4. Confirmás
5. **Los nuevos límites aplican inmediatamente**

### Lo que pasa con tu consumo del mes

- **No se resetea** — sigue igual, ahora con la cuota nueva más
  amplia
- Si estabas al 100% de Free (1.000 emails), pasás a Starter, ahora
  tenés 1.000 ya consumidos / 25.000 totales

## Bajar de plan (downgrade)

### Cuándo

- Estás usando menos de lo que paga el plan actual
- Querés simplificar / reducir gasto

### Cómo

1. **Billing → Cambiar plan** → elegís uno menor
2. Te avisa **qué vas a perder**:
   - Si tenés más dominios verificados que el límite del plan nuevo,
     vas a tener que borrar algunos
   - Si tenés más teams, vas a tener que borrar algunos
   - Si tenés más usuarios, vas a tener que remover algunos
3. Tenés que **hacer cleanup primero** si excedés los límites del
   destino
4. Después confirmás

### El cambio se aplica

- **Al final del ciclo actual** (no inmediato), para que no perdés lo
  que ya pagaste
- En la fecha de cambio, los límites nuevos empiezan a regir

### Datos que no se borran

Aunque bajes de plan, tus datos quedan:

- Campañas históricas → siempre
- Contactos → todos quedan
- Templates → quedan
- Audit log → según retención del plan nuevo

Lo único que cambia son los **límites operacionales** (cuántos podés
crear / enviar / verificar).

## Cancelar (volver a Free)

Igual que un downgrade — Free es el plan mínimo y no se cobra.

- Tus datos no se borran
- Sigues pudiendo loguearte
- Los límites de Free aplican: hasta 1.000 emails y 250 WhatsApp por
  mes
- Si necesitás más después, hacés upgrade en cualquier momento

## Eliminar la organización completamente

Si querés **borrar todos los datos para siempre** (no solo bajar de
plan):

1. **Configuración → Eliminar organización** (solo OWNER puede)
2. Te pedimos confirmación múltiples veces porque es **destructivo
   y permanente**
3. Después de 30 días de grace period (podés cancelar la solicitud),
   se ejecuta el delete:
   - Todos los contactos
   - Todas las campañas y reports
   - Todos los templates y bots
   - Todos los miembros pierden acceso

**No se puede deshacer** después de los 30 días.

:::warning Pensá si realmente querés esto
- Si solo querés "salir" pero conservar tus datos, baja a Free
- Si querés exportar todo antes, **hacelo durante el grace period**
- Tu CUIT / razón social: si vas a querer volver a Massivo, mejor
  mantener la org existente
:::

## Método de pago

(Cuando esté activo)

Acceptaremos:

- **Tarjeta de crédito / débito** internacional
- **MercadoPago** (Argentina)
- **Stripe** (resto del mundo)
- **Transferencia / wire** para Enterprise

Cambiar el método de pago:

1. **Billing → Métodos de pago**
2. **Agregar nuevo método**
3. Lo dejás como default
4. Removés el viejo

## Facturación e impuestos

- **Facturas mensuales** descargables como PDF desde Billing
- **IVA / impuestos locales** se calculan según tu país
- Para Argentina, si necesitás **Factura A** con CUIT, agregás tus
  datos fiscales en **Configuración → Datos fiscales** (próximamente)

## Soporte de billing

Para preguntas sobre billing, escribinos:

- 📧 [hola@massivo.app](mailto:hola@massivo.app) — respondemos rápido
  en días hábiles
- En el panel, futuro: **"Hablar con soporte"** que abre un ticket

## Preguntas frecuentes

### "Cuándo arranca el cobro real?"

Estamos validando product/market fit. Vamos a anunciar fechas y
condiciones del programa beta antes de empezar a cobrar.

### "Si pago Annual, hay descuento?"

Sí, planeamos ofrecer ~15-20% de descuento anual cuando esté el flow
activo.

### "¿Mi consumo de Meta se cobra a través de Massivo?"

**No**. Los mensajes de WhatsApp los pagás **directo a Meta** —
nosotros somos solo la plataforma. Tu billing de Meta es completamente
independiente.

### "¿Hay precio por sobrepaso (overage)?"

Hoy aplicamos **corte parcial** al exceder cuota (no permite seguir
mandando, no te cobramos más). Cuando salga el modelo final, **podríamos
ofrecer overage paga** como opción (a precio definido por email/mensaje
extra) — pero por ahora no.

### "¿Qué pasa si Meta sube precios?"

Eso te lo cobra Meta directamente, no nosotros. Nuestro precio de
plataforma no cambia automáticamente — si necesitamos ajustar nuestros
precios, te avisamos con anticipación.

## Próximos pasos

- 📊 [Planes y límites](../conceptos/planes-limites-consumo) — detalle
  de cada plan
- 👥 [Gestionar usuarios](./gestionar-usuarios) — si necesitás más
  cupo de usuarios
- 📜 [Audit log](./audit-log) — para ver cambios de plan históricos
