import { useCallback, useEffect, useState } from 'react';
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
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HubIcon from '@mui/icons-material/Hub';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useConfirm } from '../../feedback/ConfirmProvider';
import { agentsApi } from './api';
import { AGENT_MODEL_PRESETS, type Agent, type AgentDocument } from './types';
import { brand } from '../../brand';

export function AgentsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAgents(await agentsApi.list(api));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudieron cargar los agentes');
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const agent = await agentsApi.create(api, createName.trim());
      setCreateName('');
      setCreateOpen(false);
      await reload();
      setEditing(agent); // abrir el editor recién creado
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo crear el agente');
    } finally {
      setCreating(false);
    }
  };

  const toggleEnabled = async (agent: Agent, enabled: boolean) => {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, enabled } : a)));
    try {
      await agentsApi.update(api, agent.id, { enabled });
    } catch (err) {
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, enabled: !enabled } : a)));
      notify.error(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  };

  const handleDelete = async (agent: Agent) => {
    const ok = await confirm({
      title: 'Eliminar agente',
      message: `¿Eliminar "${agent.name}"? Los canales conectados quedarán sin agente.`,
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await agentsApi.remove(api, agent.id);
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
            <AutoAwesomeIcon sx={{ color: brand.colors.primary }} /> Agentes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Agentes de IA que atienden conversaciones con un modelo, tools y tu conocimiento (RAG).
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Crear agente
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : agents.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Todavía no tenés agentes. Creá uno y conectalo a un canal (Webchat es el más fácil para probar).
        </Alert>
      ) : (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {agents.map((agent) => (
            <Paper key={agent.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} noWrap>
                    {agent.name}
                  </Typography>
                  <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Chip size="small" label={agent.model} />
                    {(agent.channels ?? []).map((c) => (
                      <Chip key={c.id} size="small" variant="outlined" icon={<HubIcon />} label={c.name || c.kind} />
                    ))}
                    {(agent.channels ?? []).length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        sin canales conectados
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <FormControlLabel
                  control={<Switch checked={agent.enabled} onChange={(e) => void toggleEnabled(agent, e.target.checked)} />}
                  label={agent.enabled ? 'Activo' : 'Inactivo'}
                />
                <Tooltip title="Editar">
                  <IconButton onClick={() => setEditing(agent)}>
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar">
                  <IconButton onClick={() => void handleDelete(agent)}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Crear */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Crear agente</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nombre"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleCreate()} disabled={creating || !createName.trim()}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      {/* Editar */}
      {editing && (
        <EditAgentDialog
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Box>
  );
}

function EditAgentDialog({
  agent,
  onClose,
  onSaved,
}: {
  agent: Agent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const notify = useNotify();

  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? '');
  const [temperature, setTemperature] = useState(agent.temperature);
  const [maxSteps, setMaxSteps] = useState(agent.maxSteps);
  const [saving, setSaving] = useState(false);

  const modelOptions = AGENT_MODEL_PRESETS.some((m) => m.value === model)
    ? AGENT_MODEL_PRESETS
    : [{ value: model, label: model }, ...AGENT_MODEL_PRESETS];

  const connected = agent.channels ?? [];

  const handleSave = async () => {
    setSaving(true);
    try {
      await agentsApi.update(api, agent.id, {
        name: name.trim(),
        model,
        systemPrompt,
        temperature,
        maxSteps,
      });
      notify.success('Agente guardado');
      onSaved();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Editar agente</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} fullWidth />

          <FormControl fullWidth>
            <InputLabel id="agent-model-label">Modelo</InputLabel>
            <Select
              labelId="agent-model-label"
              label="Modelo"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {modelOptions.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Instrucciones (system prompt)"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Sos el asistente de Massivo. Respondé cordial y conciso. Si no sabés algo, derivá a un operador."
            multiline
            minRows={5}
            fullWidth
          />

          <Box>
            <Typography variant="caption" color="text.secondary">
              Creatividad (temperature): {temperature.toFixed(1)}
            </Typography>
            <Slider
              value={temperature}
              onChange={(_, v) => setTemperature(v as number)}
              min={0}
              max={2}
              step={0.1}
              valueLabelDisplay="auto"
            />
          </Box>

          <TextField
            label="Máx. pasos de tools por turno"
            type="number"
            value={maxSteps}
            onChange={(e) => setMaxSteps(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            inputProps={{ min: 1, max: 20 }}
            sx={{ width: 240 }}
          />

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Canales conectados
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              La asignación se gestiona desde <strong>Canales</strong>: a cada canal le elegís un bot o un agente.
            </Typography>
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {connected.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Este agente no está asignado a ningún canal todavía.
                </Typography>
              ) : (
                connected.map((c) => <Chip key={c.id} icon={<HubIcon />} label={c.name || c.kind} />)
              )}
            </Stack>
          </Box>

          <Divider />

          <KnowledgeSection agentId={agent.id} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function docStatusChip(status: string): { label: string; color: 'default' | 'success' | 'warning' | 'error' } {
  switch (status) {
    case 'READY':
      return { label: 'Listo', color: 'success' };
    case 'PROCESSING':
      return { label: 'Procesando', color: 'warning' };
    case 'FAILED':
      return { label: 'Error', color: 'error' };
    default:
      return { label: 'Pendiente', color: 'default' };
  }
}

/** Base de conocimiento (RAG) del agente: subir textos/archivos que se vectorizan. */
function KnowledgeSection({ agentId }: { agentId: string }) {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();

  const [docs, setDocs] = useState<AgentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [docName, setDocName] = useState('');
  const [docText, setDocText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await agentsApi.documents.list(api, agentId));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudieron cargar los documentos');
    } finally {
      setLoading(false);
    }
  }, [api, agentId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterAdd = (doc: AgentDocument) => {
    if (doc.status === 'FAILED') {
      notify.error(`No se pudo vectorizar: ${doc.error ?? 'error desconocido'}`);
    } else {
      notify.success(`"${doc.name}" agregado (${doc.chunkCount} fragmentos)`);
    }
  };

  const handleAddText = async () => {
    if (!docText.trim()) return;
    setBusy(true);
    try {
      const doc = await agentsApi.documents.addText(api, agentId, docName.trim() || 'Texto', docText.trim());
      setDocName('');
      setDocText('');
      afterAdd(doc);
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo agregar el texto');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const doc = await agentsApi.documents.upload(api, agentId, file);
      afterAdd(doc);
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo subir el archivo');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (doc: AgentDocument) => {
    const ok = await confirm({
      title: 'Eliminar documento',
      message: `¿Eliminar "${doc.name}" de la base de conocimiento?`,
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await agentsApi.documents.remove(api, agentId, doc.id);
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Base de conocimiento (RAG)
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Subí textos o archivos (txt, md, csv, json). Se vectorizan y el agente los usa para responder.
      </Typography>

      <Stack spacing={1} sx={{ mt: 1.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : docs.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            Todavía no hay documentos.
          </Typography>
        ) : (
          docs.map((d) => {
            const s = docStatusChip(d.status);
            return (
              <Stack
                key={d.id}
                direction="row"
                alignItems="center"
                gap={1}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5 }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap>
                    {d.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {d.source === 'FILE' ? 'Archivo' : 'Texto'} · {d.chunkCount} fragmentos
                    {d.error ? ` · ${d.error}` : ''}
                  </Typography>
                </Box>
                <Chip size="small" color={s.color} label={s.label} />
                <IconButton size="small" onClick={() => void handleRemove(d)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })
        )}
      </Stack>

      <Stack spacing={1} sx={{ mt: 1.5 }}>
        <TextField
          size="small"
          label="Título (opcional)"
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          fullWidth
        />
        <TextField
          size="small"
          label="Pegá texto para que el agente aprenda…"
          value={docText}
          onChange={(e) => setDocText(e.target.value)}
          multiline
          minRows={3}
          fullWidth
        />
        <Stack direction="row" gap={1} alignItems="center">
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={busy || !docText.trim()}
            onClick={() => void handleAddText()}
          >
            Agregar texto
          </Button>
          <Button size="small" variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={busy}>
            Subir archivo
            <input
              hidden
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.log,.html,.htm,.xml,.yaml,.yml,text/*,application/json"
              onChange={(e) => {
                void handleUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </Button>
          {busy && <CircularProgress size={22} />}
        </Stack>
      </Stack>
    </Box>
  );
}
