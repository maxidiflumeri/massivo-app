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
import { useState } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import { formatPhone, initials } from './formatters';
import type { WapiConversationDetail } from './types';

interface Props {
  conversation: WapiConversationDetail;
  currentUserId: string | null;
  onTake: () => void;
  onAssign: () => void;
  onUnassign: () => void;
  onResolve: () => void;
  onReopen: () => void;
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
  onToggleRead,
}: Props) {
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const isMine =
    !!currentUserId &&
    conversation.assignedUserId === currentUserId &&
    conversation.status === 'ASSIGNED';
  const isResolved = conversation.status === 'RESOLVED';
  const display = conversation.name?.trim() || formatPhone(conversation.phone);

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
          {initials(conversation.name, conversation.phone)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {display}
            </Typography>
            <StatusChip conversation={conversation} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatPhone(conversation.phone)}
            {conversation.campaignName && ` · ${conversation.campaignName}`}
          </Typography>
        </Box>
        <Stack direction="row" gap={0.5}>
          {!isResolved && !isMine && (
            <Tooltip title="Tomar conversación">
              <IconButton size="small" onClick={onTake}>
                <LoginIcon fontSize="small" />
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

function StatusChip({ conversation }: { conversation: WapiConversationDetail }) {
  if (conversation.status === 'RESOLVED') {
    return <Chip size="small" label="Resuelta" color="success" sx={{ height: 22 }} />;
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

