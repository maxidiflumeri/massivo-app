import { useEffect, useMemo, useRef } from 'react';
import { Box, Chip, CircularProgress, Stack } from '@mui/material';
import { formatDateHeader } from './formatters';
import { MessageBubble } from './MessageBubble';
import type { InboxMessage } from './types';

interface Props {
  messages: InboxMessage[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  /** Si está seteado, los botones interactivos del bot se vuelven clickeables. */
  onInteractiveButtonClick?: (buttonId: string, title: string) => void;
}

export function ConversationThread({
  messages,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
  onInteractiveButtonClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef<string | null>(null);

  // El backend devuelve mensajes desc — los renderizamos asc.
  const ordered = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [messages]);

  useEffect(() => {
    const last = ordered[ordered.length - 1];
    if (!last) return;
    if (last.id !== lastIdRef.current) {
      lastIdRef.current = last.id;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [ordered]);

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
        {ordered.map((m, idx) => {
          const prev = ordered[idx - 1];
          const showDate =
            !prev || dayKey(prev.timestamp) !== dayKey(m.timestamp);
          const showTail =
            !ordered[idx + 1] ||
            ordered[idx + 1]?.fromMe !== m.fromMe ||
            new Date(ordered[idx + 1]!.timestamp).getTime() -
              new Date(m.timestamp).getTime() >
              60_000;
          return (
            <Box key={m.id}>
              {showDate && <DateDivider iso={m.timestamp} />}
              <MessageBubble
                message={m}
                showTail={showTail}
                onInteractiveButtonClick={onInteractiveButtonClick}
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

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
