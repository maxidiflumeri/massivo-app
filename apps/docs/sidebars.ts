import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Sidebar único para toda la docs. Mantengo el orden de la TOC del plan:
 * Empezar → Conceptos → Email → WhatsApp → Bots → Contactos → Admin →
 * Referencia → FAQ.
 *
 * Las carpetas vacías o aún sin contenido se mantienen comentadas para que
 * el sidebar no rompa hasta que las páginas existan.
 */
const sidebars: SidebarsConfig = {
  mainSidebar: [
    {
      type: 'category',
      label: 'Empezar',
      collapsed: false,
      link: {type: 'generated-index', slug: '/empezar'},
      items: [
        'empezar/que-es-massivo',
        'empezar/tour-plataforma',
        'empezar/primera-campana',
        'empezar/glosario',
      ],
    },
    {
      type: 'category',
      label: 'Conceptos',
      collapsed: false,
      link: {type: 'generated-index', slug: '/conceptos'},
      items: [
        'conceptos/orgs-teams-usuarios',
        'conceptos/planes-limites-consumo',
        'conceptos/multi-tenancy',
        'conceptos/permisos-roles',
      ],
    },
    {
      type: 'category',
      label: 'Email',
      collapsed: false,
      link: {type: 'generated-index', slug: '/email'},
      items: [
        {
          type: 'category',
          label: 'Conceptos',
          items: [
            'email/conceptos/dominios-verificados',
            'email/conceptos/dkim-spf-dmarc',
            'email/conceptos/reply-to-vs-from',
            'email/conceptos/suppression-list',
            'email/conceptos/tracking-opens-clicks',
            'email/conceptos/templates-handlebars',
          ],
        },
        'email/agregar-dominio',
        'email/conectar-cuenta-smtp',
        'email/crear-template',
        'email/crear-campana',
        'email/metricas-reportes',
        'email/gestionar-desuscriptos',
      ],
    },
    // {
    //   type: 'category',
    //   label: 'WhatsApp',
    //   items: [...]
    // },
    // {
    //   type: 'category',
    //   label: 'Bots',
    //   items: [...]
    // },
  ],
};

export default sidebars;
