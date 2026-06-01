import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LanguageIcon from '@mui/icons-material/Language';
import { useApi, ApiError } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type { CreateEmailDomainResponse } from '@massivo/shared-types';

const FQDN_RE = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}$/;

export function AddDomainPage() {
  const api = useApi();
  const notify = useNotify();
  const navigate = useNavigate();

  const [domain, setDomain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = domain.trim().toLowerCase();
  const isValid = FQDN_RE.test(normalized);

  const handleSubmit = async () => {
    setError(null);
    if (!isValid) {
      setError('Formato inválido. Esperamos un FQDN (ej: empresa.com o mail.empresa.com)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<CreateEmailDomainResponse>('/api/email/domains', {
        domain: normalized,
      });
      notify.success(`Dominio ${res.domain} registrado en SES`);
      navigate(`/dashboard/email/domains/${res.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Error registrando dominio');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Box>
        <Button
          component={RouterLink}
          to="/dashboard/email/domains"
          startIcon={<ArrowBackIcon />}
          sx={{ pl: 0, mb: 1 }}
        >
          Volver
        </Button>
        <Typography variant="h4" fontWeight={700}>
          Agregar dominio
        </Typography>
        <Typography color="text.secondary">
          Registramos tu dominio en AWS SES y te damos los registros DNS para verificarlo.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 4, borderRadius: 3 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Paso 1 de 2
            </Typography>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              ¿Qué dominio querés usar para enviar mails?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Usá tu dominio raíz (ej: <code>empresa.com</code>) o un subdominio dedicado a envíos
              (ej: <code>mail.empresa.com</code>). Si no sos dueño del dominio, no vas a poder
              completar la verificación DNS.
            </Typography>
            <TextField
              fullWidth
              autoFocus
              label="Dominio"
              placeholder="empresa.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              error={domain.length > 0 && !isValid}
              helperText={
                domain.length > 0 && !isValid
                  ? 'Formato inválido — sin protocolo (http://), sin path, sin espacios.'
                  : 'Lowercase. Ejemplos válidos: empresa.com, mail.empresa.com, marketing.empresa.com.ar'
              }
              slotProps={{
                input: {
                  startAdornment: (
                    <LanguageIcon fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} />
                  ),
                  sx: { fontFamily: 'monospace' },
                },
              }}
              disabled={submitting}
            />
          </Box>

          <Alert severity="info" variant="outlined">
            En el próximo paso te vamos a mostrar 3 registros CNAME que tenés que agregar al DNS de
            tu dominio. AWS los verifica automáticamente en cuanto propaguen (suele tardar minutos
            a un par de horas según el proveedor).
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button component={RouterLink} to="/dashboard/email/domains" disabled={submitting}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!isValid || submitting}
            >
              {submitting ? 'Registrando…' : 'Registrar en SES'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
