import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
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
import SendIcon from '@mui/icons-material/Send';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrored';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type { MetricsOverview } from './types';

type Window = 7 | 30;

export function MetricsPage() {
  const api = useApi();
  const notify = useNotify();
  const [days, setDays] = useState<Window>(7);
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (w: Window) => {
      setLoading(true);
      try {
        const res = await api.get<MetricsOverview>(`/api/email/metrics/overview?days=${w}`);
        setData(res);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'Error cargando métricas');
      } finally {
        setLoading(false);
      }
    },
    [api, notify],
  );

  useEffect(() => {
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Métricas de email
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Resumen agregado de envíos del team en la ventana seleccionada.
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={days}
          exclusive
          onChange={(_, v: Window | null) => v && setDays(v)}
          size="small"
        >
          <ToggleButton value={7}>Últimos 7 días</ToggleButton>
          <ToggleButton value={30}>Últimos 30 días</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Recargar">
          <IconButton size="small" onClick={() => void load(days)} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && !data ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : !data ? (
        <Typography color="text.secondary">Sin datos.</Typography>
      ) : (
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)',
              },
            }}
          >
            <KpiCard
              icon={<SendIcon />}
              label="Enviados"
              value={data.totals.sent.toLocaleString()}
              hint={`Último ${data.windowDays}d`}
              color="primary"
            />
            <KpiCard
              icon={<MarkEmailReadIcon />}
              label="Open rate"
              value={formatRate(data.rates.openRate)}
              hint={`${data.uniqueOpens.toLocaleString()} aperturas únicas`}
              color="success"
            />
            <KpiCard
              icon={<TouchAppIcon />}
              label="Click rate"
              value={formatRate(data.rates.clickRate)}
              hint={`${data.uniqueClicks.toLocaleString()} clicks únicos`}
              color="info"
            />
            <KpiCard
              icon={<ReportGmailerrorredIcon />}
              label="Bounce rate"
              value={formatRate(data.rates.bounceRate)}
              hint={`${data.totals.bounced.toLocaleString()} bounces`}
              color="warning"
            />
          </Box>

          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Distribución por estado
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <StatusChip label="SENT" value={data.totals.sent} color="success" />
              <StatusChip label="PENDING" value={data.totals.pending} color="default" />
              <StatusChip label="FAILED" value={data.totals.failed} color="error" />
              <StatusChip label="BOUNCED" value={data.totals.bounced} color="error" />
              <StatusChip label="COMPLAINED" value={data.totals.complained} color="warning" />
              <StatusChip label="SUPPRESSED" value={data.totals.suppressed} color="default" />
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Top campañas (por enviados)
            </Typography>
            {data.topCampaigns.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                No hay envíos en esta ventana.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Campaña</TableCell>
                      <TableCell align="right">Enviados</TableCell>
                      <TableCell align="right">Aperturas únicas</TableCell>
                      <TableCell align="right">Open rate</TableCell>
                      <TableCell align="right">Clicks únicos</TableCell>
                      <TableCell align="right">Click rate</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.topCampaigns.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {c.name}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{c.sent.toLocaleString()}</TableCell>
                        <TableCell align="right">{c.uniqueOpens.toLocaleString()}</TableCell>
                        <TableCell align="right">{formatRate(c.openRate)}</TableCell>
                        <TableCell align="right">{c.uniqueClicks.toLocaleString()}</TableCell>
                        <TableCell align="right">{formatRate(c.clickRate)}</TableCell>
                        <TableCell align="right">
                          <Button
                            component={RouterLink}
                            to={`/dashboard/email/campaigns/${c.id}`}
                            size="small"
                          >
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          <Typography variant="caption" color="text.disabled">
            Ventana: {new Date(data.from).toLocaleString()} → {new Date(data.to).toLocaleString()}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

interface KpiCardProps {
  icon: React.ReactElement;
  label: string;
  value: string;
  hint: string;
  color: 'primary' | 'success' | 'info' | 'warning';
}

function KpiCard({ icon, label, value, hint, color }: KpiCardProps) {
  return (
    <Paper sx={{ p: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
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

function StatusChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'success' | 'error' | 'warning' | 'default';
}) {
  return (
    <Chip
      label={`${label}: ${value.toLocaleString()}`}
      color={color}
      variant={value === 0 ? 'outlined' : 'filled'}
      size="small"
    />
  );
}

function formatRate(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}
