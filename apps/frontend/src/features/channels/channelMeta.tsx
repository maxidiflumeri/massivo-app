import type { ComponentType, ReactNode } from 'react';
import { SvgIcon, type SvgIconProps } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import InstagramIcon from '@mui/icons-material/Instagram';
import LanguageIcon from '@mui/icons-material/Language';

/** Logo oficial de Messenger (no existe en @mui/icons-material → SVG de marca propio). */
function MessengerIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 512 512" {...props}>
      <path d="M256.55 8C116.52 8 8 110.34 8 248.57c0 72.3 29.71 134.78 78.07 177.94 8.35 7.51 6.63 11.86 8.05 58.23A19.92 19.92 0 0 0 122 502.31c52.91-23.3 53.59-25.14 62.56-22.7C337.85 521.8 504 423.7 504 248.57 504 110.34 396.59 8 256.55 8zm149.24 185.13l-73 115.57a37.37 37.37 0 0 1-53.91 9.93l-58.08-43.47a15 15 0 0 0-18 0l-78.37 59.44c-10.46 7.93-24.16-4.6-17.11-15.67l73-115.57a37.36 37.36 0 0 1 53.91-9.93l58.06 43.46a15 15 0 0 0 18 0l78.41-59.42c10.44-7.94 24.14 4.6 17.09 15.66z" />
    </SvgIcon>
  );
}

export type ChannelKind = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'WEBCHAT';

export interface ChannelKindMeta {
  kind: ChannelKind;
  label: string;
  /** Subtítulo corto para las tarjetas del selector. */
  blurb: string;
  Icon: ComponentType<SvgIconProps>;
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
    Icon: MessengerIcon,
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
