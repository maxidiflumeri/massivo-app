import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string | null) => Promise<void>;
}

export function ResolveDialog({ open, onClose, onConfirm }: Props) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNote('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const trimmed = note.trim();
      await onConfirm(trimmed.length > 0 ? trimmed : null);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Resolver conversación</DialogTitle>
      <DialogContent dividers>
        <Stack gap={1.5}>
          <Typography variant="body2" color="text.secondary">
            Marcá esta conversación como resuelta. Podés agregar una nota interna que quedará en el
            historial.
          </Typography>
          <TextField
            label="Nota (opcional)"
            multiline
            minRows={3}
            maxRows={6}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Resumen del caso, próximos pasos…"
            fullWidth
            inputProps={{ maxLength: 2000 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} variant="contained" color="success" disabled={submitting}>
          Resolver
        </Button>
      </DialogActions>
    </Dialog>
  );
}
