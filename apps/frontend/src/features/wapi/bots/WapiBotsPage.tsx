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
import KeyboardIcon from '@mui/icons-material/Keyboard';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EditIcon from '@mui/icons-material/Edit';
import RouteIcon from '@mui/icons-material/Route';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
  BotCaptureNode,
  BotConditionNode,
  BotConfigSnapshot,
  BotFlow,
  BotMediaNode,
  BotMenuNode,
  BotMessageNode,
  BotNode,
  BotNodeKind,
  BotRouter,
  BotTopic,
} from './types';
import { autoLayout } from './flowLayout';
import { nodeTypes } from './nodeViews';
import { NodeEditorDrawer } from './NodeEditorDrawer';
import { validateRouter, validateTopics } from './validateClient';
import { RouterPanel } from './RouterPanel';
import { TopicsListView } from './TopicsListView';
import { TopicDialog } from './TopicDialog';

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
  if (kind === 'CAPTURE')
    return { kind: 'CAPTURE', text: 'Tu respuesta?', saveAs: 'respuesta', nextNodeId: '' };
  if (kind === 'MEDIA') return { kind: 'MEDIA', mediaType: 'image', mediaId: '' };
  if (kind === 'CONDITION') return { kind: 'CONDITION', branches: [] };
  return { kind: 'HANDOFF', text: 'Te derivamos.', escalate: true };
}

function nodeIdPrefix(kind: BotNodeKind): string {
  if (kind === 'MENU') return 'menu';
  if (kind === 'MESSAGE') return 'msg';
  if (kind === 'CAPTURE') return 'cap';
  if (kind === 'MEDIA') return 'media';
  if (kind === 'CONDITION') return 'cond';
  return 'handoff';
}

function materializeTopics(snap: BotConfigSnapshot): BotTopic[] {
  if (snap.botTopics && snap.botTopics.length > 0) return snap.botTopics;
  if (snap.botFlow) {
    return [{ id: 'default', label: 'Principal', flow: snap.botFlow }];
  }
  return [{ id: 'default', label: 'Principal', flow: structuredClone(EMPTY_FLOW) }];
}

function defaultRouter(topics: BotTopic[]): BotRouter {
  const first = topics[0]?.id;
  return { rules: [], defaultTopicId: first };
}

type View = 'list' | 'topic' | 'router';

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
  const [topics, setTopics] = useState<BotTopic[]>([
    { id: 'default', label: 'Principal', flow: structuredClone(EMPTY_FLOW) },
  ]);
  const [router, setRouter] = useState<BotRouter>({ rules: [], defaultTopicId: 'default' });
  const [activeTopicId, setActiveTopicId] = useState<string>('default');
  const [view, setView] = useState<View>('list');
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [topicDialogEditing, setTopicDialogEditing] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reactFlow = useReactFlow();
  const { mode } = useColorMode();
  const layoutAppliedFor = useRef<string | null>(null);

  const activeIdx = topics.findIndex((t) => t.id === activeTopicId);
  const activeTopic = activeIdx >= 0 ? topics[activeIdx] : topics[0];
  const flow = activeTopic?.flow ?? EMPTY_FLOW;

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

  // Cargar snapshot al cambiar de config.
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
        const incomingTopics = materializeTopics(snap);
        const laidOut = incomingTopics.map((t) => {
          const hasPos = Object.values(t.flow.nodes).some((n) => n.position);
          return hasPos ? t : { ...t, flow: autoLayout(t.flow) };
        });
        setTopics(laidOut);
        setRouter(snap.botRouter ?? defaultRouter(laidOut));
        setActiveTopicId(laidOut[0]?.id ?? 'default');
        setView('list');
        layoutAppliedFor.current = selectedConfigId;
        setSelectedNodeId(null);
        setDrawerOpen(false);
      } catch (e) {
        notify.error((e as Error).message || 'No se pudo cargar el bot');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId]);

  const updateActiveFlow = useCallback(
    (updater: (prev: BotFlow) => BotFlow) => {
      setTopics((prev) =>
        prev.map((t) => (t.id === activeTopicId ? { ...t, flow: updater(t.flow) } : t)),
      );
    },
    [activeTopicId],
  );

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
          if (opt.gotoTopic) return; // inter-topic no se renderiza como edge
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
      } else if (
        node.kind === 'MESSAGE' &&
        node.nextNodeId &&
        !node.gotoTopic &&
        flow.nodes[node.nextNodeId]
      ) {
        out.push({
          id: `${id}__next__${node.nextNodeId}`,
          source: id,
          sourceHandle: 'next',
          target: node.nextNodeId,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#0288d1' },
        });
      } else if (
        node.kind === 'MEDIA' &&
        node.nextNodeId &&
        !node.gotoTopic &&
        flow.nodes[node.nextNodeId]
      ) {
        out.push({
          id: `${id}__next__${node.nextNodeId}`,
          source: id,
          sourceHandle: 'next',
          target: node.nextNodeId,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#2e7d32' },
        });
      } else if (node.kind === 'CAPTURE') {
        if (node.nextNodeId && !node.gotoTopic && flow.nodes[node.nextNodeId]) {
          out.push({
            id: `${id}__next__${node.nextNodeId}`,
            source: id,
            sourceHandle: 'next',
            target: node.nextNodeId,
            label: '✓',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#2e7d32' },
            labelStyle: { fontSize: 11 },
          });
        }
        if (node.retryNodeId && flow.nodes[node.retryNodeId]) {
          out.push({
            id: `${id}__retry__${node.retryNodeId}`,
            source: id,
            sourceHandle: 'retry',
            target: node.retryNodeId,
            label: '✗',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#d32f2f' },
            labelStyle: { fontSize: 11 },
          });
        }
      } else if (node.kind === 'CONDITION') {
        node.branches.forEach((b) => {
          if (b.gotoTopic) return;
          if (b.nextNodeId && flow.nodes[b.nextNodeId]) {
            out.push({
              id: `${id}__br-${b.id}__${b.nextNodeId}`,
              source: id,
              sourceHandle: `br-${b.id}`,
              target: b.nextNodeId,
              label: b.id,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: '#616161' },
              labelStyle: { fontSize: 11 },
            });
          }
        });
        if (node.elseNextNodeId && !node.elseGotoTopic && flow.nodes[node.elseNextNodeId]) {
          out.push({
            id: `${id}__else__${node.elseNextNodeId}`,
            source: id,
            sourceHandle: 'else',
            target: node.elseNextNodeId,
            label: 'else',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#9e9e9e', strokeDasharray: '4 3' },
            labelStyle: { fontSize: 11, fontStyle: 'italic' },
          });
        }
      }
    }
    return out;
  }, [flow]);

  const topicIdSet = useMemo(() => new Set(topics.map((t) => t.id)), [topics]);
  const topicsValidation = useMemo(() => validateTopics(topics), [topics]);
  const routerValidation = useMemo(() => validateRouter(router, topicIdSet), [router, topicIdSet]);
  const fullyValid = topicsValidation.ok && routerValidation.ok;
  const allErrors = [...topicsValidation.errors, ...routerValidation.errors];
  const activeTopicErrors = useMemo(
    () => topicsValidation.errors.filter((e) => e.path.startsWith(`topics[${activeTopicId}]`)),
    [topicsValidation, activeTopicId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, rfNodes);
      updateActiveFlow((f) => {
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
      for (const ch of changes) {
        if (ch.type === 'select') {
          if (ch.selected) setSelectedNodeId(ch.id);
        }
      }
    },
    [rfNodes, updateActiveFlow],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removes = changes.filter((c) => c.type === 'remove') as Array<{ type: 'remove'; id: string }>;
      if (removes.length === 0) return;
      const removedIds = new Set(removes.map((r) => r.id));
      updateActiveFlow((f) => disconnectEdges(f, removedIds));
    },
    [updateActiveFlow],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      updateActiveFlow((f) => applyConnection(f, conn));
    },
    [updateActiveFlow],
  );

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
    updateActiveFlow((f) => {
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
    updateActiveFlow((f) => {
      const rest = { ...f.nodes };
      delete rest[selectedNodeId];
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
        } else if (node.kind === 'MEDIA' && node.nextNodeId === selectedNodeId) {
          cleaned[id] = { ...node, nextNodeId: undefined } as BotMediaNode;
        } else if (node.kind === 'CAPTURE') {
          const next: BotCaptureNode = {
            ...node,
            nextNodeId: node.nextNodeId === selectedNodeId ? '' : node.nextNodeId,
            retryNodeId: node.retryNodeId === selectedNodeId ? undefined : node.retryNodeId,
          };
          cleaned[id] = next;
        } else if (node.kind === 'CONDITION') {
          cleaned[id] = {
            ...node,
            branches: node.branches.map((b) =>
              b.nextNodeId === selectedNodeId ? { ...b, nextNodeId: '' } : b,
            ),
            elseNextNodeId:
              node.elseNextNodeId === selectedNodeId ? undefined : node.elseNextNodeId,
          } as BotConditionNode;
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
    updateActiveFlow((f) => ({ ...f, startNodeId: selectedNodeId }));
  }

  function addNode(kind: BotNodeKind) {
    updateActiveFlow((f) => {
      const taken = new Set(Object.keys(f.nodes));
      const id = nextId(nodeIdPrefix(kind), taken);
      const node = defaultNodeFor(kind);
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

  function applyAutoLayoutActive() {
    updateActiveFlow((f) => autoLayout(f));
    requestAnimationFrame(() => {
      try {
        reactFlow.fitView({ padding: 0.2, duration: 300 });
      } catch {
        /* ignore */
      }
    });
  }

  // Topic CRUD via dialog.
  function openCreateTopic() {
    setTopicDialogEditing(null);
    setTopicDialogOpen(true);
  }

  function openRenameTopic(id: string) {
    const t = topics.find((x) => x.id === id);
    if (!t) return;
    setTopicDialogEditing({ id: t.id, label: t.label });
    setTopicDialogOpen(true);
  }

  function handleTopicDialogSubmit(next: { id: string; label: string }) {
    if (topicDialogEditing) {
      // Rename mode.
      const oldId = topicDialogEditing.id;
      const newId = next.id;
      setTopics((prev) =>
        prev.map((t) => (t.id === oldId ? { ...t, id: newId, label: next.label } : t)),
      );
      if (newId !== oldId) {
        // Reescribir refs en flows + router.
        setTopics((prev) =>
          prev.map((t) => ({ ...t, flow: rewriteGotoTopic(t.flow, oldId, newId) })),
        );
        setRouter((prev) => rewriteRouterTopic(prev, oldId, newId));
        if (activeTopicId === oldId) setActiveTopicId(newId);
      }
      notify.success('Tema actualizado');
    } else {
      // Create mode.
      const t: BotTopic = {
        id: next.id,
        label: next.label,
        flow: structuredClone(EMPTY_FLOW),
      };
      setTopics((prev) => [...prev, t]);
      // Entrar al editor del tema recién creado.
      setActiveTopicId(t.id);
      setView('topic');
      setSelectedNodeId(null);
      setDrawerOpen(false);
      notify.success('Tema creado');
    }
    setTopicDialogOpen(false);
  }

  async function deleteTopic(id: string) {
    if (topics.length <= 1) {
      notify.error('Debe quedar al menos 1 tema');
      return;
    }
    const t = topics.find((x) => x.id === id);
    const ok = await confirm({
      title: 'Eliminar tema',
      message: `¿Eliminar el tema "${t?.label ?? id}"? Las rules del router que lo referencien quedarán inválidas.`,
      destructive: true,
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    setTopics((prev) => prev.filter((t) => t.id !== id));
    if (activeTopicId === id) {
      const next = topics.find((t) => t.id !== id);
      if (next) setActiveTopicId(next.id);
      if (view === 'topic') setView('list');
    }
  }

  function enterTopic(id: string) {
    setActiveTopicId(id);
    setView('topic');
    setSelectedNodeId(null);
    setDrawerOpen(false);
    requestAnimationFrame(() => {
      try {
        reactFlow.fitView({ padding: 0.2 });
      } catch {
        /* ignore */
      }
    });
  }

  async function handleSave() {
    if (!selectedConfigId) return;
    if (enabled && !fullyValid) {
      notify.error('No se puede habilitar con flow/router inválido. Revisá los errores.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const snap = await botApi.update(api, selectedConfigId, {
        botEnabled: enabled,
        botSessionTtlMin: ttl,
        botTopics: topics,
        botRouter: router,
        botFlow: null,
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

  const drawerTopics = useMemo(
    () =>
      topics
        .filter((t) => t.id !== activeTopicId)
        .map((t) => ({ id: t.id, label: t.label })),
    [topics, activeTopicId],
  );

  const dialogTakenIds = useMemo(() => topics.map((t) => t.id), [topics]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Toolbar superior — config + enabled + ttl + save */}
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

      {/* Breadcrumb (sólo en topic/router) */}
      {view !== 'list' && (
        <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Button
              size="small"
              startIcon={<ArrowBackIcon />}
              onClick={() => {
                setView('list');
                setSelectedNodeId(null);
                setDrawerOpen(false);
              }}
            >
              Temas
            </Button>
            <Typography variant="body2" color="text.secondary">
              /
            </Typography>
            {view === 'router' ? (
              <Stack direction="row" alignItems="center" gap={0.5}>
                <RouteIcon fontSize="small" color="primary" />
                <Typography variant="body2" fontWeight={500}>
                  Router
                </Typography>
                <Chip size="small" label={`${router.rules.length} rule(s)`} variant="outlined" />
                {!routerValidation.ok && (
                  <Chip
                    size="small"
                    icon={<WarningAmberIcon fontSize="small" />}
                    label={`${routerValidation.errors.length} error(es)`}
                    color="warning"
                    variant="outlined"
                  />
                )}
              </Stack>
            ) : (
              activeTopic && (
                <Stack direction="row" alignItems="center" gap={0.5} sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={500}>
                    {activeTopic.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                  >
                    ({activeTopic.id})
                  </Typography>
                  {activeTopicErrors.length > 0 && (
                    <Chip
                      size="small"
                      icon={<WarningAmberIcon fontSize="small" />}
                      label={`${activeTopicErrors.length} error(es)`}
                      color="warning"
                      variant="outlined"
                    />
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title="Renombrar tema">
                    <IconButton size="small" onClick={() => openRenameTopic(activeTopic.id)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )
            )}
          </Stack>
        </Paper>
      )}

      {/* Toolbar de nodos (sólo en vista de topic) */}
      {view === 'topic' && (
        <Paper
          sx={{
            p: 1,
            mb: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
          }}
          variant="outlined"
        >
          <Tooltip title="Agregar MENU">
            <Button size="small" startIcon={<SmartToyIcon />} onClick={() => addNode('MENU')} variant="outlined">
              MENU
            </Button>
          </Tooltip>
          <Tooltip title="Agregar MESSAGE">
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
          <Tooltip title="Agregar CAPTURE">
            <Button
              size="small"
              startIcon={<KeyboardIcon />}
              onClick={() => addNode('CAPTURE')}
              variant="outlined"
              color="warning"
            >
              CAPTURE
            </Button>
          </Tooltip>
          <Tooltip title="Agregar MEDIA">
            <Button
              size="small"
              startIcon={<AttachFileIcon />}
              onClick={() => addNode('MEDIA')}
              variant="outlined"
              color="success"
            >
              MEDIA
            </Button>
          </Tooltip>
          <Tooltip title="Agregar CONDITION">
            <Button
              size="small"
              startIcon={<CallSplitIcon />}
              onClick={() => addNode('CONDITION')}
              variant="outlined"
            >
              COND
            </Button>
          </Tooltip>
          <Tooltip title="Agregar HANDOFF">
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
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Reorganizar nodos">
            <span>
              <IconButton size="small" onClick={applyAutoLayoutActive} disabled={loading}>
                <AutoFixHighIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Paper>
      )}

      {/* Errores */}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {!fullyValid && view !== 'list' && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 1 }}>
          {allErrors.length} error(es) — no se podrá habilitar el bot hasta corregirlos.
          {(view === 'router' ? routerValidation.errors : activeTopicErrors)
            .slice(0, 4)
            .map((e, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', ml: 1 }}>
                <code>{e.path}</code> — {e.message}
              </Typography>
            ))}
          {(view === 'router' ? routerValidation.errors : activeTopicErrors).length > 4 && (
            <Typography variant="caption" sx={{ display: 'block', ml: 1 }}>
              … y más en otros tabs
            </Typography>
          )}
        </Alert>
      )}

      {/* Vista activa */}
      {loading ? (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress />
        </Box>
      ) : view === 'list' ? (
        <TopicsListView
          topics={topics}
          errors={topicsValidation.errors}
          defaultTopicId={router.defaultTopicId}
          onCreate={openCreateTopic}
          onEditFlow={enterTopic}
          onRename={openRenameTopic}
          onDelete={deleteTopic}
          onOpenRouter={() => {
            setView('router');
            setSelectedNodeId(null);
            setDrawerOpen(false);
          }}
          routerHasErrors={!routerValidation.ok}
          routerRulesCount={router.rules.length}
        />
      ) : view === 'topic' ? (
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
                n.type === 'menu'
                  ? '#5B5BD6'
                  : n.type === 'message'
                    ? '#0288d1'
                    : n.type === 'capture'
                      ? '#ed6c02'
                      : n.type === 'media'
                        ? '#2e7d32'
                        : n.type === 'condition'
                          ? '#616161'
                          : '#9c27b0'
              }
              nodeStrokeColor={mode === 'dark' ? '#fff' : '#000'}
              nodeStrokeWidth={3}
              nodeBorderRadius={4}
              maskColor={mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)'}
            />
          </ReactFlow>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            overflow: 'auto',
          }}
        >
          <RouterPanel
            router={router}
            topics={topics}
            onChange={setRouter}
            errors={routerValidation.errors}
          />
        </Box>
      )}

      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Snapshot: bot {snapshot?.botEnabled ? 'ON' : 'OFF'} · TTL {snapshot?.botSessionTtlMin}min ·{' '}
          {topics.length} tema(s) · {router.rules.length} rule(s)
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {view === 'list'
            ? `Tip: click "Editar flow" para entrar al canvas del tema. Botón "Router" para mappings de payload→tema.`
            : view === 'topic'
              ? 'Tip: arrastrá desde el handle derecho para conectar. Click en un nodo para editarlo. Usá "Saltar a tema" para inter-topic.'
              : 'Las rules se evalúan en orden. La 1ª que matchea gana.'}
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
        configId={selectedConfigId}
        availableTopics={drawerTopics}
      />

      <TopicDialog
        open={topicDialogOpen}
        onClose={() => setTopicDialogOpen(false)}
        editing={topicDialogEditing}
        takenIds={dialogTakenIds}
        onSubmit={handleTopicDialogSubmit}
      />
    </Box>
  );
}

function applyConnection(flow: BotFlow, conn: Connection): BotFlow {
  if (!conn.source || !conn.target) return flow;
  if (!flow.nodes[conn.target]) return flow;
  const src = flow.nodes[conn.source];
  if (!src) return flow;
  if (src.kind === 'MENU' && conn.sourceHandle?.startsWith('op-')) {
    const optId = conn.sourceHandle.slice(3);
    const options = src.options.map((o) =>
      o.id === optId ? { ...o, nextNodeId: conn.target!, gotoTopic: undefined } : o,
    );
    return {
      ...flow,
      nodes: { ...flow.nodes, [conn.source]: { ...src, options } as BotMenuNode },
    };
  }
  if (src.kind === 'MESSAGE' && conn.sourceHandle === 'next') {
    if (conn.target === conn.source) return flow;
    return {
      ...flow,
      nodes: {
        ...flow.nodes,
        [conn.source]: { ...src, nextNodeId: conn.target, gotoTopic: undefined } as BotMessageNode,
      },
    };
  }
  if (src.kind === 'MEDIA' && conn.sourceHandle === 'next') {
    if (conn.target === conn.source) return flow;
    return {
      ...flow,
      nodes: {
        ...flow.nodes,
        [conn.source]: { ...src, nextNodeId: conn.target, gotoTopic: undefined } as BotMediaNode,
      },
    };
  }
  if (src.kind === 'CAPTURE') {
    if (conn.target === conn.source) return flow;
    if (conn.sourceHandle === 'next') {
      return {
        ...flow,
        nodes: {
          ...flow.nodes,
          [conn.source]: { ...src, nextNodeId: conn.target, gotoTopic: undefined } as BotCaptureNode,
        },
      };
    }
    if (conn.sourceHandle === 'retry') {
      return {
        ...flow,
        nodes: {
          ...flow.nodes,
          [conn.source]: { ...src, retryNodeId: conn.target } as BotCaptureNode,
        },
      };
    }
  }
  if (src.kind === 'CONDITION') {
    if (conn.target === conn.source) return flow;
    if (conn.sourceHandle?.startsWith('br-')) {
      const branchId = conn.sourceHandle.slice(3);
      const branches = src.branches.map((b) =>
        b.id === branchId ? { ...b, nextNodeId: conn.target!, gotoTopic: undefined } : b,
      );
      return {
        ...flow,
        nodes: { ...flow.nodes, [conn.source]: { ...src, branches } as BotConditionNode },
      };
    }
    if (conn.sourceHandle === 'else') {
      return {
        ...flow,
        nodes: {
          ...flow.nodes,
          [conn.source]: {
            ...src,
            elseNextNodeId: conn.target,
            elseGotoTopic: undefined,
          } as BotConditionNode,
        },
      };
    }
  }
  return flow;
}

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
    } else if (node.kind === 'MEDIA' && handle === 'next') {
      nextNodes[source] = { ...node, nextNodeId: undefined } as BotMediaNode;
      changed = true;
    } else if (node.kind === 'CAPTURE') {
      if (handle === 'next') {
        nextNodes[source] = { ...node, nextNodeId: '' } as BotCaptureNode;
        changed = true;
      } else if (handle === 'retry') {
        nextNodes[source] = { ...node, retryNodeId: undefined } as BotCaptureNode;
        changed = true;
      }
    } else if (node.kind === 'CONDITION') {
      if (handle.startsWith('br-')) {
        const branchId = handle.slice(3);
        nextNodes[source] = {
          ...node,
          branches: node.branches.map((b) =>
            b.id === branchId ? { ...b, nextNodeId: '' } : b,
          ),
        } as BotConditionNode;
        changed = true;
      } else if (handle === 'else') {
        nextNodes[source] = { ...node, elseNextNodeId: undefined } as BotConditionNode;
        changed = true;
      }
    }
  }
  return changed ? { ...flow, nodes: nextNodes } : flow;
}

function rewriteGotoTopic(flow: BotFlow, oldId: string, newId: string): BotFlow {
  let changed = false;
  const nodes: BotFlow['nodes'] = {};
  for (const [id, node] of Object.entries(flow.nodes)) {
    if (node.kind === 'MENU') {
      const opts = node.options.map((o) =>
        o.gotoTopic === oldId ? { ...o, gotoTopic: newId } : o,
      );
      if (opts !== node.options) changed = true;
      nodes[id] = { ...node, options: opts };
    } else if (node.kind === 'MESSAGE' || node.kind === 'CAPTURE' || node.kind === 'MEDIA') {
      if (node.gotoTopic === oldId) {
        changed = true;
        nodes[id] = { ...node, gotoTopic: newId } as BotNode;
      } else nodes[id] = node;
    } else if (node.kind === 'CONDITION') {
      const branches = node.branches.map((b) =>
        b.gotoTopic === oldId ? { ...b, gotoTopic: newId } : b,
      );
      const elseGoto = node.elseGotoTopic === oldId ? newId : node.elseGotoTopic;
      if (branches !== node.branches || elseGoto !== node.elseGotoTopic) changed = true;
      nodes[id] = { ...node, branches, elseGotoTopic: elseGoto };
    } else {
      nodes[id] = node;
    }
  }
  return changed ? { ...flow, nodes } : flow;
}

function rewriteRouterTopic(router: BotRouter, oldId: string, newId: string): BotRouter {
  const rules = router.rules.map((r) => (r.topicId === oldId ? { ...r, topicId: newId } : r));
  const def = router.defaultTopicId === oldId ? newId : router.defaultTopicId;
  return { rules, defaultTopicId: def };
}
