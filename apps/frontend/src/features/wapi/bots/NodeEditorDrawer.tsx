import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CloseIcon from '@mui/icons-material/Close';
import UploadIcon from '@mui/icons-material/Upload';
import { useApi } from '../../../api/client';
import { botApi } from './api';
import type {
  BotCaptureNode,
  BotConditionBranch,
  BotConditionNode,
  BotConditionWhen,
  BotDelayNode,
  BotFlow,
  BotForeachNode,
  BotHandoffNode,
  BotHttpMethod,
  BotHttpNode,
  BotMediaFromUrlNode,
  BotMediaKind,
  BotMediaNode,
  BotMenuNode,
  BotMenuOption,
  BotMessageNode,
  BotNode,
  BotSetVarNode,
  BotVariable,
} from './types';
import { VarPickerTextField } from './VarPickerTextField';

export interface TopicOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  flow: BotFlow;
  configId: string;
  selectedId: string | null;
  onPatch: (patch: Partial<BotNode>) => void;
  onDelete: () => void;
  onSetStart: () => void;
  /** 4.O.2 — topics disponibles para destino `gotoTopic`. Excluye el topic actual. */
  availableTopics?: TopicOption[];
  /** 4.O.4 — variables declaradas, usadas por VarPicker en text fields y por
   *  los selects de CAPTURE.saveAs / CONDITION.var. */
  variables?: BotVariable[];
}

function newOptionId(taken: Set<string>): string {
  for (let i = 1; i < 1000; i++) {
    const c = `op${i}`;
    if (!taken.has(c)) return c;
  }
  return `op${Date.now()}`;
}

function newBranchId(taken: Set<string>): string {
  for (let i = 1; i < 1000; i++) {
    const c = `br${i}`;
    if (!taken.has(c)) return c;
  }
  return `br${Date.now()}`;
}

export function NodeEditorDrawer({
  open,
  onClose,
  flow,
  configId,
  selectedId,
  onPatch,
  onDelete,
  onSetStart,
  availableTopics = [],
  variables = [],
}: Props) {
  const node = selectedId ? flow.nodes[selectedId] : null;
  const allIds = Object.keys(flow.nodes);
  const isStart = selectedId === flow.startNodeId;
  const showText =
    node &&
    node.kind !== 'MEDIA' &&
    node.kind !== 'MEDIA_FROM_URL' &&
    node.kind !== 'CONDITION' &&
    node.kind !== 'SET_VAR' &&
    node.kind !== 'HTTP' &&
    node.kind !== 'FOREACH' &&
    node.kind !== 'DELAY';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 } } }}
    >
      {selectedId && node && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box
            sx={{
              p: 2,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Chip size="small" label={node.kind} color={kindColor(node.kind)} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {selectedId}
            </Typography>
            {isStart && <Chip size="small" label="START" color="success" />}
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
            <Stack gap={2}>
              <Stack direction="row" gap={1}>
                <Tooltip title={isStart ? 'Ya es el nodo inicial' : 'Marcar como inicial'}>
                  <span>
                    <Button
                      size="small"
                      startIcon={isStart ? <StarIcon /> : <StarBorderIcon />}
                      onClick={onSetStart}
                      disabled={isStart}
                      variant="outlined"
                    >
                      {isStart ? 'Inicial' : 'Marcar inicial'}
                    </Button>
                  </span>
                </Tooltip>
                <Box sx={{ flex: 1 }} />
                <Tooltip title={isStart ? 'No se puede borrar el inicial' : 'Eliminar nodo'}>
                  <span>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={onDelete}
                      disabled={isStart}
                      variant="outlined"
                    >
                      Eliminar
                    </Button>
                  </span>
                </Tooltip>
              </Stack>

              {showText && (
                <VarPickerTextField
                  label={node.kind === 'CAPTURE' ? 'Prompt' : 'Texto'}
                  value={(node as { text: string }).text}
                  onChange={(next) => onPatch({ text: next } as Partial<BotNode>)}
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={8}
                  size="small"
                  inputProps={{ maxLength: 1024 }}
                  helperText={`${(node as { text: string }).text.length} / 1024 — {{var}} plano o {{= expr }} JSONata`}
                  variables={variables}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'MENU' && (
                <MenuOptionsEditor
                  node={node}
                  allIds={allIds}
                  topics={availableTopics}
                  onPatch={onPatch}
                />
              )}

              {node.kind === 'MESSAGE' && (
                <MessageNextEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  topics={availableTopics}
                  onPatch={onPatch}
                />
              )}

              {node.kind === 'HANDOFF' && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={node.escalate ?? false}
                      onChange={(e) =>
                        onPatch({ escalate: e.target.checked } as Partial<BotHandoffNode>)
                      }
                    />
                  }
                  label="Escalar (marcar conversación como prioritaria)"
                />
              )}

              {node.kind === 'CAPTURE' && (
                <CaptureEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  topics={availableTopics}
                  variables={variables}
                  onPatch={onPatch}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'MEDIA' && (
                <MediaEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  configId={configId}
                  topics={availableTopics}
                  variables={variables}
                  onPatch={onPatch}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'CONDITION' && (
                <ConditionEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  topics={availableTopics}
                  variables={variables}
                  onPatch={onPatch}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'SET_VAR' && (
                <SetVarEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  topics={availableTopics}
                  variables={variables}
                  onPatch={onPatch}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'HTTP' && (
                <HttpEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  topics={availableTopics}
                  variables={variables}
                  onPatch={onPatch}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'FOREACH' && (
                <ForeachEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  topics={availableTopics}
                  variables={variables}
                  onPatch={onPatch}
                  flow={flow}
                  currentNodeId={selectedId}
                />
              )}

              {node.kind === 'DELAY' && (
                <DelayEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  onPatch={onPatch}
                />
              )}

              {node.kind === 'MEDIA_FROM_URL' && (
                <MediaFromUrlEditor
                  node={node}
                  allIds={allIds}
                  selfId={selectedId}
                  onPatch={onPatch}
                />
              )}
            </Stack>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

/**
 * 4.Q.1 — Editor del nodo DELAY. Solo 2 campos: ms (input numérico con clamp
 * visual 100..10000) y nextNodeId (selector de nodo destino).
 */
function DelayEditor({
  node,
  allIds,
  selfId,
  onPatch,
}: {
  node: BotDelayNode;
  allIds: string[];
  selfId: string;
  onPatch: (patch: Partial<BotDelayNode>) => void;
}) {
  return (
    <Stack spacing={2}>
      <TextField
        label="Tiempo de pausa (ms)"
        type="number"
        size="small"
        value={node.ms ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value);
          onPatch({ ms: Number.isFinite(n) ? n : 0 } as Partial<BotDelayNode>);
        }}
        inputProps={{ min: 100, max: 10000, step: 100 }}
        helperText="Entre 100 y 10000 ms (1 ms = 0.001 s). Resuelve ordering issues de Meta al mandar media + texto consecutivos."
        fullWidth
      />
      <TextField
        select
        label="Siguiente nodo"
        size="small"
        value={node.nextNodeId ?? ''}
        onChange={(e) => onPatch({ nextNodeId: e.target.value } as Partial<BotDelayNode>)}
        fullWidth
      >
        {allIds
          .filter((id) => id !== selfId)
          .map((id) => (
            <MenuItem key={id} value={id}>
              {id}
            </MenuItem>
          ))}
      </TextField>
    </Stack>
  );
}

/**
 * 4.P.3 — Editor mínimo del nodo MEDIA_FROM_URL. URL/headers/caption se siguen
 * administrando por seed/API; el panel expone solo lo necesario para rewirearlo
 * desde la UI sin tocar SQL: nextNodeId (ok) y errorNodeId.
 */
function MediaFromUrlEditor({
  node,
  allIds,
  selfId,
  onPatch,
}: {
  node: BotMediaFromUrlNode;
  allIds: string[];
  selfId: string;
  onPatch: (patch: Partial<BotMediaFromUrlNode>) => void;
}) {
  const others = allIds.filter((id) => id !== selfId);
  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        Tipo: <b>{node.mediaType}</b>
      </Typography>
      <TextField
        label="URL"
        size="small"
        value={node.url ?? ''}
        fullWidth
        InputProps={{ readOnly: true }}
        helperText="Configurada por seed/API. Acepta {{var}} en runtime."
      />
      {node.caption !== undefined && (
        <TextField
          label="Caption"
          size="small"
          value={node.caption}
          fullWidth
          InputProps={{ readOnly: true }}
        />
      )}
      <TextField
        select
        label="Siguiente nodo (ok)"
        size="small"
        value={node.nextNodeId ?? ''}
        onChange={(e) =>
          onPatch({ nextNodeId: e.target.value || undefined } as Partial<BotMediaFromUrlNode>)
        }
        fullWidth
      >
        <MenuItem value="">— sin destino —</MenuItem>
        {others.map((id) => (
          <MenuItem key={id} value={id}>
            {id}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Nodo de error"
        size="small"
        value={node.errorNodeId ?? ''}
        onChange={(e) =>
          onPatch({ errorNodeId: e.target.value || undefined } as Partial<BotMediaFromUrlNode>)
        }
        fullWidth
        helperText="Adónde caer si la descarga falla (HTTP error / redirect bloqueado / timeout)."
      >
        <MenuItem value="">— sin destino —</MenuItem>
        {others.map((id) => (
          <MenuItem key={id} value={id}>
            {id}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

function MenuOptionsEditor({
  node,
  allIds,
  topics,
  onPatch,
}: {
  node: BotMenuNode;
  allIds: string[];
  topics: TopicOption[];
  onPatch: (patch: Partial<BotNode>) => void;
}) {
  function patchOption(idx: number, patch: Partial<BotMenuOption>) {
    const next = node.options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    onPatch({ options: next } as Partial<BotMenuNode>);
  }
  function removeOption(idx: number) {
    onPatch({ options: node.options.filter((_, i) => i !== idx) } as Partial<BotMenuNode>);
  }
  function addOption() {
    if (node.options.length >= 3) return;
    const taken = new Set(node.options.map((o) => o.id));
    const id = newOptionId(taken);
    const opt: BotMenuOption = { id, label: 'Nueva opción', nextNodeId: '' };
    onPatch({ options: [...node.options, opt] } as Partial<BotMenuNode>);
  }
  return (
    <>
      <Divider>
        <Typography variant="caption" color="text.secondary">
          Opciones (máx. 3)
        </Typography>
      </Divider>
      <Stack gap={1.5}>
        {node.options.map((opt, idx) => {
          const targetMissing =
            !!opt.nextNodeId && !opt.gotoTopic && !allIds.includes(opt.nextNodeId);
          return (
            <Box
              key={idx}
              sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
            >
              <Stack direction="row" gap={1} alignItems="center" mb={1}>
                <TextField
                  label="ID"
                  size="small"
                  value={opt.id}
                  onChange={(e) =>
                    patchOption(idx, { id: e.target.value.replace(/\s/g, '') })
                  }
                  sx={{ width: 100 }}
                  inputProps={{ maxLength: 40 }}
                />
                <TextField
                  label="Etiqueta"
                  size="small"
                  value={opt.label}
                  onChange={(e) => patchOption(idx, { label: e.target.value })}
                  sx={{ flex: 1 }}
                  inputProps={{ maxLength: 20 }}
                  helperText={`${opt.label.length} / 20`}
                />
                <IconButton size="small" color="error" onClick={() => removeOption(idx)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
              <NextOrTopicSelect
                nextNodeId={opt.nextNodeId}
                gotoTopic={opt.gotoTopic}
                allIds={allIds}
                topics={topics}
                onChange={(p) => patchOption(idx, p)}
                error={targetMissing}
                label="Destino"
                allowEmpty
              />
            </Box>
          );
        })}
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addOption}
          disabled={node.options.length >= 3}
        >
          Agregar opción
        </Button>
      </Stack>
    </>
  );
}

function MessageNextEditor({
  node,
  allIds,
  selfId,
  topics,
  onPatch,
}: {
  node: BotMessageNode;
  allIds: string[];
  selfId: string;
  topics: TopicOption[];
  onPatch: (patch: Partial<BotNode>) => void;
}) {
  return (
    <NextOrTopicSelect
      nextNodeId={node.nextNodeId}
      gotoTopic={node.gotoTopic}
      allIds={allIds.filter((id) => id !== selfId)}
      topics={topics}
      onChange={(p) =>
        onPatch({
          nextNodeId: p.nextNodeId,
          gotoTopic: p.gotoTopic,
        } as Partial<BotMessageNode>)
      }
      error={!!node.nextNodeId && !node.gotoTopic && !allIds.includes(node.nextNodeId)}
      label="Destino (auto-avance)"
      allowEmpty
      emptyLabel="(terminal — sin siguiente)"
    />
  );
}

function CaptureEditor({
  node,
  allIds,
  selfId,
  topics,
  variables,
  onPatch,
}: {
  node: BotCaptureNode;
  allIds: string[];
  selfId: string;
  topics: TopicOption[];
  variables: BotVariable[];
  onPatch: (patch: Partial<BotNode>) => void;
  flow?: BotFlow;
  currentNodeId?: string | null;
}) {
  const presetValue =
    node.validate?.kind === 'preset' ? node.validate.preset : node.validate?.kind === 'regex' ? '__regex__' : '';
  const captureNoNext = !node.nextNodeId && !node.gotoTopic;
  return (
    <>
      <VariableNameField
        label="Guardar como (saveAs)"
        value={node.saveAs}
        onChange={(v) => onPatch({ saveAs: v } as Partial<BotCaptureNode>)}
        variables={variables}
        helperText="Variable donde se guarda la respuesta. Elegí declarada o tipeá un nombre nuevo."
      />
      <FormControl size="small" fullWidth>
        <InputLabel id="cap-validate">Validación</InputLabel>
        <Select
          labelId="cap-validate"
          label="Validación"
          value={presetValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') onPatch({ validate: undefined } as Partial<BotCaptureNode>);
            else if (v === '__regex__')
              onPatch({ validate: { kind: 'regex', pattern: '' } } as Partial<BotCaptureNode>);
            else
              onPatch({
                validate: { kind: 'preset', preset: v as 'email' | 'phone' | 'number' | 'any' },
              } as Partial<BotCaptureNode>);
          }}
        >
          <MenuItem value="">Sin validar</MenuItem>
          <MenuItem value="any">Cualquier texto no vacío</MenuItem>
          <MenuItem value="email">Email</MenuItem>
          <MenuItem value="phone">Teléfono</MenuItem>
          <MenuItem value="number">Número</MenuItem>
          <MenuItem value="__regex__">Regex personalizada</MenuItem>
        </Select>
      </FormControl>
      {node.validate?.kind === 'regex' && (
        <TextField
          label="Regex"
          size="small"
          value={node.validate.pattern}
          onChange={(e) =>
            onPatch({
              validate: { kind: 'regex', pattern: e.target.value },
            } as Partial<BotCaptureNode>)
          }
          helperText='Ej: "^[A-Z]{3}-\\d{4}$"'
        />
      )}
      <NextOrTopicSelect
        nextNodeId={node.nextNodeId}
        gotoTopic={node.gotoTopic}
        allIds={allIds.filter((id) => id !== selfId)}
        topics={topics}
        onChange={(p) =>
          onPatch({
            nextNodeId: p.nextNodeId ?? '',
            gotoTopic: p.gotoTopic,
          } as Partial<BotCaptureNode>)
        }
        error={captureNoNext || (!!node.nextNodeId && !node.gotoTopic && !allIds.includes(node.nextNodeId))}
        label="Si valida → destino"
      />
      <NextNodeSelect
        value={node.retryNodeId ?? ''}
        allIds={allIds.filter((id) => id !== selfId)}
        onChange={(v) => onPatch({ retryNodeId: v || undefined } as Partial<BotCaptureNode>)}
        error={!!node.retryNodeId && !allIds.includes(node.retryNodeId)}
        label="Si falla → retry (opcional, solo nodo)"
        allowEmpty
        emptyLabel="(re-prompt)"
      />
    </>
  );
}

function MediaEditor({
  node,
  allIds,
  selfId,
  configId,
  topics,
  variables,
  onPatch,
  flow,
  currentNodeId,
}: {
  node: BotMediaNode;
  allIds: string[];
  selfId: string;
  configId: string;
  topics: TopicOption[];
  variables: BotVariable[];
  onPatch: (patch: Partial<BotNode>) => void;
  flow?: BotFlow;
  currentNodeId?: string | null;
}) {
  const api = useApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const result = await botApi.uploadMedia(api, configId, file);
      onPatch({
        mediaType: result.mediaType as BotMediaKind,
        mediaId: result.mediaId,
        filename: file.name,
        mediaLocalPath: result.localPath,
        mediaSha256: result.sha256,
        mediaMime: result.mime,
        mediaSize: result.size,
      } as Partial<BotMediaNode>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel id="media-type">Tipo</InputLabel>
        <Select
          labelId="media-type"
          label="Tipo"
          value={node.mediaType}
          onChange={(e) => onPatch({ mediaType: e.target.value as BotMediaKind } as Partial<BotMediaNode>)}
        >
          <MenuItem value="image">Imagen</MenuItem>
          <MenuItem value="video">Video</MenuItem>
          <MenuItem value="audio">Audio</MenuItem>
          <MenuItem value="document">Documento</MenuItem>
        </Select>
      </FormControl>
      <Stack direction="row" gap={1} alignItems="center">
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={mediaAccept(node.mediaType)}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = '';
          }}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadIcon />}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Subiendo…' : node.mediaId ? 'Reemplazar' : 'Subir archivo'}
        </Button>
        {node.mediaId && (
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
            id: {node.mediaId.slice(0, 24)}…
          </Typography>
        )}
      </Stack>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      {node.mediaType !== 'audio' && (
        <VarPickerTextField
          label="Caption (opcional)"
          size="small"
          value={node.caption ?? ''}
          onChange={(next) => onPatch({ caption: next || undefined } as Partial<BotMediaNode>)}
          multiline
          minRows={2}
          maxRows={6}
          inputProps={{ maxLength: 1024 }}
          helperText="Soporta {{var}} y {{= expr }}"
          flow={flow}
          currentNodeId={currentNodeId}
          variables={variables}
        />
      )}
      {node.mediaType === 'document' && (
        <TextField
          label="Filename"
          size="small"
          value={node.filename ?? ''}
          onChange={(e) => onPatch({ filename: e.target.value || undefined } as Partial<BotMediaNode>)}
          inputProps={{ maxLength: 100 }}
        />
      )}
      <NextOrTopicSelect
        nextNodeId={node.nextNodeId}
        gotoTopic={node.gotoTopic}
        allIds={allIds.filter((id) => id !== selfId)}
        topics={topics}
        onChange={(p) =>
          onPatch({
            nextNodeId: p.nextNodeId,
            gotoTopic: p.gotoTopic,
          } as Partial<BotMediaNode>)
        }
        error={!!node.nextNodeId && !node.gotoTopic && !allIds.includes(node.nextNodeId)}
        label="Destino (auto-avance)"
        allowEmpty
        emptyLabel="(terminal — sin siguiente)"
      />
    </>
  );
}

function ConditionEditor({
  node,
  allIds,
  selfId,
  topics,
  variables,
  onPatch,
}: {
  node: BotConditionNode;
  allIds: string[];
  selfId: string;
  topics: TopicOption[];
  variables: BotVariable[];
  onPatch: (patch: Partial<BotNode>) => void;
  // 4.P — aceptados desde padre para compat; ConditionEditor no usa VarPickerTextField
  // directamente (sólo selects nativos), pero futuras mejoras pueden agregarlo.
  flow?: BotFlow;
  currentNodeId?: string | null;
}) {
  function patchBranch(idx: number, patch: Partial<BotConditionBranch>) {
    const next = node.branches.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onPatch({ branches: next } as Partial<BotConditionNode>);
  }
  function removeBranch(idx: number) {
    onPatch({ branches: node.branches.filter((_, i) => i !== idx) } as Partial<BotConditionNode>);
  }
  function addBranch() {
    const taken = new Set(node.branches.map((b) => b.id));
    const id = newBranchId(taken);
    const branch: BotConditionBranch = {
      id,
      when: { kind: 'var', var: '', op: 'eq', value: '' },
      nextNodeId: '',
    };
    onPatch({ branches: [...node.branches, branch] } as Partial<BotConditionNode>);
  }
  return (
    <>
      <Divider>
        <Typography variant="caption" color="text.secondary">
          Ramas (en orden)
        </Typography>
      </Divider>
      <Stack gap={2}>
        {node.branches.map((b, idx) => {
          const branchNoNext = !b.nextNodeId && !b.gotoTopic;
          const branchInvalid =
            branchNoNext || (!!b.nextNodeId && !b.gotoTopic && !allIds.includes(b.nextNodeId));
          return (
            <Box key={idx} sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" alignItems="center" gap={1} mb={1}>
                <TextField
                  label="ID"
                  size="small"
                  value={b.id}
                  onChange={(e) => patchBranch(idx, { id: e.target.value.replace(/\s/g, '') })}
                  sx={{ width: 100 }}
                  inputProps={{ maxLength: 40 }}
                />
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" color="error" onClick={() => removeBranch(idx)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
              <BranchWhenEditor
                when={b.when}
                onChange={(when) => patchBranch(idx, { when })}
                variables={variables}
              />
              <Box sx={{ mt: 1 }}>
                <NextOrTopicSelect
                  nextNodeId={b.nextNodeId}
                  gotoTopic={b.gotoTopic}
                  allIds={allIds.filter((id) => id !== selfId)}
                  topics={topics}
                  onChange={(p) =>
                    patchBranch(idx, { nextNodeId: p.nextNodeId ?? '', gotoTopic: p.gotoTopic })
                  }
                  error={branchInvalid}
                  label="→ destino"
                />
              </Box>
            </Box>
          );
        })}
        <Button size="small" startIcon={<AddIcon />} onClick={addBranch}>
          Agregar rama
        </Button>
        <NextOrTopicSelect
          nextNodeId={node.elseNextNodeId}
          gotoTopic={node.elseGotoTopic}
          allIds={allIds.filter((id) => id !== selfId)}
          topics={topics}
          onChange={(p) =>
            onPatch({
              elseNextNodeId: p.nextNodeId,
              elseGotoTopic: p.gotoTopic,
            } as Partial<BotConditionNode>)
          }
          error={
            !!node.elseNextNodeId &&
            !node.elseGotoTopic &&
            !allIds.includes(node.elseNextNodeId)
          }
          label="Else (si nada matchea)"
          allowEmpty
          emptyLabel="(sin fallback)"
        />
      </Stack>
    </>
  );
}

function BranchWhenEditor({
  when,
  onChange,
  variables,
}: {
  when: BotConditionWhen;
  onChange: (w: BotConditionWhen) => void;
  variables: BotVariable[];
}) {
  return (
    <Stack gap={1}>
      <FormControl size="small" fullWidth>
        <InputLabel>Tipo</InputLabel>
        <Select
          label="Tipo"
          value={when.kind}
          onChange={(e) => {
            const k = e.target.value;
            if (k === 'var') onChange({ kind: 'var', var: '', op: 'eq', value: '' });
            else if (k === 'time') onChange({ kind: 'time', between: ['09:00', '18:00'] });
            else onChange({ kind: 'weekday', days: [1, 2, 3, 4, 5] });
          }}
        >
          <MenuItem value="var">Variable</MenuItem>
          <MenuItem value="time">Hora del día</MenuItem>
          <MenuItem value="weekday">Día de la semana</MenuItem>
        </Select>
      </FormControl>
      {when.kind === 'var' && (
        <Stack direction="row" gap={1}>
          <Box sx={{ width: 160 }}>
            <VariableNameField
              label="Variable"
              value={when.var}
              onChange={(name) => onChange({ ...when, var: name })}
              variables={variables}
            />
          </Box>
          <FormControl size="small" sx={{ width: 120 }}>
            <InputLabel>Op</InputLabel>
            <Select
              label="Op"
              value={when.op}
              onChange={(e) =>
                onChange({ ...when, op: e.target.value as 'eq' | 'neq' | 'contains' | 'matches' })
              }
            >
              <MenuItem value="eq">=</MenuItem>
              <MenuItem value="neq">≠</MenuItem>
              <MenuItem value="contains">contiene</MenuItem>
              <MenuItem value="matches">regex</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Valor"
            size="small"
            value={when.value}
            onChange={(e) => onChange({ ...when, value: e.target.value })}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}
      {when.kind === 'time' && (
        <Stack direction="row" gap={1} alignItems="center">
          <TextField
            label="Desde"
            size="small"
            type="time"
            value={when.between[0]}
            onChange={(e) => onChange({ kind: 'time', between: [e.target.value, when.between[1]] })}
            InputLabelProps={{ shrink: true }}
          />
          <Typography>—</Typography>
          <TextField
            label="Hasta"
            size="small"
            type="time"
            value={when.between[1]}
            onChange={(e) => onChange({ kind: 'time', between: [when.between[0], e.target.value] })}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      )}
      {when.kind === 'weekday' && (
        <Stack direction="row" gap={0.5}>
          {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((label, i) => {
            const active = when.days.includes(i);
            return (
              <Chip
                key={i}
                label={label}
                size="small"
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                onClick={() => {
                  const next = active ? when.days.filter((d) => d !== i) : [...when.days, i].sort();
                  onChange({ kind: 'weekday', days: next });
                }}
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * 4.O.2 — Select agrupado: nodos del topic actual + topics destino (gotoTopic).
 * Encoding interno: `node:<id>` o `topic:<id>`. Devuelve mutuamente excluyente
 * `{nextNodeId}` o `{gotoTopic}` (el otro queda undefined).
 */
function NextOrTopicSelect({
  nextNodeId,
  gotoTopic,
  allIds,
  topics,
  onChange,
  error,
  label,
  allowEmpty,
  emptyLabel,
}: {
  nextNodeId: string | undefined;
  gotoTopic: string | undefined;
  allIds: string[];
  topics: TopicOption[];
  onChange: (p: { nextNodeId?: string; gotoTopic?: string }) => void;
  error: boolean;
  label: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const value = gotoTopic
    ? `topic:${gotoTopic}`
    : nextNodeId
      ? `node:${nextNodeId}`
      : '';
  const nodeMissing = !!nextNodeId && !gotoTopic && !allIds.includes(nextNodeId);
  const topicMissing = !!gotoTopic && !topics.some((t) => t.id === gotoTopic);
  return (
    <FormControl size="small" fullWidth error={error}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(e) => {
          const v = String(e.target.value);
          if (v === '') return onChange({ nextNodeId: undefined, gotoTopic: undefined });
          if (v.startsWith('topic:'))
            return onChange({ nextNodeId: undefined, gotoTopic: v.slice(6) });
          if (v.startsWith('node:'))
            return onChange({ nextNodeId: v.slice(5), gotoTopic: undefined });
        }}
      >
        {allowEmpty && <MenuItem value="">{emptyLabel ?? '(sin destino)'}</MenuItem>}
        <ListSubheader>Nodos del flow actual</ListSubheader>
        {allIds.map((nid) => (
          <MenuItem key={`n-${nid}`} value={`node:${nid}`}>
            {nid}
          </MenuItem>
        ))}
        {nodeMissing && (
          <MenuItem value={`node:${nextNodeId}`} disabled>
            {nextNodeId} (no existe)
          </MenuItem>
        )}
        {topics.length > 0 && <ListSubheader>Saltar a otro tema</ListSubheader>}
        {topics.map((t) => (
          <MenuItem key={`t-${t.id}`} value={`topic:${t.id}`}>
            → {t.label}{' '}
            <Typography
              component="span"
              variant="caption"
              sx={{ ml: 0.5, color: 'text.secondary', fontFamily: 'monospace' }}
            >
              ({t.id})
            </Typography>
          </MenuItem>
        ))}
        {topicMissing && (
          <MenuItem value={`topic:${gotoTopic}`} disabled>
            tema {gotoTopic} (no existe)
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
}

function NextNodeSelect({
  value,
  allIds,
  onChange,
  error,
  label,
  allowEmpty,
  emptyLabel,
}: {
  value: string;
  allIds: string[];
  onChange: (v: string) => void;
  error: boolean;
  label: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const targetMissing = !!value && !allIds.includes(value);
  return (
    <FormControl size="small" fullWidth error={error}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(e) => onChange(String(e.target.value))}>
        {allowEmpty && <MenuItem value="">{emptyLabel ?? '(sin siguiente)'}</MenuItem>}
        {allIds.map((nid) => (
          <MenuItem key={nid} value={nid}>
            {nid}
          </MenuItem>
        ))}
        {targetMissing && (
          <MenuItem value={value} disabled>
            {value} (no existe)
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
}

/**
 * 4.O.4 — Editor de "nombre de variable" usado por CAPTURE.saveAs y por el
 * `var` de las branches de CONDITION. Si hay variables declaradas, muestra un
 * Select; si elige `__custom__` o no hay declaradas, cae a TextField libre.
 * Mantiene el contrato del backend: cualquier nombre con regex válida.
 */
function VariableNameField({
  label,
  value,
  onChange,
  variables,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  variables: BotVariable[];
  helperText?: string;
}) {
  const isDeclared = variables.some((v) => v.name === value);
  const [customMode, setCustomMode] = useState(
    () => variables.length === 0 || (value !== '' && !isDeclared),
  );
  const useSelect = !customMode && variables.length > 0;
  if (!useSelect) {
    return (
      <TextField
        label={label}
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
        helperText={
          helperText ?? 'sólo letras/números/_' +
          (variables.length > 0 ? '' : ' (no hay variables declaradas)')
        }
        inputProps={{ maxLength: 40 }}
        fullWidth
        InputProps={
          variables.length > 0
            ? {
                endAdornment: (
                  <Button size="small" onClick={() => setCustomMode(false)} sx={{ mr: -1 }}>
                    elegir declarada
                  </Button>
                ),
              }
            : undefined
        }
      />
    );
  }
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={isDeclared ? value : ''}
        onChange={(e) => {
          const v = String(e.target.value);
          if (v === '__custom__') {
            setCustomMode(true);
            return;
          }
          onChange(v);
        }}
      >
        {variables.map((v) => (
          <MenuItem key={v.name} value={v.name}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {v.name}
            </Typography>
            <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
              {v.type}
            </Typography>
          </MenuItem>
        ))}
        <MenuItem value="__custom__">+ otra (no declarada)</MenuItem>
        {!isDeclared && value && (
          <MenuItem value="" disabled>
            actual: <code style={{ marginLeft: 4 }}>{value}</code> (no declarada)
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
}

/**
 * 4.O.5 — Editor del nodo SET_VAR. Permite elegir una variable declarada (o
 * tipear un nombre nuevo) y asignarle un valor. El input cambia según el tipo
 * declarado: number → TextField numérico, boolean → Switch, string (o no
 * declarada) → VarPickerTextField con interpolación `{{var}}`.
 */
function SetVarEditor({
  node,
  allIds,
  selfId,
  topics,
  variables,
  onPatch,
  flow,
  currentNodeId,
}: {
  node: BotSetVarNode;
  allIds: string[];
  selfId: string;
  topics: TopicOption[];
  variables: BotVariable[];
  onPatch: (patch: Partial<BotNode>) => void;
  flow?: BotFlow;
  currentNodeId?: string | null;
}) {
  const declared = variables.find((v) => v.name === node.varName);
  const declaredType = declared?.type ?? 'string';
  const noNext = !node.nextNodeId && !node.gotoTopic;

  function setValueForType(nextType: 'string' | 'number' | 'boolean') {
    if (nextType === 'number') {
      const n = Number(node.value);
      onPatch({ value: Number.isFinite(n) ? n : 0 } as Partial<BotSetVarNode>);
    } else if (nextType === 'boolean') {
      const b =
        node.value === true ||
        (typeof node.value === 'string' &&
          ['true', '1', 'yes', 'si', 'sí'].includes(node.value.toLowerCase()));
      onPatch({ value: b } as Partial<BotSetVarNode>);
    } else {
      onPatch({ value: String(node.value ?? '') } as Partial<BotSetVarNode>);
    }
  }

  return (
    <>
      <VariableNameField
        label="Variable a asignar"
        value={node.varName}
        onChange={(v) => {
          const nextDeclared = variables.find((vv) => vv.name === v);
          onPatch({ varName: v } as Partial<BotSetVarNode>);
          if (nextDeclared) setValueForType(nextDeclared.type);
        }}
        variables={variables}
        helperText="Elegí una declarada (recomendado) o tipeá un nombre nuevo."
      />

      {declaredType === 'boolean' ? (
        <FormControlLabel
          control={
            <Switch
              checked={node.value === true}
              onChange={(e) => onPatch({ value: e.target.checked } as Partial<BotSetVarNode>)}
            />
          }
          label={`Valor: ${node.value === true ? 'true' : 'false'}`}
        />
      ) : declaredType === 'number' ? (
        <TextField
          label="Valor (número)"
          size="small"
          type="number"
          value={typeof node.value === 'number' ? node.value : Number(node.value) || 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onPatch({ value: Number.isFinite(n) ? n : 0 } as Partial<BotSetVarNode>);
          }}
          inputProps={{ inputMode: 'decimal' }}
          fullWidth
        />
      ) : (
        <VarPickerTextField
          label="Valor"
          size="small"
          value={typeof node.value === 'string' ? node.value : String(node.value ?? '')}
          onChange={(next) => onPatch({ value: next } as Partial<BotSetVarNode>)}
          fullWidth
          inputProps={{ maxLength: 1024 }}
          helperText={
            declared
              ? 'Soporta {{var}} y {{= expr }} JSONata.'
              : 'Variable no declarada → se guarda como string. Soporta {{var}} y {{= expr }}.'
          }
          variables={variables}
          flow={flow}
          currentNodeId={currentNodeId}
        />
      )}

      <NextOrTopicSelect
        nextNodeId={node.nextNodeId}
        gotoTopic={node.gotoTopic}
        allIds={allIds.filter((id) => id !== selfId)}
        topics={topics}
        onChange={(p) =>
          onPatch({
            nextNodeId: p.nextNodeId,
            gotoTopic: p.gotoTopic,
          } as Partial<BotSetVarNode>)
        }
        error={noNext || (!!node.nextNodeId && !node.gotoTopic && !allIds.includes(node.nextNodeId))}
        label="Siguiente nodo"
      />
    </>
  );
}

// 4.N.3 — Editor del nodo HTTP
function HttpEditor({
  node,
  allIds,
  selfId,
  topics,
  variables,
  onPatch,
  flow,
  currentNodeId,
}: {
  node: BotHttpNode;
  allIds: string[];
  selfId: string;
  topics: TopicOption[];
  variables: BotVariable[];
  onPatch: (patch: Partial<BotNode>) => void;
  flow?: BotFlow;
  currentNodeId?: string | null;
}) {
  const [headersDraft, setHeadersDraft] = useState<Array<{ k: string; v: string }>>(() =>
    Object.entries(node.headers ?? {}).map(([k, v]) => ({ k, v })),
  );
  const [bodyText, setBodyText] = useState<string>(() =>
    node.body !== undefined ? JSON.stringify(node.body, null, 2) : '',
  );
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [mockBodyText, setMockBodyText] = useState<string>(() =>
    node.mockResponse?.body !== undefined ? JSON.stringify(node.mockResponse.body, null, 2) : '',
  );
  const [mockBodyError, setMockBodyError] = useState<string | null>(null);
  const [mockOpen, setMockOpen] = useState<boolean>(!!node.mockResponse);

  function commitHeaders(next: Array<{ k: string; v: string }>) {
    setHeadersDraft(next);
    const obj: Record<string, string> = {};
    for (const row of next) {
      if (row.k.trim()) obj[row.k.trim()] = row.v;
    }
    onPatch({ headers: Object.keys(obj).length ? obj : undefined } as Partial<BotHttpNode>);
  }

  function commitBody(text: string) {
    setBodyText(text);
    const t = text.trim();
    if (!t) {
      setBodyError(null);
      onPatch({ body: undefined } as Partial<BotHttpNode>);
      return;
    }
    try {
      const parsed = JSON.parse(t);
      setBodyError(null);
      onPatch({ body: parsed } as Partial<BotHttpNode>);
    } catch (e) {
      setBodyError((e as Error).message);
    }
  }

  function commitMockBody(text: string) {
    setMockBodyText(text);
    const t = text.trim();
    if (!t) {
      setMockBodyError(null);
      onPatch({
        mockResponse: node.mockResponse
          ? { status: node.mockResponse.status, body: null }
          : { status: 200, body: null },
      } as Partial<BotHttpNode>);
      return;
    }
    try {
      const parsed = JSON.parse(t);
      setMockBodyError(null);
      onPatch({
        mockResponse: {
          status: node.mockResponse?.status ?? 200,
          body: parsed,
        },
      } as Partial<BotHttpNode>);
    } catch (e) {
      setMockBodyError((e as Error).message);
    }
  }

  const noOkPath = !node.nextNodeId && !node.gotoTopic;

  return (
    <>
      <Stack direction="row" gap={1} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel id="http-method">Método</InputLabel>
          <Select
            labelId="http-method"
            label="Método"
            value={node.method}
            onChange={(e) =>
              onPatch({ method: e.target.value as BotHttpMethod } as Partial<BotHttpNode>)
            }
          >
            <MenuItem value="GET">GET</MenuItem>
            <MenuItem value="POST">POST</MenuItem>
            <MenuItem value="PUT">PUT</MenuItem>
            <MenuItem value="PATCH">PATCH</MenuItem>
            <MenuItem value="DELETE">DELETE</MenuItem>
          </Select>
        </FormControl>
        <VarPickerTextField
          label="URL"
          size="small"
          value={node.url}
          onChange={(v) => onPatch({ url: v } as Partial<BotHttpNode>)}
          fullWidth
          inputProps={{ maxLength: 2048 }}
          flow={flow}
          currentNodeId={currentNodeId}
          variables={variables}
          helperText="Soporta {{var}} y {{= expr }} JSONata. Sólo http(s)://."
        />
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Headers
      </Typography>
      <Stack gap={0.5}>
        {headersDraft.map((row, idx) => {
          const sensitive = /^(authorization|cookie|x-api-key|proxy-authorization)$/i.test(
            row.k.trim(),
          );
          return (
            <Stack key={idx} direction="row" gap={0.5} alignItems="center">
              <TextField
                size="small"
                value={row.k}
                placeholder="Header"
                onChange={(e) => {
                  const next = [...headersDraft];
                  next[idx] = { ...row, k: e.target.value };
                  commitHeaders(next);
                }}
                sx={{ flex: 1 }}
                error={sensitive}
                helperText={sensitive ? 'sensible — no logueado' : undefined}
              />
              <TextField
                size="small"
                value={row.v}
                placeholder="valor (soporta {{var}})"
                onChange={(e) => {
                  const next = [...headersDraft];
                  next[idx] = { ...row, v: e.target.value };
                  commitHeaders(next);
                }}
                sx={{ flex: 2 }}
              />
              <IconButton
                size="small"
                onClick={() => commitHeaders(headersDraft.filter((_, i) => i !== idx))}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
        <Button
          size="small"
          startIcon={<AddIcon />}
          variant="outlined"
          onClick={() => commitHeaders([...headersDraft, { k: '', v: '' }])}
        >
          Agregar header
        </Button>
      </Stack>

      {(node.method === 'POST' || node.method === 'PUT' || node.method === 'PATCH') && (
        <TextField
          label="Body (JSON)"
          size="small"
          multiline
          minRows={4}
          maxRows={12}
          value={bodyText}
          onChange={(e) => commitBody(e.target.value)}
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
          error={!!bodyError}
          helperText={
            bodyError
              ? `JSON inválido: ${bodyError}`
              : 'JSON. Cada string puede usar {{var}} y {{= expr }} sin romper sintaxis.'
          }
          fullWidth
        />
      )}

      <Stack direction="row" gap={1}>
        <TextField
          label="Timeout (ms)"
          size="small"
          type="number"
          value={node.timeoutMs ?? 5000}
          onChange={(e) => {
            const n = Number(e.target.value);
            onPatch({
              timeoutMs: Number.isFinite(n) ? Math.max(100, Math.min(10_000, n)) : 5000,
            } as Partial<BotHttpNode>);
          }}
          inputProps={{ min: 100, max: 10_000 }}
          sx={{ width: 140 }}
        />
        <VariableNameField
          label="Guardar en (saveAs)"
          value={node.saveAs}
          onChange={(v) => onPatch({ saveAs: v } as Partial<BotHttpNode>)}
          variables={variables}
          helperText="Se escribe { ok, status, body, ... }. Usá saveAs.body.path con JSONata."
        />
      </Stack>

      <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={mockOpen}
              onChange={(e) => {
                setMockOpen(e.target.checked);
                if (!e.target.checked) {
                  setMockBodyText('');
                  setMockBodyError(null);
                  onPatch({ mockResponse: undefined } as Partial<BotHttpNode>);
                } else if (!node.mockResponse) {
                  onPatch({
                    mockResponse: { status: 200, body: null },
                  } as Partial<BotHttpNode>);
                }
              }}
            />
          }
          label="Respuesta simulada (sandbox modo Mock)"
        />
        {!mockOpen && (
          <Typography
            variant="caption"
            color="warning.main"
            sx={{ display: 'block', mt: 0.5, mb: 0.5 }}
          >
            Sin mock configurado: en el sandbox con HTTP=Mock este nodo va a fallar con
            error <code>mock-undefined</code>. Para pegar a la API real, cambiá el Select
            HTTP del sandbox a "Real" (en producción siempre se hace la request real).
          </Typography>
        )}
        {mockOpen && (
          <Stack gap={1}>
            <TextField
              label="Status (100-599)"
              size="small"
              type="number"
              value={node.mockResponse?.status ?? 200}
              onChange={(e) => {
                const n = Number(e.target.value);
                onPatch({
                  mockResponse: {
                    status: Number.isFinite(n) ? Math.max(100, Math.min(599, n)) : 200,
                    body: node.mockResponse?.body ?? null,
                  },
                } as Partial<BotHttpNode>);
              }}
              inputProps={{ min: 100, max: 599 }}
              sx={{ width: 160 }}
            />
            <TextField
              label="Body JSON (mock)"
              size="small"
              multiline
              minRows={3}
              maxRows={10}
              value={mockBodyText}
              onChange={(e) => commitMockBody(e.target.value)}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
              error={!!mockBodyError}
              helperText={
                mockBodyError
                  ? `JSON inválido: ${mockBodyError}`
                  : 'Se usa cuando el sandbox está en modo Mock. En prod siempre se hace la request real.'
              }
              fullWidth
            />
          </Stack>
        )}
      </Box>

      <NextOrTopicSelect
        nextNodeId={node.nextNodeId}
        gotoTopic={node.gotoTopic}
        allIds={allIds.filter((id) => id !== selfId)}
        topics={topics}
        onChange={(p) =>
          onPatch({ nextNodeId: p.nextNodeId, gotoTopic: p.gotoTopic } as Partial<BotHttpNode>)
        }
        error={noOkPath}
        label="Si ok → siguiente"
      />
      <NextOrTopicSelect
        nextNodeId={node.errorNodeId}
        gotoTopic={node.errorGotoTopic}
        allIds={allIds.filter((id) => id !== selfId)}
        topics={topics}
        onChange={(p) =>
          onPatch({
            errorNodeId: p.nextNodeId,
            errorGotoTopic: p.gotoTopic,
          } as Partial<BotHttpNode>)
        }
        label="Si error → siguiente"
      />
    </>
  );
}

// 4.P.2 — Editor del nodo FOREACH
function ForeachEditor({
  node,
  allIds,
  selfId,
  topics,
  variables,
  onPatch,
  flow,
  currentNodeId,
}: {
  node: BotForeachNode;
  allIds: string[];
  selfId: string;
  topics: TopicOption[];
  variables: BotVariable[];
  onPatch: (patch: Partial<BotNode>) => void;
  flow?: BotFlow;
  currentNodeId?: string | null;
}) {
  return (
    <>
      <VarPickerTextField
        label="items (expresión JSONata que devuelva un array)"
        size="small"
        value={node.items}
        onChange={(v) => onPatch({ items: v } as Partial<BotForeachNode>)}
        inputProps={{ maxLength: 1024, style: { fontFamily: 'monospace', fontSize: 12 } }}
        fullWidth
        helperText="Tipeá un path (ej: respuesta.body.pedidos) o usá el picker para insertar variables y funciones."
        variables={variables}
        flow={flow}
        currentNodeId={currentNodeId}
        rawExpression
      />
      <Stack direction="row" gap={1}>
        <TextField
          label="itemVar"
          size="small"
          value={node.itemVar}
          onChange={(e) =>
            onPatch({ itemVar: e.target.value.trim() } as Partial<BotForeachNode>)
          }
          fullWidth
          helperText="Nombre de variable para el item actual."
        />
        <TextField
          label="indexVar (opcional)"
          size="small"
          value={node.indexVar ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            onPatch({ indexVar: v || undefined } as Partial<BotForeachNode>);
          }}
          fullWidth
          helperText="0-based."
        />
      </Stack>
      <NextNodeSelect
        nextNodeId={node.bodyNodeId}
        allIds={allIds.filter((id) => id !== selfId)}
        onChange={(v) => onPatch({ bodyNodeId: v ?? '' } as Partial<BotForeachNode>)}
        label="Body (nodo a ejecutar por cada item)"
        error={!node.bodyNodeId}
      />
      <NextOrTopicSelect
        nextNodeId={node.doneNodeId}
        gotoTopic={node.gotoTopic}
        allIds={allIds.filter((id) => id !== selfId)}
        topics={topics}
        onChange={(p) =>
          onPatch({
            doneNodeId: p.nextNodeId,
            gotoTopic: p.gotoTopic,
          } as Partial<BotForeachNode>)
        }
        label="Done (cuando termina el loop)"
      />
    </>
  );
}

function mediaAccept(type: BotMediaKind): string {
  switch (type) {
    case 'image':
      return 'image/jpeg,image/png,image/webp';
    case 'video':
      return 'video/mp4,video/3gpp';
    case 'audio':
      return 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg';
    case 'document':
      return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
  }
}

function kindColor(kind: BotNode['kind']): 'primary' | 'info' | 'secondary' | 'warning' | 'success' | 'default' {
  if (kind === 'MENU') return 'primary';
  if (kind === 'MESSAGE') return 'info';
  if (kind === 'HANDOFF') return 'secondary';
  if (kind === 'CAPTURE') return 'warning';
  if (kind === 'MEDIA') return 'success';
  return 'default';
}
