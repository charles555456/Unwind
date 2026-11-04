/*
 * Shelf — the whole Kobo library on the Reading page (Private only).
 *
 * The Reading page gets two tabs: 書架 (this) and 書摘 (the existing list of
 * highlights). The shelf shows every book on the reader, either as spines
 * or as covers:
 *
 *   spines  width grows with the number of highlights, a fine dot texture
 *           gets denser the more was highlighted (the site's point dust),
 *           and a faint fill rises from the bottom with reading progress
 *   covers  the reader's own thumbnails, in greyscale, loaded on demand
 *           from the private database as they scroll into view
 *
 * Tapping a book opens a card with its progress and highlights. The data is
 * the LIBRARY global that index.html loads after unlocking; covers come from
 * get_kobo_covers(pw, ids). Nothing is stored in the browser except the
 * chosen tab, mode, filter and order.
 */
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lib = () => (typeof LIBRARY !== 'undefined' && Array.isArray(LIBRARY) ? LIBRARY : []);
  const pw = () => (typeof storedPassword !== 'undefined' ? storedPassword : '');
  const onPage = () => typeof currentPage !== 'undefined' && currentPage === 'reading';
  const pref = (k, d) => { try { return localStorage.getItem('unwind-shelf-' + k) || d; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem('unwind-shelf-' + k, v); } catch (e) {} };

  const st = {
    tab: pref('tab', 'shelf'),          // shelf | notes
    mode: pref('mode', 'spines'),       // spines | covers
    filter: pref('filter', 'all'),      // all | reading | finished | unread
    sort: pref('sort', 'recent'),       // recent | highlights | title
    samples: false,
    open: null,                         // id of the book in the card
    covers: new Map(),                  // id → data URL
    want: new Set(), timer: 0, observer: null,
    root: null, sys: false
  };
  const SYS = () => window.UnwindSystem;
  const activeQ = () => (st.sys && SYS() ? SYS().active() : null);
  const inQ = id => { const q = activeQ(); return !!(q && q.books.some(b => b.book === id)); };

  const STATUS = { 0: '還沒讀', 1: '在讀', 2: '讀完' };
  const KIND = { purchased: '購買', sideloaded: '自己的檔案', subscription: 'Kobo Plus', sample: '試讀' };
  const day = s => (s ? String(s).slice(0, 10) : '');
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const shortTitle = t => String(t || '').split(/[：:｜|【(（]/)[0].trim() || String(t || '');

  // ── which books, in what order ──
  function books() {
    const q = (document.getElementById('readingSearch') || {}).value || '';
    const ql = q.trim().toLowerCase();
    let list = lib().filter(b => st.samples || b.kind !== 'sample');
    if (st.filter === 'reading') list = list.filter(b => b.readStatus === 1);
    if (st.filter === 'finished') list = list.filter(b => b.readStatus === 2);
    if (st.filter === 'unread') list = list.filter(b => !b.readStatus);
    if (ql) list = list.filter(b => (b.title + ' ' + b.author).toLowerCase().includes(ql));
    const by = {
      recent: (a, b) => String(b.lastRead || '').localeCompare(String(a.lastRead || '')),
      highlights: (a, b) => b.highlights.length - a.highlights.length,
      title: (a, b) => a.title.localeCompare(b.title, 'zh-Hant')
    }[st.sort];
    return list.slice().sort(by);
  }
  function counts() {
    const all = lib().filter(b => st.samples || b.kind !== 'sample');
    return {
      all: all.length,
      reading: all.filter(b => b.readStatus === 1).length,
      finished: all.filter(b => b.readStatus === 2).length,
      unread: all.filter(b => !b.readStatus).length,
      samples: lib().filter(b => b.kind === 'sample').length
    };
  }

  // ── building blocks ──
  function spine(b) {
    const n = b.highlights.length;
    const w = 18 + Math.min(22, Math.round(Math.log2(1 + n) * 4));
    const h = 150 + (hash(b.id) % 46);
    const dust = n ? Math.min(0.55, 0.12 + Math.log2(1 + n) * 0.07) : 0;
    const pct = Math.max(0, Math.min(100, b.percentRead || (b.readStatus === 2 ? 100 : 0)));
    return `<button class="spine s${b.readStatus || 0}${st.open === b.id ? ' open' : ''}${inQ(b.id) ? ' inq' : ''}" data-book="${esc(b.id)}"
        style="--w:${w}px;--h:${h}px;--dust:${dust.toFixed(2)};--pct:${pct}%"
        title="${esc(b.title)}${b.author ? ' — ' + esc(b.author) : ''}">
        <span class="spine-title">${esc(shortTitle(b.title))}</span>
        ${n ? `<span class="spine-n">${n}</span>` : ''}
      </button>`;
  }
  function cover(b) {
    const url = st.covers.get(b.id);
    const pct = Math.max(0, Math.min(100, b.percentRead || (b.readStatus === 2 ? 100 : 0)));
    return `<button class="cover${st.open === b.id ? ' open' : ''}${inQ(b.id) ? ' inq' : ''}" data-book="${esc(b.id)}" title="${esc(b.title)}">
        <span class="cover-img" data-cover="${b.hasCover ? esc(b.id) : ''}">${url ? `<img src="${url}" alt="">` : `<span class="cover-blank">${esc(shortTitle(b.title))}</span>`}</span>
        <span class="cover-title">${esc(shortTitle(b.title))}</span>
        <span class="cover-bar"><span style="width:${pct}%"></span></span>
      </button>`;
  }
  function card(b) {
    const url = st.covers.get(b.id);
    const meta = [KIND[b.kind] || '', STATUS[b.readStatus || 0] + (b.readStatus === 1 && b.percentRead ? ' ' + b.percentRead + '%' : ''),
      b.lastRead ? '上次 ' + day(b.lastRead) : '', b.highlights.length ? b.highlights.length + ' 條劃線' : '沒有劃線'].filter(Boolean).join(' · ');
    const hl = b.highlights.slice(-5).reverse();
    return `<div class="shelf-card" role="region" aria-label="${esc(b.title)}">
        <button class="sys-x shelf-close" data-shelf="close" aria-label="關閉">×</button>
        <div class="shelf-card-head">
          <span class="cover-img" data-cover="${b.hasCover ? esc(b.id) : ''}">${url ? `<img src="${url}" alt="">` : `<span class="cover-blank">${esc(shortTitle(b.title))}</span>`}</span>
          <div>
            <h2 class="shelf-card-title">${esc(b.title)}</h2>
            ${b.author ? `<p class="shelf-card-author">${esc(b.author)}</p>` : ''}
            <p class="shelf-card-meta">${esc(meta)}</p>
          </div>
        </div>
        ${questionBlock(b)}
        ${hl.length ? `<p class="sys-label">最近的劃線</p>
        <ul class="shelf-hl">${hl.map(h => `<li>${esc(h.text)}${h.note ? `<span class="shelf-hl-note">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul>
        ${b.highlights.length > hl.length ? `<button class="x-btn small" data-shelf="notes" data-title="${esc(b.title)}">看全部 ${b.highlights.length} 條 →</button>` : ''}` : ''}
      </div>`;
  }

  // the one question being read now, and whether this book is in it
  function questionBlock(b) {
    if (!st.sys) return '';
    const q = activeQ();
    if (!q) return `<div class="shelf-q">
        <p class="sys-label">還沒有進行中的問題</p>
        <div class="sys-row"><input class="sys-input" id="shelfQ" maxlength="120" placeholder="這本書要幫你回答什麼問題？" autocomplete="off">
        <button class="x-btn small primary" data-shelf="start-q">開始，放進這本</button></div>
      </div>`;
    const books = q.books, here = books.some(x => x.book === b.id);
    const list = books.map(x => `<li><span>${esc(x.name)}</span>${x.book === b.id ? '' : `<button class="sys-del" data-shelf-unbook="${esc(x.book)}" aria-label="拿掉 ${esc(x.name)}">×</button>`}</li>`).join('');
    return `<div class="shelf-q">
        <p class="sys-label">目前的問題 · ${books.length} / 3 本</p>
        <p class="shelf-q-text">${esc(q.name)}</p>
        ${here ? `<p class="shelf-q-state">這本已經在裡面 <button class="x-btn small" data-shelf-unbook="${esc(b.id)}">拿掉</button></p>`
          : books.length < 3 ? `<button class="x-btn small primary" data-shelf="add-q">放進這個問題</button>`
          : `<p class="shelf-q-state">已經 3 本了。要放這本，先拿掉一本：</p>`}
        ${books.length ? `<ul class="shelf-q-list">${list}</ul>` : ''}
      </div>`;
  }

  // ── the shelf ──
  function render() {
    if (!st.sys && SYS() && lib().length) SYS().ensure().then(ok => { if (ok && !st.sys) { st.sys = true; if (onPage()) render(); } });
    if (!st.root) return;
    applyTab();
    if (st.tab !== 'shelf') return;
    const R = st.root;
    if (!lib().length) {
      R.innerHTML = '<p class="sys-note">解鎖 Private 後，這裡會出現 Kobo 裡的書。</p>';
      return;
    }
    const c = counts(), list = books(), open = st.open && lib().find(b => b.id === st.open);
    const chip = (k, label, n) => `<button class="review-tab${st.filter === k ? ' active' : ''}" data-shelf-filter="${k}">${label} <span class="shelf-count">${n}</span></button>`;
    R.innerHTML = `
      <div class="shelf-controls">
        <div class="sys-chips">${chip('all', '全部', c.all)}${chip('reading', '在讀', c.reading)}${chip('finished', '讀完', c.finished)}${chip('unread', '還沒讀', c.unread)}</div>
        <div class="shelf-right">
          <select class="shelf-sort" id="shelfSort" aria-label="排序">
            <option value="recent"${st.sort === 'recent' ? ' selected' : ''}>最近讀</option>
            <option value="highlights"${st.sort === 'highlights' ? ' selected' : ''}>劃線最多</option>
            <option value="title"${st.sort === 'title' ? ' selected' : ''}>書名</option>
          </select>
          <div class="shelf-mode" role="group" aria-label="顯示方式">
            <button class="${st.mode === 'spines' ? 'active' : ''}" data-shelf-mode="spines">書脊</button>
            <button class="${st.mode === 'covers' ? 'active' : ''}" data-shelf-mode="covers">封面</button>
          </div>
        </div>
      </div>
      ${c.samples ? `<label class="shelf-samples"><input type="checkbox" id="shelfSamples"${st.samples ? ' checked' : ''}> 顯示試讀本（${c.samples}）</label>` : ''}
      ${open ? card(open) : ''}
      <p class="shelf-legend">${st.mode === 'covers'
        ? '封面下的細線＝閱讀進度'
        : '書脊越寬、點越密＝劃線越多　·　底部填滿＝閱讀進度　·　書名較亮＝在讀'}${activeQ() ? '　·　' + (st.mode === 'covers' ? '粗框' : '頂端粗線') + '＝在目前的問題裡' : ''}</p>
      ${list.length
        ? `<div class="shelf-${st.mode}">${list.map(st.mode === 'covers' ? cover : spine).join('')}</div>`
        : '<p class="sys-note">沒有符合的書。</p>'}`;
    const sub = document.getElementById('readingSubtitle');
    if (sub) sub.textContent = `${c.all} 本書 · 在讀 ${c.reading} · 讀完 ${c.finished}`;
    watchCovers();
  }

  function applyTab() {
    const page = document.getElementById('page-reading');
    if (!page) return;
    page.classList.toggle('shelf-on', st.tab === 'shelf');
    page.querySelectorAll('[data-shelf-tab]').forEach(b => b.classList.toggle('active', b.dataset.shelfTab === st.tab));
  }

  // ── covers, fetched as they come into view ──
  function watchCovers() {
    if (!st.root) return;
    if (!st.observer && 'IntersectionObserver' in window) {
      st.observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          st.observer.unobserve(e.target);
          const id = e.target.dataset.cover;
          if (id && !st.covers.has(id)) { st.want.add(id); schedule(); }
        });
      }, { rootMargin: '400px 0px' });
    }
    st.root.querySelectorAll('[data-cover]').forEach(el => {
      const id = el.dataset.cover;
      if (!id || st.covers.has(id)) return;
      if (st.observer) st.observer.observe(el); else { st.want.add(id); schedule(); }
    });
  }
  function schedule() { clearTimeout(st.timer); st.timer = setTimeout(fetchCovers, 120); }
  async function fetchCovers() {
    const ids = [...st.want].slice(0, 60);
    ids.forEach(id => st.want.delete(id));
    if (!ids.length || !pw()) return;
    try {
      const { data, error } = await sb.rpc('get_kobo_covers', { pw: pw(), p_ids: ids });
      if (error) throw error;
      (data || []).forEach(r => {
        const url = 'data:image/jpeg;base64,' + r.jpeg_b64;
        st.covers.set(r.book_id, url);
        st.root.querySelectorAll(`[data-cover="${CSS.escape(r.book_id)}"]`).forEach(el => { el.innerHTML = '<img src="' + url + '" alt="">'; });
      });
    } catch (e) { console.log('covers unavailable', e); }
    if (st.want.size) schedule();
  }

  // ── events ──
  document.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('[data-shelf-tab]');
    if (tab) { st.tab = tab.dataset.shelfTab; keep('tab', st.tab); render(); if (st.tab === 'notes' && typeof renderReading === 'function') renderReading(document.getElementById('readingSearch').value); return; }
    if (!st.root || !st.root.contains(t)) return;
    const f = t.closest('[data-shelf-filter]'); if (f) { st.filter = f.dataset.shelfFilter; keep('filter', st.filter); render(); return; }
    const m = t.closest('[data-shelf-mode]'); if (m) { st.mode = m.dataset.shelfMode; keep('mode', st.mode); render(); return; }
    const a = t.closest('[data-shelf]');
    if (a && a.dataset.shelf === 'close') { st.open = null; render(); return; }
    if (a && a.dataset.shelf === 'start-q') {
      const inp = st.root.querySelector('#shelfQ'), text = inp && inp.value.trim();
      if (!text) { inp && inp.focus(); return; }
      if (SYS().startQuestion(text) && st.open) SYS().addBook(lib().find(x => x.id === st.open));
      render(); return;
    }
    if (a && a.dataset.shelf === 'add-q') { const bk = lib().find(x => x.id === st.open); if (bk) SYS().addBook(bk); render(); return; }
    const ub = t.closest('[data-shelf-unbook]'); if (ub) { SYS().removeBook(ub.dataset.shelfUnbook); render(); return; }
    if (a && a.dataset.shelf === 'notes') {
      st.tab = 'notes'; keep('tab', st.tab);
      const s = document.getElementById('readingSearch'); s.value = a.dataset.title;
      applyTab(); renderReading(s.value); window.scrollTo({ top: 0 });
      return;
    }
    const b = t.closest('[data-book]');
    if (b) {
      st.open = st.open === b.dataset.book ? null : b.dataset.book;
      render();
      const c = st.root.querySelector('.shelf-card');
      if (c) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'shelfSort') { st.sort = e.target.value; keep('sort', st.sort); render(); }
    if (e.target.id === 'shelfSamples') { st.samples = e.target.checked; render(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'readingSearch' && st.tab === 'shelf') render(); });
  document.addEventListener('unwind:system', () => { if (onPage() && st.tab === 'shelf') render(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'shelfQ' && !e.isComposing) { e.preventDefault(); const b = st.root.querySelector('[data-shelf="start-q"]'); if (b) b.click(); return; } if (e.key === 'Escape' && st.open && onPage() && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { st.open = null; render(); } });

  // ── wiring ──
  function build() {
    const page = document.getElementById('page-reading');
    if (!page || document.getElementById('shelfRoot')) return;
    const tabs = document.createElement('div');
    tabs.className = 'shelf-tabs';
    tabs.innerHTML = '<button class="review-tab" data-shelf-tab="shelf">書架</button><button class="review-tab" data-shelf-tab="notes">書摘</button>';
    const toolbar = page.querySelector('.reading-toolbar');
    page.insertBefore(tabs, toolbar);
    const root = document.createElement('section');
    root.id = 'shelfRoot'; root.className = 'shelf';
    page.insertBefore(root, document.getElementById('readingList'));
    st.root = root;
    const s = document.getElementById('readingSearch');
    if (s) s.placeholder = '搜尋書名、作者或書摘內容...';
    applyTab();
  }

  // System's 「在書架打開」
  window.UnwindShelf = {
    open(id) {
      st.tab = 'shelf'; keep('tab', st.tab); st.open = id; render();
      const c = st.root && st.root.querySelector('.shelf-card');
      if (c) c.scrollIntoView({ block: 'start' });
    }
  };

  function init() {
    build();
    const baseNavigate = window.navigate;
    window.navigate = function (page) { baseNavigate(page); if (page === 'reading') render(); };
    const baseRenderAll = window.renderAll;
    if (typeof baseRenderAll === 'function') {
      window.renderAll = function () { baseRenderAll(); if (!lib().length) { st.open = null; st.covers.clear(); st.sys = false; } if (onPage()) render(); };
    }
    if (onPage()) render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
