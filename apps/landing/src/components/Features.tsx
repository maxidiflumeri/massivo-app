import { brand } from '@/lib/brand';
import {
  MessagesSquare,
  Sparkles,
  Mail,
  Workflow,
  Inbox,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: MessagesSquare,
    title: 'Mensajería multicanal',
    body:
      'WhatsApp Business API oficial, Instagram, Messenger y un Webchat para tu sitio. El cliente te escribe por donde quiera; vos respondés desde un solo lugar.',
  },
  {
    icon: Sparkles,
    title: 'Agentes de IA — plataforma agéntica',
    body:
      'Un agente con IA atiende solo, usa la base de conocimiento de tu negocio (RAG) para responder con datos reales y deriva a una persona cuando hace falta.',
  },
  {
    icon: Workflow,
    title: 'Bots conversacionales sin código',
    body:
      'Constructor visual de flujos: menús, capturas, condiciones y llamadas a APIs externas. El mismo bot atiende todos tus canales; el equipo entra solo cuando hace falta.',
  },
  {
    icon: Inbox,
    title: 'Inbox unificado en tiempo real',
    body:
      'Todas las conversaciones de WhatsApp, Instagram, Messenger y Webchat en una bandeja compartida. Asignaciones, notas internas, respuestas rápidas y estados.',
  },
  {
    icon: Mail,
    title: 'Email transaccional y masivo',
    body:
      'Templates con editor visual, variables dinámicas, métricas de aperturas y clicks, bounce y complaint handling automático. Compatible con AWS SES o tu propio SMTP.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-tenant y seguro por diseño',
    body:
      'Cada empresa con su organización, equipos y permisos, aislada a nivel de base —ideal para agencias. Tokens y credenciales cifrados con AES-256-GCM y webhooks firmados.',
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="container-narrow">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider">Producto</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Lo que tu equipo necesita,
            <br />
            sin pagar 4 herramientas distintas.
          </h2>
          <p className="mt-5 text-lg text-neutral-400">
            {brand.name} cubre el ciclo completo: captás por email, conversás por WhatsApp, Instagram,
            Messenger y Webchat, automatizás con bots y agentes de IA, y cerrás desde un inbox unificado.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 rounded-xl overflow-hidden ring-1 ring-white/5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-neutral-950 p-7 hover:bg-neutral-900/60 transition group"
            >
              <div className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-500/10 ring-1 ring-brand-500/30 group-hover:bg-brand-500/20 transition">
                <Icon className="size-5 text-brand-400" strokeWidth={2} />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
