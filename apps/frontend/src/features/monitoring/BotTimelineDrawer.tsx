import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import PermMediaIcon from '@mui/icons-material/PermMedia';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import FunctionsIcon from '@mui/icons-material/Functions';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { monitoringApi } from './api';
import type { BotEventItem, BotSessionSnapshot } from './types';

interface Props {
  open: boolean;
  conversationId: string | null;
  /** Se pasa para refrescar cuando llega un mensaje nuevo a esta conversación. */
  refreshKey?: number;
  /** Acota el recorrido a la visita que se está mirando en el hilo. */
  range?: { from: string; to: string } | null;
  onClose: () => void;
}

/**
 * Recorrido técnico del bot para una conversación: qué nodos recorrió, qué
 * capturó, qué llamadas HTTP hizo y cómo terminó. Complementa al hilo de
 * mensajes, que muestra lo que vio la persona.
 */
export function BotTimelineDrawer({ open, conversationId, refreshKey, range, onClose }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [events, setEvents] = useState<BotEventItem[]>([]);
  const [session, setSession] = useState<BotSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const [ev, ses] = await Promise.all([
          monitoringApi.botEvents(api, id, { limit: 200 }),
          monitoringApi.botSession(api, id),
        ]);
        setEvents(ev.items);
        setSession(ses);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'No se pudo cargar el recorrido');
      } finally {
        setLoading(false);
      }
    },
    [api, notify],
  );

  useEffect(() => {
    if (!open || !conversationId) return;
    void load(conversationId);
  }, [open, conversationId, refreshKey, load]);

  // El hilo muestra una visita; el recorrido acompaña con el mismo recorte.
  const visibles = range
    ? events.filter((e) => e.createdAt >= range.from && e.createdAt <= range.to)
    : events;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, pb: 1 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Recorrido del bot
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {visibles.length} paso{visibles.length === 1 ? '' : 's'} registrado
            {visibles.length === 1 ? '' : 's'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />

      {session && (
        <Paper variant="outlined" sx={{ m: 2, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Sesión
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 0.5, mb: 1 }}>
            <Chip
              size="small"
              label={session.endedAt ? `Finalizada · ${session.endedReason ?? 's/motivo'}` : 'Activa'}
              color={session.endedAt ? 'default' : 'success'}
              variant={session.endedAt ? 'outlined' : 'filled'}
            />
            {session.currentTopicId && (
              <Chip size="small" variant="outlined" label={`tema: ${session.currentTopicId}`} />
            )}
            <Chip size="small" variant="outlined" label={`nodo: ${session.currentNodeId}`} />
          </Stack>
          {session.data && Object.keys(session.data).length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary">
                Variables capturadas
              </Typography>
              <Box component="dl" sx={{ m: 0, mt: 0.5, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.5 }}>
                {Object.entries(session.data).map(([k, v]) => (
                  <Box key={k} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="caption" color="text.secondary" sx={{ pr: 1 }}>
                      {k}
                    </Typography>
                    <Typography component="dd" variant="caption" sx={{ m: 0, wordBreak: 'break-word' }}>
                      {formatValue(v)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Paper>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 2 }}>
        {loading && events.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : visibles.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No hay pasos registrados para esta conversación.
            <br />
            Solo se registran las conversaciones posteriores a la activación del monitoreo.
          </Typography>
        ) : (
          <Stack spacing={0}>
            {visibles.map((ev) => (
              <TimelineRow key={ev.id} event={ev} />
            ))}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}

function TimelineRow({ event }: { event: BotEventItem }) {
  const meta = KIND_META[event.kind] ?? { icon: <ChatBubbleOutlineIcon />, label: event.kind };
  const isBoundary = event.kind === 'bot.session.started' || event.kind === 'bot.session.ended';
  const failed =
    typeof event.payload?.error === 'string' ||
    (typeof event.payload?.status === 'number' && event.payload.status >= 400);

  if (isBoundary) {
    return (
      <Divider sx={{ my: 1.5 }}>
        <Chip
          size="small"
          icon={event.kind === 'bot.session.started' ? <PlayCircleOutlineIcon /> : <StopCircleIcon />}
          label={
            event.kind === 'bot.session.started'
              ? `Inicio de sesión${event.topicId ? ` · ${event.topicId}` : ''}`
              : `Fin de sesión${event.payload?.reason ? ` · ${event.payload.reason}` : ''}`
          }
          variant="outlined"
        />
      </Divider>
    );
  }

  return (
    <Stack direction="row" gap={1.5} sx={{ py: 0.75 }}>
      <Box
        sx={{
          color: failed ? 'error.main' : 'text.secondary',
          display: 'flex',
          alignItems: 'flex-start',
          pt: 0.25,
          '& svg': { fontSize: 18 },
        }}
      >
        {failed ? <ErrorOutlineIcon /> : meta.icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="baseline" gap={0.75} flexWrap="wrap">
          <Typography variant="body2" fontWeight={600}>
            {meta.label}
          </Typography>
          {event.nodeId && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {event.nodeId}
              {event.nodeKind ? ` · ${event.nodeKind}` : ''}
            </Typography>
          )}
        </Stack>
        {describe(event) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
            {describe(event)}
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {new Date(event.createdAt).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </Typography>
    </Stack>
  );
}

const KIND_META: Record<string, { icon: ReactNode; label: string }> = {
  'bot.node.entered': { icon: <ChatBubbleOutlineIcon />, label: 'Nodo' },
  'bot.capture': { icon: <EditNoteIcon />, label: 'Dato capturado' },
  'bot.capture.invalid': { icon: <ErrorOutlineIcon />, label: 'Dato inválido' },
  'bot.setvar': { icon: <FunctionsIcon />, label: 'Variable' },
  'bot.http': { icon: <CloudSyncIcon />, label: 'Llamada HTTP' },
  'bot.media': { icon: <PermMediaIcon />, label: 'Descarga de archivo' },
  'bot.handoff': { icon: <SupportAgentIcon />, label: 'Derivación a operador' },
};

/** Línea de detalle por tipo de evento. */
function describe(ev: BotEventItem): string | null {
  const p = ev.payload;
  if (!p) return null;
  switch (ev.kind) {
    case 'bot.node.entered':
      return p.textPreview ?? null;
    case 'bot.capture':
    case 'bot.setvar':
      return `${p.varName ?? '?'} = ${formatValue(p.value)}`;
    case 'bot.capture.invalid':
      return `respuesta rechazada: ${formatValue(p.input)}`;
    case 'bot.http':
    case 'bot.media': {
      const parts = [
        p.method,
        p.url,
        p.status !== undefined ? `→ ${p.status}` : null,
        p.durationMs !== undefined ? `${p.durationMs} ms` : null,
        p.error ? `error: ${p.error}` : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    case 'bot.handoff':
      return p.escalate ? 'escalada al inbox' : 'sin escalar';
    default:
      return null;
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}
