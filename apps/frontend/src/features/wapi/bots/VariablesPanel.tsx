import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { BotVariable, BotVariableType } from './types';
import type { ValidationError } from './validateClient';

interface Props {
  variables: BotVariable[];
  errors: ValidationError[];
  /** 4.O.4 — implícitos detectados (CAPTURE.saveAs / CONDITION.var / regex named groups). Se
   *  ofrecen como atajo "+ importar" para no obligar al usuario a tipearlos a mano. */
  implicitNames: string[];
  onChange: (next: BotVariable[]) => void;
}

const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * 4.O.4 — Panel CRUD de variables declarativas. Vive entre Topics y Router en
 * la nav del bot. Cada variable tiene name (regex), type (string|number|boolean),
 * description opcional y defaultValue opcional (input según type). El backend
 * aplica defaults al iniciar sesión y antes de overlay con seedData del router.
 */
export function VariablesPanel({ variables, errors, implicitNames, onChange }: Props) {
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<BotVariableType>('string');

  const declaredNames = useMemo(() => new Set(variables.map((v) => v.name)), [variables]);
  const missingImplicits = useMemo(
    () => implicitNames.filter((n) => !declaredNames.has(n)),
    [implicitNames, declaredNames],
  );
  const errorsByIdx = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const e of errors) {
      const match = e.path.match(/^variables\[(\d+)\]/);
      if (!match) continue;
      const i = Number(match[1]);
      const arr = m.get(i) ?? [];
      arr.push(`${e.path.slice(match[0].length).replace(/^\./, '')}: ${e.message}`);
      m.set(i, arr);
    }
    return m;
  }, [errors]);

  function addVariable(name: string, type: BotVariableType) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!VAR_NAME_RE.test(trimmed)) return;
    if (declaredNames.has(trimmed)) return;
    onChange([...variables, { name: trimmed, type }]);
  }

  function handleAddDraft() {
    addVariable(draftName, draftType);
    setDraftName('');
    setDraftType('string');
  }

  function patch(i: number, partial: Partial<BotVariable>) {
    onChange(variables.map((v, idx) => (idx === i ? { ...v, ...partial } : v)));
  }

  function remove(i: number) {
    onChange(variables.filter((_, idx) => idx !== i));
  }

  function importImplicits() {
    const next = [...variables];
    for (const name of missingImplicits) {
      next.push({ name, type: 'string' });
    }
    onChange(next);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Typography variant="subtitle1" fontWeight={600}>
          Variables del bot
        </Typography>
        <Chip size="small" variant="outlined" label={`${variables.length} declarada(s)`} />
        <Box sx={{ flex: 1 }} />
        {missingImplicits.length > 0 && (
          <Tooltip
            title={`Detectados en CAPTURE/CONDITION/regex: ${missingImplicits.join(', ')}`}
          >
            <Button size="small" variant="outlined" onClick={importImplicits}>
              Importar {missingImplicits.length} implícita(s)
            </Button>
          </Tooltip>
        )}
      </Stack>

      <Alert severity="info" variant="outlined">
        Las variables declaradas aplican <strong>defaults</strong> al iniciar una sesión y se
        usan en interpolación <code>{'{{nombre}}'}</code> dentro de mensajes, capturas y
        condiciones. Las referencias a variables no declaradas siguen funcionando, pero quedan
        marcadas como advertencia (no bloquean publicar).
      </Alert>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <TextField
            size="small"
            label="Nombre"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            error={draftName !== '' && (!VAR_NAME_RE.test(draftName) || declaredNames.has(draftName))}
            helperText={
              draftName === ''
                ? ' '
                : declaredNames.has(draftName)
                  ? 'Ya existe'
                  : !VAR_NAME_RE.test(draftName)
                    ? 'sólo letras/números/_'
                    : ' '
            }
            sx={{ minWidth: 200 }}
          />
          <Select
            size="small"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as BotVariableType)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="string">string</MenuItem>
            <MenuItem value="number">number</MenuItem>
            <MenuItem value="boolean">boolean</MenuItem>
          </Select>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddDraft}
            disabled={
              !draftName.trim() ||
              !VAR_NAME_RE.test(draftName.trim()) ||
              declaredNames.has(draftName.trim())
            }
          >
            Agregar
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Nombre</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Descripción</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Default</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {variables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      Aún no declaraste variables. Las referencias{' '}
                      <code>{'{{x}}'}</code> en los textos siguen funcionando, pero declararlas
                      te da defaults y autocompletado.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                variables.map((v, i) => {
                  const rowErrors = errorsByIdx.get(i) ?? [];
                  return (
                    <TableRow key={`${v.name}-${i}`} hover>
                      <TableCell>
                        <Stack direction="row" alignItems="center" gap={0.5}>
                          <TextField
                            size="small"
                            value={v.name}
                            onChange={(e) => patch(i, { name: e.target.value })}
                            sx={{ minWidth: 160 }}
                            inputProps={{ style: { fontFamily: 'monospace' } }}
                          />
                          {rowErrors.length > 0 && (
                            <Tooltip title={rowErrors.join('\n')}>
                              <WarningAmberIcon fontSize="small" color="warning" />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={v.type}
                          onChange={(e) => {
                            const newType = e.target.value as BotVariableType;
                            patch(i, { type: newType, defaultValue: undefined });
                          }}
                          sx={{ minWidth: 120 }}
                        >
                          <MenuItem value="string">string</MenuItem>
                          <MenuItem value="number">number</MenuItem>
                          <MenuItem value="boolean">boolean</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={v.description ?? ''}
                          onChange={(e) =>
                            patch(i, {
                              description: e.target.value === '' ? undefined : e.target.value,
                            })
                          }
                          fullWidth
                          placeholder="opcional"
                        />
                      </TableCell>
                      <TableCell>
                        <DefaultEditor variable={v} onChange={(dv) => patch(i, { defaultValue: dv })} />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Eliminar">
                          <IconButton size="small" color="error" onClick={() => remove(i)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

function DefaultEditor({
  variable,
  onChange,
}: {
  variable: BotVariable;
  onChange: (v: string | number | boolean | undefined) => void;
}) {
  if (variable.type === 'boolean') {
    const checked = variable.defaultValue === true;
    return (
      <Stack direction="row" alignItems="center" gap={1}>
        <Switch
          size="small"
          checked={checked}
          onChange={(e) =>
            onChange(variable.defaultValue === undefined && !e.target.checked ? undefined : e.target.checked)
          }
        />
        <Typography variant="caption" color="text.secondary">
          {variable.defaultValue === undefined ? 'sin default' : checked ? 'true' : 'false'}
        </Typography>
        {variable.defaultValue !== undefined && (
          <Button size="small" onClick={() => onChange(undefined)}>
            limpiar
          </Button>
        )}
      </Stack>
    );
  }
  if (variable.type === 'number') {
    return (
      <TextField
        size="small"
        type="number"
        value={variable.defaultValue ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        placeholder="opcional"
        sx={{ minWidth: 140 }}
      />
    );
  }
  return (
    <TextField
      size="small"
      value={typeof variable.defaultValue === 'string' ? variable.defaultValue : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      placeholder="opcional"
      fullWidth
    />
  );
}
