import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  Popover,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import DesktopWindowsRoundedIcon from '@mui/icons-material/DesktopWindowsRounded';
import { ChannelBadge } from '../inbox/ChannelBadge';
import { useNotifications } from './NotificationsProvider';
import type { NotificationItem } from './types';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'recién';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const {
    mine,
    unassigned,
    mineUnread,
    unassignedUnread,
    totalUnread,
    refresh,
    markRead,
    markAllRead,
    soundEnabled,
    setSoundEnabled,
    desktopEnabled,
    setDesktopEnabled,
  } = useNotifications();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    void refresh(); // re-sincroniza contadores al abrir
  };
  const handleClose = () => setAnchor(null);

  const handleClick = (n: NotificationItem) => {
    void markRead(n.id);
    handleClose();
    navigate(`/dashboard/inbox?c=${n.conversationId}`);
  };

  return (
    <>
      <Tooltip title="Notificaciones">
        <IconButton size="small" onClick={handleOpen} aria-label="Notificaciones">
          <Badge
            badgeContent={totalUnread}
            color="error"
            max={99}
            overlap="circular"
          >
            <NotificationsNoneRoundedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: '95vw', borderRadius: 2, overflow: 'hidden' } } }}
      >
        {/* Header */}
        <Box sx={{ px: 2, pt: 1.5, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Notificaciones
          </Typography>
          <Button
            size="small"
            startIcon={<DoneAllRoundedIcon fontSize="small" />}
            onClick={() => void markAllRead('all')}
            disabled={totalUnread === 0}
          >
            Marcar todas
          </Button>
        </Box>

        {/* Ajustes rápidos */}
        <Box sx={{ px: 2, pb: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <VolumeUpRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                Sonido
              </Typography>
              <Switch
                size="small"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DesktopWindowsRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                Escritorio
              </Typography>
              <Switch
                size="small"
                checked={desktopEnabled}
                onChange={(e) => void setDesktopEnabled(e.target.checked)}
              />
            </Box>
          </Stack>
        </Box>
        <Divider />

        <Box sx={{ maxHeight: 460, overflowY: 'auto' }}>
          <Section
            title="Para mí"
            count={mineUnread}
            items={mine}
            empty="No tenés notificaciones asignadas."
            onClick={handleClick}
          />
          <Divider />
          <Section
            title="Sin asignar"
            count={unassignedUnread}
            items={unassigned}
            empty="No hay conversaciones nuevas sin asignar."
            onClick={handleClick}
          />
        </Box>
      </Popover>
    </>
  );
}

function Section({
  title,
  count,
  items,
  empty,
  onClick,
}: {
  title: string;
  count: number;
  items: NotificationItem[];
  empty: string;
  onClick: (n: NotificationItem) => void;
}) {
  return (
    <Box>
      <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover' }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', lineHeight: 1.6 }}>
          {title}
        </Typography>
        {count > 0 && (
          <Box
            sx={{
              minWidth: 18,
              height: 18,
              px: 0.5,
              borderRadius: 9,
              bgcolor: 'error.main',
              color: 'common.white',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {count > 99 ? '99+' : count}
          </Box>
        )}
      </Box>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
          {empty}
        </Typography>
      ) : (
        <List disablePadding>
          {items.map((n) => (
            <ListItemButton
              key={n.id}
              onClick={() => onClick(n)}
              sx={{ alignItems: 'flex-start', gap: 1, py: 1, px: 2 }}
            >
              <Box sx={{ mt: 0.25 }}>
                <ChannelBadge kind={n.channelKind} size={18} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0 }}>
                    {n.title ?? 'Conversación'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {timeAgo(n.createdAt)}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {n.body ?? 'Nuevo mensaje'}
                </Typography>
              </Box>
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
