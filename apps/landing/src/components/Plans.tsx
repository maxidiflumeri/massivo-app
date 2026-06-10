import { Check } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { cn } from '@/lib/cn';
import { PANEL_URL, SIGNUP_URL } from '@/lib/config';

type Plan = {
  code: string;
  name: string;
  desc: string;
  features: string[];
  highlight?: boolean;
  cta: string;
};

// Mantener sincronizado con packages/prisma/prisma/seed.ts (features/limits de
// cada plan) y con PlanManagement.tsx del frontend.
const PLANS: Plan[] = [
  {
    code: 'FREE',
    name: 'Free',
    desc: 'Para probar, validar y entender la plataforma.',
    features: [
      '1.000 emails / mes',
      '250 mensajes WhatsApp / mes',
      '1 team · 2 usuarios',
      'Inbox unificado básico',
    ],
    cta: 'Empezar gratis',
  },
  {
    code: 'STARTER',
    name: 'Starter',
    desc: 'Para PyMEs que ya tienen volumen y quieren escalar.',
    features: [
      '25.000 emails / mes',
      '5.000 mensajes WhatsApp / mes',
      '1 team · hasta 5 usuarios',
      '1 bot conversacional',
      '1 agente IA',
    ],
    highlight: true,
    cta: 'Probar Starter',
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    desc: 'Para agencias multi-cliente y equipos de soporte grandes.',
    features: [
      '150.000 emails / mes',
      '30.000 mensajes WhatsApp / mes',
      '5 teams · hasta 20 usuarios',
      '5 bots conversacionales · 5 agentes IA',
      'Multi-tenant para gestionar varios clientes',
      'Soporte prioritario',
    ],
    cta: 'Hablar con ventas',
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    desc: 'Para operaciones grandes con necesidades a medida.',
    features: [
      'Emails y WhatsApp sin límite',
      'Teams y usuarios sin límite',
      '10 bots conversacionales · 10 agentes IA',
      'SSO SAML',
      'Soporte dedicado',
    ],
    cta: 'Hablar con ventas',
  },
];

export function Plans() {
  const { isSignedIn } = useUser();
  const target = isSignedIn ? PANEL_URL : SIGNUP_URL;

  return (
    <section id="plans" className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="container-narrow">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider">Planes</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Todo incluido. Elegís según el volumen.
          </h2>
          <p className="mt-5 text-lg text-neutral-400">
            Todos los planes incluyen WhatsApp Business API, email e inbox unificado. La
            diferencia es el volumen y las automatizaciones (bots y agentes IA, desde Starter).
            Escribinos para conocer las condiciones del programa beta.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.code}
              className={cn(
                'relative rounded-xl p-7 ring-1 transition',
                plan.highlight
                  ? 'bg-gradient-to-b from-brand-500/10 to-transparent ring-brand-500/40 shadow-2xl shadow-brand-500/10'
                  : 'bg-neutral-950 ring-white/10 hover:ring-white/20',
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-brand-500 px-3 py-0.5 text-xs font-medium text-white">
                  Recomendado
                </div>
              )}

              <h3 className="font-display text-xl font-semibold tracking-tight">{plan.name}</h3>
              <p className="mt-1 text-sm text-neutral-400">{plan.desc}</p>

              <a
                href={target}
                className={cn(
                  'mt-6 inline-flex w-full items-center justify-center rounded-md h-10 text-sm font-medium transition',
                  plan.highlight
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'bg-white/5 text-white hover:bg-white/10 ring-1 ring-white/10',
                )}
              >
                {plan.cta}
              </a>

              <ul className="mt-7 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-neutral-300">
                    <Check
                      className="size-4 mt-0.5 shrink-0 text-brand-400"
                      strokeWidth={2.5}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
