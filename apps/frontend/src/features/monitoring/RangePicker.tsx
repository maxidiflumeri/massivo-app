import { Stack, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { DayRange, MonitoringWindow } from './types';

interface Props {
  value: DayRange;
  preset: MonitoringWindow;
  onChange: (range: DayRange, preset: MonitoringWindow) => void;
  disabled?: boolean;
}

/** Hoy en hora local del navegador, YYYY-MM-DD. `en-CA` da el formato ISO. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Ventana de los últimos `n` días, contando hoy. */
export function lastDays(n: number): DayRange {
  const hoy = today();
  const desde = new Date(`${hoy}T12:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - (n - 1));
  return { from: desde.toISOString().slice(0, 10), to: hoy };
}

/**
 * Ventana de las métricas: dos atajos y, si hace falta, las fechas a mano.
 * Editar cualquiera de las dos fechas pasa el selector a "personalizado", así
 * que no hay que elegir el modo antes de escribir.
 */
export function RangePicker({ value, preset, onChange, disabled }: Props) {
  const set = (patch: Partial<DayRange>) => {
    const next = { ...value, ...patch };
    // Con el rango invertido el backend rechaza: se acomoda solo el otro extremo.
    if (next.from > next.to) {
      if (patch.from) next.to = next.from;
      else next.from = next.to;
    }
    onChange(next, 'custom');
  };

  return (
    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
      <ToggleButtonGroup
        size="small"
        exclusive
        value={preset}
        disabled={disabled}
        onChange={(_, v: MonitoringWindow | null) => {
          if (v === 7 || v === 30) onChange(lastDays(v), v);
        }}
      >
        <ToggleButton value={7}>7 días</ToggleButton>
        <ToggleButton value={30}>30 días</ToggleButton>
        <ToggleButton value="custom" disabled>
          Personalizado
        </ToggleButton>
      </ToggleButtonGroup>
      <TextField
        size="small"
        type="date"
        label="Desde"
        disabled={disabled}
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: value.to }}
        value={value.from}
        onChange={(e) => e.target.value && set({ from: e.target.value })}
        sx={{ width: 155 }}
      />
      <TextField
        size="small"
        type="date"
        label="Hasta"
        disabled={disabled}
        InputLabelProps={{ shrink: true }}
        inputProps={{ min: value.from, max: today() }}
        value={value.to}
        onChange={(e) => e.target.value && set({ to: e.target.value })}
        sx={{ width: 155 }}
      />
    </Stack>
  );
}
