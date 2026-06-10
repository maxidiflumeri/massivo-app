import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Collapse } from '@mui/material';
import { brand } from '../brand';
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
  Badge,
} from '@mui/material';
import { useNotifications } from '../features/notifications/NotificationsProvider';
import CampaignIcon from '@mui/icons-material/Campaign';
import DescriptionIcon from '@mui/icons-material/Description';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContactsIcon from '@mui/icons-material/Contacts';
import SettingsIcon from '@mui/icons-material/Settings';
import DnsIcon from '@mui/icons-material/Dns';
import LanguageIcon from '@mui/icons-material/Language';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BlockIcon from '@mui/icons-material/Block';
import InsightsIcon from '@mui/icons-material/Insights';
import HomeIcon from '@mui/icons-material/Home';
import InboxIcon from '@mui/icons-material/Inbox';
import BoltIcon from '@mui/icons-material/Bolt';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ScienceIcon from '@mui/icons-material/Science';
import ForumIcon from '@mui/icons-material/Forum';
import ChatIcon from '@mui/icons-material/Chat';
import InstagramIcon from '@mui/icons-material/Instagram';
import HubIcon from '@mui/icons-material/Hub';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import HistoryIcon from '@mui/icons-material/History';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { OrganizationSwitcher, useOrganization } from '@clerk/clerk-react';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { PlanManagement } from '../features/billing/PlanManagement';
import { useApi } from '../api/client';

const DEV_SIMULATOR_ENABLED = import.meta.env.VITE_ENABLE_DEV_SIMULATOR === 'true';
// 4.O.1 — kill-switch del feature de bots (env). El backend además valida
// `Organization.botEnabled`; acá sólo ocultamos el item del sidebar para
// orgs sin la feature contratada (mostramos siempre si env está prendido —
// el backend devuelve 403 si la org no la tiene y la página lo refleja).
const WAPI_BOT_FEATURE_ENABLED = import.meta.env.VITE_WAPI_BOT_FEATURE_ENABLED === 'true';

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_COLLAPSED_WIDTH = 64;
const GROUP_STATE_KEY = 'massivo:sidebarGroups';

interface NavItemSpec {
  to?: string;
  /** URL externa — abre en nueva pestaña. Mutuamente excluyente con `to`. */
  href?: string;
  label: string;
  icon: ReactElement;
  disabled?: boolean;
}

interface NavGroupSpec {
  label: string;
  items: NavItemSpec[];
}

/** Flags de plan que gatean secciones del sidebar (vienen de /api/me/context). */
interface PlanNavFlags {
  bots: boolean;
  agents: boolean;
}

const buildNavGroups = (flags: PlanNavFlags): NavGroupSpec[] => [
  {
    label: 'General',
    items: [{ to: '/dashboard', label: 'Inicio', icon: <HomeIcon fontSize="small" /> }],
  },
  // Bots: entidad cross-canal (un bot se conecta a N canales) → sección propia,
  // fuera de WhatsApp. Gated por el kill-switch del feature (env) AND el plan
  // de la org activa (features.bot — FREE no lo trae).
  ...(WAPI_BOT_FEATURE_ENABLED && flags.bots
    ? [
        {
          label: 'Bots',
          items: [
            {
              to: '/dashboard/bots',
              label: 'Mis bots',
              icon: <SmartToyIcon fontSize="small" />,
            },
          ],
        },
      ]
    : []),
  // Agentes IA: plataforma agéntica (v0). Sección propia, NO mezclar con "Bots"
  // (flujos deterministas). Un agente se conecta a un canal y atiende con un LLM.
  // Gated por plan (features.ai vía permissions.hasAi — FREE no lo trae).
  ...(flags.agents
    ? [
        {
          label: 'Agentes',
          items: [
            {
              to: '/dashboard/agents',
              label: 'Mis agentes',
              icon: <AutoAwesomeIcon fontSize="small" />,
            },
          ],
        },
      ]
    : []),
  // Inbox: omnicanal (Conversation/Channel unificados) → sección propia, fuera de
  // WhatsApp. El badge por fila indica el canal de cada conversación.
  {
    label: 'Conversaciones',
    items: [
      {
        to: '/dashboard/inbox',
        label: 'Inbox',
        icon: <InboxIcon fontSize="small" />,
      },
      {
        to: '/dashboard/wapi/quick-replies',
        label: 'Respuestas rápidas',
        icon: <BoltIcon fontSize="small" />,
      },
    ],
  },
  // Canales: gestión omnicanal (alta/conexión de WhatsApp/Messenger/…) → sección propia.
  {
    label: 'Canales',
    items: [
      {
        to: '/dashboard/channels',
        label: 'Mis canales',
        icon: <HubIcon fontSize="small" />,
      },
    ],
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
        to: '/dashboard/email/domains',
        label: 'Dominios',
        icon: <LanguageIcon fontSize="small" />,
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
        to: '/dashboard/email/transactional',
        label: 'Transaccionales',
        icon: <BoltIcon fontSize="small" />,
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
        to: '/dashboard/wapi/live',
        label: 'Dashboard live',
        icon: <MonitorHeartIcon fontSize="small" />,
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
    ],
  },
  {
    label: 'Datos',
    items: [
      {
        to: '/dashboard/contacts',
        label: 'Contactos',
        icon: <ContactsIcon fontSize="small" />,
      },
      {
        to: '/dashboard/contacts/reports',
        label: 'Reportes de contactos',
        icon: <AssessmentIcon fontSize="small" />,
      },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      {
        to: '/dashboard/audit',
        label: 'Audit log',
        icon: <HistoryIcon fontSize="small" />,
      },
      {
        href: brand.docsUrl,
        label: 'Documentación',
        icon: <MenuBookIcon fontSize="small" />,
      },
      { label: 'Configuración', icon: <SettingsIcon fontSize="small" />, disabled: true },
    ],
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
              to: '/dashboard/dev/channels/messenger/chat',
              label: 'Chat Messenger',
              icon: <ChatIcon fontSize="small" />,
            },
            {
              to: '/dashboard/dev/channels/instagram/chat',
              label: 'Chat Instagram',
              icon: <InstagramIcon fontSize="small" />,
            },
            {
              to: '/dashboard/dev/channels/webchat/widget',
              label: 'Widget Webchat',
              icon: <LanguageIcon fontSize="small" />,
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

/** Shape mínimo de /api/me/context que necesita el sidebar (gating por plan). */
type MeContextNav = {
  organizations?: Array<{
    clerkOrgId: string;
    features?: { bot?: boolean };
    permissions?: { hasAi?: boolean };
  }>;
};

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  showCollapseButton = true,
}: SidebarProps) {
  const api = useApi();
  const { organization } = useOrganization();
  const clerkOrgId = organization?.id ?? null;

  // Flags de plan de la org activa. Conservador hasta cargar (items gated
  // ocultos) — el backend igual devuelve 403 si se fuerza la URL a mano.
  const [planFlags, setPlanFlags] = useState<PlanNavFlags>({ bots: false, agents: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get<MeContextNav>('/api/me/context');
        if (cancelled) return;
        const org = clerkOrgId
          ? me.organizations?.find((o) => o.clerkOrgId === clerkOrgId)
          : me.organizations?.[0];
        setPlanFlags({
          bots: org?.features?.bot === true,
          agents: org?.permissions?.hasAi === true,
        });
      } catch {
        // Silencioso: si /me falla, los items gated quedan ocultos y el resto
        // de la app va a mostrar el error real en su propia llamada.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, clerkOrgId]);

  const navGroups = useMemo(() => buildNavGroups(planFlags), [planFlags]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(GROUP_STATE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // no-op
    }
    // Default: todos los grupos posibles abiertos (flags en true solo para
    // enumerar las labels; el render usa navGroups con los flags reales).
    return Object.fromEntries(buildNavGroups({ bots: true, agents: true }).map((g) => [g.label, true]));
  });

  useEffect(() => {
    localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !(prev[label] ?? true) }));

  // Contador de no leídos para el badge del ítem Inbox.
  const { totalUnread } = useNotifications();
  const badgeFor = (item: NavItemSpec) =>
    item.to === '/dashboard/inbox' ? totalUnread : 0;

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
            >
              <OrganizationSwitcher.OrganizationProfilePage
                label="Plan"
                labelIcon={<CreditCardIcon fontSize="small" />}
                url="plan"
              >
                <PlanManagement />
              </OrganizationSwitcher.OrganizationProfilePage>
            </OrganizationSwitcher>
          </Box>
          <Divider />
        </>
      )}

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5, px: collapsed ? 0.75 : 1.25 }}>
        <Stack spacing={collapsed ? 0.5 : 2}>
          {navGroups.map((group, idx) => {
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
                        badgeCount={badgeFor(item)}
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
                          badgeCount={badgeFor(item)}
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
  badgeCount = 0,
}: {
  item: NavItemSpec;
  collapsed: boolean;
  onNavigate?: () => void;
  badgeCount?: number;
}) {
  const showBadge = badgeCount > 0;
  const iconNode =
    collapsed && showBadge ? (
      <Badge badgeContent={badgeCount} color="error" max={99} overlap="circular">
        {item.icon}
      </Badge>
    ) : (
      item.icon
    );
  const trailingBadge = !collapsed && showBadge && (
    <Box
      sx={{
        ml: 1,
        minWidth: 20,
        height: 20,
        px: 0.75,
        borderRadius: 9,
        bgcolor: 'error.main',
        color: 'common.white',
        fontSize: 11,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {badgeCount > 99 ? '99+' : badgeCount}
    </Box>
  );
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
    item.disabled || (!item.to && !item.href) ? (
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
    ) : item.href ? (
      <ListItemButton
        component="a"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
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
    ) : (
      <ListItemButton
        component={NavLink}
        to={item.to!}
        end={item.to === '/dashboard'}
        onClick={() => onNavigate?.()}
        sx={baseSx}
      >
        <ListItemIcon sx={iconSx}>{iconNode}</ListItemIcon>
        {!collapsed && (
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
          />
        )}
        {trailingBadge}
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
