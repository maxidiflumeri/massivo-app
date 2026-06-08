import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const BRAND = '#5B5BD6';

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

function getVisitorId(channelKey: string): string {
  const k = `massivo:wc:visitor:${channelKey}`;
  try {
    const existing = localStorage.getItem(k);
    if (existing) return existing;
    const id = `wcv_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(k, id);
    return id;
  } catch {
    return `wcv_${Math.random().toString(36).slice(2, 12)}`;
  }
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
  const visitorId = useRef(channelKey ? getVisitorId(channelKey) : '').current;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    s.on('message', (m: WcMessage) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, direction: 'in' }]));
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
    setBody('');
  }, [body, connected]);

  function clickButton(buttonId: string, title: string) {
    if (!socketRef.current || !connected) return;
    socketRef.current.emit('message', { buttonId, text: title });
    setMessages((prev) => [...prev, { id: `out_${Date.now()}`, direction: 'out', type: 'text', text: title }]);
  }

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
      <div style={S.header}>
        <span style={S.headerTitle}>Chat</span>
        <span style={{ ...S.dot, background: connected ? '#34D399' : '#9CA3AF' }} />
        <button type="button" aria-label="Cerrar" style={S.closeBtn} onClick={close}>
          ✕
        </button>
      </div>

      <div style={S.body}>
        {messages.length === 0 ? (
          <div style={S.empty}>¡Hola! ¿En qué te ayudamos?</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'out' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%' }}>
                <div style={m.direction === 'out' ? S.bubbleOut : S.bubbleIn}>
                  {m.text || (m.type === 'media' ? `[${m.mediaType}] ${m.caption ?? ''}` : '')}
                </div>
                {m.type === 'buttons' && m.buttons && (
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
          ))
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
