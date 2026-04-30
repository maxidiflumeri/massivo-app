import { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Outlet } from 'react-router-dom';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';

export function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      {/* Desktop permanent sidebar */}
      {isDesktop && (
        <Box
          component="nav"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            position: 'sticky',
            top: 0,
            height: '100vh',
          }}
        >
          <Sidebar />
        </Box>
      )}

      {/* Mobile drawer */}
      {!isDesktop && (
        <Drawer
          anchor="left"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: SIDEBAR_WIDTH } }}
        >
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      )}

      {/* Main column */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile top bar (only) */}
        {!isDesktop && (
          <AppBar
            position="sticky"
            color="transparent"
            elevation={0}
            sx={{
              backgroundColor: theme.palette.background.paper,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Toolbar>
              <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" sx={{ ml: 1, fontWeight: 700 }}>
                Massivo
              </Typography>
            </Toolbar>
          </AppBar>
        )}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            py: { xs: 2, sm: 4 },
            px: { xs: 2, sm: 4 },
            maxWidth: 1400,
            width: '100%',
            mx: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
