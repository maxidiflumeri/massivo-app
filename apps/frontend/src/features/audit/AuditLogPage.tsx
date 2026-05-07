import { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { EMPTY_FILTERS, type AuditLogFilters, type AuditLogListResponse, type AuditLogRow } from './types';

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const api = useApi();
  const notify = useNotify();

  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);

  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const buildQs = useCallback(
    (nextCursor: string | null) => {
      const p = new URLSearchParams();
      if (nextCursor) p.set('cursor', nextCursor);
      p.set('limit', String(PAGE_SIZE));
      if (appliedFilters.actorUserId) p.set('actorUserId', appliedFilters.actorUserId);
      if (appliedFilters.resourceType) p.set('resourceType', appliedFilters.resourceType);
      if (appliedFilters.resourceId) p.set('resourceId', appliedFilters.resourceId);
      if (appliedFilters.action) p.set('action', appliedFilters.action);
      if (appliedFilters.from) p.set('from', new Date(appliedFilters.from).toISOString());
      if (appliedFilters.to) p.set('to', new Date(appliedFilters.to).toISOString());
      return p.toString();
    },
    [appliedFilters],
  );

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AuditLogListResponse>(`/api/audit-logs?${buildQs(null)}`);
      setItems(res.items);
      setCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando audit log');
    } finally {
      setLoading(false);
    }
  }, [api, buildQs, notify]);

  useEffect(() => {
    void loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get<AuditLogListResponse>(`/api/audit-logs?${buildQs(cursor)}`);
      setItems((p) => [...p, ...res.items]);
      setCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando más');
    } finally {
      setLoadingMore(false);
    }
  }

  function applyFilters() {
    setAppliedFilters({ ...filters });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  }

  const hasActiveFilters = Object.values(appliedFilters).some((v) => v !== '');

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Audit log
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Historial de acciones de la organización: quién hizo qué y cuándo.
        </Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Actor (User ID)"
              value={filters.actorUserId}
              onChange={(e) => setFilters((f) => ({ ...f, actorUserId: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Acción"
              placeholder="ej: wapi.campaign.sent"
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Tipo de recurso"
              placeholder="ej: WapiCampaign"
              value={filters.resourceType}
              onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="ID de recurso"
              value={filters.resourceId}
              onChange={(e) => setFilters((f) => ({ ...f, resourceId: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Desde"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Hasta"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={6}>
            <Stack direction="row" spacing={1} sx={{ height: '100%', alignItems: 'center' }}>
              <Button variant="contained" onClick={applyFilters}>
                Aplicar
              </Button>
              {hasActiveFilters && (
                <Button onClick={clearFilters} color="inherit">
                  Limpiar
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Recargar">
                <IconButton size="small" onClick={() => void loadFirst()} disabled={loading}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Paper>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
            No hay registros para los filtros aplicados.
          </Typography>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Actor</TableCell>
                    <TableCell>Acción</TableCell>
                    <TableCell>Recurso</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>IP</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((row) => (
                    <TableRow
                      key={row.id}
                      hover
                      onClick={() => setSelected(row)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">
                          {new Date(row.createdAt).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.actor ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Avatar src={row.actor.avatarUrl ?? undefined} sx={{ width: 24, height: 24 }}>
                              {(row.actor.name ?? row.actor.email).charAt(0).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                                {row.actor.name ?? row.actor.email}
                              </Typography>
                              {row.actor.name && (
                                <Typography variant="caption" color="text.secondary">
                                  {row.actor.email}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        ) : (
                          <Chip size="small" variant="outlined" label="sistema" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={row.action} sx={{ fontFamily: 'monospace' }} />
                      </TableCell>
                      <TableCell>
                        {row.resourceType ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {row.resourceType}
                            </Typography>
                            {row.resourceId && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontFamily: 'monospace' }}
                              >
                                {row.resourceId}
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {row.ip ?? '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {cursor && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Button onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </Button>
              </Box>
            )}
          </>
        )}
      </Paper>

      <AuditDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}

function AuditDetailDrawer({ row, onClose }: { row: AuditLogRow | null; onClose: () => void }) {
  return (
    <Drawer anchor="right" open={!!row} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
      {row && (
        <Box sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 600 }}>
              Detalle de la acción
            </Typography>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack spacing={2}>
            <Field label="Fecha" value={new Date(row.createdAt).toLocaleString()} />
            <Field label="Acción" value={row.action} mono />
            <Field
              label="Actor"
              value={row.actor ? `${row.actor.name ?? row.actor.email} (${row.actor.email})` : 'Sistema (sin actor)'}
            />
            <Field label="Tipo de recurso" value={row.resourceType ?? '—'} />
            <Field label="ID de recurso" value={row.resourceId ?? '—'} mono />
            <Field label="Team" value={row.teamId ?? '—'} mono />
            <Field label="IP" value={row.ip ?? '—'} mono />
            <Field label="User-Agent" value={row.userAgent ?? '—'} mono small />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Metadata
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                {row.metadata ? JSON.stringify(row.metadata, null, 2) : '—'}
              </Box>
            </Box>
          </Stack>
        </Box>
      )}
    </Drawer>
  );
}

function Field({
  label,
  value,
  mono = false,
  small = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant={small ? 'caption' : 'body2'}
        sx={{
          fontFamily: mono ? 'monospace' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
