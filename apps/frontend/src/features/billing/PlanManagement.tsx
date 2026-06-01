import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AllInclusiveRoundedIcon from '@mui/icons-material/AllInclusiveRounded';
import { useApi, ApiError } from '../../api/client';

interface PlanDto {
  code: string;
  name: string;
  priceMonthlyUsd: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
}

interface MeContextLite {
  organizations: Array<{
    clerkOrgId: string;
    role: string;
    plan: { code: string; name: string };
  }>;
}

const FEATURE_LABELS: Array<{ key: string; label: string }> = [
  { key: 'multiTeam', label: 'Multi-team' },
  { key: 'bot', label: 'Bots de WhatsApp' },
  { key: 'ai', label: 'Asistente AI' },
  { key: 'ssoSaml', label: 'SSO SAML' },
];

const LIMIT_LABELS: Array<{ key: string; label: string; suffix?: string }> = [
  { key: 'emailsPerMonth', label: 'Emails por mes' },
  { key: 'wapiMessagesPerMonth', label: 'WhatsApp por mes' },
  { key: 'teams', label: 'Teams' },
  { key: 'members', label: 'Miembros' },
  { key: 'dedicatedDomains', label: 'Dominios verificados' },
];

function formatLimit(raw: unknown): string {
  if (typeof raw !== 'number') return '—';
  if (raw < 0) return 'Ilimitado';
  return raw.toLocaleString('es-AR');
}

function formatPrice(usd: number): string {
  if (usd === 0) return 'Gratis';
  return `US$ ${usd}/mes`;
}

export function PlanManagement() {
  const api = useApi();
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [activeClerkOrgId, setActiveClerkOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetPlan, setTargetPlan] = useState<PlanDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useMemo(
    () => async () => {
      setError(null);
      const [plansRes, meRes] = await Promise.all([
        api.get<PlanDto[]>('/api/plans'),
        api.get<MeContextLite>('/api/me/context'),
      ]);
      const org = meRes.organizations[0];
      setPlans(plansRes);
      setCurrentCode(org?.plan.code ?? null);
      setActiveClerkOrgId(org?.clerkOrgId ?? null);
      setRole(org?.role ?? null);
    },
    [api],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message ?? 'No se pudo cargar la información.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const canManageBilling = role === 'OWNER' || role === 'BILLING';

  async function confirmChangePlan() {
    if (!targetPlan) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.patch<{ plan: { code: string; name: string } }>('/api/orgs/me/plan', {
        planCode: targetPlan.code,
      });
      await loadData();
      setSuccessMsg(`Plan cambiado a ${targetPlan.name}`);
      setTargetPlan(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      const apiErr = err as ApiError;
      setSubmitError(apiErr.message ?? 'No se pudo cambiar el plan.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Stack spacing={3} sx={{ p: 0.5 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Plan de la organización
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Elegí el plan que mejor se adapta. Los cambios se aplican inmediatamente.
        </Typography>
      </Box>

      {successMsg && <Alert severity="success">{successMsg}</Alert>}

      {!canManageBilling && (
        <Alert severity="info">
          Solo OWNER o BILLING pueden cambiar el plan. Tu rol actual: {role ?? '?'}.
        </Alert>
      )}

      <Stack spacing={2}>
        {plans?.map((plan) => {
          const isCurrent = plan.code === currentCode;
          return (
            <Paper
              key={plan.code}
              variant="outlined"
              sx={{
                p: 2.5,
                borderColor: isCurrent ? 'primary.main' : 'divider',
                borderWidth: isCurrent ? 2 : 1,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                <Box>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {plan.name}
                    </Typography>
                    {isCurrent && (
                      <Chip label="Plan actual" size="small" color="primary" variant="filled" />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {formatPrice(plan.priceMonthlyUsd)}
                  </Typography>
                </Box>
                <Button
                  variant={isCurrent ? 'outlined' : 'contained'}
                  disabled={isCurrent || !canManageBilling}
                  onClick={() => {
                    setSubmitError(null);
                    setTargetPlan(plan);
                  }}
                >
                  {isCurrent ? 'Activo' : 'Cambiar a este plan'}
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Features
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {FEATURE_LABELS.map((f) => {
                      const has = plan.features[f.key] === true;
                      return (
                        <Stack key={f.key} direction="row" spacing={1} alignItems="center">
                          {has ? (
                            <CheckRoundedIcon fontSize="small" color="success" />
                          ) : (
                            <CloseRoundedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                          )}
                          <Typography variant="body2" sx={{ color: has ? 'text.primary' : 'text.disabled' }}>
                            {f.label}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Límites
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {LIMIT_LABELS.map((l) => {
                      const value = plan.limits[l.key];
                      const display = formatLimit(value);
                      const isUnlimited = display === 'Ilimitado';
                      return (
                        <Stack key={l.key} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">
                            {l.label}
                          </Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {isUnlimited && <AllInclusiveRoundedIcon fontSize="inherit" />}
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {display}
                            </Typography>
                          </Stack>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      <Dialog open={!!targetPlan} onClose={() => !submitting && setTargetPlan(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cambiar a {targetPlan?.name}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Confirmás el cambio? El nuevo plan y sus límites se aplican inmediatamente.
            {targetPlan?.priceMonthlyUsd ? (
              <>
                {' '}Precio del nuevo plan: {formatPrice(targetPlan.priceMonthlyUsd)}.
              </>
            ) : null}
          </DialogContentText>
          {submitError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {submitError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTargetPlan(null)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={confirmChangePlan} variant="contained" disabled={submitting}>
            {submitting ? 'Cambiando…' : 'Confirmar cambio'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
