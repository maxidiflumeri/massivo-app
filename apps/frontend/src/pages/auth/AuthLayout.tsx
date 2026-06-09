import { Box, Typography, useTheme } from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { brand } from '../../brand';
import { Link as RouterLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Layout compartido por SignIn y SignUp.
 *
 * - Centra el widget de Clerk de verdad (override del `rootBox: width 100%`
 *   global en ClerkWithTheme).
 * - Fondo dark con halo radial brand + grilla sutil estilo Linear/Vercel.
 * - Logo Massivo arriba + título y subtítulo encima del widget.
 */
export function AuthLayout({ title, subtitle, children }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 6,
        overflow: 'hidden',
        background: isDark ? '#0a0a0a' : '#f6f7fb',
      }}
    >
      {/* Halo radial morado brand */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: isDark
            ? 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(91,91,214,0.25) 0%, rgba(139,91,214,0.08) 40%, transparent 70%)'
            : 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(91,91,214,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Grilla de fondo sutil */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: isDark
            ? `linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
               linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)`
            : `linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),
               linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 75%)',
        }}
      />

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {/* Logo */}
        <Box
          component={RouterLink}
          to="/"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            textDecoration: 'none',
            color: isDark ? '#f5f5f5' : '#0a0a0a',
            mb: 1,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg, #5B5BD6 0%, #8B5BD6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'common.white',
              boxShadow: '0 4px 16px rgba(91,91,214,0.4)',
            }}
          >
            <SendRoundedIcon sx={{ fontSize: 20 }} />
          </Box>
          <Typography variant="h5" fontWeight={700} sx={{ letterSpacing: '-0.01em' }}>
            {brand.name}
          </Typography>
        </Box>

        {/* Header del widget */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="h4"
            fontWeight={600}
            sx={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}
          >
            {title}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mt: 1.5,
              color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
            }}
          >
            {subtitle}
          </Typography>
        </Box>

        {/* Widget de Clerk */}
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            '& .cl-rootBox': {
              width: '100% !important',
              display: 'flex !important',
              flexDirection: 'column !important',
              alignItems: 'center !important',
            },
            '& .cl-card': {
              width: '100% !important',
              margin: '0 !important',
              background: isDark
                ? 'rgba(20, 20, 28, 0.72) !important'
                : 'rgba(255, 255, 255, 0.92) !important',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: isDark
                ? '1px solid rgba(255,255,255,0.08) !important'
                : '1px solid rgba(0,0,0,0.06) !important',
              borderRadius: '16px !important',
              boxShadow: isDark
                ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 8px rgba(0,0,0,0.4), 0 16px 32px -8px rgba(0,0,0,0.7), 0 40px 80px -16px rgba(0,0,0,0.85), 0 24px 60px -12px rgba(91,91,214,0.45) !important'
                : '0 1px 0 rgba(255,255,255,0.8) inset, 0 2px 8px rgba(15,23,42,0.08), 0 16px 32px -8px rgba(15,23,42,0.18), 0 40px 80px -16px rgba(15,23,42,0.28), 0 24px 60px -12px rgba(91,91,214,0.3) !important',
            },
            '& .cl-footer': {
              background: 'transparent !important',
              borderTop: 'none !important',
            },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
