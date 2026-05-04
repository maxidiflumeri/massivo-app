import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
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
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type {
  WapiCampaignReportListResponse,
  WapiCampaignReportRow,
  WapiReportStatus,
} from './types';

const STATUS_OPTIONS: Array<{ value: '' | WapiReportStatus; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'SENT', label: 'Enviados' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'READ', label: 'Leídos' },
  { value: 'FAILED', label: 'Fallidos' },
  { value: 'CANCELED', label: 'Cancelados' },
];

const STATUS_COLOR: Record<
  WapiReportStatus,
  'default' | 'info' | 'warning' | 'success' | 'error'
> = {
  PENDING: 'default',
  SENT: 'success',
  DELIVERED: 'info',
  READ: 'info',
  FAILED: 'error',
  CANCELED: 'default',
};

const PAGE_SIZE = 50;

interface Props {
  campaignId: string;
  refreshKey?: number;
}

export function WapiCampaignSendsSection({ campaignId, refreshKey }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [statusFilter, setStatusFilter] = useState<'' | WapiReportStatus>('');
  const [items, setItems] = useState<WapiCampaignReportRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string | null, status: '' | WapiReportStatus) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (status) params.set('status', status);
      params.set('limit', String(PAGE_SIZE));
      const qs = params.toString();
      const url = `/api/wapi/campaigns/${campaignId}/reports${qs ? `?${qs}` : ''}`;
      return api.get<WapiCampaignReportListResponse>(url);
    },
    [api, campaignId],
  );

  const loadFirstPage = useCallback(
    async (status: '' | WapiReportStatus) => {
      setLoading(true);
      try {
        const res = await fetchPage(null, status);
        setItems(res.items);
        setNextCursor(res.nextCursor);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'Error cargando envíos');
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, notify],
  );

  useEffect(() => {
    void loadFirstPage(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, statusFilter, refreshKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(nextCursor, statusFilter);
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando más');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6">Envíos</Typography>
        <TextField
          select
          size="small"
          label="Estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | WapiReportStatus)}
          sx={{ minWidth: 180 }}
        >
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Recargar">
          <IconButton size="small" onClick={() => void loadFirstPage(statusFilter)} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No hay envíos {statusFilter ? `con estado ${statusFilter}` : 'todavía'}.
        </Typography>
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Contacto</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Enviado</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Entregado</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Leído</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {r.contact?.name ?? r.phone}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {r.phone}
                      </Typography>
                      {r.error && (
                        <Tooltip title={r.error} arrow>
                          <Typography
                            variant="caption"
                            color="error"
                            noWrap
                            sx={{ display: 'block', maxWidth: 260 }}
                          >
                            ⚠ {r.error}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="column" spacing={0.5} alignItems="flex-start">
                        <Chip size="small" label={r.status} color={STATUS_COLOR[r.status]} />
                        {r.metaMessageId && (
                          <Typography variant="caption" color="text.disabled" noWrap>
                            wamid: …{r.metaMessageId.slice(-12)}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {r.readAt ? new Date(r.readAt).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {nextCursor && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}
