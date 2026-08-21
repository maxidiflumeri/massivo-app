import { Box, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import type { PathsOverview } from './types';

/**
 * Embudos "de negocio": traducen los nodos del flow a los números que se miran
 * todos los días. El desglose por nodo (PathsBreakdown) sirve para investigar;
 * esto responde de un vistazo cuántos consultan por patente, cuántos reciben el
 * cupón o cuántos aceptan el mail.
 *
 * La definición vive acá y no en el backend porque es presentación: qué pasos
 * vale la pena mostrar y cómo llamarlos. Si un nodo se renombra o se borra, el
 * paso simplemente no se dibuja — nunca rompe la pantalla.
 */
interface Paso {
  nodeId: string;
  label: string;
  /** Sangría: marca que el paso es consecuencia del anterior. */
  hijo?: boolean;
  /** El 100% del embudo. Debe ser el primer paso. */
  base?: boolean;
}

const EMBUDOS: Array<{ topicId: string; titulo: string; pasos: Paso[] }> = [
  {
    topicId: 'multas',
    titulo: 'Consulta de infracciones',
    pasos: [
      { nodeId: 'ask_tipo', label: 'Entran a consultar', base: true },
      { nodeId: 'set_tipo_pat', label: 'Consultan por patente', hijo: true },
      { nodeId: 'set_tipo_dni', label: 'Consultan por DNI', hijo: true },
      { nodeId: 'msg_total', label: 'Tienen infracciones' },
      { nodeId: 'msg_sin_multas', label: 'No tienen ninguna' },
      { nodeId: 'ask_orden_detalle', label: 'Piden el acta original' },
      { nodeId: 'send_link_detalle', label: 'La reciben', hijo: true },
      { nodeId: 'ask_orden_cupon', label: 'Piden el cupón de pago' },
      { nodeId: 'send_link_cupon', label: 'Lo reciben', hijo: true },
      { nodeId: 'ask_send_email', label: 'Se les ofrece por mail' },
      { nodeId: 'ask_email', label: 'Aceptan', hijo: true },
      { nodeId: 'msg_mail_ok', label: 'El mail sale', hijo: true },
    ],
  },
  {
    topicId: 'documentos',
    titulo: 'Documentos e instructivos',
    pasos: [
      { nodeId: 'docs_menu', label: 'Abren la lista', base: true },
      { nodeId: 'doc_manual', label: 'Manual de la web', hijo: true },
      { nodeId: 'doc_descargo', label: 'Hacer un descargo', hijo: true },
      { nodeId: 'doc_delegacion', label: 'Delegación Digital', hijo: true },
      { nodeId: 'doc_informar', label: 'Deber de informar', hijo: true },
      { nodeId: 'doc_turno', label: 'Sacar turno', hijo: true },
      { nodeId: 'doc_dve', label: 'Pagar con DVE', hijo: true },
      { nodeId: 'doc_rp2', label: 'Velocidades RP 2', hijo: true },
      { nodeId: 'doc_rp11', label: 'Velocidades RP 11-74', hijo: true },
    ],
  },
  {
    topicId: 'faqs',
    titulo: 'Preguntas frecuentes',
    pasos: [
      { nodeId: 'faq_start', label: 'Abren las preguntas', base: true },
      { nodeId: 'cat_pagos', label: 'Pagos e infracciones', hijo: true },
      { nodeId: 'cat_descargo', label: 'Descargos', hijo: true },
      { nodeId: 'cat_licencia', label: 'Licencia', hijo: true },
      { nodeId: 'faq_more', label: 'Buscan más temas', hijo: true },
    ],
  },
];

const nf = new Intl.NumberFormat('es-AR');

export function FunnelSummary({ data }: { data: PathsOverview }) {
  const porTema = new Map(data.topics.map((t) => [t.topicId, t]));

  const embudos = EMBUDOS.map((e) => {
    const tema = porTema.get(e.topicId);
    if (!tema) return null;
    const cuenta = new Map(tema.nodes.map((n) => [n.nodeId, n.recorridos]));
    // Se muestran TODOS los pasos configurados, incluso en cero: que un
    // documento no lo pidiera nadie es justamente un dato. Si un nodo se
    // renombra en el flow, queda clavado en cero y se nota.
    const pasos = e.pasos.map((p) => ({ ...p, recorridos: cuenta.get(p.nodeId) ?? 0 }));
    const base = pasos.find((p) => p.base)?.recorridos ?? 0;
    if (base === 0) return null;
    return { ...e, pasos, base };
  }).filter(Boolean) as Array<{ topicId: string; titulo: string; pasos: Array<Paso & { recorridos: number }>; base: number }>;

  if (embudos.length === 0) return null;

  return (
    <Stack spacing={2}>
      {embudos.map((e) => (
        <Paper key={e.topicId} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            {e.titulo}
          </Typography>
          <Stack spacing={0.5}>
            {e.pasos.map((p) => {
              const pct = (p.recorridos / e.base) * 100;
              return (
                <Stack key={p.nodeId} direction="row" alignItems="center" gap={1.5}>
                  <Typography
                    variant="body2"
                    sx={{
                      flex: '0 0 44%',
                      pl: p.hijo ? 2 : 0,
                      color: p.hijo ? 'text.secondary' : 'text.primary',
                      fontWeight: p.base ? 600 : 400,
                    }}
                    noWrap
                  >
                    {p.hijo && '└ '}
                    {p.label}
                  </Typography>
                  <Tooltip title={`nodo: ${p.nodeId}`}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(pct, 100)}
                        sx={{ height: p.base ? 9 : 7, borderRadius: 4 }}
                      />
                    </Box>
                  </Tooltip>
                  <Typography
                    variant="body2"
                    sx={{
                      flex: '0 0 100px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: p.base ? 600 : 400,
                    }}
                  >
                    {nf.format(p.recorridos)}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}
                      · {Math.round(pct)}%
                    </Typography>
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Porcentajes sobre «{e.pasos.find((p) => p.base)?.label}» ({nf.format(e.base)} recorridos).
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}
