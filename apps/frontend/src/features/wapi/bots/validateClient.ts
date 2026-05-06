import type { BotFlow } from './types';

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Espejo cliente del validateBotFlow del backend (validación rápida en el
 * editor antes de pegar al server). Si esto pasa, el backend también pasa.
 */
export function validateClient(flow: BotFlow): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (!flow.startNodeId) {
    errors.push({ path: 'startNodeId', message: 'Falta nodo inicial' });
  } else if (!flow.nodes[flow.startNodeId]) {
    errors.push({ path: 'startNodeId', message: 'El nodo inicial no existe' });
  }
  for (const [id, node] of Object.entries(flow.nodes)) {
    if (!node.text || node.text.trim().length === 0) {
      errors.push({ path: `nodes.${id}.text`, message: 'Texto vacío' });
    }
    if (node.kind === 'MENU') {
      if (node.options.length === 0) {
        errors.push({ path: `nodes.${id}.options`, message: 'MENU sin opciones' });
      }
      if (node.options.length > 3) {
        errors.push({ path: `nodes.${id}.options`, message: 'máximo 3 opciones' });
      }
      const ids = new Set<string>();
      for (const opt of node.options) {
        if (!opt.id) {
          errors.push({ path: `nodes.${id}.options`, message: 'opción sin id' });
        } else if (ids.has(opt.id)) {
          errors.push({ path: `nodes.${id}.options`, message: `id duplicado "${opt.id}"` });
        }
        ids.add(opt.id);
        if (!opt.label || opt.label.trim().length === 0) {
          errors.push({ path: `nodes.${id}.options.${opt.id}`, message: 'sin etiqueta' });
        }
        if (!opt.nextNodeId || !flow.nodes[opt.nextNodeId]) {
          errors.push({
            path: `nodes.${id}.options.${opt.id}`,
            message: `nextNodeId "${opt.nextNodeId || '(vacío)'}" inválido`,
          });
        }
      }
    } else if (node.kind === 'MESSAGE') {
      if (node.nextNodeId !== undefined && node.nextNodeId !== '') {
        if (node.nextNodeId === id) {
          errors.push({
            path: `nodes.${id}.nextNodeId`,
            message: 'auto-referencia (loop)',
          });
        } else if (!flow.nodes[node.nextNodeId]) {
          errors.push({
            path: `nodes.${id}.nextNodeId`,
            message: `nextNodeId "${node.nextNodeId}" no existe`,
          });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
