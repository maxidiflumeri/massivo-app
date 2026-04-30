import { type ReactElement } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import DescriptionIcon from '@mui/icons-material/Description';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContactsIcon from '@mui/icons-material/Contacts';
import SettingsIcon from '@mui/icons-material/Settings';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { useColorMode } from '../theme/ThemeProvider';

export const SIDEBAR_WIDTH = 264;

interface NavItemSpec {
  to?: string;
  label: string;
  icon: ReactElement;
  disabled?: boolean;
}

interface NavGroupSpec {
  label: string;
  items: NavItemSpec[];
}

const NAV_GROUPS: NavGroupSpec[] = [
  {
    label: 'Email',
    items: [
      { to: '/dashboard/email/campaigns', label: 'Campañas', icon: <CampaignIcon fontSize="small" /> },
      { to: '/dashboard/email/templates', label: 'Templates', icon: <DescriptionIcon fontSize="small" /> },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      { label: 'Campañas', icon: <WhatsAppIcon fontSize="small" />, disabled: true },
      { label: 'Templates', icon: <DescriptionIcon fontSize="small" />, disabled: true },
    ],
  },
  {
    label: 'Datos',
    items: [
      { label: 'Contactos', icon: <ContactsIcon fontSize="small" />, disabled: true },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      { label: 'Configuración', icon: <SettingsIcon fontSize="small" />, disabled: true },
    ],
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const { mode, toggleMode } = useColorMode();

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      {/* Brand */}
      <Box
        sx={{
          px: 3,
          py: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
        }}
        onClick={() => {
          navigate('/dashboard');
          onNavigate?.();
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #5B5BD6 0%, #8B5BD6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'common.white',
            boxShadow: '0 4px 12px rgba(91, 91, 214, 0.35)',
          }}
        >
          <SendRoundedIcon fontSize="small" />
        </Box>
        <Box>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.1}>
            Massivo
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Multichannel sender
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Org switcher */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <OrganizationSwitcher
          hidePersonal={false}
          afterCreateOrganizationUrl="/dashboard"
          afterLeaveOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: { width: '100%' },
              organizationSwitcherTrigger: { width: '100%', justifyContent: 'flex-start' },
            },
          }}
        />
      </Box>

      <Divider />

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5, px: 1.5 }}>
        <Stack spacing={2}>
          {NAV_GROUPS.map((group) => (
            <Box key={group.label}>
              <Typography
                variant="overline"
                sx={{
                  px: 1.5,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.5,
                }}
              >
                {group.label}
              </Typography>
              <Stack spacing={0.25}>
                {group.items.map((item) => {
                  const content = (
                    <>
                      <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                      />
                    </>
                  );
                  if (item.disabled || !item.to) {
                    return (
                      <ListItemButton
                        key={item.label}
                        disabled
                        sx={{
                          borderRadius: 1.5,
                          py: 0.75,
                          px: 1.5,
                        }}
                      >
                        {content}
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                          pronto
                        </Typography>
                      </ListItemButton>
                    );
                  }
                  return (
                    <ListItemButton
                      key={item.label}
                      component={NavLink}
                      to={item.to}
                      onClick={() => onNavigate?.()}
                      sx={{
                        borderRadius: 1.5,
                        py: 0.75,
                        px: 1.5,
                        color: 'text.secondary',
                        '&:hover': {
                          bgcolor: 'action.hover',
                          color: 'text.primary',
                        },
                        '&.active': {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          '&:hover': {
                            bgcolor: 'primary.dark',
                          },
                          '& .MuiListItemIcon-root': { color: 'inherit' },
                        },
                      }}
                    >
                      {content}
                    </ListItemButton>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>

      <Divider />

      {/* Footer: user + theme toggle */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <UserButton afterSignOutUrl="/sign-in" />
        <Tooltip title={mode === 'light' ? 'Modo oscuro' : 'Modo claro'}>
          <IconButton size="small" onClick={toggleMode}>
            {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
