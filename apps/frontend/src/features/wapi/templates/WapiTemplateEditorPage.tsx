import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useApi } from '../../../api/client';
import { useNotify } from '../../../feedback/NotifyProvider';
import type { WapiConfigOption } from './types';

type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

interface ButtonState {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
}

interface FormState {
  name: string;
  language: string;
  category: Category;
  configId: string;
  headerFormat: HeaderFormat;
  headerText: string;
  headerTextExamples: string[];
  headerMediaHandle: string;
  bodyText: string;
  bodyExamples: string[];
  footerEnabled: boolean;
  footerText: string;
  buttons: ButtonState[];
}

const NAME_RE = /^[a-z0-9_]{1,512}$/;

function detectVars(text: string): number {
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = Number(m.replace(/[^0-9]/g, ''));
    if (n > max) max = n;
  }
  return max;
}

function buildPreviewText(text: string, samples: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const idx = Number(n) - 1;
    return samples[idx] && samples[idx]!.trim() ? samples[idx]! : `{{${n}}}`;
  });
}

const initialForm: FormState = {
  name: '',
  language: 'es_AR',
  category: 'MARKETING',
  configId: '',
  headerFormat: 'NONE',
  headerText: '',
  headerTextExamples: [],
  headerMediaHandle: '',
  bodyText: '',
  bodyExamples: [],
  footerEnabled: false,
  footerText: '',
  buttons: [],
};

export function WapiTemplateEditorPage() {
  const api = useApi();
  const notify = useNotify();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initialForm);
  const [configs, setConfigs] = useState<WapiConfigOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<WapiConfigOption[]>('/api/wapi/configs')
      .then((cfgs) => {
        setConfigs(cfgs);
        if (cfgs.length > 0) setForm((f) => ({ ...f, configId: cfgs[0]!.id }));
      })
      .catch((e) =>
        notify.error(e instanceof Error ? e.message : 'Error cargando configs'),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerVarsCount = useMemo(
    () => (form.headerFormat === 'TEXT' ? detectVars(form.headerText) : 0),
    [form.headerFormat, form.headerText],
  );
  const bodyVarsCount = useMemo(() => detectVars(form.bodyText), [form.bodyText]);

  // Sync samples arrays when var count changes
  useEffect(() => {
    setForm((f) => {
      const headerSamples = [...f.headerTextExamples];
      while (headerSamples.length < headerVarsCount) headerSamples.push('');
      headerSamples.length = headerVarsCount;
      const bodySamples = [...f.bodyExamples];
      while (bodySamples.length < bodyVarsCount) bodySamples.push('');
      bodySamples.length = bodyVarsCount;
      return { ...f, headerTextExamples: headerSamples, bodyExamples: bodySamples };
    });
  }, [headerVarsCount, bodyVarsCount]);

  const nameError =
    form.name && !NAME_RE.test(form.name)
      ? 'Sólo lowercase, dígitos y guión bajo (sin espacios ni mayúsculas)'
      : '';
  const bodyError =
    form.bodyText.length > 1024 ? 'Máximo 1024 caracteres' : '';

  const canSubmit =
    !!form.name &&
    !nameError &&
    !!form.language &&
    !!form.configId &&
    !!form.bodyText &&
    !bodyError &&
    (form.headerFormat !== 'TEXT' || !!form.headerText) &&
    (form.headerFormat === 'NONE' ||
      form.headerFormat === 'TEXT' ||
      !!form.headerMediaHandle) &&
    (!form.footerEnabled || !!form.footerText) &&
    form.buttons.every(
      (b) =>
        !!b.text &&
        (b.type !== 'URL' || !!b.url) &&
        (b.type !== 'PHONE_NUMBER' || !!b.phoneNumber),
    );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateButton(idx: number, patch: Partial<ButtonState>) {
    setForm((f) => ({
      ...f,
      buttons: f.buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  }

  function addButton() {
    if (form.buttons.length >= 3) return;
    setForm((f) => ({
      ...f,
      buttons: [...f.buttons, { type: 'QUICK_REPLY', text: '' }],
    }));
  }

  function removeButton(idx: number) {
    setForm((f) => ({ ...f, buttons: f.buttons.filter((_, i) => i !== idx) }));
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        language: form.language,
        category: form.category,
        body: {
          text: form.bodyText,
          ...(form.bodyExamples.some((s) => s.trim())
            ? { examples: [form.bodyExamples] }
            : {}),
        },
      };
      if (form.headerFormat !== 'NONE') {
        const header: Record<string, unknown> = { format: form.headerFormat };
        if (form.headerFormat === 'TEXT') {
          header.text = form.headerText;
          if (form.headerTextExamples.some((s) => s.trim())) {
            header.textExamples = form.headerTextExamples;
          }
        } else {
          header.mediaHandle = form.headerMediaHandle;
        }
        payload.header = header;
      }
      if (form.footerEnabled && form.footerText) {
        payload.footer = { text: form.footerText };
      }
      if (form.buttons.length > 0) {
        payload.buttons = form.buttons.map((b) => {
          if (b.type === 'URL') return { type: b.type, text: b.text, url: b.url };
          if (b.type === 'PHONE_NUMBER') {
            return { type: b.type, text: b.text, phoneNumber: b.phoneNumber };
          }
          return { type: b.type, text: b.text };
        });
      }
      await api.post(`/api/wapi/templates/submit/${form.configId}`, payload);
      notify.success(`Template "${form.name}" enviado a Meta — quedará en revisión`);
      navigate('/dashboard/wapi/templates');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Error creando template');
    } finally {
      setSubmitting(false);
    }
  }

  const previewBody = buildPreviewText(form.bodyText, form.bodyExamples);
  const previewHeader =
    form.headerFormat === 'TEXT'
      ? buildPreviewText(form.headerText, form.headerTextExamples)
      : '';

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/dashboard/wapi/templates')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ flex: 1 }}>
          Nuevo template
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => notify.info('Sugerencia con IA — disponible en Fase 6')}
        >
          Sugerir con IA
        </Button>
        <Button variant="contained" disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? 'Enviando…' : 'Enviar a Meta'}
        </Button>
      </Stack>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box sx={{ flex: { md: 7 }, minWidth: 0 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              Configuración general
            </Typography>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Número origen</InputLabel>
                <Select
                  label="Número origen"
                  value={form.configId}
                  onChange={(e) => update('configId', e.target.value)}
                >
                  {configs.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name ?? c.phoneNumberId} — WABA {c.businessAccountId}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Nombre (lowercase, sin espacios)"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                error={!!nameError}
                helperText={nameError || 'Ej: welcome_v1'}
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  label="Idioma"
                  value={form.language}
                  onChange={(e) => update('language', e.target.value)}
                  helperText="Ej: es_AR, en_US"
                  sx={{ flex: 1 }}
                />
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel>Categoría</InputLabel>
                  <Select
                    label="Categoría"
                    value={form.category}
                    onChange={(e) => update('category', e.target.value as Category)}
                  >
                    <MenuItem value="MARKETING">Marketing</MenuItem>
                    <MenuItem value="UTILITY">Utility</MenuItem>
                    <MenuItem value="AUTHENTICATION">Authentication</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              Header (opcional)
            </Typography>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  label="Tipo"
                  value={form.headerFormat}
                  onChange={(e) => update('headerFormat', e.target.value as HeaderFormat)}
                >
                  <MenuItem value="NONE">Sin header</MenuItem>
                  <MenuItem value="TEXT">Texto</MenuItem>
                  <MenuItem value="IMAGE">Imagen</MenuItem>
                  <MenuItem value="VIDEO">Video</MenuItem>
                  <MenuItem value="DOCUMENT">Documento</MenuItem>
                </Select>
              </FormControl>
              {form.headerFormat === 'TEXT' && (
                <>
                  <TextField
                    size="small"
                    label="Texto del header"
                    value={form.headerText}
                    onChange={(e) => update('headerText', e.target.value)}
                    helperText="Hasta 60 chars. Soporta una variable: {{1}}"
                    inputProps={{ maxLength: 60 }}
                    fullWidth
                  />
                  {form.headerTextExamples.map((v, i) => (
                    <TextField
                      key={i}
                      size="small"
                      label={`Sample para {{${i + 1}}}`}
                      value={v}
                      onChange={(e) => {
                        const next = [...form.headerTextExamples];
                        next[i] = e.target.value;
                        update('headerTextExamples', next);
                      }}
                      fullWidth
                    />
                  ))}
                </>
              )}
              {form.headerFormat !== 'NONE' && form.headerFormat !== 'TEXT' && (
                <TextField
                  size="small"
                  label={`Media handle (${form.headerFormat})`}
                  value={form.headerMediaHandle}
                  onChange={(e) => update('headerMediaHandle', e.target.value)}
                  helperText="Generar con la Resumable Upload API de Meta (futuro 4.F.2.c)"
                  fullWidth
                />
              )}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              Cuerpo (requerido)
            </Typography>
            <Stack spacing={2}>
              <TextField
                size="small"
                label="Texto del cuerpo"
                value={form.bodyText}
                onChange={(e) => update('bodyText', e.target.value)}
                error={!!bodyError}
                helperText={
                  bodyError ||
                  `${form.bodyText.length}/1024 — usá {{1}}, {{2}}… para variables`
                }
                multiline
                minRows={4}
                fullWidth
              />
              {form.bodyExamples.map((v, i) => (
                <TextField
                  key={i}
                  size="small"
                  label={`Sample para {{${i + 1}}}`}
                  value={v}
                  onChange={(e) => {
                    const next = [...form.bodyExamples];
                    next[i] = e.target.value;
                    update('bodyExamples', next);
                  }}
                  fullWidth
                />
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Footer (opcional)
              </Typography>
              <Button
                size="small"
                onClick={() => update('footerEnabled', !form.footerEnabled)}
              >
                {form.footerEnabled ? 'Quitar' : 'Agregar'}
              </Button>
            </Stack>
            {form.footerEnabled && (
              <TextField
                size="small"
                label="Texto del footer"
                value={form.footerText}
                onChange={(e) => update('footerText', e.target.value)}
                inputProps={{ maxLength: 60 }}
                helperText={`${form.footerText.length}/60`}
                fullWidth
              />
            )}

            <Divider sx={{ my: 3 }} />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Botones (opcional, hasta 3)
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                disabled={form.buttons.length >= 3}
                onClick={addButton}
              >
                Agregar
              </Button>
            </Stack>
            <Stack spacing={1.5}>
              {form.buttons.map((b, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Tipo</InputLabel>
                        <Select
                          label="Tipo"
                          value={b.type}
                          onChange={(e) =>
                            updateButton(i, { type: e.target.value as ButtonType })
                          }
                        >
                          <MenuItem value="QUICK_REPLY">Respuesta rápida</MenuItem>
                          <MenuItem value="URL">URL</MenuItem>
                          <MenuItem value="PHONE_NUMBER">Teléfono</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Texto"
                        value={b.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        inputProps={{ maxLength: 25 }}
                        sx={{ flex: 1 }}
                      />
                      <IconButton size="small" onClick={() => removeButton(i)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    {b.type === 'URL' && (
                      <TextField
                        size="small"
                        label="URL"
                        value={b.url ?? ''}
                        onChange={(e) => updateButton(i, { url: e.target.value })}
                        placeholder="https://example.com"
                        fullWidth
                      />
                    )}
                    {b.type === 'PHONE_NUMBER' && (
                      <TextField
                        size="small"
                        label="Teléfono (E.164)"
                        value={b.phoneNumber ?? ''}
                        onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                        placeholder="+5491100000000"
                        fullWidth
                      />
                    )}
                  </Stack>
                </Paper>
              ))}
              {form.buttons.length === 0 && (
                <FormHelperText>Sin botones</FormHelperText>
              )}
            </Stack>
          </Paper>
        </Box>

        <Box sx={{ flex: { md: 5 }, minWidth: 0 }}>
          <Paper sx={{ p: 2.5, position: { md: 'sticky' }, top: 16 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Vista previa
              </Typography>
              <Chip size="small" label={form.category} />
            </Stack>
            <Box
              sx={{
                bgcolor: (t) => (t.palette.mode === 'dark' ? '#0b141a' : '#e5ddd5'),
                borderRadius: 2,
                p: 1.5,
                minHeight: 200,
              }}
            >
              <Box
                sx={{
                  bgcolor: (t) => (t.palette.mode === 'dark' ? '#1f2c34' : '#fff'),
                  color: (t) => (t.palette.mode === 'dark' ? '#e9edef' : 'text.primary'),
                  borderRadius: '6px 6px 6px 0',
                  p: 1.5,
                  maxWidth: 360,
                  boxShadow: 1,
                }}
              >
                {form.headerFormat === 'TEXT' && previewHeader && (
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'inherit' }}>
                    {previewHeader}
                  </Typography>
                )}
                {form.headerFormat !== 'NONE' && form.headerFormat !== 'TEXT' && (
                  <Box
                    sx={{
                      bgcolor: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'grey.200',
                      borderRadius: 1,
                      py: 2,
                      textAlign: 'center',
                      mb: 1,
                      fontSize: 12,
                      color: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(233,237,239,0.7)' : 'text.secondary',
                    }}
                  >
                    [{form.headerFormat} header]
                  </Box>
                )}
                {previewBody && (
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', color: 'inherit' }}
                  >
                    {previewBody}
                  </Typography>
                )}
                {form.footerEnabled && form.footerText && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      mt: 1,
                      color: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(233,237,239,0.6)' : 'text.secondary',
                    }}
                  >
                    {form.footerText}
                  </Typography>
                )}
                {form.buttons.length > 0 && (
                  <Stack
                    spacing={0.5}
                    sx={{
                      mt: 1,
                      pt: 1,
                      borderTop: 1,
                      borderColor: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'divider',
                    }}
                  >
                    {form.buttons.map((b, i) => (
                      <Box
                        key={i}
                        sx={{
                          textAlign: 'center',
                          py: 0.5,
                          color: (t) => (t.palette.mode === 'dark' ? '#53bdeb' : '#0084ff'),
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {b.text || `Botón ${i + 1}`}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
              Una vez enviado, Meta lo dejará en estado <b>PENDING</b> hasta su revisión.
              Volvé a sincronizar el catálogo para ver el resultado.
            </Typography>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
