import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import {
  EMPTY_SEARCH_FILTERS,
  type Contact,
  type ContactPage,
  type SearchFilters,
} from './types';

const PAGE_SIZE = 50;

export function ContactsListPage() {
  const api = useApi();
  const notify = useNotify();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS);
  const [items, setItems] = useState<Contact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildQs = useCallback(
    (nextCursor: string | null) => {
      const p = new URLSearchParams();
      if (nextCursor) p.set('cursor', nextCursor);
      p.set('limit', String(PAGE_SIZE));
      if (appliedFilters.q.trim()) p.set('q', appliedFilters.q.trim());
      if (appliedFilters.tags.length > 0) p.set('tags', appliedFilters.tags.join(','));
      if (appliedFilters.channel) p.set('channel', appliedFilters.channel);
      if (appliedFilters.hasOpened) p.set('hasOpened', 'true');
      if (appliedFilters.hasClicked) p.set('hasClicked', 'true');
      if (appliedFilters.hasBounced) p.set('hasBounced', 'true');
      p.set('sort', appliedFilters.sort);
      p.set('direction', appliedFilters.direction);
      return p.toString();
    },
    [appliedFilters],
  );

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ContactPage>(`/api/contacts/search?${buildQs(null)}`);
      setItems(res.items);
      setCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando contactos');
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
      const res = await api.get<ContactPage>(`/api/contacts/search?${buildQs(cursor)}`);
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
    setFilters(EMPTY_SEARCH_FILTERS);
    setAppliedFilters(EMPTY_SEARCH_FILTERS);
  }

  const hasActiveFilters = useMemo(() => {
    const f = appliedFilters;
    return (
      f.q.trim() !== '' ||
      f.tags.length > 0 ||
      f.channel !== '' ||
      f.hasOpened ||
      f.hasClicked ||
      f.hasBounced ||
      f.sort !== EMPTY_SEARCH_FILTERS.sort ||
      f.direction !== EMPTY_SEARCH_FILTERS.direction
    );
  }, [appliedFilters]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Contactos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Vista unificada cross-canal: email + WhatsApp + auditoría.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            component={RouterLink}
            to="/dashboard/contacts/merge"
            startIcon={<MergeTypeIcon />}
            variant="outlined"
          >
            Sugerencias de merge
          </Button>
          <Button
            component={RouterLink}
            to="/dashboard/contacts/import"
            startIcon={<UploadFileIcon />}
            variant="contained"
          >
            Importar CSV
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Buscar"
              placeholder="Nombre, email, teléfono, externalId…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Canal</InputLabel>
              <Select
                label="Canal"
                value={filters.channel}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, channel: e.target.value as SearchFilters['channel'] }))
                }
              >
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="email">Email</MenuItem>
                <MenuItem value="wapi">WhatsApp</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Ordenar por</InputLabel>
              <Select
                label="Ordenar por"
                value={`${filters.sort}|${filters.direction}`}
                onChange={(e) => {
                  const [sort, direction] = String(e.target.value).split('|') as [
                    SearchFilters['sort'],
                    SearchFilters['direction'],
                  ];
                  setFilters((f) => ({ ...f, sort, direction }));
                }}
              >
                <MenuItem value="updatedAt|desc">Última edición ↓</MenuItem>
                <MenuItem value="updatedAt|asc">Última edición ↑</MenuItem>
                <MenuItem value="createdAt|desc">Creación ↓</MenuItem>
                <MenuItem value="createdAt|asc">Creación ↑</MenuItem>
                <MenuItem value="name|asc">Nombre A→Z</MenuItem>
                <MenuItem value="name|desc">Nombre Z→A</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.hasOpened}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, hasOpened: e.target.checked }))
                    }
                  />
                }
                label="Abrió email"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.hasClicked}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, hasClicked: e.target.checked }))
                    }
                  />
                }
                label="Clickeó email"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.hasBounced}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, hasBounced: e.target.checked }))
                    }
                  />
                }
                label="Email rebotó"
              />
            </Stack>
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} alignItems="center">
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
            No hay contactos para los filtros aplicados.
          </Typography>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Teléfono</TableCell>
                    <TableCell>External ID</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      Actualizado
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((c) => (
                    <TableRow
                      key={c.id}
                      hover
                      onClick={() => navigate(`/dashboard/contacts/${c.id}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {formatName(c) ?? <em style={{ opacity: 0.6 }}>(sin nombre)</em>}
                        </Typography>
                        {(c.dni || c.cuit) && (
                          <Typography variant="caption" color="text.secondary">
                            {c.dni && `DNI ${c.dni}`}
                            {c.dni && c.cuit && ' · '}
                            {c.cuit && `CUIT ${c.cuit}`}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{c.email ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {c.phoneE164 ?? c.phone ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {c.externalId ? (
                          <Chip size="small" label={c.externalId} sx={{ fontFamily: 'monospace' }} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(c.updatedAt).toLocaleString()}
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
    </Box>
  );
}

function formatName(c: Contact): string | null {
  const parts = [c.firstName, c.lastName].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(' ');
  return c.email ?? c.phoneE164 ?? c.phone ?? c.externalId ?? null;
}
