/*
 * Shared lecture-page navigation (prev / home / next).
 * Include in every lecture page's <head>:
 *   <script src="../../assets/common.js" defer></script>
 * Renders inside Shadow DOM so it never clashes with the page's own CSS.
 * It uses the page's own design tokens (--font-body, --muted, --rule, --accent), which do
 * inherit into the shadow tree, so it matches the guide in both themes. The literal values
 * are fallbacks (the guides' palette) for a page that defines no tokens; for those,
 * light/dark follows <html data-theme> when the page sets it, otherwise the OS setting.
 */
(() => {
  const me = document.currentScript;
  if (!me) return;
  const root = new URL('../', me.src); // assets/../ = site root
  const m = location.pathname.match(/\/lectures\/([^/]+)\//);
  const slug = m ? decodeURIComponent(m[1]) : null;

  const CSS = `
    :host { all: initial; display: block; }
    nav {
      direction: rtl;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      max-width: 1180px;
      margin: 0 auto;
      padding: 10px 24px;
      font: 500 14px/1.4 var(--font-body, "IBM Plex Sans Hebrew", "Segoe UI", Arial, sans-serif);
      color: var(--muted, #6a7486);
    }
    .top { border-bottom: 1px solid var(--rule, #d6dde7); }
    .bottom { border-top: 1px solid var(--rule, #d6dde7); margin-top: 32px; }
    a { color: var(--accent, #1f4e8c); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .prev { justify-self: start; }
    .home { justify-self: center; font-weight: 600; }
    .next { justify-self: end; text-align: left; }
    .lbl { display: block; font-size: 12px; color: var(--muted, #6a7486); font-weight: 400; }
    :host([data-theme="dark"]) nav, :host([data-theme="dark"]) .lbl { color: var(--muted, #8f9aab); }
    :host([data-theme="dark"]) .top, :host([data-theme="dark"]) .bottom { border-color: var(--rule, #2f3946); }
    :host([data-theme="dark"]) a { color: var(--accent, #8db6ec); }
    @media print { nav { display: none; } }
    @media (max-width: 920px) { nav { padding: 10px 16px; } }
    @media (max-width: 520px) { .t { display: none; } }
  `;

  // Theme: follow the page's own choice (<html data-theme="dark|light">, set by the
  // guides' theme toggle) and fall back to the OS setting when the page has none.
  const osDark = window.matchMedia('(prefers-color-scheme: dark)');
  const hosts = [];
  const theme = () => {
    const t = document.documentElement.dataset.theme;
    return t === 'dark' || t === 'light' ? t : osDark.matches ? 'dark' : 'light';
  };
  const syncTheme = () => hosts.forEach(h => h.setAttribute('data-theme', theme()));
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  osDark.addEventListener('change', syncTheme);

  const link = (cls, lec, label) => {
    const span = document.createElement('span');
    span.className = cls;
    if (!lec) return span;
    const a = document.createElement('a');
    a.href = new URL(`lectures/${lec.slug}/`, root).href;
    const l = document.createElement('span');
    l.className = 'lbl';
    l.textContent = label;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = `${lec.n}. ${lec.title}`;
    a.append(l, t);
    span.append(a);
    return span;
  };

  const mount = (prev, next) => {
    for (const where of ['top', 'bottom']) {
      const host = document.createElement('div');
      host.setAttribute('data-sg-nav', where);
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      const nav = document.createElement('nav');
      nav.className = where;
      nav.setAttribute('aria-label', 'ניווט בין הרצאות');
      const home = document.createElement('a');
      home.className = 'home';
      home.href = root.href;
      home.textContent = 'כל ההרצאות';
      nav.append(link('prev', prev, '→ הקודמת'), home, link('next', next, 'הבאה ←'));
      shadow.append(style, nav);
      where === 'top' ? document.body.prepend(host) : document.body.append(host);
      hosts.push(host);
    }
    syncTheme();
  };

  const run = () =>
    fetch(new URL('lectures.json', root), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => {
        const list = (data.lectures || []).filter(l => l.published).sort((a, b) => a.n - b.n);
        const i = list.findIndex(l => l.slug === slug);
        mount(i > 0 ? list[i - 1] : null, i >= 0 && i < list.length - 1 ? list[i + 1] : null);
      })
      .catch(() => mount(null, null));

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', run) : run();
})();
