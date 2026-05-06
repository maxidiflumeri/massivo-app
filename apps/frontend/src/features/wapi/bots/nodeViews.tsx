import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import type { BotMenuNode, BotMessageNode, BotHandoffNode } from './types';

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

export const nodeTypes = {
  menu: MenuNodeView,
  message: MessageNodeView,
  handoff: HandoffNodeView,
};
