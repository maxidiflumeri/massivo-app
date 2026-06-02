import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useApi, ApiError } from '../../../api/client';
import { TransactionalDetailDrawer } from './TransactionalDetailDrawer';

interface TransactionalReport {
  id: string;
  recipientEmail: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'BOUNCED' | 'COMPLAINED' | 'SUPPRESSED';
  subject: string | null;
  createdAt: string;
  sentAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  smtpMessageId: string | null;
  error: string | null;
}

interface ListResponse {
  items: TransactionalReport[];
  total: number;
  page: number;
  pageSize: number;
}

interface Metrics {
  days: number;
  sent: number;
  failed: number;
  opens: number;
  clicks: number;
  bounces: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

const STATUSES = ['', 'SENT', 'FAILED', 'BOUNCED', 'COMPLAINED', 'PENDING', 'SUPPRESSED'] as const;

const STATUS_COLOR: Record<TransactionalReport['status'], 'default' | 'success' | 'error' | 'warning'> = {
  PENDING: 'warning',
  SENT: 'success',
  FAILED: 'error',
  BOUNCED: 'error',
  COMPLAINED: 'error',
  SUPPRESSED: 'default',
};

const STATUS_LABEL: Record<TransactionalReport['status'], string> = {
  PENDING: 'En cola',
  SENT: 'Enviado',
  FAILED: 'Falló',
  BOUNCED: 'Rebotó',
  COMPLAINED: 'Quejado',
  SUPPRESSED: 'Suprimido',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TransactionalListPage() {
  const api = useApi();
  const [rows, setRows] = useState<TransactionalReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [recipientFilter, setRecipientFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (recipientFilter.trim()) params.set('recipient', recipientFilter.trim());
      const qs = params.toString();
      const [list, m] = await Promise.all([
        api.get<ListResponse>(`/api/email/transactional/reports${qs ? '?' + qs : ''}`),
        api.get<Metrics>('/api/email/transactional/metrics?days=30'),
      ]);
      setRows(list.items);
      setTotal(list.total);
      setMetrics(m);
    } catch (err) {
      const e = err as ApiError;
      setError(e.message ?? 'No se pudo cargar la lista.');
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, recipientFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Emails transaccionales
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Envíos one-shot disparados desde bots o integraciones (no campañas). Tracking de
          aperturas y clicks activo.
        </Typography>
      </Box>

      {/* Métricas (últimos 30 días) */}
      {metrics && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {[
            { label: 'Enviados', value: metrics.sent, icon: <MarkEmailReadIcon />, color: 'primary.main' },
            { label: 'Aperturas', value: metrics.opens, sub: `${metrics.openRate}%`, icon: <VisibilityIcon />, color: 'success.main' },
            { label: 'Clicks', value: metrics.clicks, sub: `${metrics.clickRate}%`, icon: <TouchAppIcon />, color: 'info.main' },
            { label: 'Fallos', value: metrics.failed + metrics.bounces, icon: <ErrorOutlineIcon />, color: 'error.main' },
          ].map((m) => (
            <Paper key={m.label} variant="outlined" sx={{ p: 2, flex: 1 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box sx={{ color: m.color }}>{m.icon}</Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {m.label} (30d)
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography variant="h5" fontWeight={700}>
                      {m.value.toLocaleString('es-AR')}
                    </Typography>
                    {m.sub && (
                      <Typography variant="body2" color="text.secondary">
                        {m.sub}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Filtros */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
        <TextField
          select
          size="small"
          label="Estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s || '_all'} value={s}>
              {s === '' ? 'Todos' : STATUS_LABEL[s as TransactionalReport['status']]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Buscar mail"
          placeholder="@gmail.com"
          value={recipientFilter}
          onChange={(e) => setRecipientFilter(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <IconButton onClick={() => void load()} disabled={loading}>
          <RefreshIcon />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ pt: 1 }}>
          {total} envíos
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Destinatario</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Abierto</TableCell>
                <TableCell align="center">Click</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress size={24} sx={{ my: 2 }} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                      No hay envíos transaccionales en el rango seleccionado.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((r) => (
                  <TableRow
                    key={r.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {formatDate(r.sentAt ?? r.createdAt)}
                    </TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{r.recipientEmail ?? '—'}</TableCell>
                    <TableCell sx={{ fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.subject ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABEL[r.status]}
                        color={STATUS_COLOR[r.status]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {r.firstOpenedAt ? (
                        <Tooltip title={formatDate(r.firstOpenedAt)}>
                          <CheckCircleIcon fontSize="small" color="success" />
                        </Tooltip>
                      ) : (
                        <HourglassEmptyIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {r.firstClickedAt ? (
                        <Tooltip title={formatDate(r.firstClickedAt)}>
                          <CheckCircleIcon fontSize="small" color="info" />
                        </Tooltip>
                      ) : (
                        <HourglassEmptyIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                      )}
                    </TableCell>
                    <TableCell padding="none" sx={{ pr: 1 }}>
                      <IconButton size="small" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(r.id);
                      }}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <TransactionalDetailDrawer
        open={!!selectedId}
        reportId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </Stack>
  );
}
