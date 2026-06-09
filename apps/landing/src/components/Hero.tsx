import { useUser } from '@clerk/clerk-react';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  MessageCircle,
  Instagram,
  Facebook,
  MessagesSquare,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { PANEL_URL, SIGNUP_URL } from '@/lib/config';

const CHANNELS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: MessageCircle, label: 'WhatsApp' },
  { icon: Instagram, label: 'Instagram' },
  { icon: Facebook, label: 'Messenger' },
  { icon: MessagesSquare, label: 'Webchat' },
  { icon: Mail, label: 'Email' },
];

export function Hero() {
  const { isSignedIn } = useUser();

  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 hero-glow pointer-events-none" />
      <div aria-hidden className="absolute inset-0 bg-grid pointer-events-none [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_30%,transparent_75%)]" />

      <div className="container-narrow relative pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 mb-7">
          <span className="inline-block size-1.5 rounded-full bg-brand-400 animate-pulse" />
          Multicanal + agentes de IA · WhatsApp Business API oficial
        </div>

        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-balance leading-[1.05]">
          Conversaciones que <span className="text-brand-400">venden.</span>
          <br />
          Multicanal, con agentes de IA.
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-lg sm:text-xl text-neutral-400 text-balance">
          Plataforma multicanal y agéntica para equipos comerciales y de atención: WhatsApp,
          Instagram, Messenger y Webchat en un inbox unificado, con bots y agentes de IA que
          responden solos —y derivan a una persona cuando hace falta.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={isSignedIn ? PANEL_URL : SIGNUP_URL}
            className="inline-flex items-center gap-2 rounded-md px-6 h-12 text-base font-medium bg-brand-500 text-white hover:bg-brand-600 transition shadow-xl shadow-brand-500/35"
          >
            {isSignedIn ? 'Ir al panel' : 'Empezar gratis'}
            <ArrowRight className="size-4" strokeWidth={2.5} />
          </a>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-md px-5 h-12 text-base font-medium text-neutral-200 hover:text-white border border-white/10 hover:border-white/20 transition"
          >
            Ver cómo funciona
          </a>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-brand-400" /> Sin tarjeta de crédito
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="size-4 text-brand-400" /> Setup en menos de 10 min
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-brand-400" /> Tus datos en tu cuenta
          </span>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {CHANNELS.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-300"
            >
              <Icon className="size-3.5 text-brand-400" strokeWidth={2} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
