import { Fragment, type ReactNode } from 'react';
import { Box } from '@mui/material';

type DelimMatch = {
  start: number;
  end: number;
  inner: [number, number];
  render: (children: ReactNode, key: number) => ReactNode;
};

const INLINE: Array<{
  re: RegExp;
  render: (children: ReactNode, key: number) => ReactNode;
}> = [
  {
    re: /\*([^*\n]+?)\*/,
    render: (c, k) => <strong key={k}>{c}</strong>,
  },
  {
    re: /_([^_\n]+?)_/,
    render: (c, k) => <em key={k}>{c}</em>,
  },
  {
    re: /~([^~\n]+?)~/,
    render: (c, k) => (
      <span key={k} style={{ textDecoration: 'line-through' }}>
        {c}
      </span>
    ),
  },
];

function findEarliestInline(text: string): DelimMatch | null {
  let best: DelimMatch | null = null;
  for (const { re, render } of INLINE) {
    const m = re.exec(text);
    if (!m || m.index === undefined) continue;
    const start = m.index;
    if (best && start >= best.start) continue;
    best = {
      start,
      end: start + m[0].length,
      inner: [start + 1, start + m[0].length - 1],
      render,
    };
  }
  return best;
}

function renderInline(text: string, keyBase: number): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = keyBase;
  let remaining = text;
  while (remaining.length > 0) {
    const match = findEarliestInline(remaining);
    if (!match) {
      out.push(<Fragment key={key++}>{remaining}</Fragment>);
      break;
    }
    if (match.start > 0) {
      out.push(<Fragment key={key++}>{remaining.slice(0, match.start)}</Fragment>);
    }
    const innerText = remaining.slice(match.inner[0] - cursor, match.inner[1] - cursor);
    const innerRendered = renderInline(innerText, key);
    key += innerRendered.length + 1;
    out.push(match.render(<>{innerRendered}</>, key++));
    remaining = remaining.slice(match.end);
  }
  return out;
}

const MONO_INLINE = /`([^`\n]+?)`/;
const MONO_BLOCK = /```([\s\S]+?)```/;

function renderMonoSegments(text: string, keyBase: number): ReactNode[] {
  const out: ReactNode[] = [];
  let key = keyBase;
  let remaining = text;
  while (remaining.length > 0) {
    const block = MONO_BLOCK.exec(remaining);
    const inline = MONO_INLINE.exec(remaining);
    let chosen: { idx: number; len: number; inner: string; multiline: boolean } | null = null;
    if (block && (!inline || block.index <= inline.index)) {
      chosen = { idx: block.index, len: block[0].length, inner: block[1] ?? '', multiline: true };
    } else if (inline) {
      chosen = { idx: inline.index, len: inline[0].length, inner: inline[1] ?? '', multiline: false };
    }
    if (!chosen) {
      out.push(...renderInline(remaining, key));
      break;
    }
    if (chosen.idx > 0) {
      out.push(...renderInline(remaining.slice(0, chosen.idx), key));
      key += 1000;
    }
    if (chosen.multiline) {
      out.push(
        <Box
          key={key++}
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.85em',
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            borderRadius: 0.75,
            px: 1,
            py: 0.5,
            my: 0.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {chosen.inner}
        </Box>,
      );
    } else {
      out.push(
        <Box
          key={key++}
          component="code"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.9em',
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            borderRadius: 0.5,
            px: 0.5,
          }}
        >
          {chosen.inner}
        </Box>,
      );
    }
    remaining = remaining.slice(chosen.idx + chosen.len);
  }
  return out;
}

/**
 * Renderiza texto con el subset de markdown que soporta WhatsApp:
 *  - *negrita*
 *  - _cursiva_
 *  - ~tachado~
 *  - `monoespaciado`
 *  - ```bloque código``` (multilínea)
 *
 * No es un parser completo CommonMark — sigue las reglas de WhatsApp:
 * delimitadores no pueden tener whitespace interno y no abarcan saltos de
 * línea (excepto el bloque de código triple-backtick). Los estilos inline
 * pueden anidar; el monoespaciado no admite nesting.
 */
export function renderWhatsAppMarkdown(text: string): ReactNode {
  if (!text) return null;
  return <>{renderMonoSegments(text, 0)}</>;
}
