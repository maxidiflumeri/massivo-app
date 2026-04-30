import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface State {
  open: boolean;
  opts: ConfirmOptions;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    open: false,
    opts: { message: '' },
  });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setState({ open: true, opts });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state.open} onClose={() => close(false)} maxWidth="xs" fullWidth>
        {state.opts.title && <DialogTitle>{state.opts.title}</DialogTitle>}
        <DialogContent>
          <DialogContentText sx={{ whiteSpace: 'pre-line' }}>
            {state.opts.message}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => close(false)}>
            {state.opts.cancelText ?? 'Cancelar'}
          </Button>
          <Button
            variant="contained"
            color={state.opts.destructive ? 'error' : 'primary'}
            onClick={() => close(true)}
            autoFocus
          >
            {state.opts.confirmText ?? 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx;
}
