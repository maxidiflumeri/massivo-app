import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Skeleton,
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
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useApi } from '../../../api/client';
import { useTeamSocket } from '../../../realtime/useTeamSocket';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type { WapiCampaignListItem, WapiCampaignStatus } from './types';

const STATUS_COLOR: Record<
  WapiCampaignStatus,
  'default' | 'info' | 'warning' | 'success' | 'error'
> = {
  DRAFT: 'default',
  SCHEDULED: 'info',
  PROCESSING: 'warning',
  PAUSED: 'warning',
  COMPLETED: 'success',
  FAILED: 'error',
};

type StatusTab = 'ALL' | WapiCampaignStatus;
const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'SCHEDULED', label: 'Programadas' },
  { value: 'PROCESSING', label: 'En envío' },
  { value: 'PAUSED', label: 'Pausadas' },
  { value: 'COMPLETED', label: 'Completadas' },
  { value: 'FAILED', label: 'Fallidas' },
];

export function WapiCampaignsListPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [items, setItems] = useState<WapiCampaignListItem[] | null>(null);
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [openNew, setOpenNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const socket = useTeamSocket();

  async function load() {
    try {
      const data = await api.get<WapiCampaignListItem[]>('/api/wapi/campaigns');
      setItems(data);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando campañas');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      void load();
    };
    socket.on('wapi.report.updated', handler);
    return () => {
      socket.off('wapi.report.updated', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const counts = useMemo(() => {
    const acc: Record<StatusTab, number> = {
      ALL: 0,
      DRAFT: 0,
      SCHEDULED: 0,
      PROCESSING: 0,
      PAUSED: 0,
      COMPLETED: 0,
      FAILED: 0,
    };
    if (!items) return acc;
    acc.ALL = items.length;
    for (const c of items) acc[c.status] += 1;
    return acc;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (tab === 'ALL') return items;
    return items.filter((c) => c.status === tab);
  }, [items, tab]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await api.post<WapiCampaignListItem>('/api/wapi/campaigns', {
        name: newName.trim(),
      });
      setOpenNew(false);
      setNewName('');
      notify.success('Campaña creada');
      navigate(`/dashboard/wapi/campaigns/${created.id}`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error creando campaña');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(c: WapiCampaignListItem) {
    const ok = await confirm({
      title: 'Borrar campaña',
      message: `¿Seguro que querés borrar "${c.name}"? Se perderán contactos y reports asociados.`,
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/wapi/campaigns/${c.id}`);
      notify.success('Campaña eliminada');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error borrando');
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <WhatsAppIcon color="success" />
          <Typography variant="h4">Campañas WhatsApp</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenNew(true)}>
          Nueva campaña
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v: StatusTab) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          {STATUS_TABS.map((t) => (
            <Tab
              key={t.value}
              value={t.value}
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{t.label}</span>
                  <Chip
                    size="small"
                    label={counts[t.value]}
                    sx={{ height: 18, fontSize: 11, fontWeight: 600 }}
                  />
                </Stack>
              }
              sx={{ textTransform: 'none', minHeight: 48 }}
            />
          ))}
        </Tabs>

        {items === null && (
          <Box sx={{ p: 2 }}>
            <Stack spacing={1}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" height={48} />
              ))}
            </Stack>
          </Box>
        )}

        {filtered !== null && filtered.length === 0 && (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <WhatsAppIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">
              {tab === 'ALL'
                ? 'No hay campañas aún. Creá la primera.'
                : 'No hay campañas en este estado.'}
            </Typography>
          </Box>
        )}

        {filtered !== null && filtered.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    Contactos
                  </TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    Reports
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    Programada
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Creada</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <RouterLink
                        to={`/dashboard/wapi/campaigns/${c.id}`}
                        style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}
                      >
                        {c.name}
                      </RouterLink>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: { xs: 'block', sm: 'none' } }}
                      >
                        {c._count.contacts} contactos · {c._count.reports} reports
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={c.status} color={STATUS_COLOR[c.status]} />
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {c._count.contacts}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {c._count.reports}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {new Date(c.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Borrar">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={c.status === 'PROCESSING'}
                            onClick={() => handleDelete(c)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={openNew} onClose={() => setOpenNew(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nueva campaña WhatsApp</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Empezá con un nombre. Después configurás template, número de origen y contactos.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Nombre de la campaña"
            placeholder="Ej: Bienvenida clientes mayo"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            inputProps={{ maxLength: 160 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNew(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim() || creating}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
