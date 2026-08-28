import { useEffect, useRef, useState } from 'react';
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { esES } from '@mui/x-date-pickers/locales';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/es';
import type { DayRange, MonitoringWindow } from './types';

/** Formato con el que viajan las fechas a la API: día local, sin hora. */
const FMT = 'YYYY-MM-DD';

/**
 * `adapterLocale` sólo traduce lo que viene de dayjs (meses, días). Los textos
 * propios del componente —"Select date", "Cancel", "OK"— salen de acá; sin esto
 * el calendario aparece medio en inglés.
 */
const TEXTOS_ES = esES.components.MuiLocalizationProvider.defaultProps.localeText;

/** Hoy, en hora local del navegador. */
export function today(): string {
  return dayjs().format(FMT);
}

/** Ventana de los últimos `n` días, contando hoy. */
export function lastDays(n: number): DayRange {
  return { from: dayjs().subtract(n - 1, 'day').format(FMT), to: today() };
}

interface Props {
  value: DayRange;
  preset: MonitoringWindow;
  onChange: (range: DayRange, preset: MonitoringWindow) => void;
  disabled?: boolean;
}

type Campo = 'from' | 'to';
type Draft = Record<Campo, Dayjs | null>;

const toDraft = (r: DayRange): Draft => ({ from: dayjs(r.from), to: dayjs(r.to) });

/**
 * Ventana de las métricas: dos atajos y un calendario para el rango a medida.
 *
 * Lo que se edita es un **borrador**: mientras se tipea o se navega el
 * calendario no se dispara ninguna consulta. La ventana se aplica recién cuando
 * la fecha queda elegida — al cerrarse el calendario, al salir del campo o con
 * Enter. Antes, con un `<input type="date">`, el campo emitía valor apenas era
 * parseable: escribir "27" sin apurarse buscaba primero por el día 2.
 */
export function RangePicker({ value, preset, onChange, disabled }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));

  /**
   * El borrador también vive en una ref que se actualiza **sincrónicamente**.
   * `onChange` y `onClose` del DatePicker corren en el mismo tick: si al cerrar
   * se leyera el estado, todavía sería el anterior y elegir un día en el
   * calendario no aplicaba nada.
   */
  const draftRef = useRef<Draft>(draft);

  const actualizar = (campo: Campo, d: Dayjs | null) => {
    draftRef.current = { ...draftRef.current, [campo]: d };
    setDraft(draftRef.current);
  };

  // Los atajos (7/30 días) cambian el rango desde afuera: el borrador los sigue.
  useEffect(() => {
    draftRef.current = toDraft(value);
    setDraft(draftRef.current);
  }, [value.from, value.to]);

  const hoy = dayjs().startOf('day');

  /**
   * Valida el borrador y, si cambió algo, pide la nueva ventana. Un borrador
   * incompleto o inválido (el campo a medio escribir, o vaciado) vuelve al
   * rango vigente en vez de disparar una consulta sin sentido.
   *
   * `editado` dice cuál de los dos extremos tocó el usuario, para correr el otro
   * si el rango quedó al revés.
   */
  function aplicar(editado: Campo = 'to') {
    const next = draftRef.current;
    if (!next.from?.isValid() || !next.to?.isValid()) {
      draftRef.current = toDraft(value);
      setDraft(draftRef.current);
      return;
    }
    let from = next.from.startOf('day');
    let to = next.to.startOf('day');
    if (from.isAfter(hoy)) from = hoy;
    if (to.isAfter(hoy)) to = hoy;
    if (from.isAfter(to)) {
      if (editado === 'from') to = from;
      else from = to;
    }
    draftRef.current = { from, to };
    setDraft(draftRef.current);

    const rango = { from: from.format(FMT), to: to.format(FMT) };
    if (rango.from === value.from && rango.to === value.to) return;
    onChange(rango, 'custom');
  }

  const dias =
    draft.from?.isValid() && draft.to?.isValid() ? draft.to.diff(draft.from, 'day') + 1 : null;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es" localeText={TEXTOS_ES}>
      {/* Enter se escucha acá y no en cada campo: el field de MUI se queda con
          su propio `onKeyDown` y el handler de `slotProps.textField` no llega a
          correr (comprobado: tipear y apretar Enter no aplicaba nada). */}
      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        flexWrap="wrap"
        onKeyDown={(e) => {
          if (e.key === 'Enter') aplicar();
        }}
      >
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
        </ToggleButtonGroup>

        <CampoFecha
          label="Desde"
          value={draft.from}
          disabled={disabled}
          maxDate={hoy}
          onDraft={(d) => actualizar('from', d)}
          onConfirmar={() => aplicar('from')}
        />
        <CampoFecha
          label="Hasta"
          value={draft.to}
          disabled={disabled}
          minDate={draft.from ?? undefined}
          maxDate={hoy}
          onDraft={(d) => actualizar('to', d)}
          onConfirmar={() => aplicar('to')}
        />

        {dias !== null && (
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {dias} {dias === 1 ? 'día' : 'días'}
          </Typography>
        )}
      </Stack>
    </LocalizationProvider>
  );
}

interface CampoProps {
  label: string;
  value: Dayjs | null;
  disabled?: boolean;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  /** Mientras se escribe o se navega: sólo mueve el borrador, no consulta. */
  onDraft: (d: Dayjs | null) => void;
  /** La fecha quedó elegida: recién acá se pide la nueva ventana. */
  onConfirmar: () => void;
}

/**
 * Campo de fecha con calendario. Se abre al hacer click en cualquier parte del
 * campo, no sólo en el ícono: la pista del `<input type="date">` nativo era un
 * cuadradito de doce píxeles que nadie encontraba.
 *
 * ⚠️ **No sirve `onAccept`** para confirmar: MUI lo dispara en cuanto la fecha
 * queda completa y válida, y como el mes y el año ya están puestos, tipear el
 * "2" de "27" arma un 02 válido y consultaría por ese día — exactamente el
 * problema que tenía el input nativo.
 */
function CampoFecha({ label, value, disabled, minDate, maxDate, onDraft, onConfirmar }: CampoProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <DatePicker
      label={label}
      value={value}
      disabled={disabled}
      minDate={minDate}
      maxDate={maxDate}
      format="DD/MM/YYYY"
      open={abierto}
      onOpen={() => setAbierto(true)}
      onClose={() => {
        setAbierto(false);
        onConfirmar();
      }}
      onChange={onDraft}
      slotProps={{
        textField: {
          size: 'small',
          sx: { width: 165 },
          onClick: () => !disabled && setAbierto(true),
          onBlur: onConfirmar,
        },
        // El calendario tapa el campo si se abre justo encima.
        popper: { placement: 'bottom-start' },
      }}
    />
  );
}
