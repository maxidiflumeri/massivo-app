import { useUser } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import { PANEL_URL, SIGNUP_URL } from '@/lib/config';
import { brand } from '@/lib/brand';

export function CtaBand() {
  const { isSignedIn } = useUser();

  return (
    <section className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="container-narrow">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500/15 via-neutral-900 to-neutral-950 ring-1 ring-brand-500/20 px-8 py-14 sm:px-14 sm:py-20 text-center">
          <div aria-hidden className="absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000,transparent)]" />
          <div className="relative">
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
              Tu equipo está perdiendo conversaciones <br className="hidden sm:block" />
              en este momento.
            </h2>
            <p className="mt-5 max-w-xl mx-auto text-lg text-neutral-300">
              Probá {brand.name} gratis, conectá tu WhatsApp en 10 minutos y empezá a recuperarlas hoy.
            </p>
            <div className="mt-9">
              <a
                href={isSignedIn ? PANEL_URL : SIGNUP_URL}
                className="inline-flex items-center gap-2 rounded-md px-6 h-12 text-base font-medium bg-brand-500 text-white hover:bg-brand-600 transition shadow-xl shadow-brand-500/35"
              >
                {isSignedIn ? 'Ir al panel' : 'Empezar gratis'}
                <ArrowRight className="size-4" strokeWidth={2.5} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
