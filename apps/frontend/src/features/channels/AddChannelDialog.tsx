import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError, useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { CHANNEL_KINDS, ChannelIcon, channelMeta, type ChannelKind } from './channelMeta';
import { channelsApi, channelWebhookUrl } from './api';
import type { CreateChannelPayload } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Slug del webhook de la org (para mostrar la callback URL). */
  webhookSlug: string | null;
}

interface FormState {
  name: string;
  phoneNumberId: string;
  businessAccountId: string;
  pageId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
  isTestMode: boolean;
}

const EMPTY: FormState = {
  name: '',
  phoneNumberId: '',
  businessAccountId: '',
  pageId: '',
  accessToken: '',
  webhookVerifyToken: '',
  appSecret: '',
  isTestMode: false,
};

export function AddChannelDialog({ open, onClose, onCreated, webhookSlug }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [kind, setKind] = useState<ChannelKind | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setKind(null);
    setForm(EMPTY);
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const webhookUrl = useMemo(() => {
    if (!kind || !webhookSlug) return null;
    return channelWebhookUrl(api.baseUrl, kind, webhookSlug);
  }, [kind, webhookSlug, api.baseUrl]);

  async function handleCreate() {
    if (!kind) return;
    setError(null);
    // Validación mínima en cliente (el backend revalida por kind).
    if (kind === 'WHATSAPP' && (!form.phoneNumberId.trim() || !form.businessAccountId.trim())) {
      setError('WhatsApp requiere Phone Number ID y WhatsApp Business Account ID');
      return;
    }
    if ((kind === 'MESSENGER' || kind === 'INSTAGRAM') && !form.pageId.trim()) {
      setError(`${channelMeta(kind).label} requiere el ${kind === 'INSTAGRAM' ? 'Instagram account ID' : 'Page ID'}`);
      return;
    }
    // Webchat no necesita credenciales (entrega por socket; el backend genera la widget key).
    if (kind !== 'WEBCHAT' && (!form.accessToken.trim() || !form.webhookVerifyToken.trim())) {
      setError('Access token y verify token son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateChannelPayload =
        kind === 'WEBCHAT'
          ? { kind, name: form.name.trim() || undefined }
          : {
              kind,
              name: form.name.trim() || undefined,
              accessToken: form.accessToken.trim(),
              webhookVerifyToken: form.webhookVerifyToken.trim(),
              appSecret: form.appSecret.trim() || undefined,
              isTestMode: form.isTestMode,
              ...(kind === 'WHATSAPP'
                ? { phoneNumberId: form.phoneNumberId.trim(), businessAccountId: form.businessAccountId.trim() }
                : { pageId: form.pageId.trim() }),
            };
      await channelsApi.create(api, payload);
      notify.success(`Canal ${channelMeta(kind).label} creado`);
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'No se pudo crear el canal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{kind ? `Conectar ${channelMeta(kind).label}` : 'Agregar canal'}</DialogTitle>
      <DialogContent dividers>
        {!kind ? (
          <Stack spacing={1.25}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Elegí el tipo de canal a conectar.
            </Typography>
            {CHANNEL_KINDS.map((meta) => (
              <Box
                key={meta.kind}
                role="button"
                tabIndex={meta.available ? 0 : -1}
                onClick={() => meta.available && setKind(meta.kind)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  cursor: meta.available ? 'pointer' : 'not-allowed',
                  opacity: meta.available ? 1 : 0.55,
                  transition: 'border-color .15s, background .15s',
                  '&:hover': meta.available
                    ? { borderColor: meta.color, bgcolor: 'action.hover' }
                    : {},
                }}
              >
                <ChannelIcon kind={meta.kind} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {meta.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {meta.blurb}
                  </Typography>
                </Box>
                {!meta.available && <Chip size="small" label="Próximamente" sx={{ height: 22 }} />}
              </Box>
            ))}
          </Stack>
        ) : (
          <Stack spacing={1.75}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <ChannelIcon kind={kind} size={32} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {channelMeta(kind).label}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={reset} disabled={saving}>
                Cambiar tipo
              </Button>
            </Stack>

            <TextField
              label="Nombre (opcional)"
              size="small"
              fullWidth
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={`Mi ${channelMeta(kind).label}`}
            />

            {kind === 'WEBCHAT' ? (
              <Alert severity="info">
                Webchat no necesita credenciales. Al crearlo te damos una <b>widget key</b> pública
                para embeber el chat en tu sitio (la ves en la ruedita del canal). Conectale un bot
                para que responda automáticamente.
              </Alert>
            ) : (
              <>
                {kind === 'WHATSAPP' ? (
                  <>
                    <TextField
                      label="Phone Number ID"
                      size="small"
                      fullWidth
                      required
                      value={form.phoneNumberId}
                      onChange={(e) => update('phoneNumberId', e.target.value)}
                    />
                    <TextField
                      label="WhatsApp Business Account ID"
                      size="small"
                      fullWidth
                      required
                      value={form.businessAccountId}
                      onChange={(e) => update('businessAccountId', e.target.value)}
                    />
                  </>
                ) : (
                  <TextField
                    label={kind === 'INSTAGRAM' ? 'Instagram account ID' : 'Page ID (Facebook)'}
                    size="small"
                    fullWidth
                    required
                    value={form.pageId}
                    onChange={(e) => update('pageId', e.target.value)}
                    helperText={
                      kind === 'INSTAGRAM'
                        ? 'Id de la cuenta de Instagram business (aparece en el webhook como entry.id). El access token es el de la página de Facebook vinculada.'
                        : 'El id numérico de la página de Facebook conectada a Messenger.'
                    }
                  />
                )}

                <TextField
                  label={kind === 'WHATSAPP' ? 'Access Token (Cloud API)' : 'Page Access Token'}
                  size="small"
                  fullWidth
                  required
                  type="password"
                  value={form.accessToken}
                  onChange={(e) => update('accessToken', e.target.value)}
                />
                <TextField
                  label="Verify Token (webhook)"
                  size="small"
                  fullWidth
                  required
                  value={form.webhookVerifyToken}
                  onChange={(e) => update('webhookVerifyToken', e.target.value)}
                  helperText="El mismo que vas a pegar en la consola de Meta al configurar el webhook."
                />
                <TextField
                  label="App Secret (opcional, recomendado)"
                  size="small"
                  fullWidth
                  type="password"
                  value={form.appSecret}
                  onChange={(e) => update('appSecret', e.target.value)}
                  helperText="Valida la firma HMAC del webhook. Sin él, el webhook acepta sin verificar firma (no usar en prod)."
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.isTestMode}
                      onChange={(e) => update('isTestMode', e.target.checked)}
                    />
                  }
                  label="Modo test (no envía a Meta — para el chat simulado)"
                />

                {webhookUrl && (
                  <Alert severity="info" sx={{ '& code': { fontSize: 12 } }}>
                    Configurá en Meta esta callback URL (en tu dominio del backend):
                    <br />
                    <code>{webhookUrl}</code>
                    <br />
                    con el verify token de arriba.
                  </Alert>
                )}
              </>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancelar
        </Button>
        {kind && (
          <Button variant="contained" onClick={() => void handleCreate()} disabled={saving}>
            {saving ? 'Creando…' : 'Conectar canal'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
