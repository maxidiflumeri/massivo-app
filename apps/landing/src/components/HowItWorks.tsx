type Step = {
  num: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    num: '01',
    title: 'Conectá tus canales',
    body:
      'Linkás tu número de WhatsApp Business desde Meta (te guiamos paso a paso) y conectás SES o tu SMTP para email. 10 minutos.',
  },
  {
    num: '02',
    title: 'Importá tus contactos',
    body:
      'Subís tu lista CSV con consentimiento o seguís importando desde tu CRM. Massivo deduplica, valida y mantiene una suppression list global.',
  },
  {
    num: '03',
    title: 'Automatizá y mandá',
    body:
      'Construís bots con drag-and-drop, lanzás campañas con A/B, el inbox unificado avisa al equipo cuando una conversación necesita humano.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative py-24 sm:py-32 border-t border-white/5 bg-neutral-950"
    >
      <div className="container-narrow">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider">
            Cómo funciona
          </p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            En producción en una tarde,
            <br />
            no en un trimestre.
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map(({ num, title, body }, idx) => (
            <div key={num} className="relative">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-lg bg-brand-500/10 ring-1 ring-brand-500/30 font-display text-lg font-semibold text-brand-400">
                  {num}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="hidden md:block h-px flex-1 bg-gradient-to-r from-white/10 to-transparent"
                  />
                )}
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-neutral-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
