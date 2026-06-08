import { useEffect, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './Sidebar';
import { useColorMode } from '../theme/ThemeProvider';

const COLLAPSED_KEY = 'massivo:sidebarCollapsed';
const TOPBAR_HEIGHT = 56;

export function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggleMode } = useColorMode();
  const isFullBleed =
    location.pathname.startsWith('/dashboard/inbox') ||
    location.pathname.startsWith('/dashboard/bots') ||
    location.pathname.startsWith('/dashboard/dev/wapi/chat') ||
    // Chats de prueba de canales (Messenger/IG/Webchat): alto fijo, scroll interno.
    location.pathname.startsWith('/dashboard/dev/channels/');

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Topbar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ minHeight: `${TOPBAR_HEIGHT}px !important`, gap: 1, px: { xs: 1, sm: 2 } }}>
          {!isDesktop && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
              <MenuIcon />
            </IconButton>
          )}
          <Box
            onClick={() => navigate('/dashboard')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              cursor: 'pointer',
              px: 1,
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
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
            <Typography variant="h6" fontWeight={700} sx={{ display: { xs: 'none', sm: 'block' } }}>
              Massivo
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
            <IconButton size="small" onClick={toggleMode}>
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Box sx={{ ml: 1 }}>
            <UserButton afterSignOutUrl="/sign-in" />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Body row */}
      <Box sx={{ display: 'flex', flex: 1, mt: `${TOPBAR_HEIGHT}px`, minHeight: 0 }}>
        {/* Desktop persistent sidebar */}
        {isDesktop && (
          <Box
            component="nav"
            sx={{
              width: sidebarWidth,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              position: 'sticky',
              top: TOPBAR_HEIGHT,
              height: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
              bgcolor: 'background.paper',
              transition: theme.transitions.create('width', {
                duration: theme.transitions.duration.shortest,
              }),
            }}
          >
            <Sidebar
              collapsed={collapsed}
              onToggleCollapsed={() => setCollapsed((c) => !c)}
            />
          </Box>
        )}

        {/* Mobile drawer (full sidebar) */}
        {!isDesktop && (
          <Drawer
            anchor="left"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            PaperProps={{
              sx: { width: SIDEBAR_WIDTH, top: TOPBAR_HEIGHT, height: `calc(100% - ${TOPBAR_HEIGHT}px)` },
            }}
          >
            <Sidebar
              showCollapseButton={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </Drawer>
        )}

        {/* Main */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            ...(isFullBleed
              ? {
                  height: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  p: { xs: 1, sm: 1.5, md: 2 },
                }
              : {
                  px: { xs: 2, sm: 3, md: 4 },
                  py: { xs: 2, sm: 3, md: 4 },
                }),
          }}
        >
          {isFullBleed ? (
            <Outlet />
          ) : (
            <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
              <Outlet />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
