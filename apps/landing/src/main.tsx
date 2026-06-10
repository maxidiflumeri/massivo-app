import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import './index.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

// Webchat propio: solo se carga si el target define su key (massivo sí, rgbot aún no).
// El atributo data-massivo-key es el nombre que espera el loader v1.js (interno, no de marca).
const webchatKey = (import.meta.env.VITE_WEBCHAT_KEY as string | undefined)?.trim();
const panelUrl = (import.meta.env.VITE_PANEL_URL as string | undefined)?.trim();
if (webchatKey && panelUrl) {
  const s = document.createElement('script');
  s.src = `${panelUrl}/webchat/v1.js`;
  s.async = true;
  s.dataset.massivoKey = webchatKey;
  document.head.appendChild(s);
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    {clerkPubKey ? (
      <ClerkProvider publishableKey={clerkPubKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
