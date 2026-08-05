import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useTeamSocket } from '../../realtime/useTeamSocket';
import { inboxApi } from '../inbox/api';
import { ConversationThread } from '../inbox/ConversationThread';
import { ChannelBadge } from '../inbox/ChannelBadge';
import { formatPhone } from '../inbox/formatters';
import type {
  ConversationListItem,
  ConversationMessageNewEvent,
  InboxMessage,
} from '../inbox/types';
import { LiveConversationList } from './LiveConversationList';
import { BotTimelineDrawer } from './BotTimelineDrawer';

const PAGE_LIMIT = 30;
const MESSAGES_LIMIT = 50;
const REFETCH_DEBOUNCE_MS = 500;

/**
 * Monitoreo en vivo: lista de conversaciones (todas, también las que atiende el
 * bot) + replay del hilo completo + recorrido técnico del bot.
 *
 * Sólo lectura: no reusa endpoints propios para la lista y los mensajes — usa
 * los del inbox con `includeBotHandled: true`, que es lo único que el inbox
 * oculta por defecto.
 */
export function MonitoringLivePage() {
  const api = useApi();
  const notify = useNotify();
  const socket = useTeamSocket();

  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [connected, setConnected] = useState(false);

  const [selected, setSelected] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);

  const debounceRef = useRef<number | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.id ?? null;

  const loadList = useCallback(
    async (term: string) => {
      try {
        const res = await inboxApi.listConversations(api, {
          includeBotHandled: true,
          limit: PAGE_LIMIT,
          ...(term ? { search: term } : {}),
        });
        setItems(res.items);
        setCursor(res.nextCursor);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'No se pudieron cargar las conversaciones');
      } finally {
        setLoading(false);
      }
    },
    [api, notify],
  );

  // Búsqueda con debounce (el usuario tipea un teléfono entero).
  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => void loadList(search), search ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [search, loadList]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await inboxApi.listConversations(api, {
        includeBotHandled: true,
        limit: PAGE_LIMIT,
        cursor,
        ...(search ? { search } : {}),
      });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo cargar más');
    } finally {
      setLoadingMore(false);
    }
  }, [api, cursor, notify, search]);

  const openConversation = useCallback(
    async (c: ConversationListItem) => {
      setSelected(c);
      setLoadingMessages(true);
      setMessages([]);
      try {
        const res = await inboxApi.listMessages(api, c.id, { limit: MESSAGES_LIMIT });
        setMessages(res.items);
        setMessagesCursor(res.nextCursor);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'No se pudo cargar la conversación');
      } finally {
        setLoadingMessages(false);
      }
    },
    [api, notify],
  );

  const loadMoreMessages = useCallback(async () => {
    if (!selected || !messagesCursor) return;
    setLoadingMoreMessages(true);
    try {
      const res = await inboxApi.listMessages(api, selected.id, {
        limit: MESSAGES_LIMIT,
        cursor: messagesCursor,
      });
      setMessages((prev) => [...prev, ...res.items]);
      setMessagesCursor(res.nextCursor);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo cargar más mensajes');
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [api, messagesCursor, notify, selected]);

  useEffect(() => {
    if (!socket) {
      setConnected(false);
      return;
    }
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onNewMessage = (ev: ConversationMessageNewEvent) => {
      // Hilo abierto: append inmediato (dedupe por id — el mensaje puede venir
      // también en un refetch).
      if (ev.conversationId === selectedRef.current) {
        setMessages((prev) =>
          prev.some((m) => m.id === ev.message.id) ? prev : [ev.message, ...prev],
        );
        setTimelineKey((k) => k + 1);
      }
      // Lista: re-consulta debounced para que suba la conversación con tráfico.
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void loadList(search), REFETCH_DEBOUNCE_MS);
    };

    const onUpdated = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void loadList(search), REFETCH_DEBOUNCE_MS);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('conversation.message.new', onNewMessage);
    socket.on('conversation.updated', onUpdated);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('conversation.message.new', onNewMessage);
      socket.off('conversation.updated', onUpdated);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [socket, loadList, search]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5 }}
      >
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Monitoreo · En vivo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Todas las conversaciones, incluidas las que resuelve el bot.
          </Typography>
        </Box>
        <Chip
          size="small"
          variant="outlined"
          color={connected ? 'success' : 'default'}
          icon={<FiberManualRecordIcon sx={{ fontSize: 10 }} />}
          label={connected ? 'En vivo' : 'Sin conexión'}
        />
      </Stack>
      <Divider />

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Paper
          variant="outlined"
          square
          sx={{ width: 340, flexShrink: 0, display: { xs: 'none', md: 'block' }, minHeight: 0 }}
        >
          <LiveConversationList
            items={items}
            selectedId={selected?.id ?? null}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={!!cursor}
            search={search}
            onSearchChange={setSearch}
            onSelect={(c) => void openConversation(c)}
            onLoadMore={() => void loadMore()}
          />
        </Paper>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {!selected ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <Typography variant="body2">Elegí una conversación para ver el detalle.</Typography>
            </Box>
          ) : (
            <>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1 }}
              >
                <Stack direction="row" alignItems="center" gap={1}>
                  <ChannelBadge kind={selected.channelKind} size={18} />
                  <Typography variant="subtitle2" fontWeight={600}>
                    {selected.name || formatPhone(selected.externalUserId)}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={selected.escalated ? 'Derivada a operador' : 'Atendida por el bot'}
                    color={selected.escalated ? 'warning' : 'default'}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                </Stack>
                <Button
                  size="small"
                  startIcon={<AccountTreeIcon />}
                  onClick={() => setTimelineOpen(true)}
                >
                  Ver recorrido del bot
                </Button>
              </Stack>
              <Divider />
              {/* A diferencia del inbox, NO filtramos los mensajes del bot:
                  el objetivo es justamente ver el ida y vuelta completo. */}
              <ConversationThread
                messages={messages}
                loading={loadingMessages}
                hasMore={!!messagesCursor}
                onLoadMore={() => void loadMoreMessages()}
                loadingMore={loadingMoreMessages}
                showBotBadge
              />
            </>
          )}
        </Box>
      </Box>

      <BotTimelineDrawer
        open={timelineOpen}
        conversationId={selected?.id ?? null}
        refreshKey={timelineKey}
        onClose={() => setTimelineOpen(false)}
      />
    </Box>
  );
}
