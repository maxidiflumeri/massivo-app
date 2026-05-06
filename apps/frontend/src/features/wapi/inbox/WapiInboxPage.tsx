import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useTeamSocket } from '../../../realtime/useTeamSocket';
import { inboxApi, quickRepliesApi } from './api';
import { ConversationList, type InboxConfigOption } from './ConversationList';
import { ConversationHeader } from './ConversationHeader';
import { ConversationThread } from './ConversationThread';
import { isBotInteractionMessage } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { AssignDialog } from './AssignDialog';
import { ResolveDialog } from './ResolveDialog';
import type { WapiConfigListItem } from '../configs/types';
import type {
  InboxTab,
  WapiConversationDetail,
  WapiConversationListItem,
  WapiConversationUpdatedEvent,
  WapiInboxMediaType,
  WapiInboxMessage,
  WapiMessageNewEvent,
  WapiQuickReply,
} from './types';

const PAGE_LIMIT = 30;
const CONFIG_FILTER_STORAGE_KEY = 'massivo:wapi-inbox-configId';

export function WapiInboxPage() {
  const api = useApi();
  const notify = useNotify();
  const socket = useTeamSocket();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Lista
  const [tab, setTab] = useState<InboxTab>('mine');
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<WapiConversationListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listMore, setListMore] = useState(false);

  // Selección
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<WapiConversationDetail | null>(null);
  const [messages, setMessages] = useState<WapiInboxMessage[]>([]);
  const [thLoading, setThLoading] = useState(false);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  const [msgMore, setMsgMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Dialogs
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  // Quick replies
  const [quickReplies, setQuickReplies] = useState<WapiQuickReply[]>([]);

  // Filtro por línea (WapiConfig)
  const [configs, setConfigs] = useState<InboxConfigOption[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem(CONFIG_FILTER_STORAGE_KEY);
      return v && v !== '' ? v : null;
    } catch {
      return null;
    }
  });

  const handleConfigChange = useCallback((id: string | null) => {
    setSelectedConfigId(id);
    setSelectedId(null);
    try {
      if (id) localStorage.setItem(CONFIG_FILTER_STORAGE_KEY, id);
      else localStorage.removeItem(CONFIG_FILTER_STORAGE_KEY);
    } catch {
      // no-op
    }
  }, []);

  // Cargar configs activas
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.get<WapiConfigListItem[]>('/api/wapi/configs');
        if (cancelled) return;
        const active: InboxConfigOption[] = list
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, label: c.name?.trim() || c.phoneNumberId }));
        setConfigs(active);
        // Si el config persistido ya no existe / está inactivo, limpiar
        setSelectedConfigId((cur) => {
          if (cur && !active.some((c) => c.id === cur)) {
            try {
              localStorage.removeItem(CONFIG_FILTER_STORAGE_KEY);
            } catch {
              // no-op
            }
            return null;
          }
          return cur;
        });
      } catch {
        if (!cancelled) setConfigs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const selectedConfigRef = useRef<string | null>(null);
  selectedConfigRef.current = selectedConfigId;

  // Cargar usuario actual
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await api.get<{ user: { id: string } }>('/api/me/context');
        if (!cancelled) setCurrentUserId(me.user.id);
      } catch {
        // no-op
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Cargar quick replies
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await quickRepliesApi.list(api);
        if (!cancelled) setQuickReplies(list);
      } catch {
        if (!cancelled) setQuickReplies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await inboxApi.listConversations(api, {
        tab,
        configId: selectedConfigId ?? undefined,
        search: debouncedSearch || undefined,
        limit: PAGE_LIMIT,
        priority: priorityOnly || undefined,
      });
      setItems(res.items);
      setListCursor(res.nextCursor);
      setListMore(!!res.nextCursor);
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo cargar el inbox');
    } finally {
      setListLoading(false);
    }
  }, [api, tab, debouncedSearch, selectedConfigId, priorityOnly, notify]);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  async function loadMoreList() {
    if (!listCursor || listLoading) return;
    setListLoading(true);
    try {
      const res = await inboxApi.listConversations(api, {
        tab,
        configId: selectedConfigId ?? undefined,
        search: debouncedSearch || undefined,
        cursor: listCursor,
        limit: PAGE_LIMIT,
        priority: priorityOnly || undefined,
      });
      setItems((prev) => [...prev, ...res.items]);
      setListCursor(res.nextCursor);
      setListMore(!!res.nextCursor);
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo cargar más');
    } finally {
      setListLoading(false);
    }
  }

  // Cargar conversación seleccionada
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  useEffect(() => {
    if (!selectedId) {
      setConversation(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setThLoading(true);
    setMessages([]);
    setMsgCursor(null);
    setMsgMore(false);
    void (async () => {
      try {
        const [detail, msgs] = await Promise.all([
          inboxApi.getConversation(api, selectedId),
          inboxApi.listMessages(api, selectedId, { limit: 30 }),
        ]);
        if (cancelled) return;
        setConversation(detail);
        setMessages(msgs.items);
        setMsgCursor(msgs.nextCursor);
        setMsgMore(!!msgs.nextCursor);
        // Auto-mark como leído si tenía no leídos
        if (detail.unreadCount > 0) {
          try {
            await inboxApi.setRead(api, selectedId, true);
            setConversation((c) => (c ? { ...c, unreadCount: 0 } : c));
            setItems((prev) =>
              prev.map((it) => (it.id === selectedId ? { ...it, unreadCount: 0 } : it)),
            );
          } catch {
            // no-op
          }
        }
      } catch (e) {
        if (!cancelled) notify.error((e as Error).message || 'No se pudo cargar la conversación');
      } finally {
        if (!cancelled) setThLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, api, notify]);

  async function loadOlderMessages() {
    if (!selectedId || !msgCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await inboxApi.listMessages(api, selectedId, {
        cursor: msgCursor,
        limit: 30,
      });
      setMessages((prev) => [...prev, ...res.items]);
      setMsgCursor(res.nextCursor);
      setMsgMore(!!res.nextCursor);
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo cargar más mensajes');
    } finally {
      setLoadingOlder(false);
    }
  }

  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    const onNew = (ev: WapiMessageNewEvent) => {
      // Si hay filtro por línea activo, ignorar eventos de otras líneas.
      // Cambiar de filtro resetea la conversación abierta, así que la abierta
      // siempre pertenece a la línea seleccionada.
      const filterCfg = selectedConfigRef.current;
      if (filterCfg && ev.configId !== filterCfg) return;
      // Append a la conversación abierta
      if (ev.conversationId === selectedRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === ev.message.id)) return prev;
          return [ev.message, ...prev];
        });
        // Si no es nuestro y la conv está abierta, marcamos como leído
        if (!ev.message.fromMe) {
          void inboxApi.setRead(api, ev.conversationId, true).catch(() => undefined);
        }
      }
      // Refrescar la lista (preview + orden)
      setItems((prev) => {
        const idx = prev.findIndex((c) => c.id === ev.conversationId);
        if (idx === -1) {
          // No está en la lista actual: refrescamos
          void reloadList();
          return prev;
        }
        const target = prev[idx];
        if (!target) return prev;
        const updated: WapiConversationListItem = {
          ...target,
          lastMessageAt: ev.message.timestamp,
          lastMessage: {
            fromMe: ev.message.fromMe,
            type: ev.message.type,
            preview: previewFromMessage(ev.message),
            timestamp: ev.message.timestamp,
          },
          unreadCount:
            ev.conversationId === selectedRef.current || ev.message.fromMe
              ? target.unreadCount
              : target.unreadCount + 1,
        };
        const next = [...prev];
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
    };

    const onUpdated = (ev: WapiConversationUpdatedEvent) => {
      const filterCfg = selectedConfigRef.current;
      if (filterCfg && ev.configId && ev.configId !== filterCfg) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === ev.id
            ? {
                ...it,
                ...(ev.status !== undefined ? { status: ev.status } : {}),
                ...(ev.assignedUserId !== undefined
                  ? { assignedUserId: ev.assignedUserId }
                  : {}),
                ...(ev.lastMessageAt !== undefined ? { lastMessageAt: ev.lastMessageAt } : {}),
                ...(ev.resolvedAt !== undefined ? { resolvedAt: ev.resolvedAt } : {}),
                ...(ev.unreadCount !== undefined ? { unreadCount: ev.unreadCount } : {}),
                ...(ev.priority !== undefined ? { priority: ev.priority } : {}),
              }
            : it,
        ),
      );
      if (ev.id === selectedRef.current) {
        setConversation((c) =>
          c
            ? {
                ...c,
                ...(ev.status !== undefined ? { status: ev.status } : {}),
                ...(ev.assignedUserId !== undefined
                  ? { assignedUserId: ev.assignedUserId }
                  : {}),
                ...(ev.lastMessageAt !== undefined ? { lastMessageAt: ev.lastMessageAt } : {}),
                ...(ev.resolvedAt !== undefined ? { resolvedAt: ev.resolvedAt } : {}),
                ...(ev.unreadCount !== undefined ? { unreadCount: ev.unreadCount } : {}),
                ...(ev.priority !== undefined ? { priority: ev.priority } : {}),
              }
            : c,
        );
      }
    };

    socket.on('wapi.message.new', onNew);
    socket.on('wapi.conversation.updated', onUpdated);
    return () => {
      socket.off('wapi.message.new', onNew);
      socket.off('wapi.conversation.updated', onUpdated);
    };
  }, [socket, api, reloadList]);

  // Acciones
  async function handleSend(body: string) {
    if (!selectedId) return;
    try {
      const msg = await inboxApi.sendText(api, selectedId, body);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo enviar el mensaje');
      throw e;
    }
  }

  async function handleSendMedia(file: File, type: WapiInboxMediaType, caption?: string) {
    if (!selectedId) return;
    try {
      const msg = await inboxApi.sendMedia(api, selectedId, file, type, caption);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo enviar el archivo');
      throw e;
    }
  }

  async function handleTake() {
    if (!selectedId) return;
    try {
      await inboxApi.take(api, selectedId);
      notify.success('Conversación tomada');
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo tomar la conversación');
    }
  }

  async function handleAssign(userId: string) {
    if (!selectedId) return;
    await inboxApi.assign(api, selectedId, userId);
    notify.success('Conversación asignada');
  }

  async function handleUnassign() {
    if (!selectedId) return;
    try {
      await inboxApi.unassign(api, selectedId);
      notify.success('Conversación liberada');
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo liberar');
    }
  }

  async function handleResolve(note: string | null) {
    if (!selectedId) return;
    await inboxApi.resolve(api, selectedId, note ?? undefined);
    notify.success('Conversación resuelta');
  }

  async function handleReopen() {
    if (!selectedId) return;
    try {
      await inboxApi.reopen(api, selectedId);
      notify.success('Conversación reabierta');
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo reabrir');
    }
  }

  async function handleToggleRead() {
    if (!selectedId || !conversation) return;
    const wasUnread = conversation.unreadCount > 0;
    try {
      const res = await inboxApi.setRead(api, selectedId, wasUnread);
      setConversation((c) => (c ? { ...c, unreadCount: res.unreadCount } : c));
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedId ? { ...it, unreadCount: res.unreadCount } : it,
        ),
      );
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo actualizar');
    }
  }

  const empty = useMemo(
    () => !conversation && !thLoading,
    [conversation, thLoading],
  );

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '360px 1fr' },
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: { xs: selectedId ? 'none' : 'block', md: 'block' }, minHeight: 0 }}>
        <ConversationList
          tab={tab}
          onTabChange={(t) => {
            setTab(t);
            setSelectedId(null);
          }}
          search={search}
          onSearchChange={setSearch}
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={listLoading && items.length === 0}
          hasMore={listMore}
          onLoadMore={loadMoreList}
          loadingMore={listLoading && items.length > 0}
          configs={configs}
          selectedConfigId={selectedConfigId}
          onConfigChange={handleConfigChange}
          priorityOnly={priorityOnly}
          onPriorityChange={(v) => {
            setPriorityOnly(v);
            setSelectedId(null);
          }}
        />
      </Box>
      <Box
        sx={{
          display: { xs: selectedId ? 'flex' : 'none', md: 'flex' },
          flexDirection: 'column',
          minHeight: 0,
          bgcolor: 'background.paper',
        }}
      >
        {empty ? (
          <EmptyState />
        ) : conversation ? (
          <>
            <ConversationHeader
              conversation={conversation}
              currentUserId={currentUserId}
              onTake={handleTake}
              onAssign={() => setAssignOpen(true)}
              onUnassign={handleUnassign}
              onResolve={() => setResolveOpen(true)}
              onReopen={handleReopen}
              onToggleRead={handleToggleRead}
            />
            <ConversationThread
              messages={messages.filter((m) => !isBotInteractionMessage(m))}
              loading={thLoading}
              hasMore={msgMore}
              onLoadMore={loadOlderMessages}
              loadingMore={loadingOlder}
            />
            <MessageComposer
              conversationId={conversation.id}
              window24hAt={conversation.window24hAt}
              isResolved={conversation.status === 'RESOLVED'}
              quickReplies={quickReplies}
              onSend={handleSend}
              onSendMedia={handleSendMedia}
            />
          </>
        ) : null}
      </Box>
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onAssign={handleAssign}
        currentAssignedUserId={conversation?.assignedUserId ?? null}
      />
      <ResolveDialog
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={handleResolve}
      />
    </Box>
  );
}

function EmptyState() {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ flex: 1, color: 'text.secondary', gap: 1.5, p: 4 }}
    >
      <ChatBubbleOutlineIcon sx={{ fontSize: 48, opacity: 0.4 }} />
      <Typography variant="body2">Seleccioná una conversación para empezar</Typography>
    </Stack>
  );
}

function previewFromMessage(m: WapiInboxMessage): string {
  if (!m.content || typeof m.content !== 'object') return '';
  const c = m.content as Record<string, unknown>;
  if (m.type === 'text') {
    return ((c.text as { body?: string } | undefined)?.body ?? '').slice(0, 120);
  }
  const sub = c[m.type] as Record<string, unknown> | undefined;
  if (sub) {
    const caption = (sub.caption as string | undefined) ?? (sub.body as string | undefined);
    if (caption) return caption.slice(0, 120);
  }
  switch (m.type) {
    case 'image':
      return '📷 Imagen';
    case 'audio':
      return '🎤 Audio';
    case 'video':
      return '🎬 Video';
    case 'document':
      return '📄 Documento';
    case 'sticker':
      return 'Sticker';
    case 'location':
      return '📍 Ubicación';
    default:
      return '';
  }
}
