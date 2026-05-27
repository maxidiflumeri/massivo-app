import { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import HistoryIcon from '@mui/icons-material/History';
import OpenInBrowserIcon from '@mui/icons-material/OpenInBrowser';
import MouseIcon from '@mui/icons-material/Mouse';
import SendIcon from '@mui/icons-material/Send';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InboxIcon from '@mui/icons-material/Inbox';
import CallMadeIcon from '@mui/icons-material/CallMade';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../api/client';
import { ApiError } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import type {
  Contact,
  TimelineChannel,
  TimelineItem,
  TimelineKind,
  TimelinePage,
} from './types';
import { downloadContactActivityReport } from './api/contactReportsApi';

const TIMELINE_PAGE_SIZE = 50;

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const notify = useNotify();
  const navigate = useNavigate();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loadingContact, setLoadingContact] = useState(true);

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [channelFilter, setChannelFilter] = useState<TimelineChannel | ''>('');
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport(format: 'csv' | 'xlsx') {
    if (!id) return;
    setExportAnchor(null);
    setExporting(true);
    try {
      await downloadContactActivityReport(api, id, {
        format,
        channel: channelFilter || undefined,
      });
      notify.success(`Timeline ${format.toUpperCase()} descargado`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingContact(true);
    api
      .get<Contact>(`/api/contacts/${id}`)
      .then((c) => {
        if (!cancelled) setContact(c);
      })
      .catch((e) => {
        if (!cancelled) {
          if (e instanceof ApiError && e.status === 404) {
            notify.error('Contacto no encontrado');
            navigate('/dashboard/contacts', { replace: true });
          } else {
            notify.error(e instanceof Error ? e.message : 'Error cargando contacto');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingContact(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, api, navigate, notify]);

  const loadTimeline = useCallback(
    async (nextCursor: string | null) => {
      if (!id) return;
      const isFirst = nextCursor === null;
      if (isFirst) setLoadingTimeline(true);
      else setLoadingMore(true);
      try {
        const p = new URLSearchParams();
        if (nextCursor) p.set('cursor', nextCursor);
        p.set('limit', String(TIMELINE_PAGE_SIZE));
        if (channelFilter) p.set('channel', channelFilter);
        const res = await api.get<TimelinePage>(`/api/contacts/${id}/timeline?${p.toString()}`);
        setItems((prev) => (isFirst ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'Error cargando timeline');
      } finally {
        if (isFirst) setLoadingTimeline(false);
        else setLoadingMore(false);
      }
    },
    [id, api, notify, channelFilter],
  );

  useEffect(() => {
    void loadTimeline(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, channelFilter]);

  if (loadingContact) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!contact) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton component={RouterLink} to="/dashboard/contacts" size="small">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {formatName(contact) ?? '(sin nombre)'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {contact.id}
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Identidad
            </Typography>
            <Stack spacing={1.5}>
              <FieldRow label="External ID" value={contact.externalId} mono />
              <FieldRow label="DNI" value={contact.dni} mono />
              <FieldRow label="CUIT" value={contact.cuit} mono />
              <FieldRow label="Email" value={contact.email} />
              <FieldRow label="Teléfono E.164" value={contact.phoneE164} mono />
              {contact.phone && contact.phone !== contact.phoneE164 && (
                <FieldRow label="Teléfono (raw)" value={contact.phone} mono small />
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Metadata
            </Typography>
            <Stack spacing={1}>
              <FieldRow
                label="Creado"
                value={new Date(contact.createdAt).toLocaleString()}
                small
              />
              <FieldRow
                label="Actualizado"
                value={new Date(contact.updatedAt).toLocaleString()}
                small
              />
              <FieldRow label="Team" value={contact.teamId ?? null} mono small />
            </Stack>

            {contact.attributes && typeof contact.attributes === 'object' && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Atributos
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 240,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(contact.attributes, null, 2)}
                </Box>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
                Timeline cross-canal
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={channelFilter}
                exclusive
                onChange={(_e, v) => setChannelFilter((v ?? '') as TimelineChannel | '')}
              >
                <ToggleButton value="">Todo</ToggleButton>
                <ToggleButton value="email">Email</ToggleButton>
                <ToggleButton value="wapi">WhatsApp</ToggleButton>
                <ToggleButton value="audit">Auditoría</ToggleButton>
              </ToggleButtonGroup>
              <Tooltip title="Recargar">
                <IconButton
                  size="small"
                  onClick={() => void loadTimeline(null)}
                  disabled={loadingTimeline}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Exportar timeline">
                <span>
                  <IconButton
                    size="small"
                    disabled={exporting || loadingTimeline}
                    onClick={(e) => setExportAnchor(e.currentTarget)}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Menu
                anchorEl={exportAnchor}
                open={!!exportAnchor}
                onClose={() => setExportAnchor(null)}
              >
                <MenuItem onClick={() => void handleExport('csv')}>
                  <ListItemText primary="CSV" secondary="Toda la actividad visible" />
                </MenuItem>
                <MenuItem onClick={() => void handleExport('xlsx')}>
                  <ListItemText primary="Excel (.xlsx)" secondary="Con formato" />
                </MenuItem>
              </Menu>
            </Stack>

            {loadingTimeline ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={20} />
              </Box>
            ) : items.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                Sin actividad para este contacto.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {items.map((it) => (
                  <TimelineRow key={it.id} item={it} />
                ))}
              </Stack>
            )}

            {cursor && !loadingTimeline && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button onClick={() => void loadTimeline(cursor)} disabled={loadingMore}>
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </Button>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const meta = item.metadata;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        p: 1.25,
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Avatar sx={{ width: 32, height: 32, bgcolor: kindColor(item.kind) }}>
        {kindIcon(item.kind)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {kindLabel(item.kind)}
          </Typography>
          <Chip
            size="small"
            label={item.channel}
            sx={{ height: 18, fontSize: 10 }}
            variant="outlined"
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {new Date(item.at).toLocaleString()}
        </Typography>
        <TimelineMeta kind={item.kind} meta={meta} />
      </Box>
    </Stack>
  );
}

function TimelineMeta({ kind, meta }: { kind: TimelineKind; meta: Record<string, unknown> }) {
  const get = (k: string) => (meta && typeof meta === 'object' ? meta[k] : undefined);
  if (kind.startsWith('email.')) {
    const subject = get('subject');
    const campaignName = get('campaignName');
    const targetUrl = get('targetUrl');
    const error = get('error');
    return (
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        {typeof campaignName === 'string' && (
          <Typography variant="caption" color="text.secondary">
            Campaña: <strong>{campaignName}</strong>
          </Typography>
        )}
        {typeof subject === 'string' && (
          <Typography variant="caption" color="text.secondary">
            Asunto: {subject}
          </Typography>
        )}
        {typeof targetUrl === 'string' && (
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            URL: {targetUrl}
          </Typography>
        )}
        {typeof error === 'string' && (
          <Typography variant="caption" color="error">
            Error: {error}
          </Typography>
        )}
      </Stack>
    );
  }
  if (kind.startsWith('wapi.message.')) {
    const type = get('type');
    const caption = get('mediaCaption');
    return (
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        {typeof type === 'string' && (
          <Typography variant="caption" color="text.secondary">
            Tipo: {type}
          </Typography>
        )}
        {typeof caption === 'string' && (
          <Typography variant="caption" color="text.secondary">
            “{caption}”
          </Typography>
        )}
      </Stack>
    );
  }
  if (kind.startsWith('wapi.')) {
    const campaignName = get('campaignName');
    const error = get('error');
    return (
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        {typeof campaignName === 'string' && (
          <Typography variant="caption" color="text.secondary">
            Campaña: <strong>{campaignName}</strong>
          </Typography>
        )}
        {typeof error === 'string' && (
          <Typography variant="caption" color="error">
            Error: {error}
          </Typography>
        )}
      </Stack>
    );
  }
  if (kind === 'audit') {
    const action = get('action');
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
        {typeof action === 'string' ? action : ''}
      </Typography>
    );
  }
  return null;
}

function FieldRow({
  label,
  value,
  mono = false,
  small = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant={small ? 'caption' : 'body2'}
        sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}
      >
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

function formatName(c: Contact): string | null {
  const parts = [c.firstName, c.lastName].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(' ');
  return c.email ?? c.phoneE164 ?? c.phone ?? c.externalId ?? null;
}

function kindLabel(kind: TimelineKind): string {
  switch (kind) {
    case 'email.queued':
      return 'Email en cola';
    case 'email.sent':
      return 'Email enviado';
    case 'email.failed':
      return 'Email falló';
    case 'email.bounced':
      return 'Email rebotó';
    case 'email.complained':
      return 'Email marcado como spam';
    case 'email.suppressed':
      return 'Email suprimido';
    case 'email.canceled':
      return 'Email cancelado';
    case 'email.opened':
      return 'Email abierto';
    case 'email.clicked':
      return 'Click en email';
    case 'wapi.sent':
      return 'WhatsApp enviado';
    case 'wapi.delivered':
      return 'WhatsApp entregado';
    case 'wapi.read':
      return 'WhatsApp leído';
    case 'wapi.failed':
      return 'WhatsApp falló';
    case 'wapi.message.in':
      return 'Mensaje recibido';
    case 'wapi.message.out':
      return 'Mensaje saliente';
    case 'audit':
      return 'Acción interna';
    default:
      return kind;
  }
}

function kindIcon(kind: TimelineKind): JSX.Element {
  if (kind === 'email.opened') return <OpenInBrowserIcon fontSize="small" />;
  if (kind === 'email.clicked') return <MouseIcon fontSize="small" />;
  if (kind.startsWith('email.')) return <EmailIcon fontSize="small" />;
  if (kind === 'wapi.sent') return <SendIcon fontSize="small" />;
  if (kind === 'wapi.delivered') return <DoneIcon fontSize="small" />;
  if (kind === 'wapi.read') return <DoneAllIcon fontSize="small" />;
  if (kind === 'wapi.failed') return <ErrorOutlineIcon fontSize="small" />;
  if (kind === 'wapi.message.in') return <InboxIcon fontSize="small" />;
  if (kind === 'wapi.message.out') return <CallMadeIcon fontSize="small" />;
  if (kind.startsWith('wapi.')) return <WhatsAppIcon fontSize="small" />;
  return <HistoryIcon fontSize="small" />;
}

function kindColor(kind: TimelineKind): string {
  if (kind === 'email.failed' || kind === 'email.bounced' || kind === 'wapi.failed') return 'error.main';
  if (kind === 'email.opened' || kind === 'email.clicked' || kind === 'wapi.read') return 'success.main';
  if (kind.startsWith('email.')) return 'info.main';
  if (kind.startsWith('wapi.')) return 'success.dark';
  return 'grey.500';
}
