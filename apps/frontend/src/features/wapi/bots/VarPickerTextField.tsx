import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  useTheme,
  type TextFieldProps,
} from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import type { BotFlow, BotVariable } from './types';
import { ExpressionPicker, type InsertionPayload } from './expressionPicker/ExpressionPicker';
import { HighlightOverlay } from './expressionPicker/HighlightOverlay';

interface Props extends Omit<TextFieldProps, 'onChange' | 'value'> {
  value: string;
  onChange: (next: string) => void;
  /** 4.O.4 — variables declaradas para el menú del picker. Si está vacío, el botón
   *  abre un menú con un único item informativo. */
  variables: BotVariable[];
  /**
   * 4.P — Si se provee `flow` (y opcionalmente `currentNodeId`), el botón abre
   * el ExpressionPicker rico (variables + HTTPs con shape inferido + funciones
   * JSONata). Si no, fallback al Menu simple de variables declaradas.
   */
  flow?: BotFlow;
  currentNodeId?: string | null;
  /**
   * 4.P — true cuando el campo es una expresión JSONata cruda (ej. FOREACH.items),
   * NO un template con `{{ ... }}`. El picker inserta valores pelados en lugar
   * de envueltos. Default false.
   */
  rawExpression?: boolean;
}

/**
 * 4.O.4 — TextField con adornment "{ }" que abre un menú de variables declaradas
 * y al elegir inserta `{{nombre}}` en la posición actual del cursor (o al final
 * si no hay foco). El menú muestra type + description para que el operador sepa
 * qué está insertando sin volver al panel de Variables.
 */
/**
 * 4.P — Detecta si el cursor está adentro de un token `{{= ... }}` abierto pero
 * no cerrado a su izquierda. Usado para forzar modo raw automáticamente cuando
 * el usuario inserta dentro de una expresión existente (ej: cursor entre los
 * paréntesis de `$lowercase(|)` ya envuelto en `{{= ... }}`).
 *
 * Algoritmo:
 *  - Buscá la última ocurrencia de `{{=` a la izquierda del cursor.
 *  - Si no hay → fuera de cualquier token.
 *  - Si hay, mirá si hay `}}` entre ese `{{=` y el cursor. Si sí → token cerrado, estamos fuera.
 *  - Si no → token aún abierto, estamos adentro.
 */
export function isCursorInsideExpressionToken(value: string, cursorPos: number): boolean {
  const left = value.slice(0, cursorPos);
  const openIdx = left.lastIndexOf('{{=');
  if (openIdx === -1) return false;
  const closeAfterOpen = left.indexOf('}}', openIdx + 3);
  return closeAfterOpen === -1;
}

export const VarPickerTextField = forwardRef<HTMLInputElement, Props>(function VarPickerTextField(
  { value, onChange, variables, flow, currentNodeId, rawExpression, InputProps, inputProps, ...rest },
  ref,
) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  // Forzamos re-render cuando el textarea se monta, para que HighlightOverlay reciba el elem.
  const [textareaEl, setTextareaEl] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Posición del cursor guardada al abrir el picker (el TextField puede perder foco
  // cuando se hace click en el botón). Si está null, insertamos al final.
  const savedSelection = useRef<{ start: number; end: number } | null>(null);
  // 4.P — modo raw efectivo: forzado por prop, o auto-detectado al abrir.
  const [effectiveRaw, setEffectiveRaw] = useState<boolean>(!!rawExpression);
  // Indica si el modo se infirió del cursor (vs forzado por prop). Útil para mostrar hint.
  const [rawInferred, setRawInferred] = useState<boolean>(false);

  /** Modo "rico" se activa cuando el caller pasa `flow`. */
  const richMode = !!flow;
  /**
   * Modo "highlight" — pintar chips coloreados encima del texto. Activado para
   * cualquier campo que sea "template" (acepta `{{var}}` / `{{= expr }}`); NO se
   * activa cuando `rawExpression=true` porque ahí el value es una expr JSONata
   * pura sin tokens — no hay nada que resaltar a esa altura.
   */
  const highlightMode = !rawExpression;

  function openPicker(e: React.MouseEvent<HTMLElement>) {
    const el = inputRef.current;
    if (el && typeof el.selectionStart === 'number') {
      savedSelection.current = {
        start: el.selectionStart ?? value.length,
        end: el.selectionEnd ?? el.selectionStart ?? value.length,
      };
    } else {
      savedSelection.current = null;
    }
    // Recalcular modo raw: si el padre lo forzó, siempre raw. Si no, auto-detectar.
    if (rawExpression) {
      setEffectiveRaw(true);
      setRawInferred(false);
    } else {
      const cursorPos = savedSelection.current?.start ?? value.length;
      const inside = isCursorInsideExpressionToken(value, cursorPos);
      setEffectiveRaw(inside);
      setRawInferred(inside);
    }
    setAnchor(e.currentTarget);
  }

  function insertRaw(text: string, cursorOffset: number) {
    const el = inputRef.current;
    const sel = savedSelection.current ?? {
      start: value.length,
      end: value.length,
    };
    const next = value.slice(0, sel.start) + text + value.slice(sel.end);
    onChange(next);
    requestAnimationFrame(() => {
      try {
        if (el) {
          el.focus();
          const pos = sel.start + cursorOffset;
          el.setSelectionRange(pos, pos);
        }
      } catch {
        /* ignore */
      }
    });
  }

  /** Compat con el menú simple: inserta `{{name}}` al cursor. */
  function insert(name: string) {
    const placeholder = `{{${name}}}`;
    insertRaw(placeholder, placeholder.length);
    setAnchor(null);
  }

  /** Modo rico: el ExpressionPicker devuelve InsertionPayload. */
  function handleInsertPayload(p: InsertionPayload) {
    insertRaw(p.text, p.cursorOffset);
  }

  return (
    <>
      <Box ref={containerRef} sx={{ position: 'relative', width: '100%' }}>
        <TextField
          {...rest}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputRef={(node: HTMLInputElement | HTMLTextAreaElement | null) => {
            inputRef.current = node;
            // Forzar re-render cuando se monta el textarea para que el overlay tenga el ref.
            setTextareaEl(node);
          }}
          inputProps={{
            ...inputProps,
            // 4.P — Texto transparente + caret resuelto al color real del theme.
            // Inline style gana en specificity sobre cualquier override de MUI.
            style: {
              ...(inputProps?.style ?? {}),
              ...(highlightMode
                ? {
                    color: 'transparent',
                    caretColor: theme.palette.text.primary,
                  }
                : {}),
            },
          }}
          InputProps={{
            ...InputProps,
            endAdornment: (
              <>
                {InputProps?.endAdornment}
                <InputAdornment position="end">
                  <Tooltip
                    title={
                      richMode
                        ? 'Insertar variable / path / función JSONata'
                        : 'Insertar variable'
                    }
                  >
                    <IconButton
                      size="small"
                      edge="end"
                      onClick={openPicker}
                      sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                    >
                      <DataObjectIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              </>
            ),
            ...(highlightMode
              ? {
                  sx: {
                    // El texto seleccionado del textarea debe verse — el overlay no
                    // recibe el highlight de selección porque tiene pointer-events: none.
                    '& textarea::selection, & input::selection': {
                      backgroundColor: 'rgba(91, 91, 214, 0.3)',
                    },
                  },
                }
              : {}),
          }}
        />
        {highlightMode && (
          <HighlightOverlay
            value={value}
            textareaEl={textareaEl}
            containerEl={containerRef.current}
          />
        )}
      </Box>
      {richMode ? (
        <ExpressionPicker
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          flow={flow ?? null}
          currentNodeId={currentNodeId ?? null}
          variables={variables}
          onInsert={handleInsertPayload}
          rawExpression={effectiveRaw}
          rawInferred={rawInferred}
        />
      ) : (
        <Menu
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          slotProps={{ paper: { sx: { maxHeight: 360, minWidth: 240 } } }}
        >
          {variables.length === 0 ? (
            <MenuItem disabled>
              <ListItemText
                primary="Sin variables declaradas"
                secondary="Andá al panel Variables para declararlas."
              />
            </MenuItem>
          ) : (
            variables.map((v) => (
              <MenuItem key={v.name} onClick={() => insert(v.name)}>
                <ListItemText
                  primary={
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {`{{${v.name}}}`}
                    </Typography>
                  }
                  secondary={`${v.type}${v.description ? ` — ${v.description}` : ''}`}
                />
              </MenuItem>
            ))
          )}
        </Menu>
      )}
    </>
  );
});
