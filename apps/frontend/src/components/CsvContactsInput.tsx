import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography,
  Alert,
  AlertTitle,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';

/**
 * Input compartido para cargar contactos por CSV en campañas (Email + WhatsApp).
 *
 * Soporta tres formas de cargar:
 *   1. Botón "Subir CSV" → file picker
 *   2. Drag & drop sobre el área
 *   3. Pegar / escribir manual en el textarea
 *
 * Muestra un panel de validación arriba del textarea con:
 *   - Filas totales / válidas / con error
 *   - Columnas detectadas
 *   - Lista de errores (truncada)
 *   - Required fields esperados
 *
 * El componente NO parsea por sí mismo — recibe el resultado del parser del
 * caller. Esto evita duplicar lógica de email vs wapi (cada uno tiene su
 * propio parser con reglas específicas).
 */
export interface CsvValidationResult {
  totalDataLines: number;
  validRows: number;
  errors: string[];
  detectedColumns: string[];
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  validation: CsvValidationResult;
  /** Tipos de columna que son obligatorios — se renderizan como chips. */
  requiredFieldsLabel: string;
  /** Ej: "phone, externalId o dni". */
  helperText?: ReactNode;
  placeholder?: string;
}

export function CsvContactsInput({
  value,
  onChange,
  disabled,
  validation,
  requiredFieldsLabel,
  helperText,
  placeholder,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(csv|txt|tsv)$/i)) {
      // No bloqueamos, dejamos que el parser decida — pero avisamos.
      // eslint-disable-next-line no-alert
      const ok = window.confirm(
        `El archivo "${file.name}" no parece un CSV. ¿Cargarlo de todas formas?`,
      );
      if (!ok) return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      onChange(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  const onPick = () => fileRef.current?.click();
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = ''; // reset para permitir re-pickear mismo archivo
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const hasContent = value.trim().length > 0;
  const hasErrors = validation.errors.length > 0;
  const allInvalid =
    validation.totalDataLines > 0 && validation.validRows === 0 && hasErrors;
  const someValid = validation.validRows > 0;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={onPick}
          disabled={disabled}
        >
          Subir CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={onFilePicked}
        />
        {hasContent && (
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => onChange('')}
            disabled={disabled}
          >
            Limpiar
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Campos obligatorios: <strong>{requiredFieldsLabel}</strong>
        </Typography>
      </Stack>

      {hasContent && (
        <Alert
          severity={allInvalid ? 'error' : hasErrors ? 'warning' : someValid ? 'success' : 'info'}
          variant="outlined"
        >
          <AlertTitle sx={{ mb: 0.5 }}>
            {validation.validRows} válidos
            {validation.errors.length > 0 && ` · ${validation.errors.length} con error`}
            {validation.totalDataLines > 0 &&
              ` (de ${validation.totalDataLines} filas)`}
          </AlertTitle>
          {validation.detectedColumns.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                Columnas detectadas:
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {validation.detectedColumns.map((c) => (
                  <Chip key={c} label={c} size="small" />
                ))}
              </Stack>
            </Box>
          )}
          {validation.errors.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                Errores:
              </Typography>
              <Box component="ul" sx={{ pl: 2, m: 0 }}>
                {validation.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>
                    <Typography variant="caption">{err}</Typography>
                  </li>
                ))}
                {validation.errors.length > 5 && (
                  <li>
                    <Typography variant="caption" color="text.secondary">
                      … y {validation.errors.length - 5} más
                    </Typography>
                  </li>
                )}
              </Box>
            </Box>
          )}
        </Alert>
      )}

      <Box
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        sx={{
          position: 'relative',
          border: dragOver ? '2px dashed' : '1px solid transparent',
          borderColor: dragOver ? 'primary.main' : 'transparent',
          borderRadius: 1,
          transition: 'border-color 0.15s',
        }}
      >
        <TextField
          multiline
          minRows={6}
          maxRows={16}
          fullWidth
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
        />
        {dragOver && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(91,91,214,0.05)',
              pointerEvents: 'none',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="primary">
              Soltá el archivo para cargar
            </Typography>
          </Box>
        )}
      </Box>

      {helperText && (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      )}
    </Stack>
  );
}
