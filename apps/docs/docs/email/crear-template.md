---
title: Cómo crear un template
sidebar_position: 9
---

# Cómo crear un template de email

Un template es el **diseño reutilizable** del mail con sus variables. Lo
armás una vez y lo usás en muchas campañas.

Ver [Templates con Handlebars](./conceptos/templates-handlebars) si no
sabés qué es Handlebars o qué variables tenés disponibles.

## Crear desde cero

1. Andá a **Email → Templates**
2. Click **"Nuevo template"**
3. Llenás los metadatos:
   - **Nombre**: identificador interno, ej. "Bienvenida Junio 2026"
   - **Subject (asunto)**: el subject que verá el destinatario. Puede
     tener variables, ej. `Hola {{nombre}}, gracias por sumarte`
   - **Cuenta SMTP (opcional)**: si seleccionás una, las campañas nuevas
     que usen este template la tomarán por defecto. Útil cuando un
     template está atado a un sender específico.
4. Te abre el **editor drag&drop** para armar el HTML

### Bloques disponibles en el editor

| Bloque | Para qué | Tip |
|---|---|---|
| **Heading** | H1/H2/H3 | Mantené máximo 1 H1 por mail para SEO/accesibilidad |
| **Text** | Párrafos | Soporta formato inline (negrita, links) |
| **Image** | Imagen | Subila o pegá URL externa. Pesá compress antes (menos de 100 KB) |
| **Button** | CTA principal | Tono y color customizables |
| **Divider** | Línea separadora | Útil entre secciones |
| **Spacer** | Espacio vertical | Para respirar el diseño |
| **HTML** | HTML libre | Solo si necesitás algo que los bloques no cubren |
| **Columns** | 2 o 3 columnas | El editor genera tablas por debajo para compat |

### Cómo agregar variables

Donde quieras insertar un dato del contacto, escribí `{{nombre_variable}}`:

```
Hola {{nombre}},

Gracias por unirte a {{empresa}}. Tu cuenta ya está activa.

Hacé click acá para empezar: [Button]
```

Si querés condicionales, loops, o helpers de Handlebars (ver
[Templates con Handlebars](./conceptos/templates-handlebars)), usá un
**bloque HTML** para escribirlos directamente.

## Importar un HTML existente

Si ya tenés un mail diseñado en otra herramienta (Stripo, BEE Free,
Mailchimp template builder, etc.) y querés usarlo en Massivo:

1. Exportá el HTML desde la herramienta original
2. En el editor de Massivo, click **"Importar HTML"** (modo avanzado)
3. Pegás el código
4. El editor lo carga y te muestra una preview

**Limitaciones**:

- Templates muy customizados con CSS no estándar pueden no renderear
  perfecto en el editor drag&drop. Recomendamos editarlos en modo HTML
  directamente y previsualizar.
- Si el template original usaba un motor de variables distinto (Mustache,
  Liquid, Jinja), tenés que **convertir las variables a Handlebars** —
  generalmente solo cambiar la sintaxis (`{{ variable }}` → `{{variable}}`,
  o adaptaciones similares).

## Previsualizar con datos reales

**Siempre** previsualizá antes de mandar.

1. En el editor (o en el listado del template), click **"Preview"**
2. Pegá un **sample data** JSON con los datos esperados:

```json
{
  "nombre": "Juan Pérez",
  "empresa": "ACME",
  "monto": 1500
}
```

3. Te muestra el render exacto

Cosas a chequear:

- ✅ Todas las variables se reemplazan
- ✅ El layout se ve bien (proporciones, spacing)
- ✅ Los links están bien (apuntan a donde deberían)
- ✅ Las imágenes cargan
- ✅ El subject quedó como esperabas (lo ves arriba de la preview)

## Test send

El paso definitivo antes de mandar masivo: mandarte el preview a tu
propio mail.

1. En el listado del template, click el icono ✈ **Test send**
2. Pegá tu email (debe estar verificado en SES si tu cuenta está en
   sandbox)
3. (Opcional) Pegás sample data JSON
4. **Elegí una cuenta SMTP**: si el template no tiene una asignada
   por default, te pide elegir una
5. Click **Enviar prueba**

Te llega el mail a tu inbox. **Probalo en**:

- Gmail (web + Android + iOS app)
- Outlook (web + desktop si aplica)
- Apple Mail si tu audiencia es mayoritariamente Apple
- Cualquier cliente que tu audiencia use

Lo que se ve bien en el editor no necesariamente se ve bien en Gmail. El
test send es el ground truth.

## Editar un template existente

En el listado, click **Editar**. Misma UI del editor.

:::warning Cuidado al editar templates en uso
Si una campaña en estado DRAFT o SCHEDULED apunta a este template, los
cambios la afectan. Si ya enviaste la campaña, los `EmailReport`
históricos guardan el HTML **renderizado en ese momento** — los cambios
nuevos no los retro-actúan.
:::

## Duplicar un template

Útil cuando querés crear una variante (ej. A/B testing):

1. En el listado, click el icono **Duplicar** del template original
2. Te crea uno nuevo con el nombre "Copia de X"
3. Lo editás, ajustás lo que querés probar, le ponés nombre final

## Borrar un template

En el listado, click **Borrar**.

:::warning Campañas que lo usan
Si un template está siendo usado por una campaña en DRAFT/SCHEDULED,
borrarlo deja la campaña sin template y no podrá enviarse hasta que
asignes otro.
:::

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "Hola , gracias por sumarte a ." | Variables vacías (la columna no estaba en el CSV) | Validá tu CSV antes; usá `{{nombre default="amigo"}}` para fallbacks |
| Mail llega y no se ven las imágenes | Outlook desktop bloquea por default | Avisá al destinatario que muestre imágenes, o usá texto descriptivo en `alt` |
| El subject sale `Hola undefined,` | Bug del CSV o de los headers | Usá Preview con sample data para confirmar |
| El link clickeable lleva a una URL larga rara | Es el tracking de Massivo, redirige al original automáticamente | Es normal, no es un bug |
| Botón se ve corrido en mobile | El editor genera HTML responsive pero no es perfecto | Test send y ajustá |

## Próximos pasos

- 📨 [Crear una campaña](./crear-campana) que use tu nuevo template
- 📊 Después del envío, mirá las [Métricas](./metricas-reportes) para ver
  performance
