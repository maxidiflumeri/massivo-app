---
title: MEDIA
sidebar_position: 5
---

# Nodo MEDIA

Envía un **archivo** (imagen, video, documento, audio) al contacto.
A diferencia de MESSAGE que solo manda texto, MEDIA manda binarios.

Hay 2 variantes:

- **MEDIA**: usa un `mediaId` ya subido a Meta (archivo pre-subido)
- **MEDIA_FROM_URL**: descarga de una URL externa, lo sube a Meta y lo
  envía (más flexible pero con caveats — ver al final)

Esta página cubre la variante **MEDIA**.

## Cuándo usarlo

- Mandar un PDF (tarifario, manual, factura)
- Mandar una imagen (foto de producto, mapa, ejemplo visual)
- Mandar un video corto (demo, tutorial)
- Mandar un audio (mensaje de voz pre-grabado)

## Configuración

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `mediaType` | enum | ✅ | `image` / `video` / `document` / `audio` |
| `mediaId` | string | ✅ | ID devuelto por Meta cuando subiste el archivo |
| `caption` | string | — | Texto que acompaña al media. **No aplica a audio.** |
| `filename` | string | — | Nombre del archivo. Solo aplica a `document`. |
| `nextNodeId` | string | — | Siguiente nodo (avance automático) |
| `gotoTopic` | string | — | Alternativa al nextNodeId |

## Cómo obtener un mediaId

Antes de usar MEDIA, **subí el archivo a Meta** y obtené su `mediaId`:

### Opción 1 — Subir desde el panel

1. En el detalle del bot, sección **Recursos / Media**
2. Click **"Subir archivo"**
3. Elegís tu archivo (imagen, video, doc, audio)
4. El panel lo sube a Meta vía API
5. Te devuelve el `mediaId` (algo como `987654321098765`)
6. Lo copiás al nodo MEDIA en el editor

### Opción 2 — Por API (avanzado)

Si tu archivo se genera dinámicamente (factura PDF, gráfico, etc.) y
querés subirlo on-demand, usá la API de Meta directamente desde tu
sistema, obtené el mediaId y pegalo. Para flows totalmente dinámicos
considerá **MEDIA_FROM_URL**.

## Ejemplo: mandar un PDF de tarifario

```yaml
kind: MEDIA
mediaType: document
mediaId: "987654321098765"
filename: "tarifario_2026.pdf"
caption: "Acá te dejamos nuestro tarifario actualizado al 2026."
nextNodeId: continuar
```

## Ejemplo: mandar una imagen con caption dinámico

```yaml
kind: MEDIA
mediaType: image
mediaId: "123450987654321"
caption: "Hola {{nombre}}, esta es la foto del producto que pediste."
nextNodeId: preguntar_si_le_gusta
```

## Tamaños máximos

Meta limita por tipo:

| Tipo | Max tamaño | Formatos comunes |
|---|---|---|
| `image` | 5 MB | JPG, PNG |
| `video` | 16 MB | MP4, 3GPP |
| `document` | 100 MB | PDF, DOCX, XLSX, TXT |
| `audio` | 16 MB | MP3, MP4, OGG, AAC |

## Cuidado: los mediaIds expiran

Meta retiene los mediaIds por **30 días** desde la última vez que se
usaron. Si pasás esos 30 días sin usar el mediaId en un envío, **Meta
lo borra** y tu nodo MEDIA va a fallar.

**Mitigaciones**:

1. **Re-subí periódicamente** los archivos que vas a usar
2. **Usá MEDIA_FROM_URL** que sube on-demand cada vez (tiene su propio
   trade-off de latencia)
3. **Tener un mecanismo de monitoreo** que detecte fallos y reposte

## Caption

| Tipo | Caption disponible |
|---|---|
| `image` | ✅ Sí |
| `video` | ✅ Sí |
| `document` | ✅ Sí |
| `audio` | ❌ No (Meta no lo permite) |

Para audio, si querés texto acompañando, mandá un MESSAGE antes con el
contexto y después el MEDIA audio.

## Filename (solo document)

Por defecto Meta usa el `filename` del archivo cuando lo subiste. Si
querés personalizar:

```yaml
filename: "Factura-{{nombrePersona}}-{{fechaActual}}.pdf"
```

Útil para que el contacto sepa qué es el archivo cuando lo descarga.

## Comportamiento

1. Bot envía el comando a Meta: "mandá este mediaId al contacto X"
2. Meta entrega el archivo + caption al contacto
3. Bot avanza al `nextNodeId` automáticamente
4. Sigue procesando como un MESSAGE normal

No hay "espera de descarga del contacto" — el bot avanza apenas Meta
acepta el comando.

## Buenas prácticas

### Subí los archivos UNA VEZ y cachealos

No subas el mismo PDF 50 veces. Subilo una vez, guarda el mediaId, y
reusalo. Solo re-subí si:

- Cambió el contenido del archivo (versión nueva)
- Pasaron >30 días desde el último envío
- Meta devuelve "media not found" en runtime

### Organizá tus medias

En el panel **Recursos / Media** del bot, podés:

- Renombrar los assets ("tarifario", "manual_alta")
- Etiquetar con categorías
- Ver cuántos días faltan para expirar

Mantenelo limpio para que no acumules basura.

### Caption explicativo

Mandar un PDF sin caption es confuso. Mandalo siempre con contexto:

```
✅ "Acá tenés el tarifario 2026. Si tenés dudas, preguntame."
❌ (sin caption)
```

## MEDIA_FROM_URL — la variante avanzada

Si necesitás mandar un archivo que **se genera dinámicamente** (ej. una
factura PDF personalizada para cada cliente), usá **MEDIA_FROM_URL**:

```yaml
kind: MEDIA_FROM_URL
mediaType: document
url: "https://api.empresa.com/facturas/{{facturaId}}/pdf"
filename: "Factura-{{facturaId}}.pdf"
caption: "Tu factura del pedido #{{pedido}}"
headers:
  Authorization: "Bearer {{apiToken}}"
timeoutMs: 15000
nextNodeId: continuar
errorNodeId: fallo_descarga
```

### Cómo funciona MEDIA_FROM_URL

1. Bot hace request HTTP a la `url` (con interpolación de variables)
2. Recibe el binario
3. **Lo sube a Meta** automáticamente (consigue un mediaId temporal)
4. Lo envía al contacto como un MEDIA normal
5. Avanza a `nextNodeId` si todo OK, a `errorNodeId` si algo falla
   (timeout, 404, 500, archivo demasiado grande, etc.)

### Caveats de MEDIA_FROM_URL

- **Latencia mayor**: cada envío hace descarga + upload + send (puede
  tardar 3-10 segundos)
- **SSRF guard**: bloquea URLs hacia IPs internas / private ranges
  para evitar SSRF
- **Max 1 MB de respuesta** (configurable por env)
- **Timeout max 30s**
- **No tiene vista propia en el editor** — administración hoy es solo
  por seed/API (no se puede crear desde la UI)

Si tenés un caso de uso para MEDIA_FROM_URL desde la UI, escribinos a
hola@massivo.app.

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Media not found" en runtime | El mediaId expiró (>30 días sin uso) | Re-subí y actualizá el nodo |
| El audio no se reproduce | Formato no soportado por algunos clientes | Usá MP3 (universal) |
| El PDF llega como "file.bin" | Olvidaste el filename | Setealo con extensión correcta |
| Caption no aparece en audio | Meta no lo permite | Mandá MESSAGE separado con el texto |
| MEDIA_FROM_URL falla con "URL not allowed" | SSRF guard detectó IP privada / loopback | Usá URL pública |

## Próximos pasos

- 💬 [MESSAGE](./message) — para texto plano sin media
- 🌐 [HTTP](./http) — para llamar a una API y procesar response (sin
  enviar archivo)
