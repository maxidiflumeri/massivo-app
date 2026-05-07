import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import type { ContactImportJob } from './types';

type TargetField =
  | 'externalId'
  | 'dni'
  | 'cuit'
  | 'email'
  | 'phone'
  | 'phoneE164'
  | 'firstName'
  | 'lastName'
  | '__attributes'
  | '__skip';

const TARGET_FIELDS: { value: TargetField; label: string }[] = [
  { value: '__skip', label: 'Ignorar' },
  { value: 'externalId', label: 'External ID' },
  { value: 'dni', label: 'DNI' },
  { value: 'cuit', label: 'CUIT' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono (raw)' },
  { value: 'phoneE164', label: 'Teléfono E.164' },
  { value: 'firstName', label: 'Nombre' },
  { value: 'lastName', label: 'Apellido' },
  { value: '__attributes', label: 'Atributo personalizado' },
];

const STRONG_KEYS: TargetField[] = ['externalId', 'dni', 'cuit', 'email', 'phone', 'phoneE164'];

const MAX_ROWS = 10000;

export function ContactsImportPage() {
  const api = useApi();
  const notify = useNotify();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [csvText, setCsvText] = useState<string>('');
  const [mapping, setMapping] = useState<Record<string, TargetField>>({});
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ContactImportJob | null>(null);

  const parsed = useMemo(() => parseCsv(csvText), [csvText]);

  function onFile(file: File) {
    if (file.size > 100 * 1024 * 1024) {
      notify.error('El archivo supera el máximo de 100MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      setFileName(file.name);
      setFileSize(file.size);
      const headers = parseCsv(text).headers;
      setMapping(autoMapping(headers));
    };
    reader.onerror = () => notify.error('Error leyendo el archivo');
    reader.readAsText(file);
  }

  function onPaste(text: string) {
    setCsvText(text);
    if (!fileName) {
      setFileName('pasted.csv');
      setFileSize(new Blob([text]).size);
    } else {
      setFileSize(new Blob([text]).size);
    }
    const headers = parseCsv(text).headers;
    setMapping(autoMapping(headers));
  }

  function clearAll() {
    setCsvText('');
    setFileName('');
    setFileSize(0);
    setMapping({});
    setJob(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const previewRows = useMemo(() => {
    if (parsed.rows.length === 0) return [];
    return parsed.rows.slice(0, 10).map((row) => mapRow(row, parsed.headers, mapping));
  }, [parsed, mapping]);

  const validation = useMemo(() => {
    if (parsed.headers.length === 0) return null;
    if (parsed.rows.length === 0) return 'El CSV no tiene filas de datos.';
    if (parsed.rows.length > MAX_ROWS) return `El CSV supera el máximo de ${MAX_ROWS} filas.`;
    const hasStrong = Object.values(mapping).some((v) =>
      (STRONG_KEYS as TargetField[]).includes(v),
    );
    if (!hasStrong) {
      return 'Asigná al menos una columna a un identificador (externalId, dni, cuit, email o teléfono).';
    }
    return null;
  }, [parsed, mapping]);

  async function submit() {
    if (validation) {
      notify.error(validation);
      return;
    }
    setSubmitting(true);
    setJob(null);
    try {
      const allRows = parsed.rows.map((row) => mapRow(row, parsed.headers, mapping));
      const cleanMapping: Record<string, string> = {};
      Object.entries(mapping).forEach(([col, target]) => {
        if (target !== '__skip') cleanMapping[col] = target;
      });
      const res = await api.post<ContactImportJob>('/api/contacts/imports', {
        fileName: fileName || 'import.csv',
        fileSize: fileSize || new Blob([csvText]).size,
        mapping: cleanMapping,
        rows: allRows,
      });
      setJob(res);
      notify.success(`Importación completada: ${res.processed} filas procesadas`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error en la importación');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton component={RouterLink} to="/dashboard/contacts" size="small">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Importar contactos desde CSV
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pegá el CSV o subí un archivo. Mapeá las columnas a los campos del contacto y revisá
            el preview antes de procesar.
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
                1. Origen
              </Typography>
              <Button
                size="small"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Subir archivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              {csvText && (
                <Button size="small" color="inherit" onClick={clearAll}>
                  Limpiar
                </Button>
              )}
            </Stack>

            <TextField
              fullWidth
              multiline
              minRows={8}
              maxRows={16}
              size="small"
              placeholder={'externalId,email,firstName,lastName\nEMP-001,foo@bar.com,Maxi,Di Flumeri'}
              value={csvText}
              onChange={(e) => onPaste(e.target.value)}
              sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 12 } }}
            />

            {fileName && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {fileName} — {(fileSize / 1024).toFixed(1)} KB · {parsed.rows.length} filas ·{' '}
                {parsed.headers.length} columnas
              </Typography>
            )}
          </Paper>

          {parsed.headers.length > 0 && (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                2. Mapeo de columnas
              </Typography>
              <Stack spacing={1}>
                {parsed.headers.map((header) => (
                  <Stack direction="row" spacing={1} alignItems="center" key={header}>
                    <Chip
                      label={header}
                      size="small"
                      sx={{ minWidth: 120, fontFamily: 'monospace', justifyContent: 'flex-start' }}
                    />
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Asignar a</InputLabel>
                      <Select
                        label="Asignar a"
                        value={mapping[header] ?? '__skip'}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [header]: e.target.value as TargetField }))
                        }
                      >
                        {TARGET_FIELDS.map((opt) => (
                          <MenuItem
                            key={opt.value}
                            value={opt.value}
                            disabled={
                              opt.value !== '__skip' &&
                              opt.value !== '__attributes' &&
                              Object.entries(mapping).some(
                                ([col, v]) => v === opt.value && col !== header,
                              )
                            }
                          >
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={6}>
          {parsed.headers.length > 0 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                3. Preview ({Math.min(parsed.rows.length, 10)} de {parsed.rows.length} filas)
              </Typography>
              {validation ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {validation}
                </Alert>
              ) : (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Todo listo. {parsed.rows.length} fila(s) serán procesadas.
                </Alert>
              )}
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {previewKeys(mapping).map((k) => (
                        <TableCell key={k} sx={{ whiteSpace: 'nowrap' }}>
                          {k === 'attributes' ? 'attrs' : k}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((r, i) => (
                      <TableRow key={i}>
                        {previewKeys(mapping).map((k) => (
                          <TableCell
                            key={k}
                            sx={{
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                              fontSize: 11,
                            }}
                          >
                            {k === 'attributes'
                              ? r.attributes
                                ? JSON.stringify(r.attributes)
                                : '—'
                              : (r as Record<string, unknown>)[k] ?? '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={submit}
                  disabled={submitting || !!validation}
                >
                  {submitting ? (
                    <>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      Procesando…
                    </>
                  ) : (
                    `Importar ${parsed.rows.length} filas`
                  )}
                </Button>
                <Button color="inherit" onClick={clearAll} disabled={submitting}>
                  Cancelar
                </Button>
              </Stack>
            </Paper>
          )}

          {job && (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Resultado
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                <Chip
                  size="small"
                  label={`Estado: ${job.status}`}
                  color={
                    job.status === 'DONE'
                      ? 'success'
                      : job.status === 'FAILED'
                        ? 'error'
                        : 'default'
                  }
                />
                <Chip size="small" label={`Total: ${job.total}`} />
                <Chip size="small" label={`Procesados: ${job.processed}`} />
                <Chip size="small" label={`Creados: ${job.created}`} color="success" variant="outlined" />
                <Chip size="small" label={`Actualizados: ${job.updated}`} color="info" variant="outlined" />
                <Chip size="small" label={`Sugeridos: ${job.suggested}`} color="warning" variant="outlined" />
              </Stack>
              {job.errors && job.errors.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {job.errors.length} fila(s) con error. Las primeras 5:
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {job.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>
                        <Typography variant="caption">
                          Fila {err.index + 1}: {err.message}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                </Alert>
              )}
              {job.suggested > 0 && (
                <Button
                  component={RouterLink}
                  to="/dashboard/contacts/merge"
                  size="small"
                  sx={{ mt: 1 }}
                >
                  Ver sugerencias de merge ({job.suggested})
                </Button>
              )}
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function parseCsv(text: string): ParsedCsv {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return { headers: [], rows: [] };
  const lines: string[][] = [];
  let cur: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        buf += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(buf);
      buf = '';
    } else if (ch === '\n') {
      cur.push(buf);
      lines.push(cur);
      cur = [];
      buf = '';
    } else {
      buf += ch;
    }
  }
  cur.push(buf);
  if (cur.length > 1 || cur[0] !== '') lines.push(cur);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0]!.map((h) => h.trim());
  const rows = lines.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
  return { headers, rows };
}

function autoMapping(headers: string[]): Record<string, TargetField> {
  const m: Record<string, TargetField> = {};
  for (const h of headers) {
    const norm = h.toLowerCase().trim();
    if (['externalid', 'external_id', 'id', 'idcliente', 'codigo', 'cliente'].includes(norm))
      m[h] = 'externalId';
    else if (['dni', 'documento'].includes(norm)) m[h] = 'dni';
    else if (['cuit', 'cuil'].includes(norm)) m[h] = 'cuit';
    else if (['email', 'correo', 'mail', 'e-mail'].includes(norm)) m[h] = 'email';
    else if (['phone', 'telefono', 'teléfono', 'celular', 'movil', 'móvil'].includes(norm))
      m[h] = 'phone';
    else if (['firstname', 'first_name', 'nombre'].includes(norm)) m[h] = 'firstName';
    else if (['lastname', 'last_name', 'apellido'].includes(norm)) m[h] = 'lastName';
    else m[h] = '__skip';
  }
  return m;
}

interface MappedRow {
  externalId?: string | null;
  dni?: string | null;
  cuit?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  attributes?: Record<string, unknown> | null;
}

function mapRow(
  row: string[],
  headers: string[],
  mapping: Record<string, TargetField>,
): MappedRow {
  const out: MappedRow = {};
  const attrs: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    const target = mapping[h] ?? '__skip';
    const raw = (row[i] ?? '').trim();
    if (!raw) continue;
    if (target === '__skip') continue;
    if (target === '__attributes') {
      attrs[h] = raw;
    } else {
      (out as Record<string, unknown>)[target] = raw;
    }
  }
  if (Object.keys(attrs).length > 0) out.attributes = attrs;
  return out;
}

function previewKeys(mapping: Record<string, TargetField>): string[] {
  const targets = new Set<string>();
  for (const t of Object.values(mapping)) {
    if (t === '__skip') continue;
    if (t === '__attributes') targets.add('attributes');
    else targets.add(t);
  }
  return Array.from(targets);
}
