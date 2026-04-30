import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import type { CampaignReport } from './types';

interface Props {
  /** Total de reports en la campaña (campaign._count.reports). */
  totalReports: number;
  /** Counts en vivo por status, ya updateados via socket. */
  report: CampaignReport | null;
  /** Conexión socket actual — para mostrar indicador "● en vivo". */
  socketConnected: boolean;
}

/**
 * Banner visible mientras la campaña está PROCESSING. Calcula el % completado
 * sumando los reports que ya transicionaron de PENDING a un estado terminal.
 *
 * También estima throughput (envíos/min) usando un buffer de los últimos 60s
 * de progreso real — sólo se muestra si hay al menos ~10s de muestras y un
 * delta >0, para evitar valores ruidosos al arranque.
 */
export function CampaignProcessingBanner({ totalReports, report, socketConnected }: Props) {
  const counts = report?.counts ?? {};
  const pending = counts.PENDING ?? 0;
  const processed = Math.max(0, totalReports - pending);
  const pct = totalReports > 0 ? (processed / totalReports) * 100 : 0;

  const sent = counts.SENT ?? 0;
  const failed = counts.FAILED ?? 0;
  const bounced = counts.BOUNCED ?? 0;
  const complained = counts.COMPLAINED ?? 0;
  const suppressed = counts.SUPPRESSED ?? 0;

  const throughput = useThroughput(processed);

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <HourglassTopIcon color="warning" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Enviando campaña…
        </Typography>
        {socketConnected ? (
          <Chip size="small" label="● en vivo" color="success" variant="outlined" />
        ) : (
          <Chip size="small" label="○ desconectado" variant="outlined" />
        )}
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, pct)}
          sx={{ height: 10, borderRadius: 5 }}
        />
      </Box>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {processed.toLocaleString()} / {totalReports.toLocaleString()} procesados
          <Typography component="span" color="text.secondary" sx={{ ml: 0.75 }}>
            ({pct.toFixed(1)}%)
          </Typography>
        </Typography>
        <Box sx={{ flex: 1 }} />
        {throughput !== null && (
          <Typography variant="body2" color="text.secondary">
            ~{throughput.toFixed(0)} envíos/min
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
        <Chip size="small" label={`Pendientes: ${pending}`} variant="outlined" />
        <Chip size="small" label={`Enviados: ${sent}`} color="success" variant="outlined" />
        {failed > 0 && <Chip size="small" label={`Fallidos: ${failed}`} color="error" />}
        {bounced > 0 && <Chip size="small" label={`Bounced: ${bounced}`} color="error" variant="outlined" />}
        {complained > 0 && (
          <Chip size="small" label={`Complaints: ${complained}`} color="warning" />
        )}
        {suppressed > 0 && (
          <Chip size="small" label={`Suprimidos: ${suppressed}`} variant="outlined" />
        )}
      </Stack>
    </Paper>
  );
}

interface Sample {
  t: number;
  processed: number;
}

/**
 * Calcula throughput (envíos/min) sobre los últimos ~60s de muestras.
 * Devuelve null si todavía no hay suficientes datos.
 */
function useThroughput(processed: number): number | null {
  const samples = useRef<Sample[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    samples.current.push({ t: now, processed });
    const cutoff = now - 60_000;
    samples.current = samples.current.filter((s) => s.t >= cutoff);
    setTick((x) => x + 1);
  }, [processed]);

  if (tick === 0 || samples.current.length < 2) return null;
  const first = samples.current[0]!;
  const last = samples.current[samples.current.length - 1]!;
  const dtSec = (last.t - first.t) / 1000;
  if (dtSec < 5) return null;
  const dProc = last.processed - first.processed;
  if (dProc <= 0) return null;
  return (dProc / dtSec) * 60;
}
