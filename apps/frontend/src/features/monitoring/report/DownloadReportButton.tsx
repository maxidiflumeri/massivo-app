import { useState } from 'react';
import { Button, CircularProgress, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import { brand } from '../../../brand';
import { monitoringApi } from '../api';
import type { DayRange } from '../types';
import { buildReport } from './buildReport';

interface Props {
  range: DayRange;
  disabled?: boolean;
}

/**
 * Genera el informe del período en PDF, en el navegador.
 *
 * El backend sólo devuelve los datos agregados: armar el PDF acá evita meter un
 * motor de render (y un navegador headless) en la imagen del servidor. pdfmake
 * se carga con `import()` dinámico, así que su ~1 MB no entra en el bundle
 * inicial del panel: baja recién cuando alguien aprieta el botón.
 */
export function DownloadReportButton({ range, disabled }: Props) {
  const api = useApi();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const [data, pdfModule, helvetica] = await Promise.all([
        monitoringApi.report(api, range),
        import('pdfmake/build/pdfmake'),
        // Fuentes estándar del PDF: sólo métricas, sin incrustar tipografías.
        // Roboto (`vfs_fonts`) sumaría ~800 KB más de descarga.
        import('pdfmake/build/standard-fonts/Helvetica'),
      ]);
      const pdfMake = withDefault(pdfModule);
      pdfMake.addFontContainer(withDefault(helvetica));

      const nombre = `informe-${range.from}_a_${range.to}.pdf`;
      await pdfMake.createPdf(buildReport(data, brand.name)).download(nombre);
      notify.success(`${nombre} descargado`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'No se pudo generar el informe');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tooltip title="Descargar el informe del período en PDF">
      <span>
        <Button
          size="small"
          variant="outlined"
          startIcon={busy ? <CircularProgress size={14} /> : <DownloadIcon />}
          disabled={disabled || busy}
          onClick={() => void handleClick()}
        >
          {busy ? 'Generando…' : 'Informe PDF'}
        </Button>
      </span>
    </Tooltip>
  );
}

/**
 * pdfmake y sus fuentes se publican como scripts CommonJS. Según cómo los
 * envuelva el bundler quedan en `default` o en la raíz del módulo.
 */
function withDefault<T>(mod: T | { default: T }): T {
  return (mod as { default?: T }).default ?? (mod as T);
}
