import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DnsIcon from '@mui/icons-material/Dns';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import KeyIcon from '@mui/icons-material/Key';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type {
  CreateWapiConfigPayload,
  UpdateWapiConfigPayload,
  WapiConfigDetail,
  WapiConfigListItem,
} from './types';

interface FormState {
  name: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
  welcomeMessage: string;
  optOutConfirmMessage: string;
  optOutKeywords: string;
  dailyLimit: string;
  sendDelayMinSec: string;
  sendDelayMaxSec: string;
  isTestMode: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  webhookVerifyToken: '',
  appSecret: '',
  welcomeMessage: '',
  optOutConfirmMessage: '',
  optOutKeywords: '',
  dailyLimit: '',
  sendDelayMinSec: '30',
  sendDelayMaxSec: '60',
  isTestMode: false,
};

/** 4.Q — Estimación de throughput. Promedio simple por jitter uniforme. */
function estimateThroughput(minSec: number, maxSec: number): string {
  if (!Number.isFinite(minSec) || !Number.isFinite(maxSec) || minSec <= 0 || maxSec <= 0) {
    return '';
  }
  const avg = (minSec + maxSec) / 2;
  const perMin = 60 / avg;
  const perHour = 3600 / avg;
  return `~${perMin.toFixed(1)} envíos/min · ~${Math.round(perHour)}/hora`;
}

function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const k = raw.trim().toUpperCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** 4.P — slice mínimo de /api/me/context que necesitamos para construir el URL del webhook. */
interface MeContextSlice {
  organizations: Array<{ id: string; clerkOrgId: string; webhookSlug: string; role: string }>;
}

export function WapiConfigsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<WapiConfigListItem[] | null>(null);
  const [editing, setEditing] = useState<WapiConfigDetail | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 4.P — webhook URL org-scoped. Tomamos el primer org del context (en el front
  // sólo manejamos una org activa por sesión gracias a Clerk org switcher).
  const [webhookSlug, setWebhookSlug] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [revealedTokens, setRevealedTokens] = useState<Record<string, string>>({});

  const isEdit = editing !== null;
  const canManageOrg = orgRole === 'OWNER' || orgRole === 'ADMIN';
  const webhookUrl = webhookSlug ? `${api.baseUrl}/api/webhooks/wapi/${webhookSlug}` : null;

  async function load() {
    try {
      const data = await api.get<WapiConfigListItem[]>('/api/wapi/configs');
      setItems(data);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando configs');
    }
  }

  async function loadMe() {
    try {
      const me = await api.get<MeContextSlice>('/api/me/context');
      const org = me.organizations[0];
      if (org) {
        setWebhookSlug(org.webhookSlug);
        setOrgRole(org.role);
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando contexto');
    }
  }

  useEffect(() => {
    void load();
    void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(`${label} copiado`);
    } catch {
      notify.error('No se pudo copiar al portapapeles');
    }
  }

  async function handleRegenerateSlug() {
    const ok = await confirm({
      title: 'Regenerar URL de webhook',
      message:
        'Vas a invalidar la URL actual del webhook. Tenés que actualizarla en la consola de Meta (cada App de Meta donde la pegaste) o vas a dejar de recibir mensajes y status updates. ¿Seguís?',
      confirmText: 'Regenerar',
      destructive: true,
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      const res = await api.post<{ webhookSlug: string }>(
        '/api/orgs/me/webhook-slug/regenerate',
        {},
      );
      setWebhookSlug(res.webhookSlug);
      notify.success('URL de webhook regenerada — actualizala en Meta');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error regenerando');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRevealVerifyToken(c: WapiConfigListItem) {
    if (revealedTokens[c.id]) {
      // toggle: ocultar
      setRevealedTokens((prev) => {
        const { [c.id]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    try {
      const res = await api.get<{ webhookVerifyToken: string }>(
        `/api/wapi/configs/${c.id}/reveal-secrets`,
      );
      setRevealedTokens((prev) => ({ ...prev, [c.id]: res.webhookVerifyToken }));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error obteniendo token');
    }
  }

  function handleOpenCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowSecrets(false);
    setOpenDialog(true);
  }

  async function handleOpenEdit(c: WapiConfigListItem) {
    try {
      const detail = await api.get<WapiConfigDetail>(`/api/wapi/configs/${c.id}`);
      setEditing(detail);
      setForm({
        name: detail.name ?? '',
        phoneNumberId: detail.phoneNumberId,
        businessAccountId: detail.businessAccountId,
        accessToken: '',
        webhookVerifyToken: '',
        appSecret: '',
        welcomeMessage: detail.welcomeMessage ?? '',
        optOutConfirmMessage: detail.optOutConfirmMessage ?? '',
        optOutKeywords: (detail.optOutKeywords ?? []).join(', '),
        dailyLimit: String(detail.dailyLimit),
        sendDelayMinSec: String(Math.round((detail.sendDelayMinMs ?? 30000) / 1000)),
        sendDelayMaxSec: String(Math.round((detail.sendDelayMaxMs ?? 60000) / 1000)),
        isTestMode: detail.isTestMode ?? false,
      });
      setError(null);
      setShowSecrets(false);
      setOpenDialog(true);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando config');
    }
  }

  function handleClose() {
    if (saving) return;
    setOpenDialog(false);
  }

  const canSave = useMemo(() => {
    if (!form.phoneNumberId.trim() || !form.businessAccountId.trim()) return false;
    if (isEdit) return true; // tokens opcionales en edit
    return form.accessToken.trim().length > 0 && form.webhookVerifyToken.trim().length > 0;
  }, [form, isEdit]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const minSec = Number(form.sendDelayMinSec);
      const maxSec = Number(form.sendDelayMaxSec);
      if (!Number.isFinite(minSec) || !Number.isFinite(maxSec) || minSec < 1 || maxSec < 1) {
        throw new Error('Delays inválidos: deben ser >= 1 segundo');
      }
      if (minSec > maxSec) {
        throw new Error('Velocidad: el mínimo debe ser ≤ al máximo');
      }
      const sendDelayMinMs = Math.round(minSec * 1000);
      const sendDelayMaxMs = Math.round(maxSec * 1000);

      if (isEdit && editing) {
        const payload: UpdateWapiConfigPayload = {
          name: form.name.trim() || undefined,
          phoneNumberId: form.phoneNumberId.trim(),
          businessAccountId: form.businessAccountId.trim(),
          welcomeMessage: form.welcomeMessage.trim() || null,
          optOutConfirmMessage: form.optOutConfirmMessage.trim() || null,
          optOutKeywords: parseKeywords(form.optOutKeywords),
          dailyLimit: form.dailyLimit ? Number(form.dailyLimit) : undefined,
          sendDelayMinMs,
          sendDelayMaxMs,
          isTestMode: form.isTestMode,
        };
        if (form.accessToken.trim()) payload.accessToken = form.accessToken.trim();
        if (form.webhookVerifyToken.trim())
          payload.webhookVerifyToken = form.webhookVerifyToken.trim();
        if (form.appSecret.trim()) payload.appSecret = form.appSecret.trim();
        await api.patch(`/api/wapi/configs/${editing.id}`, payload);
        notify.success('Config actualizada');
      } else {
        const payload: CreateWapiConfigPayload = {
          name: form.name.trim() || undefined,
          phoneNumberId: form.phoneNumberId.trim(),
          businessAccountId: form.businessAccountId.trim(),
          accessToken: form.accessToken.trim(),
          webhookVerifyToken: form.webhookVerifyToken.trim(),
          appSecret: form.appSecret.trim() || undefined,
          welcomeMessage: form.welcomeMessage.trim() || undefined,
          optOutConfirmMessage: form.optOutConfirmMessage.trim() || undefined,
          optOutKeywords: parseKeywords(form.optOutKeywords),
          dailyLimit: form.dailyLimit ? Number(form.dailyLimit) : undefined,
          sendDelayMinMs,
          sendDelayMaxMs,
          isTestMode: form.isTestMode,
        };
        await api.post('/api/wapi/configs', payload);
        notify.success('Config creada');
      }
      setOpenDialog(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(c: WapiConfigListItem, isActive: boolean) {
    try {
      await api.patch(`/api/wapi/configs/${c.id}`, { isActive });
      notify.success(isActive ? 'Config activada' : 'Config desactivada');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error');
    }
  }

  async function handleDelete(c: WapiConfigListItem) {
    const ok = await confirm({
      title: 'Borrar config',
      message: `¿Seguro que querés borrar "${c.name ?? c.phoneNumberId}"? Si hay campañas asociadas, fallará.`,
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/wapi/configs/${c.id}`);
      notify.success('Config eliminada');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error borrando');
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const secretAdornment = (
    <InputAdornment position="end">
      <IconButton size="small" onClick={() => setShowSecrets((v) => !v)} edge="end">
        {showSecrets ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <DnsIcon color="success" />
          <Typography variant="h4">Configs WhatsApp</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          Nueva config
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary">
        Cada config representa un número de WhatsApp Business conectado a Meta Cloud API. Necesitás
        al menos uno activo para enviar campañas. Los tokens (accessToken, webhookVerifyToken,
        appSecret) se guardan encriptados.
      </Typography>

      {/* 4.P — Card de webhook URL org-scoped */}
      {webhookUrl && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <LinkIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2">Webhook de Meta para esta organización</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Pegá esta URL en la consola de Meta (App → WhatsApp → Configuration → Webhook).
              Es exclusiva de tu organización: cualquier evento que llegue acá se mapea a tus
              WapiConfigs por <code>phone_number_id</code>. Si la regenerás, vas a tener que
              actualizarla en Meta.
            </Typography>
            <TextField
              value={webhookUrl}
              fullWidth
              size="small"
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: 13 },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copiar URL">
                      <IconButton
                        size="small"
                        onClick={() => handleCopy(webhookUrl, 'URL del webhook')}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
            {canManageOrg && (
              <Box>
                <Button
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={handleRegenerateSlug}
                  disabled={regenerating}
                  color="warning"
                  variant="outlined"
                >
                  {regenerating ? 'Regenerando...' : 'Regenerar URL'}
                </Button>
              </Box>
            )}
          </Stack>
        </Paper>
      )}

      {items === null && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={48} />
            ))}
          </Stack>
        </Paper>
      )}

      {items !== null && items.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <DnsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            Todavía no hay configs. Creá la primera para conectar un número de WhatsApp.
          </Typography>
        </Paper>
      )}

      {items !== null && items.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Phone Number ID</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>WABA ID</TableCell>
                <TableCell>Activa</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Creada</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {c.name ?? <em style={{ opacity: 0.6 }}>(sin nombre)</em>}
                      </Typography>
                      {c.isTestMode && (
                        <Chip size="small" label="Test" color="warning" variant="outlined" />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.phoneNumberId}
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {c.businessAccountId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Switch
                      size="small"
                      checked={c.isActive}
                      onChange={(e) => handleToggleActive(c, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {new Date(c.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell align="right">
                    {canManageOrg && (
                      <Tooltip
                        title={
                          revealedTokens[c.id]
                            ? `Verify token: ${revealedTokens[c.id]} (click para ocultar)`
                            : 'Ver verify token'
                        }
                      >
                        <IconButton size="small" onClick={() => handleRevealVerifyToken(c)}>
                          <KeyIcon
                            fontSize="small"
                            color={revealedTokens[c.id] ? 'primary' : 'inherit'}
                          />
                        </IconButton>
                      </Tooltip>
                    )}
                    {revealedTokens[c.id] && (
                      <Tooltip title="Copiar verify token">
                        <IconButton
                          size="small"
                          onClick={() =>
                            handleCopy(revealedTokens[c.id]!, 'Verify token')
                          }
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => handleOpenEdit(c)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Borrar">
                      <IconButton size="small" color="error" onClick={() => handleDelete(c)}>
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

      <Dialog open={openDialog} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>{isEdit ? 'Editar config' : 'Nueva config WhatsApp'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Nombre (opcional)"
              placeholder="Ej: Atención al cliente"
              fullWidth
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              inputProps={{ maxLength: 80 }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Phone Number ID"
                fullWidth
                required
                value={form.phoneNumberId}
                onChange={(e) => update('phoneNumberId', e.target.value)}
                helperText="Lo obtenés en Meta → WhatsApp → API Setup"
                inputProps={{ maxLength: 100 }}
              />
              <TextField
                label="Business Account ID (WABA)"
                fullWidth
                required
                value={form.businessAccountId}
                onChange={(e) => update('businessAccountId', e.target.value)}
                helperText="Necesario para sincronizar templates"
                inputProps={{ maxLength: 100 }}
              />
            </Stack>
            <TextField
              label={isEdit ? 'Access Token (dejar vacío para no cambiar)' : 'Access Token'}
              fullWidth
              required={!isEdit}
              type={showSecrets ? 'text' : 'password'}
              value={form.accessToken}
              onChange={(e) => update('accessToken', e.target.value)}
              placeholder={isEdit ? '••••••••' : ''}
              InputProps={{ endAdornment: secretAdornment }}
            />
            <TextField
              label={
                isEdit
                  ? 'Webhook Verify Token (dejar vacío para no cambiar)'
                  : 'Webhook Verify Token'
              }
              fullWidth
              required={!isEdit}
              type={showSecrets ? 'text' : 'password'}
              value={form.webhookVerifyToken}
              onChange={(e) => update('webhookVerifyToken', e.target.value)}
              placeholder={isEdit ? '••••••••' : ''}
              helperText="Usado por Meta para verificar el webhook (lo elegís vos)"
              inputProps={{ maxLength: 100 }}
              InputProps={{ endAdornment: secretAdornment }}
            />
            <TextField
              label={
                isEdit ? 'App Secret (dejar vacío para no cambiar)' : 'App Secret (opcional)'
              }
              fullWidth
              type={showSecrets ? 'text' : 'password'}
              value={form.appSecret}
              onChange={(e) => update('appSecret', e.target.value)}
              placeholder={isEdit ? '••••••••' : ''}
              helperText="Si lo seteás, se valida la firma X-Hub-Signature-256 de Meta"
              InputProps={{ endAdornment: secretAdornment }}
            />
            <TextField
              label="Daily limit"
              type="number"
              fullWidth
              value={form.dailyLimit}
              onChange={(e) => update('dailyLimit', e.target.value)}
              helperText="Tope de envíos diarios por config (default 200). Al alcanzarlo, los jobs reintentan en 1h."
              inputProps={{ min: 1 }}
            />
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Velocidad de envío
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Pausa aleatoria entre envíos consecutivos (jitter). Sirve para parecer humano y
                evitar rate-limits de Meta. Cada campaña puede pisar este default desde el wizard.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Mínimo (segundos)"
                  type="number"
                  fullWidth
                  value={form.sendDelayMinSec}
                  onChange={(e) => update('sendDelayMinSec', e.target.value)}
                  inputProps={{ min: 1, max: 3600 }}
                />
                <TextField
                  label="Máximo (segundos)"
                  type="number"
                  fullWidth
                  value={form.sendDelayMaxSec}
                  onChange={(e) => update('sendDelayMaxSec', e.target.value)}
                  inputProps={{ min: 1, max: 3600 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {estimateThroughput(Number(form.sendDelayMinSec), Number(form.sendDelayMaxSec)) ||
                  'Ingresá min y max válidos para ver throughput estimado.'}
              </Typography>
            </Box>
            <TextField
              label="Welcome message (opcional)"
              fullWidth
              multiline
              minRows={2}
              value={form.welcomeMessage}
              onChange={(e) => update('welcomeMessage', e.target.value)}
              helperText="Se envía automáticamente al primer mensaje de un nuevo contacto."
            />
            <TextField
              label="Opt-out confirm message (opcional)"
              fullWidth
              multiline
              minRows={2}
              value={form.optOutConfirmMessage}
              onChange={(e) => update('optOutConfirmMessage', e.target.value)}
              helperText="Se envía automáticamente cuando un contacto manda una keyword de opt-out."
            />
            <TextField
              label="Keywords de opt-out (separadas por coma)"
              fullWidth
              value={form.optOutKeywords}
              onChange={(e) => update('optOutKeywords', e.target.value)}
              placeholder="BAJA, STOP, UNSUBSCRIBE, CANCELAR"
              helperText="Match case-insensitive y exacto sobre el body del mensaje. Si vacío se usan los defaults: BAJA, STOP, UNSUBSCRIBE, CANCELAR."
            />
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: 1,
                borderColor: form.isTestMode ? 'warning.main' : 'divider',
                bgcolor: form.isTestMode ? 'warning.50' : 'transparent',
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isTestMode}
                    onChange={(e) => update('isTestMode', e.target.checked)}
                    color="warning"
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Modo test
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Si está activo, los envíos NO van a Meta — devuelven un wamid simulado y
                      quedan persistidos como "sent". Usalo con la suite Dev (chat simulado) para
                      probar ida-vuelta sin un número real.
                    </Typography>
                  </Stack>
                }
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSave || saving}>
            {isEdit ? 'Guardar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
