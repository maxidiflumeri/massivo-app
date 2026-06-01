import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Massivo Docs',
  tagline: 'WhatsApp Business + Email marketing en un solo lugar',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
    faster: true,
  },

  url: 'https://docs.massivo.app',
  baseUrl: '/',

  organizationName: 'massivo',
  projectName: 'docs',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // Sirve los docs directamente desde la raíz (sin /docs en la URL)
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          // No mostramos "Edit this page" — el repo es privado.
        },
        // Sin blog por ahora — lo activamos en F9 si lo necesitamos.
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    image: 'img/social-card.png',
    navbar: {
      title: 'Massivo Docs',
      logo: {
        alt: 'Massivo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Documentación',
        },
        {
          href: 'https://massivo.app',
          label: 'Sitio',
          position: 'right',
        },
        {
          href: 'https://panel.massivo.app',
          label: 'Ir al panel',
          position: 'right',
          className: 'navbar__cta',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Producto',
          items: [
            {label: 'Sitio', href: 'https://massivo.app'},
            {label: 'Panel', href: 'https://panel.massivo.app'},
          ],
        },
        {
          title: 'Documentación',
          items: [
            {label: 'Empezar', to: '/empezar/que-es-massivo'},
            {label: 'Email', to: '/email/conceptos/dominios-verificados'},
            {label: 'WhatsApp', to: '/whatsapp/conceptos/meta-whatsapp-business-api'},
            {label: 'Bots', to: '/bots/conceptos/que-es-un-bot'},
          ],
        },
        {
          title: 'Contacto',
          items: [
            {label: 'hola@massivo.app', href: 'mailto:hola@massivo.app'},
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Massivo. Todos los derechos reservados.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'sql', 'typescript', 'tsx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
