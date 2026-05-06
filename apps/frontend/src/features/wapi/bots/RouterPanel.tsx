import { useMemo } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RouteIcon from '@mui/icons-material/Route';
import type { BotRouter, BotRouterRule, BotRouterRuleKind, BotTopic } from './types';
import type { ValidationError } from './validateClient';

interface Props {
  router: BotRouter;
  topics: BotTopic[];
  onChange: (next: BotRouter) => void;
  errors: ValidationError[];
}

/**
 * 4.O.2 — Editor del BotRouter. Gestiona `rules[]` (template-payload, keyword,
 * default) en orden + `defaultTopicId` global. La 1ª rule que matchea gana.
 *
 * Reorder usa botones up/down (no drag-drop) — alcanza para el volumen esperado
 * (≤10 rules) y evita meter una dep nueva.
 */
export function RouterPanel({ router, topics, onChange, errors }: Props) {
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  function patchRule(idx: number, patch: Partial<BotRouterRule>) {
    const next = router.rules.map((r, i) =>
      i === idx ? ({ ...r, ...patch } as BotRouterRule) : r,
    );
    onChange({ ...router, rules: next });
  }

  function moveRule(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= router.rules.length) return;
    const next = [...router.rules];
    const [r] = next.splice(idx, 1);
    next.splice(target, 0, r);
    onChange({ ...router, rules: next });
  }

  function removeRule(idx: number) {
    onChange({ ...router, rules: router.rules.filter((_, i) => i !== idx) });
  }

  function addRule(kind: BotRouterRuleKind) {
    const firstTopic = topics[0]?.id ?? '';
    let r: BotRouterRule;
    if (kind === 'template-payload') {
      r = { kind: 'template-payload', pattern: '', topicId: firstTopic };
    } else if (kind === 'keyword') {
      r = { kind: 'keyword', keywords: [], topicId: firstTopic };
    } else {
      r = { kind: 'default', topicId: firstTopic };
    }
    onChange({ ...router, rules: [...router.rules, r] });
  }

  function setDefaultTopic(id: string) {
    onChange({ ...router, defaultTopicId: id || undefined });
  }

  return (
    <Stack gap={2} sx={{ maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <RouteIcon color="primary" />
        <Typography variant="h6">Router de temas</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Las rules se evalúan en orden — la 1ª que matchea gana.
        </Typography>
      </Stack>

      {topics.length === 0 && (
        <Alert severity="warning">No hay temas — creá al menos uno antes de definir rules.</Alert>
      )}

      {/* Default topic global (fallback si ninguna rule matchea) */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack gap={1}>
          <Typography variant="subtitle2">Tema por defecto (fallback)</Typography>
          <Typography variant="caption" color="text.secondary">
            Si ninguna rule matchea, el inbound entra al startNode de este tema.
          </Typography>
          <FormControl size="small" sx={{ maxWidth: 360 }}>
            <InputLabel>Tema</InputLabel>
            <Select
              label="Tema"
              value={router.defaultTopicId ?? ''}
              onChange={(e) => setDefaultTopic(String(e.target.value))}
            >
              <MenuItem value="">(ninguno — sin fallback)</MenuItem>
              {topics.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.label}{' '}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.5, color: 'text.secondary', fontFamily: 'monospace' }}
                  >
                    ({t.id})
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <Divider>
        <Typography variant="caption" color="text.secondary">
          Rules ({router.rules.length})
        </Typography>
      </Divider>

      <Stack gap={1.5}>
        {router.rules.map((rule, idx) => {
          const ruleErrors = errors.filter((e) => e.path.startsWith(`rules[${idx}]`));
          return (
            <RuleCard
              key={idx}
              idx={idx}
              total={router.rules.length}
              rule={rule}
              topics={topics}
              topicById={topicById}
              errors={ruleErrors}
              onPatch={(p) => patchRule(idx, p)}
              onUp={() => moveRule(idx, -1)}
              onDown={() => moveRule(idx, 1)}
              onRemove={() => removeRule(idx)}
            />
          );
        })}
        {router.rules.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Sin rules — sólo se aplica el tema por defecto.
          </Typography>
        )}
      </Stack>

      <Stack direction="row" gap={1}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => addRule('template-payload')}
          variant="outlined"
        >
          + template-payload
        </Button>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => addRule('keyword')}
          variant="outlined"
          color="info"
        >
          + keyword
        </Button>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => addRule('default')}
          variant="outlined"
          color="secondary"
        >
          + default
        </Button>
      </Stack>
    </Stack>
  );
}

function RuleCard({
  idx,
  total,
  rule,
  topics,
  topicById,
  errors,
  onPatch,
  onUp,
  onDown,
  onRemove,
}: {
  idx: number;
  total: number;
  rule: BotRouterRule;
  topics: BotTopic[];
  topicById: Map<string, BotTopic>;
  errors: ValidationError[];
  onPatch: (p: Partial<BotRouterRule>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const hasErr = errors.length > 0;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderColor: hasErr ? 'warning.main' : undefined }}
    >
      <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
        <Chip label={`#${idx + 1}`} size="small" variant="outlined" />
        <Chip
          label={rule.kind}
          size="small"
          color={
            rule.kind === 'template-payload'
              ? 'primary'
              : rule.kind === 'keyword'
                ? 'info'
                : 'secondary'
          }
        />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Subir">
          <span>
            <IconButton size="small" onClick={onUp} disabled={idx === 0}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Bajar">
          <span>
            <IconButton size="small" onClick={onDown} disabled={idx === total - 1}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Eliminar rule">
          <IconButton size="small" color="error" onClick={onRemove}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {rule.kind === 'template-payload' && (
        <TemplatePayloadEditor rule={rule} topics={topics} onPatch={onPatch} />
      )}
      {rule.kind === 'keyword' && (
        <KeywordEditor rule={rule} topics={topics} onPatch={onPatch} />
      )}
      {rule.kind === 'default' && (
        <DefaultEditor rule={rule} topics={topics} onPatch={onPatch} />
      )}

      {/* Destino topic */}
      <Box sx={{ mt: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          → Destino:{' '}
          {rule.topicId ? (
            topicById.has(rule.topicId) ? (
              <strong>
                {topicById.get(rule.topicId)!.label} ({rule.topicId})
              </strong>
            ) : (
              <Typography component="span" color="warning.main">
                tema "{rule.topicId}" no existe
              </Typography>
            )
          ) : (
            <Typography component="span" color="warning.main">
              sin destino
            </Typography>
          )}
        </Typography>
      </Box>

      {hasErr && (
        <Stack mt={1} gap={0.25}>
          {errors.map((e, i) => (
            <Typography key={i} variant="caption" color="warning.main">
              <code>{e.path}</code> — {e.message}
            </Typography>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function TopicSelect({
  value,
  topics,
  onChange,
  label = 'Tema destino',
}: {
  value: string;
  topics: BotTopic[];
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(e) => onChange(String(e.target.value))}>
        {topics.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.label}{' '}
            <Typography
              component="span"
              variant="caption"
              sx={{ ml: 0.5, color: 'text.secondary', fontFamily: 'monospace' }}
            >
              ({t.id})
            </Typography>
          </MenuItem>
        ))}
        {value && !topics.some((t) => t.id === value) && (
          <MenuItem value={value} disabled>
            {value} (no existe)
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
}

function TemplatePayloadEditor({
  rule,
  topics,
  onPatch,
}: {
  rule: Extract<BotRouterRule, { kind: 'template-payload' }>;
  topics: BotTopic[];
  onPatch: (p: Partial<BotRouterRule>) => void;
}) {
  // Preview de named groups: si la regex tiene `(?<name>...)` los listamos.
  const groups = useMemo(() => extractNamedGroups(rule.pattern), [rule.pattern]);
  const regexValid = useMemo(() => {
    if (!rule.pattern) return false;
    try {
      new RegExp(rule.pattern);
      return true;
    } catch {
      return false;
    }
  }, [rule.pattern]);

  return (
    <Stack gap={1.5}>
      <TextField
        label="Patrón regex (matchea contra el payload del template)"
        size="small"
        value={rule.pattern}
        onChange={(e) => onPatch({ pattern: e.target.value })}
        error={!!rule.pattern && !regexValid}
        helperText={
          rule.pattern
            ? regexValid
              ? `Ej: ^opt-out:(?<reason>.+)$ — captura "reason" como variable de sesión.`
              : 'Regex inválida'
            : 'Soporta named groups: (?<varName>...) — quedan disponibles como {{varName}} en el flow.'
        }
        InputProps={{ sx: { fontFamily: 'monospace' } }}
      />
      {groups.length > 0 && (
        <Stack direction="row" gap={0.5} flexWrap="wrap" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Variables capturadas:
          </Typography>
          {groups.map((g) => (
            <Chip key={g} size="small" label={`{{${g}}}`} />
          ))}
        </Stack>
      )}
      <TopicSelect
        value={rule.topicId}
        topics={topics}
        onChange={(id) => onPatch({ topicId: id })}
      />
    </Stack>
  );
}

function KeywordEditor({
  rule,
  topics,
  onPatch,
}: {
  rule: Extract<BotRouterRule, { kind: 'keyword' }>;
  topics: BotTopic[];
  onPatch: (p: Partial<BotRouterRule>) => void;
}) {
  return (
    <Stack gap={1.5}>
      <Autocomplete
        multiple
        freeSolo
        size="small"
        options={[]}
        value={rule.keywords}
        onChange={(_, value) => {
          // Normalizamos: trim, sin vacíos, dedupe case-insensitive (la 1ª gana).
          const seen = new Set<string>();
          const cleaned: string[] = [];
          for (const v of value) {
            const trimmed = String(v).trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push(trimmed);
          }
          onPatch({ keywords: cleaned });
        }}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={index}
              size="small"
              variant="outlined"
              label={option}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Keywords (Enter para agregar)"
            placeholder='Ej: hola — buen día — soporte'
            helperText="Match insensible a mayúsculas, frase entera (no parcial). Las frases con espacios son válidas — usá Enter para agregar cada una como chip."
          />
        )}
      />
      <TopicSelect
        value={rule.topicId}
        topics={topics}
        onChange={(id) => onPatch({ topicId: id })}
      />
    </Stack>
  );
}

function DefaultEditor({
  rule,
  topics,
  onPatch,
}: {
  rule: Extract<BotRouterRule, { kind: 'default' }>;
  topics: BotTopic[];
  onPatch: (p: Partial<BotRouterRule>) => void;
}) {
  return (
    <Stack gap={1.5}>
      <Typography variant="caption" color="text.secondary">
        Esta rule siempre matchea — usala como último recurso o reemplazá el "Tema por defecto" global.
      </Typography>
      <TopicSelect
        value={rule.topicId}
        topics={topics}
        onChange={(id) => onPatch({ topicId: id })}
      />
    </Stack>
  );
}

function extractNamedGroups(pattern: string): string[] {
  if (!pattern) return [];
  try {
    new RegExp(pattern);
  } catch {
    return [];
  }
  const out: string[] = [];
  // `(?<name>` — escapamos ?\< con greedy para name.
  const re = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) {
    out.push(m[1]);
  }
  return out;
}
