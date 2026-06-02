import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import FunctionsIcon from '@mui/icons-material/Functions';
import HttpIcon from '@mui/icons-material/Http';
import LoopIcon from '@mui/icons-material/Loop';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type {
  BotCaptureNode,
  BotConditionNode,
  BotConditionWhen,
  BotDelayNode,
  BotForeachNode,
  BotHandoffNode,
  BotHttpNode,
  BotMediaNode,
  BotMenuNode,
  BotMessageNode,
  BotSetVarNode,
} from './types';

interface BaseNodeData {
  id: string;
  isStart: boolean;
}

const wrapperSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  borderRadius: 1.5,
  width: 240,
  boxShadow: 1,
  overflow: 'hidden',
};

const headerSx = {
  px: 1.25,
  py: 0.75,
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
};

const handleSx = {
  width: 10,
  height: 10,
  background: '#5B5BD6',
  border: '2px solid #fff',
};

function truncate(s: string, n = 90): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

export const MenuNodeView = memo(function MenuNodeView(
  props: NodeProps<{ id: string; node: BotMenuNode; isStart: boolean } & BaseNodeData> & { selected?: boolean },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box sx={{ ...wrapperSx, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'primary.main', color: 'common.white' }}>
        <SmartToyIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>MENU</Typography>
        <Box sx={{ flex: 1 }} />
        {data.isStart && <Chip size="small" label="START" sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }} />}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {data.id}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, mb: 1, whiteSpace: 'pre-wrap' }}>
          {truncate(node.text, 80)}
        </Typography>
        <Stack gap={0.5}>
          {node.options.map((opt) => (
            <Box
              key={opt.id}
              sx={{
                position: 'relative',
                px: 1,
                py: 0.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontSize: 12,
              }}
            >
              {truncate(opt.label, 24)}
              <Handle
                type="source"
                position={Position.Right}
                id={`op-${opt.id}`}
                style={{ ...handleSx, top: '50%' }}
              />
            </Box>
          ))}
          {node.options.length === 0 && (
            <Typography variant="caption" color="warning.main">Sin opciones — agregar</Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
});

export const MessageNodeView = memo(function MessageNodeView(
  props: NodeProps<{ id: string; node: BotMessageNode; isStart: boolean } & BaseNodeData> & { selected?: boolean },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box sx={{ ...wrapperSx, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'info.main', color: 'common.white' }}>
        <ChatBubbleOutlineIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>MESSAGE</Typography>
        <Box sx={{ flex: 1 }} />
        {data.isStart && <Chip size="small" label="START" sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }} />}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {data.id}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
          {truncate(node.text, 100)}
        </Typography>
        {!node.nextNodeId && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            (terminal — sin siguiente)
          </Typography>
        )}
      </Box>
      <Handle type="source" position={Position.Right} id="next" style={handleSx} />
    </Box>
  );
});

export const HandoffNodeView = memo(function HandoffNodeView(
  props: NodeProps<{ id: string; node: BotHandoffNode; isStart: boolean } & BaseNodeData> & { selected?: boolean },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box sx={{ ...wrapperSx, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'secondary.main', color: 'common.white' }}>
        <HeadsetMicIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>HANDOFF</Typography>
        <Box sx={{ flex: 1 }} />
        {data.isStart && <Chip size="small" label="START" sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }} />}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {data.id}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
          {truncate(node.text, 100)}
        </Typography>
        {node.escalate && (
          <Chip size="small" label="ESCALATE" color="warning" sx={{ mt: 0.5, height: 18, fontSize: 10 }} />
        )}
      </Box>
    </Box>
  );
});

// 4.N.2 — CAPTURE
export const CaptureNodeView = memo(function CaptureNodeView(
  props: NodeProps<{ id: string; node: BotCaptureNode; isStart: boolean } & BaseNodeData> & { selected?: boolean },
) {
  const { data, selected } = props;
  const node = data.node;
  const validateLabel =
    node.validate?.kind === 'preset'
      ? node.validate.preset
      : node.validate?.kind === 'regex'
        ? 'regex'
        : 'sin validar';
  return (
    <Box sx={{ ...wrapperSx, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'warning.main', color: 'common.white' }}>
        <KeyboardIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>CAPTURE</Typography>
        <Box sx={{ flex: 1 }} />
        {data.isStart && <Chip size="small" label="START" sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }} />}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {data.id}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
          {truncate(node.text, 80)}
        </Typography>
        <Stack direction="row" gap={0.5} sx={{ mt: 0.75 }}>
          <Chip size="small" label={`→ {{${node.saveAs || '?'}}}`} sx={{ height: 20, fontSize: 10 }} />
          <Chip size="small" label={validateLabel} variant="outlined" sx={{ height: 20, fontSize: 10 }} />
        </Stack>
        <Box sx={{ position: 'relative', mt: 1, py: 0.5, px: 1, bgcolor: 'success.light', color: 'success.contrastText', borderRadius: 1, fontSize: 11 }}>
          ✓ válido → next
          <Handle type="source" position={Position.Right} id="next" style={{ ...handleSx, top: '50%' }} />
        </Box>
        <Box sx={{ position: 'relative', mt: 0.5, py: 0.5, px: 1, bgcolor: 'error.light', color: 'error.contrastText', borderRadius: 1, fontSize: 11 }}>
          ✗ retry {node.retryNodeId ? '' : '(re-prompt)'}
          <Handle type="source" position={Position.Right} id="retry" style={{ ...handleSx, top: '50%' }} />
        </Box>
      </Box>
    </Box>
  );
});

// 4.N.2 — MEDIA
export const MediaNodeView = memo(function MediaNodeView(
  props: NodeProps<{ id: string; node: BotMediaNode; isStart: boolean } & BaseNodeData> & { selected?: boolean },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box sx={{ ...wrapperSx, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'success.dark', color: 'common.white' }}>
        <AttachFileIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>MEDIA · {node.mediaType.toUpperCase()}</Typography>
        <Box sx={{ flex: 1 }} />
        {data.isStart && <Chip size="small" label="START" sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }} />}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {data.id}
        </Typography>
        {node.mediaId ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
            id: {truncate(node.mediaId, 22)}
          </Typography>
        ) : (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
            sin archivo — subir
          </Typography>
        )}
        {node.caption && (
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
            {truncate(node.caption, 80)}
          </Typography>
        )}
        {!node.nextNodeId && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            (terminal — sin siguiente)
          </Typography>
        )}
      </Box>
      <Handle type="source" position={Position.Right} id="next" style={handleSx} />
    </Box>
  );
});

// 4.N.2 — CONDITION
function whenLabel(w: BotConditionWhen): string {
  if (w.kind === 'var') return `${w.var} ${w.op} "${truncate(w.value, 12)}"`;
  if (w.kind === 'time') return `${w.between[0]}–${w.between[1]}`;
  if (w.kind === 'weekday') {
    const names = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    return w.days.map((d) => names[d] ?? '?').join('');
  }
  return '?';
}

export const ConditionNodeView = memo(function ConditionNodeView(
  props: NodeProps<{ id: string; node: BotConditionNode; isStart: boolean } & BaseNodeData> & { selected?: boolean },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box sx={{ ...wrapperSx, borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'grey.700', color: 'common.white' }}>
        <CallSplitIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>CONDITION</Typography>
        <Box sx={{ flex: 1 }} />
        {data.isStart && <Chip size="small" label="START" sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }} />}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
          {data.id}
        </Typography>
        <Stack gap={0.5} sx={{ mt: 0.5 }}>
          {node.branches.map((b) => (
            <Box
              key={b.id}
              sx={{ position: 'relative', px: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: 11 }}
            >
              {truncate(whenLabel(b.when), 26)}
              <Handle type="source" position={Position.Right} id={`br-${b.id}`} style={{ ...handleSx, top: '50%' }} />
            </Box>
          ))}
          {node.branches.length === 0 && (
            <Typography variant="caption" color="warning.main">Sin ramas — agregar</Typography>
          )}
          <Box
            sx={{ position: 'relative', px: 1, py: 0.5, bgcolor: 'action.selected', borderRadius: 1, fontSize: 11, fontStyle: 'italic' }}
          >
            else
            <Handle type="source" position={Position.Right} id="else" style={{ ...handleSx, top: '50%' }} />
          </Box>
        </Stack>
      </Box>
    </Box>
  );
});

// 4.O.5 — SET_VAR (interno, sin output al usuario)
function formatSetVarValue(v: string | number | boolean): string {
  if (typeof v === 'string') return v.length > 0 ? `"${truncate(v, 20)}"` : '""';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export const SetVarNodeView = memo(function SetVarNodeView(
  props: NodeProps<{ id: string; node: BotSetVarNode; isStart: boolean } & BaseNodeData> & {
    selected?: boolean;
  },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box
      sx={{
        ...wrapperSx,
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        borderStyle: 'dashed',
      }}
    >
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'grey.500', color: 'common.white' }}>
        <FunctionsIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>
          SET_VAR
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label="interno"
          sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.25)', color: 'common.white', fontSize: 10 }}
        />
        {data.isStart && (
          <Chip
            size="small"
            label="START"
            sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }}
          />
        )}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', display: 'block' }}
        >
          {data.id}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
          {`{{${node.varName || '?'}}} = ${formatSetVarValue(node.value)}`}
        </Typography>
        {!node.nextNodeId && !node.gotoTopic && (
          <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
            sin salida
          </Typography>
        )}
      </Box>
      <Handle type="source" position={Position.Right} id="next" style={handleSx} />
    </Box>
  );
});

// 4.N.3 — HTTP (interno, sin output al usuario)
export const HttpNodeView = memo(function HttpNodeView(
  props: NodeProps<{ id: string; node: BotHttpNode; isStart: boolean } & BaseNodeData> & {
    selected?: boolean;
  },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box
      sx={{
        ...wrapperSx,
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'info.dark', color: 'common.white' }}>
        <HttpIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>
          HTTP · {node.method}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label="interno"
          sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.25)', color: 'common.white', fontSize: 10 }}
        />
        {data.isStart && (
          <Chip
            size="small"
            label="START"
            sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }}
          />
        )}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', display: 'block' }}
        >
          {data.id}
        </Typography>
        <Typography
          variant="caption"
          sx={{ mt: 0.5, display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}
        >
          {truncate(node.url || 'sin URL', 60)}
        </Typography>
        <Stack direction="row" gap={0.5} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={`→ {{${node.saveAs || '?'}}}`} sx={{ height: 20, fontSize: 10 }} />
          {node.mockResponse && (
            <Chip
              size="small"
              label="mock-ready"
              variant="outlined"
              color="warning"
              sx={{ height: 20, fontSize: 10 }}
            />
          )}
        </Stack>
        <Box
          sx={{
            position: 'relative',
            mt: 1,
            py: 0.5,
            px: 1,
            bgcolor: 'success.light',
            color: 'success.contrastText',
            borderRadius: 1,
            fontSize: 11,
          }}
        >
          ✓ ok → next
          <Handle type="source" position={Position.Right} id="next" style={{ ...handleSx, top: '50%' }} />
        </Box>
        <Box
          sx={{
            position: 'relative',
            mt: 0.5,
            py: 0.5,
            px: 1,
            bgcolor: 'error.light',
            color: 'error.contrastText',
            borderRadius: 1,
            fontSize: 11,
          }}
        >
          ✗ error → error
          <Handle
            type="source"
            position={Position.Right}
            id="error"
            style={{ ...handleSx, top: '50%' }}
          />
        </Box>
      </Box>
    </Box>
  );
});

// 4.P.2 — FOREACH (interno, no entrega mensaje; itera array)
export const ForeachNodeView = memo(function ForeachNodeView(
  props: NodeProps<{ id: string; node: BotForeachNode; isStart: boolean } & BaseNodeData> & {
    selected?: boolean;
  },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box
      sx={{
        ...wrapperSx,
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        borderStyle: 'dashed',
      }}
    >
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'grey.700', color: 'common.white' }}>
        <LoopIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>
          FOREACH
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label="interno"
          sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.25)', color: 'common.white', fontSize: 10 }}
        />
        {data.isStart && (
          <Chip
            size="small"
            label="START"
            sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }}
          />
        )}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', display: 'block' }}
        >
          {data.id}
        </Typography>
        <Typography
          variant="caption"
          sx={{ mt: 0.5, display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}
        >
          items: {truncate(node.items || '?', 40)}
        </Typography>
        <Stack direction="row" gap={0.5} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`item → {{${node.itemVar || '?'}}}`}
            sx={{ height: 20, fontSize: 10 }}
          />
          {node.indexVar && (
            <Chip
              size="small"
              label={`idx → {{${node.indexVar}}}`}
              sx={{ height: 20, fontSize: 10 }}
            />
          )}
        </Stack>
        <Box
          sx={{
            position: 'relative',
            mt: 1,
            py: 0.5,
            px: 1,
            bgcolor: 'primary.light',
            color: 'primary.contrastText',
            borderRadius: 1,
            fontSize: 11,
          }}
        >
          ↻ body (cada item)
          <Handle type="source" position={Position.Right} id="body" style={{ ...handleSx, top: '50%' }} />
        </Box>
        <Box
          sx={{
            position: 'relative',
            mt: 0.5,
            py: 0.5,
            px: 1,
            bgcolor: 'action.selected',
            borderRadius: 1,
            fontSize: 11,
            fontStyle: 'italic',
          }}
        >
          done → fin del loop
          <Handle type="source" position={Position.Right} id="done" style={{ ...handleSx, top: '50%' }} />
        </Box>
      </Box>
    </Box>
  );
});

// 4.Q.1 — DELAY (interno, no entrega mensaje; pausa N ms para fix de ordering)
export const DelayNodeView = memo(function DelayNodeView(
  props: NodeProps<{ id: string; node: BotDelayNode; isStart: boolean } & BaseNodeData> & {
    selected?: boolean;
  },
) {
  const { data, selected } = props;
  const node = data.node;
  return (
    <Box
      sx={{
        ...wrapperSx,
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        borderStyle: 'dashed',
      }}
    >
      <Handle type="target" position={Position.Left} style={handleSx} />
      <Box sx={{ ...headerSx, bgcolor: 'warning.dark', color: 'common.white' }}>
        <HourglassEmptyIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>
          DELAY
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label="interno"
          sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.25)', color: 'common.white', fontSize: 10 }}
        />
        {data.isStart && (
          <Chip
            size="small"
            label="START"
            sx={{ height: 18, bgcolor: 'success.main', color: 'common.white', fontSize: 10 }}
          />
        )}
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', display: 'block' }}
        >
          {data.id}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
          ⏱ {typeof node.ms === 'number' ? `${node.ms} ms` : '— ms'}
        </Typography>
        {!node.nextNodeId && (
          <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
            sin salida
          </Typography>
        )}
      </Box>
      <Handle type="source" position={Position.Right} style={handleSx} />
    </Box>
  );
});

export const nodeTypes = {
  menu: MenuNodeView,
  message: MessageNodeView,
  handoff: HandoffNodeView,
  capture: CaptureNodeView,
  media: MediaNodeView,
  condition: ConditionNodeView,
  setvar: SetVarNodeView,
  http: HttpNodeView,
  foreach: ForeachNodeView,
  delay: DelayNodeView,
};
