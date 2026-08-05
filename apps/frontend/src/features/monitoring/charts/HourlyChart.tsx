import { BarChart } from '@mui/x-charts/BarChart';
import { Box } from '@mui/material';
import { useChartInk } from './palette';
import type { MonitoringOverview } from '../types';

/**
 * Distribución horaria de mensajes entrantes (hora local de Buenos Aires).
 * Una sola serie → un solo color (slot 1) para todas las barras y sin leyenda:
 * el título ya la nombra. Colorear cada barra según su altura sería redundante.
 */
export function HourlyChart({ data }: { data: MonitoringOverview['hourly'] }) {
  const ink = useChartInk();

  return (
    <Box sx={{ width: '100%', height: 240 }}>
      <BarChart
        height={240}
        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
        colors={[ink.series[0]!]}
        xAxis={[
          {
            scaleType: 'band',
            data: data.map((h) => String(h.hour).padStart(2, '0')),
            tickLabelStyle: { fontSize: 10, fill: ink.textMuted },
            categoryGapRatio: 0.35,
          },
        ]}
        yAxis={[{ width: 44, tickLabelStyle: { fontSize: 11, fill: ink.textMuted } }]}
        series={[{ data: data.map((h) => h.messagesIn), label: 'Mensajes entrantes' }]}
        grid={{ horizontal: true }}
        hideLegend
        borderRadius={4}
        sx={{
          '& .MuiChartsGrid-line': { stroke: ink.grid, strokeWidth: 1 },
          '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: ink.axis },
        }}
      />
    </Box>
  );
}
