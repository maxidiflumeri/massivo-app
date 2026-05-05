import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import BoltIcon from '@mui/icons-material/Bolt';
import { isWindowOpen } from './formatters';
import type { WapiQuickReply } from './types';

interface Props {
  conversationId: string;
  window24hAt: string | null;
  isResolved: boolean;
  quickReplies: WapiQuickReply[];
  onSend: (body: string) => Promise<void>;
}

const DRAFT_KEY = (id: string) => `massivo:wapi:draft:${id}`;

export function MessageComposer({
  conversationId,
  window24hAt,
  isResolved,
  quickReplies,
  onSend,
}: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickIndex, setQuickIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

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
