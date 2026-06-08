import { useMemo } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  List,
  ListItemButton,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AllInboxIcon from '@mui/icons-material/AllInbox';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import { formatPhone, formatRelative, initials } from './formatters';
import { ChannelBadge } from './ChannelBadge';
import { channelLabel } from './capabilities';
import type { ChannelKind, InboxTab, ConversationListItem } from './types';

export interface InboxChannelOption {
  id: string;
  label: string;
  kind: ChannelKind;
}

interface Props {
  tab: InboxTab;
  onTabChange: (tab: InboxTab) => void;
  search: string;
  onSearchChange: (v: string) => void;
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  channels: InboxChannelOption[];
  selectedChannelId: string | null;
  onChannelChange: (id: string | null) => void;
  selectedChannelKind: ChannelKind | null;
  onChannelKindChange: (kind: ChannelKind | null) => void;
  priorityOnly: boolean;
  onPriorityChange: (v: boolean) => void;
}

const TABS: Array<{ value: InboxTab; label: string }> = [
  { value: 'mine', label: 'Mías' },
  { value: 'unassigned', label: 'Sin asignar' },
  { value: 'others', label: 'Otras' },
  { value: 'resolved', label: 'Resueltas' },
];

export function ConversationList({
  tab,
  onTabChange,
  search,
  onSearchChange,
  items,
  selectedId,
  onSelect,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
  channels,
  selectedChannelId,
  onChannelChange,
  selectedChannelKind,
  onChannelKindChange,
  priorityOnly,
  onPriorityChange,
}: Props) {
  const empty = !loading && items.length === 0;
  const showChannelSelector = channels.length > 1;
  const showLineLabel = showChannelSelector && selectedChannelId === null;
  const channelLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of channels) map.set(c.id, c.label);
    return map;
  }, [channels]);
  // Canales agrupados por tipo (para el selector único). `multiKind` decide si
  // mostramos los encabezados de tipo + el atajo "Todos los <tipo>".
  const groups = useMemo(() => {
    const m = new Map<ChannelKind, InboxChannelOption[]>();
    for (const c of channels) {
      const arr = m.get(c.kind);
      if (arr) arr.push(c);
      else m.set(c.kind, [c]);
    }
    return Array.from(m, ([kind, chans]) => ({ kind, channels: chans }));
  }, [channels]);
  const multiKind = groups.length > 1;

  // Valor del selector: 'all' | 'kind:<KIND>' | 'ch:<id>'.
  const channelSelectValue = selectedChannelId
    ? `ch:${selectedChannelId}`
    : selectedChannelKind
      ? `kind:${selectedChannelKind}`
      : 'all';

  function handleChannelSelect(v: string) {
    if (v === 'all') {
      onChannelChange(null);
      onChannelKindChange(null);
    } else if (v.startsWith('kind:')) {
      onChannelKindChange(v.slice(5) as ChannelKind);
      onChannelChange(null);
    } else {
      onChannelChange(v.slice(3));
      onChannelKindChange(null);
    }
  }

  return (
    <Stack
      sx={{
        height: '100%',
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
          Inbox
        </Typography>
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar por nombre o usuario"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
          <Chip
            size="small"
            icon={priorityOnly ? <StarIcon sx={{ fontSize: 14 }} /> : <StarBorderIcon sx={{ fontSize: 14 }} />}
            label="Priorizadas"
            color={priorityOnly ? 'warning' : 'default'}
            variant={priorityOnly ? 'filled' : 'outlined'}
            onClick={() => onPriorityChange(!priorityOnly)}
            sx={{ height: 22, fontSize: 11 }}
          />
        </Stack>
      </Box>
      {showChannelSelector && (
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Select
            size="small"
            fullWidth
            value={channelSelectValue}
            onChange={(e) => handleChannelSelect(e.target.value)}
            renderValue={(v) => <ChannelSelectValue value={v} channels={channels} />}
            MenuProps={{ PaperProps: { sx: { maxHeight: 440 } } }}
            sx={{ '& .MuiSelect-select': { py: 0.75 } }}
          >
            <MenuItem value="all">
              <Stack direction="row" alignItems="center" gap={1}>
                <AllInboxIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                Todos los canales
              </Stack>
            </MenuItem>
            {multiKind
              ? groups.flatMap((g) => [
                  <ListSubheader
                    key={`h-${g.kind}`}
                    sx={{ lineHeight: '30px', display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'transparent' }}
                  >
                    <ChannelBadge kind={g.kind} size={14} />
                    {channelLabel(g.kind)}
                  </ListSubheader>,
                  <MenuItem key={`k-${g.kind}`} value={`kind:${g.kind}`} sx={{ pl: 3.5, fontSize: 13 }}>
                    Todos los {channelLabel(g.kind)}
                  </MenuItem>,
                  ...g.channels.map((c) => (
                    <MenuItem key={c.id} value={`ch:${c.id}`} sx={{ pl: 3.5, fontSize: 13 }}>
                      {c.label}
                    </MenuItem>
                  )),
                ])
              : channels.map((c) => (
                  <MenuItem key={c.id} value={`ch:${c.id}`}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <ChannelBadge kind={c.kind} size={16} />
                      {c.label}
                    </Stack>
                  </MenuItem>
                ))}
          </Select>
        </Box>
      )}
      <Tabs
        value={tab}
        onChange={(_, v: InboxTab) => onTabChange(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          minHeight: 36,
          px: 1,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: 13 },
        }}
      >
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && items.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : empty ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No hay conversaciones en esta vista.
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {items.map((c) => (
              <ConversationRow
                key={c.id}
                item={c}
                selected={c.id === selectedId}
                onSelect={() => onSelect(c.id)}
                lineLabel={
                  showLineLabel ? channelLabelById.get(c.channelId) ?? null : null
                }
              />
            ))}
            {hasMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
                <Chip
                  size="small"
                  label={loadingMore ? 'Cargando…' : 'Cargar más'}
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  variant="outlined"
                />
              </Box>
            )}
          </List>
        )}
      </Box>
    </Stack>
  );
}

/** Trigger del selector de canal: ícono de marca + etiqueta del alcance elegido. */
function ChannelSelectValue({
  value,
  channels,
}: {
  value: string;
  channels: InboxChannelOption[];
}) {
  if (value.startsWith('kind:')) {
    const k = value.slice(5) as ChannelKind;
    return (
      <Stack direction="row" alignItems="center" gap={1}>
        <ChannelBadge kind={k} size={16} />
        {channelLabel(k)}
      </Stack>
    );
  }
  if (value.startsWith('ch:')) {
    const c = channels.find((x) => x.id === value.slice(3));
    if (c) {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <ChannelBadge kind={c.kind} size={16} />
          {c.label}
        </Stack>
      );
    }
  }
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <AllInboxIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
      Todos los canales
    </Stack>
  );
}

/**
 * Defensa contra preview con shape inesperado (caía con
 * `Objects are not valid as a React child (found: object with keys {text})`
 * al rotar de tab con filtro activo). Si llega un objeto, log + descartar.
 */
function coerceSubtitle(preview: unknown): string {
  if (typeof preview === 'string') return preview;
  if (preview == null) return '';
  if (typeof preview === 'object') {
    // eslint-disable-next-line no-console
    console.warn('[inbox] preview con shape inesperado, descartando:', preview);
    const body = (preview as { body?: unknown; text?: unknown }).body;
    if (typeof body === 'string') return body;
    const text = (preview as { text?: unknown }).text;
    if (typeof text === 'string') return text;
    if (text && typeof text === 'object') {
      const inner = (text as { body?: unknown }).body;
      if (typeof inner === 'string') return inner;
    }
    return '';
  }
  return String(preview);
}

function ConversationRow({
  item,
  selected,
  onSelect,
  lineLabel,
}: {
  item: ConversationListItem;
  selected: boolean;
  onSelect: () => void;
  lineLabel: string | null;
}) {
  const display = item.name?.trim() || formatPhone(item.externalUserId);
  const subtitle = coerceSubtitle(item.lastMessage?.preview);
  const time = useMemo(
    () => formatRelative(item.lastMessageAt ?? item.lastMessage?.timestamp ?? null),
    [item.lastMessageAt, item.lastMessage?.timestamp],
  );
  const fromMe = item.lastMessage?.fromMe;

  return (
    <ListItemButton
      selected={selected}
      onClick={onSelect}
      sx={{
        py: 1.25,
        px: 2,
        gap: 1.5,
        alignItems: 'flex-start',
        borderBottom: 1,
        borderColor: 'divider',
        '&.Mui-selected': {
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.selected' : 'primary.light'),
        },
      }}
    >
      <Badge
        color="success"
        overlap="circular"
        badgeContent={item.unreadCount > 0 ? item.unreadCount : 0}
        invisible={item.unreadCount === 0}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: 14 }}>
          {initials(item.name, item.externalUserId)}
        </Avatar>
      </Badge>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <ChannelBadge kind={item.channelKind} size={15} />
          {item.priority && (
            <StarIcon
              sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0 }}
              titleAccess="Conversación priorizada"
            />
          )}
          <Typography
            variant="body2"
            sx={{
              fontWeight: item.unreadCount > 0 ? 700 : 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
            }}
          >
            {display}
          </Typography>
          <Typography
            variant="caption"
            color={item.unreadCount > 0 ? 'primary.main' : 'text.secondary'}
            sx={{ flexShrink: 0, fontWeight: item.unreadCount > 0 ? 600 : 400 }}
          >
            {time}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {fromMe && (
            <DoneAllIcon
              sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }}
            />
          )}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: 13,
              fontWeight: item.unreadCount > 0 ? 500 : 400,
              color: item.unreadCount > 0 ? 'text.primary' : 'text.secondary',
            }}
          >
            {subtitle || '—'}
          </Typography>
          {item.status === 'RESOLVED' && (
            <Chip
              size="small"
              label="Resuelta"
              icon={<DoneIcon sx={{ fontSize: 12 }} />}
              sx={{ height: 20, fontSize: 10 }}
            />
          )}
          {item.status === 'WAITING' && (
            <Chip
              size="small"
              label="En espera"
              color="warning"
              icon={<HourglassBottomIcon sx={{ fontSize: 12 }} />}
              sx={{ height: 20, fontSize: 10 }}
            />
          )}
        </Stack>
        {(lineLabel || item.campaignName) && (
          <Stack
            direction="row"
            alignItems="center"
            gap={0.75}
            sx={{ mt: 0.25, fontSize: 10.5 }}
          >
            {lineLabel && (
              <Chip
                size="small"
                label={lineLabel}
                sx={{
                  height: 16,
                  fontSize: 10,
                  px: 0.25,
                  '& .MuiChip-label': { px: 0.75 },
                }}
                variant="outlined"
              />
            )}
            {item.campaignName && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{
                  fontSize: 10.5,
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.campaignName}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </ListItemButton>
  );
}
