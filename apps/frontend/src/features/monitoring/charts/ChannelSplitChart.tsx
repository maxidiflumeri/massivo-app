import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { useChartInk } from './palette';
import { CHANNEL_LABELS } from '../../inbox/capabilities';
import type { ChannelKind } from '../../inbox/types';
import type { MonitoringOverview } from '../types';

/**
 * Conversaciones por canal. Son pocas categorías nominales con etiqueta larga:
 * barras horizontales con el valor al lado leen mejor que una torta (y una
 * torta de 2 gajos sería directamente un número). Una serie → un solo color.
 */
export function ChannelSplitChart({ data }: { data: MonitoringOverview['byChannel'] }) {
  const ink = useChartInk();
  const max = Math.max(1, ...data.map((c) => c.conversations));

  if (data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sin conversaciones en el período.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {[...data]
        .sort((a, b) => b.conversations - a.conversations)
        .map((c) => (
          <Box key={c.channelKind}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {CHANNEL_LABELS[c.channelKind as ChannelKind] ?? c.channelKind}
              </Typography>
              {/* El valor va siempre visible: el color no es el único canal. */}
              <Typography variant="body2" fontWeight={600}>
                {c.conversations.toLocaleString('es-AR')}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(c.conversations / max) * 100}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: ink.grid,
                '& .MuiLinearProgress-bar': { bgcolor: ink.series[0], borderRadius: 4 },
              }}
            />
          </Box>
        ))}
    </Stack>
  );
}
