import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import LanguageIcon from '@mui/icons-material/Language';
import { useApi, ApiError } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { useConfirm } from '../../../feedback/ConfirmProvider';
import type { EmailDomainSummary, EmailDomainStatus } from '@massivo/shared-types';

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

export function DomainsListPage() {
  const api = useApi();
  const notify = useNotify();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [rows, setRows] = useState<EmailDomainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<EmailDomainSummary[]>('/api/email/domains');
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      const updated = await api.post<EmailDomainSummary>(`/api/email/domains/${id}/refresh`);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      notify.success(
        updated.status === 'VERIFIED'
          ? `${updated.domain} verificado ✓`
          : `${updated.domain}: ${STATUS_LABEL[updated.status]}`,
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Error verificando');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (row: EmailDomainSummary) => {
    const ok = await confirm({
      title: `Borrar dominio ${row.domain}?`,
      description:
        'Se va a eliminar la identidad en AWS SES. No vas a poder enviar más mails desde este dominio hasta que lo vuelvas a registrar y verificar.',
      confirmText: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete<void>(`/api/email/domains/${row.id}`);
      notify.success(`${row.domain} borrado`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        notify.error(err.message);
      } else {
        notify.error(err instanceof Error ? err.message : 'Error borrando');
      }
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Dominios de envío
          </Typography>
          <Typography color="text.secondary">
            Registrá tus propios dominios en AWS SES y enviá mails desde direcciones de tu marca.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={RouterLink}
          to="/dashboard/email/domains/new"
        >
          Agregar dominio
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Dominio</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Última verificación</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <>
                  {[0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton width={180} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={120} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={140} />
                      </TableCell>
                      <TableCell align="right">
                        <Skeleton width={80} sx={{ ml: 'auto' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
                      <LanguageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                      <Typography color="text.secondary">
                        Todavía no registraste ningún dominio.
                      </Typography>
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/dashboard/email/domains/new')}
                      >
                        Agregar dominio
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/dashboard/email/domains/${row.id}`)}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LanguageIcon fontSize="small" color="action" />
                        <Typography fontWeight={500}>{row.domain}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABEL[row.status]}
                        color={STATUS_COLOR[row.status]}
                        variant={row.status === 'VERIFIED' ? 'filled' : 'outlined'}
                      />
                      {row.failureReason && row.status === 'FAILED' && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          {row.failureReason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.lastCheckedAt
                          ? new Date(row.lastCheckedAt).toLocaleString('es-AR')
                          : 'Nunca'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Verificar ahora">
                        <span>
                          <IconButton
                            size="small"
                            disabled={refreshingId === row.id}
                            onClick={() => handleRefresh(row.id)}
                          >
                            <RefreshIcon
                              fontSize="small"
                              sx={{
                                animation:
                                  refreshingId === row.id ? 'spin 1s linear infinite' : 'none',
                                '@keyframes spin': {
                                  from: { transform: 'rotate(0deg)' },
                                  to: { transform: 'rotate(360deg)' },
                                },
                              }}
                            />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Borrar">
                        <IconButton size="small" onClick={() => handleDelete(row)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
