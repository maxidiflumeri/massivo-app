import { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Modal,
  Stack,
  Typography,
} from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DoneIcon from '@mui/icons-material/Done';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import CloseIcon from '@mui/icons-material/Close';
import { useApi } from '../../../api/client';
import { renderWhatsAppMarkdown } from '../templates/whatsappMarkdown';
import { formatTime } from './formatters';
import { inboxApi } from './api';
import type { WapiInboxMessage } from './types';

interface Props {
  message: WapiInboxMessage;
  showTail: boolean;
}

export function MessageBubble({ message, showTail }: Props) {
  const fromMe = message.fromMe;
  const failed = message.status === 'failed';
  const isReaction = message.type === 'reaction';
  const text = extractText(message);

  // Reacciones: bubble compacto sin meta (sin time/check)
  if (isReaction) {
    const emoji = extractReactionEmoji(message);
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: fromMe ? 'flex-end' : 'flex-start',
          mb: 0.25,
        }}
      >
        <Box
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 5,
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Typography sx={{ fontSize: 18, lineHeight: 1 }}>{emoji ?? '·'}</Typography>
          <Typography variant="caption" sx={{ opacity: 0.65, fontSize: 10.5 }}>
            {formatTime(message.timestamp)}
          </Typography>
        </Box>
      </Box>
    );
  }

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
                bgcolor: (t) => (t.palette.mode === 'dark' ? '#005c4b' : '#d9fdd3'),
                color: (t) => (t.palette.mode === 'dark' ? '#e9edef' : 'text.primary'),
                borderTopRightRadius: showTail ? 0 : 12,
              }
            : {
                bgcolor: (t) => (t.palette.mode === 'dark' ? '#1f2c34' : '#fff'),
                color: (t) => (t.palette.mode === 'dark' ? '#e9edef' : 'text.primary'),
                borderTopLeftRadius: showTail ? 0 : 12,
                boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              }),
        }}
      >
        <MediaContent message={message} />
        {text && (
          <Typography
            variant="body2"
            component="div"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.45,
              mt: hasMediaContent(message) ? 0.5 : 0,
            }}
          >
            {renderWhatsAppMarkdown(text)}
          </Typography>
        )}
        {!text && !hasMediaContent(message) && (
          <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.8 }}>
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
          {failed && <ErrorOutlineIcon sx={{ fontSize: 12, color: 'error.main' }} />}
          <Typography variant="caption" sx={{ fontSize: 10.5, opacity: 0.7 }}>
            {formatTime(message.timestamp)}
          </Typography>
          {fromMe && !failed && <ReceiptIcon status={message.status} />}
        </Stack>
      </Box>
    </Box>
  );
}

function ReceiptIcon({ status }: { status: string }) {
  if (status === 'read') return <DoneAllIcon sx={{ fontSize: 14, color: '#53bdeb' }} />;
  if (status === 'delivered') return <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  return <DoneIcon sx={{ fontSize: 14, opacity: 0.6 }} />;
}

function MediaContent({ message }: { message: WapiInboxMessage }) {
  const type = message.type;
  if (type === 'image' || type === 'sticker') return <ImageBubble message={message} />;
  if (type === 'video') return <VideoBubble message={message} />;
  if (type === 'audio') return <AudioBubble message={message} />;
  if (type === 'document') return <DocumentBubble message={message} />;
  return null;
}

function hasMediaContent(m: WapiInboxMessage): boolean {
  return m.type === 'image' || m.type === 'sticker' || m.type === 'video' || m.type === 'audio' || m.type === 'document';
}

/**
 * Carga un binario autenticado y devuelve un object URL listo para usar en
 * `<img>`, `<video>`, `<audio>` o `<a download>`. Revoca la URL al desmontar.
 *
 * Devuelve `loading` true mientras se descarga; `error` si falla; `url` cuando
 * está listo. No hace cache entre instancias — confiamos en el `Cache-Control`
 * del endpoint para que el browser cachee el blob.
 */
function useMediaBlobUrl(messageId: string, enabled: boolean) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const blob = await api.getBlob(inboxApi.mediaPath(messageId));
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'No se pudo cargar el archivo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [api, messageId, enabled]);

  return { url, loading, error };
}

function ImageBubble({ message }: { message: WapiInboxMessage }) {
  const { url, loading, error } = useMediaBlobUrl(message.id, true);
  const [zoomOpen, setZoomOpen] = useState(false);
  const isSticker = message.type === 'sticker';

  if (loading) {
    return (
      <Box
        sx={{
          width: isSticker ? 120 : 240,
          height: isSticker ? 120 : 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.06)',
          borderRadius: 1,
        }}
      >
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (error || !url) {
    return (
      <MediaErrorBox icon={<BrokenImageIcon />} text={error ?? 'No se pudo cargar la imagen'} />
    );
  }
  return (
    <>
      <Box
        component="img"
        src={url}
        alt={message.mediaFilename ?? 'imagen'}
        onClick={() => setZoomOpen(true)}
        sx={{
          display: 'block',
          maxWidth: isSticker ? 140 : 320,
          maxHeight: isSticker ? 140 : 320,
          borderRadius: 1,
          cursor: 'zoom-in',
          ...(isSticker ? { background: 'transparent' } : {}),
        }}
      />
      <Modal open={zoomOpen} onClose={() => setZoomOpen(false)}>
        <Box
          onClick={() => setZoomOpen(false)}
          sx={{
            position: 'fixed',
            inset: 0,
            bgcolor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
          }}
        >
          <IconButton
            onClick={() => setZoomOpen(false)}
            sx={{ position: 'absolute', top: 16, right: 16, color: '#fff' }}
          >
            <CloseIcon />
          </IconButton>
          <Box
            component="img"
            src={url}
            alt={message.mediaFilename ?? 'imagen'}
            onClick={(e) => e.stopPropagation()}
            sx={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }}
          />
        </Box>
      </Modal>
    </>
  );
}

function VideoBubble({ message }: { message: WapiInboxMessage }) {
  const { url, loading, error } = useMediaBlobUrl(message.id, true);
  if (loading) {
    return (
      <Box sx={{ width: 280, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.06)', borderRadius: 1 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (error || !url) {
    return <MediaErrorBox icon={<BrokenImageIcon />} text={error ?? 'No se pudo cargar el video'} />;
  }
  return (
    <Box
      component="video"
      src={url}
      controls
      sx={{ display: 'block', maxWidth: 320, maxHeight: 320, borderRadius: 1 }}
    />
  );
}

function AudioBubble({ message }: { message: WapiInboxMessage }) {
  const { url, loading, error } = useMediaBlobUrl(message.id, true);
  if (loading) {
    return (
      <Box sx={{ width: 240, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={18} />
      </Box>
    );
  }
  if (error || !url) {
    return <MediaErrorBox icon={<BrokenImageIcon />} text={error ?? 'No se pudo cargar el audio'} />;
  }
  return <Box component="audio" src={url} controls sx={{ minWidth: 240, maxWidth: 320 }} />;
}

function DocumentBubble({ message }: { message: WapiInboxMessage }) {
  const api = useApi();
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await api.getBlob(inboxApi.mediaPath(message.id));
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = message.mediaFilename ?? 'archivo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1}
      sx={{
        py: 0.75,
        px: 1,
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
        borderRadius: 1,
        minWidth: 200,
        maxWidth: 320,
        cursor: 'pointer',
      }}
      onClick={download}
    >
      <InsertDriveFileIcon sx={{ fontSize: 28, opacity: 0.8 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap title={message.mediaFilename ?? undefined}>
          {message.mediaFilename ?? 'documento'}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {formatBytes(message.mediaSize ?? 0)}
        </Typography>
      </Box>
      <IconButton size="small" disabled={downloading}>
        {downloading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
      </IconButton>
    </Stack>
  );
}

function MediaErrorBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1}
      sx={{
        py: 1,
        px: 1.25,
        bgcolor: 'rgba(0,0,0,0.06)',
        borderRadius: 1,
        color: 'text.secondary',
        fontSize: 13,
      }}
    >
      {icon}
      <Typography variant="caption">{text}</Typography>
    </Stack>
  );
}

function extractText(m: WapiInboxMessage): string | null {
  if (m.mediaCaption) return m.mediaCaption;
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

function extractReactionEmoji(m: WapiInboxMessage): string | null {
  if (!m.content || typeof m.content !== 'object') return null;
  const c = m.content as Record<string, unknown>;
  const r = c.reaction as { emoji?: string } | undefined;
  return r?.emoji ?? null;
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

function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
