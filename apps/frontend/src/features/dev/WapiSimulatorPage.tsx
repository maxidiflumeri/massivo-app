import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError, useApi } from '../../api/client';
import type { WapiConfigListItem } from '../wapi/configs/types';

const MEDIA_TYPES = [
  { value: 'image', label: 'Imagen', accept: 'image/jpeg,image/png' },
  { value: 'audio', label: 'Audio', accept: 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/webm' },
  { value: 'video', label: 'Video', accept: 'video/mp4,video/3gpp' },
  { value: 'document', label: 'Documento', accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip' },
  { value: 'sticker', label: 'Sticker', accept: 'image/webp' },
] as const;

type MediaTypeValue = (typeof MEDIA_TYPES)[number]['value'];

const STATUS_VALUES = ['sent', 'delivered', 'read', 'failed'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

interface FeedbackState {
  kind: 'success' | 'error';
  message: string;
}

/**
 * Página `/dashboard/dev/wapi/simulator` (4.L). Permite inyectar webhooks
 * Meta-shaped en el backend sin necesidad de Meta ni ngrok. Sólo funciona si
 * el backend tiene `ENABLE_DEV_SIMULATOR=true` y el frontend `VITE_ENABLE_DEV_SIMULATOR=true`.
 */
export function WapiSimulatorPage() {
  const api = useApi();
  const [configs, setConfigs] = useState<WapiConfigListItem[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [configsError, setConfigsError] = useState<string | null>(null);
  const [configId, setConfigId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setConfigsLoading(true);
    api
      .get<WapiConfigListItem[]>('/api/wapi/configs')
      .then((list) => {
        if (cancelled) return;
        setConfigs(list);
        const firstActive = list.find((c) => c.isActive);
        if (firstActive) setConfigId(firstActive.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setConfigsError(err instanceof Error ? err.message : 'Error cargando configs');
      })
      .finally(() => {
        if (!cancelled) setConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Simulador de WhatsApp (dev)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Inyecta webhooks Meta-shaped directamente en el backend para probar el inbox sin necesidad
        de Meta ni ngrok. Útil para QA del thread, media, reacciones y status updates.
      </Typography>

      {configsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {configsError}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <FormControl fullWidth size="small" disabled={configsLoading}>
            <InputLabel>WapiConfig</InputLabel>
            <Select
              value={configId}
              label="WapiConfig"
              onChange={(e) => setConfigId(e.target.value)}
            >
              {configs.map((c) => (
                <MenuItem key={c.id} value={c.id} disabled={!c.isActive}>
                  {c.name ?? c.phoneNumberId} — {c.phoneNumberId}
                  {c.isActive ? '' : ' (inactiva)'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Stack spacing={2}>
        <InboundTextCard api={api} configId={configId} />
        <InboundMediaCard api={api} configId={configId} />
        <InboundReactionCard api={api} configId={configId} />
        <StatusCard api={api} configId={configId} />
      </Stack>
    </Box>
  );
}

// ---- Sub-cards ----

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <CardHeader
      title={title}
      subheader={subtitle}
      titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
      subheaderTypographyProps={{ variant: 'caption' }}
    />
  );
}

function FeedbackBanner({ feedback }: { feedback: FeedbackState | null }) {
  if (!feedback) return null;
  return (
    <Alert severity={feedback.kind} sx={{ mt: 2 }}>
      {feedback.message}
    </Alert>
  );
}

function useSubmitFeedback() {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reportError = (err: unknown) => {
    const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Error desconocido';
    setFeedback({ kind: 'error', message: msg });
  };
  return { feedback, setFeedback, submitting, setSubmitting, reportError };
}

function InboundTextCard({ api, configId }: { api: ReturnType<typeof useApi>; configId: string }) {
  const [fromPhone, setFromPhone] = useState('');
  const [fromName, setFromName] = useState('');
  const [body, setBody] = useState('');
  const { feedback, setFeedback, submitting, setSubmitting, reportError } = useSubmitFeedback();

  const send = async () => {
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ ok: true; metaMessageId: string }>(
        '/api/dev/wapi/simulate/inbound/text',
        {
          configId,
          fromPhone,
          fromName: fromName || undefined,
          body,
        },
      );
      setFeedback({ kind: 'success', message: `Mensaje inyectado (${res.metaMessageId})` });
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !configId || !fromPhone || !body || submitting;

  return (
    <Card>
      <SectionHeader title="Inbound — texto" subtitle="Simula un mensaje de texto entrante" />
      <Divider />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="From phone (E.164 sin +)"
              value={fromPhone}
              onChange={(e) => setFromPhone(e.target.value)}
              size="small"
              fullWidth
              placeholder="5491155551234"
            />
            <TextField
              label="From name (opcional)"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              size="small"
              fullWidth
            />
          </Stack>
          <TextField
            label="Texto"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={2}
            maxRows={6}
            size="small"
            fullWidth
          />
          <Box>
            <Button variant="contained" onClick={send} disabled={disabled}>
              {submitting ? 'Enviando…' : 'Inyectar texto'}
            </Button>
          </Box>
          <FeedbackBanner feedback={feedback} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function InboundMediaCard({ api, configId }: { api: ReturnType<typeof useApi>; configId: string }) {
  const [fromPhone, setFromPhone] = useState('');
  const [fromName, setFromName] = useState('');
  const [type, setType] = useState<MediaTypeValue>('image');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { feedback, setFeedback, submitting, setSubmitting, reportError } = useSubmitFeedback();

  const accept = useMemo(() => MEDIA_TYPES.find((t) => t.value === type)?.accept ?? '*/*', [type]);
  const captionDisabled = type === 'audio' || type === 'sticker';

  const send = async () => {
    setFeedback(null);
    if (!file) {
      setFeedback({ kind: 'error', message: 'Adjuntá un archivo' });
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('configId', configId);
      form.append('fromPhone', fromPhone);
      if (fromName) form.append('fromName', fromName);
      form.append('type', type);
      if (!captionDisabled && caption) form.append('caption', caption);
      form.append('file', file, file.name);
      const res = await api.postForm<{ ok: true; metaMessageId: string; mediaId: string }>(
        '/api/dev/wapi/simulate/inbound/media',
        form,
      );
      setFeedback({
        kind: 'success',
        message: `Media inyectada (${res.metaMessageId}, mediaId=${res.mediaId})`,
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !configId || !fromPhone || !file || submitting;

  return (
    <Card>
      <SectionHeader title="Inbound — media" subtitle="Imagen, audio, video, documento o sticker" />
      <Divider />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="From phone"
              value={fromPhone}
              onChange={(e) => setFromPhone(e.target.value)}
              size="small"
              fullWidth
              placeholder="5491155551234"
            />
            <TextField
              label="From name (opcional)"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              size="small"
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Tipo</InputLabel>
              <Select
                value={type}
                label="Tipo"
                onChange={(e) => {
                  setType(e.target.value as MediaTypeValue);
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                {MEDIA_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              size="small"
              fullWidth
              disabled={captionDisabled}
              helperText={captionDisabled ? 'No aplica para audio/sticker' : ' '}
            />
          </Stack>
          <Box>
            <Button variant="outlined" component="label" size="small">
              {file ? `Archivo: ${file.name}` : 'Seleccionar archivo'}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept={accept}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Button>
          </Box>
          <Box>
            <Button variant="contained" onClick={send} disabled={disabled}>
              {submitting ? 'Enviando…' : 'Inyectar media'}
            </Button>
          </Box>
          <FeedbackBanner feedback={feedback} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function InboundReactionCard({
  api,
  configId,
}: {
  api: ReturnType<typeof useApi>;
  configId: string;
}) {
  const [fromPhone, setFromPhone] = useState('');
  const [targetMetaMessageId, setTargetMetaMessageId] = useState('');
  const [emoji, setEmoji] = useState('👍');
  const { feedback, setFeedback, submitting, setSubmitting, reportError } = useSubmitFeedback();

  const send = async () => {
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ ok: true; metaMessageId: string }>(
        '/api/dev/wapi/simulate/inbound/reaction',
        {
          configId,
          fromPhone,
          targetMetaMessageId,
          emoji,
        },
      );
      setFeedback({ kind: 'success', message: `Reacción inyectada (${res.metaMessageId})` });
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !configId || !fromPhone || !targetMetaMessageId || !emoji || submitting;

  return (
    <Card>
      <SectionHeader
        title="Inbound — reacción"
        subtitle="Reacción del contacto a un wamid existente"
      />
      <Divider />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="From phone"
              value={fromPhone}
              onChange={(e) => setFromPhone(e.target.value)}
              size="small"
              fullWidth
              placeholder="5491155551234"
            />
            <TextField
              label="Emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              size="small"
              sx={{ width: 100 }}
            />
          </Stack>
          <TextField
            label="Meta message id (wamid del mensaje a reaccionar)"
            value={targetMetaMessageId}
            onChange={(e) => setTargetMetaMessageId(e.target.value)}
            size="small"
            fullWidth
            placeholder="wamid.HBgN…"
          />
          <Box>
            <Button variant="contained" onClick={send} disabled={disabled}>
              {submitting ? 'Enviando…' : 'Inyectar reacción'}
            </Button>
          </Box>
          <FeedbackBanner feedback={feedback} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function StatusCard({ api, configId }: { api: ReturnType<typeof useApi>; configId: string }) {
  const [metaMessageId, setMetaMessageId] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [status, setStatus] = useState<StatusValue>('delivered');
  const { feedback, setFeedback, submitting, setSubmitting, reportError } = useSubmitFeedback();

  const send = async () => {
    setFeedback(null);
    setSubmitting(true);
    try {
      await api.post<{ ok: true }>('/api/dev/wapi/simulate/status', {
        configId,
        metaMessageId,
        recipientPhone,
        status,
      });
      setFeedback({ kind: 'success', message: `Status ${status} inyectado` });
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !configId || !metaMessageId || !recipientPhone || submitting;

  return (
    <Card>
      <SectionHeader
        title="Status update"
        subtitle="delivered/read/failed para un mensaje outbound nuestro"
      />
      <Divider />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Recipient phone"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              size="small"
              fullWidth
              placeholder="5491155551234"
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Estado</InputLabel>
              <Select
                value={status}
                label="Estado"
                onChange={(e) => setStatus(e.target.value as StatusValue)}
              >
                {STATUS_VALUES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <TextField
            label="Meta message id (wamid del mensaje outbound)"
            value={metaMessageId}
            onChange={(e) => setMetaMessageId(e.target.value)}
            size="small"
            fullWidth
            placeholder="wamid.HBgN…"
          />
          <Box>
            <Button variant="contained" onClick={send} disabled={disabled}>
              {submitting ? 'Enviando…' : 'Inyectar status'}
            </Button>
          </Box>
          <FeedbackBanner feedback={feedback} />
        </Stack>
      </CardContent>
    </Card>
  );
}
