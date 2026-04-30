/**
 * Prepara el HTML para tracking:
 *   - Reescribe href absolutos (http/https) en <a> a /api/track/click?t=<jwt>&u=<dest>.
 *   - Inyecta pixel 1×1 al final del <body> apuntando a /api/track/open.gif?t=<jwt>.
 *
 * No toca href que ya apuntan al publicUrl propio (evita rewrite recursivo si
 * alguien escribe un link interno) ni href que no sean http/https (mailto:, tel:, #).
 *
 * Implementación con regex acotado para evitar sumar cheerio. El HTML producido por
 * Unlayer es bien formado y usa atributos comillados doble — esto es suficiente
 * para el set de templates que vamos a soportar.
 */
export interface PrepareHtmlInput {
  html: string;
  token: string;
  publicUrl: string;
}

const HREF_RE = /\bhref=("|')(https?:\/\/[^"']+)\1/gi;

export function prepareHtmlForTracking({ html, token, publicUrl }: PrepareHtmlInput): string {
  const base = publicUrl.replace(/\/+$/, '');
  const rewritten = html.replace(HREF_RE, (_match, quote: string, dest: string) => {
    if (dest.startsWith(base)) return `href=${quote}${dest}${quote}`;
    const url = `${base}/api/track/click?t=${encodeURIComponent(token)}&u=${encodeURIComponent(dest)}`;
    return `href=${quote}${url}${quote}`;
  });

  const pixel = `<img src="${base}/api/track/open.gif?t=${encodeURIComponent(token)}" width="1" height="1" alt="" style="display:none" />`;

  if (/<\/body\s*>/i.test(rewritten)) {
    return rewritten.replace(/<\/body\s*>/i, `${pixel}</body>`);
  }
  return `${rewritten}${pixel}`;
}
