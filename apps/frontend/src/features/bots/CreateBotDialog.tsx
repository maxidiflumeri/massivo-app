import { useEffect, useState } from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  submitting?: boolean;
}

/** Dialog para crear un bot nuevo (Phase 0b). Reemplaza el window.prompt. */
export function CreateBotDialog({ open, onClose, onSubmit, submitting }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName('');
      setError(undefined);
    }
  }, [open]);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('requerido');
      return;
    }
    if (trimmed.length > 120) {
      setError('máximo 120 caracteres');
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nuevo bot</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre del bot"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!error}
            helperText={error ?? 'Cómo identificás este bot. Lo podés cambiar después.'}
            inputProps={{ maxLength: 120 }}
            autoFocus
            fullWidth
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          Crear
        </Button>
      </DialogActions>
    </Dialog>
  );
}
