import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import InstagramIcon from '@mui/icons-material/Instagram';
import ChatIcon from '@mui/icons-material/Chat';
import LanguageIcon from '@mui/icons-material/Language';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ChannelKind } from './types';
import { channelLabel } from './capabilities';

/**
 * Fase 1e — ícono/badge de canal por conversación. Mapea `ChannelKind` a un ícono
 * y color de marca. Es el signo visible del inbox omnicanal; hoy todas las filas
 * muestran WhatsApp.
 */
const ICON_BY_KIND: Record<ChannelKind, SvgIconComponent> = {
  WHATSAPP: WhatsAppIcon,
  INSTAGRAM: InstagramIcon,
  MESSENGER: ChatIcon,
  WEBCHAT: LanguageIcon,
};

const COLOR_BY_KIND: Record<ChannelKind, string> = {
  WHATSAPP: '#25D366',
  INSTAGRAM: '#E1306C',
  MESSENGER: '#0084FF',
  WEBCHAT: '#6E7781',
};

export function ChannelBadge({ kind, size = 16 }: { kind: ChannelKind; size?: number }) {
  const Icon = ICON_BY_KIND[kind] ?? ChatIcon;
  const color = COLOR_BY_KIND[kind] ?? 'text.secondary';
  return (
    <Icon
      titleAccess={channelLabel(kind)}
      sx={{ fontSize: size, color, flexShrink: 0 }}
    />
  );
}
