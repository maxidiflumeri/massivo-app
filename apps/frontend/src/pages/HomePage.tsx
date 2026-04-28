import { Box, Container, Typography, Button, Stack, useTheme } from '@mui/material';
import { useColorMode } from '../theme/ThemeProvider';

export function HomePage() {
  const theme = useTheme();
  const { mode, toggleMode } = useColorMode();

  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Typography variant="h2" fontWeight={700}>
          Massivo App
        </Typography>
        <Typography variant="h6" color="text.secondary">
          SaaS multi-tenant de envío masivo multicanal — WhatsApp Business API + Email.
        </Typography>
        <Typography variant="body1">
          Fase 0 — Setup base. Tema activo: <strong>{theme.palette.mode}</strong>.
        </Typography>
        <Box>
          <Button variant="contained" onClick={toggleMode}>
            Cambiar a modo {mode === 'light' ? 'oscuro' : 'claro'}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
