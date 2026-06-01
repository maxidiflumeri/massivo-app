---
title: Opt-out y compliance
sidebar_position: 11
---

# Opt-out y compliance en WhatsApp

Igual que en email, en WhatsApp **estás obligado a respetar el opt-out**
de tus contactos. Massivo te ayuda con detección automática + lista de
bloqueo + respeto en cada envío.

## La regla básica

Si un contacto te escribe pidiendo no recibir más mensajes, **tenés que
dejarle de mandar**. Esto está cubierto por:

- **Leyes locales** (GDPR, LGPD, Ley de Protección de Datos en
  Argentina, CASL en Canadá, etc.)
- **Políticas de WhatsApp Business**: Meta espera que las plataformas
  como Massivo lo hagan automáticamente. Si recibís muchas quejas, te
  bajan la quality y eventualmente te bloquean el número.

## Cómo detectamos opt-out automáticamente

Massivo monitorea **cada mensaje inbound** y matchea contra una lista de
**keywords** configurables.

### Keywords por defecto

| Idioma | Keywords |
|---|---|
| **Español** | `baja`, `stop`, `cancelar`, `no me mandes mas`, `no quiero mas mensajes`, `dejen de molestar` |
| **Inglés** | `stop`, `unsubscribe`, `cancel`, `no more` |
| **Portugués** | `parar`, `cancelar`, `stop` |

La detección es:

- **Case-insensitive**: "BAJA", "Baja", "baja" → todos matchean
- **Exact word**: "baja" matchea, "bajame el precio" no matchea (a
  menos que "bajame" esté en la lista)
- **Trim de espacios**: "  baja  " matchea

### Personalizar las keywords

En **WhatsApp → Números → Editar config** podés:

- Agregar keywords nuevas
- Remover keywords default (si por ejemplo "stop" se usa en otro
  contexto en tu negocio)

## Qué pasa cuando alguien dice "BAJA"

```
Contacto te manda: "BAJA"
   ↓
Massivo detecta la keyword
   ↓
Acciones automáticas:
  1. Agregamos al contacto a la lista de opt-out (scope=team)
  2. Cualquier WapiReport PENDING para ese contacto → CANCELED
     (motivo: opted-out)
  3. Si está en alguna conversación activa → la marcamos como
     RESOLVED con tag "opt-out"
  4. Mandamos al contacto un mensaje automático de confirmación
     (opcional, configurable):
     "Listo. No vamos a enviarte más mensajes. Si querés volver,
      respondé ALTA."
  5. Loggeamos el evento en el audit log
```

A partir de ese momento:

- **Ninguna campaña outbound** intenta mandarle a ese contacto
- **El bot no le va a responder** (si estaba activo)
- **El agente humano puede seguir respondiéndole** si el contacto vuelve
  a escribir, pero NO puede iniciar conversación con templates

## Scope: team vs config

Por defecto el opt-out es **scope=team** — el contacto queda bloqueado
para **todas las campañas del team**, **todos los bots del team**, y
**todas las conversaciones de todos los números** asociados al team.

Si tenés casos especiales, podés cambiar scope a:

- **`config`** (por número Meta): el opt-out aplica solo al número
  específico desde el que el contacto opt-out-ó. Útil si tu team tiene
  dos números (Marketing y Soporte) y el contacto solo quiere salir
  de Marketing.

Lo cambiás cuando agregás manualmente un opt-out, o reconfigurando los
detalles del opt-out automático.

## La lista de opt-outs

**WhatsApp → Opt-outs** (en sidebar — puede estar como sub-item de
"Inbox" o de "Números" según la versión).

Mismo modelo que la suppression list de email:

- Lista de contactos bloqueados con teléfono, scope, motivo
  (automático/manual), timestamp
- Filtros por motivo, scope, búsqueda
- Acción: ver detalle, remover (con caveats)

### Agregar manualmente

Si te enterás por otro canal (email, WhatsApp del agente, etc.) que un
contacto no quiere más:

1. **"Agregar"**
2. Teléfono en E.164
3. Scope: team (recomendado)
4. Motivo: manual
5. Nota: contexto
6. Guardar

### Importar masivo

CSV con `phone,scope,reason,notes`. Útil si te dan una lista grande
para bloquear.

### Remover

:::warning Pensá antes
Si un contacto opt-out-eó, removerlo y mandarle de vuelta puede
- Re-traer la queja
- Tener consecuencias legales en jurisdicciones estrictas

**Solo removelo si el contacto te lo pide explícitamente** (y idealmente
con prueba documentada).
:::

## Compliance específica de Meta

### Quality score

Meta calcula tu **quality score** del número en función de:

- Tasa de mensajes bloqueados / marcados como spam
- Tasa de respuesta a tus templates de marketing
- Quejas de usuarios

Si el score baja:

- **High → Medium**: te limita rate (cuántos podés mandar por hora)
- **Medium → Low**: rate más bajo, warnings
- **Low → Flagged**: te pueden suspender el número

Mantener un buen quality score es **directamente función de respetar
los opt-outs**.

### Iniciar conversación de marketing

Meta exige que los contactos a los que mandás **marketing templates**
hayan dado **opt-in explícito** previamente.

Esto **no es algo que Massivo pueda chequear por vos** — sos vos quien
tiene que asegurar que cargaste contactos que opt-in-aron (por
formulario, checkout, etc.). Si Meta te audita y no podés probar
opt-in, te bajan la cuenta.

**Recomendación**: documentá cuándo y cómo cada contacto opt-in-eó.
Massivo te deja agregar notas en el contacto unificado para esto.

## Reabrir comunicación (opt-in de nuevo)

Configurable: si el contacto que opt-out-eó vuelve a escribirte un
mensaje, podés:

- **Modo A (default conservador)**: mantenerlo bloqueado. El team puede
  responder pero no iniciar templates.
- **Modo B (auto opt-in al volver)**: si te escribe un mensaje normal
  (no en la lista de keywords), interpretamos como opt-in implícito y
  lo removemos de la lista.

Modo B es **riesgoso** legalmente — usalo solo si tu contexto lo
justifica.

## Audit log de opt-outs

Cada acción queda registrada en **Cuenta → Audit log**:

- Quién (o qué automatismo) agregó cada opt-out
- Cuándo
- Sobre qué contacto
- Motivo

Imprescindible para demostrar cumplimiento en una auditoría legal.

## Buenas prácticas

### Diseñá tus templates con opt-out explícito

Aunque WhatsApp no lo exige formalmente, mejorá compliance + percepción
agregando un footer en tus templates:

```
Si no querés más mensajes, respondé BAJA.
```

Esto:

- Le da al contacto una salida obvia (reduce quejas)
- Aumenta tu confianza con Meta
- Te baja el riesgo legal

### Honrá opt-outs antes de mandar campañas grandes

Antes de mandar una campaña de 5000 contactos, revisá tu lista de
opt-outs. Si tu base original no los excluyó, Massivo los va a CANCELAR
automáticamente, pero el conteo de "cuántos enviaron" va a bajar y vas a
querer saber por qué.

### Procesos para opt-outs por canal cruzado

Si un cliente te dice por email "ya no me mandes más WhatsApp", **tiene
que llegar a la lista de opt-outs de WhatsApp**. Definí un proceso
interno para que esto no se pierda.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| Cliente dice "ya pedí BAJA y siguen mandándome" | No fue exact-match con keyword | Agregás esa variante al listado de keywords |
| Opt-out funcionó pero mi quality sigue baja | Lleva tiempo recuperar quality después de muchas quejas | Esperá unos días + mandá menos volumen + mejorá targeting |
| Quiero limpiar mi lista cargando opt-outs de hace años | Importás CSV masivo | Asegurate que el formato del teléfono sea E.164 |

## Próximos pasos

- 📨 [Crear campaña respetando opt-outs](./crear-campana) (es automático)
- 💬 [Inbox](./inbox) — el opt-out automático también afecta cómo
  manejás las conversaciones
- 🤖 [Bots](../bots/crear-primer-bot) — los bots respetan opt-out por
  default
