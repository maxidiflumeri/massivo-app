import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import { brand } from '../../../brand';
import { agentToolsApi } from './api';
import {
  AGENT_TOOL_METHODS,
  AGENT_TOOL_NAME_RE,
  METHODS_WITH_BODY,
  PARAM_TYPES,
  SECRET_MASK,
  rowsToSchema,
  schemaToRows,
  type AgentTool,
  type AgentToolHeader,
  type AgentToolPayload,
  type ParamRow,
} from './types';

/** Descripción de ejemplo (estilo escalate_to_operator) que guía al usuario. */
const DESCRIPTION_HINT =
  'Explicá QUÉ hace, CUÁNDO usarla y cuándo NO. El agente decide si invocarla a partir de este texto. ' +
  'Ej: "Consulta el stock disponible de un producto por su SKU. Usala cuando el cliente pregunte por ' +
  'disponibilidad o cantidad. NO la uses para precios."';

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/\{\{[^}]*\}\}/g, 'x')).host;
  } catch {
    return url;
  }
}

export function ToolsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();

  const [tools, setTools] = useState<AgentTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AgentTool | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTools(await agentToolsApi.list(api));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudieron cargar las herramientas');
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleEnabled = async (tool: AgentTool, enabled: boolean) => {
    setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, enabled } : t)));
    try {
      await agentToolsApi.update(api, tool.id, { enabled });
    } catch (err) {
      setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, enabled: !enabled } : t)));
      notify.error(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  };

  const handleDelete = async (tool: AgentTool) => {
    const usedBy = tool.agentIds.length;
    const ok = await confirm({
      title: 'Eliminar herramienta',
      message:
        `¿Eliminar "${tool.displayName}"?` +
        (usedBy > 0 ? ` La usan ${usedBy} agente(s) y dejará de estar disponible para ellos.` : ''),
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await agentToolsApi.remove(api, tool.id);
      await reload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BuildIcon sx={{ color: brand.colors.primary }} /> Herramientas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Acciones HTTP que tus agentes pueden invocar (consultar stock, crear un ticket, etc.). Definís
            qué hace y el agente decide cuándo usarla.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
          Crear herramienta
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : tools.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Todavía no tenés herramientas. Creá una (por ejemplo una consulta GET a tu API) y después
          habilitala en el agente desde su editor.
        </Alert>
      ) : (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {tools.map((tool) => (
            <Paper key={tool.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} noWrap>
                    {tool.displayName}
                  </Typography>
                  <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Chip size="small" label={tool.name} sx={{ fontFamily: 'monospace' }} />
                    <Chip size="small" variant="outlined" label={`${tool.method} ${hostOf(tool.url)}`} />
                    {tool.agentIds.length > 0 ? (
                      <Chip size="small" variant="outlined" label={`${tool.agentIds.length} agente(s)`} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        sin agentes
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <FormControlLabel
                  control={<Switch checked={tool.enabled} onChange={(e) => void toggleEnabled(tool, e.target.checked)} />}
                  label={tool.enabled ? 'Activa' : 'Inactiva'}
                />
                <Tooltip title="Editar">
                  <IconButton onClick={() => setEditing(tool)}>
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar">
                  <IconButton onClick={() => void handleDelete(tool)}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {(creating || editing) && (
        <ToolFormDialog
          tool={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------

interface FormState {
  displayName: string;
  name: string;
  nameTouched: boolean;
  description: string;
  params: ParamRow[];
  method: string;
  url: string;
  headers: AgentToolHeader[];
  bodyText: string;
  timeoutMs: string;
  enabled: boolean;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+/g, '_')
    .replace(/_+$/, '')
    .slice(0, 64);
}

function initialForm(tool: AgentTool | null): FormState {
  if (!tool) {
    return {
      displayName: '',
      name: '',
      nameTouched: false,
      description: '',
      params: [],
      method: 'GET',
      url: '',
      headers: [],
      bodyText: '',
      timeoutMs: '',
      enabled: true,
    };
  }
  return {
    displayName: tool.displayName,
    name: tool.name,
    nameTouched: true,
    description: tool.description,
    params: schemaToRows(tool.parameters),
    method: tool.method,
    url: tool.url,
    headers: tool.headers.map((h) => ({ ...h })),
    bodyText: tool.bodyTemplate != null ? JSON.stringify(tool.bodyTemplate, null, 2) : '',
    timeoutMs: tool.timeoutMs != null ? String(tool.timeoutMs) : '',
    enabled: tool.enabled,
  };
}

function ToolFormDialog({
  tool,
  onClose,
  onSaved,
}: {
  tool: AgentTool | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const notify = useNotify();
  const [form, setForm] = useState<FormState>(() => initialForm(tool));
  const [saving, setSaving] = useState(false);
  const isEdit = tool != null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onDisplayNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      displayName: value,
      // Auto-sugerir el slug hasta que el usuario lo edite a mano.
      name: f.nameTouched ? f.name : slugify(value),
    }));
  };

  const nameValid = AGENT_TOOL_NAME_RE.test(form.name);
  const hasBody = METHODS_WITH_BODY.has(form.method);

  // Validación del body JSON en vivo (solo si el método lleva body y hay texto).
  const bodyError = useMemo(() => {
    if (!hasBody || !form.bodyText.trim()) return null;
    try {
      JSON.parse(form.bodyText);
      return null;
    } catch {
      return 'JSON inválido';
    }
  }, [hasBody, form.bodyText]);

  const canSave =
    form.displayName.trim().length > 0 &&
    nameValid &&
    form.description.trim().length > 0 &&
    form.url.trim().length > 0 &&
    !bodyError &&
    !saving;

  const handleSave = async () => {
    // Validaciones de UX antes de pegarle al backend.
    const namedParams = form.params.filter((p) => p.name.trim());
    if (namedParams.some((p) => !AGENT_TOOL_NAME_RE.test(p.name.trim()))) {
      notify.error('Los nombres de parámetros deben ser snake_case (empezar con letra)');
      return;
    }
    let bodyTemplate: unknown;
    if (hasBody && form.bodyText.trim()) {
      try {
        bodyTemplate = JSON.parse(form.bodyText);
      } catch {
        notify.error('El body no es JSON válido');
        return;
      }
    }
    let timeoutMs: number | null | undefined;
    if (form.timeoutMs.trim()) {
      const n = Number(form.timeoutMs);
      if (!Number.isInteger(n) || n < 100 || n > 10000) {
        notify.error('El timeout debe ser un entero entre 100 y 10000 ms');
        return;
      }
      timeoutMs = n;
    }

    const headers = form.headers
      .filter((h) => h.key.trim())
      .map((h) => ({ key: h.key.trim(), value: h.value, secret: h.secret }));

    const payload: AgentToolPayload = {
      name: form.name.trim(),
      displayName: form.displayName.trim(),
      description: form.description.trim(),
      parameters: rowsToSchema(namedParams),
      method: form.method,
      url: form.url.trim(),
      headers,
      bodyTemplate: hasBody ? (bodyTemplate ?? null) : null,
      timeoutMs: timeoutMs ?? null,
      enabled: form.enabled,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await agentToolsApi.update(api, tool.id, payload);
        notify.success('Herramienta guardada');
      } else {
        await agentToolsApi.create(api, payload);
        notify.success('Herramienta creada');
      }
      onSaved();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Editar herramienta' : 'Crear herramienta'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {/* --- Definición (lo que ve el LLM) --- */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Definición
            </Typography>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Nombre visible"
                  value={form.displayName}
                  onChange={(e) => onDisplayNameChange(e.target.value)}
                  fullWidth
                  sx={{ flex: 1.3 }}
                />
                <TextField
                  label="Nombre técnico (slug)"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, nameTouched: true }))}
                  fullWidth
                  sx={{ flex: 1 }}
                  error={form.name.length > 0 && !nameValid}
                  helperText={
                    form.name.length > 0 && !nameValid
                      ? 'snake_case: empieza con letra, [a-z0-9_]'
                      : 'Lo ve el modelo. No se puede repetir.'
                  }
                  InputProps={{ sx: { fontFamily: 'monospace' } }}
                />
              </Stack>
              <TextField
                label="Descripción (cuándo usarla / cuándo NO)"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder={DESCRIPTION_HINT}
                multiline
                minRows={3}
                fullWidth
                helperText="Es lo más importante: el agente rutea según este texto."
              />
            </Stack>
          </Box>

          <Divider />

          {/* --- Parámetros (builder → JSON Schema) --- */}
          <ParamBuilder rows={form.params} onChange={(params) => set('params', params)} />

          <Divider />

          {/* --- Acción HTTP --- */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Acción HTTP
            </Typography>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl sx={{ width: { sm: 140 }, flexShrink: 0 }}>
                  <InputLabel id="tool-method-label">Método</InputLabel>
                  <Select
                    labelId="tool-method-label"
                    label="Método"
                    value={form.method}
                    onChange={(e) => set('method', e.target.value)}
                  >
                    {AGENT_TOOL_METHODS.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="URL"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://api.tudominio.com/stock/{{args.sku}}"
                  fullWidth
                  helperText="Usá {{args.nombre}} para interpolar los parámetros."
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: 14 } }}
                />
              </Stack>

              <HeadersEditor headers={form.headers} onChange={(headers) => set('headers', headers)} />

              {hasBody && (
                <TextField
                  label="Body (JSON)"
                  value={form.bodyText}
                  onChange={(e) => set('bodyText', e.target.value)}
                  placeholder={'{\n  "sku": "{{args.sku}}",\n  "cantidad": "{{args.cantidad}}"\n}'}
                  multiline
                  minRows={4}
                  fullWidth
                  error={!!bodyError}
                  helperText={bodyError ?? 'JSON con {{args.x}} en los valores. Opcional.'}
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: 14 } }}
                />
              )}

              <TextField
                label="Timeout (ms)"
                type="number"
                value={form.timeoutMs}
                onChange={(e) => set('timeoutMs', e.target.value)}
                placeholder="por defecto"
                inputProps={{ min: 100, max: 10000 }}
                sx={{ width: 220 }}
                helperText="Entre 100 y 10000. Vacío = por defecto."
              />
            </Stack>
          </Box>

          <Divider />

          <FormControlLabel
            control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />}
            label="Activa (disponible para los agentes que la usen)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={!canSave}>
          {isEdit ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ParamBuilder({ rows, onChange }: { rows: ParamRow[]; onChange: (rows: ParamRow[]) => void }) {
  const update = (i: number, patch: Partial<ParamRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { name: '', type: 'string', description: '', required: false }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Parámetros
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Los argumentos que el agente completa al invocar la herramienta. Una buena descripción ayuda al
        modelo a elegir el valor correcto.
      </Typography>
      <Stack spacing={1}>
        {rows.map((row, i) => (
          <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField
              size="small"
              label="nombre"
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              sx={{ width: { sm: 160 }, flexShrink: 0 }}
              InputProps={{ sx: { fontFamily: 'monospace' } }}
            />
            <FormControl size="small" sx={{ width: { sm: 130 }, flexShrink: 0 }}>
              <InputLabel id={`ptype-${i}`}>tipo</InputLabel>
              <Select
                labelId={`ptype-${i}`}
                label="tipo"
                value={row.type}
                onChange={(e) => update(i, { type: e.target.value as ParamRow['type'] })}
              >
                {PARAM_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="descripción"
              value={row.description}
              onChange={(e) => update(i, { description: e.target.value })}
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={row.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
              }
              label="oblig."
              sx={{ flexShrink: 0, mr: 0 }}
            />
            <IconButton size="small" onClick={() => remove(i)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} onClick={add} sx={{ mt: 1 }}>
        Agregar parámetro
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------

function HeadersEditor({
  headers,
  onChange,
}: {
  headers: AgentToolHeader[];
  onChange: (headers: AgentToolHeader[]) => void;
}) {
  // Para secretos: enmascarados llegan como ••••; al enfocarlos los limpiamos
  // para que el usuario escriba el valor nuevo (si no toca, se conserva).
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const update = (i: number, patch: Partial<AgentToolHeader>) =>
    onChange(headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  const add = () => onChange([...headers, { key: '', value: '', secret: false }]);
  const remove = (i: number) => onChange(headers.filter((_, idx) => idx !== i));

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Headers (opcional). Marcá <strong>secreto</strong> para API keys: se guardan encriptadas y nunca
        se devuelven en claro.
      </Typography>
      <Stack spacing={1}>
        {headers.map((h, i) => {
          const isMasked = h.secret && h.value === SECRET_MASK;
          return (
            <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                size="small"
                label="header"
                value={h.key}
                onChange={(e) => update(i, { key: e.target.value })}
                sx={{ width: { sm: 200 }, flexShrink: 0 }}
                InputProps={{ sx: { fontFamily: 'monospace' } }}
              />
              <TextField
                size="small"
                label="valor"
                value={h.value}
                type={h.secret && !reveal[i] ? 'password' : 'text'}
                onChange={(e) => update(i, { value: e.target.value })}
                onFocus={() => {
                  if (isMasked) update(i, { value: '' });
                }}
                fullWidth
                InputProps={{
                  endAdornment: h.secret ? (
                    <IconButton
                      size="small"
                      edge="end"
                      onClick={() => setReveal((r) => ({ ...r, [i]: !r[i] }))}
                    >
                      {reveal[i] ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  ) : undefined,
                }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={h.secret}
                    onChange={(e) => update(i, { secret: e.target.checked })}
                  />
                }
                label="secreto"
                sx={{ flexShrink: 0, mr: 0 }}
              />
              <IconButton size="small" onClick={() => remove(i)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} onClick={add} sx={{ mt: 1 }}>
        Agregar header
      </Button>
    </Box>
  );
}
