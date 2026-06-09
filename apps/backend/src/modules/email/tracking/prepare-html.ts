/**
 * Prepara el HTML del email para envío:
 *   - Reescribe href absolutos (http/https) en <a> a /api/track/click?t=<jwt>&u=<dest>.
 *   - Inyecta footer con "Enviado por <org> via Massivo" + link de unsubscribe.
 *   - Inyecta pixel 1×1 al final del <body> apuntando a /api/track/open.gif?t=<jwt>.
 *
 * No toca href que ya apuntan al publicUrl propio (evita rewrite recursivo si
 * alguien escribe un link interno) ni href que no sean http/https (mailto:, tel:, #).
 *
 * Implementación con regex acotado para evitar sumar cheerio. El HTML producido por
 * Unlayer es bien formado y usa atributos comillados doble — esto es suficiente
 * para el set de templates que vamos a soportar.
 */
import { appName } from '../../../common/app-brand';

export interface PrepareHtmlInput {
  html: string;
  token: string;
  publicUrl: string;
  /** URL absoluta del endpoint público de unsubscribe (con JWT firmado). */
  unsubscribeUrl: string;
  /** Etiqueta visible en footer — típicamente Organization.name del tenant. */
  senderLabel: string;
}

const HREF_RE = /\bhref=("|')(https?:\/\/[^"']+)\1/gi;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFooter(senderLabel: string, unsubscribeUrl: string): string {
  const safeLabel = escapeHtml(senderLabel);
  const safeUrl = escapeHtml(unsubscribeUrl);
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:32px;border-top:1px solid #e5e5e5">
  <tr>
    <td style="padding:16px 8px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:#888;text-align:center;line-height:1.6">
      Enviado por <strong style="color:#555">${safeLabel}</strong> vía ${appName()}<br>
      <a href="${safeUrl}" style="color:#888;text-decoration:underline">Cancelar suscripción</a>
    </td>
  </tr>
</table>
`.trim();
}

export function prepareHtmlForTracking({
  html,
  token,
  publicUrl,
  unsubscribeUrl,
  senderLabel,
}: PrepareHtmlInput): string {
  const base = publicUrl.replace(/\/+$/, '');
  const rewritten = html.replace(HREF_RE, (_match, quote: string, dest: string) => {
    if (dest.startsWith(base)) return `href=${quote}${dest}${quote}`;
    const url = `${base}/api/track/click?t=${encodeURIComponent(token)}&u=${encodeURIComponent(dest)}`;
    return `href=${quote}${url}${quote}`;
  });

  const footer = buildFooter(senderLabel, unsubscribeUrl);
  const pixel = `<img src="${base}/api/track/open.gif?t=${encodeURIComponent(token)}" width="1" height="1" alt="" style="display:none" />`;

  // Insertamos footer + pixel justo antes del </body> si existe; si no,
  // appendeamos al final del HTML.
  if (/<\/body\s*>/i.test(rewritten)) {
    return rewritten.replace(/<\/body\s*>/i, `${footer}${pixel}</body>`);
  }
  return `${rewritten}${footer}${pixel}`;
}
