import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  type TextFieldProps,
} from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import type { BotVariable } from './types';

interface Props extends Omit<TextFieldProps, 'onChange' | 'value'> {
  value: string;
  onChange: (next: string) => void;
  /** 4.O.4 — variables declaradas para el menú del picker. Si está vacío, el botón
   *  abre un menú con un único item informativo. */
  variables: BotVariable[];
}

/**
 * 4.O.4 — TextField con adornment "{ }" que abre un menú de variables declaradas
 * y al elegir inserta `{{nombre}}` en la posición actual del cursor (o al final
 * si no hay foco). El menú muestra type + description para que el operador sepa
 * qué está insertando sin volver al panel de Variables.
 */
export const VarPickerTextField = forwardRef<HTMLInputElement, Props>(function VarPickerTextField(
  { value, onChange, variables, InputProps, ...rest },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  function insert(name: string) {
    const placeholder = `{{${name}}}`;
    const el = inputRef.current;
    if (el && document.activeElement === el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      const next = value.slice(0, start) + placeholder + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        try {
          el.focus();
          const pos = start + placeholder.length;
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    } else {
      onChange(value + placeholder);
    }
    setAnchor(null);
  }

  return (
    <>
      <TextField
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputRef={(node: HTMLInputElement | HTMLTextAreaElement | null) => {
          inputRef.current = node;
        }}
        InputProps={{
          ...InputProps,
          endAdornment: (
            <>
              {InputProps?.endAdornment}
              <InputAdornment position="end">
                <Tooltip title="Insertar variable">
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(e) => setAnchor(e.currentTarget)}
                    sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                  >
                    <DataObjectIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            </>
          ),
        }}
      />
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
    </>
  );
});
