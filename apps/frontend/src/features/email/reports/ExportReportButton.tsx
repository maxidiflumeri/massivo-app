import { useState } from 'react';
import { Button, ListItemText, Menu, MenuItem } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { triggerBlobDownload, useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';

export type ExportKind =
  | 'campaign-summary'
  | 'campaign-reports'
  | 'bounces-complaints'
  | 'suppressions';

interface Props {
  kind: ExportKind;
  /** Filtros adicionales que viajan en el body. */
  filters?: {
    campaignId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  };
  label?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
  disabled?: boolean;
}

/**
 * Split-button: dispara `POST /api/email/reports/generate` para el
 * `kind` indicado, con el formato elegido (CSV o XLSX), y triggea el
 * save dialog con el blob recibido. Errores se notifican via useNotify.
 */
export function ExportReportButton({
  kind,
  filters,
  label = 'Exportar',
  size = 'small',
  variant = 'outlined',
  disabled,
}: Props) {
  const api = useApi();
  const notify = useNotify();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport(format: 'csv' | 'xlsx') {
    setAnchor(null);
    setBusy(true);
    try {
      const file = await api.download(
        '/api/email/reports/generate',
        { kind, format, ...filters },
        `${kind}.${format}`,
      );
      triggerBlobDownload(file);
      notify.success(`${file.filename} descargado`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        startIcon={<DownloadIcon />}
        disabled={disabled || busy}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => void handleExport('csv')}>
          <ListItemText primary="CSV" secondary="Compatible con Excel/Sheets" />
        </MenuItem>
        <MenuItem onClick={() => void handleExport('xlsx')}>
          <ListItemText primary="Excel (.xlsx)" secondary="Con formato y header bold" />
        </MenuItem>
      </Menu>
    </>
  );
}
