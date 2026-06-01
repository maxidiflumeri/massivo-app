import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import UploadIcon from '@mui/icons-material/Upload';
import { useApi } from '../../../api/client';
import { useTeamSocket } from '../../../realtime/useTeamSocket';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type { EmailTemplate } from '../templates/types';
import type {
  CampaignContactInput,
  CampaignDetail,
  CampaignReport,
  CampaignStatus,
  SmtpAccountListItem,
} from './types';
import { CampaignSendsSection } from './CampaignSendsSection';
import { CampaignProcessingBanner } from './CampaignProcessingBanner';
import { ExportReportButton } from '../reports/ExportReportButton';
import { CsvContactsInput, type CsvValidationResult } from '../../../components/CsvContactsInput';

const REPORT_STATUSES: Array<{ key: string; label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = [
  { key: 'PENDING', label: 'Pendientes', color: 'default' },
  { key: 'SENT', label: 'Enviados', color: 'success' },
  { key: 'FAILED', label: 'Fallidos', color: 'error' },
  { key: 'BOUNCED', label: 'Bounced', color: 'error' },
  { key: 'COMPLAINED', label: 'Complaints', color: 'warning' },
  { key: 'SUPPRESSED', label: 'Suprimidos', color: 'default' },
];

const STATUS_COLOR: Record<CampaignStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'default',
  SCHEDULED: 'info',
  PROCESSING: 'warning',
  PAUSED: 'warning',
  COMPLETED: 'success',
  FAILED: 'error',
};

const EDITABLE: ReadonlySet<CampaignStatus> = new Set<CampaignStatus>(['DRAFT', 'SCHEDULED', 'PAUSED']);

const STRONG_KEY_HEADERS = new Set([
  'externalid',
  'external_id',
  'idexterno',
  'id_externo',
  'dni',
  'documento',
  'cuit',
]);
const RESERVED_HEADERS = new Set([
  'email',
  'externalid',
  'external_id',
  'idexterno',
  'id_externo',
  'dni',
  'documento',
  'cuit',
  'firstname',
  'first_name',
  'nombre',
  'lastname',
  'last_name',
  'apellido',
  'name',
]);

function parseContactsCsv(text: string): { contacts: CampaignContactInput[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { contacts: [], errors: ['Vacío'] };

  const first = lines[0].toLowerCase();
  let headers: string[] | null = null;
  let dataLines = lines;
  if (first.includes('email') || [...STRONG_KEY_HEADERS].some((h) => first.includes(h))) {
    headers = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
    dataLines = lines.slice(1);
  }

  if (headers && !headers.some((h) => STRONG_KEY_HEADERS.has(h))) {
    return {
      contacts: [],
      errors: ['Falta una columna externalId o dni (al menos una es obligatoria por fila).'],
    };
  }

  const contacts: CampaignContactInput[] = [];
  const errors: string[] = [];
  dataLines.forEach((line, idx) => {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    let email: string | undefined;
    let externalId: string | undefined;
    let dni: string | undefined;
    let cuit: string | undefined;
    let firstName: string | undefined;
    let lastName: string | undefined;
    let name: string | undefined;
    const data: Record<string, unknown> = {};

    if (headers) {
      headers.forEach((h, i) => {
        const v = cols[i] ?? '';
        if (!v) return;
        // Siempre guardamos en data para que variables del template
        // ({{nombre}}, {{phone}}, etc.) resuelvan sin importar si el
        // header coincide con un campo reservado del DTO.
        data[h] = v;
        if (h === 'email') email = v;
        else if (h === 'externalid' || h === 'external_id' || h === 'idexterno' || h === 'id_externo') externalId = v;
        else if (h === 'dni' || h === 'documento') dni = v;
        else if (h === 'cuit') cuit = v;
        else if (h === 'firstname' || h === 'first_name' || h === 'nombre') firstName = v;
        else if (h === 'lastname' || h === 'last_name' || h === 'apellido') lastName = v;
        else if (h === 'name') name = v;
      });
    } else {
      email = cols[0];
      if (cols[1]) name = cols[1];
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Línea ${idx + 1}: email inválido`);
      return;
    }
    if (!externalId && !dni) {
      errors.push(`Línea ${idx + 1}: falta externalId o dni`);
      return;
    }
    contacts.push({
      email,
      externalId,
      dni,
      cuit,
      firstName,
      lastName,
      name: name || undefined,
      data: Object.keys(data).length ? data : undefined,
    });
  });
  return { contacts, errors };
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccountListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const socket = useTeamSocket();

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [smtpAccountId, setSmtpAccountId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const [contactsText, setContactsText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionsBusy, setActionsBusy] = useState(false);

  const editable = campaign ? EDITABLE.has(campaign.status) : false;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, tpls, smtps] = await Promise.all([
        api.get<CampaignDetail>(`/api/email/campaigns/${id}`),
        api.get<EmailTemplate[]>('/api/email/templates'),
        api.get<SmtpAccountListItem[]>('/api/email/smtp-accounts'),
      ]);
      setCampaign(c);
      setTemplates(tpls);
      setSmtpAccounts(smtps);
      setName(c.name);
      setTemplateId(c.templateId ?? '');
      setSmtpAccountId(c.smtpAccountId ?? '');
      setScheduledAt(c.scheduledAt ? c.scheduledAt.slice(0, 16) : '');
      setReplyTo(c.replyTo ?? '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando campaña');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadReport = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get<CampaignReport>(`/api/email/campaigns/${id}/report`);
      setReport(r);
    } catch {
      // silencioso: el report puede no existir aún
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadReport();
  }, [loadReport, liveTick]);

  // Auto-refresh por socket: cuando llega email.report.updated del campaignId actual,
  // re-fetch report (y campaign para status si pasó a COMPLETED).
  useEffect(() => {
    if (!socket || !id) return;
    const handler = (payload: { campaignId?: string }) => {
      if (payload?.campaignId !== id) return;
      setLiveTick((t) => t + 1);
      void load();
    };
    socket.on('email.report.updated', handler);
    return () => {
      socket.off('email.report.updated', handler);
    };
  }, [socket, id, load]);

  const parsed = useMemo(() => parseContactsCsv(contactsText), [contactsText]);

  // Validación para el panel del CsvContactsInput.
  const csvValidation: CsvValidationResult = useMemo(() => {
    const lines = contactsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const first = lines[0]?.toLowerCase() ?? '';
    const looksLikeHeader = /email|externalid|external_id|idexterno|id_externo|dni|documento/.test(first);
    const totalDataLines = looksLikeHeader ? Math.max(0, lines.length - 1) : lines.length;
    const detectedColumns = looksLikeHeader
      ? lines[0]!.split(/[,;\t]/).map((h) => h.trim()).filter(Boolean)
      : [];
    return {
      totalDataLines,
      validRows: parsed.contacts.length,
      errors: parsed.errors,
      detectedColumns,
    };
  }, [contactsText, parsed]);

  async function handleSave() {
    if (!campaign) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name };
      payload.templateId = templateId || null;
      payload.smtpAccountId = smtpAccountId || null;
      payload.scheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      payload.replyTo = replyTo; // "" → backend lo mapea a null (volver al default del account)
      await api.patch(`/api/email/campaigns/${campaign.id}`, payload);
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
        `/api/email/campaigns/${campaign.id}/contacts`,
        { contacts: parsed.contacts },
      );
      notify.success(`${res.created} contacto${res.created === 1 ? '' : 's'} agregado${res.created === 1 ? '' : 's'}`);
      setContactsText('');
      await load();
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
      await api.post(`/api/email/campaigns/${campaign.id}/pause`, {});
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
        `/api/email/campaigns/${campaign.id}/resume`,
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
        `/api/email/campaigns/${campaign.id}/force-close`,
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
      message: `Vas a enviar "${campaign.name}" a ${campaign._count.contacts} contacto${campaign._count.contacts === 1 ? '' : 's'}.\nEsta acción no se puede deshacer una vez encolada.`,
      confirmText: 'Enviar',
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await api.post<{
        enqueued: number;
        quotaSkipped: number;
        quota: { planCode: string; limit: number | null; remaining: number | null };
      }>(`/api/email/campaigns/${campaign.id}/send`, {});
      if (res.quotaSkipped > 0) {
        const total = res.enqueued + res.quotaSkipped;
        notify.warning(
          res.enqueued === 0
            ? `Tu plan ${res.quota.planCode} llegó al límite mensual de emails: 0 de ${total} encolados, ${res.quotaSkipped} cancelados por cuota.`
            : `Llegaste al límite mensual del plan ${res.quota.planCode}: ${res.enqueued} de ${total} encolados, ${res.quotaSkipped} cancelados por cuota.`,
        );
      } else {
        notify.success(`Encolados ${res.enqueued} envíos`);
      }
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

  const canSend =
    editable &&
    campaign._count.contacts > 0 &&
    !!campaign.templateId &&
    !!campaign.smtpAccountId;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button onClick={() => navigate('/dashboard/email/campaigns')}>← Campañas</Button>
        <Typography variant="h4" sx={{ flex: 1 }}>
          {campaign.name}
        </Typography>
        <Chip label={campaign.status} color={STATUS_COLOR[campaign.status]} />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {(campaign.status === 'PROCESSING' || campaign.status === 'PAUSED') && (
        <CampaignProcessingBanner
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

      {report && (campaign.status === 'PROCESSING' || campaign.status === 'COMPLETED' || campaign._count.reports > 0) && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6">Resultados</Typography>
            {socket?.connected ? (
              <Chip size="small" label="● en vivo" color="success" variant="outlined" />
            ) : (
              <Chip size="small" label="○ desconectado" variant="outlined" />
            )}
            <Box sx={{ flex: 1 }} />
            <ExportReportButton
              kind="campaign-summary"
              filters={{ campaignId: campaign.id }}
              label="Resumen"
            />
            <ExportReportButton
              kind="campaign-reports"
              filters={{ campaignId: campaign.id }}
              label="Detalle por contacto"
            />
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
                <Typography variant="h5">{report.counts[s.key] ?? 0}</Typography>
              </Box>
            ))}
          </Box>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 140px', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Aperturas
              </Typography>
              <Typography variant="h6">
                {report.events.opens}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  ({report.events.uniqueOpens} únicas)
                </Typography>
              </Typography>
            </Box>
            <Box sx={{ flex: '1 1 140px', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Clicks
              </Typography>
              <Typography variant="h6">
                {report.events.clicks}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  ({report.events.uniqueClicks} únicos)
                </Typography>
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
                  {t.name} — <em style={{ marginLeft: 4, opacity: 0.7 }}>{t.subject}</em>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!editable}>
            <InputLabel>Cuenta SMTP</InputLabel>
            <Select
              label="Cuenta SMTP"
              value={smtpAccountId}
              onChange={(e) => setSmtpAccountId(e.target.value)}
            >
              <MenuItem value="">
                <em>Ninguna</em>
              </MenuItem>
              {smtpAccounts.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail} ({s.provider})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Programada para"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={!editable}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Reply-To (opcional)"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            disabled={!editable}
            placeholder="info@empresa.com"
            helperText="Pisa el Reply-To default de la cuenta SMTP. Dejar vacío = usa el de la cuenta. Las respuestas van a esta casilla en vez del From."
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
              Para enviar: template + cuenta SMTP + al menos 1 contacto.
            </Typography>
          )}
        </Stack>
      </Paper>

      {campaign._count.reports > 0 && (
        <CampaignSendsSection campaignId={campaign.id} refreshKey={liveTick} />
      )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Contactos ({campaign._count.contacts})
        </Typography>
        <Divider sx={{ mb: 2 }} />
        {editable ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Pegá CSV con header. Cada fila debe traer <code>email</code> y al menos{' '}
              <code>externalId</code> o <code>dni</code> (clave fuerte para unificar el
              contacto cross-canal). Columnas extra se guardan como <code>data</code>.
            </Typography>
            <CsvContactsInput
              value={contactsText}
              onChange={setContactsText}
              validation={csvValidation}
              requiredFieldsLabel="email + (externalId o dni)"
              helperText="Header esperado: email, externalId|dni, opcional nombre/apellido + cualquier columna extra para usar como variable del template."
              placeholder={
                'externalId,email,nombre,apellido\nC-001,juan@ejemplo.com,Juan,Perez\nC-002,ana@ejemplo.com,Ana,Lopez'
              }
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
