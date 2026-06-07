import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { IconButton, Tooltip } from '@mui/material';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  // Pre-cargar al abrir (las credenciales NO se traen — van vacías y sólo se
  // mandan si el usuario escribe un valor nuevo).
  useEffect(() => {
    if (!channel) return;
    setName(channel.name ?? '');
    setPhoneNumberId(channel.phoneNumberId ?? '');
    setBusinessAccountId(channel.businessAccountId ?? '');
    setPageId(channel.pageId ?? '');
    setAccessToken('');
    setWebhookVerifyToken('');
    setAppSecret('');
    setIsTestMode(channel.isTestMode);
    setError(null);
    setRevealedToken(null);
  }, [channel]);

  const isWhatsApp = channel?.kind === 'WHATSAPP';
  const webhookUrl = useMemo(() => {
    if (!channel || !webhookSlug) return null;
    return channelWebhookUrl(api.baseUrl, channel.kind, webhookSlug);
  }, [channel, webhookSlug, api.baseUrl]);

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
      const payload: UpdateChannelPayload = {
        name: name.trim() || undefined,
        isTestMode,
        ...(isWhatsApp
          ? { phoneNumberId: phoneNumberId.trim(), businessAccountId: businessAccountId.trim() }
          : { pageId: pageId.trim() }),
      };
      // Credenciales: sólo si el usuario las cambió.
      if (accessToken.trim()) payload.accessToken = accessToken.trim();
      if (webhookVerifyToken.trim()) payload.webhookVerifyToken = webhookVerifyToken.trim();
      if (appSecret.trim()) payload.appSecret = appSecret.trim();

      await channelsApi.update(api, channel.id, payload);
      notify.success('Canal actualizado');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
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
          <TextField
            label="Nombre"
            size="small"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

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
              label="Page ID (Facebook)"
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
                    <Box
                      component="code"
                      sx={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}
                    >
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

          {isWhatsApp && (
            <Box>
              <Button
                size="small"
                startIcon={<OpenInNewIcon fontSize="small" />}
                component={RouterLink}
                to="/dashboard/wapi/configs"
              >
                Ajustes avanzados de WhatsApp (templates, throttle, opt-out)
              </Button>
            </Box>
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
