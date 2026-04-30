import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
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
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type {
  CreateSmtpAccountPayload,
  SmtpAccount,
  SmtpProvider,
  UpdateSmtpAccountPayload,
} from './types';

interface FormState {
  name: string;
  provider: SmtpProvider;
  host: string;
  port: string;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  sesConfigSet: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  provider: 'smtp',
  host: '',
  port: '587',
  username: '',
  password: '',
  fromName: '',
  fromEmail: '',
  sesConfigSet: '',
  isActive: true,
};

export function SmtpAccountsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<SmtpAccount[] | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SmtpAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<SmtpAccount | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  const isEditing = useMemo(() => editing !== null, [editing]);

  async function load() {
    try {
      const data = await api.get<SmtpAccount[]>('/api/email/smtp-accounts');
      setAccounts(data);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando cuentas SMTP');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(acc: SmtpAccount) {
    setEditing(acc);
    setForm({
      name: acc.name,
      provider: acc.provider,
      host: acc.host,
      port: String(acc.port),
      username: acc.username,
      password: '',
      fromName: acc.fromName,
      fromEmail: acc.fromEmail,
      sesConfigSet: acc.sesConfigSet ?? '',
      isActive: acc.isActive,
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
  }

  async function handleSave() {
    const portNum = Number(form.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      notify.error('Puerto inválido');
      return;
    }
    if (!isEditing && !form.password) {
      notify.error('La contraseña es obligatoria al crear');
      return;
    }
    setSaving(true);
    try {
      if (isEditing && editing) {
        const payload: UpdateSmtpAccountPayload = {
          name: form.name,
          provider: form.provider,
          host: form.host,
          port: portNum,
          username: form.username,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          isActive: form.isActive,
          sesConfigSet: form.provider === 'ses' ? form.sesConfigSet || undefined : undefined,
        };
        if (form.password) payload.password = form.password;
        await api.patch(`/api/email/smtp-accounts/${editing.id}`, payload);
        notify.success('Cuenta SMTP actualizada');
      } else {
        const payload: CreateSmtpAccountPayload = {
          name: form.name,
          provider: form.provider,
          host: form.host,
          port: portNum,
          username: form.username,
          password: form.password,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          sesConfigSet: form.provider === 'ses' ? form.sesConfigSet || undefined : undefined,
        };
        await api.post('/api/email/smtp-accounts', payload);
        notify.success('Cuenta SMTP creada');
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(acc: SmtpAccount) {
    const ok = await confirm({
      title: 'Borrar cuenta SMTP',
      message: `¿Seguro que querés borrar "${acc.name}"? Las campañas que la usen pueden romperse.`,
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/email/smtp-accounts/${acc.id}`);
      notify.success('Cuenta SMTP eliminada');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error borrando');
    }
  }

  function openTest(acc: SmtpAccount) {
    setTestTarget(acc);
    setTestTo('');
    setTestOpen(true);
  }

  async function handleTestSend() {
    if (!testTarget) return;
    if (!testTo) {
      notify.error('Ingresá un email destinatario');
      return;
    }
    setTesting(true);
    try {
      const res = await api.post<{ ok: true; messageId: string | null }>(
        `/api/email/smtp-accounts/${testTarget.id}/test`,
        { to: testTo },
      );
      notify.success(
        res.messageId ? `Email enviado (id: ${res.messageId})` : 'Email enviado',
      );
      setTestOpen(false);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error enviando prueba');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4">Cuentas SMTP</Typography>
          <Typography variant="body2" color="text.secondary">
            Configurá los servidores de salida (SMTP genérico o AWS SES) para tus campañas.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Nueva cuenta
        </Button>
      </Box>

      {accounts === null && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={48} />
            ))}
          </Stack>
        </Paper>
      )}

      {accounts !== null && accounts.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No hay cuentas SMTP configuradas. Creá la primera para enviar campañas.
          </Typography>
        </Paper>
      )}

      {accounts !== null && accounts.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Host</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>From</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{a.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={a.provider.toUpperCase()}
                      color={a.provider === 'ses' ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {a.host}:{a.port}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {a.fromName} &lt;{a.fromEmail}&gt;
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={a.isActive ? 'Activa' : 'Inactiva'}
                      color={a.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Enviar prueba">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => openTest(a)}
                          disabled={!a.isActive}
                        >
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openEdit(a)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Borrar">
                      <IconButton size="small" color="error" onClick={() => handleDelete(a)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onClose={closeEditor} fullWidth maxWidth="sm">
        <DialogTitle>{isEditing ? 'Editar cuenta SMTP' : 'Nueva cuenta SMTP'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              select
              label="Proveedor"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as SmtpProvider })}
              fullWidth
              helperText="SMTP: servidor genérico vía nodemailer. SES: AWS SES API (recomendado para volumen)."
            >
              <MenuItem value="smtp">SMTP</MenuItem>
              <MenuItem value="ses">AWS SES</MenuItem>
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Host"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="Puerto"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                sx={{ width: 120 }}
                required
              />
            </Stack>
            <TextField
              label="Usuario"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label={isEditing ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              fullWidth
              required={!isEditing}
              autoComplete="new-password"
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="From (nombre)"
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="From (email)"
                type="email"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                fullWidth
                required
              />
            </Stack>
            {form.provider === 'ses' && (
              <TextField
                label="SES Configuration Set (opcional)"
                value={form.sesConfigSet}
                onChange={(e) => setForm({ ...form, sesConfigSet: e.target.value })}
                fullWidth
                helperText="Si lo dejás vacío, se autoprovisiona uno por team."
              />
            )}
            {isEditing && (
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                }
                label="Activa"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test send dialog */}
      <Dialog open={testOpen} onClose={() => !testing && setTestOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Enviar email de prueba</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Vas a enviar un email de prueba usando la cuenta{' '}
              <strong>{testTarget?.name}</strong>.
            </Typography>
            <TextField
              label="Email destinatario"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              fullWidth
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestOpen(false)} disabled={testing}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleTestSend} disabled={testing}>
            {testing ? 'Enviando…' : 'Enviar prueba'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
