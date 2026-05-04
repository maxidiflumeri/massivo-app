import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Socket } from 'socket.io-client';
import type { CampaignReport, CampaignStatus } from './types';

interface Props {
  /** Id de la campaña actual — usado para filtrar logs por socket. */
  campaignId: string;
  /** Total de reports en la campaña (campaign._count.reports). */
  totalReports: number;
  /** Counts en vivo por status, ya updateados via socket. */
  report: CampaignReport | null;
  /** Socket del team — null si todavía no conectó. */
  socket: Socket | null;
  /** PROCESSING o PAUSED — controla qué acciones se renderizan. */
  status: Extract<CampaignStatus, 'PROCESSING' | 'PAUSED'>;
  /** Callbacks de control. El parent maneja confirm + notify + reload. */
  onPause: () => void | Promise<void>;
  onResume: () => void | Promise<void>;
  onForceClose: () => void | Promise<void>;
  /** Mientras corre una acción los botones se deshabilitan. */
  actionsBusy: boolean;
}

type LogStatus = 'SENT' | 'FAILED' | 'SUPPRESSED';

interface LogEntry {
  campaignId: string;
  reportId: string;
  email: string;
  status: LogStatus;
  messageId?: string;
  error?: string;
  ts: string;
}

const MAX_LOG_ENTRIES = 200;

/**
 * Banner visible mientras la campaña está PROCESSING. Muestra:
 *  - Progress bar y counts en tiempo real (via email.report.updated).
 *  - Throughput estimado (envíos/min) en ventana de 60s.
 *  - Panel colapsable de log en vivo (via email.report.log) con ring buffer
 *    de los últimos N entries y filtro por status. Cada banner sólo escucha
 *    los logs cuyo campaignId del payload coincide — soporta múltiples
 *    campañas en simultáneo en el mismo team.
 */
export function CampaignProcessingBanner({
  campaignId,
  totalReports,
  report,
  socket,
  status,
  onPause,
  onResume,
  onForceClose,
  actionsBusy,
}: Props) {
  const isPaused = status === 'PAUSED';
  const counts = report?.counts ?? {};
  const pending = counts.PENDING ?? 0;
  const sent = counts.SENT ?? 0;
  const failed = counts.FAILED ?? 0;
  const bounced = counts.BOUNCED ?? 0;
  const complained = counts.COMPLAINED ?? 0;
  const suppressed = counts.SUPPRESSED ?? 0;

  const totalCounted = pending + sent + failed + bounced + complained + suppressed;
  const hasFreshData = report !== null && totalCounted > 0;
  const processed = hasFreshData ? Math.max(0, totalReports - pending) : 0;
  const pct = hasFreshData && totalReports > 0 ? (processed / totalReports) * 100 : 0;

  const throughput = useThroughput(processed);
  const socketConnected = !!socket?.connected;

  const [logOpen, setLogOpen] = useState(true);
  const [logFilter, setLogFilter] = useState<'ALL' | LogStatus>('ALL');
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!socket) return;
    const handler = (entry: LogEntry) => {
      // Filtra por campaignId — soporta múltiples campañas en simultáneo.
      if (entry.campaignId !== campaignId) return;
      setLogEntries((prev) => {
        const next = prev.length >= MAX_LOG_ENTRIES ? prev.slice(-MAX_LOG_ENTRIES + 1) : prev;
        return [...next, entry];
      });
    };
    socket.on('email.report.log', handler);
    return () => {
      socket.off('email.report.log', handler);
    };
  }, [socket, campaignId]);

  // Reset al cambiar de campaña.
  useEffect(() => {
    setLogEntries([]);
  }, [campaignId]);

  const filteredLog = useMemo(
    () => (logFilter === 'ALL' ? logEntries : logEntries.filter((e) => e.status === logFilter)),
    [logEntries, logFilter],
  );

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {isPaused ? <PauseCircleIcon color="warning" /> : <HourglassTopIcon color="warning" />}
        <Typography variant="h6" sx={{ flex: 1 }}>
          {isPaused ? 'Campaña pausada' : 'Enviando campaña…'}
        </Typography>
        {socketConnected ? (
          <Chip size="small" label="● en vivo" color="success" variant="outlined" />
        ) : (
          <Chip size="small" label="○ desconectado" variant="outlined" />
        )}
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <LinearProgress
          variant={isPaused || hasFreshData ? 'determinate' : 'indeterminate'}
          value={hasFreshData ? Math.min(100, pct) : isPaused ? 0 : undefined}
          color={isPaused ? 'warning' : 'primary'}
          sx={{ height: 10, borderRadius: 5 }}
        />
      </Box>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {hasFreshData ? (
            <>
              {processed.toLocaleString()} / {totalReports.toLocaleString()} procesados
              <Typography component="span" color="text.secondary" sx={{ ml: 0.75 }}>
                ({pct.toFixed(1)}%)
              </Typography>
            </>
          ) : (
            <Typography component="span" color="text.secondary">
              Iniciando envío…
            </Typography>
          )}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {throughput !== null && (
          <Typography variant="body2" color="text.secondary">
            ~{throughput.toFixed(0)} envíos/min
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
        <Chip size="small" label={`Pendientes: ${pending}`} variant="outlined" />
        <Chip size="small" label={`Enviados: ${sent}`} color="success" variant="outlined" />
        {failed > 0 && <Chip size="small" label={`Fallidos: ${failed}`} color="error" />}
        {bounced > 0 && <Chip size="small" label={`Bounced: ${bounced}`} color="error" variant="outlined" />}
        {complained > 0 && (
          <Chip size="small" label={`Complaints: ${complained}`} color="warning" />
        )}
        {suppressed > 0 && (
          <Chip size="small" label={`Suprimidos: ${suppressed}`} variant="outlined" />
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
        {isPaused ? (
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
            onClick={() => void onResume()}
            disabled={actionsBusy}
          >
            Reanudar
          </Button>
        ) : (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<PauseIcon />}
            onClick={() => void onPause()}
            disabled={actionsBusy}
          >
            Pausar
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          onClick={() => void onForceClose()}
          disabled={actionsBusy}
        >
          Forzar cierre
        </Button>
      </Stack>

      <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Button
            size="small"
            startIcon={logOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setLogOpen((v) => !v)}
          >
            Log en vivo ({logEntries.length})
          </Button>
          <Box sx={{ flex: 1 }} />
          <Select
            size="small"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value as 'ALL' | LogStatus)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="ALL">Todos</MenuItem>
            <MenuItem value="SENT">Enviados</MenuItem>
            <MenuItem value="FAILED">Fallidos</MenuItem>
            <MenuItem value="SUPPRESSED">Suprimidos</MenuItem>
          </Select>
          {logEntries.length > 0 && (
            <Button size="small" onClick={() => setLogEntries([])}>
              Limpiar
            </Button>
          )}
        </Stack>
        <Collapse in={logOpen} timeout="auto">
          <LogConsole entries={filteredLog} />
        </Collapse>
      </Box>
    </Paper>
  );
}

function LogConsole({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <Box
        sx={{
          bgcolor: 'grey.900',
          color: 'grey.500',
          borderRadius: 1,
          p: 2,
          fontFamily: 'monospace',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Esperando eventos…
      </Box>
    );
  }

  return (
    <Box
      ref={ref}
      sx={{
        bgcolor: 'grey.900',
        color: 'grey.100',
        borderRadius: 1,
        px: 1.5,
        py: 1,
        fontFamily: 'monospace',
        fontSize: 12.5,
        lineHeight: 1.55,
        maxHeight: 280,
        overflowY: 'auto',
      }}
    >
      {entries.map((e) => (
        <Box key={`${e.ts}-${e.reportId}`} sx={{ whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ color: 'grey.500' }}>
            [{formatTime(e.ts)}]{' '}
          </Box>
          <Box component="span" sx={{ color: statusColor(e.status), fontWeight: 600 }}>
            {statusGlyph(e.status)} {e.status.padEnd(10)}
          </Box>{' '}
          <Box component="span">{e.email}</Box>
          {e.messageId && (
            <Box component="span" sx={{ color: 'grey.500' }}>
              {' '}
              · msgId={truncate(e.messageId, 32)}
            </Box>
          )}
          {e.error && (
            <Box component="span" sx={{ color: 'error.light' }}>
              {' '}
              · {truncate(e.error, 120)}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false });
}

function statusColor(s: LogStatus): string {
  switch (s) {
    case 'SENT':
      return '#7ee787';
    case 'FAILED':
      return '#ff7b72';
    case 'SUPPRESSED':
      return '#d2a8ff';
  }
}

function statusGlyph(s: LogStatus): string {
  switch (s) {
    case 'SENT':
      return '✓';
    case 'FAILED':
      return '✗';
    case 'SUPPRESSED':
      return '⊘';
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

interface Sample {
  t: number;
  processed: number;
}

function useThroughput(processed: number): number | null {
  const samples = useRef<Sample[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    samples.current.push({ t: now, processed });
    const cutoff = now - 60_000;
    samples.current = samples.current.filter((s) => s.t >= cutoff);
    setTick((x) => x + 1);
  }, [processed]);

  if (tick === 0 || samples.current.length < 2) return null;
  const first = samples.current[0]!;
  const last = samples.current[samples.current.length - 1]!;
  const dtSec = (last.t - first.t) / 1000;
  if (dtSec < 5) return null;
  const dProc = last.processed - first.processed;
  if (dProc <= 0) return null;
  return (dProc / dtSec) * 60;
}
