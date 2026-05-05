import { useEffect, useMemo, useRef } from 'react';
import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DoneIcon from '@mui/icons-material/Done';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { renderWhatsAppMarkdown } from '../templates/whatsappMarkdown';
import { formatDateHeader, formatTime } from './formatters';
import type { WapiInboxMessage } from './types';

interface Props {
  messages: WapiInboxMessage[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}

export function ConversationThread({
  messages,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
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
              <MessageBubble message={m} showTail={showTail} />
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

function MessageBubble({
  message,
  showTail,
}: {
  message: WapiInboxMessage;
  showTail: boolean;
}) {
  const fromMe = message.fromMe;
  const text = extractText(message);
  const failed = message.status === 'failed';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: fromMe ? 'flex-end' : 'flex-start',
        mb: showTail ? 0.75 : 0.25,
      }}
    >
      <Box
        sx={{
          maxWidth: '78%',
          minWidth: 80,
          px: 1.25,
          py: 0.75,
          borderRadius: 1.5,
          ...(fromMe
            ? {
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? '#005c4b' : '#d9fdd3',
                color: (t) => (t.palette.mode === 'dark' ? '#e9edef' : 'text.primary'),
                borderTopRightRadius: showTail ? 0 : 12,
              }
            : {
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? '#1f2c34' : '#fff',
                color: (t) => (t.palette.mode === 'dark' ? '#e9edef' : 'text.primary'),
                borderTopLeftRadius: showTail ? 0 : 12,
                boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              }),
        }}
      >
        {text ? (
          <Typography
            variant="body2"
            component="div"
            sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}
          >
            {renderWhatsAppMarkdown(text)}
          </Typography>
        ) : (
          <Typography
            variant="body2"
            sx={{ fontStyle: 'italic', opacity: 0.8 }}
          >
            {labelFor(message.type)}
          </Typography>
        )}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="flex-end"
          gap={0.5}
          sx={{ mt: 0.25 }}
        >
          {failed && (
            <ErrorOutlineIcon sx={{ fontSize: 12, color: 'error.main' }} />
          )}
          <Typography variant="caption" sx={{ fontSize: 10.5, opacity: 0.7 }}>
            {formatTime(message.timestamp)}
          </Typography>
          {fromMe && !failed && (
            <ReceiptIcon status={message.status} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function ReceiptIcon({ status }: { status: string }) {
  if (status === 'read') {
    return <DoneAllIcon sx={{ fontSize: 14, color: '#53bdeb' }} />;
  }
  if (status === 'delivered') {
    return <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  }
  return <DoneIcon sx={{ fontSize: 14, opacity: 0.6 }} />;
}

function extractText(m: WapiInboxMessage): string | null {
  if (!m.content || typeof m.content !== 'object') return null;
  const c = m.content as Record<string, unknown>;
  if (m.type === 'text') {
    const t = (c.text as { body?: string } | undefined)?.body;
    return t ?? null;
  }
  const sub = c[m.type] as Record<string, unknown> | undefined;
  if (sub) {
    const caption = sub.caption as string | undefined;
    if (caption) return caption;
    const body = sub.body as string | undefined;
    if (body) return body;
  }
  return null;
}

function labelFor(type: string): string {
  switch (type) {
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
    case 'contacts':
      return '👤 Contacto';
    case 'reaction':
      return 'Reacción';
    case 'interactive':
      return 'Mensaje interactivo';
    default:
      return type;
  }
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
