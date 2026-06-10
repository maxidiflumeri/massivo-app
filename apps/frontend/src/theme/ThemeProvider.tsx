import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createTheme,
  CssBaseline,
  ThemeProvider as MuiThemeProvider,
  GlobalStyles,
} from '@mui/material';
import { brand } from '../brand';

type ColorMode = 'light' | 'dark';

interface ColorModeContextValue {
  mode: ColorMode;
  toggleMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

function buildTheme(mode: ColorMode) {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: brand.colors.primary },
      secondary: { main: '#10B981' },
      ...(isDark
        ? {
            background: { default: '#0b0d10', paper: '#14171c' },
            divider: 'rgba(255,255,255,0.08)',
            text: {
              primary: '#e9ecef',
              secondary: '#9aa3ad',
              disabled: 'rgba(255,255,255,0.35)',
            },
          }
        : {
            background: { default: '#fafafa', paper: '#ffffff' },
            divider: 'rgba(0,0,0,0.08)',
            text: {
              primary: '#0f172a',
              secondary: '#64748b',
              disabled: 'rgba(0,0,0,0.35)',
            },
          }),
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: ({ ownerState }) => ({
            backgroundImage: 'none',
            ...(isDark &&
              ownerState.variant !== 'outlined' &&
              (ownerState.elevation ?? 1) > 0 && {
                boxShadow:
                  '0 1px 2px rgba(0,0,0,0.45), 0 6px 16px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.05)',
              }),
          }),
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            ...(isDark && {
              boxShadow:
                '0 1px 2px rgba(0,0,0,0.45), 0 6px 16px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.05)',
            }),
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarColor: isDark
              ? 'rgba(255,255,255,0.18) transparent'
              : 'rgba(0,0,0,0.22) transparent',
          },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.22)',
            borderRadius: 8,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.32)',
          },
          '::selection': {
            // Hex de 8 dígitos: primary de la marca con alpha ~35% (0x59)
            backgroundColor: `${brand.colors.primary}59`,
          },
        },
      },
    },
  });
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
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

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function MuiThemeWithMode({ children }: { children: ReactNode }) {
  const { mode } = useColorMode();
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{ 'html, body, #root': { height: '100%' } }} />
      {children}
    </MuiThemeProvider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider');
  return ctx;
}
