import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import { quickRepliesApi } from '../../inbox/api';
import type { QuickReply } from '../../inbox/types';

const SHORTCUT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function WapiQuickRepliesPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<QuickReply[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);

  async function load() {
    try {
      const list = await quickRepliesApi.list(api);
      setItems(list);
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo cargar');
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(qr: QuickReply) {
    setEditing(qr);
    setEditorOpen(true);
  }

  async function handleDelete(qr: QuickReply) {
    const ok = await confirm({
      title: 'Eliminar respuesta rápida',
      message: `¿Eliminar /${qr.shortcut}? Esta acción no se puede deshacer.`,
      destructive: true,
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      await quickRepliesApi.remove(api, qr.id);
      notify.success('Respuesta eliminada');
      await load();
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo eliminar');
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            Respuestas rápidas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Atajos para responder más rápido en el inbox de WhatsApp. Escribí{' '}
            <code>/atajo</code> en el composer para insertar la respuesta.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
          Nueva
        </Button>
      </Stack>
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Atajo</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Contenido</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Acciones
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items === null ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton width={80} />
                    </TableCell>
                    <TableCell>
                      <Skeleton />
                    </TableCell>
                    <TableCell>
                      <Skeleton width={60} />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Aún no hay respuestas rápidas. Creá la primera para agilizar tus respuestas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((qr) => (
                  <TableRow key={qr.id} hover>
                    <TableCell>
                      <Chip
                        size="small"
                        label={`/${qr.shortcut}`}
                        sx={{ fontFamily: 'monospace' }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 600 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {qr.body}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => openEdit(qr)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(qr)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <QuickReplyEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editing}
        onSaved={async () => {
          setEditorOpen(false);
          await load();
        }}
      />
    </Box>
  );
}

function QuickReplyEditor({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: QuickReply | null;
  onSaved: () => void;
}) {
  const api = useApi();
  const notify = useNotify();
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ shortcut?: string; body?: string }>({});

  useEffect(() => {
    if (open) {
      setShortcut(editing?.shortcut ?? '');
      setBody(editing?.body ?? '');
      setErrors({});
    }
  }, [open, editing]);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!SHORTCUT_RE.test(shortcut)) {
      next.shortcut =
        'Usá minúsculas, números, guiones y guion bajo. Hasta 40 caracteres, sin / inicial.';
    }
    if (body.trim().length === 0) {
      next.body = 'El contenido no puede estar vacío.';
    } else if (body.length > 4096) {
      next.body = 'Máximo 4096 caracteres.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing) {
        await quickRepliesApi.update(api, editing.id, { shortcut, body });
        notify.success('Respuesta actualizada');
      } else {
        await quickRepliesApi.create(api, { shortcut, body });
        notify.success('Respuesta creada');
      }
      onSaved();
    } catch (e) {
      notify.error((e as Error).message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? 'Editar respuesta rápida' : 'Nueva respuesta rápida'}</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2} sx={{ pt: 1 }}>
          <TextField
            label="Atajo"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.toLowerCase().trim())}
            placeholder="bienvenida"
            error={!!errors.shortcut}
            helperText={
              errors.shortcut ??
              'Se usa con / en el composer (ej: /bienvenida). Solo minúsculas, números, - y _.'
            }
            fullWidth
            inputProps={{ maxLength: 40 }}
            InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>/</Typography> }}
          />
          <TextField
            label="Contenido"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={4}
            maxRows={12}
            error={!!errors.body}
            helperText={errors.body ?? `${body.length} / 4096 caracteres`}
            fullWidth
            inputProps={{ maxLength: 4096 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {editing ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
