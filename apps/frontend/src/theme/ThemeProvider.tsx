import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createTheme, CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';

type ColorMode = 'light' | 'dark';

interface ColorModeContextValue {
  mode: ColorMode;
  toggleMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(() => {
    const stored = localStorage.getItem('massivo:colorMode');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const value = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      toggleMode: () =>
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          localStorage.setItem('massivo:colorMode', next);
          return next;
        }),
    }),
    [mode],
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: '#5B5BD6' },
          secondary: { main: '#10B981' },
        },
        shape: { borderRadius: 10 },
      }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within ThemeProvider');
  return ctx;
}
