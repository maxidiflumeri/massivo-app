import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AllInclusiveRoundedIcon from '@mui/icons-material/AllInclusiveRounded';
import { useUser } from '@clerk/clerk-react';
import { useApi, ApiError } from '../api/client';
import type {
  MeUsageResponse,
  MeUsageLastCampaign,
  UsageMetricSnapshot,
} from '@massivo/shared-types';

export function DashboardHome() {
  const { user } = useUser();
  const api = useApi();
  const greeting = user?.firstName ? `Hola, ${user.firstName}` : 'Bienvenido';

  const [usage, setUsage] = useState<MeUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<MeUsageResponse>('/api/me/usage')
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err.message ?? 'No se pudo cargar el consumo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          {greeting} 👋
        </Typography>
        <Typography color="text.secondary">
          Acá tenés tu actividad reciente y el consumo de tu plan.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
        }}
      >
        <LastCampaignCard
          kind="email"
          campaign={usage?.lastEmailCampaign ?? null}
          loading={loading}
        />
        <LastCampaignCard
          kind="wapi"
          campaign={usage?.lastWapiCampaign ?? null}
          loading={loading}
        />
      </Box>

      <Box>
        <Stack
          direction="row"
          alignItems="baseline"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={1}
          sx={{ mb: 2 }}
        >
          <Stack direction="row" spacing={1.5} alignItems="baseline">
            <Typography variant="h6" fontWeight={600}>
              Consumo de tu plan
            </Typography>
            {usage?.planName && (
              <Chip
                label={usage.planName}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600, letterSpacing: '0.02em' }}
              />
            )}
          </Stack>
          {usage?.periodEnd && (
            <Typography variant="caption" color="text.secondary">
              Próximo reset: {formatResetDate(usage.periodEnd)}
            </Typography>
          )}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          <UsageCard
            icon={<EmailRoundedIcon />}
            label="Emails enviados"
            unit="emails"
            metric={usage?.metrics.emails}
            loading={loading}
            color="#5B5BD6"
          />
          <UsageCard
            icon={<WhatsAppIcon />}
            label="Mensajes de WhatsApp"
            unit="mensajes"
            metric={usage?.metrics.wapiMessages}
            loading={loading}
            color="#25D366"
          />
          <UsageCard
            icon={<DnsRoundedIcon />}
            label="Dominios dedicados"
            unit="dominios"
            metric={usage?.metrics.dedicatedDomains}
            loading={loading}
            color="#F59E0B"
            noReset
          />
        </Box>
      </Box>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Last campaign card

interface LastCampaignCardProps {
  kind: 'email' | 'wapi';
  campaign: MeUsageLastCampaign | null;
  loading: boolean;
}

function LastCampaignCard({ kind, campaign, loading }: LastCampaignCardProps) {
  const isEmail = kind === 'email';
  const icon = isEmail ? <EmailRoundedIcon /> : <WhatsAppIcon />;
  const title = isEmail ? 'Continuar campaña de email' : 'Continuar campaña de WhatsApp';
  const accent = isEmail ? '#5B5BD6' : '#25D366';
  const createTo = isEmail ? '/dashboard/email/campaigns' : '/dashboard/wapi/campaigns';
  const detailTo = campaign
    ? `${isEmail ? '/dashboard/email/campaigns' : '/dashboard/wapi/campaigns'}/${campaign.id}`
    : createTo;

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Skeleton width={44} height={44} variant="rounded" sx={{ mb: 2 }} />
        <Skeleton width="60%" />
        <Skeleton width="40%" />
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 3,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all .2s',
        '&:hover': {
          borderColor: accent,
          boxShadow: `0 8px 24px -8px ${alpha(accent, 0.35)}`,
          transform: 'translateY(-2px)',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: alpha(accent, 0.12),
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        {title}
      </Typography>

      {campaign ? (
        <>
          <Typography variant="body1" fontWeight={500} sx={{ mb: 0.5 }} noWrap>
            {campaign.name}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Chip
              label={campaign.status}
              size="small"
              sx={{
                bgcolor: alpha(accent, 0.12),
                color: accent,
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {formatRelative(campaign.updatedAt)}
            </Typography>
          </Stack>
          <Button
            component={RouterLink}
            to={detailTo}
            endIcon={<ArrowForwardIcon />}
            sx={{ pl: 0, color: accent, '&:hover': { bgcolor: alpha(accent, 0.08) } }}
          >
            Continuar
          </Button>
        </>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Aún no tenés campañas. Creá la primera para empezar a enviar.
          </Typography>
          <Button
            component={RouterLink}
            to={createTo}
            startIcon={<AddRoundedIcon />}
            sx={{ pl: 0, color: accent, '&:hover': { bgcolor: alpha(accent, 0.08) } }}
          >
            Crear primera campaña
          </Button>
        </>
      )}
    </Paper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage card con ring de progreso

interface UsageCardProps {
  icon: React.ReactElement;
  label: string;
  unit: string;
  metric: UsageMetricSnapshot | undefined;
  loading: boolean;
  color: string;
  /** Si true, oculta el label "se renueva el mes que viene" (ej: dominios). */
  noReset?: boolean;
}

function UsageCard({ icon, label, unit, metric, loading, color, noReset }: UsageCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading || !metric) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Skeleton variant="rounded" width={36} height={36} />
          <Skeleton width="60%" />
        </Stack>
        <Stack direction="row" spacing={3} alignItems="center">
          <Skeleton variant="circular" width={100} height={100} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="80%" />
            <Skeleton width="50%" />
          </Box>
        </Stack>
      </Paper>
    );
  }

  const isUnlimited = metric.limit === null;
  const pct = isUnlimited
    ? 0
    : metric.limit === 0
      ? 0
      : Math.min(100, Math.round((metric.used / metric.limit) * 100));

  const ringColor = isUnlimited
    ? color
    : pct >= 90
      ? theme.palette.error.main
      : pct >= 70
        ? theme.palette.warning.main
        : color;

  const remaining = isUnlimited ? null : Math.max(0, (metric.limit ?? 0) - metric.used);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 3,
        position: 'relative',
        overflow: 'hidden',
        background: isDark
          ? `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, transparent 60%)`
          : `linear-gradient(135deg, ${alpha(color, 0.06)} 0%, transparent 60%)`,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: ringColor,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            bgcolor: alpha(color, 0.12),
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
        <Typography variant="body1" fontWeight={600}>
          {label}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={2.5} alignItems="center">
        {/* Ring */}
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          {/* Track */}
          <CircularProgress
            variant="determinate"
            value={100}
            size={92}
            thickness={4}
            sx={{
              color: isDark
                ? alpha(theme.palette.common.white, 0.06)
                : alpha(theme.palette.common.black, 0.06),
            }}
          />
          {/* Progress */}
          <CircularProgress
            variant="determinate"
            value={isUnlimited ? 100 : pct}
            size={92}
            thickness={4}
            sx={{
              color: ringColor,
              position: 'absolute',
              left: 0,
              filter: `drop-shadow(0 0 6px ${alpha(ringColor, 0.4)})`,
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              },
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            {isUnlimited ? (
              <AllInclusiveRoundedIcon sx={{ color: ringColor, fontSize: 32 }} />
            ) : (
              <>
                <Typography variant="h6" fontWeight={700} lineHeight={1} sx={{ color: ringColor }}>
                  {pct}%
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  usado
                </Typography>
              </>
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.1 }}>
            {formatNumber(metric.used)}
            {!isUnlimited && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 500 }}
              >
                {' '}
                / {formatNumber(metric.limit ?? 0)}
              </Typography>
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {isUnlimited
              ? `${unit} · sin límite`
              : remaining !== null
                ? `${formatNumber(remaining)} ${unit} disponibles`
                : ''}
          </Typography>
          {!noReset && !isUnlimited && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.75, fontSize: '0.7rem' }}
            >
              Se renueva el 1° de cada mes
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

const NUMBER_FORMATTER = new Intl.NumberFormat('es-AR');

function formatNumber(n: number): string {
  return NUMBER_FORMATTER.format(n);
}

function formatResetDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  return new Date(iso).toLocaleDateString('es-AR');
}
