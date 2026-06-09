import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import * as fs from 'node:fs';
import * as path from 'node:path';

// --- White-label ---------------------------------------------------------
// Carga .env.<DOCS_TARGET> de la raíz del monorepo (mismo archivo que usan
// frontend/landing). Default: massivo. Cambiá de marca con:
//   DOCS_TARGET=rgbot pnpm --filter @massivo/docs build   (o build:rgbot)
function loadTargetEnv(): Record<string, string> {
  const target = process.env.DOCS_TARGET || 'massivo';
  const out: Record<string, string> = {};
  try {
    const file = path.resolve(process.cwd(), `../../.env.${target}`);
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    // sin archivo → usa los defaults de massivo de abajo
  }
  return out;
}

const e = loadTargetEnv();
const APP_NAME = e.VITE_APP_NAME || 'Massivo';
const DOMAIN_ROOT = e.VITE_DOMAIN_ROOT || 'massivo.app';
const DOCS_URL = e.VITE_DOCS_URL || `https://docs.${DOMAIN_ROOT}`;
const SITE_URL = `https://${DOMAIN_ROOT}`;
const PANEL_URL = e.VITE_PANEL_URL || `https://panel.${DOMAIN_ROOT}`;
const SUPPORT_EMAIL = e.VITE_SUPPORT_EMAIL || `hola@${DOMAIN_ROOT}`;

// Plugin remark: reemplaza la marca en el CONTENIDO de los .md (prosa + URLs de
// links/imágenes), SALTEANDO bloques de código (para no romper `@massivo/...`,
// `DATABASE_URL=...massivo...`, etc.). Para massivo es identidad.
const replaceBrand = (s: string): string =>
  s.split('massivo.app').join(DOMAIN_ROOT).split('Massivo').join(APP_NAME);

function brandRemarkPlugin() {
  const walk = (node: { type?: string; value?: unknown; url?: unknown; children?: unknown[] }): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'code' || node.type === 'inlineCode') return;
    if (node.type === 'text' && typeof node.value === 'string') node.value = replaceBrand(node.value);
    if (typeof node.url === 'string') node.url = replaceBrand(node.url);
    if (Array.isArray(node.children)) for (const c of node.children) walk(c as never);
  };
  return (tree: unknown): void => walk(tree as never);
}

const config: Config = {
  title: `${APP_NAME} Docs`,
  tagline: 'WhatsApp Business + Email marketing en un solo lugar',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
    faster: true,
  },

  url: DOCS_URL,
  baseUrl: '/',

  organizationName: APP_NAME.toLowerCase(),
  projectName: 'docs',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },

  // White-label del frontmatter (title/sidebar_label/description): el plugin remark
  // no ve el frontmatter (Docusaurus lo consume antes), así que lo reescribimos acá.
  markdown: {
    parseFrontMatter: async (params) => {
      const result = await params.defaultParseFrontMatter(params);
      const fm = result.frontMatter as Record<string, unknown>;
      for (const k of Object.keys(fm)) {
        if (typeof fm[k] === 'string') fm[k] = replaceBrand(fm[k] as string);
      }
      return result;
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // Sirve los docs directamente desde la raíz (sin /docs en la URL)
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          // White-label de la prosa (Massivo→APP_NAME, massivo.app→dominio).
          remarkPlugins: [brandRemarkPlugin],
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
      title: `${APP_NAME} Docs`,
      logo: {
        alt: APP_NAME,
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
          href: SITE_URL,
          label: 'Sitio',
          position: 'right',
        },
        {
          href: PANEL_URL,
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
            {label: 'Sitio', href: SITE_URL},
            {label: 'Panel', href: PANEL_URL},
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
            {label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}`},
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} ${APP_NAME}. Todos los derechos reservados.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'sql', 'typescript', 'tsx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
