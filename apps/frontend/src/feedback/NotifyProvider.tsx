import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert, Snackbar } from '@mui/material';

type Severity = 'success' | 'info' | 'warning' | 'error';

interface NotifyState {
  open: boolean;
  message: string;
  severity: Severity;
  key: number;
}

interface NotifyApi {
  notify: (message: string, severity?: Severity) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const NotifyContext = createContext<NotifyApi | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NotifyState>({
    open: false,
    message: '',
    severity: 'info',
    key: 0,
  });

  const notify = useCallback((message: string, severity: Severity = 'info') => {
    setState({ open: true, message, severity, key: Date.now() });
  }, []);

  const api = useMemo<NotifyApi>(
    () => ({
      notify,
      success: (m) => notify(m, 'success'),
      error: (m) => notify(m, 'error'),
      info: (m) => notify(m, 'info'),
      warning: (m) => notify(m, 'warning'),
    }),
    [notify],
  );

  return (
    <NotifyContext.Provider value={api}>
      {children}
      <Snackbar
        key={state.key}
        open={state.open}
        autoHideDuration={state.severity === 'error' ? 8000 : 4000}
        onClose={() => setState((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={state.severity}
          variant="filled"
          onClose={() => setState((s) => ({ ...s, open: false }))}
          sx={{ minWidth: 280 }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyApi {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify debe usarse dentro de NotifyProvider');
  return ctx;
}
