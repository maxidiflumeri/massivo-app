// Configuración de marca (white-label) de la landing. Todo sale de variables Vite
// `VITE_*` con default "Massivo" → cambiar de marca es `vite build --mode <target>`
// (lee `.env.<target>` de la raíz; envDir está apuntado a la raíz en vite.config).
const env = import.meta.env;
const root = (env.VITE_DOMAIN_ROOT as string | undefined)?.trim() || 'massivo.app';

export const brand = {
  name: (env.VITE_APP_NAME as string | undefined)?.trim() || 'Massivo',
  domainRoot: root,
  docsUrl: (env.VITE_DOCS_URL as string | undefined)?.trim() || `https://docs.${root}`,
  supportEmail: (env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || `hola@${root}`,
};
