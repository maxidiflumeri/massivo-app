import type { BotRouter, BotTopic } from './types';

const NAMED_GROUP_RE = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;

/**
 * 4.O.4 — Recolecta nombres de variables que el flow usa "de hecho" pero que
 * pueden no estar declaradas en `botVariables`. Sirven para ofrecer un atajo
 * "+ importar implícitas" en el panel. No fuerza la declaración — el motor las
 * trata como string sin default si no están declaradas.
 *
 * Fuentes:
 *  - `CAPTURE.saveAs` — la variable donde el motor guarda el input del usuario.
 *  - `CONDITION` branches con `when.kind='var'` — la variable que evalúa.
 *  - Router rules `template-payload` con `(?<varName>...)` — named groups que
 *    se inyectan al `seedData` al matchear.
 */
export function collectImplicitVariableNames(
  topics: BotTopic[],
  router: BotRouter | null,
): string[] {
  const out = new Set<string>();
  for (const t of topics) {
    for (const node of Object.values(t.flow.nodes)) {
      if (node.kind === 'CAPTURE' && node.saveAs) out.add(node.saveAs);
      else if (node.kind === 'CONDITION') {
        for (const b of node.branches) {
          if (b.when?.kind === 'var' && b.when.var) out.add(b.when.var);
        }
      } else if (node.kind === 'SET_VAR' && node.varName) out.add(node.varName);
      else if (node.kind === 'HTTP' && node.saveAs) out.add(node.saveAs);
      else if (node.kind === 'FOREACH') {
        if (node.itemVar) out.add(node.itemVar);
        if (node.indexVar) out.add(node.indexVar);
      }
    }
  }
  if (router) {
    for (const r of router.rules) {
      if (r.kind === 'template-payload' && r.pattern) {
        try {
          new RegExp(r.pattern); // smoke-test antes de iterar
          for (const m of r.pattern.matchAll(NAMED_GROUP_RE)) out.add(m[1]);
        } catch {
          /* regex inválida — el panel de router lo flagea */
        }
      }
    }
  }
  return Array.from(out).sort();
}
