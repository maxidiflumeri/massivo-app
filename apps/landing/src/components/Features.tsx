import {
  MessageCircle,
  Mail,
  Workflow,
  Inbox,
  Users,
  Lock,
  type LucideIcon,
} from 'lucide-react';

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: MessageCircle,
    title: 'WhatsApp Business API oficial',
    body:
      'Integración directa con Meta. Sin libs caseras que se rompen cuando WhatsApp actualiza. Templates aprobados, sesiones de 24h, multimedia, botones y listas.',
  },
  {
    icon: Mail,
    title: 'Email transaccional y masivo',
    body:
      'Templates con editor visual, variables dinámicas, métricas de aperturas y clicks, bounce y complaint handling automático. Compatible con AWS SES o tu propio SMTP.',
  },
  {
    icon: Workflow,
    title: 'Bots conversacionales sin código',
    body:
      'Constructor visual de flujos: menús, capturas, condiciones, llamadas a APIs externas. El mismo bot atiende WhatsApp; el equipo solo entra cuando hace falta.',
  },
  {
    icon: Inbox,
    title: 'Inbox unificado en tiempo real',
    body:
      'Todas las conversaciones de WhatsApp en una bandeja compartida. Asignaciones, notas internas, respuestas rápidas, estados. Para equipos de 1 a 50 personas.',
  },
  {
    icon: Users,
    title: 'Multi-tenant nativo',
    body:
      'Cada empresa con su organización, sus teams, sus permisos. Los datos están aislados a nivel de base. Pensado para agencias que manejan varios clientes.',
  },
  {
    icon: Lock,
    title: 'Cifrado en reposo y en tránsito',
    body:
      'Tokens de Meta y credenciales SMTP cifrados con AES-256-GCM. Webhooks firmados con verificación de signature. TLS 1.2+ en todos los endpoints.',
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
            Massivo cubre el ciclo completo: captación por email, conversación por WhatsApp,
            automatización con bots, y un inbox para que el equipo cierre.
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
