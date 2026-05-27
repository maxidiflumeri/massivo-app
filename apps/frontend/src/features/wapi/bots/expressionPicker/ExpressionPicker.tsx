/**
 * 4.P — Picker visual para insertar variables, paths JSONata y funciones en un
 * TextField de expresión del bot designer.
 *
 * Estructura:
 *  - Tab "Variables": agrupa por scope (Declaradas / HTTPs con shape inferido /
 *    FOREACHs / CAPTUREs / SET_VARs). Para HTTPs con mockResponse expande el
 *    árbol — click en un leaf inserta `{{= saveAs.body.path }}`.
 *  - Tab "Funciones": ~38 funciones JSONata categorizadas. Click inserta
 *    `{{= $name() }}` con cursor entre paréntesis.
 *
 * El input filter en el header reduce ambas tabs en tiempo real.
 *
 * Insertación: el picker calcula el snippet a insertar y se lo pasa al caller
 * (TextField wrapper) que maneja la posición del cursor real.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import type { BotFlow, BotVariable } from '../types';
import {
  analyzeScope,
  type ScopeEntry,
} from './flowAnalysis';
import { buildJsonataPath, inferShape, type ShapeNode } from './shapeInference';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  JSONATA_FUNCTIONS,
  snippetCursorOffset,
  snippetText,
  type JsonataCategory,
  type JsonataFnDoc,
} from './jsonataFunctions';

export interface InsertionPayload {
  /** Texto a insertar tal cual. */
  text: string;
  /** Offset relativo al texto insertado donde dejar el cursor (típicamente entre paréntesis de una función). */
  cursorOffset: number;
}

interface Props {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  flow: BotFlow | null;
  currentNodeId: string | null;
  variables: BotVariable[];
  onInsert: (payload: InsertionPayload) => void;
  /**
   * Modo "expresión cruda" (default `false`).
   *  - `false`: campo template — variables → `{{name}}`, paths → `{{= path }}`,
   *    funciones → `{{= $fn() }}`. Para TextFields de texto (MESSAGE.text, etc).
   *  - `true`: campo de expresión JSONata pura — sin envoltorio `{{ }}`. Para
   *    `FOREACH.items`, o cuando el cursor está adentro de un token existente.
   */
  rawExpression?: boolean;
  /**
   * true cuando el `rawExpression=true` fue auto-detectado (cursor dentro de un
   * token), NO forzado por el padre. Sólo se usa para mostrar un hint visual al
   * usuario explicando por qué los items aparecen sin envoltorio.
   */
  rawInferred?: boolean;
}

export function ExpressionPicker({
  anchorEl,
  open,
  onClose,
  flow,
  currentNodeId,
  variables,
  onInsert,
  rawExpression = false,
  rawInferred = false,
}: Props) {
  const [tab, setTab] = useState<0 | 1>(0);
  const [filter, setFilter] = useState('');

  const scope = useMemo(() => {
    if (!flow) {
      return { declared: variables.map((v) => ({ kind: 'declared' as const, name: v.name, label: v.name, declaredType: v.type })), https: [], foreaches: [], captures: [], setvars: [] };
    }
    return analyzeScope(flow, currentNodeId, variables);
  }, [flow, currentNodeId, variables]);

  function handleInsert(payload: InsertionPayload) {
    onInsert(payload);
    onClose();
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 380, maxHeight: 520, display: 'flex', flexDirection: 'column' } } }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 1, pt: 1 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ flex: 1, minHeight: 36 }}>
          <Tab label="Variables" sx={{ minHeight: 36, py: 0 }} />
          <Tab label="Funciones" sx={{ minHeight: 36, py: 0 }} />
        </Tabs>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      {rawInferred && (
        <Box sx={{ px: 1.5, pt: 0.5 }}>
          <Chip
            size="small"
            color="info"
            variant="outlined"
            label="cursor dentro de {{= … }} — se insertan paths/funciones sin envolver"
            sx={{ fontSize: 10, height: 20 }}
          />
        </Box>
      )}

      <TextField
        size="small"
        placeholder="Filtrar…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ m: 1 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ flex: 1, overflowY: 'auto', px: 0.5, pb: 1 }}>
        {tab === 0 ? (
          <VariablesTab
            scope={scope}
            filter={filter}
            onInsert={handleInsert}
            rawExpression={rawExpression}
          />
        ) : (
          <FunctionsTab filter={filter} onInsert={handleInsert} rawExpression={rawExpression} />
        )}
      </Box>
    </Popover>
  );
}

// ---------- Tab Variables ----------

interface VariablesTabProps {
  scope: ReturnType<typeof analyzeScope>;
  filter: string;
  onInsert: (p: InsertionPayload) => void;
  rawExpression: boolean;
}

function VariablesTab({ scope, filter, onInsert, rawExpression }: VariablesTabProps) {
  const f = filter.trim().toLowerCase();
  const anyResults =
    scope.declared.length +
      scope.https.length +
      scope.foreaches.length +
      scope.captures.length +
      scope.setvars.length >
    0;

  if (!anyResults) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Sin variables disponibles en este scope. Declarálas en el panel
          Variables, o creá un nodo HTTP/CAPTURE/FOREACH/SET_VAR upstream.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack gap={0.5}>
      {scope.declared.length > 0 && (
        <ScopeGroup title="Declaradas">
          {scope.declared
            .filter((e) => !f || matchesScope(e, f))
            .map((e) => (
              <PlainVarItem
                key={e.name}
                entry={e}
                onInsert={onInsert}
                rawExpression={rawExpression}
              />
            ))}
        </ScopeGroup>
      )}
      {scope.https.length > 0 && (
        <ScopeGroup title="HTTPs (response.body navegable si hay mock)">
          {scope.https
            .filter((e) => !f || matchesScope(e, f))
            .map((e) => (
              <HttpVarItem
                key={e.name}
                entry={e}
                onInsert={onInsert}
                filter={f}
                rawExpression={rawExpression}
              />
            ))}
        </ScopeGroup>
      )}
      {scope.foreaches.length > 0 && (
        <ScopeGroup title="Loops (FOREACH)">
          {scope.foreaches
            .filter((e) => !f || matchesScope(e, f))
            .map((e) => (
              <ForeachVarItem
                key={e.name}
                entry={e}
                onInsert={onInsert}
                rawExpression={rawExpression}
              />
            ))}
        </ScopeGroup>
      )}
      {scope.captures.length > 0 && (
        <ScopeGroup title="Capturas (input del usuario)">
          {scope.captures
            .filter((e) => !f || matchesScope(e, f))
            .map((e) => (
              <PlainVarItem
                key={e.name}
                entry={e}
                onInsert={onInsert}
                rawExpression={rawExpression}
              />
            ))}
        </ScopeGroup>
      )}
      {scope.setvars.length > 0 && (
        <ScopeGroup title="Asignaciones (SET_VAR)">
          {scope.setvars
            .filter((e) => !f || matchesScope(e, f))
            .map((e) => (
              <PlainVarItem
                key={e.name}
                entry={e}
                onInsert={onInsert}
                rawExpression={rawExpression}
              />
            ))}
        </ScopeGroup>
      )}
    </Stack>
  );
}

function matchesScope(e: ScopeEntry, lcFilter: string): boolean {
  return (
    e.name.toLowerCase().includes(lcFilter) || e.label.toLowerCase().includes(lcFilter)
  );
}

function ScopeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          px: 1.5,
          pt: 1,
          pb: 0.25,
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: 0.5,
          fontSize: 10,
        }}
      >
        {title}
      </Typography>
      <List dense disablePadding>
        {children}
      </List>
    </Box>
  );
}

function PlainVarItem({
  entry,
  onInsert,
  rawExpression,
}: {
  entry: ScopeEntry;
  onInsert: (p: InsertionPayload) => void;
  rawExpression: boolean;
}) {
  // Modo template: `{{var}}`. Modo raw: `var`.
  const text = rawExpression ? entry.name : `{{${entry.name}}}`;
  return (
    <ListItemButton onClick={() => onInsert({ text, cursorOffset: text.length })} sx={{ pl: 2 }}>
      <ListItemText
        primary={
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {text}
          </Typography>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            {entry.declaredType ? `${entry.declaredType} · ` : ''}
            {entry.label.includes('—') ? entry.label.split('—')[1]?.trim() : entry.label}
          </Typography>
        }
      />
    </ListItemButton>
  );
}

function ForeachVarItem({
  entry,
  onInsert,
  rawExpression,
}: {
  entry: ScopeEntry;
  onInsert: (p: InsertionPayload) => void;
  rawExpression: boolean;
}) {
  // FOREACH itemVar / indexVar: en template, `{{= name }}`. En raw, `name`.
  const items: Array<{ name: string; sub: string }> = [{ name: entry.name, sub: 'item actual' }];
  if (entry.indexVar) items.push({ name: entry.indexVar, sub: 'índice 0-based' });
  return (
    <>
      {items.map((it) => {
        const text = rawExpression ? it.name : `{{= ${it.name} }}`;
        return (
          <ListItemButton
            key={it.name}
            onClick={() => onInsert({ text, cursorOffset: text.length })}
            sx={{ pl: 2 }}
          >
            <ListItemText
              primary={
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {text}
                </Typography>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {it.sub} — del {entry.label.split('(')[1]?.replace(')', '')}
                </Typography>
              }
            />
          </ListItemButton>
        );
      })}
    </>
  );
}

function HttpVarItem({
  entry,
  onInsert,
  filter,
  rawExpression,
}: {
  entry: ScopeEntry;
  onInsert: (p: InsertionPayload) => void;
  filter: string;
  rawExpression: boolean;
}) {
  const [open, setOpen] = useState(true);

  // Shape inferido del mockResponse.body, navegable como árbol.
  const shape = useMemo(() => {
    if (entry.mockBody === undefined) return null;
    return inferShape(entry.mockBody);
  }, [entry.mockBody]);

  const wrap = (expr: string) => (rawExpression ? expr : `{{= ${expr} }}`);
  const wrapPlain = (name: string) => (rawExpression ? name : `{{${name}}}`);
  const rootText = wrap(entry.name);
  const bodyText = wrap(`${entry.name}.body`);

  return (
    <Box>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ pl: 1.5 }}>
        {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        <ListItemText
          primary={
            <Stack direction="row" gap={0.5} alignItems="center">
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {entry.name}
              </Typography>
              {entry.hasMock ? (
                <Chip
                  size="small"
                  label="mock"
                  variant="outlined"
                  color="warning"
                  sx={{ height: 16, fontSize: 9 }}
                />
              ) : (
                <Chip
                  size="small"
                  label="sin mock — sólo path"
                  variant="outlined"
                  sx={{ height: 16, fontSize: 9 }}
                />
              )}
            </Stack>
          }
          secondary={
            <Typography variant="caption" color="text.secondary">
              {entry.label.split('(')[1]?.replace(')', '')}
            </Typography>
          }
        />
      </ListItemButton>
      {open && (
        <Box sx={{ pl: 3 }}>
          {/* Atajos: insertar la response completa o sólo el body. */}
          <PathLeaf
            label={`${entry.name} (response completa: {ok, status, body, …})`}
            sample={undefined}
            insertText={rootText}
            onInsert={onInsert}
          />
          {entry.hasMock && (
            <PathLeaf
              label={`${entry.name}.body`}
              sample={shape?.type}
              insertText={bodyText}
              onInsert={onInsert}
            />
          )}
          {/* Flatten shortcuts útiles para CONDITION con `var` simple. */}
          <PathLeaf
            label={`${entry.name}_ok`}
            sample="boolean"
            insertText={wrapPlain(`${entry.name}_ok`)}
            onInsert={onInsert}
            isPlain
          />
          <PathLeaf
            label={`${entry.name}_status`}
            sample="number"
            insertText={wrapPlain(`${entry.name}_status`)}
            onInsert={onInsert}
            isPlain
          />
          {/* Árbol del body si hay shape. */}
          {shape && shape.children && (
            <ShapeTreeChildren
              rootName={`${entry.name}.body`}
              children={shape.children}
              onInsert={onInsert}
              filter={filter}
              depth={0}
              rawExpression={rawExpression}
            />
          )}
          {shape && shape.type === 'array' && shape.itemShape && (
            <PathLeaf
              label={`${entry.name}.body[0] (item)`}
              sample={shape.itemShape.type}
              insertText={wrap(`${entry.name}.body[0]`)}
              onInsert={onInsert}
            />
          )}
        </Box>
      )}
    </Box>
  );
}

function ShapeTreeChildren({
  rootName,
  children,
  onInsert,
  filter,
  depth,
  rawExpression,
}: {
  rootName: string;
  children: Array<{ key: string; path: string; node: ShapeNode }>;
  onInsert: (p: InsertionPayload) => void;
  filter: string;
  depth: number;
  rawExpression: boolean;
}) {
  return (
    <>
      {children.map((c) => (
        <ShapeTreeNode
          key={c.path}
          rootName={rootName}
          entry={c}
          onInsert={onInsert}
          filter={filter}
          depth={depth}
          rawExpression={rawExpression}
        />
      ))}
    </>
  );
}

function ShapeTreeNode({
  rootName,
  entry,
  onInsert,
  filter,
  depth,
  rawExpression,
}: {
  rootName: string;
  entry: { key: string; path: string; node: ShapeNode };
  onInsert: (p: InsertionPayload) => void;
  filter: string;
  depth: number;
  rawExpression: boolean;
}) {
  const [open, setOpen] = useState(depth < 2);
  const fullPath = buildJsonataPath(rootName, entry.path);
  const insertText = rawExpression ? fullPath : `{{= ${fullPath} }}`;
  const isContainer = entry.node.type === 'object' || entry.node.type === 'array';

  // Filtrado: match si el key/path contiene el filtro, o si algún descendiente coincide.
  const lcFilter = filter.trim().toLowerCase();
  const localMatch =
    !lcFilter || entry.key.toLowerCase().includes(lcFilter) || entry.path.toLowerCase().includes(lcFilter);
  const childrenWithMatch = entry.node.children?.some((c) =>
    childMatchesFilter(c, lcFilter),
  );
  if (lcFilter && !localMatch && !childrenWithMatch) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ pl: depth * 1.25 }}>
        {isContainer ? (
          <IconButton size="small" onClick={() => setOpen(!open)} sx={{ p: 0, mr: 0.25 }}>
            {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 22 }} />
        )}
        <ListItemButton
          onClick={() => onInsert({ text: insertText, cursorOffset: insertText.length })}
          sx={{ py: 0.25, pl: 0.5, flex: 1 }}
        >
          <Stack direction="row" gap={0.5} alignItems="baseline" sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
              {entry.key}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10, fontStyle: 'italic' }}
            >
              {entry.node.type}
              {entry.node.type === 'array' && entry.node.length !== undefined
                ? `[${entry.node.length}]`
                : ''}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: 10,
                fontFamily: 'monospace',
                ml: 'auto',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 140,
              }}
            >
              {formatSample(entry.node.sample)}
            </Typography>
          </Stack>
        </ListItemButton>
      </Stack>
      {open && entry.node.children && (
        <ShapeTreeChildren
          rootName={rootName}
          children={entry.node.children}
          onInsert={onInsert}
          filter={filter}
          depth={depth + 1}
          rawExpression={rawExpression}
        />
      )}
      {open && entry.node.type === 'array' && entry.node.itemShape?.children && (
        <Box sx={{ pl: (depth + 1) * 1.25 }}>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 3, fontSize: 10 }}>
            (item shape)
          </Typography>
          {entry.node.itemShape.children.map((c) => (
            <ShapeTreeNode
              key={c.path}
              rootName={rootName}
              entry={c}
              onInsert={onInsert}
              filter={filter}
              depth={depth + 2}
              rawExpression={rawExpression}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function childMatchesFilter(
  c: { key: string; path: string; node: ShapeNode },
  lcFilter: string,
): boolean {
  if (!lcFilter) return true;
  if (c.key.toLowerCase().includes(lcFilter) || c.path.toLowerCase().includes(lcFilter)) return true;
  return !!c.node.children?.some((cc) => childMatchesFilter(cc, lcFilter));
}

function PathLeaf({
  label,
  sample,
  insertText,
  onInsert,
  isPlain,
}: {
  label: string;
  sample?: unknown;
  insertText: string;
  onInsert: (p: InsertionPayload) => void;
  isPlain?: boolean;
}) {
  return (
    <ListItemButton
      onClick={() => onInsert({ text: insertText, cursorOffset: insertText.length })}
      sx={{ py: 0.25 }}
    >
      <ListItemText
        primary={
          <Stack direction="row" gap={0.5} alignItems="baseline">
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
              {label}
            </Typography>
            {isPlain && (
              <Chip
                size="small"
                label="plana"
                variant="outlined"
                sx={{ height: 14, fontSize: 9 }}
              />
            )}
          </Stack>
        }
        secondary={
          sample !== undefined ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {String(sample)}
            </Typography>
          ) : null
        }
      />
    </ListItemButton>
  );
}

function formatSample(sample: unknown): string {
  if (sample === undefined) return '';
  if (sample === null) return 'null';
  if (typeof sample === 'string') return `"${sample}"`;
  return String(sample);
}

// ---------- Tab Funciones ----------

function FunctionsTab({
  filter,
  onInsert,
  rawExpression,
}: {
  filter: string;
  onInsert: (p: InsertionPayload) => void;
  rawExpression: boolean;
}) {
  const f = filter.trim().toLowerCase();
  const byCategory = useMemo(() => {
    const out: Record<JsonataCategory, JsonataFnDoc[]> = {
      string: [],
      number: [],
      array: [],
      date: [],
      object: [],
      logic: [],
    };
    for (const fn of JSONATA_FUNCTIONS) {
      if (
        f &&
        !fn.name.toLowerCase().includes(f) &&
        !fn.description.toLowerCase().includes(f) &&
        !fn.signature.toLowerCase().includes(f)
      )
        continue;
      out[fn.category].push(fn);
    }
    return out;
  }, [f]);

  return (
    <Stack gap={0.5}>
      {CATEGORY_ORDER.map((cat) => {
        const fns = byCategory[cat];
        if (fns.length === 0) return null;
        return (
          <ScopeGroup key={cat} title={CATEGORY_LABELS[cat]}>
            {fns.map((fn) => (
              <FunctionItem
                key={fn.name}
                fn={fn}
                onInsert={onInsert}
                rawExpression={rawExpression}
              />
            ))}
          </ScopeGroup>
        );
      })}
    </Stack>
  );
}

function FunctionItem({
  fn,
  onInsert,
  rawExpression,
}: {
  fn: JsonataFnDoc;
  onInsert: (p: InsertionPayload) => void;
  rawExpression: boolean;
}) {
  function handleClick() {
    // En modo template: envolvemos en `{{= ... }}`. En modo raw: pegamos pelado.
    const raw = fn.snippet;
    if (rawExpression) {
      const text = snippetText(raw);
      onInsert({ text, cursorOffset: snippetCursorOffset(raw) });
    } else {
      const text = `{{= ${snippetText(raw)} }}`;
      // 4 chars de "{{= " antes del snippet propiamente dicho.
      onInsert({ text, cursorOffset: 4 + snippetCursorOffset(raw) });
    }
  }

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
            {fn.signature}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {fn.description}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', fontSize: 10 }}
          >
            ej: {fn.example}
          </Typography>
        </Box>
      }
      placement="left"
      arrow
    >
      <ListItemButton onClick={handleClick} sx={{ py: 0.25, pl: 2 }}>
        <ListItemText
          primary={
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {fn.signature}
            </Typography>
          }
          secondary={
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {fn.description}
            </Typography>
          }
        />
      </ListItemButton>
    </Tooltip>
  );
}
