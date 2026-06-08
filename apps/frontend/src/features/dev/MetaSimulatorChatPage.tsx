import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PersonIcon from '@mui/icons-material/Person';
import LinkIcon from '@mui/icons-material/Link';
import { ApiError, useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useTeamSocket } from '../../realtime/useTeamSocket';
import { channelMeta, type ChannelKind } from '../channels/channelMeta';
import { inboxApi } from '../inbox/api';
import { ConversationThread } from '../inbox/ConversationThread';
import type { ConversationDetail, ConversationMessageNewEvent, InboxMessage } from '../inbox/types';
import type { BotListItem } from '../bots/types';

interface Persisted {
  botId: string;
  channelId: string;
  psid: string;
}

/**
 * Sandbox dev genérico para canales de Meta Messaging (Messenger e Instagram, que
 * comparten el flujo). El "cliente virtual" (PSID/IGSID) inyecta inbounds vía
 * `/api/dev/channels/{kind}/inbound`; el bot responde (en modo test, sin pegar a
 * Meta) y se ve acá + en el inbox real (con el badge del canal). Requiere un Channel
 * de test del kind, que se crea con "Conectar canal" (opcionalmente atado a un bot).
 * Las páginas concretas (`MessengerSimulatorChatPage`, `InstagramSimulatorChatPage`)
 * sólo fijan el `kind`.
 */
export function MetaSimulatorChatPage({ kind }: { kind: ChannelKind }) {
  const api = useApi();
  const notify = useNotify();
  const socket = useTeamSocket();

  const meta = channelMeta(kind);
  const Icon = meta.Icon;
  const endpoint = `/api/dev/channels/${kind.toLowerCase()}`;
  const idLabel = kind === 'INSTAGRAM' ? 'IGSID' : 'PSID';
  const storageKey = `massivo:dev-${kind.toLowerCase()}-chat:state`;
  const defaultPsid = kind === 'INSTAGRAM' ? 'ig-user-1' : 'user-1';

  const persisted = useMemo<Partial<Persisted>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
    } catch {
      return {};
    }
  }, [storageKey]);

  const [bots, setBots] = useState<BotListItem[]>([]);
  const [botId, setBotId] = useState(persisted.botId ?? '');
  const [channelId, setChannelId] = useState(persisted.channelId ?? '');
  const [psid, setPsid] = useState(persisted.psid ?? defaultPsid);
  const [ensuring, setEnsuring] = useState(false);

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const conversationRef = useRef<ConversationDetail | null>(null);
  conversationRef.current = conversation;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ botId, channelId, psid }));
    } catch {
      // no-op
    }
  }, [storageKey, botId, channelId, psid]);

  // Cargar bots para el selector "conectar bot".
  useEffect(() => {
    let cancelled = false;
    void api
      .get<BotListItem[]>('/api/bots')
      .then((list) => {
        if (!cancelled) setBots(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const ensureChannel = useCallback(async () => {
    setEnsuring(true);
    try {
      const res = await api.post<{ id: string; pageId: string; botId: string | null }>(
        `${endpoint}/ensure`,
        botId ? { botId } : {},
      );
      setChannelId(res.id);
      notify.success(`Canal ${meta.label} listo (${res.pageId})`);
    } catch (e) {
      notify.error(e instanceof ApiError || e instanceof Error ? e.message : 'No se pudo crear el canal');
    } finally {
      setEnsuring(false);
    }
  }, [api, endpoint, botId, meta.label, notify]);

  const resolveConversation = useCallback(async () => {
    if (!channelId || !psid.trim()) {
      setConversation(null);
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const res = await inboxApi.listConversations(api, {
        channelId,
        search: psid.trim(),
        includeBotHandled: true,
        limit: 5,
      });
      const match = res.items.find((c) => c.externalUserId === psid.trim()) ?? res.items[0];
      if (!match) {
        setConversation(null);
        setMessages([]);
        return;
      }
      const [detail, msgs] = await Promise.all([
        inboxApi.getConversation(api, match.id),
        inboxApi.listMessages(api, match.id, { limit: 50 }),
      ]);
      setConversation(detail);
      setMessages(msgs.items);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo cargar la conversación');
    } finally {
      setLoading(false);
    }
  }, [api, channelId, psid, notify]);

  useEffect(() => {
    void resolveConversation();
  }, [resolveConversation]);

  // Socket: append en vivo cada mensaje (del bot/operador) de este canal+psid.
  // Appendeamos SIEMPRE (dedupe por id) sin depender de que la conversación ya esté
  // resuelta — así no se pierden mensajes del primer turno. Resolvemos el detalle
  // (header/historial) una vez si todavía no lo tenemos.
  useEffect(() => {
    if (!socket) return;
    const onNew = (ev: ConversationMessageNewEvent) => {
      if (ev.channelId !== channelId || ev.externalUserId !== psid.trim()) return;
      setMessages((prev) => (prev.some((m) => m.id === ev.message.id) ? prev : [ev.message, ...prev]));
      if (!conversationRef.current) void resolveConversation();
    };
    socket.on('conversation.message.new', onNew);
    return () => {
      socket.off('conversation.message.new', onNew);
    };
  }, [socket, channelId, psid, resolveConversation]);

  async function sendInbound(body: { text?: string; quickReplyPayload?: string }) {
    if (!channelId || !psid.trim()) {
      notify.error(`Primero conectá un canal y poné un ${idLabel}`);
      return;
    }
    try {
      await api.post(`${endpoint}/inbound`, {
        channelId,
        psid: psid.trim(),
        ...body,
      });
      if (!conversationRef.current) await resolveConversation();
    } catch (e) {
      notify.error(e instanceof ApiError || e instanceof Error ? e.message : 'Error');
    }
  }

  // Reinicia la conversación de prueba como un cliente nuevo (psid fresco): el bot
  // saluda de cero y la vista queda limpia (la conversación vieja queda en el inbox).
  function resetConversation() {
    setConversation(null);
    setMessages([]);
    setPsid(`user-${Math.random().toString(36).slice(2, 6)}`);
  }

  const ready = !!channelId && !!psid.trim();
  const selectedBot = bots.find((b) => b.botId === botId);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Paper sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Icon sx={{ color: meta.color }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Chat simulado {meta.label} (dev)
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Select
            size="small"
            value={botId}
            displayEmpty
            onChange={(e) => setBotId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">
              <em>Sin bot</em>
            </MenuItem>
            {bots.map((b) => (
              <MenuItem key={b.botId} value={b.botId}>
                {b.name} {b.enabled ? '' : '(borrador)'}
              </MenuItem>
            ))}
          </Select>
          <Tooltip title={`Crea (o reusa) un canal ${meta.label} de test y lo conecta al bot elegido`}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={ensuring ? <CircularProgress size={14} /> : <LinkIcon fontSize="small" />}
                onClick={() => void ensureChannel()}
                disabled={ensuring}
              >
                {channelId ? 'Reconectar' : 'Conectar canal'}
              </Button>
            </span>
          </Tooltip>
          <TextField
            size="small"
            label={`${idLabel} (cliente)`}
            value={psid}
            onChange={(e) => setPsid(e.target.value)}
            sx={{ minWidth: 160 }}
          />
          <Tooltip title="Recargar conversación">
            <span>
              <IconButton size="small" onClick={() => void resolveConversation()} disabled={!ready}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reiniciar (cliente nuevo, historial limpio)">
            <span>
              <IconButton size="small" onClick={resetConversation} disabled={!channelId}>
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        {!channelId && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Elegí un bot (publicado) y tocá <b>Conectar canal</b> para crear un canal {meta.label} de
            test. Después escribí como cliente abajo: el bot responde y la conversación aparece en el
            inbox con el badge de {meta.label}.
          </Alert>
        )}
        {channelId && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Canal: <code>{channelId}</code>
            {selectedBot ? ` · bot: ${selectedBot.name}` : ' · sin bot conectado'}
          </Typography>
        )}
      </Paper>

      <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
        >
          <Avatar sx={{ bgcolor: meta.color, width: 36, height: 36 }}>
            <PersonIcon fontSize="small" />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Cliente {meta.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {psid || `— sin ${idLabel} —`}
            </Typography>
          </Box>
          <Chip size="small" label="Inbound simulado" sx={{ bgcolor: `${meta.color}22` }} />
        </Stack>
        {!ready ? (
          <EmptyHint text={`Conectá un canal y poné un ${idLabel} para empezar.`} />
        ) : (
          <ClientThread
            messages={messages}
            loading={loading}
            onSendText={(text) => sendInbound({ text })}
            onQuickReply={(id, title) => sendInbound({ quickReplyPayload: id, text: title })}
          />
        )}
      </Paper>
    </Box>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', p: 3, color: 'text.secondary' }}>
      <Typography variant="body2" textAlign="center">
        {text}
      </Typography>
    </Stack>
  );
}

/**
 * Thread desde la perspectiva del cliente: mismos mensajes que el inbox pero con
 * `fromMe` invertido (lo que el bot/operador mandó es "incoming" para el cliente).
 * Los botones del bot (quick replies) se vuelven clickeables vía onQuickReply.
 */
function ClientThread({
  messages,
  loading,
  onSendText,
  onQuickReply,
}: {
  messages: InboxMessage[];
  loading: boolean;
  onSendText: (text: string) => Promise<void> | void;
  onQuickReply: (id: string, title: string) => Promise<void> | void;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Vista desde el cliente: invertimos fromMe (lo del bot/operador es "entrante").
  // NO filtramos los mensajes del bot (MENU/MESSAGE = system bot-menu/bot-message):
  // son justo lo que el cliente ve (bienvenida + botoneras), igual que en el webchat.
  // ConversationThread renderiza los botones del MENU como quick replies clickeables.
  const flipped = useMemo<InboxMessage[]>(
    () => messages.map((m) => ({ ...m, fromMe: !m.fromMe })),
    [messages],
  );

  async function handleSend() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSendText(text);
      setBody('');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <ConversationThread
        messages={flipped}
        loading={loading}
        hasMore={false}
        onLoadMore={() => undefined}
        loadingMore={false}
        onInteractiveButtonClick={async (id, title) => {
          if (sending) return;
          setSending(true);
          try {
            await onQuickReply(id, title);
          } finally {
            setSending(false);
          }
        }}
      />
      <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.5, bgcolor: 'background.paper' }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="Escribí como cliente y Enter para enviar"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button
                  size="small"
                  variant="contained"
                  endIcon={<SendIcon fontSize="small" />}
                  onClick={() => void handleSend()}
                  disabled={!body.trim() || sending}
                >
                  Enviar
                </Button>
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </>
  );
}
