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
import AttachFileIcon from '@mui/icons-material/AttachFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import PersonIcon from '@mui/icons-material/Person';
import { ApiError, useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useTeamSocket } from '../../realtime/useTeamSocket';
import type { WapiConfigListItem } from '../wapi/configs/types';
import { inboxApi, quickRepliesApi } from '../wapi/inbox/api';
import { ConversationHeader } from '../wapi/inbox/ConversationHeader';
import { ConversationThread } from '../wapi/inbox/ConversationThread';
import { MessageComposer } from '../wapi/inbox/MessageComposer';
import { isBotInteractionMessage } from '../wapi/inbox/MessageBubble';
import type {
  WapiConversationDetail,
  WapiInboxMediaType,
  WapiInboxMessage,
  WapiMessageNewEvent,
  WapiQuickReply,
} from '../wapi/inbox/types';

const STORAGE_KEY = 'massivo:dev-chat:state';

interface PersistedState {
  configId: string;
  phone: string;
  name: string;
}

function readPersisted(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

function writePersisted(s: Partial<PersistedState>) {
  try {
    const merged = { ...readPersisted(), ...s };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // no-op
  }
}

/**
 * Página `/dashboard/dev/wapi/chat` (4.L extendida). Chat ida-vuelta para
 * desarrollo: a la izquierda el "cliente virtual" inyecta inbound webhooks
 * Meta-shaped (vía /api/dev/wapi/simulate/inbound/*); a la derecha se monta el
 * inbox real con la conversación correspondiente. Requiere una WapiConfig con
 * isTestMode=true (si no, los envíos del operador pegarían a Meta de verdad).
 */
export function WapiSimulatorChatPage() {
  const api = useApi();
  const notify = useNotify();
  const socket = useTeamSocket();
  const persisted = useMemo(readPersisted, []);

  const [configs, setConfigs] = useState<WapiConfigListItem[]>([]);
  const [configId, setConfigId] = useState<string>(persisted.configId ?? '');
  const [phone, setPhone] = useState<string>(persisted.phone ?? '');
  const [name, setName] = useState<string>(persisted.name ?? '');

  const testConfigs = useMemo(
    () => configs.filter((c) => c.isActive && c.isTestMode),
    [configs],
  );
  const selectedConfig = useMemo(
    () => testConfigs.find((c) => c.id === configId) ?? null,
    [testConfigs, configId],
  );

  // Conversación resuelta (existente o creada por primer inbound)
  const [conversation, setConversation] = useState<WapiConversationDetail | null>(null);
  const [messages, setMessages] = useState<WapiInboxMessage[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [quickReplies, setQuickReplies] = useState<WapiQuickReply[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const conversationRef = useRef<WapiConversationDetail | null>(null);
  conversationRef.current = conversation;

  // Cargar configs
  useEffect(() => {
    let cancelled = false;
    api
      .get<WapiConfigListItem[]>('/api/wapi/configs')
      .then((list) => {
        if (cancelled) return;
        setConfigs(list);
        // Si el persistido ya no es test, limpiar
        if (configId && !list.some((c) => c.id === configId && c.isActive && c.isTestMode)) {
          setConfigId('');
        }
        // Auto-pick si hay una sola test
        if (!configId) {
          const onlyTest = list.filter((c) => c.isActive && c.isTestMode);
          if (onlyTest.length === 1 && onlyTest[0]) setConfigId(onlyTest[0].id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Quick replies + me
  useEffect(() => {
    let cancelled = false;
    void quickRepliesApi
      .list(api)
      .then((qs) => {
        if (!cancelled) setQuickReplies(qs);
      })
      .catch(() => undefined);
    void api
      .get<{ user: { id: string } }>('/api/me/context')
      .then((me) => {
        if (!cancelled) setCurrentUserId(me.user.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const resolveConversation = useCallback(async () => {
    if (!configId || !phone.trim()) {
      setConversation(null);
      setMessages([]);
      return;
    }
    setLoadingConv(true);
    try {
      const res = await inboxApi.listConversations(api, {
        tab: 'all',
        configId,
        search: phone.trim(),
        limit: 5,
      });
      const match = res.items.find((c) => c.phone === phone.trim()) ?? res.items[0];
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
      // Auto-mark read
      if (detail.unreadCount > 0) {
        void inboxApi.setRead(api, match.id, true).catch(() => undefined);
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo cargar la conversación');
    } finally {
      setLoadingConv(false);
    }
  }, [api, configId, phone, notify]);

  // Re-resolver cuando cambian config/phone
  useEffect(() => {
    void resolveConversation();
  }, [resolveConversation]);

  // Persistir
  useEffect(() => {
    writePersisted({ configId, phone, name });
  }, [configId, phone, name]);

  // Socket: append a la conversación abierta
  useEffect(() => {
    if (!socket) return;
    const onNew = (ev: WapiMessageNewEvent) => {
      const conv = conversationRef.current;
      if (!conv || ev.conversationId !== conv.id) {
        // Si no hay conv resuelta pero el inbound coincide con configId+phone, re-resolver
        if (!conv && ev.configId === configId && ev.phone === phone.trim()) {
          void resolveConversation();
        }
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === ev.message.id)) return prev;
        return [ev.message, ...prev];
      });
    };
    socket.on('wapi.message.new', onNew);
    return () => {
      socket.off('wapi.message.new', onNew);
    };
  }, [socket, configId, phone, resolveConversation]);

  // Cliente virtual: enviar texto inyectando webhook inbound
  async function sendClientText(body: string) {
    if (!configId || !phone.trim()) {
      notify.error('Faltan config o phone');
      return;
    }
    try {
      const res = await api.post<{ ok: true; metaMessageId: string }>(
        '/api/dev/wapi/simulate/inbound/text',
        {
          configId,
          fromPhone: phone.trim(),
          fromName: name.trim() || undefined,
          body,
        },
      );
      // Si no había conv, intentar resolver
      if (!conversationRef.current) {
        await resolveConversation();
      }
      return res.metaMessageId;
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Error desconocido';
      notify.error(msg);
    }
  }

  async function sendClientButton(buttonId: string, buttonText?: string) {
    if (!configId || !phone.trim()) {
      notify.error('Faltan config o phone');
      return;
    }
    try {
      await api.post('/api/dev/wapi/simulate/inbound/button', {
        configId,
        fromPhone: phone.trim(),
        fromName: name.trim() || undefined,
        buttonId,
        buttonText,
      });
      if (!conversationRef.current) {
        await resolveConversation();
      }
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Error';
      notify.error(msg);
    }
  }

  async function sendClientMedia(file: File, type: WapiInboxMediaType, caption?: string) {
    if (!configId || !phone.trim()) {
      notify.error('Faltan config o phone');
      return;
    }
    try {
      const form = new FormData();
      form.append('configId', configId);
      form.append('fromPhone', phone.trim());
      if (name.trim()) form.append('fromName', name.trim());
      form.append('type', type);
      if (caption && type !== 'audio' && type !== 'sticker') form.append('caption', caption);
      form.append('file', file, file.name);
      await api.postForm('/api/dev/wapi/simulate/inbound/media', form);
      if (!conversationRef.current) {
        await resolveConversation();
      }
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Error';
      notify.error(msg);
    }
  }

  // Operador: usar inboxApi.sendText/sendMedia (ya pasa por isTestMode)
  async function operatorSendText(body: string) {
    if (!conversation) return;
    try {
      const msg = await inboxApi.sendText(api, conversation.id, body);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo enviar');
      throw e;
    }
  }

  async function operatorSendMedia(file: File, type: WapiInboxMediaType, caption?: string) {
    if (!conversation) return;
    try {
      const msg = await inboxApi.sendMedia(api, conversation.id, file, type, caption);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo enviar');
      throw e;
    }
  }

  const noTestConfigs = configs.length > 0 && testConfigs.length === 0;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Paper sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <ScienceIcon color="warning" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Chat simulado WhatsApp (dev)
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Select
            size="small"
            value={configId}
            displayEmpty
            onChange={(e) => setConfigId(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="" disabled>
              {noTestConfigs ? 'No hay configs de test' : 'Elegir config (test)'}
            </MenuItem>
            {testConfigs.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name?.trim() || c.phoneNumberId}
              </MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            label="Phone (cliente)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5491155551234"
            sx={{ minWidth: 180 }}
          />
          <TextField
            size="small"
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ minWidth: 160 }}
          />
          <Tooltip title="Recargar conversación">
            <span>
              <IconButton
                size="small"
                onClick={() => void resolveConversation()}
                disabled={!configId || !phone.trim()}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        {noTestConfigs && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            Para usar este chat necesitás una WapiConfig con <b>Modo test</b> activo. Andá a
            "Números" y activá el toggle en una config — si no, los envíos del operador pegarán a
            Meta de verdad.
          </Alert>
        )}
      </Paper>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 1.5,
        }}
      >
        {/* Cliente virtual */}
        <Paper sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'warning.50' }}
          >
            <Avatar sx={{ bgcolor: 'warning.main', width: 36, height: 36 }}>
              <PersonIcon fontSize="small" />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Cliente virtual {name ? `· ${name}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {phone || '— sin número —'}
              </Typography>
            </Box>
            <Chip size="small" label="Inbound (Meta)" color="warning" variant="outlined" />
          </Stack>
          {!configId || !phone.trim() ? (
            <EmptyHint text="Elegí config + escribí un teléfono para empezar." />
          ) : (
            <ClientThread
              messages={messages}
              onSendText={sendClientText}
              onSendMedia={sendClientMedia}
              onSendButton={sendClientButton}
              loading={loadingConv}
            />
          )}
        </Paper>

        {/* Inbox del operador */}
        <Paper sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {!configId || !phone.trim() ? (
            <EmptyHint text="Elegí config + teléfono y enviá un mensaje desde el cliente para que aparezca aquí." />
          ) : loadingConv && !conversation ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : conversation ? (
            <>
              <ConversationHeader
                conversation={conversation}
                currentUserId={currentUserId}
                onTake={async () => {
                  try {
                    await inboxApi.take(api, conversation.id);
                    await resolveConversation();
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : 'Error');
                  }
                }}
                onAssign={() => undefined}
                onUnassign={async () => {
                  try {
                    await inboxApi.unassign(api, conversation.id);
                    await resolveConversation();
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : 'Error');
                  }
                }}
                onResolve={async () => {
                  try {
                    await inboxApi.resolve(api, conversation.id);
                    await resolveConversation();
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : 'Error');
                  }
                }}
                onReopen={async () => {
                  try {
                    await inboxApi.reopen(api, conversation.id);
                    await resolveConversation();
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : 'Error');
                  }
                }}
                onToggleRead={() => undefined}
              />
              <ConversationThread
                messages={messages.filter((m) => !isBotInteractionMessage(m))}
                loading={loadingConv}
                hasMore={false}
                onLoadMore={() => undefined}
                loadingMore={false}
              />
              <MessageComposer
                conversationId={conversation.id}
                window24hAt={conversation.window24hAt}
                isResolved={conversation.status === 'RESOLVED'}
                quickReplies={quickReplies}
                onSend={operatorSendText}
                onSendMedia={operatorSendMedia}
              />
            </>
          ) : (
            <EmptyHint text="Aún no hay conversación. Enviá un mensaje desde el cliente virtual y aparecerá acá." />
          )}
        </Paper>
      </Box>
    </Box>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <Stack
      sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', p: 3, color: 'text.secondary' }}
    >
      <Typography variant="body2" textAlign="center">
        {text}
      </Typography>
    </Stack>
  );
}

/**
 * Render del thread del cliente virtual: mismos mensajes que el inbox, pero con
 * `fromMe` invertido (lo que el operador escribió → es "incoming" para el cliente).
 */
function ClientThread({
  messages,
  onSendText,
  onSendMedia,
  onSendButton,
  loading,
}: {
  messages: WapiInboxMessage[];
  onSendText: (body: string) => Promise<unknown>;
  onSendMedia: (file: File, type: WapiInboxMediaType, caption?: string) => Promise<void>;
  onSendButton: (buttonId: string, buttonText?: string) => Promise<void>;
  loading: boolean;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Invertir fromMe para que se vea desde la perspectiva del cliente
  const flipped = useMemo<WapiInboxMessage[]>(
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const type: WapiInboxMediaType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'document';
    setSending(true);
    try {
      await onSendMedia(file, type);
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
            await onSendButton(id, title);
          } finally {
            setSending(false);
          }
        }}
      />
      <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.5, bgcolor: 'background.paper' }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          {(['INBOX', 'BAJA', 'IGNORAR'] as const).map((id) => (
            <Button
              key={id}
              size="small"
              variant="outlined"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  await onSendButton(id, id);
                } finally {
                  setSending(false);
                }
              }}
            >
              {id}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Botones de template (4.K)
          </Typography>
        </Stack>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="Escribí como cliente y enter para enviar"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <IconButton
                  size="small"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
                <input
                  type="file"
                  hidden
                  ref={fileRef}
                  onChange={(e) => void handleFile(e)}
                />
              </InputAdornment>
            ),
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
