import type { ReactNode } from 'react';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import InstagramIcon from '@mui/icons-material/Instagram';
import ChatIcon from '@mui/icons-material/Chat';
import LanguageIcon from '@mui/icons-material/Language';
import type { SvgIconComponent } from '@mui/icons-material';

export type ChannelKind = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'WEBCHAT';

export interface ChannelKindMeta {
  kind: ChannelKind;
  label: string;
  /** Subtítulo corto para las tarjetas del selector. */
  blurb: string;
  Icon: SvgIconComponent;
  /** Color de marca (icon + acentos). Para IG usamos un gradiente (ver `bg`). */
  color: string;
  /** Fondo del avatar del ícono (sólido o gradiente). */
  bg: string;
  /** Si false, el alta está deshabilitada ("próximamente"). */
  available: boolean;
}

export const CHANNEL_KINDS: ChannelKindMeta[] = [
  {
    kind: 'WHATSAPP',
    label: 'WhatsApp',
    blurb: 'Número de WhatsApp Cloud API (Meta)',
    Icon: WhatsAppIcon,
    color: '#25D366',
    bg: '#25D36622',
    available: true,
  },
  {
    kind: 'MESSENGER',
    label: 'Messenger',
    blurb: 'Página de Facebook (Messenger)',
    Icon: ChatIcon,
    color: '#0084FF',
    bg: '#0084FF22',
    available: true,
  },
  {
    kind: 'INSTAGRAM',
    label: 'Instagram',
    blurb: 'Cuenta de Instagram (DMs)',
    Icon: InstagramIcon,
    color: '#E1306C',
    bg: 'linear-gradient(135deg, #F58529 0%, #DD2A7B 50%, #515BD4 100%)',
    available: true,
  },
  {
    kind: 'WEBCHAT',
    label: 'Webchat',
    blurb: 'Widget de chat en tu sitio',
    Icon: LanguageIcon,
    color: '#6E7781',
    bg: '#6E778122',
    available: false,
  },
];

const BY_KIND = new Map<ChannelKind, ChannelKindMeta>(CHANNEL_KINDS.map((m) => [m.kind, m]));

export function channelMeta(kind: string): ChannelKindMeta {
  return BY_KIND.get(kind as ChannelKind) ?? CHANNEL_KINDS[0]!;
}

/** Avatar redondo con el ícono de marca del canal (para tarjetas/listas). */
export function ChannelIcon({ kind, size = 40 }: { kind: string; size?: number }): ReactNode {
  const meta = channelMeta(kind);
  const Icon = meta.Icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: meta.bg,
        color: meta.color,
        flexShrink: 0,
      }}
    >
      <Icon sx={{ fontSize: size * 0.55, color: meta.bg.startsWith('linear') ? '#fff' : meta.color }} />
    </span>
  );
}
