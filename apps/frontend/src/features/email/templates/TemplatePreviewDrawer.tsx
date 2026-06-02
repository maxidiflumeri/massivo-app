import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useApi, ApiError } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type {
  EmailTemplateVariablesCatalog,
  PreviewTemplateResponse,
  SendTestTemplateResponse,
} from './types';

interface TemplatePreviewDrawerProps {
  open: boolean;
  templateId: string | null;
  catalog: EmailTemplateVariablesCatalog | null;
  onClose: () => void;
}

/**
 * Drawer fullscreen-like que renderiza la preview del template:
 *  - Columna izquierda: tabla editable con (key, sample) pre-cargada del
 *    catálogo base + custom. Defaults vienen del backend; el usuario puede
 *    sobreescribir cada valor.
 *  - Columna derecha: iframe sandboxed con el HTML renderizado + subject
 *    visible arriba.
 *  - Botón "Enviar prueba": dialog interno pide email destino y dispara
 *    POST /send-test con el mismo sampleData.
 *
 * El primer render se dispara al abrir; el usuario puede pedir re-renders
 * con el botón "Renderizar".
 */
export function TemplatePreviewDrawer({
  open,
  templateId,
  catalog,
  onClose,
}: TemplatePreviewDrawerProps) {
  const api = useApi();
  const notify = useNotify();

  // Filas { key, value, source } construidas del catálogo. Estado editable.
  // - base: del catálogo built-in (key fija)
  // - catalogCustom: del catálogo "custom" descubierto de campañas previas
  // - ad-hoc: agregadas por el usuario en este dialog (key + value editables)
  type Row = { key: string; value: string; source: 'base' | 'catalogCustom' | 'ad-hoc' };
  const initialRows = useMemo<Row[]>(() => {
    if (!catalog) return [];
    return [
      ...catalog.base.map((v) => ({ key: v.key, value: v.sample, source: 'base' as const })),
      ...catalog.custom.map((v) => ({
        key: v.key,
        value: v.sample ?? '',
        source: 'catalogCustom' as const,
      })),
    ];
  }, [catalog]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [rendering, setRendering] = useState(false);
  const [preview, setPreview] = useState<PreviewTemplateResponse | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [toEmail, setToEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Auto-render al abrir si hay catálogo + templateId.
  useEffect(() => {
    if (!open || !templateId || !catalog) return;
    void runRender(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId, catalog]);

  function rowsToSampleData(currentRows: { key: string; value: string }[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const r of currentRows) {
      if (r.key) out[r.key] = r.value;
    }
    return out;
  }

  async function runRender(currentRows = rows) {
    if (!templateId) return;
    setRendering(true);
    setRenderError(null);
    try {
      const res = await api.post<PreviewTemplateResponse>(
        `/api/email/templates/${templateId}/preview`,
        { sampleData: rowsToSampleData(currentRows) },
      );
      setPreview(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Error renderizando';
      setRenderError(msg);
    } finally {
      setRendering(false);
    }
  }

  async function runSendTest() {
    if (!templateId) return;
    if (!toEmail.trim()) {
      notify.warning('Ingresá un email destino');
      return;
    }
    setSending(true);
    try {
      const res = await api.post<SendTestTemplateResponse>(
        `/api/email/templates/${templateId}/send-test`,
        { toEmail: toEmail.trim(), sampleData: rowsToSampleData(rows) },
      );
      notify.success(`Email de prueba enviado a ${toEmail.trim()}${res.messageId ? ` (msg ${res.messageId})` : ''}`);
      setSendDialogOpen(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Error enviando prueba';
      notify.error(msg);
    } finally {
      setSending(false);
    }
  }

  function updateRow(idx: number, patch: Partial<Pick<Row, 'key' | 'value'>>) {
    setRows((prev) => {
      const next = [...prev];
      const target = next[idx];
      if (target) next[idx] = { ...target, ...patch };
      return next;
    });
  }

  function addAdHocRow() {
    setRows((prev) => [...prev, { key: '', value: '', source: 'ad-hoc' }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        // El AppBar de AppLayout usa zIndex.drawer+1 (1201). MUI Drawer en
        // modo modal arranca en zIndex.modal (1300), arriba del AppBar — el
        // override previo bajaba esto a 1102 y rompía la jerarquía. Forzamos
        // a 1300 explícito y lo replicamos en el Paper para que el panel
        // visible no quede tapado por elementos sticky/fixed de la página.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: '90vw' },
            maxWidth: 1400,
            zIndex: (theme) => theme.zIndex.modal,
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Vista previa de template
            </Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => runRender()}
              disabled={rendering || !templateId}
            >
              Renderizar
            </Button>
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={() => setSendDialogOpen(true)}
              disabled={!templateId}
            >
              Enviar prueba
            </Button>
            <Tooltip title="Cerrar">
              <IconButton onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <Box
              sx={{
                width: { xs: '100%', md: 380 },
                borderRight: { md: 1 },
                borderColor: 'divider',
                overflow: 'auto',
                p: 2,
              }}
            >
              <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                  Datos de prueba
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={addAdHocRow}>
                  Agregar
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Editá los valores para ver cómo se interpola cada variable.
                Usá "Agregar" para probar con una variable nueva sin tocar el catálogo.
              </Typography>
              {rows.length === 0 && (
                <Alert severity="info">No hay variables definidas. Apretá "Agregar" para probar con una.</Alert>
              )}
              {rows.length > 0 && (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Variable</TableCell>
                      <TableCell>Valor sample</TableCell>
                      <TableCell sx={{ width: 32 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow key={r.source === 'ad-hoc' ? `ad-${idx}` : r.key}>
                        <TableCell sx={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          {r.source === 'ad-hoc' ? (
                            <TextField
                              size="small"
                              placeholder="nombre"
                              value={r.key}
                              onChange={(e) => updateRow(idx, { key: e.target.value })}
                              sx={{ width: 130 }}
                            />
                          ) : (
                            <>
                              <code>{`{{${r.key}}}`}</code>
                              {r.source === 'catalogCustom' && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  custom
                                </Typography>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            value={r.value}
                            onChange={(e) => updateRow(idx, { value: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          {r.source === 'ad-hoc' && (
                            <Tooltip title="Eliminar fila">
                              <IconButton size="small" onClick={() => removeRow(idx)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>

            <Box sx={{ flex: 1, p: 2, overflow: 'auto', minWidth: 0 }}>
              {renderError && <Alert severity="error" sx={{ mb: 2 }}>{renderError}</Alert>}
              {preview ? (
                <Stack spacing={2} sx={{ height: '100%' }}>
                  <Box sx={{ p: 1.5, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">Subject</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>{preview.subject}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <iframe
                      title="template-preview"
                      srcDoc={preview.html}
                      sandbox=""
                      style={{ width: '100%', height: '100%', minHeight: 500, border: 0 }}
                    />
                  </Box>
                </Stack>
              ) : (
                <Typography color="text.secondary">
                  {rendering ? 'Renderizando…' : 'Apretá "Renderizar" para previsualizar el template.'}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Drawer>

      <Dialog open={sendDialogOpen} onClose={() => setSendDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Enviar prueba</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Se enviará usando la cuenta SMTP asociada al template (o la primera activa del team si no
            hay una específica). El email no se registra como parte de ninguna campaña.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Email destino"
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendDialogOpen(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={runSendTest} disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
