import { createRoot } from 'react-dom/client';
import { WebchatWidget } from './WebchatWidget';

/**
 * Entry standalone del widget de Webchat (entrada Vite `webchat.html`, separada del
 * dashboard). Es el contenido del iframe que inyecta el loader `public/webchat/v1.js`
 * en el sitio del cliente. Público: NO usa Clerk ni MUI (bundle liviano). La widget
 * key llega por query (`?key=wc_...`).
 */
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const channelKey = new URLSearchParams(window.location.search).get('key') ?? '';
createRoot(rootEl).render(<WebchatWidget channelKey={channelKey} />);
