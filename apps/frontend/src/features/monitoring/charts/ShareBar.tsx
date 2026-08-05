import { Box, Stack, Typography } from '@mui/material';
import { useChartInk } from './palette';

/**
 * Reparto entre dos partes de un total (bot vs escaladas). Con dos valores una
 * torta no aporta nada: una barra de proporción con los números al lado dice lo
 * mismo en menos espacio. Los segmentos se separan con un gap de 2px del color
 * de la superficie, no con un borde.
 */
export function ShareBar({
  primary,
  secondary,
}: {
  primary: { label: string; value: number };
  secondary: { label: string; value: number };
}) {
  const ink = useChartInk();
  const total = primary.value + secondary.value;
  const pct = total > 0 ? (primary.value / total) * 100 : 0;

  return (
    <Stack spacing={1}>
      <Box
        sx={{
          display: 'flex',
          gap: '2px',
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          bgcolor: ink.grid,
        }}
      >
        <Box sx={{ width: `${pct}%`, bgcolor: ink.series[0], transition: 'width .3s' }} />
        <Box sx={{ flex: 1, bgcolor: ink.series[1] }} />
      </Box>
      <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Legend color={ink.series[0]!} label={primary.label} value={primary.value} total={total} />
        <Legend color={ink.series[1]!} label={secondary.label} value={secondary.value} total={total} />
      </Stack>
    </Stack>
  );
}

function Legend({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value.toLocaleString('es-AR')}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        ({pct}%)
      </Typography>
    </Stack>
  );
}
