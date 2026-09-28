/*
 * Unwind extras — quote cards, Read Later, newsletter inbox.
 *
 * Loaded after the main script in index.html and leans on its globals:
 *   sb, storedPassword, isPrivate, currentPage, navigate, renderPrivate
 * Private data only ever travels through password-checked database functions.
 */
(function () {
  'use strict';

  // Safe for both text and attribute values. The main script's esc() leaves
  // quotes alone, which is not enough for text that ends up inside data-*.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const q = (s, root) => (root || document).querySelector(s);
  const qa = (s, root) => Array.from((root || document).querySelectorAll(s));

  const READABILITY_SRC = 'https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js';
  const PURIFY_SRC = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js';

  // ─────────────────────────────────────────────────────────
  //  Shared helpers
  // ─────────────────────────────────────────────────────────
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = () => { delete loaded[src]; reject(new Error('載入失敗：' + src)); };
        document.head.appendChild(el);
      });
    }
    return loaded[src];
  }

  class NeedsMigration extends Error {}

  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, Object.assign({ pw: storedPassword }, args || {}));
    if (error) {
      const msg = error.message || String(error);
      if (error.code === 'PGRST202' || /could not find the function|schema cache/i.test(msg)) {
        throw new NeedsMigration(msg);
      }
      throw new Error(msg);
    }
    return data;
  }

  function fmtDay(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function lockedHtml(what) {
    return `<div class="x-panel">
      <h3>需要先解鎖</h3>
      <p>${what}只有你自己看得到。先到 Private 輸入密碼。</p>
      <p style="margin-top:14px"><button class="x-btn primary" data-x-goto="private">前往 Private</button></p>
    </div>`;
  }

  function migrationHtml() {
    return `<div class="x-panel">
      <h3>資料庫還沒更新</h3>
      <p>這個功能需要新的資料表。只要做一次：</p>
      <ol>
        <li>打開 Supabase 專案的 SQL Editor</li>
        <li>貼上 repo 裡 <code>supabase/migration-v3.sql</code> 的全部內容</li>
        <li>按 Run，回到這頁重新整理</li>
      </ol>
    </div>`;
  }

  function sanitize(html, opts) {
    const clean = window.DOMPurify.sanitize(html, Object.assign({
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'video', 'audio', 'link', 'meta', 'base'],
      FORBID_ATTR: ['style', 'class', 'id', 'srcset', 'onerror', 'onload'],
      ALLOW_DATA_ATTR: false
    }, opts || {}));
    const box = document.createElement('div');
    box.innerHTML = clean;
    qa('a[href]', box).forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    qa('img', box).forEach(img => {
      const w = parseInt(img.getAttribute('width') || '0', 10), h = parseInt(img.getAttribute('height') || '0', 10);
      if ((w && w <= 2) || (h && h <= 2)) { img.remove(); return; } // tracking pixels
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.removeAttribute('width'); img.removeAttribute('height');
    });
    return box.innerHTML;
  }

  async function copyText(text, btn, label) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) { btn.textContent = '已複製'; setTimeout(() => { btn.textContent = label; }, 1400); }
    } catch (e) { /* clipboard blocked: nothing to do */ }
  }

  // ─────────────────────────────────────────────────────────
  //  Quote cards
  // ─────────────────────────────────────────────────────────
  const CARD_W = 1080, CARD_H = 1350, CARD_PAD = 96;
  const CLOSERS = '，。、！？；：」』）】》〉,.!?;:)]}”’…';
  const FONT_STACK = '"Inter", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif';

  function tokenize(par) {
    // CJK one glyph at a time; Latin runs kept whole so words do not split
    const out = [];
    const re = /[A-Za-z0-9À-ɏ'’\-_.@/%$#&+]+|\s+|[\s\S]/gu;
    let m;
    while ((m = re.exec(par))) out.push(/^\s+$/.test(m[0]) ? ' ' : m[0]);
    return out;
  }

  function wrap(ctx, text, maxW) {
    const lines = [];
    text.split('\n').forEach(par => {
      let line = '';
      tokenize(par).forEach(tok => {
        if (tok === ' ' && !line) return;
        const next = line + tok;
        if (ctx.measureText(next).width <= maxW || !line) { line = next; return; }
        if (CLOSERS.includes(tok)) { line = next; return; } // never start a line with closing punctuation
        lines.push(line.replace(/\s+$/, ''));
        line = tok === ' ' ? '' : tok;
      });
      lines.push(line.replace(/\s+$/, ''));
    });
    return lines;
  }

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // the home page's sphere, small, as a signature
  function drawSphere(ctx, cx, cy, R, seed) {
    const rand = seeded(seed);
    const tilt = 0.14, cT = Math.cos(tilt), sT = Math.sin(tilt);
    let n = 0, tries = 0;
    while (n < 1500 && tries++ < 30000) {
      const lat = (rand() * 2 - 1) * Math.PI / 2, lon = rand() * Math.PI * 2;
      if (rand() > 0.16 + 0.84 * Math.pow(Math.abs(Math.sin(lat)), 1.5)) continue;
      n++;
      const cl = Math.cos(lat), x = Math.cos(lon) * cl, y = Math.sin(lat), z = Math.sin(lon) * cl;
      const y2 = y * cT - z * sT, z2 = y * sT + z * cT, f = 1 + 0.22 * z2;
      const depth = Math.max(0, Math.min(1, (z2 + 1.1) / 2.2));
      const s = (rand() < 0.85 ? 1.3 : 2.4) * (0.7 + 0.5 * depth);
      ctx.fillStyle = 'rgba(242,242,242,' + (0.14 + 0.8 * depth).toFixed(3) + ')';
      ctx.fillRect(cx + x * R * f, cy + y2 * R * f, s, s);
    }
  }

  // Publishers pad titles with sales copy in trailing brackets; a card only needs the title.
  function shortTitle(title) {
    let t = String(title || '').trim();
    for (let i = 0; i < 3; i++) {
      const cut = t.replace(/\s*[（(【\[][^（）()【】\[\]]*[）)】\]]\s*$/, '').trim();
      if (cut === t || cut.length < 2) break;
      t = cut;
    }
    return t;
  }

  async function renderCard(item) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    const cv = document.createElement('canvas');
    cv.width = CARD_W; cv.height = CARD_H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.textBaseline = 'alphabetic';

    // header
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '400 26px ' + FONT_STACK;
    try { ctx.letterSpacing = '9px'; } catch (e) {}
    ctx.fillText('UNWIND', CARD_PAD, 132);
    try { ctx.letterSpacing = '0px'; } catch (e) {}

    // signature
    const seed = window.ReviewPick ? window.ReviewPick.hash(item.text) : 7;
    drawSphere(ctx, CARD_W - CARD_PAD - 58, 122, 58, seed);

    // source block, measured first so the quote knows how much room is left
    const maxW = CARD_W - CARD_PAD * 2;
    ctx.font = '400 30px ' + FONT_STACK;
    const srcLines = wrap(ctx, shortTitle(item.source), maxW).slice(0, 2);
    const hasAuthor = !!item.author;
    const footH = (srcLines.length ? srcLines.length * 44 : 0) + (hasAuthor ? 40 : 0) + 56;
    const top = 236, bottom = CARD_H - CARD_PAD - footH - 40;
    const maxH = bottom - top;

    // quote: largest size that fits
    let size = 58, lines = [], lh = 0;
    for (; size >= 30; size -= 2) {
      ctx.font = '400 ' + size + 'px ' + FONT_STACK;
      lh = Math.round(size * 1.72);
      lines = wrap(ctx, item.text, maxW);
      if (lines.length * lh <= maxH) break;
    }
    if (lines.length * lh > maxH) {
      const keep = Math.max(1, Math.floor(maxH / lh));
      lines = lines.slice(0, keep);
      let last = lines[keep - 1];
      while (last.length && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[keep - 1] = last + '…';
    }
    const blockH = lines.length * lh;
    let y = top + Math.max(0, (maxH - blockH) / 2) + size;
    ctx.fillStyle = '#f2f2f2';
    lines.forEach(l => { ctx.fillText(l, CARD_PAD, y); y += lh; });

    // footer
    let fy = CARD_H - CARD_PAD - footH + 28;
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(CARD_PAD, fy - 28, 56, 2);
    fy += 34;
    ctx.fillStyle = '#a6a6a6';
    ctx.font = '400 30px ' + FONT_STACK;
    srcLines.forEach(l => { ctx.fillText(l, CARD_PAD, fy); fy += 44; });
    if (hasAuthor) {
      ctx.fillStyle = '#6b6b6b';
      ctx.font = '400 26px ' + FONT_STACK;
      let a = item.author;
      while (a.length && ctx.measureText(a).width > maxW) a = a.slice(0, -1);
      ctx.fillText(a, CARD_PAD, fy - 4);
    }
    return cv;
  }

  let cardCanvas = null;

  function ensureOverlay() {
    let ov = q('#qcOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'qcOverlay';
    ov.className = 'qc-overlay';
    ov.innerHTML = `
      <img class="qc-img" id="qcImg" alt="引用圖卡">
      <div class="qc-actions">
        <button class="x-btn primary" id="qcShare">分享</button>
        <button class="x-btn" id="qcDownload">下載</button>
        <button class="x-btn" id="qcClose">關閉</button>
      </div>
      <div class="qc-hint" id="qcHint">手機可以長按圖片儲存</div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) closeCard(); });
    q('#qcClose').addEventListener('click', closeCard);
    q('#qcDownload').addEventListener('click', () => {
      if (!cardCanvas) return;
      const a = document.createElement('a');
      a.download = 'unwind-' + Date.now() + '.png';
      a.href = cardCanvas.toDataURL('image/png');
      a.click();
    });
    q('#qcShare').addEventListener('click', () => {
      if (!cardCanvas) return;
      cardCanvas.toBlob(async blob => {
        if (!blob) return;
        const file = new File([blob], 'unwind.png', { type: 'image/png' });
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
        } catch (e) { /* share sheet dismissed */ }
      }, 'image/png');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
    return ov;
  }

  function closeCard() {
    const ov = q('#qcOverlay');
    if (ov) ov.classList.remove('open');
  }

  async function openQuoteCard(item) {
    const ov = ensureOverlay();
    cardCanvas = await renderCard(item);
    q('#qcImg').src = cardCanvas.toDataURL('image/png');
    let canShare = false;
    try {
      const probe = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
      canShare = !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) {}
    q('#qcShare').style.display = canShare ? '' : 'none';
    ov.classList.add('open');
  }

  // any element carrying data-qc-text opens a card
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-qc-text]');
    if (!el) return;
    e.preventDefault();
    openQuoteCard({ text: el.dataset.qcText, source: el.dataset.qcSource || '', author: el.dataset.qcAuthor || '' });
  });

  // ─────────────────────────────────────────────────────────
  //  Read Later
  // ─────────────────────────────────────────────────────────
  const later = { view: 'list', tab: 'unread', articles: [], highlights: [], current: null, currentHl: [], busy: false, status: null, pendingUrl: '' };

  // Android "Share → Unwind" arrives as ?shared_url=…&shared_text=…
  // Remember the link, clean the address bar, and open Read Later.
  (function takeShare() {
    const params = new URLSearchParams(location.search);
    if (!params.has('shared_url') && !params.has('shared_text') && !params.has('shared_title')) return;
    const text = [params.get('shared_url'), params.get('shared_text'), params.get('shared_title')].filter(Boolean).join(' ');
    const m = text.match(/https?:\/\/[^\s<>"']+/i);
    try { history.replaceState(null, '', location.pathname + (m ? '#later' : '')); } catch (e) {}
    if (m) later.pendingUrl = m[0];
  })();

  function laterStatus(text, kind) {
    later.status = text ? { text, kind: kind || '' } : null;
    const el = q('#laterStatus');
    if (el) { el.textContent = text || ''; el.className = 'x-status ' + (kind || ''); }
  }

  async function renderLater() {
    const body = q('#laterBody');
    if (!body) return;
    if (!isPrivate || !storedPassword) {
      q('#laterSubtitle').textContent = later.pendingUrl ? '有一個分享進來的網址' : '稍後閱讀';
      body.innerHTML = lockedHtml(later.pendingUrl ? '解鎖後會自動存下分享的網址。存下來的文章和劃線' : '存下來的文章和劃線');
      return;
    }
    if (later.view === 'reader' && later.current) { renderReader(); return; }

    body.innerHTML = '<p class="x-note">載入中…</p>';
    try {
      const [arts, hls] = await Promise.all([rpc('get_articles'), rpc('get_article_highlights')]);
      later.articles = arts || [];
      later.highlights = hls || [];
    } catch (err) {
      body.innerHTML = err instanceof NeedsMigration ? migrationHtml()
        : `<div class="x-panel"><h3>讀取失敗</h3><p>${esc(err.message)}</p></div>`;
      return;
    }
    drawLaterList();
  }

  function drawLaterList() {
    const body = q('#laterBody');
    const unread = later.articles.filter(a => !a.archived);
    const archived = later.articles.filter(a => a.archived);
    q('#laterSubtitle').textContent = `${unread.length} 篇待讀 · ${later.highlights.length} 條劃線`;

    const list = later.tab === 'archived' ? archived : unread;
    let inner;
    if (later.tab === 'highlights') {
      inner = later.highlights.length ? later.highlights.map(h => `
        <div class="hl-row">
          <div class="hl-text">${esc(h.text)}</div>
          <div class="hl-src">${esc(h.article_title || h.article_site || '')} · ${esc(fmtDay(h.created_at))}</div>
          <div class="hl-actions">
            <button class="x-btn small" data-later-open="${h.article_id}">打開文章</button>
            <button class="x-btn small" data-qc-text="${esc(h.text)}" data-qc-source="${esc(h.article_title || '')}" data-qc-author="${esc(h.article_site || '')}">圖卡</button>
            <button class="x-btn small" data-hl-copy="${h.id}">複製引用</button>
            <button class="x-btn small danger" data-hl-del="${h.id}">刪除</button>
          </div>
        </div>`).join('')
        : '<p class="x-note" style="padding:28px 0">還沒有劃線。打開一篇文章，選取文字就能劃線。</p>';
    } else {
      inner = list.length ? list.map(a => `
        <button class="x-item ${a.read_at ? 'read' : ''}" data-later-open="${a.id}">
          <div class="x-item-title">${a.read_at ? '' : '<span class="x-dot"></span>'}${esc(a.title || a.url)}</div>
          ${a.excerpt ? `<div class="x-item-excerpt">${esc(a.excerpt)}</div>` : ''}
          <div class="x-item-meta">
            <span>${esc(a.site || hostOf(a.url))}</span>
            <span>${esc(fmtDay(a.saved_at))}</span>
            ${Number(a.highlight_count) ? `<span>${a.highlight_count} 條劃線</span>` : ''}
          </div>
        </button>`).join('')
        : `<p class="x-note" style="padding:28px 0">${later.tab === 'archived' ? '沒有封存的文章。' : '還沒有文章。貼上網址存第一篇。'}</p>`;
    }

    if (later.pendingUrl && !later.busy) {
      const shared = later.pendingUrl;
      later.pendingUrl = '';
      setTimeout(() => saveArticle(shared), 0);
    }

    body.innerHTML = `
      <div class="x-row">
        <input class="x-input" id="laterUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="off" placeholder="貼上文章網址">
        <button class="x-btn primary" id="laterSave">儲存</button>
      </div>
      <div class="x-status ${later.status ? later.status.kind : ''}" id="laterStatus">${later.status ? esc(later.status.text) : ''}</div>
      <div class="x-tabs">
        <button class="review-tab ${later.tab === 'unread' ? 'active' : ''}" data-later-tab="unread">待讀 ${unread.length || ''}</button>
        <button class="review-tab ${later.tab === 'highlights' ? 'active' : ''}" data-later-tab="highlights">劃線 ${later.highlights.length || ''}</button>
        <button class="review-tab ${later.tab === 'archived' ? 'active' : ''}" data-later-tab="archived">封存 ${archived.length || ''}</button>
      </div>
      <div>${inner}</div>`;
  }

  async function saveArticle(raw) {
    let url = (raw || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch (e) { laterStatus('這不像網址。', 'err'); return; }
    if (later.busy) return;
    later.busy = true;
    const btn = q('#laterSave');
    if (btn) btn.disabled = true;
    laterStatus('抓取文章中…');
    try {
      const res = await rpc('fetch_url', { p_url: url });
      if (!res || !res.content) throw new Error('對方沒有回傳內容');
      if (res.status >= 400) throw new Error('對方回應 ' + res.status + '，可能需要登入或擋了自動抓取');
      await Promise.all([loadScript(READABILITY_SRC), loadScript(PURIFY_SRC)]);

      const doc = new DOMParser().parseFromString(res.content, 'text/html');
      qa('base', doc).forEach(b => b.remove());
      const base = doc.createElement('base');
      base.href = url;
      doc.head.insertBefore(base, doc.head.firstChild);

      const art = new window.Readability(doc).parse();
      if (!art || !art.content || (art.textContent || '').trim().length < 80) {
        throw new Error('抓不到正文。這個頁面可能要登入，或內容是用程式動態載入的');
      }
      const content = sanitize(art.content);
      await rpc('add_article', {
        p_url: url,
        p_title: (art.title || url).trim().slice(0, 300),
        p_site: (art.siteName || hostOf(url)).slice(0, 120),
        p_author: (art.byline || '').trim().slice(0, 120),
        p_excerpt: (art.excerpt || art.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 280),
        p_content: content
      });
      later.tab = 'unread';
      laterStatus('已儲存：' + (art.title || url), 'ok');
      await renderLater();
    } catch (err) {
      if (err instanceof NeedsMigration) { q('#laterBody').innerHTML = migrationHtml(); }
      else laterStatus('存不了：' + err.message, 'err');
    } finally {
      later.busy = false;
      const b = q('#laterSave');
      if (b) b.disabled = false;
    }
  }

  async function openArticle(id) {
    const body = q('#laterBody');
    body.innerHTML = '<p class="x-note">載入中…</p>';
    try {
      await loadScript(PURIFY_SRC);
      const art = await rpc('get_article', { p_id: id });
      if (!art || !art.id) throw new Error('找不到這篇文章');
      later.current = art;
      later.currentHl = later.highlights.filter(h => String(h.article_id) === String(id));
      later.view = 'reader';
      renderReader();
      window.scrollTo({ top: 0 });
      if (!art.read_at) {
        rpc('update_article', { p_id: id, p_read: true, p_archived: null }).catch(() => {});
        art.read_at = new Date().toISOString();
      }
    } catch (err) {
      body.innerHTML = `<div class="x-panel"><h3>打不開</h3><p>${esc(err.message)}</p>
        <p style="margin-top:14px"><button class="x-btn" data-later-back>返回列表</button></p></div>`;
    }
  }

  function renderReader() {
    const a = later.current, body = q('#laterBody');
    const isMail = /^newsletter:/.test(a.url);
    q('#laterSubtitle').textContent = a.site || hostOf(a.url) || '稍後閱讀';
    body.innerHTML = `
      <button class="reader-back" data-later-back>← 返回列表</button>
      <h1 class="reader-title">${esc(a.title || a.url)}</h1>
      <div class="reader-meta">
        ${a.author ? `<span>${esc(a.author)}</span>` : ''}
        <span>${esc(fmtDay(a.saved_at))}</span>
        ${isMail ? '' : `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">原文</a>`}
      </div>
      <div class="reader-actions">
        <button class="x-btn small" data-later-archive="${a.archived ? '0' : '1'}">${a.archived ? '移回待讀' : '封存'}</button>
        <button class="x-btn small danger" data-later-del>刪除</button>
      </div>
      <div class="reader-content" id="readerContent">${sanitize(a.content)}</div>
      <div class="reader-hl-section" id="readerHl"></div>`;
    drawReaderHighlights();
  }

  function drawReaderHighlights() {
    const a = later.current, el = q('#readerHl');
    if (!el) return;
    el.innerHTML = `<h3>劃線 · ${later.currentHl.length}</h3>` + (later.currentHl.length
      ? later.currentHl.map(h => `
        <div class="hl-row">
          <div class="hl-text">${esc(h.text)}</div>
          <div class="hl-actions">
            <button class="x-btn small" data-qc-text="${esc(h.text)}" data-qc-source="${esc(a.title || '')}" data-qc-author="${esc(a.site || '')}">圖卡</button>
            <button class="x-btn small" data-hl-copy="${h.id}">複製引用</button>
            <button class="x-btn small danger" data-hl-del="${h.id}">刪除</button>
          </div>
        </div>`).join('')
      : '<p class="x-note" style="padding:14px 0">選取文章裡的文字，下方會出現「劃線」。</p>');
    markHighlights();
  }

  // paint saved highlights back onto the article
  function markHighlights() {
    const root = q('#readerContent');
    if (!root) return;
    qa('mark.reader-mark', root).forEach(m => {
      const p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
    const pieces = [];
    later.currentHl.forEach(h => {
      h.text.split(/\n+/).map(s => s.trim()).filter(s => s.length >= 6).forEach(s => pieces.push(s));
    });
    pieces.forEach(piece => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentNode.closest && node.parentNode.closest('mark.reader-mark')) continue;
        const at = node.nodeValue.indexOf(piece);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + piece.length);
        const mark = document.createElement('mark');
        mark.className = 'reader-mark';
        try { range.surroundContents(mark); } catch (e) {}
        break;
      }
    });
  }

  // selection bar
  let pendingSel = '';
  function ensureSelBar() {
    let bar = q('#selBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'selBar';
    bar.className = 'sel-bar';
    bar.innerHTML = '<span id="selPreview"></span><button id="selSave">劃線</button>';
    document.body.appendChild(bar);
    const btn = q('#selSave');
    // keep the selection alive while the button is pressed
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    const go = e => { e.preventDefault(); saveSelection(); };
    btn.addEventListener('click', go);
    btn.addEventListener('touchend', go);
    return bar;
  }

  function readSelection() {
    const root = q('#readerContent');
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return '';
    return sel.toString().replace(/[ \t　]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  }

  document.addEventListener('selectionchange', () => {
    if (later.view !== 'reader' || typeof currentPage === 'undefined' || currentPage !== 'later') return;
    const text = readSelection();
    const bar = ensureSelBar();
    if (text.length >= 4) {
      pendingSel = text;
      q('#selPreview').textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
      bar.classList.add('show');
    } else {
      bar.classList.remove('show');
    }
  });

  let savingSel = false;
  async function saveSelection() {
    const text = pendingSel;
    if (!text || !later.current || savingSel) return;
    savingSel = true;
    try {
      const row = await rpc('add_article_highlight', { p_article_id: later.current.id, p_text: text.slice(0, 4000), p_note: '' });
      const item = Object.assign({}, row, {
        article_title: later.current.title, article_url: later.current.url, article_site: later.current.site
      });
      later.currentHl.unshift(item);
      later.highlights.unshift(item);
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      q('#selBar').classList.remove('show');
      pendingSel = '';
      drawReaderHighlights();
    } catch (err) {
      q('#selPreview').textContent = '存不了：' + err.message;
    } finally {
      savingSel = false;
    }
  }

  function hideSelBar() {
    const bar = q('#selBar');
    if (bar) bar.classList.remove('show');
  }

  // ─────────────────────────────────────────────────────────
  //  Newsletter inbox
  // ─────────────────────────────────────────────────────────
  const inbox = { view: 'list', tab: 'new', items: [], config: null, current: null, status: null, syncing: false, syncedOnce: false };

  function inboxStatus(text, kind) {
    inbox.status = text ? { text, kind: kind || '' } : null;
    const el = q('#inboxStatus');
    if (el) { el.textContent = text || ''; el.className = 'x-status ' + (kind || ''); }
  }

  async function renderInbox() {
    const body = q('#inboxBody');
    if (!body) return;
    if (!isPrivate || !storedPassword) {
      q('#inboxSubtitle').textContent = '電子報';
      body.innerHTML = lockedHtml('訂閱的電子報');
      return;
    }
    if (inbox.view === 'item' && inbox.current) { drawMail(); return; }

    body.innerHTML = '<p class="x-note">載入中…</p>';
    try {
      const [settings, items] = await Promise.all([rpc('get_private_settings'), rpc('get_inbox')]);
      const row = (settings || []).find(s => s.key === 'newsletter');
      inbox.config = row ? row.value : null;
      inbox.items = items || [];
    } catch (err) {
      body.innerHTML = err instanceof NeedsMigration ? migrationHtml()
        : `<div class="x-panel"><h3>讀取失敗</h3><p>${esc(err.message)}</p></div>`;
      return;
    }
    if (!inbox.config || !inbox.config.feed) { drawInboxSetup(); return; }
    drawInboxList();
    if (!inbox.syncedOnce) { inbox.syncedOnce = true; syncInbox(); }
  }

  function drawInboxSetup() {
    q('#inboxSubtitle').textContent = '設定專用信箱';
    const c = inbox.config || {};
    q('#inboxBody').innerHTML = `
      <div class="x-panel">
        <h3>建立專門收電子報的信箱</h3>
        <ol>
          <li>打開 <a href="https://kill-the-newsletter.com/" target="_blank" rel="noopener noreferrer">kill-the-newsletter.com</a></li>
          <li>名稱填 Unwind，按 Create Feed</li>
          <li>它會給你兩樣東西：一個信箱地址、一個 Atom feed 網址。兩個都貼到下面</li>
          <li>之後訂閱電子報都填那個信箱地址</li>
        </ol>
        <p>信箱地址和 feed 網址只存在你的私密資料表，不會出現在公開頁面。</p>
      </div>
      <div class="x-row" style="margin-bottom:8px">
        <input class="x-input" id="inboxFeed" type="url" inputmode="url" autocomplete="off" autocapitalize="off" placeholder="Atom feed 網址（https://kill-the-newsletter.com/feeds/….xml）" value="${esc(c.feed || '')}">
      </div>
      <div class="x-row">
        <input class="x-input" id="inboxEmail" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="信箱地址（…@kill-the-newsletter.com）" value="${esc(c.email || '')}">
        <button class="x-btn primary" id="inboxSaveConfig">儲存</button>
        ${c.feed ? '<button class="x-btn" id="inboxCancelConfig">取消</button>' : ''}
      </div>
      <div class="x-status" id="inboxStatus"></div>`;
  }

  function drawInboxList() {
    const fresh = inbox.items.filter(i => !i.archived);
    const archived = inbox.items.filter(i => i.archived);
    const unread = fresh.filter(i => !i.read_at).length;
    q('#inboxSubtitle').textContent = `${unread} 封未讀 · 共 ${inbox.items.length} 封`;
    const list = inbox.tab === 'archived' ? archived : fresh;
    const c = inbox.config || {};
    q('#inboxBody').innerHTML = `
      ${c.email ? `<div class="x-row" style="margin-bottom:6px">
        <span class="x-note">訂閱用信箱</span>
        <code style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--text-secondary);word-break:break-all">${esc(c.email)}</code>
        <button class="x-btn small" id="inboxCopyEmail">複製</button>
      </div>` : ''}
      <div class="x-tabs" style="margin-top:12px">
        <button class="review-tab ${inbox.tab === 'new' ? 'active' : ''}" data-inbox-tab="new">收件匣 ${fresh.length || ''}</button>
        <button class="review-tab ${inbox.tab === 'archived' ? 'active' : ''}" data-inbox-tab="archived">封存 ${archived.length || ''}</button>
        <div style="flex:1"></div>
        <button class="review-tab" id="inboxSync">同步</button>
        <button class="review-tab" id="inboxEditConfig">設定</button>
      </div>
      <div class="x-status ${inbox.status ? inbox.status.kind : ''}" id="inboxStatus">${inbox.status ? esc(inbox.status.text) : ''}</div>
      <div>${list.length ? list.map(i => `
        <button class="x-item ${i.read_at ? 'read' : ''}" data-inbox-open="${i.id}">
          <div class="x-item-title">${i.read_at ? '' : '<span class="x-dot"></span>'}${esc(i.title || '(無標題)')}</div>
          <div class="x-item-meta"><span>${esc(i.sender || '')}</span><span>${esc(fmtDay(i.received_at))}</span></div>
        </button>`).join('')
        : `<p class="x-note" style="padding:28px 0">${inbox.tab === 'archived' ? '沒有封存的信。' : '還沒有信。用上面的信箱訂閱一份電子報，收到後按「同步」。'}</p>`}</div>`;
  }

  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('feed 格式讀不懂');
    const text = (node, name) => {
      const el = Array.from(node.children).find(c => c.localName === name);
      return el ? (el.textContent || '').trim() : '';
    };
    const entries = Array.from(doc.getElementsByTagNameNS('*', 'entry'));
    const rssItems = entries.length ? [] : Array.from(doc.getElementsByTagName('item'));
    const out = [];
    entries.forEach(e => {
      const author = Array.from(e.children).find(c => c.localName === 'author');
      const link = Array.from(e.children).find(c => c.localName === 'link');
      out.push({
        entry_id: text(e, 'id') || (link && link.getAttribute('href')) || '',
        title: text(e, 'title'),
        sender: author ? text(author, 'name') || text(author, 'email') : '',
        content: text(e, 'content') || text(e, 'summary'),
        received_at: text(e, 'published') || text(e, 'updated')
      });
    });
    rssItems.forEach(e => {
      const date = text(e, 'pubDate');
      const d = date ? new Date(date) : null;
      out.push({
        entry_id: text(e, 'guid') || text(e, 'link'),
        title: text(e, 'title'),
        sender: text(e, 'creator') || text(e, 'author'),
        content: text(e, 'encoded') || text(e, 'description'),
        received_at: d && !isNaN(d) ? d.toISOString() : ''
      });
    });
    return out.filter(x => x.entry_id);
  }

  async function syncInbox() {
    if (inbox.syncing || !inbox.config || !inbox.config.feed) return;
    inbox.syncing = true;
    inboxStatus('同步中…');
    try {
      const res = await rpc('fetch_url', { p_url: inbox.config.feed });
      if (!res || res.status >= 400 || !res.content) throw new Error('feed 回應 ' + (res ? res.status : '空白'));
      await loadScript(PURIFY_SRC);
      const known = new Set(inbox.items.map(i => i.entry_id));
      const entries = parseFeed(res.content).filter(e => !known.has(e.entry_id)).map(e => Object.assign(e, {
        title: e.title.slice(0, 300),
        sender: e.sender.slice(0, 160),
        content: sanitize(e.content, { FORBID_ATTR: ['class', 'id', 'srcset', 'onerror', 'onload'] })
      }));
      let added = 0;
      // in small batches so one large issue cannot sink the request
      for (let i = 0; i < entries.length; i += 5) {
        added += (await rpc('add_inbox_items', { p_items: entries.slice(i, i + 5) })) || 0;
      }
      inbox.items = (await rpc('get_inbox')) || [];
      inbox.status = { text: added ? `收到 ${added} 封新的` : '沒有新的信', kind: added ? 'ok' : '' };
      if (inbox.view === 'list' && currentPage === 'inbox') drawInboxList();
    } catch (err) {
      inboxStatus('同步失敗：' + err.message, 'err');
    } finally {
      inbox.syncing = false;
    }
  }

  async function openMail(id) {
    const body = q('#inboxBody');
    body.innerHTML = '<p class="x-note">載入中…</p>';
    try {
      await loadScript(PURIFY_SRC);
      const item = await rpc('get_inbox_item', { p_id: id });
      if (!item || !item.id) throw new Error('找不到這封信');
      inbox.current = item;
      inbox.view = 'item';
      drawMail();
      window.scrollTo({ top: 0 });
      if (!item.read_at) {
        rpc('update_inbox_item', { p_id: id, p_read: true, p_archived: null }).catch(() => {});
        const row = inbox.items.find(i => String(i.id) === String(id));
        if (row) row.read_at = new Date().toISOString();
      }
    } catch (err) {
      body.innerHTML = `<div class="x-panel"><h3>打不開</h3><p>${esc(err.message)}</p>
        <p style="margin-top:14px"><button class="x-btn" data-inbox-back>返回收件匣</button></p></div>`;
    }
  }

  function drawMail() {
    const m = inbox.current;
    q('#inboxSubtitle').textContent = m.sender || '電子報';
    q('#inboxBody').innerHTML = `
      <button class="reader-back" data-inbox-back>← 返回收件匣</button>
      <h1 class="reader-title">${esc(m.title || '(無標題)')}</h1>
      <div class="reader-meta"><span>${esc(m.sender || '')}</span><span>${esc(fmtDay(m.received_at))}</span></div>
      <div class="reader-actions">
        <button class="x-btn small" data-inbox-tolater>存到稍後閱讀（可劃線）</button>
        <button class="x-btn small" data-inbox-archive="${m.archived ? '0' : '1'}">${m.archived ? '移回收件匣' : '封存'}</button>
        <button class="x-btn small danger" data-inbox-del>刪除</button>
      </div>
      <div class="x-status" id="inboxStatus"></div>
      <iframe class="mail-frame" id="mailFrame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="電子報內容"></iframe>`;
    // Sandboxed without allow-scripts: the letter keeps its own styling and cannot run code.
    const html = sanitize(m.content, { FORBID_ATTR: ['class', 'id', 'srcset', 'onerror', 'onload'] });
    const frame = q('#mailFrame');
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
      <style>
        html,body{margin:0;background:#fff;color:#1a1a1a}
        body{padding:22px 18px;font:16px/1.75 -apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;overflow-wrap:anywhere}
        img{max-width:100%!important;height:auto!important}
        table{max-width:100%!important}
        a{color:#1a5fb4}
        blockquote{margin:0 0 1em;padding-left:14px;border-left:2px solid #ddd;color:#555}
      </style></head><body>${html}</body></html>`;
    const fit = () => {
      try {
        const d = frame.contentDocument;
        if (d && d.body) frame.style.height = Math.max(320, d.documentElement.scrollHeight, d.body.scrollHeight) + 'px';
      } catch (e) {}
    };
    frame.addEventListener('load', () => { fit(); setTimeout(fit, 600); setTimeout(fit, 2500); });
  }

  async function mailToLater() {
    const m = inbox.current;
    if (!m) return;
    inboxStatus('轉存中…');
    try {
      await loadScript(PURIFY_SRC);
      const clean = sanitize(m.content);
      const box = document.createElement('div');
      box.innerHTML = clean;
      await rpc('add_article', {
        p_url: 'newsletter:' + m.entry_id,
        p_title: m.title || '(無標題)',
        p_site: m.sender || '電子報',
        p_author: '',
        p_excerpt: (box.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 280),
        p_content: clean
      });
      inboxStatus('已存到稍後閱讀', 'ok');
    } catch (err) {
      inboxStatus('轉存失敗：' + err.message, 'err');
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Events
  // ─────────────────────────────────────────────────────────
  document.addEventListener('click', async e => {
    const t = e.target;

    const go = t.closest('[data-x-goto]');
    if (go) { window.navigate(go.dataset.xGoto); return; }

    // Read Later
    if (t.closest('#laterSave')) { saveArticle(q('#laterUrl').value); return; }
    const lt = t.closest('[data-later-tab]');
    if (lt) { later.tab = lt.dataset.laterTab; drawLaterList(); return; }
    const lo = t.closest('[data-later-open]');
    if (lo) { openArticle(lo.dataset.laterOpen); return; }
    if (t.closest('[data-later-back]')) {
      later.view = 'list'; later.current = null; hideSelBar(); later.status = null;
      renderLater(); return;
    }
    const la = t.closest('[data-later-archive]');
    if (la && later.current) {
      const to = la.dataset.laterArchive === '1';
      try {
        await rpc('update_article', { p_id: later.current.id, p_read: null, p_archived: to });
        later.view = 'list'; later.current = null; hideSelBar();
        later.status = { text: to ? '已封存' : '已移回待讀', kind: 'ok' };
        renderLater();
      } catch (err) { alert('失敗：' + err.message); }
      return;
    }
    if (t.closest('[data-later-del]') && later.current) {
      if (!confirm('刪除這篇文章和它的劃線？無法復原。')) return;
      try {
        await rpc('delete_article', { p_id: later.current.id });
        later.view = 'list'; later.current = null; hideSelBar();
        later.status = { text: '已刪除', kind: '' };
        renderLater();
      } catch (err) { alert('失敗：' + err.message); }
      return;
    }
    const hc = t.closest('[data-hl-copy]');
    if (hc) {
      const h = later.highlights.find(x => String(x.id) === hc.dataset.hlCopy);
      if (h) copyText('> ' + h.text + '\n— ' + (h.article_title || h.article_site || ''), hc, '複製引用');
      return;
    }
    const hd = t.closest('[data-hl-del]');
    if (hd) {
      if (!confirm('刪除這條劃線？')) return;
      try {
        await rpc('delete_article_highlight', { p_id: Number(hd.dataset.hlDel) });
        later.highlights = later.highlights.filter(x => String(x.id) !== hd.dataset.hlDel);
        later.currentHl = later.currentHl.filter(x => String(x.id) !== hd.dataset.hlDel);
        if (later.view === 'reader') drawReaderHighlights(); else drawLaterList();
      } catch (err) { alert('失敗：' + err.message); }
      return;
    }

    // Inbox
    if (t.closest('#inboxSaveConfig')) {
      const feed = q('#inboxFeed').value.trim(), email = q('#inboxEmail').value.trim();
      if (!/^https:\/\/\S+/i.test(feed)) { inboxStatus('feed 網址要以 https:// 開頭。', 'err'); return; }
      inboxStatus('儲存中…');
      try {
        await rpc('set_private_setting', { p_key: 'newsletter', p_value: { feed, email } });
        inbox.syncedOnce = false; inbox.status = null;
        renderInbox();
      } catch (err) {
        if (err instanceof NeedsMigration) q('#inboxBody').innerHTML = migrationHtml();
        else inboxStatus('存不了：' + err.message, 'err');
      }
      return;
    }
    if (t.closest('#inboxCancelConfig')) { drawInboxList(); return; }
    if (t.closest('#inboxEditConfig')) { drawInboxSetup(); return; }
    if (t.closest('#inboxSync')) { syncInbox(); return; }
    const ce = t.closest('#inboxCopyEmail');
    if (ce) { copyText((inbox.config || {}).email || '', ce, '複製'); return; }
    const it = t.closest('[data-inbox-tab]');
    if (it) { inbox.tab = it.dataset.inboxTab; drawInboxList(); return; }
    const io = t.closest('[data-inbox-open]');
    if (io) { openMail(io.dataset.inboxOpen); return; }
    if (t.closest('[data-inbox-back]')) { inbox.view = 'list'; inbox.current = null; inbox.status = null; drawInboxList(); return; }
    if (t.closest('[data-inbox-tolater]')) { mailToLater(); return; }
    const ia = t.closest('[data-inbox-archive]');
    if (ia && inbox.current) {
      const to = ia.dataset.inboxArchive === '1';
      try {
        await rpc('update_inbox_item', { p_id: inbox.current.id, p_read: null, p_archived: to });
        const row = inbox.items.find(i => String(i.id) === String(inbox.current.id));
        if (row) row.archived = to;
        inbox.view = 'list'; inbox.current = null;
        inbox.status = { text: to ? '已封存' : '已移回收件匣', kind: 'ok' };
        drawInboxList();
      } catch (err) { alert('失敗：' + err.message); }
      return;
    }
    if (t.closest('[data-inbox-del]') && inbox.current) {
      if (!confirm('刪除這封信？無法復原。')) return;
      try {
        await rpc('delete_inbox_item', { p_id: inbox.current.id });
        inbox.items = inbox.items.filter(i => String(i.id) !== String(inbox.current.id));
        inbox.view = 'list'; inbox.current = null;
        inbox.status = { text: '已刪除', kind: '' };
        drawInboxList();
      } catch (err) { alert('失敗：' + err.message); }
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target && e.target.id === 'laterUrl') { e.preventDefault(); saveArticle(e.target.value); }
  });

  // ─────────────────────────────────────────────────────────
  //  Hooks into the main script
  // ─────────────────────────────────────────────────────────
  const baseNavigate = window.navigate;
  window.navigate = function (page) {
    hideSelBar();
    baseNavigate(page);
    if (page === 'later') { later.view = 'list'; later.current = null; later.status = null; renderLater(); }
    if (page === 'inbox') { inbox.view = 'list'; inbox.current = null; inbox.status = null; renderInbox(); }
  };

  const baseRenderPrivate = window.renderPrivate;
  window.renderPrivate = function () {
    baseRenderPrivate();
    document.body.classList.toggle('is-private', !!isPrivate);
    if (isPrivate && later.pendingUrl && typeof currentPage !== 'undefined' && currentPage !== 'later') {
      setTimeout(() => window.navigate('later'), 0);
    }
    if (!isPrivate) {
      later.articles = []; later.highlights = []; later.current = null; later.view = 'list';
      inbox.items = []; inbox.config = null; inbox.current = null; inbox.view = 'list'; inbox.syncedOnce = false;
    }
    if (typeof window.renderReview === 'function' && typeof currentPage !== 'undefined' && currentPage === 'review') window.renderReview();
  };

  window.UnwindExtras = { openQuoteCard, renderCard, shortTitle, renderLater, renderInbox, parseFeed, wrap, sanitize, loadScript };
})();
