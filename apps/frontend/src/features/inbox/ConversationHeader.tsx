import {
  Avatar,
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import { formatPhone, initials } from './formatters';
import { ChannelBadge } from './ChannelBadge';
import type { ConversationDetail } from './types';

interface Props {
  conversation: ConversationDetail;
  currentUserId: string | null;
  onTake: () => void;
  onAssign: () => void;
  onUnassign: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onHold: () => void;
  onToggleRead: () => void;
}

export function ConversationHeader({
  conversation,
  currentUserId,
  onTake,
  onAssign,
  onUnassign,
  onResolve,
  onReopen,
  onHold,
  onToggleRead,
}: Props) {
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const isMine =
    !!currentUserId &&
    conversation.assignedUserId === currentUserId &&
    conversation.status === 'ASSIGNED';
  const isResolved = conversation.status === 'RESOLVED';
  const isWaiting = conversation.status === 'WAITING';
  const wasMineWaiting =
    !!currentUserId && isWaiting && conversation.lastAssignedUserId === currentUserId;
  const display = conversation.name?.trim() || formatPhone(conversation.externalUserId);

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        px: 2,
        py: 1.25,
      }}
    >
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: 14 }}>
          {initials(conversation.name, conversation.externalUserId)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {display}
            </Typography>
            <StatusChip conversation={conversation} />
            {wasMineWaiting && (
              <Chip
                size="small"
                label="lo tenías vos"
                variant="outlined"
                sx={{ height: 22, fontSize: 11 }}
              />
            )}
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.5}>
            <ChannelBadge kind={conversation.channelKind} size={13} />
            <Typography variant="caption" color="text.secondary">
              {formatPhone(conversation.externalUserId)}
              {conversation.campaignName && ` · ${conversation.campaignName}`}
            </Typography>
          </Stack>
        </Box>
        <Stack direction="row" gap={0.5}>
          {!isResolved && !isMine && !isWaiting && (
            <Tooltip title="Tomar conversación">
              <IconButton size="small" onClick={onTake}>
                <LoginIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {isMine && (
            <Tooltip title="Poner en espera (esperar respuesta del cliente)">
              <IconButton size="small" onClick={onHold} color="warning">
                <PauseCircleOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!isResolved && (
            <Tooltip title="Marcar como resuelta">
              <IconButton size="small" onClick={onResolve} color="success">
                <CheckCircleOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {isResolved && (
            <Tooltip title="Reabrir conversación">
              <IconButton size="small" onClick={onReopen}>
                <ReplayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip
            title={
              conversation.unreadCount > 0 ? 'Marcar como leído' : 'Marcar como no leído'
            }
          >
            <IconButton size="small" onClick={onToggleRead}>
              {conversation.unreadCount > 0 ? (
                <MarkEmailReadIcon fontSize="small" />
              ) : (
                <MarkEmailUnreadIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={(e) => setMenuEl(e.currentTarget)}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={menuEl}
            open={!!menuEl}
            onClose={() => setMenuEl(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            {!isResolved && (
              <MenuItem
                onClick={() => {
                  setMenuEl(null);
                  onAssign();
                }}
              >
                <PersonAddAltIcon fontSize="small" sx={{ mr: 1.5 }} />
                Asignar a otro miembro
              </MenuItem>
            )}
            {!isResolved && conversation.assignedUserId && (
              <MenuItem
                onClick={() => {
                  setMenuEl(null);
                  onUnassign();
                }}
              >
                <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />
                Liberar (sin asignar)
              </MenuItem>
            )}
          </Menu>
        </Stack>
      </Stack>
    </Box>
  );
}

function StatusChip({ conversation }: { conversation: ConversationDetail }) {
  if (conversation.status === 'RESOLVED') {
    return <Chip size="small" label="Resuelta" color="success" sx={{ height: 22 }} />;
  }
  if (conversation.status === 'WAITING') {
    return <WaitingChip until={conversation.waitingUntil} />;
  }
  if (conversation.status === 'UNASSIGNED') {
    return (
      <Chip
        size="small"
        label="Sin asignar"
        color="warning"
        variant="outlined"
        sx={{ height: 22 }}
      />
    );
  }
  return (
    <Chip
      size="small"
      label="Asignada"
      color="primary"
      variant="outlined"
      sx={{ height: 22 }}
    />
  );
}

function WaitingChip({ until }: { until: string | null }) {
  const remaining = useCountdown(until);
  const label = remaining
    ? `En espera · ${remaining}`
    : until
      ? 'En espera'
      : 'En espera';
  return (
    <Chip
      size="small"
      icon={<HourglassBottomIcon sx={{ fontSize: 14 }} />}
      label={label}
      color="warning"
      sx={{ height: 22, fontSize: 11 }}
    />
  );
}

/**
 * Countdown vivo para el chip WAITING. Tick cada 30s para no recargar el
 * navegador — la precisión a segundos no aporta acá. Devuelve null si no
 * hay deadline o si ya venció (el worker debería haberlo barrido pero a
 * veces hay lag de socket).
 */
function useCountdown(iso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const deadline = new Date(iso).getTime();
  if (!Number.isFinite(deadline)) return null;
  const diffMs = deadline - now;
  if (diffMs <= 0) return null;
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} h`;
  return `${hours}h ${mins}m`;
}
