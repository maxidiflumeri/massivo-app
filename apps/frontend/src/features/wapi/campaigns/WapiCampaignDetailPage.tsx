import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import UploadIcon from '@mui/icons-material/Upload';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useApi } from '../../../api/client';
import { useTeamSocket } from '../../../realtime/useTeamSocket';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type {
  WapiCampaignConfig,
  WapiCampaignContactInput,
  WapiCampaignDetail,
  WapiCampaignReport,
  WapiCampaignStatus,
  WapiConfigListItem,
  WapiTemplateDetailFull,
  WapiTemplateListItem,
} from './types';
import { WapiCampaignSendsSection } from './WapiCampaignSendsSection';
import { WapiCampaignProcessingBanner } from './WapiCampaignProcessingBanner';

const REPORT_STATUSES: Array<{
  key: string;
  label: string;
  color: 'default' | 'info' | 'warning' | 'success' | 'error';
}> = [
  { key: 'PENDING', label: 'Pendientes', color: 'default' },
  { key: 'SENT', label: 'Enviados', color: 'success' },
  { key: 'DELIVERED', label: 'Entregados', color: 'info' },
  { key: 'READ', label: 'Leídos', color: 'info' },
  { key: 'FAILED', label: 'Fallidos', color: 'error' },
  { key: 'CANCELED', label: 'Cancelados', color: 'default' },
];

const STATUS_COLOR: Record<
  WapiCampaignStatus,
  'default' | 'info' | 'warning' | 'success' | 'error'
> = {
  DRAFT: 'default',
  SCHEDULED: 'info',
  PROCESSING: 'warning',
  PAUSED: 'warning',
  COMPLETED: 'success',
  FAILED: 'error',
};

const EDITABLE: ReadonlySet<WapiCampaignStatus> = new Set<WapiCampaignStatus>([
  'DRAFT',
  'SCHEDULED',
  'PAUSED',
]);

const PHONE_REGEX = /^\+?[0-9]{6,20}$/;

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Conserva el + inicial si lo trae, descarta espacios/guiones/paréntesis.
  const lead = trimmed.startsWith('+') ? '+' : '';
  return lead + trimmed.replace(/[^0-9]/g, '');
}

function parseContactsCsv(text: string): {
  contacts: WapiCampaignContactInput[];
  errors: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { contacts: [], errors: ['Vacío'] };

  const first = lines[0]!.toLowerCase();
  let headers: string[] | null = null;
  let dataLines = lines;
  if (first.includes('phone') || first.includes('telefono') || first.includes('teléfono')) {
    headers = lines[0]!.split(/[,;\t]/).map((h) => h.trim().toLowerCase());
    dataLines = lines.slice(1);
  }

  const contacts: WapiCampaignContactInput[] = [];
  const errors: string[] = [];
  dataLines.forEach((line, idx) => {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    let phone: string | undefined;
    let name: string | undefined;
    const data: Record<string, unknown> = {};
    if (headers) {
      headers.forEach((h, i) => {
        const v = cols[i] ?? '';
        if (h === 'phone' || h === 'telefono' || h === 'teléfono') {
          phone = v;
          return;
        }
        if (h === 'name' || h === 'nombre') name = v;
        if (v) data[h] = v;
      });
    } else {
      phone = cols[0];
      if (cols[1]) name = cols[1];
    }
    const normalized = normalizePhone(phone ?? '');
    if (!PHONE_REGEX.test(normalized)) {
      errors.push(`Línea ${idx + 1}: teléfono inválido`);
      return;
    }
    contacts.push({
      phone: normalized,
      name: name || undefined,
      data: Object.keys(data).length ? data : undefined,
    });
  });
  return { contacts, errors };
}

export function WapiCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<WapiCampaignDetail | null>(null);
  const [report, setReport] = useState<WapiCampaignReport | null>(null);
  const [templates, setTemplates] = useState<WapiTemplateListItem[]>([]);
  const [configs, setConfigs] = useState<WapiConfigListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const socket = useTeamSocket();

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [configId, setConfigId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [templateDetail, setTemplateDetail] = useState<WapiTemplateDetailFull | null>(null);
  const [savedDataKeys, setSavedDataKeys] = useState<string[]>([]);
  // 4.Q — override per-campaña del throttle (campaign.config.delay*).
  const [delayOverride, setDelayOverride] = useState(false);
  const [delayMinSec, setDelayMinSec] = useState('30');
  const [delayMaxSec, setDelayMaxSec] = useState('60');

  const [contactsText, setContactsText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionsBusy, setActionsBusy] = useState(false);

  const editable = campaign ? EDITABLE.has(campaign.status) : false;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, tpls, cfgs] = await Promise.all([
        api.get<WapiCampaignDetail>(`/api/wapi/campaigns/${id}`),
        api.get<WapiTemplateListItem[]>('/api/wapi/templates'),
        api.get<WapiConfigListItem[]>('/api/wapi/configs'),
      ]);
      setCampaign(c);
      setTemplates(tpls);
      setConfigs(cfgs);
      setName(c.name);
      setTemplateId(c.templateId ?? '');
      setConfigId(c.configId ?? '');
      setScheduledAt(c.scheduledAt ? c.scheduledAt.slice(0, 16) : '');
      const cfg = (c.config ?? {}) as WapiCampaignConfig;
      setBodyVars(Array.isArray(cfg.bodyVars) ? cfg.bodyVars : []);
      const hasOverride =
        typeof cfg.delayMinMs === 'number' || typeof cfg.delayMaxMs === 'number';
      setDelayOverride(hasOverride);
      if (typeof cfg.delayMinMs === 'number') {
        setDelayMinSec(String(Math.round(cfg.delayMinMs / 1000)));
      }
      if (typeof cfg.delayMaxMs === 'number') {
        setDelayMaxSec(String(Math.round(cfg.delayMaxMs / 1000)));
      }
      setError(null);
      try {
        const keys = await api.get<string[]>(`/api/wapi/campaigns/${id}/contacts/data-keys`);
        setSavedDataKeys(keys);
      } catch {
        setSavedDataKeys([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando campaña');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadReport = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get<WapiCampaignReport>(`/api/wapi/campaigns/${id}/report`);
      setReport(r);
    } catch {
      // silencioso
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadReport();
  }, [loadReport, liveTick]);

  useEffect(() => {
    if (!socket || !id) return;
    const handler = (payload: { campaignId?: string }) => {
      if (payload?.campaignId !== id) return;
      setLiveTick((t) => t + 1);
      void load();
    };
    socket.on('wapi.report.updated', handler);
    return () => {
      socket.off('wapi.report.updated', handler);
    };
  }, [socket, id, load]);

  const parsed = useMemo(() => parseContactsCsv(contactsText), [contactsText]);

  useEffect(() => {
    if (!templateId) {
      setTemplateDetail(null);
      return;
    }
    let cancelled = false;
    api
      .get<WapiTemplateDetailFull>(`/api/wapi/templates/${templateId}`)
      .then((d) => {
        if (!cancelled) setTemplateDetail(d);
      })
      .catch(() => {
        if (!cancelled) setTemplateDetail(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const templateBodyText = useMemo(() => {
    const comps = templateDetail?.components;
    if (!Array.isArray(comps)) return '';
    const body = comps.find((c) => (c.type ?? '').toUpperCase() === 'BODY');
    return body?.text ?? '';
  }, [templateDetail]);

  const bodyVarsCount = useMemo(() => {
    const matches = templateBodyText.match(/\{\{(\d+)\}\}/g) ?? [];
    let max = 0;
    for (const m of matches) {
      const n = Number(m.replace(/[^0-9]/g, ''));
      if (n > max) max = n;
    }
    return max;
  }, [templateBodyText]);

  useEffect(() => {
    setBodyVars((prev) => {
      if (prev.length === bodyVarsCount) return prev;
      const next = [...prev];
      while (next.length < bodyVarsCount) next.push('');
      next.length = bodyVarsCount;
      return next;
    });
  }, [bodyVarsCount]);

  const csvColumnSuggestions = useMemo(() => {
    const keys = new Set<string>();
    for (const k of savedDataKeys) keys.add(k);
    for (const c of parsed.contacts) {
      if (c.data) for (const k of Object.keys(c.data)) keys.add(k);
    }
    return Array.from(keys).sort();
  }, [parsed.contacts, savedDataKeys]);

  async function handleSave() {
    if (!campaign) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name };
      payload.templateId = templateId || null;
      payload.configId = configId || null;
      payload.scheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const cfg: WapiCampaignConfig = {};
      if (bodyVarsCount > 0) cfg.bodyVars = bodyVars.slice(0, bodyVarsCount);
      if (delayOverride) {
        const minSec = Number(delayMinSec);
        const maxSec = Number(delayMaxSec);
        if (!Number.isFinite(minSec) || !Number.isFinite(maxSec) || minSec < 1 || maxSec < 1) {
          throw new Error('Velocidad inválida: min/max deben ser >= 1 segundo');
        }
        if (minSec > maxSec) {
          throw new Error('Velocidad: el mínimo debe ser ≤ al máximo');
        }
        cfg.delayMinMs = Math.round(minSec * 1000);
        cfg.delayMaxMs = Math.round(maxSec * 1000);
      }
      payload.config = Object.keys(cfg).length > 0 ? cfg : null;
      await api.patch(`/api/wapi/campaigns/${campaign.id}`, payload);
      notify.success('Cambios guardados');
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadContacts() {
    if (!campaign || parsed.contacts.length === 0) return;
    setUploading(true);
    try {
      const res = await api.post<{ created: number }>(
        `/api/wapi/campaigns/${campaign.id}/contacts`,
        { contacts: parsed.contacts },
      );
      notify.success(
        `${res.created} contacto${res.created === 1 ? '' : 's'} agregado${res.created === 1 ? '' : 's'}`,
      );
      setContactsText('');
      await load();
      try {
        const keys = await api.get<string[]>(
          `/api/wapi/campaigns/${campaign.id}/contacts/data-keys`,
        );
        setSavedDataKeys(keys);
      } catch {
        // silencioso
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error subiendo contactos');
    } finally {
      setUploading(false);
    }
  }

  async function handlePause() {
    if (!campaign) return;
    setActionsBusy(true);
    try {
      await api.post(`/api/wapi/campaigns/${campaign.id}/pause`, {});
      notify.success('Campaña pausada');
      await Promise.all([load(), loadReport()]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error pausando');
    } finally {
      setActionsBusy(false);
    }
  }

  async function handleResume() {
    if (!campaign) return;
    setActionsBusy(true);
    try {
      const res = await api.post<{ resumed: true; reEnqueued: number }>(
        `/api/wapi/campaigns/${campaign.id}/resume`,
        {},
      );
      notify.success(`Campaña reanudada (${res.reEnqueued} pendientes re-encolados)`);
      await Promise.all([load(), loadReport()]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error reanudando');
    } finally {
      setActionsBusy(false);
    }
  }

  async function handleForceClose() {
    if (!campaign) return;
    const ok = await confirm({
      title: 'Forzar cierre de la campaña',
      message: `Vas a cerrar "${campaign.name}" y cancelar todos los envíos pendientes.\nEsta acción no se puede deshacer.`,
      confirmText: 'Forzar cierre',
      destructive: true,
    });
    if (!ok) return;
    setActionsBusy(true);
    try {
      const res = await api.post<{ closed: true; canceled: number }>(
        `/api/wapi/campaigns/${campaign.id}/force-close`,
        {},
      );
      notify.success(`Campaña cerrada (${res.canceled} pendientes cancelados)`);
      await Promise.all([load(), loadReport()]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error cerrando campaña');
    } finally {
      setActionsBusy(false);
    }
  }

  async function handleSend() {
    if (!campaign) return;
    const ok = await confirm({
      title: 'Enviar campaña',
      message: `Vas a enviar "${campaign.name}" a ${campaign._count.contacts} contacto${campaign._count.contacts === 1 ? '' : 's'} por WhatsApp.\nEsta acción no se puede deshacer una vez encolada.`,
      confirmText: 'Enviar',
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await api.post<{ enqueued: number }>(
        `/api/wapi/campaigns/${campaign.id}/send`,
        {},
      );
      notify.success(`Encolados ${res.enqueued} envíos`);
      await Promise.all([load(), loadReport()]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error enviando');
    } finally {
      setSending(false);
    }
  }

  if (!campaign && !error) {
    return (
      <Stack spacing={3}>
        <Skeleton variant="rectangular" height={48} />
        <Skeleton variant="rectangular" height={240} />
        <Skeleton variant="rectangular" height={200} />
      </Stack>
    );
  }

  if (!campaign) {
    return <Alert severity="error">{error ?? 'No se pudo cargar'}</Alert>;
  }

  const savedBodyVars = (() => {
    const cfg = (campaign.config ?? {}) as WapiCampaignConfig;
    return Array.isArray(cfg.bodyVars) ? cfg.bodyVars : [];
  })();
  const varsSatisfied =
    bodyVarsCount === 0 ||
    (savedBodyVars.length === bodyVarsCount &&
      savedBodyVars.every((v) => typeof v === 'string' && v.trim().length > 0));
  const canSend =
    editable &&
    campaign._count.contacts > 0 &&
    !!campaign.templateId &&
    !!campaign.configId &&
    varsSatisfied;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button onClick={() => navigate('/dashboard/wapi/campaigns')}>← Campañas</Button>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <WhatsAppIcon color="success" />
          <Typography variant="h4" noWrap>
            {campaign.name}
          </Typography>
        </Stack>
        <Chip label={campaign.status} color={STATUS_COLOR[campaign.status]} />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {(campaign.status === 'PROCESSING' || campaign.status === 'PAUSED') && (
        <WapiCampaignProcessingBanner
          campaignId={campaign.id}
          totalReports={campaign._count.reports}
          report={report}
          socket={socket}
          status={campaign.status}
          onPause={handlePause}
          onResume={handleResume}
          onForceClose={handleForceClose}
          actionsBusy={actionsBusy}
        />
      )}

      {report &&
        (campaign.status === 'PROCESSING' ||
          campaign.status === 'COMPLETED' ||
          campaign._count.reports > 0) && (
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Typography variant="h6">Resultados</Typography>
              {socket?.connected ? (
                <Chip size="small" label="● en vivo" color="success" variant="outlined" />
              ) : (
                <Chip size="small" label="○ desconectado" variant="outlined" />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {REPORT_STATUSES.map((s) => (
                <Box
                  key={s.key}
                  sx={{
                    flex: '1 1 140px',
                    p: 2,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {s.label}
                  </Typography>
                  <Typography variant="h5" color={`${s.color}.main`}>
                    {report.counts[s.key as keyof typeof report.counts] ?? 0}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 140px', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Tasa entrega
                </Typography>
                <Typography variant="h6">
                  {report.funnel.sent > 0
                    ? `${((report.funnel.delivered / report.funnel.sent) * 100).toFixed(1)}%`
                    : '—'}
                </Typography>
              </Box>
              <Box sx={{ flex: '1 1 140px', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Tasa lectura
                </Typography>
                <Typography variant="h6">
                  {report.funnel.delivered > 0
                    ? `${((report.funnel.read / report.funnel.delivered) * 100).toFixed(1)}%`
                    : '—'}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Configuración
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!editable}
            inputProps={{ maxLength: 160 }}
            fullWidth
          />
          <FormControl fullWidth disabled={!editable}>
            <InputLabel>Template</InputLabel>
            <Select
              label="Template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <MenuItem value="">
                <em>Ninguno</em>
              </MenuItem>
              {templates.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.metaName}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {t.language}
                    {t.category ? ` · ${t.category}` : ''}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {templateId && bodyVarsCount > 0 && (
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Variables del template ({bodyVarsCount})
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Asigná a cada <code>{'{{N}}'}</code> el nombre de la columna del CSV. Por ejemplo,
                si tu CSV tiene la columna <code>firstName</code>, escribí <code>firstName</code>{' '}
                para <code>{'{{1}}'}</code>.
              </Typography>
              {templateBodyText && (
                <Typography
                  variant="body2"
                  sx={{
                    mb: 2,
                    p: 1,
                    bgcolor: 'background.default',
                    borderRadius: 0.5,
                    whiteSpace: 'pre-wrap',
                    fontStyle: 'italic',
                  }}
                >
                  {templateBodyText}
                </Typography>
              )}
              <Stack spacing={1.5}>
                {csvColumnSuggestions.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Pegá un CSV con header abajo para auto-detectar columnas, o escribí el nombre
                    de la columna manualmente.
                  </Typography>
                )}
                {Array.from({ length: bodyVarsCount }).map((_, i) =>
                  csvColumnSuggestions.length > 0 ? (
                    <FormControl key={i} fullWidth size="small" disabled={!editable}>
                      <InputLabel>{`Columna para {{${i + 1}}}`}</InputLabel>
                      <Select
                        label={`Columna para {{${i + 1}}}`}
                        value={bodyVars[i] ?? ''}
                        onChange={(e) => {
                          const next = [...bodyVars];
                          next[i] = e.target.value;
                          setBodyVars(next);
                        }}
                      >
                        <MenuItem value="">
                          <em>— elegir —</em>
                        </MenuItem>
                        {csvColumnSuggestions.map((col) => (
                          <MenuItem key={col} value={col}>
                            {col}
                          </MenuItem>
                        ))}
                        {bodyVars[i] && !csvColumnSuggestions.includes(bodyVars[i]!) && (
                          <MenuItem value={bodyVars[i]}>{bodyVars[i]}</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      key={i}
                      size="small"
                      label={`Columna para {{${i + 1}}}`}
                      value={bodyVars[i] ?? ''}
                      onChange={(e) => {
                        const next = [...bodyVars];
                        next[i] = e.target.value;
                        setBodyVars(next);
                      }}
                      disabled={!editable}
                      fullWidth
                    />
                  ),
                )}
              </Stack>
            </Box>
          )}
          <FormControl fullWidth disabled={!editable}>
            <InputLabel>Número origen</InputLabel>
            <Select
              label="Número origen"
              value={configId}
              onChange={(e) => setConfigId(e.target.value)}
            >
              <MenuItem value="">
                <em>Ninguno</em>
              </MenuItem>
              {configs.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {c.phoneNumberId}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={delayOverride}
                  onChange={(e) => setDelayOverride(e.target.checked)}
                  disabled={!editable}
                />
              }
              label={
                <Stack>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Pisar velocidad de envío para esta campaña
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Si está apagado, se usa el throttle del número origen. Activalo solo cuando
                    necesites una cadencia distinta puntual.
                  </Typography>
                </Stack>
              }
            />
            <Collapse in={delayOverride} unmountOnExit>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1.5 }}>
                <TextField
                  label="Mínimo (segundos)"
                  type="number"
                  fullWidth
                  size="small"
                  value={delayMinSec}
                  onChange={(e) => setDelayMinSec(e.target.value)}
                  disabled={!editable}
                  inputProps={{ min: 1, max: 3600 }}
                />
                <TextField
                  label="Máximo (segundos)"
                  type="number"
                  fullWidth
                  size="small"
                  value={delayMaxSec}
                  onChange={(e) => setDelayMaxSec(e.target.value)}
                  disabled={!editable}
                  inputProps={{ min: 1, max: 3600 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {(() => {
                  const min = Number(delayMinSec);
                  const max = Number(delayMaxSec);
                  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
                    return 'Ingresá min y max válidos.';
                  }
                  const avg = (min + max) / 2;
                  return `~${(60 / avg).toFixed(1)} envíos/min · ~${Math.round(3600 / avg)}/hora`;
                })()}
              </Typography>
            </Collapse>
          </Box>
          <TextField
            label="Programada para"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={!editable}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={!editable || saving}
            >
              Guardar
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<SendIcon />}
              onClick={handleSend}
              disabled={!canSend || sending}
            >
              Enviar ahora
            </Button>
          </Box>
          {!canSend && editable && (
            <Typography variant="caption" color="text.secondary">
              Para enviar: template + número origen + al menos 1 contacto
              {bodyVarsCount > 0 ? ' + variables mapeadas y guardadas' : ''}.
            </Typography>
          )}
        </Stack>
      </Paper>

      {campaign._count.reports > 0 && (
        <WapiCampaignSendsSection campaignId={campaign.id} refreshKey={liveTick} />
      )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Contactos ({campaign._count.contacts})
        </Typography>
        <Divider sx={{ mb: 2 }} />
        {editable ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Pegá CSV o líneas con <code>phone[,name]</code>. Si la primera fila contiene{' '}
              <code>phone</code>, se trata como header (acepta columnas extra como variables del
              template — ej: <code>firstName</code>). Los teléfonos se normalizan automáticamente
              (espacios y guiones se descartan).
            </Typography>
            <TextField
              multiline
              minRows={6}
              maxRows={16}
              fullWidth
              placeholder={'phone,name,firstName\n+5491100000001,Juan Pérez,Juan\n+5491100000002,Ana Gómez,Ana'}
              value={contactsText}
              onChange={(e) => setContactsText(e.target.value)}
            />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={handleUploadContacts}
                disabled={parsed.contacts.length === 0 || uploading}
              >
                Agregar {parsed.contacts.length} contacto
                {parsed.contacts.length === 1 ? '' : 's'}
              </Button>
              {parsed.errors.length > 0 && (
                <Typography variant="caption" color="error">
                  {parsed.errors.length} línea(s) inválidas
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Typography color="text.secondary">
            La campaña está en estado {campaign.status} — no se pueden modificar contactos.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
