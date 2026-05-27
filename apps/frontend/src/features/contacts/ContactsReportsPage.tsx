import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import { useApi } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import {
  downloadAggregatedReport,
  downloadContactActivityReport,
  downloadContactsListReport,
  type AggregateGroupBy,
  type ContactReportFormat,
} from './api/contactReportsApi';

type ReportKind = 'list' | 'activity' | 'aggregated';

interface ListForm {
  q: string;
  channel: '' | 'email' | 'wapi';
  hasOpened: boolean;
  hasClicked: boolean;
  hasBounced: boolean;
  sort: 'updatedAt' | 'createdAt' | 'name';
  direction: 'asc' | 'desc';
}

const EMPTY_LIST_FORM: ListForm = {
  q: '',
  channel: '',
  hasOpened: false,
  hasClicked: false,
  hasBounced: false,
  sort: 'updatedAt',
  direction: 'desc',
};

interface ActivityForm {
  contactId: string;
  dateFrom: string;
  dateTo: string;
  channel: '' | 'email' | 'wapi' | 'audit';
}

const EMPTY_ACTIVITY_FORM: ActivityForm = {
  contactId: '',
  dateFrom: '',
  dateTo: '',
  channel: '',
};

interface AggregatedForm {
  groupBy: AggregateGroupBy;
  attributeKey: string;
  externalIdPrefix: string;
}

const EMPTY_AGGREGATED_FORM: AggregatedForm = {
  groupBy: 'tag',
  attributeKey: '',
  externalIdPrefix: '',
};

/**
 * 5.E — Página unificada de reportes consolidados de contacts. Tres tipos
 * disponibles: lista (con filtros tipo search), actividad por contacto
 * (timeline export), y agregaciones (tag / attribute / externalIdPattern).
 */
export function ContactsReportsPage() {
  const api = useApi();
  const notify = useNotify();

  const [kind, setKind] = useState<ReportKind>('list');
  const [listForm, setListForm] = useState<ListForm>(EMPTY_LIST_FORM);
  const [activityForm, setActivityForm] = useState<ActivityForm>(EMPTY_ACTIVITY_FORM);
  const [aggForm, setAggForm] = useState<AggregatedForm>(EMPTY_AGGREGATED_FORM);
  const [busy, setBusy] = useState(false);

  async function handleDownload(format: ContactReportFormat) {
    setBusy(true);
    try {
      if (kind === 'list') {
        await downloadContactsListReport(api, {
          format,
          q: listForm.q.trim() || undefined,
          channel: listForm.channel || undefined,
          hasOpened: listForm.hasOpened || undefined,
          hasClicked: listForm.hasClicked || undefined,
          hasBounced: listForm.hasBounced || undefined,
          sort: listForm.sort,
          direction: listForm.direction,
        });
      } else if (kind === 'activity') {
        if (!activityForm.contactId.trim()) {
          notify.error('Ingresá el ID del contacto');
          return;
        }
        await downloadContactActivityReport(api, activityForm.contactId.trim(), {
          format,
          dateFrom: activityForm.dateFrom
            ? new Date(activityForm.dateFrom).toISOString()
            : undefined,
          dateTo: activityForm.dateTo
            ? new Date(activityForm.dateTo).toISOString()
            : undefined,
          channel: activityForm.channel || undefined,
        });
      } else {
        if (aggForm.groupBy === 'attribute' && !aggForm.attributeKey.trim()) {
          notify.error('Ingresá el attributeKey');
          return;
        }
        if (
          aggForm.groupBy === 'externalIdPattern' &&
          !aggForm.externalIdPrefix.trim()
        ) {
          notify.error('Ingresá el externalIdPrefix');
          return;
        }
        await downloadAggregatedReport(api, {
          format,
          groupBy: aggForm.groupBy,
          attributeKey:
            aggForm.groupBy === 'attribute' ? aggForm.attributeKey.trim() : undefined,
          externalIdPrefix:
            aggForm.groupBy === 'externalIdPattern'
              ? aggForm.externalIdPrefix.trim()
              : undefined,
        });
      }
      notify.success(`Reporte ${format.toUpperCase()} descargado`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error generando el reporte');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <AssessmentIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Reportes de contactos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Exportá lista filtrada, actividad por contacto o agregados.
          </Typography>
        </Box>
      </Stack>

      <Paper sx={{ p: 3, mb: 3 }}>
        <FormControl fullWidth size="small" sx={{ maxWidth: 360 }}>
          <InputLabel>Tipo de reporte</InputLabel>
          <Select
            label="Tipo de reporte"
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportKind)}
          >
            <MenuItem value="list">Lista de contactos</MenuItem>
            <MenuItem value="activity">Actividad por contacto</MenuItem>
            <MenuItem value="aggregated">Agregado por grupo</MenuItem>
          </Select>
        </FormControl>

        <Divider sx={{ my: 3 }} />

        {kind === 'list' && (
          <ListFormSection form={listForm} onChange={setListForm} />
        )}
        {kind === 'activity' && (
          <ActivityFormSection form={activityForm} onChange={setActivityForm} />
        )}
        {kind === 'aggregated' && (
          <AggregatedFormSection form={aggForm} onChange={setAggForm} />
        )}

        <Divider sx={{ my: 3 }} />

        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={busy}
            onClick={() => void handleDownload('csv')}
          >
            Descargar CSV
          </Button>
          <Button
            variant="outlined"
            startIcon={busy ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={busy}
            onClick={() => void handleDownload('xlsx')}
          >
            Descargar Excel
          </Button>
          {busy && (
            <Typography variant="caption" color="text.secondary">
              Generando reporte…
            </Typography>
          )}
        </Stack>
      </Paper>

      <Alert severity="info" variant="outlined">
        Los reportes se generan sincrónicos hasta un máximo por tipo (50k filas lista,
        10k filas actividad, 5k grupos agregados). Datasets más grandes irán por
        scheduler asincrónico en una fase futura.
      </Alert>
    </Box>
  );
}

function ListFormSection({
  form,
  onChange,
}: {
  form: ListForm;
  onChange: (f: ListForm) => void;
}) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          size="small"
          label="Buscar"
          placeholder="Nombre, email, teléfono, externalId…"
          value={form.q}
          onChange={(e) => onChange({ ...form, q: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <FormControl fullWidth size="small">
          <InputLabel>Canal</InputLabel>
          <Select
            label="Canal"
            value={form.channel}
            onChange={(e) =>
              onChange({ ...form, channel: e.target.value as ListForm['channel'] })
            }
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="email">Email</MenuItem>
            <MenuItem value="wapi">WhatsApp</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <FormControl fullWidth size="small">
          <InputLabel>Ordenar por</InputLabel>
          <Select
            label="Ordenar por"
            value={`${form.sort}|${form.direction}`}
            onChange={(e) => {
              const [sort, direction] = String(e.target.value).split('|') as [
                ListForm['sort'],
                ListForm['direction'],
              ];
              onChange({ ...form, sort, direction });
            }}
          >
            <MenuItem value="updatedAt|desc">Última edición ↓</MenuItem>
            <MenuItem value="updatedAt|asc">Última edición ↑</MenuItem>
            <MenuItem value="createdAt|desc">Creación ↓</MenuItem>
            <MenuItem value="createdAt|asc">Creación ↑</MenuItem>
            <MenuItem value="name|asc">Nombre A→Z</MenuItem>
            <MenuItem value="name|desc">Nombre Z→A</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form.hasOpened}
                onChange={(e) => onChange({ ...form, hasOpened: e.target.checked })}
              />
            }
            label="Abrió email"
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form.hasClicked}
                onChange={(e) => onChange({ ...form, hasClicked: e.target.checked })}
              />
            }
            label="Clickeó email"
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form.hasBounced}
                onChange={(e) => onChange({ ...form, hasBounced: e.target.checked })}
              />
            }
            label="Email rebotó"
          />
        </Stack>
      </Grid>
    </Grid>
  );
}

function ActivityFormSection({
  form,
  onChange,
}: {
  form: ActivityForm;
  onChange: (f: ActivityForm) => void;
}) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          size="small"
          required
          label="ID del contacto"
          placeholder="cuid…"
          value={form.contactId}
          onChange={(e) => onChange({ ...form, contactId: e.target.value })}
          InputProps={{ sx: { fontFamily: 'monospace' } }}
          helperText="Tomá el ID desde la ficha del contacto."
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <TextField
          fullWidth
          size="small"
          type="date"
          label="Desde"
          InputLabelProps={{ shrink: true }}
          value={form.dateFrom}
          onChange={(e) => onChange({ ...form, dateFrom: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <TextField
          fullWidth
          size="small"
          type="date"
          label="Hasta"
          InputLabelProps={{ shrink: true }}
          value={form.dateTo}
          onChange={(e) => onChange({ ...form, dateTo: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth size="small">
          <InputLabel>Canal</InputLabel>
          <Select
            label="Canal"
            value={form.channel}
            onChange={(e) =>
              onChange({ ...form, channel: e.target.value as ActivityForm['channel'] })
            }
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="email">Email</MenuItem>
            <MenuItem value="wapi">WhatsApp</MenuItem>
            <MenuItem value="audit">Auditoría</MenuItem>
          </Select>
        </FormControl>
      </Grid>
    </Grid>
  );
}

function AggregatedFormSection({
  form,
  onChange,
}: {
  form: AggregatedForm;
  onChange: (f: AggregatedForm) => void;
}) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <FormControl fullWidth size="small">
          <InputLabel>Agrupar por</InputLabel>
          <Select
            label="Agrupar por"
            value={form.groupBy}
            onChange={(e) =>
              onChange({ ...form, groupBy: e.target.value as AggregateGroupBy })
            }
          >
            <MenuItem value="tag">Tag</MenuItem>
            <MenuItem value="attribute">Atributo (JSON)</MenuItem>
            <MenuItem value="externalIdPattern">Prefijo de externalId</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      {form.groupBy === 'attribute' && (
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            size="small"
            required
            label="Clave del attribute"
            placeholder="ej: segment, plan, region…"
            value={form.attributeKey}
            onChange={(e) => onChange({ ...form, attributeKey: e.target.value })}
            helperText="Se cuentan contactos por cada valor distinto del atributo."
          />
        </Grid>
      )}
      {form.groupBy === 'externalIdPattern' && (
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            size="small"
            required
            label="Prefijo de externalId"
            placeholder="ej: EMP-, CLI-, PROV-…"
            value={form.externalIdPrefix}
            onChange={(e) => onChange({ ...form, externalIdPrefix: e.target.value })}
            helperText="Reporta count de contactos cuyo externalId empieza con el prefijo."
          />
        </Grid>
      )}
    </Grid>
  );
}
