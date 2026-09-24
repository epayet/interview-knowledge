// Progressive enhancements: theme, drawer, search, link previews,
// trade-off filters and the system design map panel. Pages work without it.
(function () {
  const ROOT = document.currentScript?.dataset.root || '';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const html = document.documentElement;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Theme ----------
  const themeBtn = $('.theme-btn');
  const isDark = () => html.dataset.theme ? html.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const paintTheme = () => { if (themeBtn) themeBtn.firstChild.textContent = isDark() ? '☀' : '☾'; };
  paintTheme();
  themeBtn?.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    html.dataset.theme = next; store.set('theme', next); paintTheme();
  });

  // ---------- Drawer ----------
  const menuBtn = $('.menu-btn');
  menuBtn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (document.body.classList.contains('menu-open') && !e.target.closest('.sidebar, .menu-btn')) {
      document.body.classList.remove('menu-open'); menuBtn?.setAttribute('aria-expanded', 'false');
    }
  });
  $('.tree [aria-current="page"]')?.scrollIntoView({ block: 'center' });
  // Clicking a folder's name: if it's the page you're on, toggle it instead of reloading.
  // (Other folder names navigate; the page then opens with that folder expanded.)
  document.addEventListener('click', e => {
    const a = e.target.closest('.tree summary a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.getAttribute('aria-current') !== 'page') return;
    e.preventDefault();
    const d = a.closest('details');
    d.open = !d.open;
  });

  // ---------- TOC scroll spy ----------
  const tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map(a => [decodeURIComponent(a.hash.slice(1)), a]));
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) {
        tocLinks.forEach(a => a.classList.remove('active'));
        map.get(en.target.id)?.classList.add('active');
      }
    }, { rootMargin: '0px 0px -75% 0px' });
    map.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }

  // ---------- Data loaders ----------
  const cache = {};
  const load = (name) => cache[name] || (cache[name] = fetch(ROOT + 'assets/' + name).then(r => r.json()));
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  // ---------- Search ----------
  const q = $('#q'), results = $('#results');
  let mini = null, docs = null, sel = -1, filter = 'all';
  async function ensureIndex() {
    if (mini) return;
    await loadScript(ROOT + 'assets/minisearch.js');
    docs = await load('search.json');
    mini = new MiniSearch({ fields: ['title', 'headings', 'tags', 'text'], storeFields: ['url', 'title', 'kind', 'm', 'ex'], searchOptions: { boost: { title: 4, headings: 2, tags: 2 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' } });
    mini.addAll(docs);
  }
  const icons = { seedling: '🌱', growing: '🌿', established: '🌳' };
  function renderResults() {
    const term = q.value.trim();
    if (!term) { results.hidden = true; return; }
    let hits = mini.search(term);
    if (!hits.length) hits = mini.search(term, { combineWith: 'OR' });
    if (filter === 'notes') hits = hits.filter(h => h.kind === 'knowledge');
    if (filter === 'sources') hits = hits.filter(h => h.kind === 'source');
    if (filter === 'grown') hits = hits.filter(h => h.kind === 'source' || h.m !== 'seedling');
    hits = hits.slice(0, 12);
    const f = (id, label) => `<button type="button" class="chip" data-f="${id}" aria-pressed="${filter === id}">${label}</button>`;
    results.innerHTML = `<div class="r-filters">${f('all', 'All')}${f('notes', 'Notes')}${f('sources', 'Sources')}${f('grown', 'Hide 🌱 stubs')}</div>` +
      (hits.length ? hits.map((h, i) => `<a class="r-item" role="option" href="${ROOT}${h.url}" aria-selected="${i === sel}"><span class="r-title">${h.kind === 'source' ? '<span class="r-kind">source</span>' : icons[h.m] || ''} ${esc(h.title)}</span>${h.ex ? `<span class="r-ex">${esc(h.ex)}</span>` : ''}</a>`).join('')
        : '<div class="r-empty">No matches.</div>');
    results.hidden = false;
  }
  if (q) {
    q.addEventListener('focus', () => ensureIndex().then(() => q.value && renderResults()));
    q.addEventListener('input', async () => { await ensureIndex(); sel = -1; renderResults(); });
    q.addEventListener('keydown', e => {
      const items = $$('.r-item', results);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = Math.max(-1, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        items.forEach((it, i) => it.setAttribute('aria-selected', String(i === sel)));
        items[sel]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        const it = items[sel >= 0 ? sel : 0];
        if (it) location.href = it.href;
      } else if (e.key === 'Escape') { results.hidden = true; q.blur(); }
    });
    results.addEventListener('mousedown', e => {
      const b = e.target.closest('[data-f]');
      if (b) { e.preventDefault(); filter = b.dataset.f; renderResults(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) results.hidden = true; });
    document.addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); q.focus(); q.select(); }
    });
  }

  // ---------- Hover previews ----------
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const pop = document.createElement('div');
    pop.className = 'preview'; pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
    let timer = null, current = null;
    const kinds = { Blog: 'Article', Video: 'Video', Book: 'Book', Reddit: 'Discussion' };
    const hide = () => { clearTimeout(timer); current = null; pop.classList.remove('show'); };
    document.addEventListener('mouseover', e => {
      const a = e.target.closest('a[data-note]');
      if (!a || a === current || a.closest('.preview, .results, .tree')) return;
      current = a; clearTimeout(timer);
      timer = setTimeout(async () => {
        const data = await load('previews.json');
        const p = data[a.dataset.note];
        if (!p || current !== a) return;
        pop.innerHTML = `${p.k ? `<div class="p-kind">${kinds[p.k] || p.k}</div>` : ''}<div class="p-title">${esc(p.t)}</div>${p.m || ''}${p.e ? `<div class="p-ex">${esc(p.e)}</div>` : ''}`;
        const r = a.getBoundingClientRect();
        const w = Math.min(330, innerWidth - 24);
        let left = Math.min(Math.max(12, r.left + scrollX), scrollX + innerWidth - w - 12);
        pop.style.left = left + 'px';
        pop.style.top = '0px';
        pop.classList.add('show');
        const h = pop.offsetHeight;
        const below = r.bottom + 8 + h < innerHeight;
        pop.style.top = (below ? r.bottom + scrollY + 8 : r.top + scrollY - h - 8) + 'px';
      }, 280);
    });
    document.addEventListener('mouseout', e => { if (current && e.target.closest('a[data-note]') === current && !current.contains(e.relatedTarget)) hide(); });
    addEventListener('scroll', hide, { passive: true });
  }

  // ---------- Trade-off filters ----------
  const chips = $$('.filters .chip[data-factor]');
  if (chips.length) {
    const clear = $('.filters .chip.clear');
    const active = new Set();
    const apply = () => {
      const cards = $$('.to-card');
      for (const c of cards) {
        const fs = (c.dataset.factors || '').split('|');
        c.hidden = [...active].some(f => !fs.includes(f));
      }
      for (const g of $$('.to-group')) g.hidden = $$('.to-card', g).every(c => c.hidden);
      $('.empty-filter').hidden = cards.some(c => !c.hidden);
      clear.hidden = !active.size;
      chips.forEach(ch => ch.setAttribute('aria-pressed', String(active.has(ch.dataset.factor))));
      const u = new URL(location); active.size ? u.searchParams.set('f', [...active].join(',')) : u.searchParams.delete('f');
      history.replaceState(null, '', u);
    };
    chips.forEach(ch => ch.addEventListener('click', () => { active.has(ch.dataset.factor) ? active.delete(ch.dataset.factor) : active.add(ch.dataset.factor); apply(); }));
    clear.addEventListener('click', () => { active.clear(); apply(); });
    const initial = new URL(location).searchParams.get('f');
    if (initial) { initial.split(',').forEach(f => active.add(f)); apply(); }
  }

  // ---------- Map panel ----------
  const panel = $('#map-panel');
  if (panel) {
    const svg = $('.map-canvas .map-svg');
    const tpl = sel => $(`#map-panels template[${sel}]`);
    const light = ids => {
      svg.classList.toggle('dim', !!ids);
      $$('.map-canvas .map-comp').forEach(c => c.classList.toggle('lit', !!ids && ids.includes(c.dataset.comp)));
    };
    const show = (t, hash) => {
      panel.innerHTML = t.innerHTML;
      history.replaceState(null, '', '#' + hash);
      if (innerWidth <= 1080) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const selectComp = id => {
      const t = tpl(`data-comp="${id}"`);
      if (!t) return false;
      light(null);
      $$('.prob').forEach(p => p.setAttribute('aria-pressed', 'false'));
      $$('.map-comp').forEach(c => c.classList.toggle('selected', c.dataset.comp === id));
      show(t, id);
      return true;
    };
    const selectProblem = chip => {
      const t = tpl(`data-prob="${chip.dataset.prob}"`);
      if (!t) return false;
      const on = chip.getAttribute('aria-pressed') !== 'true';
      $$('.prob').forEach(p => p.setAttribute('aria-pressed', String(p === chip && on)));
      $$('.map-comp').forEach(c => c.classList.remove('selected'));
      if (!on) { light(null); panel.innerHTML = '<p class="muted panel-hint">Select a component or a problem.</p>'; history.replaceState(null, '', location.pathname); return true; }
      light(chip.dataset.comps.split(' ').filter(Boolean));
      show(t, chip.dataset.prob);
      return true;
    };
    const mapVisible = () => !!$('.map-wrap')?.offsetParent;
    document.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      const chip = e.target.closest('.prob');
      if (chip && mapVisible()) { if (selectProblem(chip)) e.preventDefault(); return; }
      const inner = e.target.closest('#map-panel [data-select]');
      if (inner) { e.preventDefault(); selectComp(inner.dataset.select); return; }
      const a = e.target.closest('.map-canvas [data-comp]');
      if (a && selectComp(a.dataset.comp)) e.preventDefault();
    });
    const h = location.hash.slice(1);
    if (h) { const chip = $(`.prob[data-prob="${h}"]`); chip ? selectProblem(chip) : selectComp(h); }
  }
  // ---------- Practice (flashcards) ----------
  const stage = $('.stage');
  if (stage) {
    const KEY = 'practice.v1';
    const load = () => { try { return JSON.parse(store.get(KEY) || '{}'); } catch { return {}; } };
    let prog = load();
    const save = () => store.set(KEY, JSON.stringify(prog));
    const cards = $$('#practice-cards template').map(t => ({ id: t.dataset.id, area: t.dataset.area, areaLabel: t.dataset.areaLabel, prompt: t.dataset.prompt, t }));
    const areas = new Set();
    const recent = [];
    let current = null;

    // Unseen cards and misses come up most; cards you keep getting right fade out (but never disappear).
    const weight = c => {
      const p = prog[c.id];
      if (!p) return 3;
      if (p.last === 'missed') return 8;
      if (p.last === 'shaky') return 4;
      return Math.max(0.3, 1.5 / (p.streak || 1));
    };
    const pool = () => cards.filter(c => !areas.size || areas.has(c.area));
    const pick = () => {
      const list = pool();
      const fresh = list.filter(c => !recent.includes(c.id));
      const from = fresh.length ? fresh : list;
      let r = Math.random() * from.reduce((s, c) => s + weight(c), 0);
      for (const c of from) { r -= weight(c); if (r <= 0) return c; }
      return from[from.length - 1];
    };
    const stats = () => {
      const list = pool();
      const seen = list.filter(c => prog[c.id]);
      const revisit = seen.filter(c => prog[c.id].last !== 'got').length;
      $('.stage-stats').textContent = `${seen.length}/${list.length} reviewed · ${revisit} to revisit`;
    };
    const show = c => {
      current = c;
      recent.push(c.id); if (recent.length > Math.min(5, Math.floor(cards.length / 2))) recent.shift();
      $('.stage-area').textContent = c.areaLabel;
      $('.stage-prompt').textContent = c.prompt;
      const ans = $('.stage-answer'); ans.hidden = true; ans.innerHTML = '';
      $('.rate').hidden = true; $('.stage-hint').hidden = false; $('.reveal-btn').hidden = false;
      history.replaceState(null, '', '#' + c.id);
      stats();
    };
    const reveal = () => {
      if (!current || !$('.stage-answer').hidden) return;
      const ans = $('.stage-answer');
      ans.innerHTML = current.t.innerHTML;
      ans.querySelector('.to-card')?.removeAttribute('id');
      ans.hidden = false; $('.rate').hidden = false; $('.stage-hint').hidden = true; $('.reveal-btn').hidden = true;
    };
    const rate = r => {
      if (!current || $('.rate').hidden) return;
      const p = prog[current.id] || { streak: 0, n: 0 };
      p.n++; p.last = r; p.streak = r === 'got' ? (p.streak || 0) + 1 : 0; p.at = Date.now();
      prog[current.id] = p; save();
      show(pick());
    };
    $('.reveal-btn').addEventListener('click', reveal);
    $('.skip-btn').addEventListener('click', () => show(pick()));
    $$('.rate-btn').forEach(b => b.addEventListener('click', () => rate(b.dataset.rate)));
    document.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && $('.stage-answer').hidden) { e.preventDefault(); reveal(); }
      else if (e.key === 'ArrowRight') show(pick());
      else if (['1', '2', '3'].includes(e.key)) rate({ 1: 'missed', 2: 'shaky', 3: 'got' }[e.key]);
    });
    const clearBtn = $('.practice-filters .clear');
    $$('.practice-filters [data-area]').forEach(b => b.addEventListener('click', () => {
      areas.has(b.dataset.area) ? areas.delete(b.dataset.area) : areas.add(b.dataset.area);
      b.setAttribute('aria-pressed', String(areas.has(b.dataset.area)));
      clearBtn.hidden = !areas.size;
      if (current && areas.size && !areas.has(current.area)) show(pick()); else stats();
    }));
    clearBtn.addEventListener('click', () => { areas.clear(); $$('.practice-filters [data-area]').forEach(b => b.setAttribute('aria-pressed', 'false')); clearBtn.hidden = true; stats(); });
    $('.reset-btn').addEventListener('click', () => { if (confirm('Forget all your practice ratings in this browser?')) { prog = {}; save(); stats(); } });
    const fromHash = cards.find(c => c.id === location.hash.slice(1));
    show(fromHash || pick());
  }

  // ---------- Home: random trade-off ----------
  const rt = $('.random-to');
  if (rt) {
    let items = [];
    try { items = JSON.parse($('.rt-data', rt).textContent); } catch {}
    const next = () => {
      if (!items.length) return;
      const it = items[Math.floor(Math.random() * items.length)];
      $('.rt-prompt', rt).textContent = it.p;
      $('.rt-area', rt).textContent = it.a;
      $('.rt-go', rt).href = ROOT + 'practice.html#' + it.id;
    };
    next();
    const nb = $('.rt-next', rt); nb.hidden = false; nb.addEventListener('click', next);
  }
})();
