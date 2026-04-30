import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
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
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type {
  CampaignReportEvent,
  CampaignReportListResponse,
  CampaignReportRow,
  EmailReportStatus,
} from './types';

const STATUS_OPTIONS: Array<{ value: '' | EmailReportStatus; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'SENT', label: 'Enviados' },
  { value: 'FAILED', label: 'Fallidos' },
  { value: 'BOUNCED', label: 'Bounced' },
  { value: 'COMPLAINED', label: 'Complaints' },
  { value: 'SUPPRESSED', label: 'Suprimidos' },
];

const STATUS_COLOR: Record<
  EmailReportStatus,
  'default' | 'info' | 'warning' | 'success' | 'error'
> = {
  PENDING: 'default',
  SENT: 'success',
  FAILED: 'error',
  BOUNCED: 'error',
  COMPLAINED: 'warning',
  SUPPRESSED: 'default',
};

const PAGE_SIZE = 50;

interface Props {
  campaignId: string;
  /** Llave para forzar refresh externo (incrementar al recibir socket update). */
  refreshKey?: number;
}

export function CampaignSendsSection({ campaignId, refreshKey }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [statusFilter, setStatusFilter] = useState<'' | EmailReportStatus>('');
  const [items, setItems] = useState<CampaignReportRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsTarget, setEventsTarget] = useState<CampaignReportRow | null>(null);
  const [events, setEvents] = useState<CampaignReportEvent[] | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null, status: '' | EmailReportStatus) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (status) params.set('status', status);
      params.set('limit', String(PAGE_SIZE));
      const qs = params.toString();
      const url = `/api/email/campaigns/${campaignId}/reports${qs ? `?${qs}` : ''}`;
      return api.get<CampaignReportListResponse>(url);
    },
    [api, campaignId],
  );

  const loadFirstPage = useCallback(
    async (status: '' | EmailReportStatus) => {
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
    // loadFirstPage depende de `api` (useApi devuelve un objeto nuevo por render),
    // así que incluirla acá dispararía un loop infinito. Sólo refetch al cambiar
    // filtro / campaignId / refreshKey externo.
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

  async function openEvents(row: CampaignReportRow) {
    setEventsTarget(row);
    setEvents(null);
    setEventsOpen(true);
    try {
      const list = await api.get<CampaignReportEvent[]>(
        `/api/email/campaigns/${campaignId}/reports/${row.id}/events`,
      );
      setEvents(list);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando eventos');
      setEventsOpen(false);
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h6">Envíos</Typography>
        <TextField
          select
          size="small"
          label="Estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | EmailReportStatus)}
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
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>1ª apertura</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>1er click</TableCell>
                  <TableCell align="right">Eventos</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {r.contact.email}
                      </Typography>
                      {r.contact.name && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {r.contact.name}
                        </Typography>
                      )}
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
                      <Chip size="small" label={r.status} color={STATUS_COLOR[r.status]} />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {r.firstOpenedAt ? new Date(r.firstOpenedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {r.firstClickedAt ? new Date(r.firstClickedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={r._count.events} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Ver eventos">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => openEvents(r)}
                            disabled={r._count.events === 0}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
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

      {/* Drilldown dialog */}
      <Dialog
        open={eventsOpen}
        onClose={() => setEventsOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="div" noWrap>
              Eventos — {eventsTarget?.contact.email}
            </Typography>
            {eventsTarget?.smtpMessageId && (
              <Typography variant="caption" color="text.secondary" noWrap>
                Message ID: {eventsTarget.smtpMessageId}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => setEventsOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {events === null ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : events.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Sin eventos registrados.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {events.map((ev) => (
                <Box
                  key={ev.id}
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip
                      size="small"
                      label={ev.type}
                      color={ev.type === 'CLICK' ? 'primary' : 'info'}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(ev.occurredAt).toLocaleString()}
                    </Typography>
                  </Box>
                  {ev.targetUrl && (
                    <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" sx={{ wordBreak: 'break-all', flex: 1 }}>
                        {ev.targetUrl}
                      </Typography>
                      <IconButton
                        size="small"
                        component="a"
                        href={ev.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <OpenInNewIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  )}
                  <Typography variant="caption" color="text.secondary" component="div">
                    {[
                      ev.ip,
                      ev.deviceFamily,
                      ev.osName && `${ev.osName}${ev.osVersion ? ` ${ev.osVersion}` : ''}`,
                      ev.browserName &&
                        `${ev.browserName}${ev.browserVersion ? ` ${ev.browserVersion}` : ''}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                  {ev.userAgent && (
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      component="div"
                      sx={{ mt: 0.5, fontSize: 11 }}
                    >
                      {ev.userAgent}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
}
