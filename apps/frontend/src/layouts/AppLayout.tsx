import { Box, AppBar, Toolbar, Typography, Container, Button, useTheme } from '@mui/material';
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { Outlet, NavLink } from 'react-router-dom';

export function AppLayout() {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <AppBar position="static" color="transparent" elevation={1} sx={{ backgroundColor: theme.palette.background.paper }}>
        <Toolbar sx={{ justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
              Massivo App
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button component={NavLink} to="/dashboard/email/campaigns" color="inherit">
                Campañas
              </Button>
              <Button component={NavLink} to="/dashboard/email/templates" color="inherit">
                Templates
              </Button>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <OrganizationSwitcher 
              hidePersonal={false} 
              afterCreateOrganizationUrl="/dashboard"
              afterLeaveOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
            />
            <UserButton afterSignOutUrl="/sign-in" />
          </Box>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ flexGrow: 1, py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
