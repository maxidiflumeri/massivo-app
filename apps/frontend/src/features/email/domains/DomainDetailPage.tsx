import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import LanguageIcon from '@mui/icons-material/Language';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useApi, ApiError } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type { EmailDomainDetail, EmailDomainStatus } from '@massivo/shared-types';

const STATUS_COLOR: Record<EmailDomainStatus, 'default' | 'success' | 'warning' | 'error'> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  TEMPORARY_FAILURE: 'warning',
  FAILED: 'error',
};

const STATUS_LABEL: Record<EmailDomainStatus, string> = {
  PENDING: 'Pendiente de DNS',
  VERIFIED: 'Verificado',
  TEMPORARY_FAILURE: 'Fallo temporal',
  FAILED: 'Falló',
};

export function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [domain, setDomain] = useState<EmailDomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<EmailDomainDetail>(`/api/email/domains/${id}`);
      setDomain(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el dominio');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      const updated = await api.post<EmailDomainDetail>(`/api/email/domains/${id}/refresh`);
      setDomain(updated);
      notify.success(
        updated.status === 'VERIFIED'
          ? `${updated.domain} verificado ✓`
          : `${updated.domain}: ${STATUS_LABEL[updated.status]}`,
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Error verificando');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!domain) return;
    const ok = await confirm({
      title: `Borrar dominio ${domain.domain}?`,
      description:
        'Se va a eliminar la identidad en AWS SES. No vas a poder enviar más mails desde este dominio hasta que lo vuelvas a registrar y verificar.',
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete<void>(`/api/email/domains/${domain.id}`);
      notify.success(`${domain.domain} borrado`);
      navigate('/dashboard/email/domains');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        notify.error(err.message);
      } else {
        notify.error(err instanceof Error ? err.message : 'Error borrando');
      }
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => notify.success(`${label} copiado al portapapeles`),
      () => notify.error('No se pudo copiar al portapapeles'),
    );
  };

  if (loading) {
    return (
      <Stack spacing={3}>
        <Skeleton width={160} height={32} />
        <Skeleton width={300} height={48} />
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={64} />
          </Stack>
        </Paper>
      </Stack>
    );
  }

  if (error || !domain) {
    return (
      <Stack spacing={3}>
        <Button
          component={RouterLink}
          to="/dashboard/email/domains"
          startIcon={<ArrowBackIcon />}
          sx={{ pl: 0 }}
        >
          Volver
        </Button>
        <Alert severity="error">{error ?? 'Dominio no encontrado'}</Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Button
          component={RouterLink}
          to="/dashboard/email/domains"
          startIcon={<ArrowBackIcon />}
          sx={{ pl: 0, mb: 1 }}
        >
          Volver
        </Button>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <LanguageIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
            {domain.domain}
          </Typography>
          <Chip
            label={STATUS_LABEL[domain.status]}
            color={STATUS_COLOR[domain.status]}
            variant={domain.status === 'VERIFIED' ? 'filled' : 'outlined'}
          />
        </Stack>
        {domain.failureReason && domain.status === 'FAILED' && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            {domain.failureReason}
          </Typography>
        )}
      </Box>

      {domain.status === 'VERIFIED' && (
        <Alert
          severity="success"
          icon={<CheckCircleIcon />}
          sx={{ borderRadius: 2 }}
        >
          <Typography fontWeight={600}>
            Listo para enviar
          </Typography>
          <Typography variant="body2">
            DKIM verificado. Ya podés crear cuentas SMTP que envíen desde direcciones de{' '}
            <strong>{domain.domain}</strong>.
          </Typography>
        </Alert>
      )}

      {(domain.status === 'PENDING' || domain.status === 'TEMPORARY_FAILURE') && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <Typography fontWeight={600}>Esperando verificación DNS</Typography>
          <Typography variant="body2">
            Agregá los 3 registros CNAME de abajo al DNS de tu dominio. AWS los chequea
            automáticamente cada 5 min. Suele tardar minutos a un par de horas dependiendo del
            proveedor de DNS.
          </Typography>
        </Alert>
      )}

      {domain.status === 'FAILED' && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          <Typography fontWeight={600}>Verificación fallida</Typography>
          <Typography variant="body2">
            SES no pudo verificar los DKIM en el DNS. Revisá que los 3 registros estén bien
            copiados (sin trailing dots, sin path extra), esperá la propagación del DNS y
            volvé a verificar manualmente.
          </Typography>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 3, pb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Registros DNS
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Agregá estos 3 CNAMEs en el DNS de <strong>{domain.domain}</strong>.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={
              <RefreshIcon
                sx={{
                  animation: refreshing ? 'spin 1s linear infinite' : 'none',
                  '@keyframes spin': {
                    from: { transform: 'rotate(0deg)' },
                    to: { transform: 'rotate(360deg)' },
                  },
                }}
              />
            }
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Verificando…' : 'Verificar ahora'}
          </Button>
        </Stack>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={80}>Tipo</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {domain.dkimRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Los registros aún no están disponibles. Recargá la página en unos segundos.
                  </TableCell>
                </TableRow>
              )}
              {domain.dkimRecords.map((rec) => (
                <TableRow key={rec.name} hover>
                  <TableCell>
                    <Chip label="CNAME" size="small" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                    {rec.name}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                    {rec.value}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Copiar nombre">
                        <IconButton size="small" onClick={() => copy(rec.name, 'Nombre')}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Copiar valor">
                        <IconButton size="small" onClick={() => copy(rec.value, 'Valor')}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ p: 3, pt: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            Tu proveedor de DNS suele pedir solo la parte antes del dominio (ej:{' '}
            <code>xxx._domainkey</code>, no <code>xxx._domainkey.{domain.domain}</code>). Si te
            permite incluir el dominio completo, también funciona — depende del provider.
          </Typography>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Borrar dominio
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Elimina la identidad en AWS SES. No vas a poder usar este dominio para enviar hasta
              que lo vuelvas a registrar.
            </Typography>
          </Box>
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={handleDelete}>
            Borrar
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
