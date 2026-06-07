import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useConfirm } from '../../feedback/ConfirmProvider';
import { botsApi } from '../bots/api';
import type { BotListItem } from '../bots/types';
import { ChannelIcon, channelMeta } from './channelMeta';
import { channelsApi } from './api';
import { AddChannelDialog } from './AddChannelDialog';
import { EditChannelDialog } from './EditChannelDialog';
import type { ChannelListItem } from './types';

interface MeContextSlice {
  organizations: Array<{ webhookSlug: string; role: string }>;
}

export function ChannelsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();

  const [items, setItems] = useState<ChannelListItem[] | null>(null);
  const [bots, setBots] = useState<BotListItem[]>([]);
  const [webhookSlug, setWebhookSlug] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelListItem | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await channelsApi.list(api));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudieron cargar los canales');
    }
  }, [api, notify]);

  useEffect(() => {
    void load();
    void botsApi
      .list(api)
      .then(setBots)
      .catch(() => undefined);
    void api
      .get<MeContextSlice>('/api/me/context')
      .then((me) => setWebhookSlug(me.organizations[0]?.webhookSlug ?? null))
      .catch(() => undefined);
  }, [api, load]);

  async function handleSetBot(channel: ChannelListItem, botId: string) {
    try {
      if (botId) await botsApi.connectChannel(api, botId, channel.id);
      else if (channel.botId) await botsApi.disconnectChannel(api, channel.botId, channel.id);
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo conectar el bot');
    }
  }

  async function handleDelete(channel: ChannelListItem) {
    const label = channel.name?.trim() || channelMeta(channel.kind).label;
    const ok = await confirm({
      title: 'Borrar canal',
      message: `¿Borrar "${label}"? Se perderá la conexión; las conversaciones quedan en el inbox.`,
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await channelsApi.remove(api, channel.id);
      notify.success('Canal borrado');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  const loading = items === null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Canales
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Conectá WhatsApp, Messenger y más. Cada canal se atiende en el inbox unificado.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Agregar canal
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Todavía no hay canales conectados
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Conectá tu primer canal para empezar a recibir y responder mensajes.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Agregar canal
          </Button>
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {items.map((ch) => (
            <ChannelRow
              key={ch.id}
              channel={ch}
              bots={bots}
              onSetBot={(botId) => void handleSetBot(ch, botId)}
              onEdit={() => setEditing(ch)}
              onDelete={() => void handleDelete(ch)}
            />
          ))}
        </Stack>
      )}

      <AddChannelDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          void load();
        }}
        webhookSlug={webhookSlug}
      />

      <EditChannelDialog
        channel={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
        webhookSlug={webhookSlug}
      />
    </Box>
  );
}

function ChannelRow({
  channel,
  bots,
  onSetBot,
  onEdit,
  onDelete,
}: {
  channel: ChannelListItem;
  bots: BotListItem[];
  onSetBot: (botId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = channelMeta(channel.kind);
  const identifier = useMemo(() => {
    if (channel.kind === 'WHATSAPP') return channel.phoneNumberId;
    return channel.pageId ?? '';
  }, [channel]);
  const display = channel.name?.trim() || meta.label;

  return (
    <Paper variant="outlined" sx={{ p: 1.75 }}>
      <Stack direction="row" alignItems="center" gap={1.75} flexWrap="wrap">
        <ChannelIcon kind={channel.kind} size={44} />
        <Box sx={{ flex: 1, minWidth: 160 }}>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
              {display}
            </Typography>
            <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: 10.5 }} />
            {!channel.isActive && (
              <Chip size="small" label="Inactivo" color="default" variant="outlined" sx={{ height: 20, fontSize: 10.5 }} />
            )}
            {channel.isTestMode && (
              <Chip size="small" label="Test" color="warning" variant="outlined" sx={{ height: 20, fontSize: 10.5 }} />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {identifier || '—'}
          </Typography>
        </Box>

        {/* Conectar bot */}
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select
            displayEmpty
            value={channel.botId ?? ''}
            onChange={(e) => onSetBot(e.target.value)}
            renderValue={(v) => {
              const bot = bots.find((b) => b.botId === v);
              return (
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <SmartToyIcon sx={{ fontSize: 16, color: bot ? 'primary.main' : 'text.disabled' }} />
                  <Typography variant="body2" noWrap>
                    {bot ? bot.name : 'Sin bot'}
                  </Typography>
                </Stack>
              );
            }}
          >
            <MenuItem value="">
              <em>Sin bot</em>
            </MenuItem>
            {bots.map((b) => (
              <MenuItem key={b.botId} value={b.botId}>
                {b.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Editar canal">
          <IconButton size="small" onClick={onEdit}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Borrar canal">
          <IconButton size="small" color="error" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
