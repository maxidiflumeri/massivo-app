import dagre from 'dagre';
import type { BotFlow, BotNodePosition } from './types';

export const NODE_W = 240;
export const NODE_H_BASE = 110;

/**
 * Auto-layout horizontal con dagre. Devuelve un nuevo flow con `position`
 * seteado en cada nodo. Usa rangos por kind para mantener consistencia visual.
 */
export function autoLayout(flow: BotFlow): BotFlow {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [id, node] of Object.entries(flow.nodes)) {
    const optionsExtra = node.kind === 'MENU' ? node.options.length * 22 : 0;
    g.setNode(id, { width: NODE_W, height: NODE_H_BASE + optionsExtra });
  }
  for (const [id, node] of Object.entries(flow.nodes)) {
    if (node.kind === 'MENU') {
      for (const opt of node.options) {
        if (flow.nodes[opt.nextNodeId]) g.setEdge(id, opt.nextNodeId);
      }
    } else if (node.kind === 'MESSAGE' && node.nextNodeId && flow.nodes[node.nextNodeId]) {
      g.setEdge(id, node.nextNodeId);
    }
  }
  dagre.layout(g);

  const nextNodes: BotFlow['nodes'] = {};
  for (const [id, node] of Object.entries(flow.nodes)) {
    const p = g.node(id);
    const optionsExtra = node.kind === 'MENU' ? node.options.length * 22 : 0;
    const position: BotNodePosition = {
      x: p.x - NODE_W / 2,
      y: p.y - (NODE_H_BASE + optionsExtra) / 2,
    };
    nextNodes[id] = { ...node, position };
  }
  return { ...flow, nodes: nextNodes };
}
