/**
 * Configuración de marca (white-label). TODO lo visible sale de variables Vite
 * `VITE_*` con default "Massivo" → cambiar de marca es setear estas variables
 * (ver `.env.massivo` / `.env.rgbot` en la raíz del repo) y construir con
 * `--mode <marca>`. No se toca código.
 */
const env = import.meta.env;

export const brand = {
  /** Nombre visible de la app (header, footer, auth, título de la pestaña). */
  name: (env.VITE_APP_NAME as string | undefined)?.trim() || 'Massivo',
  /** Tagline corto (footer / auth). */
  tagline: (env.VITE_APP_TAGLINE as string | undefined)?.trim() || 'Multichannel sender',
  /** URL pública de la documentación. */
  docsUrl: (env.VITE_DOCS_URL as string | undefined)?.trim() || 'https://docs.massivo.app',
};
