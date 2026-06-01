---
title: Cómo conectar una cuenta SMTP
sidebar_position: 8
---

# Cómo conectar una cuenta SMTP

Una **cuenta SMTP** representa la **configuración de envío** que tus
campañas usan: desde qué dirección sale el mail, con qué credenciales, y
opcionalmente a qué dominio verificado pertenece.

Massivo soporta **2 modos**:

1. **Dominio verificado en SES** (recomendado): el más limpio, no
   necesitás credenciales SMTP
2. **SMTP genérico** (Gmail con app password, servidor propio, otro
   proveedor): si por alguna razón no usás SES

## Modo 1 — Vincular a un dominio verificado en SES (recomendado)

Es lo más simple. Pre-requisito: tener al menos un dominio en estado
**VERIFIED** (ver [Cómo agregar un dominio](./agregar-dominio)).

### Pasos

1. Andá a **Email → Cuentas SMTP**
2. Click **"Nueva cuenta"**
3. **Nombre**: un identificador para vos, ej. "Notificaciones generales"
4. **Origen del envío**: el dropdown te muestra todos tus dominios
   verificados. Elegí el que querés usar.

   Al elegirlo, el panel:
   - Setea automáticamente **provider = SES**
   - Oculta los campos host/puerto/usuario/contraseña (no son necesarios)
   - **Autosugiere** `noreply@tu-dominio` en el campo "From (email)"

5. **From (nombre)**: el nombre que ve el destinatario, ej.
   "Empresa - Notificaciones"
6. **From (email)**: confirmá el email (tiene que terminar en tu
   dominio verificado). Podés usar `noreply@`, `info@`, `hola@`, etc.
7. **Reply-To (opcional)**: ver [Reply-To vs From](./conceptos/reply-to-vs-from).
   Si lo dejás vacío, las respuestas van al From.
8. **Guardar**

La cuenta se valida automáticamente (chequeamos que el dominio sigue
verificado en SES). Si todo OK, **queda Activa** ✅.

### ¿Por qué no me pide credenciales?

Porque Massivo habla con SES usando **credenciales propias de la
plataforma** (instance profile de la EC2 que corre el backend). Vos no
necesitás ni tenés que tener credenciales de AWS para enviar — alcanza
con que el dominio esté verificado.

## Modo 2 — SMTP genérico

Útil si:

- Querés mandar desde Gmail/Outlook con app password (volumen muy bajo)
- Tu cliente tiene un servidor SMTP corporativo
- Usás un proveedor SMTP distinto (Mandrill, Mailjet, etc.)

### Pasos

1. **Email → Cuentas SMTP** → **"Nueva cuenta"**
2. **Nombre**: identificador
3. **Origen del envío**: dejá **"Cuenta SMTP propia (manual)"** (o no
   elijas nada si no tenés dominios verificados)
4. **Proveedor**: elegí **SMTP**
5. **Host**: ej. `smtp.gmail.com`, `smtp.office365.com`,
   `smtp.empresa.com.ar`
6. **Puerto**: 587 (STARTTLS) o 465 (TLS directo) son los típicos.
   1025 (sin TLS) solo para dev con Mailpit local.
7. **Usuario**: típicamente tu mail completo
8. **Contraseña**: la app password si es Gmail, o la password normal del
   servidor SMTP
9. **From (nombre)** y **From (email)**: ojo, **muchos proveedores SMTP
   exigen que el From sea exactamente la cuenta autenticada**. Gmail por
   ejemplo te lo reescribe.
10. **Reply-To** (opcional)
11. **Guardar**

Massivo intenta una **conexión de prueba** (handshake + AUTH). Si OK,
queda **Activa** ✅. Si falla, queda **Inactiva** con el motivo en un
tooltip.

:::caution Gmail / Outlook personal: límites bajos
- Gmail: ~500 mails/día desde una cuenta personal con app password.
  Superando eso te suspenden.
- Outlook personal: aún más bajo.
- **Para volúmenes serios, usá SES con dominio propio**.
:::

## Verificar / re-verificar una cuenta

Si una cuenta queda **Inactiva** después de guardar, o si cambió algo
(rotaste la password, revocaron el app password, expiró tu access token):

1. En el listado, click el icono **✓ Verificar conexión** al lado de la
   cuenta
2. Massivo reintenta la conexión y refresca el estado

## Editar una cuenta

En el listado, click **Editar** (icono lápiz). Cambios típicos:

- Renombrar
- Cambiar el `Reply-To`
- Vincular/desvincular a un dominio verificado
- Cambiar el `fromName` o `fromEmail`

Si cambiás la contraseña, **dejá el campo vacío para mantener la actual**.
Si lo llenás, se reemplaza.

## Borrar una cuenta

En el listado, click **Borrar** (icono basura). Te pide confirmación.

:::warning Si tenés campañas usando esa cuenta
Las campañas en estado DRAFT o SCHEDULED **pierden la cuenta asignada** y
quedan sin poder enviarse hasta que les asignes una nueva. Las campañas
ya enviadas no se ven afectadas (los reports históricos se preservan).
:::

## Enviar un email de prueba

Útil para confirmar que la cuenta funciona end-to-end sin armar una
campaña completa:

1. En el listado de cuentas, click el icono ✈ **Enviar prueba**
2. Pegá un email de destinatario
3. Click **Enviar prueba**

Te llega un mail estándar usando esa cuenta. Si SES está en sandbox, el
destinatario tiene que estar **verificado como identity** en SES (ver
[planes y límites](../conceptos/planes-limites-consumo) → SES sandbox).

## Cuántas cuentas SMTP tener

No hay límite estricto en planes pagos. Pero **menos es más**:

| Caso | Cuántas |
|---|---|
| Cliente único, envíos uniformes | 1 |
| Múltiples áreas (Marketing, Soporte) que quieren remitentes distintos | 1 por área |
| Múltiples dominios | 1 por dominio (mínimo) |
| Necesitás `Reply-To` distinto sin cambiar `From` | 1 cuenta por combinación |

## Próximos pasos

- 📝 [Crear tu primer template](./crear-template) para usar esta cuenta
- 📨 [Crear una campaña](./crear-campana) que use esta cuenta
