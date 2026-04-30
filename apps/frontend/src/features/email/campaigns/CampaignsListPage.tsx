import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useApi } from '../../../api/client';
import { useTeamSocket } from '../../../realtime/useTeamSocket';
import type { CampaignListItem, CampaignStatus } from './types';

const STATUS_COLOR: Record<CampaignStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'default',
  SCHEDULED: 'info',
  PROCESSING: 'warning',
  PAUSED: 'warning',
  COMPLETED: 'success',
  FAILED: 'error',
};

export function CampaignsListPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [items, setItems] = useState<CampaignListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const socket = useTeamSocket();

  async function load() {
    try {
      const data = await api.get<CampaignListItem[]>('/api/email/campaigns');
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando campañas');
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
    socket.on('email.report.updated', handler);
    return () => {
      socket.off('email.report.updated', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await api.post<CampaignListItem>('/api/email/campaigns', {
        name: newName.trim(),
      });
      setOpenNew(false);
      setNewName('');
      navigate(`/dashboard/email/campaigns/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando campaña');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Borrar esta campaña?')) return;
    try {
      await api.delete(`/api/email/campaigns/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error borrando');
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Campañas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenNew(true)}>
          Nueva campaña
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {items === null && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {items !== null && items.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No hay campañas aún. Creá la primera.</Typography>
        </Paper>
      )}

      {items !== null && items.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Contactos</TableCell>
                <TableCell align="right">Reports</TableCell>
                <TableCell>Programada</TableCell>
                <TableCell>Creada</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <RouterLink
                      to={`/dashboard/email/campaigns/${c.id}`}
                      style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}
                    >
                      {c.name}
                    </RouterLink>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={c.status} color={STATUS_COLOR[c.status]} />
                  </TableCell>
                  <TableCell align="right">{c._count.contacts}</TableCell>
                  <TableCell align="right">{c._count.reports}</TableCell>
                  <TableCell>{c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : '—'}</TableCell>
                  <TableCell>{new Date(c.createdAt).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Borrar">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={c.status === 'PROCESSING'}
                          onClick={() => handleDelete(c.id)}
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

      <Dialog open={openNew} onClose={() => setOpenNew(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nueva campaña</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nombre"
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
