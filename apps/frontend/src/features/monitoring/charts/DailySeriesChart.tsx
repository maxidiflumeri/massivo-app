import { LineChart } from '@mui/x-charts/LineChart';
import { Box } from '@mui/material';
import { useChartInk } from './palette';
import type { MonitoringOverview } from '../types';

/**
 * Serie diaria: conversaciones nuevas + mensajes entrantes/salientes. Las tres
 * series comparten unidad (cantidad) y por eso comparten UN eje — nunca doble
 * escala. Marcas finas (2px), marcadores de 8px y grilla horizontal hairline.
 */
export function DailySeriesChart({ data }: { data: MonitoringOverview['days'] }) {
  const ink = useChartInk();
  const labels = data.map((d) => shortDay(d.day));

  return (
    <Box sx={{ width: '100%', height: 300 }}>
      <LineChart
        height={300}
        margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
        colors={[...ink.series]}
        xAxis={[{ scaleType: 'point', data: labels, tickLabelStyle: { fontSize: 11, fill: ink.textMuted } }]}
        yAxis={[{ width: 44, tickLabelStyle: { fontSize: 11, fill: ink.textMuted } }]}
        series={[
          { data: data.map((d) => d.conversations), label: 'Conversaciones nuevas', curve: 'monotoneX' },
          { data: data.map((d) => d.messagesIn), label: 'Entrantes', curve: 'monotoneX' },
          { data: data.map((d) => d.messagesOut), label: 'Salientes', curve: 'monotoneX' },
        ]}
        grid={{ horizontal: true }}
        sx={{
          '& .MuiLineElement-root': { strokeWidth: 2 },
          '& .MuiMarkElement-root': { r: 4, strokeWidth: 2, stroke: ink.surface },
          '& .MuiChartsGrid-line': { stroke: ink.grid, strokeWidth: 1 },
          '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: ink.axis },
          '& .MuiChartsLegend-series text': { fill: `${ink.textMuted} !important`, fontSize: 12 },
        }}
      />
    </Box>
  );
}

/** 2026-08-05 → "5/8". El año se sobreentiende en una ventana de 7/30 días. */
function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)}/${Number(m)}`;
}
