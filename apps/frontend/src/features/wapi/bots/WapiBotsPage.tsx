import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  applyNodeChanges,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import { useColorMode } from '../../../theme/ThemeProvider';
import type { WapiConfigListItem } from '../configs/types';
import { botApi } from './api';
import type {
  BotConfigSnapshot,
  BotFlow,
  BotMenuNode,
  BotMessageNode,
  BotNode,
  BotNodeKind,
} from './types';
import { autoLayout } from './flowLayout';
import { nodeTypes } from './nodeViews';
import { NodeEditorDrawer } from './NodeEditorDrawer';
import { validateClient } from './validateClient';

const EMPTY_FLOW: BotFlow = {
  startNodeId: 'start',
  nodes: {
    start: {
      kind: 'MENU',
      text: 'Hola, ¿en qué te ayudamos?',
      options: [{ id: 'humano', label: 'Hablar con humano', nextNodeId: 'handoff' }],
    },
    handoff: { kind: 'HANDOFF', text: 'Te derivamos con un agente.', escalate: true },
  },
};

function nextId(prefix: string, taken: Set<string>): string {
  for (let i = 1; i < 10000; i++) {
    const c = `${prefix}${i}`;
    if (!taken.has(c)) return c;
  }
  return `${prefix}${Date.now()}`;
}

function defaultNodeFor(kind: BotNodeKind): BotNode {
  if (kind === 'MENU') return { kind: 'MENU', text: 'Nuevo menú', options: [] };
  if (kind === 'MESSAGE') return { kind: 'MESSAGE', text: 'Nuevo mensaje' };
  return { kind: 'HANDOFF', text: 'Te derivamos.', escalate: true };
}

export function WapiBotsPage() {
  return (
    <ReactFlowProvider>
      <BotsEditorInner />
    </ReactFlowProvider>
  );
}

function BotsEditorInner() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const [configs, setConfigs] = useState<WapiConfigListItem[] | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [snapshot, setSnapshot] = useState<BotConfigSnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [ttl, setTtl] = useState(30);
  const [flow, setFlow] = useState<BotFlow>(EMPTY_FLOW);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reactFlow = useReactFlow();
  const { mode } = useColorMode();
  // Evita aplicar auto-layout repetidamente al recargar.
  const layoutAppliedFor = useRef<string | null>(null);

  // Cargar lista de configs.
  useEffect(() => {
    void (async () => {
      try {
        const list = await api.get<WapiConfigListItem[]>('/api/wapi/configs');
        setConfigs(list);
        if (list.length > 0) setSelectedConfigId(list[0].id);
      } catch (e) {
        notify.error((e as Error).message || 'No se pudo cargar la lista de números');
        setConfigs([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar snapshot del bot al cambiar de config.
  useEffect(() => {
    if (!selectedConfigId) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const snap = await botApi.get(api, selectedConfigId);
        setSnapshot(snap);
        setEnabled(snap.botEnabled);
        setTtl(snap.botSessionTtlMin);
        const incoming = snap.botFlow ?? structuredClone(EMPTY_FLOW);
        const hasAnyPosition = Object.values(incoming.nodes).some((n) => n.position);
        const initial = hasAnyPosition ? incoming : autoLayout(incoming);
        setFlow(initial);
        layoutAppliedFor.current = selectedConfigId;
        setSelectedNodeId(null);
        setDrawerOpen(false);
        // Centrar la vista tras el render.
        requestAnimationFrame(() => {
          try {
            reactFlow.fitView({ padding: 0.2 });
          } catch {
            /* ignore */
          }
        });
      } catch (e) {
        notify.error((e as Error).message || 'No se pudo cargar el bot');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId]);

  // Derivar nodes/edges para react-flow desde el flow.
  const rfNodes: Node[] = useMemo(() => {
    return Object.entries(flow.nodes).map(([id, node]) => ({
      id,
      type: node.kind.toLowerCase(),
      position: node.position ?? { x: 0, y: 0 },
      data: { id, node, isStart: id === flow.startNodeId },
      selected: id === selectedNodeId,
    }));
  }, [flow, selectedNodeId]);

  const rfEdges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    for (const [id, node] of Object.entries(flow.nodes)) {
      if (node.kind === 'MENU') {
        node.options.forEach((opt) => {
          if (opt.nextNodeId && flow.nodes[opt.nextNodeId]) {
            out.push({
              id: `${id}__op-${opt.id}__${opt.nextNodeId}`,
              source: id,
              sourceHandle: `op-${opt.id}`,
              target: opt.nextNodeId,
              label: opt.label,
              animated: false,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: '#5B5BD6' },
              labelStyle: { fontSize: 11 },
            });
          }
        });
      } else if (node.kind === 'MESSAGE' && node.nextNodeId && flow.nodes[node.nextNodeId]) {
        out.push({
          id: `${id}__next__${node.nextNodeId}`,
          source: id,
          sourceHandle: 'next',
          target: node.nextNodeId,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#0288d1' },
        });
      }
    }
    return out;
  }, [flow]);

  const validation = useMemo(() => validateClient(flow), [flow]);

  // Cambios de nodos (drag, select).
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, rfNodes);
      // Persistir nuevas posiciones al flow.
      setFlow((f) => {
        let mutated = false;
        const nextNodes = { ...f.nodes };
        for (const n of updated) {
          const existing = nextNodes[n.id];
          if (!existing) continue;
          const { x, y } = n.position;
          const cur = existing.position;
          if (!cur || cur.x !== x || cur.y !== y) {
            nextNodes[n.id] = { ...existing, position: { x, y } };
            mutated = true;
          }
        }
        if (!mutated) return f;
        return { ...f, nodes: nextNodes };
      });
      // Selección
      for (const ch of changes) {
        if (ch.type === 'select') {
          if (ch.selected) setSelectedNodeId(ch.id);
        }
      }
    },
    [rfNodes],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // Solo actuamos sobre 'remove' — el resto (select) se ignora.
    const removes = changes.filter((c) => c.type === 'remove') as Array<{ type: 'remove'; id: string }>;
    if (removes.length === 0) return;
    const removedIds = new Set(removes.map((r) => r.id));
    setFlow((f) => disconnectEdges(f, removedIds));
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    setFlow((f) => applyConnection(f, conn));
  }, []);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setDrawerOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setDrawerOpen(false);
  }, []);

  function patchSelectedNode(patch: Partial<BotNode>) {
    if (!selectedNodeId) return;
    setFlow((f) => {
      const cur = f.nodes[selectedNodeId];
      if (!cur) return f;
      return {
        ...f,
        nodes: { ...f.nodes, [selectedNodeId]: { ...cur, ...patch } as BotNode },
      };
    });
  }

  async function deleteSelectedNode() {
    if (!selectedNodeId) return;
    if (selectedNodeId === flow.startNodeId) {
      notify.error('No se puede eliminar el nodo inicial. Marcá otro como inicial primero.');
      return;
    }
    const ok = await confirm({
      title: 'Eliminar nodo',
      message: `¿Eliminar "${selectedNodeId}"? Las referencias a este nodo quedarán inválidas.`,
      destructive: true,
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    setFlow((f) => {
      const rest = { ...f.nodes };
      delete rest[selectedNodeId];
      // Limpiar referencias.
      const cleaned: BotFlow['nodes'] = {};
      for (const [id, node] of Object.entries(rest)) {
        if (node.kind === 'MENU') {
          cleaned[id] = {
            ...node,
            options: node.options.map((o) =>
              o.nextNodeId === selectedNodeId ? { ...o, nextNodeId: '' } : o,
            ),
          } as BotMenuNode;
        } else if (node.kind === 'MESSAGE' && node.nextNodeId === selectedNodeId) {
          cleaned[id] = { ...node, nextNodeId: undefined } as BotMessageNode;
        } else {
          cleaned[id] = node;
        }
      }
      return { ...f, nodes: cleaned };
    });
    setSelectedNodeId(null);
    setDrawerOpen(false);
  }

  function setSelectedAsStart() {
    if (!selectedNodeId) return;
    setFlow((f) => ({ ...f, startNodeId: selectedNodeId }));
  }

  function addNode(kind: BotNodeKind) {
    setFlow((f) => {
      const taken = new Set(Object.keys(f.nodes));
      const id = nextId(kind === 'MENU' ? 'menu' : kind === 'MESSAGE' ? 'msg' : 'handoff', taken);
      const node = defaultNodeFor(kind);
      // Posicionar aproximadamente en el centro del viewport.
      const center = (() => {
        try {
          return reactFlow.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
        } catch {
          return { x: 0, y: 0 };
        }
      })();
      node.position = { x: center.x - 120, y: center.y - 60 };
      return { ...f, nodes: { ...f.nodes, [id]: node } };
    });
  }

  function applyAutoLayout() {
    setFlow((f) => autoLayout(f));
    requestAnimationFrame(() => {
      try {
        reactFlow.fitView({ padding: 0.2, duration: 300 });
      } catch {
        /* ignore */
      }
    });
  }

  async function handleSave() {
    if (!selectedConfigId) return;
    if (enabled && !validation.ok) {
      notify.error('No se puede habilitar con flow inválido. Revisá los errores.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const snap = await botApi.update(api, selectedConfigId, {
        botEnabled: enabled,
        botSessionTtlMin: ttl,
        botFlow: flow,
      });
      setSnapshot(snap);
      notify.success('Bot guardado');
    } catch (e) {
      const msg = (e as Error).message || 'No se pudo guardar';
      setError(msg);
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <Paper
        sx={{
          p: 1.5,
          mb: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.25,
          alignItems: 'center',
        }}
        variant="outlined"
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <SmartToyIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Bot guiado
          </Typography>
        </Stack>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="bot-config-label">Número</InputLabel>
          <Select
            labelId="bot-config-label"
            label="Número"
            value={selectedConfigId}
            onChange={(e) => setSelectedConfigId(e.target.value)}
            disabled={configs === null}
          >
            {configs?.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name ?? c.phoneNumberId}
                {c.isTestMode && (
                  <Chip size="small" label="TEST" sx={{ ml: 1 }} color="warning" />
                )}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={loading || !selectedConfigId}
            />
          }
          label={enabled ? 'ON' : 'OFF'}
        />
        <TextField
          label="TTL (min)"
          type="number"
          size="small"
          value={ttl}
          onChange={(e) => setTtl(Math.max(1, Math.min(1440, Number(e.target.value) || 0)))}
          inputProps={{ min: 1, max: 1440 }}
          sx={{ width: 110 }}
          disabled={loading || !selectedConfigId}
        />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Agregar MENU (con botones)">
          <Button size="small" startIcon={<SmartToyIcon />} onClick={() => addNode('MENU')} variant="outlined">
            MENU
          </Button>
        </Tooltip>
        <Tooltip title="Agregar MESSAGE (texto sin botones)">
          <Button
            size="small"
            startIcon={<ChatBubbleOutlineIcon />}
            onClick={() => addNode('MESSAGE')}
            variant="outlined"
            color="info"
          >
            MESSAGE
          </Button>
        </Tooltip>
        <Tooltip title="Agregar HANDOFF (derivar a operador)">
          <Button
            size="small"
            startIcon={<HeadsetMicIcon />}
            onClick={() => addNode('HANDOFF')}
            variant="outlined"
            color="secondary"
          >
            HANDOFF
          </Button>
        </Tooltip>
        <Tooltip title="Reorganizar nodos automáticamente">
          <span>
            <IconButton size="small" onClick={applyAutoLayout} disabled={loading}>
              <AutoFixHighIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          size="small"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || loading || !selectedConfigId}
        >
          Guardar
        </Button>
      </Paper>

      {/* Errores y banners */}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {!validation.ok && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 1 }}>
          Flow con {validation.errors.length} error(es) — no se podrá habilitar el bot hasta corregirlos.
          {validation.errors.slice(0, 4).map((e, i) => (
            <Typography key={i} variant="caption" sx={{ display: 'block', ml: 1 }}>
              <code>{e.path}</code> — {e.message}
            </Typography>
          ))}
          {validation.errors.length > 4 && (
            <Typography variant="caption" sx={{ display: 'block', ml: 1 }}>
              … y {validation.errors.length - 4} más
            </Typography>
          )}
        </Alert>
      )}

      {/* Canvas */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            colorMode={mode}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            deleteKeyCode={['Delete', 'Backspace']}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.type === 'menu' ? '#5B5BD6' : n.type === 'message' ? '#0288d1' : '#9c27b0'
              }
              nodeStrokeColor={mode === 'dark' ? '#fff' : '#000'}
              nodeStrokeWidth={3}
              nodeBorderRadius={4}
              maskColor={mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)'}
            />
          </ReactFlow>
        )}
      </Box>

      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Snapshot: bot {snapshot?.botEnabled ? 'ON' : 'OFF'} · TTL {snapshot?.botSessionTtlMin}min ·{' '}
          {Object.keys(snapshot?.botFlow?.nodes ?? {}).length} nodos guardados
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Tip: arrastrá desde el handle derecho de un MENU/MESSAGE a otro nodo para conectar. Click en un nodo para editarlo.
        </Typography>
      </Box>

      <NodeEditorDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        flow={flow}
        selectedId={selectedNodeId}
        onPatch={patchSelectedNode}
        onDelete={deleteSelectedNode}
        onSetStart={setSelectedAsStart}
      />
    </Box>
  );
}

/**
 * Aplica una conexión nueva al flow:
 *  - source MENU + sourceHandle `op-X` → setea opt.nextNodeId
 *  - source MESSAGE + sourceHandle `next` → setea node.nextNodeId
 */
function applyConnection(flow: BotFlow, conn: Connection): BotFlow {
  if (!conn.source || !conn.target) return flow;
  if (!flow.nodes[conn.target]) return flow;
  const src = flow.nodes[conn.source];
  if (!src) return flow;
  if (src.kind === 'MENU' && conn.sourceHandle?.startsWith('op-')) {
    const optId = conn.sourceHandle.slice(3);
    const options = src.options.map((o) =>
      o.id === optId ? { ...o, nextNodeId: conn.target! } : o,
    );
    return {
      ...flow,
      nodes: { ...flow.nodes, [conn.source]: { ...src, options } as BotMenuNode },
    };
  }
  if (src.kind === 'MESSAGE' && conn.sourceHandle === 'next') {
    if (conn.target === conn.source) return flow; // sin auto-loop
    return {
      ...flow,
      nodes: {
        ...flow.nodes,
        [conn.source]: { ...src, nextNodeId: conn.target } as BotMessageNode,
      },
    };
  }
  return flow;
}

/**
 * Quita las conexiones representadas por los edge-ids dados, basándose en el
 * formato `${source}__${handle}__${target}`.
 */
function disconnectEdges(flow: BotFlow, edgeIds: Set<string>): BotFlow {
  let changed = false;
  const nextNodes: BotFlow['nodes'] = { ...flow.nodes };
  for (const eid of edgeIds) {
    const parts = eid.split('__');
    if (parts.length !== 3) continue;
    const [source, handle] = parts;
    const node = nextNodes[source];
    if (!node) continue;
    if (node.kind === 'MENU' && handle.startsWith('op-')) {
      const optId = handle.slice(3);
      nextNodes[source] = {
        ...node,
        options: node.options.map((o) => (o.id === optId ? { ...o, nextNodeId: '' } : o)),
      } as BotMenuNode;
      changed = true;
    } else if (node.kind === 'MESSAGE' && handle === 'next') {
      nextNodes[source] = { ...node, nextNodeId: undefined } as BotMessageNode;
      changed = true;
    }
  }
  return changed ? { ...flow, nodes: nextNodes } : flow;
}
