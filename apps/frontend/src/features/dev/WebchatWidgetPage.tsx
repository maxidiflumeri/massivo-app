import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PersonIcon from '@mui/icons-material/Person';
import LanguageIcon from '@mui/icons-material/Language';
import { io, type Socket } from 'socket.io-client';
import { useNotify } from '../../feedback/NotifyProvider';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const STORAGE_KEY = 'massivo:dev-webchat-widget:state';

interface WcMessage {
  id: string;
  direction: 'in' | 'out';
  type: 'text' | 'buttons' | 'media';
  text?: string;
  buttons?: Array<{ id: string; title: string }>;
  mediaType?: string;
  url?: string;
  caption?: string;
  ts: string;
}

interface Persisted {
  channelKey: string;
  visitorId: string;
}

function genVisitorId(): string {
  return `wcv_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Página dev `/dashboard/dev/channels/webchat/widget` (Fase 4). Simula el **widget
 * del visitante**: se conecta al namespace `/webchat` con `{ channelKey, visitorId }`
 * (igual que lo haría el widget embebido en un sitio), manda mensajes y recibe las
 * respuestas del bot/operador en vivo. Pegá la widget key del canal Webchat (la ves
 * en la ruedita del canal en Canales).
 */
export function WebchatWidgetPage() {
  const notify = useNotify();
  const persisted = useMemo<Partial<Persisted>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
    } catch {
      return {};
    }
  }, []);

  const [channelKey, setChannelKey] = useState(persisted.channelKey ?? '');
  const [visitorId, setVisitorId] = useState(persisted.visitorId ?? genVisitorId());
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WcMessage[]>([]);
  const [body, setBody] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ channelKey, visitorId }));
    } catch {
      // no-op
    }
  }, [channelKey, visitorId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!channelKey.trim()) {
      notify.error('Pegá la widget key del canal');
      return;
    }
    disconnect();
    const s = io(`${SOCKET_URL}/webchat`, {
      auth: { channelKey: channelKey.trim(), visitorId },
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = s;
    s.on('ready', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => {
      setConnected(false);
      notify.error('No se pudo conectar (¿widget key válida?)');
    });
    s.on('message', (m: WcMessage) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, direction: 'in' }]));
    });
  }, [channelKey, visitorId, disconnect, notify]);

  useEffect(() => () => disconnect(), [disconnect]);

  // Reinicia como visitante nuevo: desconecta, limpia el historial y genera un visitorId
  // fresco (la conversación vieja queda en el inbox). Después se vuelve a Conectar.
  function reset() {
    disconnect();
    setMessages([]);
    setVisitorId(genVisitorId());
  }

  function sendText() {
    const text = body.trim();
    if (!text || !socketRef.current || !connected) return;
    socketRef.current.emit('message', { text });
    setMessages((prev) => [
      ...prev,
      { id: `out_${Date.now()}`, direction: 'out', type: 'text', text, ts: new Date().toISOString() },
    ]);
    setBody('');
  }

  function clickButton(buttonId: string, title: string) {
    if (!socketRef.current || !connected) return;
    socketRef.current.emit('message', { buttonId, text: title });
    setMessages((prev) => [
      ...prev,
      { id: `out_${Date.now()}`, direction: 'out', type: 'text', text: title, ts: new Date().toISOString() },
    ]);
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Paper sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <LanguageIcon sx={{ color: '#6E7781' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Widget Webchat (visitante · dev)
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            label="Widget key"
            value={channelKey}
            onChange={(e) => setChannelKey(e.target.value)}
            sx={{ minWidth: 240 }}
            disabled={connected}
          />
          <TextField
            size="small"
            label="Visitor ID"
            value={visitorId}
            onChange={(e) => setVisitorId(e.target.value)}
            sx={{ minWidth: 160 }}
            disabled={connected}
          />
          {connected ? (
            <Button size="small" variant="outlined" color="inherit" startIcon={<LinkOffIcon fontSize="small" />} onClick={disconnect}>
              Desconectar
            </Button>
          ) : (
            <Button size="small" variant="contained" startIcon={<LinkIcon fontSize="small" />} onClick={connect}>
              Conectar
            </Button>
          )}
          <Tooltip title="Reiniciar (visitante nuevo, historial limpio)">
            <Button size="small" variant="text" color="inherit" startIcon={<RestartAltIcon fontSize="small" />} onClick={reset}>
              Reiniciar
            </Button>
          </Tooltip>
        </Stack>
        {!connected && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Pegá la <b>widget key</b> de un canal Webchat (Canales → ruedita → Widget) y tocá{' '}
            <b>Conectar</b>. Escribí como visitante: si el canal tiene un bot conectado, responde, y la
            conversación aparece en el inbox con el badge de Webchat.
          </Alert>
        )}
      </Paper>

      <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
        >
          <Avatar sx={{ bgcolor: '#6E7781', width: 36, height: 36 }}>
            <PersonIcon fontSize="small" />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Visitante
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {visitorId}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={connected ? 'Conectado' : 'Desconectado'}
            color={connected ? 'success' : 'default'}
            variant="outlined"
          />
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
          {messages.length === 0 ? (
            <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">Conectá y escribí para empezar.</Typography>
            </Stack>
          ) : (
            <Stack spacing={1}>
              {messages.map((m) => (
                <Box key={m.id} sx={{ display: 'flex', justifyContent: m.direction === 'out' ? 'flex-end' : 'flex-start' }}>
                  <Box sx={{ maxWidth: '75%' }}>
                    <Box
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        bgcolor: m.direction === 'out' ? 'primary.main' : 'background.default',
                        color: m.direction === 'out' ? 'primary.contrastText' : 'text.primary',
                        border: m.direction === 'out' ? 'none' : 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {m.text || (m.type === 'media' ? `[${m.mediaType}] ${m.caption ?? ''}` : '')}
                      </Typography>
                    </Box>
                    {m.type === 'buttons' && m.buttons && (
                      <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                        {m.buttons.map((b) => (
                          <Button key={b.id} size="small" variant="outlined" onClick={() => clickButton(b.id, b.title)}>
                            {b.title}
                          </Button>
                        ))}
                      </Stack>
                    )}
                  </Box>
                </Box>
              ))}
              <div ref={endRef} />
            </Stack>
          )}
        </Box>

        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.5, bgcolor: 'background.paper' }}>
          <TextField
            size="small"
            fullWidth
            multiline
            maxRows={4}
            placeholder={connected ? 'Escribí como visitante…' : 'Conectá primero'}
            value={body}
            disabled={!connected}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" color="primary" onClick={sendText} disabled={!connected || !body.trim()}>
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
}
