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
import type {
  BotFlow,
  BotHandoffNode,
  BotMenuNode,
  BotMenuOption,
  BotMessageNode,
  BotNode,
} from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  flow: BotFlow;
  selectedId: string | null;
  onPatch: (patch: Partial<BotNode>) => void;
  onDelete: () => void;
  onSetStart: () => void;
}

function newOptionId(taken: Set<string>): string {
  for (let i = 1; i < 1000; i++) {
    const c = `op${i}`;
    if (!taken.has(c)) return c;
  }
  return `op${Date.now()}`;
}

export function NodeEditorDrawer({
  open,
  onClose,
  flow,
  selectedId,
  onPatch,
  onDelete,
  onSetStart,
}: Props) {
  const node = selectedId ? flow.nodes[selectedId] : null;
  const allIds = Object.keys(flow.nodes);
  const isStart = selectedId === flow.startNodeId;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
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

              <TextField
                label="Texto"
                value={node.text}
                onChange={(e) => onPatch({ text: e.target.value })}
                fullWidth
                multiline
                minRows={3}
                maxRows={8}
                size="small"
                inputProps={{ maxLength: 1024 }}
                helperText={`${node.text.length} / 1024`}
              />

              {node.kind === 'MENU' && (
                <MenuOptionsEditor
                  node={node as BotMenuNode}
                  allIds={allIds}
                  onPatch={onPatch}
                />
              )}

              {node.kind === 'MESSAGE' && (
                <MessageNextEditor
                  node={node as BotMessageNode}
                  allIds={allIds}
                  selfId={selectedId}
                  onPatch={onPatch}
                />
              )}

              {node.kind === 'HANDOFF' && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={(node as BotHandoffNode).escalate ?? false}
                      onChange={(e) =>
                        onPatch({ escalate: e.target.checked } as Partial<BotHandoffNode>)
                      }
                    />
                  }
                  label="Escalar (marcar conversación como prioritaria)"
                />
              )}
            </Stack>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

function MenuOptionsEditor({
  node,
  allIds,
  onPatch,
}: {
  node: BotMenuNode;
  allIds: string[];
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
          const targetMissing = !!opt.nextNodeId && !allIds.includes(opt.nextNodeId);
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
              <FormControl size="small" fullWidth error={targetMissing}>
                <InputLabel id={`next-${idx}`}>Siguiente nodo</InputLabel>
                <Select
                  labelId={`next-${idx}`}
                  label="Siguiente nodo"
                  value={opt.nextNodeId ?? ''}
                  onChange={(e) => patchOption(idx, { nextNodeId: e.target.value })}
                >
                  <MenuItem value="">(sin siguiente)</MenuItem>
                  {allIds.map((nid) => (
                    <MenuItem key={nid} value={nid}>
                      {nid}
                    </MenuItem>
                  ))}
                  {targetMissing && (
                    <MenuItem value={opt.nextNodeId} disabled>
                      {opt.nextNodeId} (no existe)
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
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
  onPatch,
}: {
  node: BotMessageNode;
  allIds: string[];
  selfId: string;
  onPatch: (patch: Partial<BotNode>) => void;
}) {
  const targetMissing = !!node.nextNodeId && !allIds.includes(node.nextNodeId);
  return (
    <FormControl size="small" fullWidth error={targetMissing}>
      <InputLabel id="msg-next">Siguiente nodo (auto-avance)</InputLabel>
      <Select
        labelId="msg-next"
        label="Siguiente nodo (auto-avance)"
        value={node.nextNodeId ?? ''}
        onChange={(e) => onPatch({ nextNodeId: e.target.value || undefined } as Partial<BotMessageNode>)}
      >
        <MenuItem value="">(terminal — sin siguiente)</MenuItem>
        {allIds
          .filter((id) => id !== selfId)
          .map((nid) => (
            <MenuItem key={nid} value={nid}>
              {nid}
            </MenuItem>
          ))}
        {targetMissing && (
          <MenuItem value={node.nextNodeId} disabled>
            {node.nextNodeId} (no existe)
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
}

function kindColor(kind: BotNode['kind']): 'primary' | 'info' | 'secondary' {
  if (kind === 'MENU') return 'primary';
  if (kind === 'MESSAGE') return 'info';
  return 'secondary';
}
