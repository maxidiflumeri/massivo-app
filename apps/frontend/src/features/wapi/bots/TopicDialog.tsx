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

const TOPIC_ID_RE = /^[a-zA-Z0-9_-]+$/;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Topic existente (modo edit) o null (modo create). */
  editing: { id: string; label: string } | null;
  /** IDs ya tomados — para validar unicidad. Si `editing`, su id se excluye implícitamente. */
  takenIds: string[];
  onSubmit: (next: { id: string; label: string }) => void;
}

/**
 * Dialog para crear o renombrar un BotTopic. Valida id contra `TOPIC_ID_RE`,
 * label no vacío y unicidad de id (excepto contra el id editado).
 */
export function TopicDialog({ open, onClose, editing, takenIds, onSubmit }: Props) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<{ id?: string; label?: string }>({});

  useEffect(() => {
    if (open) {
      setId(editing?.id ?? '');
      setLabel(editing?.label ?? '');
      setErrors({});
    }
  }, [open, editing]);

  function validate(): boolean {
    const next: typeof errors = {};
    const trimmedId = id.trim();
    const trimmedLabel = label.trim();
    if (!trimmedId) next.id = 'requerido';
    else if (!TOPIC_ID_RE.test(trimmedId))
      next.id = 'sólo letras, números, guión bajo (_) y guión (-)';
    else if (trimmedId !== editing?.id && takenIds.includes(trimmedId))
      next.id = `el ID "${trimmedId}" ya existe`;
    if (!trimmedLabel) next.label = 'requerido';
    else if (trimmedLabel.length > 60) next.label = 'máximo 60 caracteres';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit({ id: id.trim(), label: label.trim() });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? 'Renombrar tema' : 'Nuevo tema'}</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            error={!!errors.label}
            helperText={errors.label ?? 'Cómo se ve en la lista. Hasta 60 caracteres.'}
            inputProps={{ maxLength: 60 }}
            autoFocus
            fullWidth
          />
          <TextField
            label="ID interno"
            value={id}
            onChange={(e) => setId(e.target.value)}
            error={!!errors.id}
            helperText={
              errors.id ??
              'Identificador permanente — se usa en el router y en "Saltar a tema". No incluyas espacios.'
            }
            inputProps={{ maxLength: 40, style: { fontFamily: 'monospace' } }}
            fullWidth
          />
          {editing && id !== editing.id && (
            <Typography variant="caption" color="warning.main">
              Cambiar el ID actualiza automáticamente las referencias `gotoTopic` y las
              rules del router.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained">
          {editing ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
