import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import './index.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

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
