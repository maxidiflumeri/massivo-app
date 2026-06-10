# Diseño: tools personalizadas para Agentes IA

> Objetivo: que el usuario pueda **definir tools custom desde el frontend**
> (nombre, descripción, parámetros + una acción HTTP) y **elegir cuáles usa cada
> agente**. El LLM decide cuándo invocarlas y con qué argumentos; el backend
> ejecuta la request HTTP de forma segura y devuelve el resultado al modelo.
>
> Mapeo a Bot Framework: la **descripción de la tool cumple el rol de LUIS** —
> en vez de entrenar un intent con utterances, se escribe una buena descripción
> y el LLM rutea solo (los parámetros son las "entities"). La acción HTTP es el
> equivalente del nodo HTTP del bot, pero con **invocación por decisión del
> modelo** en vez de determinista por flujo.
>
> Estado actual relevante (verificado en código, 2026-06-09):
> - El contrato `AgentTool` (`def` + `execute(args, ctx)`) y el resultado con
>   `stop?` ya existen. → `apps/backend/src/modules/agents/tools/agent-tool.types.ts:15-28`
> - El registry es **estático**: solo la built-in `escalate_to_operator`,
>   `defs()` global sin noción de agente. El propio comentario anticipa este
>   slice. → `agent-tool.registry.ts:5-26`
> - El runtime ya tiene el **loop de tool-calling** completo: `defs()` se pasa
>   al gateway, ejecuta cada `toolCall`, `maxSteps` como tope, tools terminales
>   cortan con `stop`. Cambio necesario: una sola línea (`this.tools.defs()` →
>   resolución per-agent). → `agent-runtime.service.ts:133,148-188`
> - `BotHttpExecutor` ya resuelve TODO lo peligroso de requests configuradas por
>   usuarios: SSRF guard + anti DNS-rebinding, timeout clamp 100..10000ms, cap
>   1 MB de respuesta, rate limit por org, `redirect: manual`, parseo
>   JSON/XML/SOAP, audit log, modo mock. → `modules/bot/bot-http-executor.service.ts:28-49`
>   ⚠️ Está en los providers de `WapiModule` pero **NO exportado** → hay que
>   agregarlo a `exports` (AgentsModule ya importa WapiModule). → `wapi.module.ts:83,93-113`
> - Interpolación `{{var}}` / `{{= jsonata }}` reusable para volcar los args del
>   modelo en url/headers/body. → `modules/bot/interpolate.ts` (usada por el executor)
> - Encriptación at-rest AES-256-GCM disponible para secretos en headers
>   (API keys). → `common/security/encryption.service.ts:45`
> - Modelo `Agent` con `maxSteps` (tope de loop) y relación a canales/documentos.
>   → `packages/prisma/prisma/schema.prisma:770-793`
> - Ejemplo de def bien escrita (descripción con "cuándo SÍ / cuándo NO"):
>   `escalate-to-operator.tool.ts:18-35`.

---

## 1. Concepto: una tool custom = definición declarativa + acción HTTP

Dos caras de la misma entidad:

| Cara | Quién la consume | Qué contiene |
|---|---|---|
| **Definición** (lo que ve el LLM) | El modelo, vía `tools` del gateway | `name` (slug), `description` (cuándo usarla / cuándo NO), `parameters` (JSON Schema de args) |
| **Acción** (lo que ejecuta el backend) | `HttpAgentTool` → `BotHttpExecutor` | `method`, `url`, `headers`, `bodyTemplate`, `timeoutMs` — con `{{args.*}}` interpolables |

Las tools se definen **a nivel team** (una vez) y cada agente **elige cuáles
usa** (m2m), mismo patrón que canales↔agente. La descripción es el 80% del
éxito: una tool mal descrita no se invoca nunca o se invoca siempre — la UI
debe guiar (ver §5).

---

## 2. Modelo de datos

Dos tablas nuevas. El modelo Prisma se llama `AgentCustomTool` (no `AgentTool`)
para no colisionar con la interfaz TS `AgentTool` existente en
`agent-tool.types.ts`.

```prisma
enum AgentCustomToolType {
  HTTP
  // Futuro: MCP, etc.
}

model AgentCustomTool {
  id             String              @id @default(cuid())
  organizationId String
  teamId         String
  type           AgentCustomToolType @default(HTTP)

  // --- Definición (lo que ve el LLM) ---
  // Slug ^[a-z][a-z0-9_]{0,63}$, único por team. No puede pisar built-ins
  // (escalate_to_operator) — validar en el CRUD.
  name        String
  displayName String   // nombre humano para la UI
  description String   // "cuándo usarla / cuándo NO" — el routing del LLM
  parameters  Json     // JSON Schema {type:"object", properties, required}

  // --- Acción HTTP ---
  method       String  // GET|POST|PUT|PATCH|DELETE
  url          String  // soporta {{args.x}}
  headers      Json?   // [{key, value, secret: bool}] — value encriptado si secret
  bodyTemplate Json?   // shape JSON con {{args.x}} en las hojas (POST/PUT/PATCH)
  timeoutMs    Int?    // el executor clampa 100..10000

  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  team         Team         @relation(fields: [teamId], references: [id], onDelete: Cascade)
  agents       AgentCustomToolLink[]

  @@unique([teamId, name])
  @@index([organizationId])
  @@index([teamId])
}

/// m2m agente↔tool: qué agente usa qué tool.
model AgentCustomToolLink {
  agentId   String
  toolId    String
  createdAt DateTime @default(now())

  agent Agent           @relation(fields: [agentId], references: [id], onDelete: Cascade)
  tool  AgentCustomTool @relation(fields: [toolId], references: [id], onDelete: Cascade)

  @@id([agentId, toolId])
  @@index([toolId])
}
```

Notas:
- `headers` como array `{key, value, secret}` (no objeto plano): permite marcar
  por-header si el value se encripta con `AesGcmEncryptionService` (API keys).
  Se desencripta SOLO en el momento de ejecutar; el GET del CRUD devuelve los
  secretos enmascarados (`••••`), como ya se hace con credenciales de canales.
- v0 **sin** draft/publish (a diferencia del bot): editar una tool aplica
  directo. Si duele, se agrega después.

---

## 3. Backend

### 3.1 `HttpAgentTool` — el wrapper que implementa `AgentTool`

Clase **no-Injectable** (se instancia por fila, como `SmtpSender` en
`EmailSenderService`): envuelve una fila de `AgentCustomTool` y delega en
`BotHttpExecutor`.

```
execute(args, ctx):
  1. data = { args }                          // BotData para interpolateAsync
  2. headers: desencriptar values secret
  3. node = { url, method, headers, body: bodyTemplate, timeoutMs }  // shape BotHttpNode
  4. result = botHttpExecutor.execute(node, data, {
       mode: 'real', configId: `agent-tool`, nodeId: tool.id, organizationId: ctx.organizationId })
  5. content = serializar result para el modelo:
       ok    → JSON.stringify(body) truncado a TOOL_RESULT_MAX_CHARS (~8000)
       error → `La herramienta falló (<error>). Avisale al usuario que no pudiste
               consultarlo e intentá ayudarlo de otra forma.` (el executor nunca
               tira excepción: siempre {ok:false, error:'<código>'})
```

Ajustes al executor (mínimos):
- Exportar `BotHttpExecutor` desde `WapiModule` (`exports`).
- El audit log hoy registra `action: 'wapi.bot.http.executed'` con
  `configId:nodeId` — agregar una action `'agent.tool.http.executed'` o
  parametrizar la action en `ExecuteOptions` (preferible, cambio chico).

### 3.2 Registry per-agent

`AgentToolRegistry` pasa de estático a resolver por agente. Para que el loop
del runtime vea un set **consistente** durante todo el turno (defs y lookup de
la misma foto):

```ts
// agent-tool.registry.ts
async resolveForAgent(agentId): Promise<{ defs: ToolDef[]; get(name): AgentTool | undefined }> {
  // built-ins (escalate_to_operator) + AgentCustomTool linkeadas y enabled
  // → new HttpAgentTool(row, executor, encryption) por cada una
}
```

- Los built-ins siempre presentes; las custom no pueden pisar sus nombres
  (validado en el CRUD, defensa extra acá).
- v0 sin cache: un `findMany` por turno es despreciable frente a la llamada al
  LLM. Si algún día pesa, cache con TTL corto.

### 3.3 Runtime

Un solo cambio en `agent-runtime.service.ts`:

```ts
// antes (línea ~133):
const toolDefs = this.tools.defs();
// después:
const resolved = await this.tools.resolveForAgent(agent.id);
const toolDefs = resolved.defs;
// y en el loop: resolved.get(call.name) en vez de this.tools.get(call.name)
```

El resto (loop, `maxSteps`, `stop`, fallbacks de respuesta) queda igual.

### 3.4 CRUD

`AgentCustomToolsController` (`/api/agent-tools`) + service tenant-scoped
(`prisma.scoped`), mismo molde que `AgentDocumentService`:

- `GET /api/agent-tools` · `POST` · `PATCH /:id` · `DELETE /:id`
- `POST /api/agent-tools/:id/test` — ejecuta con args de prueba (ver §5)
- Asignación: `PUT /api/agents/:id/tools` con `{ toolIds: string[] }` (reemplaza
  el set completo, simple) — o checkboxes que pegan al editor del agente.

Validaciones del CRUD: slug válido y único por team, no-colisión con built-ins,
`parameters` es JSON Schema válido (objeto raíz `type: "object"`), método
permitido, URL parseable (la validación fuerte — SSRF, schemes — la hace el
executor en runtime, acá solo fail-fast de UX).

---

## 4. Seguridad

| Riesgo | Mitigación | Estado |
|---|---|---|
| SSRF / DNS rebinding / red interna | `resolveAndValidate` + IP pinning del executor | ✅ ya existe |
| Loops / costo | `Agent.maxSteps` ya corta el loop | ✅ ya existe |
| Abuso de volumen | rate limit por org del executor (token bucket) | ✅ ya existe |
| Respuestas gigantes | cap 1 MB del executor + `TOOL_RESULT_MAX_CHARS` (~8k) al serializar para el modelo | cap nuevo chico |
| API keys en headers | AES-256-GCM at-rest (`secret: true` por header), enmascarado en GET, desencripta solo al ejecutar | reusar servicio |
| **Prompt injection vía respuesta del endpoint** | la respuesta entra al contexto del LLM. Mitigación v0: truncado + RUNTIME_GUIDANCE anti-jailbreak existente. Se conecta con el roadmap de guardrails (guard de entrada Groq/Llama Guard) | parcial, roadmap |
| Tool que pisa una built-in | validación de nombre en CRUD + built-ins ganan en el registry | nuevo |

---

## 5. Frontend

Nueva sección **"Herramientas"** dentro de la plataforma agéntica
(`features/agents/`):

1. **Lista + CRUD** de tools del team (tabla: nombre, tipo, método+host,
   agentes que la usan, enabled).
2. **Form de tool**:
   - Definición: displayName, slug (auto-sugerido), descripción con guía
     explícita — *"Explicá QUÉ hace, CUÁNDO usarla y cuándo NO. El agente decide
     en base a este texto"* (mostrar `escalate_to_operator` como ejemplo).
   - **Builder de parámetros**: filas de `nombre | tipo (string/number/boolean) |
     descripción | requerido` → el front genera el JSON Schema. NO exponer JSON
     crudo de entrada (modo avanzado opcional después).
   - Acción HTTP: reusar la UX del nodo HTTP del bot designer (método, URL,
     headers con toggle "secreto", body). Placeholder hint: `{{args.sku}}`.
3. **Botón "Probar"**: form auto-generado desde los parámetros → llama
   `POST /:id/test` → muestra status, duración y body (o el código de error del
   executor). Clave para que el usuario no descubra en producción que su
   endpoint devuelve otra cosa.
4. **En el editor del agente**: sección "Herramientas" con checkboxes de las
   tools del team (misma UX que la asignación de canales). `escalate_to_operator`
   visible pero fija (built-in, no desactivable en v0).

Naming UI: "Herramientas" (consistente con reservar "Agentes" para IA;
"Tools" solo en código).

---

## 6. Plan por slices

### Slice 1 — núcleo backend (sin UI)
- [x] Migración: `AgentCustomTool` + `AgentCustomToolLink` (+ enum) — `20260610190000_agent_custom_tools` (manual, shadow-db/pgvector)
- [x] Exportar `BotHttpExecutor` de `WapiModule` + action de audit parametrizable (`auditAction`/`auditResourceType` en `ExecuteOptions`)
- [x] `HttpAgentTool` (wrapper + interpolación de args + truncado + headers secret) — `tools/http-agent-tool.ts`
- [x] `AgentToolRegistry.resolveForAgent()` + cambio en el runtime (foto consistente por turno)
- [x] CRUD `/api/agent-tools` + `GET/PUT /api/agents/:id/tools` + validaciones (slug, built-ins, JSON Schema raíz, URL con placeholders, mask `••••` conserva secreto en updates; sin `includeBody` en el audit del create — traería secretos en plano)
- [x] Specs: wrapper (mock executor), registry per-agent, validaciones CRUD (14 tests nuevos)
- [ ] Smoke real: tool contra un endpoint público + conversación por webchat dev

### Slice 2 — UI
- [x] `features/agents/tools/`: lista + form (builder de parámetros + acción HTTP) — `ToolsPage.tsx`, sección "Herramientas" (`/dashboard/agents/tools`) bajo el grupo Agentes
- [x] Checkboxes en el editor del agente (`ToolsSection` en `AgentsPage`, instant-save vía `PUT /api/agents/:id/tools`; built-in `escalate_to_operator` fija)
- [x] Enmascarado de headers secretos (toggle "secreto" + reveal; al enfocar un `••••` se limpia para reingresar, si no se toca el backend conserva el secreto)

### Slice 3 — operación
- [ ] Botón "Probar" (endpoint `/test` + form de args)
- [ ] Telemetría: log estructurado por invocación (tool, conv, status, durationMs)
- [ ] (opcional) transform de respuesta con JSONata para achicar lo que ve el LLM

### Futuro (fuera de alcance v0)
- Tipos de tool no-HTTP (MCP es el candidato para integraciones de terceros)
- Draft/publish de tools · cache del registry · `escalate_to_operator` desactivable
- Guard de entrada (Llama Guard) sobre resultados de tools — ver roadmap guardrails

---

## 7. Decisiones abiertas

- **Scope de la tool**: team (propuesto, igual que `Agent`) vs org. Si aparece
  el caso "compartir tools entre teams", se sube después.
- **`bodyTemplate` como JSON con `{{args.*}}` en hojas** vs editor de texto
  crudo. Propuesto: JSON (reusa `interpolateBodyLeaves` del executor).
- **Resultado para el modelo**: ¿body completo truncado (v0) o exigir transform
  JSONata? Propuesto: truncado v0, JSONata opcional en slice 3.

---

## 8. Bitácora

> Actualizar al cerrar cada sesión de trabajo sobre este milestone.

- **2026-06-09** — Diseño escrito y consensuado. Contexto previo del mismo día:
  embeddings del RAG ahora pluggables (`EMBEDDING_PROVIDER`, commit `33299f7`).
  Próximo paso: Slice 1.
- **2026-06-10** — Slice 1 COMPLETO salvo el smoke real (queda como apertura de
  la próxima sesión). Todo según diseño, sin desvíos. Suite completa verde
  (77 suites / 845 tests; los nuevos: http-agent-tool, registry per-agent,
  validaciones CRUD). Detalles de implementación que el diseño no fijaba:
  el runtime guarda `resolvedTools` por turno; el Link m2m NO está en
  `TENANT_SCOPED_MODELS` (sin org/team propio — pertenencia validada vía
  tool/agent scoped antes de escribir con el cliente raíz); error de tool al
  modelo sin `stop` (el loop sigue y el modelo redacta el aviso).
  Próximo paso: smoke real (endpoint público + webchat dev) → Slice 2 (UI).
- **2026-06-10 (cont.)** — Slice 2 (UI) COMPLETO. Nueva sección **"Herramientas"**
  (`/dashboard/agents/tools`, sub-ítem del grupo Agentes, gated por `permissions.hasAi`):
  lista con enabled/host/método/#agentes + form con **builder de parámetros**
  (filas nombre/tipo/descripción/obligatorio → JSON Schema vía `rowsToSchema`/
  `schemaToRows`) y **acción HTTP** (método, URL con hint `{{args.x}}`, headers
  con toggle secreto + reveal, body JSON validado en vivo solo en POST/PUT/PATCH,
  timeout). En el **editor del agente**: `ToolsSection` con checkboxes (instant-save,
  built-in escalate fija). Detalles no fijados por el diseño: se agregó `put<T>`
  al `ApiClient` (faltaba); auto-sugerencia de slug desde el displayName hasta que
  el usuario lo edita; `end` exacto en el NavLink de `/dashboard/agents` para que
  no quede activo en la subruta. tsc + eslint limpios (el front no tiene unit
  tests). Pendientes: **smoke real** (sigue abierto) y **Slice 3** (botón "Probar"
  → falta el endpoint `POST /api/agent-tools/:id/test` + telemetría por invocación).
