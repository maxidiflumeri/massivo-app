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
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { formatPhone, formatRelative, initials } from './formatters';
import type { InboxTab, WapiConversationListItem } from './types';

export interface InboxConfigOption {
  id: string;
  label: string;
}

interface Props {
  tab: InboxTab;
  onTabChange: (tab: InboxTab) => void;
  search: string;
  onSearchChange: (v: string) => void;
  items: WapiConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  configs: InboxConfigOption[];
  selectedConfigId: string | null;
  onConfigChange: (id: string | null) => void;
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
  configs,
  selectedConfigId,
  onConfigChange,
}: Props) {
  const empty = !loading && items.length === 0;
  const showConfigSelector = configs.length > 1;
  const showLineLabel = showConfigSelector && selectedConfigId === null;
  const configLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of configs) map.set(c.id, c.label);
    return map;
  }, [configs]);

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
          placeholder="Buscar por nombre o teléfono"
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
      </Box>
      {showConfigSelector && (
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <ToggleButtonGroup
            value={selectedConfigId}
            exclusive
            onChange={(_, v: string | null) => onConfigChange(v)}
            size="small"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, width: '100%' }}
          >
            <ToggleButton value={null} sx={{ flex: 1, minWidth: 60, fontSize: 11, py: 0.5 }}>
              Todas
            </ToggleButton>
            {configs.map((c) => (
              <ToggleButton
                key={c.id}
                value={c.id}
                sx={{ flex: 1, minWidth: 60, fontSize: 11, py: 0.5 }}
              >
                {c.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
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
                  showLineLabel ? configLabelById.get(c.configId) ?? null : null
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

function ConversationRow({
  item,
  selected,
  onSelect,
  lineLabel,
}: {
  item: WapiConversationListItem;
  selected: boolean;
  onSelect: () => void;
  lineLabel: string | null;
}) {
  const display = item.name?.trim() || formatPhone(item.phone);
  const subtitle = item.lastMessage?.preview ?? '';
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
          {initials(item.name, item.phone)}
        </Avatar>
      </Badge>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
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
