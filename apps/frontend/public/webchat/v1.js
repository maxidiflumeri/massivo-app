/*!
 * Massivo Webchat — loader del widget embebible (Fase 4).
 *
 * Uso en el sitio del cliente:
 *   <script src="https://app.massivo.app/webchat/v1.js" data-massivo-key="wc_xxx" async></script>
 *
 * Crea una burbuja flotante y, al abrirla, un iframe con el chat real
 * (webchat.html?key=...). El iframe aísla el CSS/JS del sitio del cliente; el loader
 * controla la burbuja, el tamaño y el abrir/cerrar. El origin del iframe se deriva del
 * propio src de este script (no hace falta configurarlo).
 */
(function () {
  var script = document.currentScript || document.querySelector('script[data-massivo-key]');
  if (!script) return;
  var key = script.getAttribute('data-massivo-key');
  if (!key) {
    console.error('[massivo] Falta data-massivo-key en el <script> del widget.');
    return;
  }
  if (window.__massivoWebchatLoaded) return; // evita doble carga
  window.__massivoWebchatLoaded = true;

  var origin = new URL(script.src).origin;
  var open = false;

  // --- iframe (el chat real) ---
  var iframe = document.createElement('iframe');
  iframe.src = origin + '/webchat.html?key=' + encodeURIComponent(key);
  iframe.title = 'Chat';
  iframe.setAttribute('allow', 'autoplay; microphone');
  setStyles(iframe, {
    position: 'fixed', right: '20px', bottom: '90px', width: '370px', height: '560px',
    maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 120px)',
    border: '0', borderRadius: '16px', boxShadow: '0 12px 40px rgba(0,0,0,.18)',
    zIndex: '2147483646', display: 'none', background: '#fff',
  });

  // --- burbuja flotante (launcher) ---
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.innerHTML = chatSvg();
  setStyles(btn, {
    position: 'fixed', right: '20px', bottom: '20px', width: '56px', height: '56px',
    borderRadius: '50%', border: '0', cursor: 'pointer', background: '#5B5BD6', color: '#fff',
    boxShadow: '0 8px 24px rgba(0,0,0,.22)', zIndex: '2147483647',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  btn.onclick = function () { setOpen(!open); };

  function setOpen(v) {
    open = v;
    iframe.style.display = v ? 'block' : 'none';
    btn.innerHTML = v ? closeSvg() : chatSvg();
    btn.setAttribute('aria-label', v ? 'Cerrar chat' : 'Abrir chat');
  }

  // El widget puede pedir cerrarse (botón ✕ del panel).
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.massivo === 'close') setOpen(false);
  });

  function mount() {
    document.body.appendChild(iframe);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  function setStyles(el, s) { for (var k in s) el.style[k] = s[k]; }
  function chatSvg() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  }
  function closeSvg() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }
})();
