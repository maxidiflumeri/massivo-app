import { prepareHtmlForTracking } from './prepare-html';

const base = 'http://localhost:3001';
const token = 'tok-x';

describe('prepareHtmlForTracking', () => {
  it('reescribe href http/https a /api/track/click con dest urlencoded', () => {
    const html = '<a href="https://example.com/foo?a=1">x</a>';
    const out = prepareHtmlForTracking({ html, token, publicUrl: base, unsubscribeUrl: base + "/api/unsubscribe?t=" + token, senderLabel: "TestOrg" });
    expect(out).toContain(
      `href="${base}/api/track/click?t=${encodeURIComponent(token)}&u=${encodeURIComponent('https://example.com/foo?a=1')}"`,
    );
  });

  it('preserva comillas simples', () => {
    const html = "<a href='https://example.com'>x</a>";
    const out = prepareHtmlForTracking({ html, token, publicUrl: base, unsubscribeUrl: base + "/api/unsubscribe?t=" + token, senderLabel: "TestOrg" });
    expect(out).toMatch(/href='http:\/\/localhost:3001\/api\/track\/click/);
  });

  it('no reescribe href que ya apuntan al publicUrl', () => {
    const html = `<a href="${base}/unsubscribe?t=abc">x</a>`;
    const out = prepareHtmlForTracking({ html, token, publicUrl: base, unsubscribeUrl: base + "/api/unsubscribe?t=" + token, senderLabel: "TestOrg" });
    // El href interno se preserva (no se reescribe a /api/track/click)…
    expect(out).toContain(`<a href="${base}/unsubscribe?t=abc">x</a>`);
    expect(out).not.toContain('/api/track/click');
    // …y el pixel se inyecta igual al final (el footer va en el medio).
    expect(out).toContain(expectedPixel(token, base));
  });

  it('no toca mailto/tel/anchors', () => {
    const html = '<a href="mailto:a@b.com">m</a><a href="#top">t</a>';
    const out = prepareHtmlForTracking({ html, token, publicUrl: base, unsubscribeUrl: base + "/api/unsubscribe?t=" + token, senderLabel: "TestOrg" });
    expect(out).toContain('href="mailto:a@b.com"');
    expect(out).toContain('href="#top"');
    expect(out).not.toContain('/api/track/click');
  });

  it('inyecta pixel antes de </body>', () => {
    const html = '<html><body><p>hi</p></body></html>';
    const out = prepareHtmlForTracking({ html, token, publicUrl: base, unsubscribeUrl: base + "/api/unsubscribe?t=" + token, senderLabel: "TestOrg" });
    expect(out).toContain(`<img src="${base}/api/track/open.gif?t=${encodeURIComponent(token)}"`);
    expect(out).toMatch(/<img[^>]+\/><\/body>/);
  });

  it('appendea pixel al final si no hay </body>', () => {
    const html = '<p>hi</p>';
    const out = prepareHtmlForTracking({ html, token, publicUrl: base, unsubscribeUrl: base + "/api/unsubscribe?t=" + token, senderLabel: "TestOrg" });
    expect(out.endsWith('/>')).toBe(true);
    expect(out).toContain('open.gif');
  });

  it('publicUrl con trailing slash se normaliza', () => {
    const html = '<a href="https://x.com">x</a>';
    const out = prepareHtmlForTracking({ html, token, publicUrl: base + '/', unsubscribeUrl: base + '/api/unsubscribe?t=' + token, senderLabel: 'TestOrg' });
    expect(out).not.toContain('localhost:3001//');
  });
});

function expectedPixel(tok: string, base: string): string {
  return `<img src="${base}/api/track/open.gif?t=${encodeURIComponent(tok)}" width="1" height="1" alt="" style="display:none" />`;
}
