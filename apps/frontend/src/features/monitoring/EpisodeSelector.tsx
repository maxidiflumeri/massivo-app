import { Box, Chip, MenuItem, Select, Stack, Typography } from '@mui/material';
import type { EpisodeItem } from './types';

interface Props {
  episodes: EpisodeItem[];
  value: string | null;
  onChange: (episodeId: string) => void;
}

/**
 * Selector de "visitas" del hilo. El hilo con una persona es único y acumula
 * meses; esto permite mirar una conversación puntual en vez de todo junto.
 */
export function EpisodeSelector({ episodes, value, onChange }: Props) {
  if (episodes.length <= 1) return null;

  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        Visita
      </Typography>
      <Select
        size="small"
        value={value ?? episodes[0]?.episodeId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        sx={{ minWidth: 260, '& .MuiSelect-select': { py: 0.5, fontSize: 13 } }}
      >
        {episodes.map((ep, idx) => (
          <MenuItem key={ep.episodeId} value={ep.episodeId} sx={{ fontSize: 13 }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ width: '100%' }}>
              <Box component="span" sx={{ fontWeight: idx === 0 ? 600 : 400 }}>
                {formatRange(ep)}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {ep.messages} msj{ep.messages === 1 ? '' : 's'}
              </Typography>
              {ep.handedOff && (
                <Chip size="small" label="derivada" color="warning" variant="outlined" sx={{ height: 16, fontSize: 9.5 }} />
              )}
              {idx === 0 && (
                <Chip size="small" label="última" variant="outlined" sx={{ height: 16, fontSize: 9.5 }} />
              )}
            </Stack>
          </MenuItem>
        ))}
      </Select>
      <Typography variant="caption" color="text.secondary">
        de {episodes.length}
      </Typography>
    </Stack>
  );
}

/** "05/08 14:43 → 14:44" o "05/08 14:43 → 06/08 09:10" si cruza de día. */
function formatRange(ep: EpisodeItem): string {
  const a = new Date(ep.startedAt);
  const b = new Date(ep.endedAt);
  const fecha = (d: Date) =>
    d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  const hora = (d: Date) =>
    d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const mismoDia = fecha(a) === fecha(b);
  return mismoDia
    ? `${fecha(a)} ${hora(a)} → ${hora(b)}`
    : `${fecha(a)} ${hora(a)} → ${fecha(b)} ${hora(b)}`;
}
