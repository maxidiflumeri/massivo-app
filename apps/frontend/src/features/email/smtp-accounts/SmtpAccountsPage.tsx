import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
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
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import VerifiedIcon from '@mui/icons-material/Verified';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type {
  CreateSmtpAccountPayload,
  SmtpAccount,
  SmtpAccountWithVerify,
  SmtpProvider,
  UpdateSmtpAccountPayload,
} from './types';
import type { EmailDomainSummary } from '@massivo/shared-types';

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
  /** Empty string = no domain linked (modo SMTP/SES manual). */
  emailDomainId: string;
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
  emailDomainId: '',
};

export function SmtpAccountsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<SmtpAccount[] | null>(null);
  const [verifiedDomains, setVerifiedDomains] = useState<EmailDomainSummary[]>([]);
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

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

  async function loadVerifiedDomains() {
    try {
      const all = await api.get<EmailDomainSummary[]>('/api/email/domains');
      setVerifiedDomains(all.filter((d) => d.status === 'VERIFIED'));
    } catch {
      // Si falla, dejamos verifiedDomains=[] — el form muestra el path SMTP normal.
      setVerifiedDomains([]);
    }
  }

  useEffect(() => {
    void load();
    void loadVerifiedDomains();
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
      emailDomainId: acc.emailDomainId ?? '',
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
  }

  function applyVerifyResult(res: SmtpAccountWithVerify, action: 'created' | 'updated' | 'verified') {
    setVerifyErrors((prev) => {
      const next = { ...prev };
      if (res.verify.ok) {
        delete next[res.account.id];
      } else {
        next[res.account.id] = res.verify.error;
      }
      return next;
    });
    if (res.verify.ok) {
      const msg =
        action === 'created'
          ? 'Cuenta creada y verificada (activa)'
          : action === 'updated'
            ? 'Cuenta actualizada y verificada (activa)'
            : 'Verificación OK — cuenta activa';
      notify.success(msg);
    } else {
      const head =
        action === 'created'
          ? 'Cuenta creada pero la verificación falló'
          : action === 'updated'
            ? 'Cuenta actualizada pero la verificación falló'
            : 'La verificación falló';
      notify.warning(`${head}: ${res.verify.error}`);
    }
  }

  async function handleSave() {
    const usingDomain = Boolean(form.emailDomainId);
    // Cuando se vincula a un dominio verificado el backend setea provider='ses'
    // y rellena host/port/user/pass con placeholders. No exigimos esos campos
    // en el form.
    const portNum = usingDomain ? null : Number(form.port);
    if (!usingDomain) {
      if (!Number.isInteger(portNum) || (portNum as number) < 1 || (portNum as number) > 65535) {
        notify.error('Puerto inválido');
        return;
      }
      if (!isEditing && !form.password) {
        notify.error('La contraseña es obligatoria al crear');
        return;
      }
    }
    if (usingDomain) {
      const dom = verifiedDomains.find((d) => d.id === form.emailDomainId);
      if (!dom) {
        notify.error('Dominio verificado no encontrado');
        return;
      }
      const fromDomain = form.fromEmail.split('@')[1]?.toLowerCase();
      if (fromDomain !== dom.domain) {
        notify.error(`El email "From" debe terminar en @${dom.domain}`);
        return;
      }
    }
    setSaving(true);
    try {
      let res: SmtpAccountWithVerify;
      if (isEditing && editing) {
        const payload: UpdateSmtpAccountPayload = {
          name: form.name,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          ...(usingDomain
            ? { emailDomainId: form.emailDomainId }
            : {
                provider: form.provider,
                host: form.host,
                port: portNum as number,
                username: form.username,
                sesConfigSet: form.provider === 'ses' ? form.sesConfigSet || undefined : undefined,
                emailDomainId: '',
              }),
        };
        if (form.password) payload.password = form.password;
        res = await api.patch<SmtpAccountWithVerify>(
          `/api/email/smtp-accounts/${editing.id}`,
          payload,
        );
        applyVerifyResult(res, 'updated');
      } else {
        const payload: CreateSmtpAccountPayload = {
          name: form.name,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          ...(usingDomain
            ? { emailDomainId: form.emailDomainId }
            : {
                provider: form.provider,
                host: form.host,
                port: portNum as number,
                username: form.username,
                password: form.password,
                sesConfigSet: form.provider === 'ses' ? form.sesConfigSet || undefined : undefined,
              }),
        };
        res = await api.post<SmtpAccountWithVerify>('/api/email/smtp-accounts', payload);
        applyVerifyResult(res, 'created');
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify(acc: SmtpAccount) {
    setVerifyingId(acc.id);
    try {
      const res = await api.post<SmtpAccountWithVerify>(
        `/api/email/smtp-accounts/${acc.id}/verify`,
      );
      applyVerifyResult(res, 'verified');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error verificando');
    } finally {
      setVerifyingId(null);
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
                    {a.isActive ? (
                      <Chip size="small" label="Activa" color="success" />
                    ) : (
                      <Tooltip
                        title={verifyErrors[a.id] ?? 'Sin verificar — usá el botón Verificar'}
                        arrow
                      >
                        <Chip
                          size="small"
                          icon={<ErrorOutlineIcon fontSize="small" />}
                          label="Inactiva"
                          color="default"
                          variant="outlined"
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Verificar conexión">
                      <span>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleVerify(a)}
                          disabled={verifyingId === a.id}
                        >
                          <VerifiedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={a.isActive ? 'Enviar prueba' : 'Activá la cuenta para enviar pruebas'}>
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

            {/* Selector de modo: dominio verificado vs SMTP/SES manual */}
            {verifiedDomains.length > 0 && (
              <TextField
                select
                label="Origen del envío"
                value={form.emailDomainId || '_manual'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '_manual') {
                    setForm({ ...form, emailDomainId: '' });
                  } else {
                    const dom = verifiedDomains.find((d) => d.id === v);
                    setForm({
                      ...form,
                      emailDomainId: v,
                      provider: 'ses',
                      // Auto-sugerir noreply@<domain> si fromEmail no matchea
                      fromEmail:
                        dom && !form.fromEmail.endsWith(`@${dom.domain}`)
                          ? `noreply@${dom.domain}`
                          : form.fromEmail,
                    });
                  }
                }}
                fullWidth
                helperText={
                  form.emailDomainId
                    ? 'Va a usar AWS SES con el dominio verificado. No hace falta SMTP.'
                    : 'Configurá host/usuario/contraseña SMTP manualmente.'
                }
              >
                <MenuItem value="_manual">Cuenta SMTP propia (manual)</MenuItem>
                {verifiedDomains.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    Dominio verificado: {d.domain}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {/* SMTP / SES manual: campos completos */}
            {!form.emailDomainId && (
              <>
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
              </>
            )}

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
                error={
                  form.emailDomainId !== '' &&
                  form.fromEmail !== '' &&
                  !form.fromEmail
                    .toLowerCase()
                    .endsWith(
                      `@${verifiedDomains.find((d) => d.id === form.emailDomainId)?.domain ?? ''}`,
                    )
                }
                helperText={
                  form.emailDomainId
                    ? `Debe terminar en @${verifiedDomains.find((d) => d.id === form.emailDomainId)?.domain ?? '...'}`
                    : undefined
                }
              />
            </Stack>
            {form.provider === 'ses' && !form.emailDomainId && (
              <TextField
                label="SES Configuration Set (opcional)"
                value={form.sesConfigSet}
                onChange={(e) => setForm({ ...form, sesConfigSet: e.target.value })}
                fullWidth
                helperText="Si lo dejás vacío, se autoprovisiona uno por team."
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {form.emailDomainId
                ? 'La cuenta queda activa automáticamente si el dominio sigue VERIFIED al guardar.'
                : 'El estado activa/inactiva se determina automáticamente al guardar: si las credenciales verifican OK la cuenta queda activa, si no, queda inactiva y podés reintentarla con el botón "Verificar".'}
            </Typography>
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
