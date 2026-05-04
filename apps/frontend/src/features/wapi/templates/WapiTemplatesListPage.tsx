import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type {
  WapiConfigOption,
  WapiSyncSummary,
  WapiTemplateComponent,
  WapiTemplateDetail,
  WapiTemplateListItem,
} from './types';

const STATUS_COLOR: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  IN_REVIEW: 'warning',
  REJECTED: 'error',
  PAUSED: 'default',
  DISABLED: 'default',
};

export function WapiTemplatesListPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<WapiTemplateListItem[] | null>(null);
  const [configs, setConfigs] = useState<WapiConfigOption[]>([]);

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncConfigId, setSyncConfigId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<WapiSyncSummary | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<WapiTemplateDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load() {
    try {
      const [tpls, cfgs] = await Promise.all([
        api.get<WapiTemplateListItem[]>('/api/wapi/templates'),
        api.get<WapiConfigOption[]>('/api/wapi/configs'),
      ]);
      setItems(tpls);
      setConfigs(cfgs);
      if (cfgs.length > 0 && !syncConfigId) setSyncConfigId(cfgs[0]!.id);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando templates');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenSync() {
    if (configs.length === 0) {
      notify.error('Necesitás al menos una config WhatsApp para sincronizar');
      return;
    }
    setSyncSummary(null);
    setSyncOpen(true);
  }

  async function handleRunSync() {
    if (!syncConfigId) return;
    setSyncing(true);
    setSyncSummary(null);
    try {
      const res = await api.post<WapiSyncSummary>(
        `/api/wapi/templates/sync/${syncConfigId}`,
        {},
      );
      setSyncSummary(res);
      notify.success(
        `Sync OK · ${res.created} nuevos, ${res.updated} actualizados, ${res.skipped} sin cambios`,
      );
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error sincronizando');
    } finally {
      setSyncing(false);
    }
  }

  async function handlePreview(t: WapiTemplateListItem) {
    setPreviewOpen(true);
    setPreviewTarget(null);
    setPreviewLoading(true);
    try {
      const detail = await api.get<WapiTemplateDetail>(`/api/wapi/templates/${t.id}`);
      setPreviewTarget(detail);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando template');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDelete(t: WapiTemplateListItem) {
    const ok = await confirm({
      title: 'Borrar template',
      message: `¿Seguro que querés borrar "${t.metaName}" del catálogo local? Esto NO lo borra de Meta.`,
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/wapi/templates/${t.id}`);
      notify.success('Template eliminada del catálogo local');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error borrando');
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <DescriptionIcon color="success" />
          <Typography variant="h4">Templates WhatsApp</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={handleOpenSync}
            disabled={configs.length === 0}
          >
            Sincronizar desde Meta
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            component={RouterLink}
            to="/dashboard/wapi/templates/new"
            disabled={configs.length === 0}
          >
            Nuevo template
          </Button>
        </Stack>
      </Box>

      <Typography variant="body2" color="text.secondary">
        Catálogo local de templates. Podés crearlos desde Massivo (los enviamos a Meta para
        revisión) o sincronizar los que ya existan en{' '}
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Meta Business Manager
        </a>
        .
      </Typography>

      {items === null && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={48} />
            ))}
          </Stack>
        </Paper>
      )}

      {items !== null && items.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <DescriptionIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" gutterBottom>
            No hay templates sincronizados todavía.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={handleOpenSync}
            disabled={configs.length === 0}
            sx={{ mt: 2 }}
          >
            Sincronizar desde Meta
          </Button>
          {configs.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Primero creá una config en Configs WhatsApp.
            </Typography>
          )}
        </Paper>
      )}

      {items !== null && items.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre Meta</TableCell>
                <TableCell>Idioma</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Categoría</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  Sincronizada
                </TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ fontWeight: 500, fontFamily: 'monospace', fontSize: 13 }}>
                    {t.metaName}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={t.language} variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {t.category}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t.status}
                      color={STATUS_COLOR[t.status] ?? 'default'}
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {new Date(t.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Ver contenido">
                      <IconButton size="small" onClick={() => handlePreview(t)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Borrar del catálogo local">
                      <IconButton size="small" color="error" onClick={() => handleDelete(t)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Sync dialog */}
      <Dialog open={syncOpen} onClose={() => !syncing && setSyncOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Sincronizar templates desde Meta</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Elegí la config (WABA) desde la cual traer los templates. El sync es idempotente:
              solo se actualizan los que cambiaron en Meta.
            </Typography>
            <FormControl fullWidth disabled={syncing}>
              <InputLabel>Config</InputLabel>
              <Select
                label="Config"
                value={syncConfigId}
                onChange={(e) => setSyncConfigId(e.target.value)}
              >
                {configs.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name ?? c.phoneNumberId}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      WABA {c.businessAccountId}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {syncSummary && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Resumen del sync
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={`Fetched: ${syncSummary.fetched}`} />
                  <Chip size="small" color="success" label={`Nuevos: ${syncSummary.created}`} />
                  <Chip size="small" color="info" label={`Actualizados: ${syncSummary.updated}`} />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Sin cambios: ${syncSummary.skipped}`}
                  />
                  <Chip size="small" variant="outlined" label={`Páginas: ${syncSummary.pages}`} />
                </Stack>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncOpen(false)} disabled={syncing}>
            Cerrar
          </Button>
          <Button
            variant="contained"
            startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
            onClick={handleRunSync}
            disabled={!syncConfigId || syncing}
          >
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Preview dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {previewTarget?.metaName ?? 'Template'}
          {previewTarget && (
            <Typography variant="caption" component="div" color="text.secondary">
              {previewTarget.language} · {previewTarget.category} · {previewTarget.status}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {previewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : previewTarget ? (
            <TemplatePreview components={previewTarget.components ?? []} />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function TemplatePreview({ components }: { components: WapiTemplateComponent[] }) {
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const footer = components.find((c) => c.type === 'FOOTER');
  const buttons = components.find((c) => c.type === 'BUTTONS');

  return (
    <Box
      sx={{
        bgcolor: '#e5ddd5',
        borderRadius: 2,
        p: 1.5,
        minHeight: 160,
      }}
    >
      <Box
        sx={{
          bgcolor: '#fff',
          borderRadius: '6px 6px 6px 0',
          p: 1.5,
          maxWidth: 360,
          boxShadow: 1,
        }}
      >
        {header && header.format === 'TEXT' && header.text && (
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {header.text}
          </Typography>
        )}
        {header && header.format && header.format !== 'TEXT' && (
          <Box
            sx={{
              bgcolor: 'grey.200',
              borderRadius: 1,
              py: 2,
              textAlign: 'center',
              mb: 1,
              fontSize: 12,
              color: 'text.secondary',
            }}
          >
            [{header.format} header]
          </Box>
        )}
        {body?.text && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary' }}>
            {body.text}
          </Typography>
        )}
        {footer?.text && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1, color: 'text.secondary' }}
          >
            {footer.text}
          </Typography>
        )}
        {buttons?.buttons && Array.isArray(buttons.buttons) && (
          <Stack spacing={0.5} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            {(buttons.buttons as Array<Record<string, unknown>>).map((b, i) => (
              <Box
                key={i}
                sx={{
                  textAlign: 'center',
                  py: 0.5,
                  color: '#0084ff',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {String(b.text ?? b.type ?? `Botón ${i + 1}`)}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
