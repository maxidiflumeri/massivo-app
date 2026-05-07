import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink } from 'react-router-dom';
import { useApi, ApiError } from '../../api/client';
import { useNotify } from '../../feedback/NotifyProvider';
import { useConfirm } from '../../feedback/ConfirmProvider';
import type { Contact, MergeSuggestion, MergeSuggestionPage } from './types';

const PAGE_SIZE = 25;

export function MergeSuggestionsPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();

  const [status, setStatus] = useState<'PENDING' | 'ACCEPTED' | 'REJECTED'>('PENDING');
  const [items, setItems] = useState<MergeSuggestion[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string | null, replace: boolean) => {
      setLoading(true);
      try {
        const p = new URLSearchParams();
        p.set('status', status);
        p.set('limit', String(PAGE_SIZE));
        if (nextCursor) p.set('cursor', nextCursor);
        const res = await api.get<MergeSuggestionPage>(
          `/api/contacts/merge-suggestions?${p.toString()}`,
        );
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'Error cargando sugerencias');
      } finally {
        setLoading(false);
      }
    },
    [api, notify, status],
  );

  useEffect(() => {
    void load(null, true);
  }, [load]);

  async function onAccept(s: MergeSuggestion) {
    const ok = await confirm({
      title: 'Aceptar merge',
      message:
        'Se va a fusionar el contacto de la derecha dentro del de la izquierda. Los identificadores no-null del derecho rellenarán huecos del izquierdo, y el derecho se eliminará. Esta acción no se puede deshacer.',
      confirmText: 'Aceptar y fusionar',
      destructive: true,
    });
    if (!ok) return;
    setActing(s.id);
    try {
      await api.post(`/api/contacts/merge-suggestions/${s.id}/accept`);
      notify.success('Merge aceptado');
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Error aceptando merge';
      notify.error(msg);
    } finally {
      setActing(null);
    }
  }

  async function onReject(s: MergeSuggestion) {
    const ok = await confirm({
      title: 'Rechazar sugerencia',
      message: 'Se marcará como rechazada y no volverá a aparecer en la cola.',
      confirmText: 'Rechazar',
    });
    if (!ok) return;
    setActing(s.id);
    try {
      await api.post(`/api/contacts/merge-suggestions/${s.id}/reject`);
      notify.success('Sugerencia rechazada');
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error rechazando');
    } finally {
      setActing(null);
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton component={RouterLink} to="/dashboard/contacts" size="small">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Sugerencias de merge
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pares de contactos que parecen referirse a la misma persona (matching por email o
            teléfono).
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Estado</InputLabel>
          <Select
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <MenuItem value="PENDING">Pendientes</MenuItem>
            <MenuItem value="ACCEPTED">Aceptadas</MenuItem>
            <MenuItem value="REJECTED">Rechazadas</MenuItem>
          </Select>
        </FormControl>
        <Tooltip title="Recargar">
          <IconButton size="small" onClick={() => void load(null, true)} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading && items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : items.length === 0 ? (
        <Paper sx={{ py: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No hay sugerencias en este estado.</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              acting={acting === s.id}
              onAccept={() => void onAccept(s)}
              onReject={() => void onReject(s)}
              readOnly={status !== 'PENDING'}
            />
          ))}
          {cursor && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button onClick={() => void load(cursor, false)} disabled={loading}>
                {loading ? 'Cargando…' : 'Cargar más'}
              </Button>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}

function SuggestionCard({
  s,
  acting,
  onAccept,
  onReject,
  readOnly,
}: {
  s: MergeSuggestion;
  acting: boolean;
  onAccept: () => void;
  onReject: () => void;
  readOnly: boolean;
}) {
  const conflict = strongKeyConflict(s.leftContact, s.rightContact);
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Chip
          size="small"
          label={s.matchType === 'EMAIL' ? `Email: ${s.matchValue}` : `Teléfono: ${s.matchValue}`}
          color="info"
          variant="outlined"
        />
        <Typography variant="caption" color="text.secondary">
          {new Date(s.createdAt).toLocaleString()}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={onReject}
              disabled={acting}
            >
              Rechazar
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={onAccept}
              disabled={acting || !!conflict}
            >
              {acting ? 'Procesando…' : 'Aceptar merge'}
            </Button>
          </Stack>
        )}
      </Stack>

      {conflict && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Conflicto en clave fuerte: {conflict}. No se puede fusionar automáticamente — pueden no
          ser la misma persona.
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <ContactPanel
          title="Izquierda (gana donde tiene valor)"
          contact={s.leftContact}
          variant="left"
        />
        <ContactPanel
          title="Derecha (rellena nulls del izquierdo)"
          contact={s.rightContact}
          variant="right"
        />
      </Stack>
    </Paper>
  );
}

function ContactPanel({
  title,
  contact,
  variant,
}: {
  title: string;
  contact: Contact;
  variant: 'left' | 'right';
}) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: variant === 'left' ? 'primary.main' : 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {title}
        </Typography>
        <IconButton
          size="small"
          component={RouterLink}
          to={`/dashboard/contacts/${contact.id}`}
          target="_blank"
        >
          <OpenInNewIcon fontSize="inherit" />
        </IconButton>
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
        {formatName(contact) ?? <em style={{ opacity: 0.6 }}>(sin nombre)</em>}
      </Typography>
      <Stack spacing={0.25}>
        <MiniRow label="Email" value={contact.email} />
        <MiniRow label="Tel" value={contact.phoneE164 ?? contact.phone} mono />
        <MiniRow label="External" value={contact.externalId} mono />
        <MiniRow label="DNI" value={contact.dni} mono />
        <MiniRow label="CUIT" value={contact.cuit} mono />
      </Stack>
    </Box>
  );
}

function MiniRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56 }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}
      >
        {value ?? '—'}
      </Typography>
    </Stack>
  );
}

function formatName(c: Contact): string | null {
  const parts = [c.firstName, c.lastName].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(' ');
  return c.email ?? c.phoneE164 ?? c.phone ?? c.externalId ?? null;
}

function strongKeyConflict(left: Contact, right: Contact): string | null {
  if (left.externalId && right.externalId && left.externalId !== right.externalId) {
    return `externalId distinto (${left.externalId} vs ${right.externalId})`;
  }
  if (left.dni && right.dni && left.dni !== right.dni) {
    return `DNI distinto (${left.dni} vs ${right.dni})`;
  }
  if (left.cuit && right.cuit && left.cuit !== right.cuit) {
    return `CUIT distinto (${left.cuit} vs ${right.cuit})`;
  }
  return null;
}
