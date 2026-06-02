import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useApi, ApiError } from '../../../api/client';

interface EventDetail {
  id: string;
  type: 'OPEN' | 'CLICK' | string;
  occurredAt: string;
  ip: string | null;
  userAgent: string | null;
  targetUrl: string | null;
  deviceFamily: string | null;
  osName: string | null;
  browserName: string | null;
}

interface ReportDetail {
  id: string;
  recipientEmail: string | null;
  status: string;
  subject: string | null;
  html: string | null;
  createdAt: string;
  sentAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  smtpMessageId: string | null;
  error: string | null;
  events: EventDetail[];
}

interface Props {
  open: boolean;
  reportId: string | null;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR');
}

export function TransactionalDetailDrawer({ open, reportId, onClose }: Props) {
  const api = useApi();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !reportId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<ReportDetail>(`/api/email/transactional/reports/${reportId}`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message ?? 'No se pudo cargar el detalle.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, open, reportId]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 560 } } }}
    >
      {/* Spacer del AppBar fixed (zIndex.drawer+1) */}
      <Toolbar variant="dense" disableGutters sx={{ minHeight: { xs: 56, sm: 64 } }} />
      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
          Detalle del envío
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}

        {report && !loading && (
          <Stack spacing={2.5}>
            {/* Header info */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    Destinatario
                  </Typography>
                  <Chip size="small" label={report.status} />
                </Stack>
                <Typography variant="body1" fontWeight={600}>
                  {report.recipientEmail}
                </Typography>
                <Divider />
                <Typography variant="caption" color="text.secondary">
                  Subject
                </Typography>
                <Typography variant="body2">{report.subject ?? '—'}</Typography>
                <Divider />
                <Stack direction="row" spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Enviado
                    </Typography>
                    <Typography variant="body2">{formatDate(report.sentAt)}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      SMTP Message ID
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        wordBreak: 'break-all',
                        display: 'block',
                      }}
                    >
                      {report.smtpMessageId ?? '—'}
                    </Typography>
                  </Box>
                </Stack>
                {report.error && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="caption" color="error">
                        Error
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-word' }}>
                        {report.error}
                      </Typography>
                    </Box>
                  </>
                )}
              </Stack>
            </Paper>

            {/* Engagement summary */}
            <Stack direction="row" spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, textAlign: 'center' }}>
                <VisibilityIcon
                  fontSize="small"
                  sx={{ color: report.firstOpenedAt ? 'success.main' : 'text.disabled' }}
                />
                <Typography variant="caption" display="block" color="text.secondary">
                  Primera apertura
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {report.firstOpenedAt ? formatDate(report.firstOpenedAt) : 'Sin abrir'}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, textAlign: 'center' }}>
                <TouchAppIcon
                  fontSize="small"
                  sx={{ color: report.firstClickedAt ? 'info.main' : 'text.disabled' }}
                />
                <Typography variant="caption" display="block" color="text.secondary">
                  Primer click
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {report.firstClickedAt ? formatDate(report.firstClickedAt) : 'Sin clicks'}
                </Typography>
              </Paper>
            </Stack>

            {/* Events timeline */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Timeline ({report.events.length} eventos)
              </Typography>
              {report.events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin eventos todavía.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {report.events.map((ev) => (
                    <Paper key={ev.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        {ev.type === 'OPEN' && <VisibilityIcon fontSize="small" color="success" />}
                        {ev.type === 'CLICK' && <TouchAppIcon fontSize="small" color="info" />}
                        {ev.type !== 'OPEN' && ev.type !== 'CLICK' && (
                          <MarkEmailReadIcon fontSize="small" />
                        )}
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" fontWeight={600}>
                              {ev.type}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(ev.occurredAt)}
                            </Typography>
                          </Stack>
                          {ev.targetUrl && (
                            <Typography
                              variant="caption"
                              sx={{ wordBreak: 'break-all', display: 'block', mt: 0.5 }}
                            >
                              🔗 {ev.targetUrl}
                            </Typography>
                          )}
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            {ev.deviceFamily && (
                              <Chip size="small" label={ev.deviceFamily} variant="outlined" />
                            )}
                            {ev.osName && <Chip size="small" label={ev.osName} variant="outlined" />}
                            {ev.browserName && (
                              <Chip size="small" label={ev.browserName} variant="outlined" />
                            )}
                          </Stack>
                          {ev.ip && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontFamily: 'monospace', fontSize: 10, mt: 0.5, display: 'block' }}
                            >
                              IP: {ev.ip}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>

            {/* HTML preview */}
            {report.html && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  HTML renderizado
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 0,
                    maxHeight: 400,
                    overflow: 'auto',
                    bgcolor: '#fff',
                  }}
                >
                  <Box sx={{ p: 2 }} dangerouslySetInnerHTML={{ __html: report.html }} />
                </Paper>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
