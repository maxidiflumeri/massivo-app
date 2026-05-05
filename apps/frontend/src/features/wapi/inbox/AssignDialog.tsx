import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useApi } from '../../../api/client';
import { useActiveTeam } from '../../../team/TeamContext';
import { initials } from './formatters';

interface TeamMember {
  userId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAssign: (userId: string) => Promise<void>;
  currentAssignedUserId?: string | null;
}

export function AssignDialog({ open, onClose, onAssign, currentAssignedUserId }: Props) {
  const api = useApi();
  const { activeTeamId } = useActiveTeam();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeTeamId) return;
    let cancelled = false;
    setMembers(null);
    void (async () => {
      try {
        const data = await api.get<TeamMember[]>(`/api/teams/${activeTeamId}/members`);
        if (!cancelled) setMembers(data);
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeTeamId, api]);

  const filtered = (members ?? []).filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.user.email.toLowerCase().includes(q) ||
      (m.user.name ?? '').toLowerCase().includes(q)
    );
  });

  async function handlePick(userId: string) {
    setSubmitting(userId);
    try {
      await onAssign(userId);
      onClose();
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Asignar conversación</DialogTitle>
      <DialogContent dividers>
        <Stack gap={1.5}>
          <TextField
            size="small"
            placeholder="Buscar miembro"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
          />
          {members === null ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={24} />
            </Stack>
          ) : filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
              No hay miembros en este team.
            </Typography>
          ) : (
            <List disablePadding>
              {filtered.map((m) => {
                const isCurrent = m.userId === currentAssignedUserId;
                return (
                  <ListItemButton
                    key={m.userId}
                    onClick={() => handlePick(m.userId)}
                    disabled={!!submitting}
                    selected={isCurrent}
                  >
                    <ListItemAvatar>
                      <Avatar src={m.user.avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
                        {initials(m.user.name, m.user.email)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={m.user.name ?? m.user.email}
                      secondary={m.user.email}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                    {submitting === m.userId && <CircularProgress size={16} />}
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
}
