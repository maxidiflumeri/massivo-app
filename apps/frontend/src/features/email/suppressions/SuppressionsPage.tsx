import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type {
  BounceListResponse,
  BounceRow,
  CreateUnsubscribePayload,
  UnsubscribeListResponse,
  UnsubscribeRow,
  UnsubscribeScope,
} from './types';

const PAGE_SIZE = 50;

export function SuppressionsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();

  const [tab, setTab] = useState<'unsubscribes' | 'bounces'>('unsubscribes');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [unsubscribes, setUnsubscribes] = useState<UnsubscribeRow[]>([]);
  const [unsubCursor, setUnsubCursor] = useState<string | null>(null);
  const [bounces, setBounces] = useState<BounceRow[]>([]);
  const [bounceCursor, setBounceCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; scope: UnsubscribeScope; reason: string }>({
    email: '',
    scope: 'GLOBAL',
    reason: '',
  });
  const [saving, setSaving] = useState(false);

  const buildQs = useCallback(
    (cursor: string | null) => {
      const p = new URLSearchParams();
      if (cursor) p.set('cursor', cursor);
      if (appliedSearch) p.set('email', appliedSearch);
      p.set('limit', String(PAGE_SIZE));
      return p.toString();
    },
    [appliedSearch],
  );

  const loadUnsubFirst = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQs(null);
      const res = await api.get<UnsubscribeListResponse>(
        `/api/email/suppressions/unsubscribes?${qs}`,
      );
      setUnsubscribes(res.items);
      setUnsubCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando unsubscribes');
    } finally {
      setLoading(false);
    }
  }, [api, buildQs, notify]);

  const loadBouncesFirst = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQs(null);
      const res = await api.get<BounceListResponse>(`/api/email/suppressions/bounces?${qs}`);
      setBounces(res.items);
      setBounceCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando bounces');
    } finally {
      setLoading(false);
    }
  }, [api, buildQs, notify]);

  useEffect(() => {
    if (tab === 'unsubscribes') void loadUnsubFirst();
    else void loadBouncesFirst();
    // Refetch en cambio de tab o filtro aplicado. api/loaders se omiten a propósito
    // para evitar loop por el objeto nuevo de useApi en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, appliedSearch]);

  async function loadMoreUnsub() {
    if (!unsubCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildQs(unsubCursor);
      const res = await api.get<UnsubscribeListResponse>(
        `/api/email/suppressions/unsubscribes?${qs}`,
      );
      setUnsubscribes((p) => [...p, ...res.items]);
      setUnsubCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando más');
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreBounces() {
    if (!bounceCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildQs(bounceCursor);
      const res = await api.get<BounceListResponse>(`/api/email/suppressions/bounces?${qs}`);
      setBounces((p) => [...p, ...res.items]);
      setBounceCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando más');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDeleteUnsub(row: UnsubscribeRow) {
    const ok = await confirm({
      title: 'Quitar de la lista',
      message: `¿Quitar a ${row.email} de la suppression list? Volverá a recibir emails.`,
      confirmText: 'Quitar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/email/suppressions/unsubscribes/${row.id}`);
      setUnsubscribes((p) => p.filter((u) => u.id !== row.id));
      notify.success('Unsubscribe removido');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error al borrar');
    }
  }

  async function handleDeleteBounce(row: BounceRow) {
    const ok = await confirm({
      title: 'Borrar bounce',
      message: `¿Borrar el registro de bounce de ${row.email ?? '(email desconocido)'}?`,
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/email/suppressions/bounces/${row.id}`);
      setBounces((p) => p.filter((b) => b.id !== row.id));
      notify.success('Bounce removido');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error al borrar');
    }
  }

  function openEditor() {
    setForm({ email: '', scope: 'GLOBAL', reason: '' });
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!form.email.trim()) {
      notify.error('Email requerido');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateUnsubscribePayload = {
        email: form.email.trim(),
        scope: form.scope,
      };
      if (form.reason.trim()) payload.reason = form.reason.trim();
      await api.post('/api/email/suppressions/unsubscribes', payload);
      notify.success('Email agregado a la lista');
      setEditorOpen(false);
      void loadUnsubFirst();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Suppression list
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Emails que no recibirán envíos: unsubscribes manuales, opt-out por link y bounces hard.
          </Typography>
        </Box>
        {tab === 'unsubscribes' && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openEditor}>
            Agregar manual
          </Button>
        )}
      </Box>

      <Paper>
        <Tabs
          value={tab}
          onChange={(_, v: 'unsubscribes' | 'bounces') => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab value="unsubscribes" label="Unsubscribes" />
          <Tab value="bounces" label="Bounces" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Buscar por email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedSearch(search.trim());
              }}
              sx={{ flex: 1, maxWidth: 360 }}
            />
            <Button onClick={() => setAppliedSearch(search.trim())}>Buscar</Button>
            {appliedSearch && (
              <Button
                onClick={() => {
                  setSearch('');
                  setAppliedSearch('');
                }}
              >
                Limpiar
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Recargar">
              <IconButton
                size="small"
                onClick={() => (tab === 'unsubscribes' ? void loadUnsubFirst() : void loadBouncesFirst())}
                disabled={loading}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : tab === 'unsubscribes' ? (
            <UnsubscribesTable
              items={unsubscribes}
              onDelete={handleDeleteUnsub}
              nextCursor={unsubCursor}
              loadingMore={loadingMore}
              onLoadMore={loadMoreUnsub}
            />
          ) : (
            <BouncesTable
              items={bounces}
              onDelete={handleDeleteBounce}
              nextCursor={bounceCursor}
              loadingMore={loadingMore}
              onLoadMore={loadMoreBounces}
            />
          )}
        </Box>
      </Paper>

      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar email a la suppression list</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              select
              label="Alcance"
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as UnsubscribeScope }))}
              helperText={
                form.scope === 'GLOBAL'
                  ? 'Bloquea todos los envíos del team a este email.'
                  : 'Bloquea sólo una campaña específica (manual: usar GLOBAL).'
              }
            >
              <MenuItem value="GLOBAL">Global (todo el team)</MenuItem>
              <MenuItem value="CAMPAIGN" disabled>
                Campaign (no disponible manual)
              </MenuItem>
            </TextField>
            <TextField
              label="Motivo (opcional)"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Ej: pidió por slack"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Agregar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface UnsubTableProps {
  items: UnsubscribeRow[];
  onDelete: (row: UnsubscribeRow) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function UnsubscribesTable({ items, onDelete, nextCursor, loadingMore, onLoadMore }: UnsubTableProps) {
  if (items.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
        No hay unsubscribes registrados.
      </Typography>
    );
  }
  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Alcance</TableCell>
              <TableCell>Origen</TableCell>
              <TableCell>Motivo</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Fecha</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {r.email}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.scope}
                    color={r.scope === 'GLOBAL' ? 'default' : 'info'}
                  />
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={r.source ?? '—'} />
                </TableCell>
                <TableCell sx={{ maxWidth: 240 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {r.reason ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {new Date(r.createdAt).toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Quitar de la lista">
                    <IconButton size="small" onClick={() => onDelete(r)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {nextCursor && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </Button>
        </Box>
      )}
    </>
  );
}

interface BounceTableProps {
  items: BounceRow[];
  onDelete: (row: BounceRow) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function BouncesTable({ items, onDelete, nextCursor, loadingMore, onLoadMore }: BounceTableProps) {
  if (items.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
        No hay bounces registrados.
      </Typography>
    );
  }
  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Motivo</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Fecha</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {r.email ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.code ?? '—'}
                    color={r.code === 'hard' ? 'error' : 'warning'}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 320 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {r.description ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {new Date(r.occurredAt).toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Borrar registro">
                    <IconButton size="small" onClick={() => onDelete(r)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {nextCursor && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </Button>
        </Box>
      )}
    </>
  );
}
