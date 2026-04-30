import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import DescriptionIcon from '@mui/icons-material/Description';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useUser } from '@clerk/clerk-react';

export function DashboardHome() {
  const { user } = useUser();
  const greeting = user?.firstName ? `Hola, ${user.firstName}` : 'Bienvenido';

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          {greeting} 👋
        </Typography>
        <Typography color="text.secondary">
          Empezá creando un template o lanzando una nueva campaña.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
        }}
      >
        <ActionCard
          to="/dashboard/email/campaigns"
          icon={<CampaignIcon />}
          title="Campañas de email"
          description="Configurá envíos masivos con tracking y reportes en tiempo real."
        />
        <ActionCard
          to="/dashboard/email/templates"
          icon={<DescriptionIcon />}
          title="Templates"
          description="Diseñá emails con el editor drag & drop y variables Handlebars."
        />
      </Box>
    </Stack>
  );
}

function ActionCard({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactElement;
  title: string;
  description: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 3,
        transition: 'all .2s',
        '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      <Button
        component={RouterLink}
        to={to}
        endIcon={<ArrowForwardIcon />}
        sx={{ pl: 0 }}
      >
        Ir
      </Button>
    </Paper>
  );
}
