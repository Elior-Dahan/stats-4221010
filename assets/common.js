/*
 * Shared lecture-page chrome: navigation (prev / home / next) and a back-to-top button.
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
    @media (max-width: 1320px) { .bottom { margin-bottom: 68px; } } /* room for the back-to-top button */
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

  // Back-to-top button: fixed at the bottom-left, shown after about one screen of scrolling.
  // Where it would sit on top of the text column (narrow screens), it shows only while the
  // reader scrolls up, so it never covers the lines being read on the way down.
  const TOP_CSS = `
    :host { all: initial; }
    button {
      position: fixed; left: 16px; bottom: 16px; z-index: 30;
      width: 44px; height: 44px; padding: 0; border-radius: 50%;
      display: grid; place-items: center; cursor: pointer;
      color: var(--accent, #1f4e8c);
      background: var(--surface, #ffffff);
      border: 1px solid var(--rule-strong, #b5c0cf);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
      opacity: 0; visibility: hidden; transform: translateY(6px);
      transition: opacity .15s, transform .15s, visibility 0s linear .15s;
    }
    :host([data-show]) button { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
    button:hover { background: var(--surface-2, #eef2f7); }
    button:focus-visible { outline: 2px solid var(--accent, #1f4e8c); outline-offset: 2px; }
    :host([data-theme="dark"]) button {
      color: var(--accent, #8db6ec);
      background: var(--surface, #1b2129);
      border-color: var(--rule-strong, #46525f);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    }
    :host([data-theme="dark"]) button:hover { background: var(--surface-2, #232b36); }
    @media (max-width: 520px) { button { left: 12px; bottom: 12px; } }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    @media print { button { display: none; } }
  `;

  const mountTop = () => {
    const host = document.createElement('div');
    host.setAttribute('data-sg-top', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = TOP_CSS;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'חזרה לראש הדף';
    btn.setAttribute('aria-label', 'חזרה לראש הדף');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.addEventListener('click', () => {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: calm ? 'instant' : 'smooth' });
    });
    shadow.append(style, btn);
    document.body.append(host);
    hosts.push(host);
    syncTheme();

    let lastY = window.scrollY, goingUp = false;
    const update = () => {
      const y = window.scrollY;
      if (y < lastY - 2) goingUp = true; else if (y > lastY + 2) goingUp = false;
      lastY = y;
      const main = document.querySelector('main');
      const overText = !main || main.getBoundingClientRect().left < btn.getBoundingClientRect().right + 8;
      host.toggleAttribute('data-show', y > window.innerHeight && (!overText || goingUp));
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  };

  const run = () => {
    mountTop();
    return fetch(new URL('lectures.json', root), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => {
        const list = (data.lectures || []).filter(l => l.published).sort((a, b) => a.n - b.n);
        const i = list.findIndex(l => l.slug === slug);
        mount(i > 0 ? list[i - 1] : null, i >= 0 && i < list.length - 1 ? list[i + 1] : null);
      })
      .catch(() => mount(null, null));
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', run) : run();
})();
