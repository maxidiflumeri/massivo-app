import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  List,
  ListItemButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { ChannelBadge } from '../inbox/ChannelBadge';
import { coerceSubtitle, formatPhone, formatRelative } from '../inbox/formatters';
import type { ConversationListItem } from '../inbox/types';

interface Props {
  items: ConversationListItem[];
  selectedId: string | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (c: ConversationListItem) => void;
  onLoadMore: () => void;
}

/**
 * Lista de conversaciones para monitoreo. Deliberadamente NO reusa la del
 * inbox: aquella está atada a pestañas de estado, asignación y no-leídos, que
 * acá no aplican — esto es una vista de observación, sin acciones.
 */
export function LiveConversationList({
  items,
  selectedId,
  loading,
  loadingMore,
  hasMore,
  search,
  onSearchChange,
  onSelect,
  onLoadMore,
}: Props) {
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar por teléfono o nombre…"
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

      {loading && items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
          {search ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay conversaciones.'}
        </Typography>
      ) : (
        <List dense sx={{ flex: 1, overflowY: 'auto', py: 0 }}>
          {items.map((c) => (
            <ListItemButton
              key={c.id}
              selected={c.id === selectedId}
              onClick={() => onSelect(c)}
              sx={{ alignItems: 'flex-start', gap: 1, py: 1 }}
            >
              <Box sx={{ pt: 0.25 }}>
                <ChannelBadge kind={c.channelKind} size={18} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {c.name || formatPhone(c.externalUserId)}
                  </Typography>
                  <Chip
                    size="small"
                    label={c.escalated ? 'Operador' : 'Bot'}
                    color={c.escalated ? 'warning' : 'default'}
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {coerceSubtitle(c.lastMessage?.preview) || '—'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {c.lastMessageAt ? formatRelative(c.lastMessageAt) : ''}
              </Typography>
            </ListItemButton>
          ))}
          {hasMore && (
            <Box sx={{ p: 1, textAlign: 'center' }}>
              <Button size="small" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </Button>
            </Box>
          )}
        </List>
      )}
    </Stack>
  );
}
