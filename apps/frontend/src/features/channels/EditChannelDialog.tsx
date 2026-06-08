import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { ApiError, useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { ChannelIcon, channelMeta } from './channelMeta';
import { channelsApi, channelWebhookUrl } from './api';
import type { ChannelListItem, UpdateChannelPayload } from './types';

interface Props {
  channel: ChannelListItem | null;
  onClose: () => void;
  onSaved: () => void;
  webhookSlug: string | null;
}

const EMPTY_WA = {
  welcomeMessage: '',
  optOutConfirmMessage: '',
  optOutKeywords: '',
  dailyLimit: '',
  sendDelayMinMs: '',
  sendDelayMaxMs: '',
};

export function EditChannelDialog({ channel, onClose, onSaved, webhookSlug }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [name, setName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [pageId, setPageId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [isTestMode, setIsTestMode] = useState(false);
  const [wa, setWa] = useState(EMPTY_WA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  const isWhatsApp = channel?.kind === 'WHATSAPP';
  const isWebchat = channel?.kind === 'WEBCHAT';

  // Pre-cargar al abrir. Credenciales NO se traen (van vacías, sólo se mandan si
  // el usuario escribe). Para WhatsApp se trae el detalle (welcome/opt-out/throttle).
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    setName(channel.name ?? '');
    setPhoneNumberId(channel.phoneNumberId ?? '');
    setBusinessAccountId(channel.businessAccountId ?? '');
    setPageId(channel.pageId ?? '');
    setAccessToken('');
    setWebhookVerifyToken('');
    setAppSecret('');
    setIsTestMode(channel.isTestMode);
    setWa(EMPTY_WA);
    setError(null);
    setRevealedToken(null);
    if (channel.kind === 'WHATSAPP') {
      void channelsApi
        .get(api, channel.id)
        .then((d) => {
          if (cancelled) return;
          setWa({
            welcomeMessage: d.welcomeMessage ?? '',
            optOutConfirmMessage: d.optOutConfirmMessage ?? '',
            optOutKeywords: (d.optOutKeywords ?? []).join(', '),
            dailyLimit: String(d.dailyLimit ?? ''),
            sendDelayMinMs: String(d.sendDelayMinMs ?? ''),
            sendDelayMaxMs: String(d.sendDelayMaxMs ?? ''),
          });
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [channel, api]);

  const webhookUrl = useMemo(() => {
    if (!channel || !webhookSlug) return null;
    return channelWebhookUrl(api.baseUrl, channel.kind, webhookSlug);
  }, [channel, webhookSlug, api.baseUrl]);

  // Snippet embebible del widget (el loader v1.js se sirve desde el origin del front).
  const embedSnippet = isWebchat && channel?.pageId
    ? `<script src="${window.location.origin}/webchat/v1.js" data-massivo-key="${channel.pageId}" async></script>`
    : '';

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(`${label} copiado`);
    } catch {
      notify.error('No se pudo copiar');
    }
  }

  async function handleReveal() {
    if (!channel) return;
    setRevealing(true);
    try {
      const res = await channelsApi.revealSecrets(api, channel.id);
      setRevealedToken(res.webhookVerifyToken);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo revelar el token');
    } finally {
      setRevealing(false);
    }
  }

  async function handleSave() {
    if (!channel) return;
    setError(null);
    setSaving(true);
    try {
      // Webchat no tiene identidad ni credenciales editables (la widget key es fija).
      const payload: UpdateChannelPayload = isWebchat
        ? { name: name.trim() || undefined }
        : {
            name: name.trim() || undefined,
            isTestMode,
            ...(isWhatsApp
              ? { phoneNumberId: phoneNumberId.trim(), businessAccountId: businessAccountId.trim() }
              : { pageId: pageId.trim() }),
          };
      if (accessToken.trim()) payload.accessToken = accessToken.trim();
      if (webhookVerifyToken.trim()) payload.webhookVerifyToken = webhookVerifyToken.trim();
      if (appSecret.trim()) payload.appSecret = appSecret.trim();

      // Settings WhatsApp-específicos (auto-replies + throttle).
      if (isWhatsApp) {
        payload.welcomeMessage = wa.welcomeMessage.trim() || null;
        payload.optOutConfirmMessage = wa.optOutConfirmMessage.trim() || null;
        payload.optOutKeywords = wa.optOutKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        if (wa.dailyLimit.trim()) payload.dailyLimit = Number(wa.dailyLimit);
        if (wa.sendDelayMinMs.trim()) payload.sendDelayMinMs = Number(wa.sendDelayMinMs);
        if (wa.sendDelayMaxMs.trim()) payload.sendDelayMaxMs = Number(wa.sendDelayMaxMs);
      }

      await channelsApi.update(api, channel.id, payload);
      notify.success('Canal actualizado');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  function updateWa<K extends keyof typeof EMPTY_WA>(key: K, value: string) {
    setWa((w) => ({ ...w, [key]: value }));
  }

  return (
    <Dialog open={!!channel} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1.5}>
          {channel && <ChannelIcon kind={channel.kind} size={28} />}
          Editar {channel ? channelMeta(channel.kind).label : 'canal'}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.75}>
          <TextField label="Nombre" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} />

          {isWebchat && (
            <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>
                Widget
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Clave pública del widget (embebela en tu sitio o usala en el chat de prueba):
              </Typography>
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                <Box component="code" sx={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}>
                  {channel?.pageId}
                </Box>
                <Tooltip title="Copiar widget key">
                  <IconButton
                    size="small"
                    onClick={() => channel?.pageId && void copy(channel.pageId, 'Widget key')}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.25, display: 'block' }}>
                Código para embeber en el sitio del cliente (pegar antes de &lt;/body&gt;):
              </Typography>
              <Stack direction="row" alignItems="flex-start" gap={0.5} sx={{ mt: 0.5 }}>
                <Box
                  component="code"
                  sx={{ fontSize: 11, wordBreak: 'break-all', whiteSpace: 'pre-wrap', flex: 1 }}
                >
                  {embedSnippet}
                </Box>
                <Tooltip title="Copiar código">
                  <IconButton size="small" onClick={() => embedSnippet && void copy(embedSnippet, 'Código del widget')}>
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          )}

          {!isWebchat && (
          <>
          {isWhatsApp ? (
            <>
              <TextField
                label="Phone Number ID"
                size="small"
                fullWidth
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
              />
              <TextField
                label="WhatsApp Business Account ID"
                size="small"
                fullWidth
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
              />
            </>
          ) : (
            <TextField
              label={channel?.kind === 'INSTAGRAM' ? 'Instagram account ID' : 'Page ID (Facebook)'}
              size="small"
              fullWidth
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
            />
          )}

          <Typography variant="caption" color="text.secondary">
            Dejá las credenciales vacías para mantener las actuales; completá sólo lo que quieras cambiar.
          </Typography>
          <TextField
            label={isWhatsApp ? 'Access Token (Cloud API)' : 'Page Access Token'}
            size="small"
            fullWidth
            type="password"
            placeholder="••••••• (sin cambios)"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
          <TextField
            label="Verify Token (webhook)"
            size="small"
            fullWidth
            placeholder="••••••• (sin cambios)"
            value={webhookVerifyToken}
            onChange={(e) => setWebhookVerifyToken(e.target.value)}
          />
          <TextField
            label="App Secret"
            size="small"
            fullWidth
            type="password"
            placeholder="••••••• (sin cambios)"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
          <FormControlLabel
            control={<Checkbox checked={isTestMode} onChange={(e) => setIsTestMode(e.target.checked)} />}
            label="Modo test (no envía a Meta — para el chat simulado)"
          />

          {/* Webhook: callback URL (por kind) + verify token. Lo que se pega en Meta. */}
          <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>
              Webhook
            </Typography>
            {webhookUrl ? (
              <Stack spacing={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Callback URL
                  </Typography>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <Box component="code" sx={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}>
                      {webhookUrl}
                    </Box>
                    <Tooltip title="Copiar URL">
                      <IconButton size="small" onClick={() => void copy(webhookUrl, 'URL del webhook')}>
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Verify token
                  </Typography>
                  {revealedToken ? (
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Box component="code" sx={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}>
                        {revealedToken}
                      </Box>
                      <Tooltip title="Copiar token">
                        <IconButton size="small" onClick={() => void copy(revealedToken, 'Verify token')}>
                          <ContentCopyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ) : (
                    <Box>
                      <Button
                        size="small"
                        startIcon={<VpnKeyIcon fontSize="small" />}
                        onClick={() => void handleReveal()}
                        disabled={revealing}
                      >
                        {revealing ? 'Revelando…' : 'Revelar verify token'}
                      </Button>
                    </Box>
                  )}
                </Box>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Configurá el webhook slug de la organización para ver la URL.
              </Typography>
            )}
          </Box>
          </>
          )}

          {/* Ajustes WhatsApp-específicos (antes en la página Números). */}
          {isWhatsApp && (
            <>
              <Divider textAlign="left">
                <Typography variant="caption" color="text.secondary">
                  Ajustes de WhatsApp
                </Typography>
              </Divider>
              <TextField
                label="Mensaje de bienvenida"
                size="small"
                fullWidth
                multiline
                minRows={3}
                maxRows={8}
                value={wa.welcomeMessage}
                onChange={(e) => updateWa('welcomeMessage', e.target.value)}
                helperText="Se envía al primer mensaje de un contacto nuevo (si el bot no lo maneja)."
              />
              <TextField
                label="Mensaje de confirmación de baja (opt-out)"
                size="small"
                fullWidth
                multiline
                minRows={3}
                maxRows={8}
                value={wa.optOutConfirmMessage}
                onChange={(e) => updateWa('optOutConfirmMessage', e.target.value)}
              />
              <TextField
                label="Keywords de opt-out (separadas por coma)"
                size="small"
                fullWidth
                value={wa.optOutKeywords}
                onChange={(e) => updateWa('optOutKeywords', e.target.value)}
                helperText="Ej: BAJA, STOP, CANCELAR. Vacío = defaults internos."
              />
              <Stack direction="row" gap={1}>
                <TextField
                  label="Límite diario"
                  size="small"
                  type="number"
                  value={wa.dailyLimit}
                  onChange={(e) => updateWa('dailyLimit', e.target.value)}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Delay mín (ms)"
                  size="small"
                  type="number"
                  value={wa.sendDelayMinMs}
                  onChange={(e) => updateWa('sendDelayMinMs', e.target.value)}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Delay máx (ms)"
                  size="small"
                  type="number"
                  value={wa.sendDelayMaxMs}
                  onChange={(e) => updateWa('sendDelayMaxMs', e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Stack>
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
