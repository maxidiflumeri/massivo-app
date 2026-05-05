import { useEffect, useState, type ReactElement } from 'react';
import { Collapse } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { NavLink } from 'react-router-dom';
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
import DnsIcon from '@mui/icons-material/Dns';
import BlockIcon from '@mui/icons-material/Block';
import InsightsIcon from '@mui/icons-material/Insights';
import HomeIcon from '@mui/icons-material/Home';
import InboxIcon from '@mui/icons-material/Inbox';
import BoltIcon from '@mui/icons-material/Bolt';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ScienceIcon from '@mui/icons-material/Science';
import ForumIcon from '@mui/icons-material/Forum';
import { OrganizationSwitcher } from '@clerk/clerk-react';

const DEV_SIMULATOR_ENABLED = import.meta.env.VITE_ENABLE_DEV_SIMULATOR === 'true';

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_COLLAPSED_WIDTH = 64;
const GROUP_STATE_KEY = 'massivo:sidebarGroups';

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
    label: 'General',
    items: [{ to: '/dashboard', label: 'Inicio', icon: <HomeIcon fontSize="small" /> }],
  },
  {
    label: 'Email',
    items: [
      {
        to: '/dashboard/email/campaigns',
        label: 'Campañas',
        icon: <CampaignIcon fontSize="small" />,
      },
      {
        to: '/dashboard/email/templates',
        label: 'Templates',
        icon: <DescriptionIcon fontSize="small" />,
      },
      {
        to: '/dashboard/email/smtp-accounts',
        label: 'Cuentas SMTP',
        icon: <DnsIcon fontSize="small" />,
      },
      {
        to: '/dashboard/email/suppressions',
        label: 'Desuscriptos',
        icon: <BlockIcon fontSize="small" />,
      },
      {
        to: '/dashboard/email/metrics',
        label: 'Métricas',
        icon: <InsightsIcon fontSize="small" />,
      },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      {
        to: '/dashboard/wapi/inbox',
        label: 'Inbox',
        icon: <InboxIcon fontSize="small" />,
      },
      {
        to: '/dashboard/wapi/campaigns',
        label: 'Campañas',
        icon: <WhatsAppIcon fontSize="small" />,
      },
      {
        to: '/dashboard/wapi/templates',
        label: 'Templates',
        icon: <DescriptionIcon fontSize="small" />,
      },
      {
        to: '/dashboard/wapi/quick-replies',
        label: 'Respuestas rápidas',
        icon: <BoltIcon fontSize="small" />,
      },
      {
        to: '/dashboard/wapi/configs',
        label: 'Números',
        icon: <DnsIcon fontSize="small" />,
      },
    ],
  },
  {
    label: 'Datos',
    items: [{ label: 'Contactos', icon: <ContactsIcon fontSize="small" />, disabled: true }],
  },
  {
    label: 'Cuenta',
    items: [{ label: 'Configuración', icon: <SettingsIcon fontSize="small" />, disabled: true }],
  },
  ...(DEV_SIMULATOR_ENABLED
    ? [
        {
          label: 'Dev',
          items: [
            {
              to: '/dashboard/dev/wapi/chat',
              label: 'Chat simulado',
              icon: <ForumIcon fontSize="small" />,
            },
            {
              to: '/dashboard/dev/wapi/simulator',
              label: 'Simulador WhatsApp',
              icon: <ScienceIcon fontSize="small" />,
            },
          ],
        } as NavGroupSpec,
      ]
    : []),
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  showCollapseButton?: boolean;
}

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  showCollapseButton = true,
}: SidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(GROUP_STATE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // no-op
    }
    return Object.fromEntries(NAV_GROUPS.map((g) => [g.label, true]));
  });

  useEffect(() => {
    localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !(prev[label] ?? true) }));

  return (
    <Box
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        transition: (t) =>
          t.transitions.create('width', {
            easing: t.transitions.easing.sharp,
            duration: t.transitions.duration.shortest,
          }),
        overflow: 'hidden',
      }}
    >
      {/* Org switcher (oculto cuando colapsado) */}
      {!collapsed && (
        <>
          <Box sx={{ px: 2, py: 1.5 }}>
            <OrganizationSwitcher
              hidePersonal={false}
              afterCreateOrganizationUrl="/dashboard"
              afterLeaveOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              appearance={{
                elements: {
                  rootBox: { width: '100%' },
                  organizationSwitcherTrigger: {
                    width: '100%',
                    justifyContent: 'flex-start',
                    padding: '8px 10px',
                  },
                },
              }}
            />
          </Box>
          <Divider />
        </>
      )}

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5, px: collapsed ? 0.75 : 1.25 }}>
        <Stack spacing={collapsed ? 0.5 : 2}>
          {NAV_GROUPS.map((group, idx) => {
            const isOpen = openGroups[group.label] ?? true;
            return (
              <Box key={group.label}>
                {!collapsed && (
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleGroup(group.label)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleGroup(group.label);
                      }
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1.5,
                      mb: 0.5,
                      cursor: 'pointer',
                      borderRadius: 1,
                      userSelect: 'none',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: 0.6,
                        color: 'text.secondary',
                        lineHeight: 1.6,
                      }}
                    >
                      {group.label}
                    </Typography>
                    {isOpen ? (
                      <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    ) : (
                      <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    )}
                  </Box>
                )}
                {collapsed && idx > 0 && <Divider sx={{ my: 0.75, mx: 0.5 }} />}
                {collapsed ? (
                  <Stack spacing={0.25}>
                    {group.items.map((item) => (
                      <NavRow
                        key={item.label}
                        item={item}
                        collapsed={collapsed}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Collapse in={isOpen} timeout={180} unmountOnExit>
                    <Stack spacing={0.25}>
                      {group.items.map((item) => (
                        <NavRow
                          key={item.label}
                          item={item}
                          collapsed={collapsed}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </Stack>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* Collapse toggle (desktop only) */}
      {showCollapseButton && (
        <>
          <Divider />
          <Box
            sx={{
              p: 1,
              display: 'flex',
              justifyContent: collapsed ? 'center' : 'flex-end',
            }}
          >
            <Tooltip title={collapsed ? 'Expandir' : 'Colapsar'} placement="right">
              <IconButton size="small" onClick={onToggleCollapsed}>
                {collapsed ? (
                  <ChevronRightIcon fontSize="small" />
                ) : (
                  <ChevronLeftIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}
    </Box>
  );
}

function NavRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItemSpec;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const baseSx = {
    borderRadius: 1.5,
    py: 0.85,
    px: collapsed ? 1 : 1.5,
    minHeight: 40,
    justifyContent: collapsed ? 'center' : 'flex-start',
    color: 'text.secondary',
    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
    '&.active': {
      bgcolor: 'primary.main',
      color: 'primary.contrastText',
      '&:hover': { bgcolor: 'primary.dark' },
      '& .MuiListItemIcon-root': { color: 'inherit' },
    },
  } as const;

  const iconSx = {
    minWidth: collapsed ? 0 : 32,
    color: 'inherit',
    justifyContent: 'center',
  } as const;

  const button =
    item.disabled || !item.to ? (
      <ListItemButton disabled sx={baseSx}>
        <ListItemIcon sx={iconSx}>{item.icon}</ListItemIcon>
        {!collapsed && (
          <>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
            />
            <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
              pronto
            </Typography>
          </>
        )}
      </ListItemButton>
    ) : (
      <ListItemButton
        component={NavLink}
        to={item.to}
        end={item.to === '/dashboard'}
        onClick={() => onNavigate?.()}
        sx={baseSx}
      >
        <ListItemIcon sx={iconSx}>{item.icon}</ListItemIcon>
        {!collapsed && (
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
          />
        )}
      </ListItemButton>
    );

  if (collapsed) {
    return (
      <Tooltip title={item.label} placement="right" arrow>
        <span>{button}</span>
      </Tooltip>
    );
  }
  return button;
}
