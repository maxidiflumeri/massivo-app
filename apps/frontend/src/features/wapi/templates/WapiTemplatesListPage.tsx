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
  TextField,
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
import SmartButtonIcon from '@mui/icons-material/SmartButton';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
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
import { renderWhatsAppMarkdown } from './whatsappMarkdown';

const BUTTON_ACTIONS = ['INBOX', 'BAJA', 'IGNORAR'] as const;
type ButtonAction = (typeof BUTTON_ACTIONS)[number];

interface ButtonActionRow {
  buttonId: string;
  action: ButtonAction;
  payload: string;
}

interface QuickReplyOption {
  id: string;
  label: string;
}

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

  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<WapiTemplateDetail | null>(null);
  const [actionsRows, setActionsRows] = useState<ButtonActionRow[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actionsSaving, setActionsSaving] = useState(false);
  const [actionsDataKeys, setActionsDataKeys] = useState<string[]>([]);

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

  async function handleOpenActions(t: WapiTemplateListItem) {
    setActionsOpen(true);
    setActionsTarget(null);
    setActionsRows([]);
    setActionsDataKeys([]);
    setActionsLoading(true);
    try {
      const [detail, keys] = await Promise.all([
        api.get<WapiTemplateDetail>(`/api/wapi/templates/${t.id}`),
        api.get<string[]>(`/api/wapi/templates/${t.id}/data-keys`).catch(() => []),
      ]);
      setActionsTarget(detail);
      setActionsRows(parseButtonActions(detail.buttonActions));
      setActionsDataKeys(keys);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cargando template');
      setActionsOpen(false);
    } finally {
      setActionsLoading(false);
    }
  }

  function handleAddActionRow() {
    setActionsRows((rows) => [...rows, { buttonId: '', action: 'INBOX', payload: '' }]);
  }

  function handleChangeActionRow(idx: number, patch: Partial<ButtonActionRow>) {
    setActionsRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleRemoveActionRow(idx: number) {
    setActionsRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleSaveActions() {
    if (!actionsTarget) return;
    const map: Record<string, { action: ButtonAction; payload?: string }> = {};
    for (const row of actionsRows) {
      const key = row.buttonId.trim();
      if (!key) continue;
      const payload = row.payload.trim();
      map[key] = payload ? { action: row.action, payload } : { action: row.action };
    }
    setActionsSaving(true);
    try {
      await api.patch(`/api/wapi/templates/${actionsTarget.id}`, {
        buttonActions: map,
      });
      notify.success('Acciones de botones guardadas');
      setActionsOpen(false);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setActionsSaving(false);
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
                    <Tooltip title="Acciones de botones">
                      <IconButton size="small" onClick={() => handleOpenActions(t)}>
                        <SmartButtonIcon fontSize="small" />
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

      {/* Button actions dialog */}
      <Dialog
        open={actionsOpen}
        onClose={() => !actionsSaving && setActionsOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Acciones de botones
          {actionsTarget && (
            <Typography variant="caption" component="div" color="text.secondary">
              {actionsTarget.metaName} · {actionsTarget.language}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {actionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <ActionsEditor
              components={actionsTarget?.components ?? []}
              rows={actionsRows}
              dataKeys={actionsDataKeys}
              onChange={handleChangeActionRow}
              onAdd={handleAddActionRow}
              onRemove={handleRemoveActionRow}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionsOpen(false)} disabled={actionsSaving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveActions}
            disabled={actionsLoading || actionsSaving}
            startIcon={actionsSaving ? <CircularProgress size={16} /> : null}
          >
            {actionsSaving ? 'Guardando…' : 'Guardar'}
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

function ActionsEditor({
  components,
  rows,
  dataKeys,
  onChange,
  onAdd,
  onRemove,
}: {
  components: WapiTemplateComponent[];
  rows: ButtonActionRow[];
  dataKeys: string[];
  onChange: (idx: number, patch: Partial<ButtonActionRow>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  const options = quickReplyOptions(components);
  const usedIds = new Set(rows.map((r) => r.buttonId).filter(Boolean));
  const noQuickReplies = options.length === 0;

  function appendVar(idx: number, key: string) {
    const row = rows[idx];
    if (!row) return;
    const next = `${row.payload}${row.payload && !row.payload.endsWith(' ') ? ' ' : ''}{{${key}}}`;
    onChange(idx, { payload: next });
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Asigná qué hace Massivo cuando un contacto presiona un botón Quick Reply de este
        template. Los botones URL/Phone no disparan webhook, así que no aparecen acá.
      </Typography>
      {noQuickReplies && (
        <Typography variant="body2" color="warning.main">
          Este template no tiene botones Quick Reply.
        </Typography>
      )}
      <Box
        sx={{
          p: 1.5,
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'grey.50'),
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          <strong>Payload</strong> (opcional): texto libre que se persiste con la acción
          para uso posterior (ej. categoría, código de campaña, dato a loguear).
          Podés interpolar variables del contacto con la sintaxis{' '}
          <code>{`{{nombre_columna}}`}</code>, igual que en el body del template.
        </Typography>
        {dataKeys.length > 0 ? (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Variables disponibles (de las campañas que usaron este template):
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {dataKeys.map((k) => (
                <Chip key={k} size="small" variant="outlined" label={`{{${k}}}`} />
              ))}
            </Stack>
          </>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
            Aún no hay datos de contactos para sugerir variables. Cuando uses este
            template en una campaña con CSV, las columnas aparecerán acá.
          </Typography>
        )}
      </Box>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
          Sin acciones configuradas. Se aplican los defaults INBOX/BAJA/IGNORAR
          (case-insensitive) si el texto del botón coincide.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {rows.map((row, idx) => {
            const available = options.filter(
              (o) => o.id === row.buttonId || !usedIds.has(o.id),
            );
            const missing = row.buttonId && !options.some((o) => o.id === row.buttonId);
            return (
              <Stack key={idx} direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ flex: 1 }} error={Boolean(missing)}>
                  <Select
                    displayEmpty
                    value={row.buttonId}
                    onChange={(e) => onChange(idx, { buttonId: e.target.value })}
                  >
                    <MenuItem value="">
                      <em>Elegí un botón…</em>
                    </MenuItem>
                    {available.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.label}
                      </MenuItem>
                    ))}
                    {missing && (
                      <MenuItem value={row.buttonId}>{row.buttonId} (no existe)</MenuItem>
                    )}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <Select
                    value={row.action}
                    onChange={(e) =>
                      onChange(idx, { action: e.target.value as ButtonAction })
                    }
                  >
                    {BUTTON_ACTIONS.map((a) => (
                      <MenuItem key={a} value={a}>
                        {a}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder="payload (opcional, soporta {{var}})"
                  value={row.payload}
                  onChange={(e) => onChange(idx, { payload: e.target.value })}
                  sx={{ flex: 1.5 }}
                />
                {dataKeys.length > 0 && (
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select
                      displayEmpty
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) appendVar(idx, String(v));
                      }}
                      renderValue={() => 'Insertar var…'}
                    >
                      {dataKeys.map((k) => (
                        <MenuItem key={k} value={k}>
                          {`{{${k}}}`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <IconButton size="small" color="error" onClick={() => onRemove(idx)}>
                  <RemoveCircleOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
      )}
      <Box>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={onAdd}
          disabled={noQuickReplies || rows.length >= options.length}
        >
          Agregar acción
        </Button>
      </Box>
    </Stack>
  );
}

function parseButtonActions(value: unknown): ButtonActionRow[] {
  if (!value || typeof value !== 'object') return [];
  const out: ButtonActionRow[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    let action: string | null = null;
    let payload = '';
    if (typeof v === 'string') {
      action = v.toUpperCase();
    } else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      if (typeof obj.action === 'string') action = obj.action.toUpperCase();
      if (typeof obj.payload === 'string') payload = obj.payload;
    }
    if (action && (BUTTON_ACTIONS as readonly string[]).includes(action)) {
      out.push({ buttonId: k, action: action as ButtonAction, payload });
    }
  }
  return out;
}

function quickReplyOptions(components: WapiTemplateComponent[]): QuickReplyOption[] {
  const buttons = components.find((c) => c.type === 'BUTTONS');
  if (!buttons || !Array.isArray(buttons.buttons)) return [];
  const out: QuickReplyOption[] = [];
  for (const raw of buttons.buttons as Array<Record<string, unknown>>) {
    const type = String(raw.type ?? '').toUpperCase();
    if (type !== 'QUICK_REPLY') continue;
    const text = typeof raw.text === 'string' ? raw.text : '';
    if (!text) continue;
    out.push({ id: text, label: text });
  }
  return out;
}

function TemplatePreview({ components }: { components: WapiTemplateComponent[] }) {
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const footer = components.find((c) => c.type === 'FOOTER');
  const buttons = components.find((c) => c.type === 'BUTTONS');

  return (
    <Box
      sx={{
        bgcolor: (t) => (t.palette.mode === 'dark' ? '#0b141a' : '#e5ddd5'),
        borderRadius: 2,
        p: 1.5,
        minHeight: 160,
      }}
    >
      <Box
        sx={{
          bgcolor: (t) => (t.palette.mode === 'dark' ? '#1f2c34' : '#fff'),
          color: (t) => (t.palette.mode === 'dark' ? '#e9edef' : 'text.primary'),
          borderRadius: '6px 6px 6px 0',
          p: 1.5,
          maxWidth: 360,
          boxShadow: 1,
        }}
      >
        {header && header.format === 'TEXT' && header.text && (
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'inherit' }}>
            {renderWhatsAppMarkdown(header.text)}
          </Typography>
        )}
        {header && header.format && header.format !== 'TEXT' && (
          <Box
            sx={{
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'grey.200'),
              borderRadius: 1,
              py: 2,
              textAlign: 'center',
              mb: 1,
              fontSize: 12,
              color: (t) => (t.palette.mode === 'dark' ? 'rgba(233,237,239,0.7)' : 'text.secondary'),
            }}
          >
            [{header.format} header]
          </Box>
        )}
        {body?.text && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'inherit' }}>
            {renderWhatsAppMarkdown(body.text)}
          </Typography>
        )}
        {footer?.text && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              color: (t) => (t.palette.mode === 'dark' ? 'rgba(233,237,239,0.6)' : 'text.secondary'),
            }}
          >
            {renderWhatsAppMarkdown(footer.text)}
          </Typography>
        )}
        {buttons?.buttons && Array.isArray(buttons.buttons) && (
          <Stack
            spacing={0.5}
            sx={{
              mt: 1,
              pt: 1,
              borderTop: 1,
              borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'divider'),
            }}
          >
            {(buttons.buttons as Array<Record<string, unknown>>).map((b, i) => (
              <Box
                key={i}
                sx={{
                  textAlign: 'center',
                  py: 0.5,
                  color: (t) => (t.palette.mode === 'dark' ? '#53bdeb' : '#0084ff'),
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
