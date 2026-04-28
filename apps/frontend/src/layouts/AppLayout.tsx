import { Box, AppBar, Toolbar, Typography, Container, useTheme } from '@mui/material';
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { Outlet } from 'react-router-dom';

export function AppLayout() {
  const theme = useTheme();
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <AppBar position="static" color="transparent" elevation={1} sx={{ backgroundColor: theme.palette.background.paper }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
            Massivo App
          </Typography>
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
