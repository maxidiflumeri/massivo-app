import { useTheme } from '@mui/material';

/**
 * Paleta categórica de los gráficos. Los tres slots están **validados** para
 * daltonismo y contraste contra las superficies reales del panel (Paper
 * `#ffffff` en claro, `#14171c` en oscuro) con el validador de la guía de
 * dataviz, en modo `--pairs all`:
 *
 *   claro:  CVD ΔE 9.2 · visión normal ΔE 24.0
 *   oscuro: CVD ΔE 9.4 · visión normal ΔE 20.9
 *
 * El modo oscuro NO es un flip automático: son los mismos tres tonos re-escalonados
 * para esa superficie. El orden de los slots es el mecanismo de seguridad CVD —
 * si hace falta un cuarto color, no se inventa: se pliega en "Otros".
 *
 * Nota de accesibilidad: en claro el aqua queda en 2.82:1 contra el Paper (bajo
 * 3:1), así que esos gráficos van siempre con leyenda, tooltip y vista de tabla —
 * el color nunca es el único canal.
 */
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
const DARK = ['#3987e5', '#d95926', '#199e70'] as const;

export interface ChartInk {
  /** Serie por slot fijo (0..2). El color sigue a la entidad, no a su ranking. */
  series: readonly string[];
  /** Grilla y ejes: hairline, un tono por encima de la superficie. */
  grid: string;
  axis: string;
  /** Tinta de textos — nunca el color de la serie. */
  text: string;
  textMuted: string;
  surface: string;
}

export function useChartInk(): ChartInk {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return {
    series: dark ? DARK : LIGHT,
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: dark ? '#383835' : '#c3c2b7',
    text: theme.palette.text.primary,
    textMuted: theme.palette.text.secondary,
    surface: theme.palette.background.paper,
  };
}
