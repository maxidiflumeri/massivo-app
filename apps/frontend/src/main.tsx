import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ColorModeProvider, MuiThemeWithMode } from './theme/ThemeProvider';
import { ClerkWithTheme } from './theme/ClerkWithTheme';
import { TeamProvider } from './team/TeamContext';
import { NotifyProvider } from './feedback/NotifyProvider';
import { ConfirmProvider } from './feedback/ConfirmProvider';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPubKey) {
  throw new Error('Falta VITE_CLERK_PUBLISHABLE_KEY en .env');
}

createRoot(rootEl).render(
  <StrictMode>
    <ColorModeProvider>
      <MuiThemeWithMode>
        <ClerkWithTheme publishableKey={clerkPubKey}>
          <NotifyProvider>
            <ConfirmProvider>
              <TeamProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </TeamProvider>
            </ConfirmProvider>
          </NotifyProvider>
        </ClerkWithTheme>
      </MuiThemeWithMode>
    </ColorModeProvider>
  </StrictMode>,
);
