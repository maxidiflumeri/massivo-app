import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const BRAND = '#5B5BD6';

// Animaciones (los estilos inline no soportan @keyframes ni pseudo-clases).
const WC_CSS = `
@keyframes wcBlink { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
.wc-dot { display: inline-block; width: 6px; height: 6px; margin: 0 2px; border-radius: 50%; background: #9CA3AF; animation: wcBlink 1.2s infinite both; }
.wc-dot:nth-child(2) { animation-delay: 0.15s; }
.wc-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes wcCaret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.wc-caret { color: #9CA3AF; margin-left: 1px; animation: wcCaret 0.9s steps(1) infinite; }
`;

interface WcMessage {
  id: string;
  direction: 'in' | 'out';
  type: 'text' | 'buttons' | 'media';
  text?: string;
  buttons?: Array<{ id: string; title: string }>;
  mediaType?: string;
  url?: string;
  caption?: string;
}

function visitorKey(channelKey: string): string {
  return `massivo:wc:visitor:${channelKey}`;
}

function newVisitorId(): string {
  return `wcv_${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId(channelKey: string): string {
  const k = visitorKey(channelKey);
  try {
    const existing = localStorage.getItem(k);
    if (existing) return existing;
    const id = newVisitorId();
    localStorage.setItem(k, id);
    return id;
  } catch {
    return newVisitorId();
  }
}

/** Rota a un visitorId nuevo (y lo persiste) → arranca una conversación limpia. */
function rotateVisitorId(channelKey: string): string {
  const id = newVisitorId();
  try {
    localStorage.setItem(visitorKey(channelKey), id);
  } catch {
    // no-op (sin localStorage el id vive en memoria igual)
  }
  return id;
}

/**
 * Widget de chat del visitante (contenido del iframe embebido). Se conecta al
 * namespace `/webchat` del backend con `{ channelKey, visitorId }`, manda mensajes y
 * recibe en vivo las respuestas del bot/operador. El visitorId se persiste en el
 * localStorage del iframe (por widget key) para mantener la conversación entre recargas.
 */
export function WebchatWidget({ channelKey }: { channelKey: string }) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WcMessage[]>([]);
  const [body, setBody] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [visitorId, setVisitorId] = useState(() => (channelKey ? getVisitorId(channelKey) : ''));
  const [typing, setTyping] = useState(false);
  // Mensaje entrante que se está revelando con efecto typewriter (id + chars visibles).
  const [stream, setStream] = useState<{ id: string; shown: number } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, stream]);

  // Safety: si por algún motivo no llega respuesta, oculta el indicador (best-effort).
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTyping(false), 30000);
    return () => clearTimeout(t);
  }, [typing]);

  // Typewriter: avanza los chars visibles del mensaje en `stream` hasta completarlo.
  useEffect(() => {
    if (!stream) return;
    const msg = messages.find((x) => x.id === stream.id);
    const full = msg?.text ?? '';
    if (stream.shown >= full.length) {
      setStream(null);
      return;
    }
    const t = setTimeout(() => {
      setStream((s) =>
        s && s.id === stream.id ? { ...s, shown: Math.min(full.length, s.shown + 1) } : s,
      );
    }, 22);
    return () => clearTimeout(t);
  }, [stream, messages]);

  useEffect(() => {
    if (!channelKey) return;
    const s = io(`${SOCKET_URL}/webchat`, {
      auth: { channelKey, visitorId },
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = s;
    s.on('ready', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));
    s.on('typing', (p: { typing?: boolean }) => setTyping(!!p?.typing));
    s.on('message', (m: WcMessage) => {
      setTyping(false);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, direction: 'in' }]));
      // Arranca el typewriter solo para texto (botones/medios aparecen al terminar).
      if (m.type === 'text' && typeof m.text === 'string' && m.text.length > 0) {
        setStream({ id: m.id, shown: 0 });
      }
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [channelKey, visitorId]);

  const sendText = useCallback(() => {
    const text = body.trim();
    if (!text || !socketRef.current || !connected) return;
    socketRef.current.emit('message', { text });
    setMessages((prev) => [...prev, { id: `out_${Date.now()}`, direction: 'out', type: 'text', text }]);
    setTyping(true);
    setBody('');
  }, [body, connected]);

  function clickButton(buttonId: string, title: string) {
    if (!socketRef.current || !connected) return;
    socketRef.current.emit('message', { buttonId, text: title });
    setMessages((prev) => [...prev, { id: `out_${Date.now()}`, direction: 'out', type: 'text', text: title }]);
    setTyping(true);
  }

  /** Nueva conversación: rota el visitorId (el useEffect reconecta) y limpia el chat. */
  const resetConversation = useCallback(() => {
    if (!channelKey) return;
    setMessages([]);
    setVisitorId(rotateVisitorId(channelKey));
  }, [channelKey]);

  function close() {
    try {
      window.parent.postMessage({ massivo: 'close' }, '*');
    } catch {
      // no-op (no embebido)
    }
  }

  if (!channelKey) {
    return <div style={S.error}>Falta la widget key (?key=...)</div>;
  }

  return (
    <div style={S.root}>
      <style>{WC_CSS}</style>
      <div style={S.header}>
        <span style={S.headerTitle}>Chat</span>
        <span style={{ ...S.dot, background: connected ? '#34D399' : '#9CA3AF' }} />
        <button
          type="button"
          aria-label="Reiniciar conversación"
          title="Reiniciar conversación"
          style={S.resetBtn}
          onClick={resetConversation}
        >
          ↻
        </button>
        <button type="button" aria-label="Cerrar" style={S.closeBtn} onClick={close}>
          ✕
        </button>
      </div>

      <div style={S.body}>
        {messages.length === 0 ? (
          <div style={S.empty}>¡Hola! ¿En qué te ayudamos?</div>
        ) : (
          messages.map((m) => {
            const streamShown = stream && stream.id === m.id ? stream.shown : null;
            const streaming = streamShown !== null;
            const shownText = streaming ? (m.text ?? '').slice(0, streamShown) : m.text;
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'out' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%' }}>
                  <div style={m.direction === 'out' ? S.bubbleOut : S.bubbleIn}>
                    {shownText || (m.type === 'media' ? `[${m.mediaType}] ${m.caption ?? ''}` : '')}
                    {streaming && <span className="wc-caret">▍</span>}
                  </div>
                  {!streaming && m.type === 'buttons' && m.buttons && (
                    <div style={S.buttonsRow}>
                      {m.buttons.map((b) => (
                        <button key={b.id} type="button" style={S.quickReply} onClick={() => clickButton(b.id, b.title)}>
                          {b.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ ...S.bubbleIn, ...S.typingBubble }}>
              <span className="wc-dot" />
              <span className="wc-dot" />
              <span className="wc-dot" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={S.inputRow}>
        <textarea
          style={S.textarea}
          rows={1}
          placeholder="Escribí tu mensaje…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
        />
        <button type="button" style={S.sendBtn} onClick={sendText} disabled={!connected || !body.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    background: '#fff',
    color: '#111827',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    background: BRAND,
    color: '#fff',
    fontWeight: 600,
  },
  headerTitle: { flex: 1, fontSize: 15 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  resetBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 17,
    lineHeight: 1,
    opacity: 0.9,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    opacity: 0.9,
  },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: '#F9FAFB' },
  empty: { margin: 'auto', color: '#6B7280', fontSize: 14, textAlign: 'center' },
  bubbleIn: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: '8px 12px',
    fontSize: 14,
    whiteSpace: 'pre-wrap',
  },
  typingBubble: { display: 'inline-flex', alignItems: 'center', padding: '10px 12px' },
  bubbleOut: {
    background: BRAND,
    color: '#fff',
    borderRadius: 12,
    padding: '8px 12px',
    fontSize: 14,
    whiteSpace: 'pre-wrap',
  },
  buttonsRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  quickReply: {
    background: '#fff',
    border: `1px solid ${BRAND}`,
    color: BRAND,
    borderRadius: 16,
    padding: '5px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  inputRow: { display: 'flex', alignItems: 'flex-end', gap: 8, padding: 10, borderTop: '1px solid #E5E7EB', background: '#fff' },
  textarea: {
    flex: 1,
    resize: 'none',
    border: '1px solid #D1D5DB',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    maxHeight: 96,
  },
  sendBtn: {
    background: BRAND,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    width: 38,
    height: 38,
    cursor: 'pointer',
    fontSize: 16,
    flexShrink: 0,
  },
  error: { padding: 16, fontFamily: 'system-ui, sans-serif', color: '#B91C1C' },
};
