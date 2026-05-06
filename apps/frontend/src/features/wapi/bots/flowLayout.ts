import dagre from 'dagre';
import type { BotFlow, BotNode, BotNodePosition } from './types';

export const NODE_W = 240;
export const NODE_H_BASE = 110;

function nodeHeight(node: BotNode): number {
  if (node.kind === 'MENU') return NODE_H_BASE + node.options.length * 22;
  if (node.kind === 'CAPTURE') return NODE_H_BASE + 60; // saveAs/validate/retry
  if (node.kind === 'CONDITION') return NODE_H_BASE + (node.branches.length + 1) * 22;
  if (node.kind === 'MEDIA') return NODE_H_BASE + (node.caption ? 30 : 0);
  return NODE_H_BASE;
}

/**
 * Auto-layout horizontal con dagre. Devuelve un nuevo flow con `position`
 * seteado en cada nodo. Usa rangos por kind para mantener consistencia visual.
 */
export function autoLayout(flow: BotFlow): BotFlow {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [id, node] of Object.entries(flow.nodes)) {
    g.setNode(id, { width: NODE_W, height: nodeHeight(node) });
  }
  for (const [id, node] of Object.entries(flow.nodes)) {
    if (node.kind === 'MENU') {
      for (const opt of node.options) {
        if (flow.nodes[opt.nextNodeId]) g.setEdge(id, opt.nextNodeId);
      }
    } else if (node.kind === 'MESSAGE' && node.nextNodeId && flow.nodes[node.nextNodeId]) {
      g.setEdge(id, node.nextNodeId);
    } else if (node.kind === 'MEDIA' && node.nextNodeId && flow.nodes[node.nextNodeId]) {
      g.setEdge(id, node.nextNodeId);
    } else if (node.kind === 'CAPTURE') {
      if (flow.nodes[node.nextNodeId]) g.setEdge(id, node.nextNodeId);
      if (node.retryNodeId && flow.nodes[node.retryNodeId]) g.setEdge(id, node.retryNodeId);
    } else if (node.kind === 'CONDITION') {
      for (const b of node.branches) {
        if (b.nextNodeId && flow.nodes[b.nextNodeId]) g.setEdge(id, b.nextNodeId);
      }
      if (node.elseNextNodeId && flow.nodes[node.elseNextNodeId]) g.setEdge(id, node.elseNextNodeId);
    } else if (node.kind === 'SET_VAR' && node.nextNodeId && flow.nodes[node.nextNodeId]) {
      g.setEdge(id, node.nextNodeId);
    }
  }
  dagre.layout(g);

  const nextNodes: BotFlow['nodes'] = {};
  for (const [id, node] of Object.entries(flow.nodes)) {
    const p = g.node(id);
    const h = nodeHeight(node);
    const position: BotNodePosition = {
      x: p.x - NODE_W / 2,
      y: p.y - h / 2,
    };
    nextNodes[id] = { ...node, position };
  }
  return { ...flow, nodes: nextNodes };
}
