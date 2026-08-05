import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';

interface Props {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  /** Color del theme para el cuadrito del icono. */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
}

/**
 * Tarjeta de indicador. El número es el gráfico: cuando el dato es un valor
 * único, esto reemplaza a un chart de una sola barra.
 *
 * Figuras proporcionales a propósito (sin `tabular-nums`): a tamaño display los
 * dígitos de ancho fijo se ven sueltos. `tabular-nums` queda para columnas.
 */
export function KpiCard({ icon, label, value, hint, color = 'primary' }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1.5,
          bgcolor: `${color}.main`,
          color: `${color}.contrastText`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {typeof value === 'number' ? value.toLocaleString('es-AR') : value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {hint}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
