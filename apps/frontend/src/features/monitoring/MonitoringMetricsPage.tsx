import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ForumIcon from '@mui/icons-material/Forum';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import BoltIcon from '@mui/icons-material/Bolt';
import TableChartIcon from '@mui/icons-material/TableChart';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useTeamSocket } from '../../realtime/useTeamSocket';
import { KpiCard } from '../../components/KpiCard';
import { monitoringApi } from './api';
import { DailySeriesChart } from './charts/DailySeriesChart';
import { HourlyChart } from './charts/HourlyChart';
import { ChannelSplitChart } from './charts/ChannelSplitChart';
import { ShareBar } from './charts/ShareBar';
import { PathsBreakdown } from './PathsBreakdown';
import { FunnelSummary } from './FunnelSummary';
import { RangePicker, lastDays } from './RangePicker';
import { DownloadReportButton } from './report/DownloadReportButton';
import type { DayRange, MonitoringOverview, MonitoringWindow, PathsOverview } from './types';

/** Los mensajes entran de a ráfagas: no re-consultamos en cada uno. */
const REFETCH_DEBOUNCE_MS = 5000;

export function MonitoringMetricsPage() {
  const api = useApi();
  const notify = useNotify();
  const socket = useTeamSocket();
  const [range, setRange] = useState<DayRange>(() => lastDays(7));
  const [preset, setPreset] = useState<MonitoringWindow>(7);
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [paths, setPaths] = useState<PathsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [asTable, setAsTable] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(
    async (window: DayRange) => {
      try {
        // El desglose de recorridos es independiente: si falla, las métricas
        // igual se muestran.
        const [res, rutas] = await Promise.all([
          monitoringApi.overview(api, window),
          monitoringApi.paths(api, window).catch(() => null),
        ]);
        setData(res);
        setPaths(rutas);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'No se pudieron cargar las métricas');
      } finally {
        setLoading(false);
      }
    },
    [api, notify],
  );

  useEffect(() => {
    setLoading(true);
    void load(range);
  }, [range, load]);

  // Refetch debounced ante tráfico nuevo (mismo patrón que el dashboard live).
  useEffect(() => {
    if (!socket) return;
    const bump = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void load(range), REFETCH_DEBOUNCE_MS);
    };
    socket.on('conversation.message.new', bump);
    return () => {
      socket.off('conversation.message.new', bump);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [socket, range, load]);

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            Monitoreo · Métricas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Actividad del bot y de las conversaciones. Horario de Buenos Aires.
          </Typography>
        </Box>
        {/* Una sola fila de filtros arriba, que aplica a todo lo de abajo
            —incluido el informe descargable, que usa el mismo rango. */}
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" justifyContent="flex-end">
          <RangePicker
            value={range}
            preset={preset}
            disabled={loading}
            onChange={(r, p) => {
              setRange(r);
              setPreset(p);
            }}
          />
          <DownloadReportButton range={range} disabled={loading} />
          <Tooltip title={asTable ? 'Ver gráficos' : 'Ver como tabla'}>
            <IconButton size="small" onClick={() => setAsTable((v) => !v)}>
              {asTable ? <InsertChartOutlinedIcon /> : <TableChartIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Actualizar">
            <IconButton size="small" onClick={() => void load(range)}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {loading && !data ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : !data ? null : (
        // Al refrescar sostenemos el render anterior atenuado: sin salto de layout.
        <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <KpiCard
                icon={<ForumIcon />}
                label="Conversaciones activas"
                value={data.totals.conversationsActive}
                hint={`${data.totals.conversations.toLocaleString('es-AR')} nuevas`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <KpiCard icon={<CallReceivedIcon />} label="Mensajes entrantes" value={data.totals.messagesIn} color="info" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <KpiCard icon={<CallMadeIcon />} label="Mensajes salientes" value={data.totals.messagesOut} color="success" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <KpiCard icon={<SupportAgentIcon />} label="Derivadas a operador" value={data.totals.handoffs} color="warning" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <KpiCard icon={<BoltIcon />} label="Sesiones activas" value={data.totals.activeSessions} color="secondary" hint="ahora mismo" />
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Actividad por día
            </Typography>
            {asTable ? <DailyTable data={data.days} /> : <DailySeriesChart data={data.days} />}
          </Paper>

          {paths && paths.topics.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Resumen de recorridos
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Cuántos recorridos del bot llegaron a cada paso. Un recorrido es una pasada por el flujo: la misma persona que vuelve al otro día suma dos.
              </Typography>
              <FunnelSummary data={paths} />

              <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Typography variant="subtitle2">Detalle por nodo</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Todo el flujo, paso por paso. Tocá un tema para desplegarlo; en cada nodo el tooltip muestra también personas y pasadas.
                </Typography>
                <PathsBreakdown data={paths} />
              </Paper>
            </Box>
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Mensajes entrantes por hora
                </Typography>
                {asTable ? <HourlyTable data={data.hourly} /> : <HourlyChart data={data.hourly} />}
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    Conversaciones por canal
                  </Typography>
                  <ChannelSplitChart data={data.byChannel} />
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    Resueltas por el bot vs derivadas
                  </Typography>
                  <ShareBar
                    primary={{ label: 'Resueltas por el bot', value: data.botVsEscalated.bot }}
                    secondary={{ label: 'Derivadas a un operador', value: data.botVsEscalated.escalated }}
                  />
                </Paper>
              </Stack>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
}

/** Gemela accesible del gráfico diario — mismos números, sin depender del color. */
function DailyTable({ data }: { data: MonitoringOverview['days'] }) {
  return (
    <TableContainer sx={{ maxHeight: 320 }}>
      <Table size="small" stickyHeader sx={{ '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Día</TableCell>
            <TableCell align="right">Conversaciones</TableCell>
            <TableCell align="right">Entrantes</TableCell>
            <TableCell align="right">Salientes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((d) => (
            <TableRow key={d.day}>
              <TableCell>{d.day}</TableCell>
              <TableCell align="right">{d.conversations}</TableCell>
              <TableCell align="right">{d.messagesIn}</TableCell>
              <TableCell align="right">{d.messagesOut}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function HourlyTable({ data }: { data: MonitoringOverview['hourly'] }) {
  return (
    <TableContainer sx={{ maxHeight: 260 }}>
      <Table size="small" stickyHeader sx={{ '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Hora</TableCell>
            <TableCell align="right">Mensajes entrantes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((h) => (
            <TableRow key={h.hour}>
              <TableCell>{String(h.hour).padStart(2, '0')}:00</TableCell>
              <TableCell align="right">{h.messagesIn}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
