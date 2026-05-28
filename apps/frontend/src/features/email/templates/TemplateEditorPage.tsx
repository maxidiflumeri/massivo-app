import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  IconButton,
  ListSubheader,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EmailEditor, { type EditorRef } from 'react-email-editor';
import { useApi, ApiError } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type {
  CreateTemplatePayload,
  EmailTemplate,
  EmailTemplateVariablesCatalog,
} from './types';
import { TemplatePreviewDrawer } from './TemplatePreviewDrawer';

interface ExportResult {
  design: Record<string, unknown>;
  html: string;
}

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const api = useApi();
  const notify = useNotify();
  const navigate = useNavigate();
  const editorRef = useRef<EditorRef>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [loaded, setLoaded] = useState(isNew);
  const [editorReady, setEditorReady] = useState(false);
  const [pendingDesign, setPendingDesign] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [varsCatalog, setVarsCatalog] = useState<EmailTemplateVariablesCatalog | null>(null);
  const [subjectMenuAnchor, setSubjectMenuAnchor] = useState<null | HTMLElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const t = await api.get<EmailTemplate>(`/api/email/templates/${id}`);
        setName(t.name);
        setSubject(t.subject);
        setPendingDesign(t.design);
        setLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error cargando template');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Fetch del catálogo de variables (base + custom descubierto de campañas
  // previas). Solo aplica a templates existentes — para "new" no hay id.
  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const cat = await api.get<EmailTemplateVariablesCatalog>(
          `/api/email/templates/${id}/variables-catalog`,
        );
        setVarsCatalog(cat);
      } catch (e) {
        // No bloquea el editor; solo loguea para diagnóstico.
        // eslint-disable-next-line no-console
        console.warn('No se pudo cargar variables-catalog:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // mergeTags para Unlayer: dropdown "Merge tags" en cada bloque de texto.
  // Shape esperado: { key: { name, value } } — name es lo que ve el usuario,
  // value es lo que se inserta en el HTML (token Handlebars).
  const mergeTags = useMemo(() => {
    if (!varsCatalog) return undefined;
    const out: Record<string, { name: string; value: string }> = {};
    for (const v of varsCatalog.base) out[v.key] = { name: v.label, value: `{{${v.key}}}` };
    for (const v of varsCatalog.custom) out[v.key] = { name: v.key, value: `{{${v.key}}}` };
    return out;
  }, [varsCatalog]);

  // Cuando varsCatalog cambia DESPUES de cargarse el editor, hay que
  // re-setear las mergeTags vía API del editor (sino no las refresca).
  useEffect(() => {
    if (!editorReady || !mergeTags) return;
    const editor = editorRef.current?.editor as unknown as
      | { setMergeTags?: (tags: unknown) => void }
      | undefined;
    if (editor && typeof editor.setMergeTags === 'function') {
      editor.setMergeTags(mergeTags);
    }
  }, [editorReady, mergeTags]);

  useEffect(() => {
    if (editorReady && pendingDesign && editorRef.current) {
      editorRef.current.editor?.loadDesign(pendingDesign as never);
      setPendingDesign(null);
    }
  }, [editorReady, pendingDesign]);

  function exportHtml(): Promise<ExportResult> {
    return new Promise((resolve, reject) => {
      const editor = editorRef.current?.editor;
      if (!editor) {
        reject(new Error('Editor no listo'));
        return;
      }
      editor.exportHtml((data) => {
        resolve({ design: data.design as Record<string, unknown>, html: data.html });
      });
    });
  }

  async function handleSave() {
    if (!name.trim() || !subject.trim()) {
      notify.warning('Nombre y subject son requeridos');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { design, html } = await exportHtml();
      const payload: CreateTemplatePayload = { name, subject, html, design };
      if (isNew) {
        const created = await api.post<EmailTemplate>('/api/email/templates', payload);
        notify.success('Template creado');
        navigate(`/dashboard/email/templates/${created.id}`, { replace: true });
      } else {
        await api.patch<EmailTemplate>(`/api/email/templates/${id}`, payload);
        notify.success('Template guardado');
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Error guardando';
      notify.error(msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // Inserta un token `{{key}}` en la posición actual del cursor del input
  // del subject. Si el input no está montado o no tiene selección, lo
  // appendea al final.
  function insertVarInSubject(key: string) {
    const token = `{{${key}}}`;
    const input = subjectRef.current;
    if (!input) {
      setSubject((prev) => prev + token);
      setSubjectMenuAnchor(null);
      return;
    }
    const start = input.selectionStart ?? subject.length;
    const end = input.selectionEnd ?? subject.length;
    const next = subject.slice(0, start) + token + subject.slice(end);
    setSubject(next);
    // Reposicionar cursor justo después del token insertado.
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
    setSubjectMenuAnchor(null);
  }

  if (!loaded) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Skeleton variant="rectangular" height={56} />
        <Skeleton variant="rectangular" height={56} />
        <Skeleton variant="rectangular" height={500} />
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ height: 'calc(100vh - 140px)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/dashboard/email/templates')}
        >
          Volver
        </Button>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {isNew ? 'Nuevo template' : 'Editar template'}
        </Typography>
        {!isNew && (
          <Button
            variant="outlined"
            startIcon={<VisibilityIcon />}
            disabled={!editorReady || saving}
            onClick={() => setPreviewOpen(true)}
          >
            Vista previa
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={saving || !editorReady}
          onClick={handleSave}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
        <TextField
          label="Nombre interno"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          sx={{ flex: 1 }}
          inputProps={{ maxLength: 120 }}
        />
        <Box sx={{ flex: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <TextField
            label="Subject (asunto del email)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
            inputProps={{ maxLength: 255 }}
            inputRef={subjectRef}
            helperText="Soporta variables Handlebars: {{firstName}}, etc."
          />
          <Tooltip title={varsCatalog ? 'Insertar variable' : 'Catálogo no disponible'}>
            <span>
              <IconButton
                onClick={(e) => setSubjectMenuAnchor(e.currentTarget)}
                disabled={!varsCatalog}
                sx={{ mt: 0.5 }}
                aria-label="Insertar variable en subject"
              >
                <CodeIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Menu
            anchorEl={subjectMenuAnchor}
            open={Boolean(subjectMenuAnchor)}
            onClose={() => setSubjectMenuAnchor(null)}
            slotProps={{ paper: { sx: { maxHeight: 360 } } }}
          >
            {varsCatalog && varsCatalog.base.length > 0 && (
              <ListSubheader sx={{ lineHeight: '32px' }}>Identidad</ListSubheader>
            )}
            {varsCatalog?.base.map((v) => (
              <MenuItem key={`base-${v.key}`} onClick={() => insertVarInSubject(v.key)}>
                <Box>
                  <Typography variant="body2">{v.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{`{{${v.key}}}`}</Typography>
                </Box>
              </MenuItem>
            ))}
            {varsCatalog && varsCatalog.custom.length > 0 && (
              <ListSubheader sx={{ lineHeight: '32px' }}>Custom (campañas previas)</ListSubheader>
            )}
            {varsCatalog?.custom.map((v) => (
              <MenuItem key={`cust-${v.key}`} onClick={() => insertVarInSubject(v.key)}>
                <Typography variant="body2">{`{{${v.key}}}`}</Typography>
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ flexGrow: 1, minHeight: 500, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <EmailEditor
          ref={editorRef}
          minHeight="100%"
          options={mergeTags ? { mergeTags } : undefined}
          onReady={() => setEditorReady(true)}
        />
      </Box>

      <TemplatePreviewDrawer
        open={previewOpen}
        templateId={isNew ? null : id ?? null}
        catalog={varsCatalog}
        onClose={() => setPreviewOpen(false)}
      />
    </Stack>
  );
}
