import { useUser } from '@clerk/clerk-react';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { PANEL_URL, SIGNUP_URL } from '@/lib/config';

export function Hero() {
  const { isSignedIn } = useUser();

  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 hero-glow pointer-events-none" />
      <div aria-hidden className="absolute inset-0 bg-grid pointer-events-none [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_30%,transparent_75%)]" />

      <div className="container-narrow relative pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 mb-7">
          <span className="inline-block size-1.5 rounded-full bg-brand-400 animate-pulse" />
          Meta WhatsApp Business API oficial · sin parches ni libs no-soportadas
        </div>

        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-balance leading-[1.05]">
          Conversaciones que <span className="text-brand-400">venden.</span>
          <br />
          WhatsApp y Email en un solo lugar.
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-lg sm:text-xl text-neutral-400 text-balance">
          Plataforma multi-canal para equipos comerciales y de atención: campañas masivas,
          bots automatizados y un inbox unificado. Sin abrir tres tabs distintos.
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
      </div>
    </section>
  );
}
