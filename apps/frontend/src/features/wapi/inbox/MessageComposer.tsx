import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import BoltIcon from '@mui/icons-material/Bolt';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { isWindowOpen } from './formatters';
import type { WapiInboxMediaType, WapiQuickReply } from './types';

interface Props {
  conversationId: string;
  window24hAt: string | null;
  isResolved: boolean;
  quickReplies: WapiQuickReply[];
  onSend: (body: string) => Promise<void>;
  onSendMedia: (file: File, type: WapiInboxMediaType, caption?: string) => Promise<void>;
}

// Límites en MB que muestra el front (deben matchear MEDIA_LIMITS_BY_TYPE backend).
const MEDIA_LIMITS_MB: Record<WapiInboxMediaType, number> = {
  image: 5,
  audio: 16,
  video: 16,
  document: 100,
  sticker: 0.5,
};

const ACCEPT_BY_TYPE: Record<WapiInboxMediaType, string> = {
  image: 'image/jpeg,image/png,image/webp',
  audio: 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/webm',
  video: 'video/mp4,video/3gpp',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain',
  sticker: 'image/webp',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const DRAFT_KEY = (id: string) => `massivo:wapi:draft:${id}`;

export function MessageComposer({
  conversationId,
  window24hAt,
  isResolved,
  quickReplies,
  onSend,
  onSendMedia,
}: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickIndex, setQuickIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Attach: menú de tipo + file input oculto + dialog de preview
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null);
  const [pendingType, setPendingType] = useState<WapiInboxMediaType | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const open = isWindowOpen(window24hAt);
  const blocked = isResolved || !open;

  // Cargar borrador al cambiar de conversación
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY(conversationId));
    setValue(draft ?? '');
    setQuickOpen(false);
  }, [conversationId]);

  // Guardar borrador
  useEffect(() => {
    if (value) {
      localStorage.setItem(DRAFT_KEY(conversationId), value);
    } else {
      localStorage.removeItem(DRAFT_KEY(conversationId));
    }
  }, [conversationId, value]);

  const filteredReplies = useMemo(() => {
    const q = quickQuery.toLowerCase();
    if (!q) return quickReplies.slice(0, 8);
    return quickReplies
      .filter(
        (r) =>
          r.shortcut.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [quickReplies, quickQuery]);

  function detectQuickTrigger(text: string, caret: number) {
    // Buscar `/` al inicio o tras un salto de línea, sin espacios después
    const before = text.slice(0, caret);
    const match = /(^|\n)\/([a-z0-9_-]*)$/i.exec(before);
    if (match) {
      setQuickQuery(match[2] ?? '');
      setQuickOpen(true);
      setQuickIndex(0);
    } else {
      setQuickOpen(false);
    }
  }

  function applyQuickReply(qr: WapiQuickReply) {
    const el = inputRef.current;
    if (!el) {
      setValue(qr.body);
      setQuickOpen(false);
      return;
    }
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/(^|\n)\/[a-z0-9_-]*$/i, (_m, p1) => `${p1 ?? ''}${qr.body}`);
    const next = replaced + after;
    setValue(next);
    setQuickOpen(false);
    requestAnimationFrame(() => {
      const pos = replaced.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  // Limpieza del object URL del preview
  useEffect(() => {
    if (!pendingFile) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile]);

  function pickType(type: WapiInboxMediaType) {
    setAttachAnchor(null);
    setPendingType(type);
    // El input file se monta condicionalmente: lo disparamos en el siguiente tick.
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingType) return;
    const limit = MEDIA_LIMITS_MB[pendingType] * 1024 * 1024;
    if (file.size > limit) {
      setUploadError(
        `Archivo demasiado grande para ${pendingType} (máx ${MEDIA_LIMITS_MB[pendingType]} MB).`,
      );
      setPendingType(null);
      return;
    }
    setUploadError(null);
    setPendingCaption('');
    setPendingFile(file);
  }

  function cancelPreview() {
    setPendingFile(null);
    setPendingType(null);
    setPendingCaption('');
    setUploadError(null);
  }

  async function confirmUpload() {
    if (!pendingFile || !pendingType || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const captionAllowed = pendingType !== 'audio' && pendingType !== 'sticker';
      const caption = captionAllowed ? pendingCaption.trim() || undefined : undefined;
      await onSendMedia(pendingFile, pendingType, caption);
      cancelPreview();
    } catch (e) {
      setUploadError((e as Error).message || 'No se pudo enviar el archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || blocked || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue('');
      localStorage.removeItem(DRAFT_KEY(conversationId));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (quickOpen && filteredReplies.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setQuickIndex((i) => (i + 1) % filteredReplies.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setQuickIndex((i) => (i - 1 + filteredReplies.length) % filteredReplies.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const target = filteredReplies[quickIndex];
        if (target) applyQuickReply(target);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuickOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {isResolved && (
        <Alert severity="info" square sx={{ borderRadius: 0 }}>
          Esta conversación está resuelta. Reabrila para enviar mensajes.
        </Alert>
      )}
      {!isResolved && !open && (
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          La ventana de 24 h está cerrada. Para reabrirla, esperá un mensaje del cliente o usá un
          template aprobado desde Campañas.
        </Alert>
      )}
      <Stack direction="row" gap={1} alignItems="flex-end" sx={{ px: 1.5, py: 1 }}>
        <Tooltip title="Adjuntar archivo">
          <span>
            <IconButton
              size="small"
              onClick={(e) => setAttachAnchor(e.currentTarget)}
              disabled={blocked}
            >
              <AttachFileIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Respuestas rápidas (escribí / para abrir)">
          <span>
            <IconButton
              size="small"
              onClick={() => {
                setQuickQuery('');
                setQuickIndex(0);
                setQuickOpen((v) => !v);
                inputRef.current?.focus();
              }}
              disabled={blocked || quickReplies.length === 0}
            >
              <BoltIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={6}
          minRows={1}
          size="small"
          placeholder={
            blocked ? 'No podés enviar mensajes ahora' : 'Escribí un mensaje (Enter para enviar, Shift+Enter para salto)'
          }
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            const el = e.target as HTMLTextAreaElement;
            detectQuickTrigger(v, el.selectionStart ?? v.length);
          }}
          onKeyDown={handleKeyDown}
          disabled={blocked}
          sx={{
            '& .MuiInputBase-root': { borderRadius: 3, py: 1, px: 1.5, fontSize: 14 },
          }}
        />
        <Tooltip title="Enviar (Enter)">
          <span>
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={blocked || sending || !value.trim()}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Menu
        anchorEl={attachAnchor}
        open={Boolean(attachAnchor)}
        onClose={() => setAttachAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem onClick={() => pickType('image')}>
          <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Imagen" secondary="JPG, PNG, WEBP — máx 5 MB" />
        </MenuItem>
        <MenuItem onClick={() => pickType('document')}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Documento" secondary="PDF, DOC, XLS… — máx 100 MB" />
        </MenuItem>
        <MenuItem onClick={() => pickType('audio')}>
          <ListItemIcon><AudiotrackIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Audio" secondary="MP3, OGG, AAC… — máx 16 MB" />
        </MenuItem>
        <MenuItem onClick={() => pickType('video')}>
          <ListItemIcon><VideocamIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Video" secondary="MP4, 3GPP — máx 16 MB" />
        </MenuItem>
      </Menu>
      {pendingType && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_BY_TYPE[pendingType]}
          style={{ display: 'none' }}
          onChange={onFileChosen}
        />
      )}
      <Dialog
        open={Boolean(pendingFile)}
        onClose={uploading ? undefined : cancelPreview}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Enviar {pendingType ?? 'archivo'}</DialogTitle>
        <DialogContent dividers>
          {pendingFile && (
            <Stack gap={1.5}>
              <MediaPreview file={pendingFile} type={pendingType} url={previewUrl} />
              <Typography variant="caption" color="text.secondary">
                {pendingFile.name} — {formatBytes(pendingFile.size)}
              </Typography>
              {pendingType !== 'audio' && pendingType !== 'sticker' && (
                <TextField
                  label="Caption (opcional)"
                  size="small"
                  fullWidth
                  multiline
                  maxRows={4}
                  value={pendingCaption}
                  onChange={(e) => setPendingCaption(e.target.value.slice(0, 1024))}
                  helperText={`${pendingCaption.length}/1024`}
                />
              )}
              {uploadError && <Alert severity="error">{uploadError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelPreview} disabled={uploading}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={confirmUpload}
            disabled={uploading || !pendingFile}
            startIcon={uploading ? <CircularProgress size={14} /> : <SendIcon fontSize="small" />}
          >
            {uploading ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Popper
        open={quickOpen && filteredReplies.length > 0}
        anchorEl={inputRef.current}
        placement="top-start"
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      >
        <Paper sx={{ width: 320, maxHeight: 280, overflowY: 'auto', mb: 1, boxShadow: 4 }}>
          <Typography
            variant="caption"
            sx={{ display: 'block', px: 1.5, py: 0.75, color: 'text.secondary' }}
          >
            Respuestas rápidas
          </Typography>
          <List disablePadding dense>
            {filteredReplies.map((r, idx) => (
              <ListItemButton
                key={r.id}
                selected={idx === quickIndex}
                onClick={() => applyQuickReply(r)}
                sx={{ alignItems: 'flex-start', py: 0.75 }}
              >
                <Box sx={{ minWidth: 0, width: '100%' }}>
                  <Typography variant="body2" fontWeight={600}>
                    /{r.shortcut}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {r.body}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  );
}

function MediaPreview({
  file,
  type,
  url,
}: {
  file: File;
  type: WapiInboxMediaType | null;
  url: string | null;
}) {
  if (!url) return null;
  if (type === 'image' || type === 'sticker') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
          borderRadius: 1,
          p: 1,
        }}
      >
        <Box
          component="img"
          src={url}
          alt={file.name}
          sx={{ maxHeight: 320, maxWidth: '100%', borderRadius: 1, objectFit: 'contain' }}
        />
      </Box>
    );
  }
  if (type === 'video') {
    return (
      <Box component="video" src={url} controls sx={{ width: '100%', maxHeight: 320, borderRadius: 1 }} />
    );
  }
  if (type === 'audio') {
    return <Box component="audio" src={url} controls sx={{ width: '100%' }} />;
  }
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      sx={{
        p: 1.5,
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
        borderRadius: 1,
      }}
    >
      <InsertDriveFileIcon color="action" />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>{file.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {file.type || 'application/octet-stream'}
        </Typography>
      </Box>
    </Stack>
  );
}
