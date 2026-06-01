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
    {
      type: 'category',
      label: 'WhatsApp',
      collapsed: false,
      link: {type: 'generated-index', slug: '/whatsapp'},
      items: [
        {
          type: 'category',
          label: 'Conceptos',
          items: [
            'whatsapp/conceptos/meta-whatsapp-business-api',
            'whatsapp/conceptos/phone-number-id-access-token',
            'whatsapp/conceptos/templates-aprobados',
            'whatsapp/conceptos/24h-window',
            'whatsapp/conceptos/webhooks-meta',
          ],
        },
        'whatsapp/configurar-numero',
        'whatsapp/crear-template',
        'whatsapp/crear-campana',
        'whatsapp/inbox',
        'whatsapp/respuestas-rapidas',
        'whatsapp/opt-out-compliance',
      ],
    },
    {
      type: 'category',
      label: 'Bots',
      collapsed: false,
      link: {type: 'generated-index', slug: '/bots'},
      items: [
        {
          type: 'category',
          label: 'Conceptos',
          items: [
            'bots/conceptos/que-es-un-bot',
            'bots/conceptos/bot-sessions-variables',
            'bots/conceptos/multi-tema-router',
            'bots/conceptos/cuando-bot-vs-humano',
            'bots/conceptos/draft-vs-published',
          ],
        },
        'bots/crear-primer-bot',
        'bots/editor-de-flujo',
        {
          type: 'category',
          label: 'Tipos de nodos',
          items: [
            'bots/nodos/menu',
            'bots/nodos/message',
            'bots/nodos/handoff',
            'bots/nodos/capture',
            'bots/nodos/media',
            'bots/nodos/condition',
            'bots/nodos/set-var',
            'bots/nodos/http',
            'bots/nodos/foreach',
          ],
        },
        {
          type: 'category',
          label: 'Recetas',
          items: [
            'bots/recetas/capturar-lead',
            'bots/recetas/faq-con-handoff',
            'bots/recetas/recordatorio-postventa',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Contactos',
      collapsed: false,
      link: {type: 'generated-index', slug: '/contactos'},
      items: [
        {
          type: 'category',
          label: 'Conceptos',
          items: [
            'contactos/conceptos/modelo-unificado',
            'contactos/conceptos/merge-suggestions',
            'contactos/conceptos/listas-y-tags',
          ],
        },
        'contactos/importar-csv',
        'contactos/buscar-y-filtrar',
        'contactos/gestionar-duplicados',
        'contactos/reportes',
      ],
    },
    {
      type: 'category',
      label: 'Administración',
      collapsed: false,
      link: {type: 'generated-index', slug: '/administracion'},
      items: [
        'administracion/gestionar-usuarios',
        'administracion/audit-log',
        'administracion/cambiar-plan-billing',
      ],
    },
    {
      type: 'category',
      label: 'Referencia',
      collapsed: true,
      link: {type: 'generated-index', slug: '/referencia'},
      items: [
        'referencia/atajos-teclado',
        'referencia/codigos-error',
        'referencia/limites-del-plan',
      ],
    },
    'faq',
    'troubleshooting',
  ],
};

export default sidebars;
