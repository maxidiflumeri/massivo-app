import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { TeamProvider } from './team/TeamContext';

import { ClerkProvider } from '@clerk/clerk-react';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPubKey) {
  throw new Error('Falta VITE_CLERK_PUBLISHABLE_KEY en .env');
}

createRoot(rootEl).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPubKey} appearance={{ elements: { rootBox: { display: 'flex', justifyContent: 'center', width: '100%' } } }}>
      <ThemeProvider>
        <TeamProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </TeamProvider>
      </ThemeProvider>
    </ClerkProvider>
  </StrictMode>,
);
