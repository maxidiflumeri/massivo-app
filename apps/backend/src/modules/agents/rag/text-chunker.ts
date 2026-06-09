export interface TextChunk {
  index: number;
  content: string;
}

export const DEFAULT_MAX_CHARS = 1000;
export const DEFAULT_OVERLAP = 150;

/**
 * Chunking simple y determinístico para RAG: parte el texto en fragmentos de
 * ~`maxChars`, respetando límites de párrafo (y de oración si un párrafo es enorme),
 * con `overlap` de solapamiento entre chunks para no perder contexto en los bordes.
 * Puro y testeable (sin I/O).
 */
export function chunkText(
  raw: string,
  maxChars = DEFAULT_MAX_CHARS,
  overlap = DEFAULT_OVERLAP,
): TextChunk[] {
  const text = normalize(raw);
  if (!text) return [];
  if (text.length <= maxChars) return [{ index: 0, content: text }];

  const units = splitUnits(text, maxChars);
  const out: string[] = [];
  let cur = '';
  for (const u of units) {
    const candidate = cur ? `${cur}\n${u}` : u;
    if (candidate.length <= maxChars) {
      cur = candidate;
      continue;
    }
    if (cur) out.push(cur);
    const ov = overlapTail(cur, overlap);
    cur = ov ? `${ov}\n${u}` : u;
    // Si el overlap hace que se pase, descartamos el overlap (u solo entra por splitUnits).
    if (cur.length > maxChars) cur = u;
  }
  if (cur.trim()) out.push(cur);

  return out
    .map((content, index) => ({ index, content: content.trim() }))
    .filter((c) => c.content.length > 0)
    .map((c, index) => ({ index, content: c.content }));
}

function normalize(raw: string): string {
  return (raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Divide en "átomos" que individualmente no superan maxChars (párrafos → oraciones
 * → corte duro para oraciones monstruo). El loop principal de `chunkText` los junta.
 * No pierde texto (las oraciones gigantes se parten en ventanas, no se truncan).
 */
function splitUnits(text: string, maxChars: number): string[] {
  const atoms: string[] = [];
  for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= maxChars) {
      atoms.push(para);
      continue;
    }
    for (const sentence of para.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)) {
      if (sentence.length <= maxChars) {
        atoms.push(sentence);
      } else {
        for (let i = 0; i < sentence.length; i += maxChars) {
          atoms.push(sentence.slice(i, i + maxChars));
        }
      }
    }
  }
  return atoms;
}

/** Últimos ~n caracteres del chunk previo, recortados a un borde de palabra. */
function overlapTail(s: string, n: number): string {
  if (!s || n <= 0) return '';
  const t = s.slice(Math.max(0, s.length - n));
  const sp = t.indexOf(' ');
  return sp > 0 ? t.slice(sp + 1) : t;
}
