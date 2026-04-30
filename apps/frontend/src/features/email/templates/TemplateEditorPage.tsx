import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmailEditor, { type EditorRef } from 'react-email-editor';
import { useApi, ApiError } from '../../../api/client';
import type { CreateTemplatePayload, EmailTemplate } from './types';

interface ExportResult {
  design: Record<string, unknown>;
  html: string;
}

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const api = useApi();
  const navigate = useNavigate();
  const editorRef = useRef<EditorRef>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [loaded, setLoaded] = useState(isNew);
  const [editorReady, setEditorReady] = useState(false);
  const [pendingDesign, setPendingDesign] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError('Nombre y subject son requeridos');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { design, html } = await exportHtml();
      const payload: CreateTemplatePayload = { name, subject, html, design };
      if (isNew) {
        const created = await api.post<EmailTemplate>('/api/email/templates', payload);
        navigate(`/dashboard/email/templates/${created.id}`, { replace: true });
      } else {
        await api.patch<EmailTemplate>(`/api/email/templates/${id}`, payload);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Error guardando';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
      </Box>
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
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={saving || !editorReady}
          onClick={handleSave}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Nombre interno"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          sx={{ flex: 1 }}
          inputProps={{ maxLength: 120 }}
        />
        <TextField
          label="Subject (asunto del email)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          size="small"
          sx={{ flex: 2 }}
          inputProps={{ maxLength: 255 }}
          helperText="Soporta variables Handlebars: {{firstName}}, etc."
        />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ flexGrow: 1, minHeight: 500, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <EmailEditor
          ref={editorRef}
          minHeight="100%"
          onReady={() => setEditorReady(true)}
        />
      </Box>
    </Stack>
  );
}
