import { channelMeta } from '../channels/channelMeta';
import type { ChannelKind } from './types';
import { channelLabel } from './capabilities';

/**
 * Fase 1e — ícono/badge de canal por conversación. Reusa `channelMeta` (única fuente
 * de verdad de ícono + color de marca por canal, incluido el logo real de Messenger)
 * para no duplicar mapas y quedar siempre en sync con las tarjetas de Canales.
 */
export function ChannelBadge({ kind, size = 16 }: { kind: ChannelKind; size?: number }) {
  const meta = channelMeta(kind);
  const Icon = meta.Icon;
  return (
    <Icon
      titleAccess={channelLabel(kind)}
      sx={{ fontSize: size, color: meta.color, flexShrink: 0 }}
    />
  );
}
