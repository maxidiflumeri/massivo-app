---
title: Crear tu primer bot
sidebar_position: 6
---

# Crear tu primer bot

Tutorial step-by-step. Vamos a armar un **bot de FAQ con escalamiento
a humano** desde cero. Te lleva ~15 min y aprende los nodos
esenciales.

## Lo que vamos a armar

```
Cliente: "Hola"
   ↓
Bot: "¡Hola! ¿En qué te ayudo?"
   [Horarios] [Sucursales] [Hablar con alguien]
   ↓
[Si elige Horarios] → Bot: "Lun-vie 9-18hs"
[Si elige Sucursales] → Bot: "Av. Corrientes 1234"
[Si elige Hablar con alguien] → Bot: "Te paso con un agente" → HANDOFF
```

## Pre-requisitos

- ✅ Tenés un **número Meta configurado** en Massivo (ver
  [Configurar número](../whatsapp/configurar-numero))
- ✅ La organización tiene la **feature de bots habilitada**
- ✅ Conociste el [editor de flujo](./editor-de-flujo) básicamente

## Paso 1 — Crear el bot

1. **WhatsApp → Bot guiado** → **"Nuevo bot"**
2. **Nombre**: ej. "FAQ Básico"
3. **Config**: elegí tu WapiConfig (número Meta)
4. **Crear**

Te abre el editor con un canvas vacío y un topic default ya creado
(`default`).

## Paso 2 — Crear el MENU inicial

1. Click derecho en el canvas → **Agregar nodo → MENU**
2. Aparece un MENU vacío. Click sobre él para editarlo
3. En el sidebar derecho:

| Campo | Valor |
|---|---|
| **Text** | `¡Hola! ¿En qué te ayudo?` |
| **Header** | (vacío) |
| **Footer** | `Atención: lun-vie 9-18hs` |

4. **Options** — agregás 3:

| Label | Conexión (la armamos después) |
|---|---|
| Horarios | (vacía por ahora) |
| Sucursales | (vacía por ahora) |
| Hablar con alguien | (vacía por ahora) |

5. **Guardar**

## Paso 3 — Marcar como nodo de inicio

Cuando una sesión nueva entra al topic, tiene que arrancar por **este**
MENU.

1. Click derecho en el MENU → **"Marcar como nodo de inicio"**
2. Vas a ver el badge **"Start"** y el nodo cambia a verde

## Paso 4 — Crear los 2 MESSAGEs y el HANDOFF

Vamos a crear 3 nodos más, uno por cada opción.

### Nodo "horarios_info"

1. Click derecho → **Agregar nodo → MESSAGE**
2. Sidebar:

| Campo | Valor |
|---|---|
| **Text** | `Nuestros horarios son:\n\n📅 Lun-vie: 9-18hs\n📅 Sábados: 10-13hs\n📅 Domingos: cerrado\n\nSi necesitás algo más, escribime!` |
| **nextNodeId** | (vacío — es terminal) |

3. Guardar
4. Renombralo (sidebar → "ID" → escribí `horarios_info`)

### Nodo "sucursales_info"

1. Otro **MESSAGE**
2. **Text**:
   ```
   Estamos en:

   📍 Av. Corrientes 1234, CABA
   📍 Cabildo 4567, CABA
   📍 Boulogne Sur Mer 890, Vicente López

   ¿Querés saber algo más?
   ```
3. ID: `sucursales_info`

### Nodo "handoff_humano"

1. Otro **HANDOFF**
2. **Text**: `¡Genial! Te paso con un agente. En un momento alguien se pone en contacto.`
3. **Escalate**: `true` (alta prioridad)
4. ID: `handoff_humano`

## Paso 5 — Conectar el MENU con cada destino

Volvé al MENU inicial. En el sidebar derecho:

| Option label | nextNodeId |
|---|---|
| Horarios | `horarios_info` |
| Sucursales | `sucursales_info` |
| Hablar con alguien | `handoff_humano` |

Guardar.

En el canvas vas a ver flechas saliendo del MENU hacia los 3 nodos
destino.

## Paso 6 — Save Draft

Click **"Guardar"** en la toolbar.

El draft queda persistido. **Todavía no afecta a producción** porque
no publicaste.

## Paso 7 — Probar con el simulador

1. Click **"Simulador"** en la toolbar
2. Se abre un panel chat al costado
3. Escribí: `Hola`
4. El bot responde con el MENU
5. Click en uno de los botones (en el simulador podés hacer click en
   los botones igual que el contacto)
6. Vas viendo cómo responde

### Lo que mirás en el simulador

- **Mensajes**: el chat tal como lo vería el contacto
- **Variables**: panel lateral con lo que se haya capturado (en este bot,
  vacío porque no usamos CAPTURE)
- **Nodo actual**: indicador de en qué nodo está el contacto en este
  momento
- **Logs**: detalle de cada paso del flow

### Reset del simulador

Si querés empezar de cero, botón **"Reset session"** en el simulador.

## Paso 8 — Publicar

Conforme con lo que viste? **¡Publicalo!**

1. Click **"Publicar"** en la toolbar
2. Confirmás el modal — te avisa cuántas sesiones activas hay
   (probablemente 0 si recién creás)
3. **Publish**

A partir de ahora, los **nuevos inbounds** al número configurado son
manejados por este bot.

## Paso 9 — Probar con un WhatsApp real

1. Desde tu celular personal, **mandá "Hola"** al número Meta
   configurado
2. Te llega el menu del bot
3. Tocá una opción
4. El bot responde

**¡Funciona!**

## Paso 10 (opcional) — Mejorar el bot

Algunas mejoras que podés hacer ahora que tenés la base:

### Variar el saludo según hora

Usá CONDITION antes del MENU:

```
[CONDITION: ¿es horario laboral?]
  ├── time 09:00-18:00 → [MENU normal]
  └── else → [MESSAGE: "Estamos cerrados, te respondemos mañana"]
```

### Capturar nombre antes del menu

```
[CAPTURE: "¿Cómo te llamás?" → saveAs: nombre]
   ↓
[MENU: "¡Hola {{nombre}}! ¿En qué te ayudo?"]
```

### Agregar más opciones con sub-MENUs

Cuando "Hablar con alguien" se vuelve genérico, ramificalo:

```
[Original MENU]
   └── "Hablar con alguien" → [Sub-MENU: ¿Qué área?]
                                ├── Soporte → [HANDOFF]
                                ├── Ventas → [HANDOFF]
                                └── Cobranzas → [HANDOFF]
```

### Usar topics para flujos largos

Cuando un branch del MENU se vuelve un flow propio largo (5+ nodos),
extraelo a un **topic separado** y usá `gotoTopic` para entrar.

## Workflow de iteración

A partir de este primer bot, tu flujo de trabajo va a ser:

```
Editás cambios → Save Draft → Simulador → Conforme? → Publish
                                  ↓
                            No conforme → Iterás de nuevo
```

Repetí hasta tener exactamente lo que querés.

## Próximos pasos

- 📦 [Tipos de nodos](./nodos/menu) — referencia detallada
- 🎯 [Recetas](./recetas/capturar-lead) — flows completos para casos
  típicos
- 🧭 [Multi-tema y router](./conceptos/multi-tema-router) cuando
  necesites varios flows
