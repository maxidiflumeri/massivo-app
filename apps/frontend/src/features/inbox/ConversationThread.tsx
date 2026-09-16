import { useEffect, useMemo, useRef } from 'react';
import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { formatDateHeader, formatTime } from './formatters';
import { MessageBubble } from './MessageBubble';
import type { InboxMessage, ResolutionNoteItem } from './types';

interface Props {
  messages: InboxMessage[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  /** Si está seteado, los botones interactivos del bot se vuelven clickeables. */
  onInteractiveButtonClick?: (buttonId: string, title: string) => void;
  /** Marca con chips "BOT" los mensajes del motor y "OPCIÓN" lo que eligió el cliente. */
  showBotBadge?: boolean;
  /** Notas de cierre, intercaladas en el hilo por fecha. */
  notes?: ResolutionNoteItem[];
}

type ThreadItem =
  | { kind: 'message'; ts: number; message: InboxMessage }
  | { kind: 'note'; ts: number; note: ResolutionNoteItem };

export function ConversationThread({
  messages,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
  onInteractiveButtonClick,
  showBotBadge,
  notes,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef<string | null>(null);

  // El backend devuelve mensajes desc — los renderizamos asc, con las notas
  // intercaladas. Con historial paginado, las notas anteriores al mensaje más
  // viejo cargado se muestran recién al traer esa página.
  const items = useMemo<ThreadItem[]>(() => {
    const msgs: ThreadItem[] = messages.map((m) => ({
      kind: 'message',
      ts: new Date(m.timestamp).getTime(),
      message: m,
    }));
    const oldest = msgs.reduce((min, it) => Math.min(min, it.ts), Infinity);
    const noteItems: ThreadItem[] = (notes ?? [])
      .map((n) => ({ kind: 'note' as const, ts: new Date(n.createdAt).getTime(), note: n }))
      .filter((n) => !hasMore || n.ts >= oldest);
    return [...msgs, ...noteItems].sort((a, b) => a.ts - b.ts);
  }, [messages, notes, hasMore]);

  useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    const lastId = last.kind === 'message' ? last.message.id : `note:${last.note.id}`;
    if (lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [items]);

  if (loading && messages.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        overflowY: 'auto',
        bgcolor: (t) => (t.palette.mode === 'dark' ? '#0b141a' : '#efeae2'),
        backgroundImage: (t) =>
          t.palette.mode === 'dark'
            ? 'radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)'
            : 'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        p: 2,
      }}
    >
      {hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Chip
            size="small"
            label={loadingMore ? 'Cargando…' : 'Mostrar más antiguos'}
            onClick={onLoadMore}
            disabled={loadingMore}
            variant="outlined"
            sx={{ bgcolor: 'background.paper' }}
          />
        </Box>
      )}
      <Stack spacing={0.5}>
        {items.map((it, idx) => {
          const prev = items[idx - 1];
          const showDate = !prev || dayKey(prev.ts) !== dayKey(it.ts);
          if (it.kind === 'note') {
            return (
              <Box key={`note:${it.note.id}`}>
                {showDate && <DateDivider iso={it.note.createdAt} />}
                <NoteCard note={it.note} />
              </Box>
            );
          }
          const m = it.message;
          const next = items[idx + 1];
          const showTail =
            !next ||
            next.kind !== 'message' ||
            next.message.fromMe !== m.fromMe ||
            next.ts - it.ts > 60_000;
          return (
            <Box key={m.id}>
              {showDate && <DateDivider iso={m.timestamp} />}
              <MessageBubble
                message={m}
                showTail={showTail}
                onInteractiveButtonClick={onInteractiveButtonClick}
                showBotBadge={showBotBadge}
              />
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function DateDivider({ iso }: { iso: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.5 }}>
      <Chip
        size="small"
        label={formatDateHeader(iso)}
        sx={{
          bgcolor: (t) =>
            t.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          fontSize: 11,
          height: 22,
          color: 'text.secondary',
        }}
      />
    </Box>
  );
}

function NoteCard({ note }: { note: ResolutionNoteItem }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
      <Box
        sx={{
          maxWidth: '80%',
          px: 1.5,
          py: 0.75,
          borderRadius: 1.5,
          border: 1,
          borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,213,79,0.35)' : 'rgba(180,130,0,0.3)'),
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,213,79,0.08)' : 'rgba(255,213,79,0.18)'),
        }}
      >
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary' }}>
          📝 Nota de cierre · {note.authorName ?? 'Sistema'} · {formatTime(note.createdAt)}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {note.note}
        </Typography>
      </Box>
    </Box>
  );
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
