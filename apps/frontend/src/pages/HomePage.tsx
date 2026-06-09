import { type ReactElement } from 'react';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import { brand } from '../brand';
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BoltIcon from '@mui/icons-material/Bolt';
import GroupsIcon from '@mui/icons-material/Groups';
import InsightsIcon from '@mui/icons-material/Insights';
import LockIcon from '@mui/icons-material/Lock';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { useColorMode } from '../theme/ThemeProvider';

interface Feature {
  icon: ReactElement;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <EmailIcon />,
    title: 'Email transaccional y marketing',
    description:
      'Diseñá con editor drag & drop (Unlayer), enviá vía SMTP o SES, tracking de aperturas y clicks.',
  },
  {
    icon: <WhatsAppIcon />,
    title: 'WhatsApp Business API',
    description:
      'Plantillas aprobadas por Meta, envíos masivos con rate limiting y opt-out automático.',
  },
  {
    icon: <BoltIcon />,
    title: 'Realtime dashboards',
    description:
      'Estado de cada envío en vivo vía WebSockets, con eventos debounced para no saturar la UI.',
  },
  {
    icon: <GroupsIcon />,
    title: 'Multi-tenant nativo',
    description:
      'Aislamiento por organización y team, RBAC granular con CASL, plan flags por suscripción.',
  },
  {
    icon: <InsightsIcon />,
    title: 'Analytics integradas',
    description:
      'Conteos por estado, opens y clicks únicos, supresiones automáticas por bounce y complaint.',
  },
  {
    icon: <LockIcon />,
    title: 'Seguro por diseño',
    description:
      'Auth con Clerk, tenant scoping a nivel Prisma, webhooks firmados, secretos cifrados.',
  },
];

const BENEFITS = [
  'Editor visual de plantillas con variables Handlebars',
  'Cargá contactos por CSV con un paste',
  'Suscripción a eventos en tiempo real (sin polling)',
  'Onboarding automático vía Clerk webhooks',
  'Roles por organización y por team',
  'Stack moderno: NestJS, Prisma, React 19, MUI',
];

export function HomePage() {
  const theme = useTheme();
  const { mode, toggleMode } = useColorMode();
  const isDark = mode === 'dark';

  return (
    <>
      <SignedIn>
        <Navigate to="/dashboard" replace />
      </SignedIn>
      <SignedOut>
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          backgroundImage: isDark
            ? 'radial-gradient(ellipse at top, rgba(91,91,214,0.18), transparent 60%)'
            : 'radial-gradient(ellipse at top, rgba(91,91,214,0.10), transparent 60%)',
        }}
      >
        {/* Navbar */}
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backdropFilter: 'blur(12px)',
            bgcolor: isDark ? 'rgba(20,23,28,0.72)' : 'rgba(255,255,255,0.72)',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', height: 64, gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  background: 'linear-gradient(135deg, #5B5BD6 0%, #8B5BD6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'common.white',
                  boxShadow: '0 4px 12px rgba(91,91,214,0.35)',
                }}
              >
                <SendRoundedIcon sx={{ fontSize: 18 }} />
              </Box>
              <Typography variant="h6" fontWeight={700}>
                {brand.name}
              </Typography>
            </Box>
            <Tooltip title={isDark ? 'Modo claro' : 'Modo oscuro'}>
              <IconButton size="small" onClick={toggleMode}>
                {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Button component={RouterLink} to="/sign-in" color="inherit">
              Iniciar sesión
            </Button>
            <Button component={RouterLink} to="/sign-up" variant="contained">
              Empezar
            </Button>
          </Container>
        </Box>

        {/* Hero */}
        <Container maxWidth="lg" sx={{ py: { xs: 8, md: 14 } }}>
          <Stack spacing={4} sx={{ maxWidth: 880, mx: 'auto', textAlign: 'center' }}>
            <Box
              sx={{
                alignSelf: 'center',
                px: 1.75,
                py: 0.5,
                borderRadius: 999,
                border: 1,
                borderColor: 'divider',
                bgcolor: isDark ? 'rgba(91,91,214,0.12)' : 'rgba(91,91,214,0.06)',
                fontSize: 13,
                fontWeight: 500,
                color: 'primary.main',
              }}
            >
              ✨ Multi-tenant SaaS para envíos masivos
            </Box>
            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: 40, sm: 56, md: 68 },
                lineHeight: 1.05,
                letterSpacing: -1.5,
                background: isDark
                  ? 'linear-gradient(180deg, #ffffff 0%, #9aa3ad 100%)'
                  : 'linear-gradient(180deg, #0f172a 0%, #64748b 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Email y WhatsApp masivos,
              <br />
              sin la fricción de siempre.
            </Typography>
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{ fontWeight: 400, maxWidth: 680, mx: 'auto' }}
            >
              Diseñá, segmentá y enviá campañas a miles de contactos con tracking en tiempo real,
              plantillas Meta y supresiones automáticas — todo en un workspace por equipo.
            </Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="center"
              sx={{ pt: 1 }}
            >
              <Button
                component={RouterLink}
                to="/sign-up"
                size="large"
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                sx={{ px: 3, py: 1.5, fontSize: 16 }}
              >
                Crear cuenta gratis
              </Button>
              <Button
                component={RouterLink}
                to="/sign-in"
                size="large"
                variant="outlined"
                sx={{ px: 3, py: 1.5, fontSize: 16 }}
              >
                Iniciar sesión
              </Button>
            </Stack>
          </Stack>
        </Container>

        {/* Features */}
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
          <Stack spacing={1.5} sx={{ textAlign: 'center', mb: 6 }}>
            <Typography variant="overline" color="primary.main" fontWeight={600}>
              Capacidades
            </Typography>
            <Typography variant="h3" fontWeight={700} sx={{ fontSize: { xs: 28, md: 40 } }}>
              Todo lo que tu equipo necesita
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
              Una stack pensada para escalar de 100 a 100.000 envíos sin reescribir nada.
            </Typography>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
            }}
          >
            {FEATURES.map((f) => (
              <Paper
                key={f.title}
                variant="outlined"
                sx={{
                  p: 3,
                  borderRadius: 3,
                  transition: 'all .2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                    boxShadow: theme.shadows[4],
                  },
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(91,91,214,0.18)' : 'rgba(91,91,214,0.08)',
                    color: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2,
                  }}
                >
                  {f.icon}
                </Box>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  {f.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {f.description}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Container>

        {/* Benefits + CTA */}
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
          <Paper
            sx={{
              p: { xs: 4, md: 6 },
              borderRadius: 4,
              background: isDark
                ? 'linear-gradient(135deg, rgba(91,91,214,0.18) 0%, rgba(139,91,214,0.18) 100%)'
                : 'linear-gradient(135deg, rgba(91,91,214,0.08) 0%, rgba(139,91,214,0.08) 100%)',
              border: 1,
              borderColor: 'divider',
            }}
            elevation={0}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={4}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                  Listo para enviar tu primera campaña
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                  Onboarding en menos de 2 minutos. No pedimos tarjeta.
                </Typography>
                <Stack spacing={1}>
                  {BENEFITS.map((b) => (
                    <Stack key={b} direction="row" alignItems="center" spacing={1}>
                      <CheckCircleIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                      <Typography variant="body2">{b}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
              <Stack spacing={1.5} sx={{ minWidth: { md: 240 } }}>
                <Button
                  component={RouterLink}
                  to="/sign-up"
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForwardIcon />}
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  Crear cuenta gratis
                </Button>
                <Button
                  component={RouterLink}
                  to="/sign-in"
                  variant="outlined"
                  size="large"
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  Ya tengo cuenta
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Container>

        {/* Footer */}
        <Box
          component="footer"
          sx={{
            borderTop: 1,
            borderColor: 'divider',
            py: 3,
            mt: 4,
          }}
        >
          <Container
            maxWidth="lg"
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} {brand.name} · {brand.tagline}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hecho con NestJS · Prisma · React · MUI
            </Typography>
          </Container>
        </Box>
      </Box>
      </SignedOut>
    </>
  );
}
