import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CampaignIcon from '@mui/icons-material/Campaign';
import InboxIcon from '@mui/icons-material/Inbox';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useTeamSocket } from '../../../realtime/useTeamSocket';
import { liveApi } from './api';
import type { LiveCampaignSummary, LiveConfigUsage, LiveSnapshot } from './types';

const REFETCH_DEBOUNCE_MS = 500;

export function WapiLivePage() {
  const api = useApi();
  const notify = useNotify();
  const socket = useTeamSocket();

  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  const fetchSnapshot = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    try {
      const snap = await liveApi.snapshot(api);
      setData(snap);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando snapshot live');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void fetchSnapshot();
      }
    }
  }, [api, notify]);

  // Initial load + manual refresh.
  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  // Socket connection state + debounced re-fetch on relevant events.
  useEffect(() => {
    if (!socket) {
      setSocketConnected(false);
      return;
    }
    setSocketConnected(socket.connected);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void fetchSnapshot();
      }, REFETCH_DEBOUNCE_MS);
    };

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('wapi.report.updated', trigger);
    socket.on('wapi.report.log', trigger);
    socket.on('wapi.conversation.updated', trigger);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('wapi.report.updated', trigger);
      socket.off('wapi.report.log', trigger);
      socket.off('wapi.conversation.updated', trigger);
    };
  }, [socket, fetchSnapshot]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Dashboard live
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Snapshot agregado de campañas en curso, uso de líneas e inbox.
          </Typography>
        </Box>
        <Chip
          icon={
            <FiberManualRecordIcon
              sx={{
                color: socketConnected ? 'success.main' : 'text.disabled',
                fontSize: 12,
              }}
            />
          }
          label={socketConnected ? 'En vivo' : 'Sin conexión'}
          size="small"
          variant="outlined"
        />
        <Tooltip title="Recargar">
          <span>
            <IconButton size="small" onClick={() => void fetchSnapshot()} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {!data ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Stack spacing={3}>
          <CampaignsWidget campaigns={data.campaigns} />
          <ConfigsWidget configs={data.configs} />
          <InboxWidget inbox={data.inbox} />
          <Typography variant="caption" color="text.disabled">
            Generado: {new Date(data.generatedAt).toLocaleString()}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

function CampaignsWidget({ campaigns }: { campaigns: LiveCampaignSummary[] }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <CampaignIcon fontSize="small" color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Campañas en curso
        </Typography>
        <Chip label={campaigns.length} size="small" />
      </Stack>
      {campaigns.length === 0 ? (
        <Typography color="text.secondary">No hay campañas activas en este momento.</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Campaña</TableCell>
                <TableCell>Línea</TableCell>
                <TableCell>Template</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell sx={{ minWidth: 200 }}>Funnel</TableCell>
                <TableCell align="right">5 min</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

function formatDelaySec(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

function delayTooltip(min: number, max: number, source: 'campaign' | 'config'): string {
  const avg = (min + max) / 2 / 1000;
  const perMin = avg > 0 ? (60 / avg).toFixed(1) : '0';
  const sourceLabel =
    source === 'campaign' ? 'override per-campaña' : 'heredado del número';
  return `Velocidad efectiva: ${formatDelaySec(min)}–${formatDelaySec(max)} entre envíos (${sourceLabel}). ~${perMin} envíos/min.`;
}

function CampaignRow({ c }: { c: LiveCampaignSummary }) {
  const sent = c.totals.SENT + c.totals.DELIVERED + c.totals.READ;
  const failed = c.totals.FAILED + c.totals.CANCELED;
  const processed = sent + failed;
  const pct = c.total > 0 ? Math.round((processed / c.total) * 100) : 0;
  return (
    <TableRow hover>
      <TableCell>
        <Tooltip title={delayTooltip(c.delayMinMs, c.delayMaxMs, c.delaySource)}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ width: 'fit-content' }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {c.name}
            </Typography>
            {c.delaySource === 'campaign' && (
              <Chip
                label="Velocidad ★"
                size="small"
                color="info"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
          </Stack>
        </Tooltip>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {c.configName ?? '—'}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {c.templateName ?? '—'}
        </Typography>
      </TableCell>
      <TableCell>
        <Chip
          label={c.status}
          size="small"
          color={c.status === 'PROCESSING' ? 'success' : 'warning'}
          variant={c.status === 'PROCESSING' ? 'filled' : 'outlined'}
        />
      </TableCell>
      <TableCell align="right">{c.total.toLocaleString()}</TableCell>
      <TableCell>
        <Stack spacing={0.5}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{ height: 6, borderRadius: 1 }}
          />
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <FunnelChip label="P" value={c.totals.PENDING} color="default" />
            <FunnelChip label="S" value={c.totals.SENT} color="info" />
            <FunnelChip label="D" value={c.totals.DELIVERED} color="primary" />
            <FunnelChip label="R" value={c.totals.READ} color="success" />
            <FunnelChip label="F" value={failed} color="error" />
          </Stack>
        </Stack>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {c.throughputLast5min.toLocaleString()}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Button component={RouterLink} to={`/dashboard/wapi/campaigns/${c.id}`} size="small">
          Ver
        </Button>
      </TableCell>
    </TableRow>
  );
}

function FunnelChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'default' | 'info' | 'primary' | 'success' | 'error';
}) {
  return (
    <Tooltip title={`${labelFull(label)}: ${value.toLocaleString()}`}>
      <Chip
        label={`${label} ${value.toLocaleString()}`}
        size="small"
        color={color}
        variant={value === 0 ? 'outlined' : 'filled'}
        sx={{ height: 20, fontSize: 11 }}
      />
    </Tooltip>
  );
}

function labelFull(short: string): string {
  switch (short) {
    case 'P':
      return 'Pending';
    case 'S':
      return 'Sent';
    case 'D':
      return 'Delivered';
    case 'R':
      return 'Read';
    case 'F':
      return 'Failed/Cancelled';
    default:
      return short;
  }
}

function ConfigsWidget({ configs }: { configs: LiveConfigUsage[] }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
        Uso de líneas (últimas 24h)
      </Typography>
      {configs.length === 0 ? (
        <Typography color="text.secondary">No hay líneas activas.</Typography>
      ) : (
        <Stack spacing={2}>
          {configs.map((cfg) => (
            <ConfigRow key={cfg.id} cfg={cfg} />
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function ConfigRow({ cfg }: { cfg: LiveConfigUsage }) {
  const color: 'success' | 'warning' | 'error' =
    cfg.percent >= 100 ? 'error' : cfg.percent >= 80 ? 'warning' : 'success';
  const avgSec = (cfg.sendDelayMinMs + cfg.sendDelayMaxMs) / 2 / 1000;
  const perMin = avgSec > 0 ? (60 / avgSec).toFixed(1) : '0';
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Tooltip
          title={`Velocidad base: ${formatDelaySec(cfg.sendDelayMinMs)}–${formatDelaySec(cfg.sendDelayMaxMs)} (~${perMin} envíos/min). Las campañas pueden pisar este valor.`}
        >
          <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, cursor: 'help' }}>
            {cfg.name?.trim() || cfg.phoneNumberId}
          </Typography>
        </Tooltip>
        {cfg.isTestMode && <Chip label="TEST" size="small" color="warning" variant="outlined" />}
        <Typography variant="body2" color="text.secondary">
          {cfg.sentLast24h.toLocaleString()} / {cfg.dailyLimit.toLocaleString()}
        </Typography>
        <Chip label={`${cfg.percent}%`} size="small" color={color} />
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, cfg.percent)}
        color={color}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
}

function InboxWidget({ inbox }: { inbox: LiveSnapshot['inbox'] }) {
  const oldest = inbox.oldestUnassignedAt ? new Date(inbox.oldestUnassignedAt) : null;
  const oldestMin = oldest ? Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 60_000)) : null;
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <InboxIcon fontSize="small" color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Inbox
        </Typography>
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
        }}
      >
        <KpiCard
          icon={<PriorityHighIcon />}
          label="Sin asignar (escaladas)"
          value={inbox.unassigned.toLocaleString()}
          hint={
            oldestMin !== null
              ? `Más antigua: hace ${formatMinutes(oldestMin)}`
              : 'Ninguna pendiente'
          }
          color="error"
        />
        <KpiCard
          icon={<HourglassBottomIcon />}
          label="En espera (humano)"
          value={inbox.waiting.toLocaleString()}
          hint="Conversaciones suspendidas"
          color="warning"
        />
        <KpiCard
          icon={<InboxIcon />}
          label="Escaladas (totales)"
          value={inbox.escalatedTotal.toLocaleString()}
          hint="Incluye asignadas + sin asignar"
          color="info"
        />
      </Box>
      <Box sx={{ mt: 2, textAlign: 'right' }}>
        <Button component={RouterLink} to="/dashboard/wapi/inbox" size="small">
          Ir al inbox
        </Button>
      </Box>
    </Paper>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

interface KpiCardProps {
  icon: React.ReactElement;
  label: string;
  value: string;
  hint: string;
  color: 'primary' | 'success' | 'info' | 'warning' | 'error';
}

function KpiCard({ icon, label, value, hint, color }: KpiCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1.5,
          bgcolor: `${color}.main`,
          color: `${color}.contrastText`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {hint}
        </Typography>
      </Box>
    </Paper>
  );
}
