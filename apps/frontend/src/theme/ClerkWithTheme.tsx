import { type ReactNode } from 'react';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { useColorMode } from './ThemeProvider';

interface Props {
  publishableKey: string;
  children: ReactNode;
}

export function ClerkWithTheme({ publishableKey, children }: Props) {
  const { mode } = useColorMode();
  const isDark = mode === 'dark';

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: '#5B5BD6',
          borderRadius: '10px',
          ...(isDark
            ? {
                colorBackground: '#14171c',
                colorText: '#e9ecef',
                colorTextSecondary: '#9aa3ad',
                colorInputBackground: '#1b1f26',
                colorInputText: '#e9ecef',
              }
            : {}),
        },
        elements: {
          rootBox: { width: '100%' },
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
