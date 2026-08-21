import { useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { PathsOverview } from './types';

/** Nombres lindos para los temas; si aparece uno nuevo se muestra su id. */
const NOMBRE_TEMA: Record<string, string> = {
  menu_principal: 'Menú principal',
  multas: 'Consulta de infracciones',
  faqs: 'Preguntas frecuentes',
  documentos: 'Documentos e instructivos',
};

const nf = new Intl.NumberFormat('es-AR');

/**
 * Desglose de por dónde pasa la gente: temas y, adentro, cada nodo del flujo.
 * Responde "cuántos consultaron por DNI vs patente" o "cuántos pidieron el
 * cupón por mail" sin abrir el diseñador.
 */
export function PathsBreakdown({ data }: { data: PathsOverview }) {
  const [abierto, setAbierto] = useState<string | null>(data.topics[0]?.topicId ?? null);
  const totalPersonas = Math.max(...data.topics.map((t) => t.personas), 1);

  return (
    <Stack spacing={1}>
      {data.topics.map((t) => {
        const expandido = abierto === t.topicId;
        // Dentro del tema, el 100% es el nodo más transitado (su entrada).
        const tope = Math.max(...t.nodes.map((n) => n.personas), 1);
        return (
          <Paper key={t.topicId} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ p: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => setAbierto(expandido ? null : t.topicId)}
            >
              <IconButton size="small" sx={{ p: 0.25 }}>
                {expandido ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {NOMBRE_TEMA[t.topicId] ?? t.topicId}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(t.personas / totalPersonas) * 100}
                  sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                />
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {nf.format(t.personas)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  personas
                </Typography>
              </Box>
            </Stack>

            <Collapse in={expandido} unmountOnExit>
              <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
                {t.nodes.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    Sin pasos registrados en el período.
                  </Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {t.nodes.map((n) => {
                      const pct = (n.personas / tope) * 100;
                      return (
                        <Stack key={n.nodeId} direction="row" alignItems="center" gap={1}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Stack direction="row" alignItems="baseline" gap={0.75}>
                              <Typography
                                variant="caption"
                                sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                                noWrap
                              >
                                {n.nodeId}
                              </Typography>
                              {n.nodeKind && (
                                <Chip
                                  label={n.nodeKind}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 15, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }}
                                />
                              )}
                              {n.preview && (
                                <Tooltip title={n.preview}>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {n.preview}
                                  </Typography>
                                </Tooltip>
                              )}
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              color="secondary"
                              sx={{ mt: 0.25, height: 4, borderRadius: 2 }}
                            />
                          </Box>
                          <Tooltip title={`${nf.format(n.pasadas)} pasadas en total`}>
                            <Box sx={{ textAlign: 'right', flexShrink: 0, minWidth: 76 }}>
                              <Typography
                                variant="caption"
                                sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                              >
                                {nf.format(n.personas)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {' '}
                                · {Math.round(pct)}%
                              </Typography>
                            </Box>
                          </Tooltip>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            </Collapse>
          </Paper>
        );
      })}
    </Stack>
  );
}
