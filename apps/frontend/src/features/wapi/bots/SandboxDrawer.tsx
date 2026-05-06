import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ScienceIcon from '@mui/icons-material/Science';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { botApi } from './api';
import type { SandboxOutMessage, SandboxSource } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  configId: string;
  /** Si hay draft, default a 'draft'; si no, 'published'. */
  hasDraft: boolean;
  hasPublished: boolean;
}

interface ChatItem {
  id: string;
  side: 'user' | 'bot';
  /** Mensaje original (para mostrar buttons/media). Sólo para 'bot'. */
  bot?: SandboxOutMessage;
  /** Texto plano para 'user' o resumen del bot. */
  text?: string;
  /** Marca un envío del usuario tipo "Click: <título>". */
  buttonClick?: { id: string; title: string };
  /** Marca un envío de template-payload simulado. */
  templatePayload?: string;
}

const STORAGE_PHONE_KEY = 'massivo:bot-sandbox:phone';

function defaultPhone(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_PHONE_KEY);
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return '5491100000000';
}

export function SandboxDrawer({ open, onClose, configId, hasDraft, hasPublished }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [phone, setPhone] = useState<string>(defaultPhone);
  const [source, setSource] = useState<SandboxSource>(hasDraft ? 'draft' : 'published');
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [payloadDialogOpen, setPayloadDialogOpen] = useState(false);
  const [payloadInput, setPayloadInput] = useState('');
  const [sourceUsed, setSourceUsed] = useState<'draft' | 'published' | 'none' | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ topicId: string; nodeId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);

  // Resetear estado al cerrar/cambiar config.
  useEffect(() => {
    if (!open) return;
    setItems([]);
    setError(null);
    setUnavailable(false);
    setSourceUsed(null);
    setSessionInfo(null);
    seqRef.current = 0;
    // Default source: draft si existe, sino published.
    setSource(hasDraft ? 'draft' : 'published');
  }, [open, configId, hasDraft]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PHONE_KEY, phone);
    } catch {
      /* ignore */
    }
  }, [phone]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items]);

  const localId = useCallback((prefix: string) => `${prefix}-${seqRef.current++}`, []);

  const sendStep = useCallback(
    async (
      inbound: { kind: 'text'; body: string } | { kind: 'button'; buttonId: string } | undefined,
      opts: { reset?: boolean; resetOnly?: boolean } = {},
    ) => {
      if (!configId) return;
      setBusy(true);
      setError(null);
      try {
        const r = await botApi.sandboxStep(api, configId, {
          phone,
          source,
          reset: opts.reset,
          resetOnly: opts.resetOnly,
          inbound,
        });
        setSourceUsed(r.sourceUsed);
        setUnavailable(!!r.unavailable);
        setSessionInfo(r.session ? { topicId: r.session.topicId, nodeId: r.session.nodeId } : null);
        if (r.unavailable) {
          setError('No hay flow para correr en esta fuente.');
          return;
        }
        if (r.errors && r.errors.length > 0) {
          setError(r.errors.map((e) => `${e.path}: ${e.message}`).join(' · '));
        }
        if (r.messages.length > 0) {
          setItems((prev) => [
            ...prev,
            ...r.messages.map((m) => ({ id: m.id, side: 'bot' as const, bot: m })),
          ]);
        }
      } catch (e) {
        const msg = (e as Error).message || 'No se pudo correr el sandbox';
        setError(msg);
        notify.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [api, configId, notify, phone, source],
  );

  const handleSendText = useCallback(async () => {
    const body = input.trim();
    if (!body) return;
    setInput('');
    setItems((prev) => [...prev, { id: localId('u'), side: 'user', text: body }]);
    await sendStep({ kind: 'text', body });
  }, [input, localId, sendStep]);

  const handleClickButton = useCallback(
    async (buttonId: string, title: string) => {
      setItems((prev) => [
        ...prev,
        { id: localId('u'), side: 'user', buttonClick: { id: buttonId, title } },
      ]);
      await sendStep({ kind: 'button', buttonId });
    },
    [localId, sendStep],
  );

  const handleSendPayload = useCallback(async () => {
    const payload = payloadInput.trim();
    if (!payload) return;
    setPayloadDialogOpen(false);
    setPayloadInput('');
    setItems((prev) => [
      ...prev,
      { id: localId('u'), side: 'user', templatePayload: payload },
    ]);
    await sendStep({ kind: 'template-payload', payload });
  }, [payloadInput, localId, sendStep]);

  const handleReset = useCallback(async () => {
    setItems([]);
    seqRef.current = 0;
    setSessionInfo(null);
    await sendStep(undefined, { reset: true, resetOnly: true });
    notify.success('Sesión reiniciada');
  }, [sendStep, notify]);

  const sourceOptions = useMemo(
    () => [
      { value: 'draft' as const, label: 'Borrador', disabled: !hasDraft },
      { value: 'published' as const, label: 'Publicado', disabled: !hasPublished },
    ],
    [hasDraft, hasPublished],
  );

  const lastBotIdx = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].side === 'bot' && items[i].bot?.type === 'interactive') return i;
    }
    return -1;
  }, [items]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <ScienceIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            Sandbox del bot
          </Typography>
          <Tooltip title="Reiniciar sesión">
            <span>
              <IconButton size="small" onClick={handleReset} disabled={busy}>
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction="row" gap={1} sx={{ p: 1.25, alignItems: 'center' }}>
          <TextField
            label="Teléfono simulado"
            size="small"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, '').slice(0, 40))}
            sx={{ flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="sandbox-source-label">Fuente</InputLabel>
            <Select
              labelId="sandbox-source-label"
              label="Fuente"
              value={source}
              onChange={(e) => setSource(e.target.value as SandboxSource)}
            >
              {sourceOptions.map((o) => (
                <MenuItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {(sourceUsed || sessionInfo) && (
          <Stack direction="row" gap={0.75} sx={{ px: 1.25, pb: 0.5, flexWrap: 'wrap' }}>
            {sourceUsed && (
              <Chip
                size="small"
                label={`Fuente: ${sourceUsed}`}
                color={sourceUsed === 'none' ? 'warning' : 'default'}
                variant="outlined"
              />
            )}
            {sessionInfo && (
              <Chip
                size="small"
                label={`${sessionInfo.topicId} → ${sessionInfo.nodeId}`}
                variant="outlined"
              />
            )}
            {!sessionInfo && sourceUsed && sourceUsed !== 'none' && (
              <Chip size="small" label="sin sesión" variant="outlined" />
            )}
          </Stack>
        )}

        {error && (
          <Alert severity="warning" sx={{ mx: 1.25, mb: 0.5 }}>
            {error}
          </Alert>
        )}
        {unavailable && !error && (
          <Alert severity="info" sx={{ mx: 1.25, mb: 0.5 }}>
            No hay flow disponible. Guardá un borrador y volvé a probar.
          </Alert>
        )}

        <Divider />

        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 1.25,
            backgroundColor: (t) =>
              t.palette.mode === 'dark' ? 'background.default' : '#ECE5DD',
          }}
        >
          {items.length === 0 && !busy && (
            <Typography variant="caption" color="text.secondary">
              Escribí un mensaje para iniciar la conversación simulada. No se manda nada a Meta.
            </Typography>
          )}
          <Stack gap={0.75}>
            {items.map((it, idx) => (
              <ChatBubble
                key={it.id}
                item={it}
                allowButtons={idx === lastBotIdx}
                onClickButton={handleClickButton}
                disabled={busy}
              />
            ))}
            {busy && (
              <Stack direction="row" gap={1} alignItems="center" sx={{ pl: 1, mt: 0.5 }}>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  pensando…
                </Typography>
              </Stack>
            )}
          </Stack>
        </Box>

        <Stack
          direction="row"
          gap={1}
          sx={{ p: 1, borderTop: 1, borderColor: 'divider', alignItems: 'center' }}
        >
          <Tooltip title="Simular payload de template (rule template-payload del router)">
            <span>
              <IconButton
                size="small"
                onClick={() => setPayloadDialogOpen(true)}
                disabled={busy || unavailable}
              >
                <TouchAppIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <TextField
            size="small"
            placeholder="Escribir mensaje…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendText();
              }
            }}
            disabled={busy || unavailable}
            fullWidth
          />
          <Tooltip title="Enviar mensaje">
            <span>
              <IconButton
                onClick={handleSendText}
                disabled={busy || unavailable || !input.trim()}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  boxShadow: 2,
                  transition: 'transform 120ms ease, box-shadow 120ms ease',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                    transform: 'scale(1.06)',
                    boxShadow: 4,
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'action.disabledBackground',
                    color: 'action.disabled',
                    boxShadow: 0,
                  },
                }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Dialog
        open={payloadDialogOpen}
        onClose={() => setPayloadDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Simular payload de template</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            En prod este inbound entra cuando el cliente clickea un botón de template
            (action <code>BOT</code>). El router lo evalúa con kind <code>template-payload</code>;
            los named groups del regex se inyectan como <code>seedData</code> de la sesión.
            Ej: <code>OFERTA_X_PROD_42</code> contra <code>^OFERTA_X_PROD_(?&lt;producto&gt;\d+)$</code>.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Payload"
            value={payloadInput}
            onChange={(e) => setPayloadInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && payloadInput.trim()) {
                e.preventDefault();
                void handleSendPayload();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayloadDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSendPayload}
            disabled={!payloadInput.trim() || busy}
          >
            Enviar payload
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

interface BubbleProps {
  item: ChatItem;
  allowButtons: boolean;
  onClickButton: (id: string, title: string) => void;
  disabled: boolean;
}

function ChatBubble({ item, allowButtons, onClickButton, disabled }: BubbleProps) {
  const isUser = item.side === 'user';
  if (isUser) {
    if (item.templatePayload) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Paper
            elevation={0}
            sx={{
              maxWidth: '85%',
              p: 1,
              px: 1.25,
              borderRadius: 1.5,
              backgroundColor: '#FFE0B2',
              color: '#0B1116',
            }}
          >
            <Typography
              variant="caption"
              sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              template-payload
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {item.templatePayload}
            </Typography>
          </Paper>
        </Box>
      );
    }
    const text = item.buttonClick ? `▸ ${item.buttonClick.title}` : item.text ?? '';
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Paper
          elevation={0}
          sx={{
            maxWidth: '85%',
            p: 1,
            px: 1.25,
            borderRadius: 1.5,
            backgroundColor: '#DCF8C6',
            color: '#0B1116',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <Typography variant="body2">{text}</Typography>
        </Paper>
      </Box>
    );
  }
  const m = item.bot!;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: '85%',
          p: 1,
          px: 1.25,
          borderRadius: 1.5,
          backgroundColor: 'background.paper',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {m.media && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.5, fontFamily: 'monospace' }}
          >
            [{m.media.mediaType}
            {m.media.filename ? ` · ${m.media.filename}` : ''}]
          </Typography>
        )}
        {m.body && <Typography variant="body2">{m.body}</Typography>}
        {m.handoff && (
          <Chip
            size="small"
            color={m.handoff.escalate ? 'warning' : 'default'}
            label={m.handoff.escalate ? 'HANDOFF — escalar' : 'HANDOFF'}
            sx={{ mt: 0.5 }}
          />
        )}
        {m.buttons && m.buttons.length > 0 && (
          <Stack direction="column" gap={0.5} sx={{ mt: 0.75 }}>
            {m.buttons.map((b) => (
              <Button
                key={b.id}
                size="small"
                variant="outlined"
                disabled={!allowButtons || disabled}
                onClick={() => onClickButton(b.id, b.title)}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {b.title}
              </Button>
            ))}
          </Stack>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', fontSize: 10 }}
        >
          {m.topicId} · {m.nodeId}
        </Typography>
      </Paper>
    </Box>
  );
}
