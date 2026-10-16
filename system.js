/*
 * System — the owner's life systems as a knowledge graph (Private only).
 *
 * Charles is the node in the middle; each system is linked to him, and each
 * item to its system. An item named under two systems becomes one node with
 * two links, so overlaps show as bridges. Nodes are small point spheres like
 * the home page; a force layout spreads them out on first view, then they
 * barely sway. Hover lights a node and its neighbours, drag moves one, tap
 * opens a system in the editor below. The map lives only in the private
 * database (private_settings key "system_map"), read and written with the
 * Private password; nothing about it ships in the site's files.
 *
 * Inserts its own nav button and page; index.html is unchanged.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'system_map';
  const unlocked = () => typeof isPrivate !== 'undefined' && !!isPrivate && typeof storedPassword !== 'undefined' && !!storedPassword;
  const onPage = () => typeof currentPage !== 'undefined' && currentPage === 'system';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);

  const st = {
    page: null, wrap: null, cv: null, panel: null, statusEl: null,
    W: 0, H: 0, map: null, loadState: 'idle', selected: null, hits: [],
    nodes: null, edges: [], byId: null, alpha: 0, alphaTarget: 0, view: { s: 1, x: 0, y: 0 },
    hover: null, press: null, dragging: null,
    raf: 0, running: false, last: 0, saveTimer: 0, ink: [242, 242, 242]
  };

  // ── a tiny point sphere, the home page's signature, for each node ──
  function sphere(n) {
    const pts = [];
    while (pts.length < n) {
      const lat = (Math.random() * 2 - 1) * Math.PI / 2, lon = Math.random() * Math.PI * 2;
      if (Math.random() > 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(lat)), 1.3)) continue;
      pts.push([Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat)]);
    }
    return pts;
  }
  const CENTER_PTS = sphere(260), SAT_PTS = sphere(120);

  function drawSphere(ctx, pts, cx, cy, R, t, alpha) {
    const rot = reduce ? 0.5 : t * 0.6, c = Math.cos(rot), s = Math.sin(rot);
    const ink = st.ink;
    for (const p of pts) {
      const x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c;
      const depth = (z + 1) / 2;
      const a = (0.25 + 0.75 * depth) * alpha;
      if (a < 0.02) continue;
      ctx.fillStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + a.toFixed(3) + ')';
      const sz = 0.7 + 0.8 * depth;
      ctx.fillRect(cx + x * R, cy + p[1] * R, sz, sz);
    }
  }

  // ── the graph: Charles, the systems around him, their items ──
  // An item with the same name under two systems is one node with two links,
  // so what the systems share shows as a bridge between them.
  const norm = s => String(s || '').trim().toLowerCase();
  const SANS = 'Inter, "PingFang TC", "Noto Sans TC", sans-serif';
  const FONTS = {
    center: k => 'italic 400 ' + Math.round(24 * k) + 'px "Instrument Serif", Georgia, serif',
    system: k => '500 ' + (13 * k).toFixed(1) + 'px ' + SANS,
    item: k => '400 ' + (11.5 * k).toFixed(1) + 'px ' + SANS
  };

  function rebuild() {
    const old = new Map((st.nodes || []).map(n => [n.id, n]));
    const nodes = [], edges = [], byId = new Map();
    const add = (id, kind, label, near) => {
      let n = byId.get(id);
      if (n) return n;
      const was = old.get(id);
      n = was || { id, x: (near ? near.x : 0) + (Math.random() - 0.5) * 12, y: (near ? near.y : 0) + (Math.random() - 0.5) * 12, vx: 0, vy: 0, ph: Math.random() * 6.28 };
      n.kind = kind; n.label = label; n.sys = [];
      n.r = kind === 'center' ? 18 : kind === 'system' ? 9 : 1.6;
      n.charge = kind === 'center' ? 4 : kind === 'system' ? 2.2 : 0.8;
      // the box the node and its label take, for collisions
      const mctx = st.cv.getContext('2d');
      mctx.font = FONTS[kind](1);
      n.bw = Math.max(n.r * 2, mctx.measureText(label).width) + 14;
      n.bh = n.r * 2 + 5 + (kind === 'center' ? 24 : 15) + 6;
      nodes.push(n); byId.set(id, n);
      return n;
    };
    const c = add('c', 'center', st.map.center);
    c.x = 0; c.y = 0;
    const systems = st.map.systems;
    systems.forEach((sys, i) => {
      const a = i / Math.max(1, systems.length) * Math.PI * 2 - Math.PI / 2;
      const sn = add('s:' + sys.id, 'system', sys.name, { x: Math.cos(a) * 24, y: Math.sin(a) * 24 });
      sn.sys = [sys.id];
      edges.push({ a: c, b: sn, len: 150, k: 0.7 });
    });
    systems.forEach(sys => {
      const sn = byId.get('s:' + sys.id);
      sys.items.forEach(it => {
        const key = norm(it.name); if (!key) return;
        const n = add('i:' + key, 'item', it.name, sn);
        if (!n.sys.includes(sys.id)) { n.sys.push(sys.id); edges.push({ a: sn, b: n, len: 64, k: 0.6 }); }
      });
    });
    st.map.links.forEach(([x, y]) => {
      const a = byId.get('s:' + x), b = byId.get('s:' + y);
      if (a && b) edges.push({ a, b, len: 170, k: 0.08, cross: true });
    });
    nodes.forEach(n => { n.nb = new Set([n]); });
    edges.forEach(e => { e.a.nb.add(e.b); e.b.nb.add(e.a); });
    st.nodes = nodes; st.edges = edges; st.byId = byId;
    st.alpha = Math.max(st.alpha || 0, old.size ? 0.4 : 1);
  }

  // a small force layout, in the manner of d3-force
  function tick() {
    const N = st.nodes, a = st.alpha;
    for (let i = 0; i < N.length; i++) {
      const p = N[i];
      for (let j = i + 1; j < N.length; j++) {
        const q = N[j];
        let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        const f = 300 * a * p.charge * q.charge / d2 / 3;
        p.vx -= dx * f / p.charge; p.vy -= dy * f / p.charge;
        q.vx += dx * f / q.charge; q.vy += dy * f / q.charge;
        // keep labels from sitting on one another: their boxes may not overlap
        const ox = (p.bw + q.bw) / 2 - Math.abs(dx), oy = (p.bh + q.bh) / 2 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          const k = 0.3 * Math.max(a, 0.05);
          if (ox / p.bw < oy / p.bh) { const m = Math.sign(dx || 1) * ox * k; p.vx -= m; q.vx += m; }
          else { const m = Math.sign(dy || 1) * oy * k; p.vy -= m; q.vy += m; }
        }
      }
    }
    for (const e of st.edges) {
      const dx = e.b.x + e.b.vx - e.a.x - e.a.vx, dy = e.b.y + e.b.vy - e.a.y - e.a.vy;
      const l = Math.sqrt(dx * dx + dy * dy) || 1, f = (l - e.len) / l * a * e.k;
      const wb = e.a.charge / (e.a.charge + e.b.charge);
      e.b.vx -= dx * f * wb; e.b.vy -= dy * f * wb;
      e.a.vx += dx * f * (1 - wb); e.a.vy += dy * f * (1 - wb);
    }
    for (const n of N) {
      if (n.kind === 'center') { n.x = 0; n.y = 0; n.vx = n.vy = 0; continue; }
      if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
      if (st.squash > 1) n.vy -= n.y * 0.16 * a * (1 - 1 / st.squash);
      n.vx *= 0.6; n.vy *= 0.6;
      n.x += n.vx; n.y += n.vy;
    }
    st.alpha += (st.alphaTarget - st.alpha) * 0.0228;
  }

  // ── view: fit the whole graph in the frame, eased ──
  // on a computer the stage runs edge to edge, out of the reading column
  const WIDE = 900;
  function layout() {
    const docW = document.documentElement.clientWidth;
    st.wide = docW >= WIDE;
    st.wrap.style.width = ''; st.wrap.style.marginLeft = '';
    if (st.wide) {
      st.wrap.style.width = docW + 'px';
      st.wrap.style.marginLeft = -Math.round(st.wrap.parentNode.getBoundingClientRect().left) + 'px';
    }
    const W = Math.round(st.wide ? docW : st.wrap.clientWidth || 600);
    const H = Math.round(st.wide ? Math.max(520, Math.min(900, window.innerHeight - 180)) : Math.max(420, Math.min(620, W * 0.82)));
    // a wide frame flattens the layout so the graph spreads sideways
    st.squash = st.wide ? Math.min(2.4, W / H) : 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    st.W = W; st.H = H;
    st.wrap.style.height = H + 'px';
    st.cv.width = W * dpr; st.cv.height = H * dpr; st.cv.style.width = W + 'px'; st.cv.style.height = H + 'px';
    st.cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function fit(instant) {
    if (!st.nodes || !st.nodes.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of st.nodes) {
      x0 = Math.min(x0, n.x - n.bw / 2); x1 = Math.max(x1, n.x + n.bw / 2);
      y0 = Math.min(y0, n.y - n.r - 6); y1 = Math.max(y1, n.y - n.r + n.bh);
    }
    const pad = st.wide ? 64 : 24;
    const s = Math.min(st.wide ? 2.4 : 1.25, (st.W - pad * 2) / (x1 - x0), (st.H - 24) / (y1 - y0));
    const tx = st.W / 2 - (x0 + x1) / 2 * s, ty = st.H / 2 - (y0 + y1) / 2 * s;
    const v = st.view, k = instant ? 1 : 0.06;
    v.s += (s - v.s) * k; v.x += (tx - v.x) * k; v.y += (ty - v.y) * k;
  }
  const toScreen = n => ({ x: st.view.x + n.x * st.view.s, y: st.view.y + n.y * st.view.s });

  // ── drawing ──
  function frame(now) {
    if (!st.map || !st.nodes) return;
    const t = now / 1000;
    if (st.alpha > 0.002 || st.dragging) tick();
    if (!st.dragging) fit(false);
    const ctx = st.cv.getContext('2d'), ink = st.ink.join(',');
    ctx.clearRect(0, 0, st.W, st.H);

    // what is in focus: the hovered node, else the selected system, with their neighbours
    const focus = st.hover || (st.selected && st.byId.get('s:' + st.selected)) || null;
    const lit = n => !focus || focus.nb.has(n);
    // nodes breathe a little once settled
    const sway = reduce ? 0 : 1.6;
    const P = new Map();
    for (const n of st.nodes) {
      const p = toScreen(n);
      if (n.kind !== 'center' && n.fx == null) { p.x += Math.sin(t * 0.35 + n.ph) * sway; p.y += Math.cos(t * 0.29 + n.ph * 1.3) * sway; }
      P.set(n, p);
    }

    ctx.lineWidth = 1;
    for (const e of st.edges) {
      const on = focus && lit(e.a) && lit(e.b) && (e.a === focus || e.b === focus);
      const a = focus ? (on ? 0.42 : 0.05) : (e.cross ? 0.16 : 0.13);
      const pa = P.get(e.a), pb = P.get(e.b);
      ctx.strokeStyle = 'rgba(' + ink + ',' + a + ')';
      if (e.cross) ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      if (e.cross) ctx.setLineDash([]);
    }

    st.hits = [];
    const vs = Math.max(0.7, Math.min(1.2, st.view.s));
    for (const n of st.nodes) {
      const p = P.get(n), on = lit(n), sel = focus === n;
      const dim = on ? 1 : 0.22;
      const R = n.r * vs * (sel ? 1.25 : 1);
      if (n.kind === 'center') drawSphere(ctx, CENTER_PTS, p.x, p.y, R, t * 0.5, dim);
      else if (n.kind === 'system') drawSphere(ctx, SAT_PTS, p.x, p.y, R, t, (0.85) * dim);
      else {
        // items are single points, a shared one slightly larger
        const sz = (n.sys.length > 1 ? 3.4 : 2.6) * vs;
        ctx.fillStyle = 'rgba(' + ink + ',' + (0.9 * dim).toFixed(3) + ')';
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      st.hits.push({ n, x: p.x, y: p.y, r: Math.max(14, R + 8) });

      // label under the node
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = FONTS[n.kind](vs);
      const la = n.kind === 'center' ? 0.95 : n.kind === 'system' ? 0.9 : focus && on ? 0.85 : 0.55;
      ctx.fillStyle = 'rgba(' + ink + ',' + (la * dim).toFixed(3) + ')';
      const tw = ctx.measureText(n.label).width;
      const lx = Math.max(4 + tw / 2, Math.min(st.W - 4 - tw / 2, p.x));
      ctx.fillText(n.label, lx, p.y + R + 5);
    }
  }

  function loop(now) {
    if (!st.running) return;
    if (!document.hidden && now - st.last > 32) { st.last = now; frame(now); }
    st.raf = requestAnimationFrame(loop);
  }
  function settle() {
    for (let i = 0; i < 400 && st.alpha > 0.002; i++) tick();
    fit(true);
  }
  function start() {
    if (reduce) { if (st.nodes) settle(); frame(performance.now()); return; }
    if (st.running) return;
    st.running = true;
    st.raf = requestAnimationFrame(loop);
  }
  function stop() { st.running = false; cancelAnimationFrame(st.raf); }
  function redraw() { if (!st.running) { if (reduce && st.nodes) settle(); frame(performance.now()); } }

  // ── data ──
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, Object.assign({ pw: storedPassword }, args || {}));
    if (error) {
      const e = new Error(error.message || String(error));
      e.missing = error.code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message || '');
      throw e;
    }
    return data;
  }

  async function load() {
    st.loadState = 'loading'; renderPanel();
    try {
      const rows = (await rpc('get_private_settings')) || [];
      const row = rows.find(r => r.key === KEY);
      st.map = row ? normalise(row.value) : null;
      st.loadState = row ? 'ready' : 'empty';
    } catch (e) {
      st.loadState = e.missing ? 'nodb' : 'error';
      st.error = e.message;
    }
    renderPanel();
    if (st.map) rebuild();
    if (st.map && onPage()) start();
  }

  function normalise(v) {
    const m = typeof v === 'string' ? JSON.parse(v) : (v || {});
    return {
      center: m.center || 'Charles',
      systems: (m.systems || []).map(s => ({ id: s.id || uid(), name: String(s.name || ''), items: (s.items || []).map(it => ({ id: it.id || uid(), name: String(typeof it === 'string' ? it : it.name || '') })) })),
      links: (m.links || []).filter(l => Array.isArray(l) && l.length === 2)
    };
  }

  function save() {
    changed();
    clearTimeout(st.saveTimer);
    status('儲存中…');
    st.saveTimer = setTimeout(async () => {
      try {
        await rpc('set_private_setting', { p_key: KEY, p_value: st.map });
        status('已儲存');
      } catch (e) { status('沒存成功：' + e.message, true); }
    }, 600);
  }
  function status(text, err) {
    if (!st.statusEl) return;
    st.statusEl.textContent = text || '';
    st.statusEl.classList.toggle('err', !!err);
  }

  // ── panel under the map ──
  function renderPanel() {
    const P = st.panel;
    if (!P) return;
    if (!unlocked()) {
      P.innerHTML = '<p class="sys-note">解鎖 Private 才看得到你的系統。</p><button class="x-btn small" data-x-goto="private">前往 Private</button>';
      return;
    }
    if (st.loadState === 'loading' || st.loadState === 'idle') { P.innerHTML = '<p class="sys-note">讀取中</p>'; return; }
    if (st.loadState === 'nodb') {
      P.innerHTML = '<p class="sys-note">資料庫還沒設定。到 Supabase 的 SQL Editor 執行 <code>supabase/migration-v3.sql</code>，再重新整理。</p>';
      return;
    }
    if (st.loadState === 'error') { P.innerHTML = '<p class="sys-note err">讀不到：' + esc(st.error) + '</p>'; return; }
    if (st.loadState === 'empty') {
      P.innerHTML = '<p class="sys-note">還沒有你的系統圖。</p><button class="x-btn small primary" data-sys="init">從空白開始</button>';
      return;
    }
    const sys = st.map.systems.find(s => s.id === st.selected);
    if (!sys) {
      P.innerHTML = `
        <div class="sys-row">
          <label class="sys-label" for="sysCenter">中心</label>
          <input class="sys-input" id="sysCenter" value="${esc(st.map.center)}" maxlength="40">
        </div>
        <ul class="sys-list">${st.map.systems.map(s => `<li><button class="sys-link" data-sys-open="${s.id}">${esc(s.name)}</button><span class="sys-count">${s.items.length}</span></li>`).join('')}</ul>
        <div class="sys-row">
          <input class="sys-input" id="sysNew" placeholder="新增一個系統" maxlength="40">
          <button class="x-btn small" data-sys="add-system">新增</button>
        </div>
        <p class="sys-status" id="sysStatus"></p>`;
    } else {
      const others = st.map.systems.filter(s => s.id !== sys.id);
      const linked = id => st.map.links.some(([a, b]) => (a === sys.id && b === id) || (b === sys.id && a === id));
      P.innerHTML = `
        <button class="reader-back" data-sys="back">← 全部系統</button>
        <div class="sys-row">
          <input class="sys-input sys-title" id="sysName" value="${esc(sys.name)}" maxlength="40" aria-label="系統名稱">
        </div>
        <ul class="sys-list">${sys.items.map(it => `<li>
            <input class="sys-input" data-sys-item="${it.id}" value="${esc(it.name)}" maxlength="60" aria-label="項目">
            <button class="x-btn small danger" data-sys-del-item="${it.id}" aria-label="刪除 ${esc(it.name)}">刪除</button>
          </li>`).join('')}</ul>
        <div class="sys-row">
          <input class="sys-input" id="sysNewItem" placeholder="新增項目" maxlength="60">
          <button class="x-btn small" data-sys="add-item">新增</button>
        </div>
        ${others.length ? `<p class="sys-label">和這些系統有關</p>
        <div class="sys-chips">${others.map(o => `<button class="review-tab ${linked(o.id) ? 'active' : ''}" data-sys-link="${o.id}">${esc(o.name)}</button>`).join('')}</div>` : ''}
        <div class="sys-row sys-danger"><button class="x-btn small danger" data-sys="del-system">刪除這個系統</button></div>
        <p class="sys-status" id="sysStatus"></p>`;
    }
    st.statusEl = P.querySelector('#sysStatus');
  }

  // the map changed in the panel: rebuild the graph, keeping positions
  function changed() { if (st.map) { rebuild(); redraw(); } }

  function select(id) {
    st.selected = id;
    renderPanel();
    redraw();
  }

  // ── events: hover lights a node and its neighbours, drag moves it, tap opens it ──
  function hitAt(e) {
    const r = st.cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 1e9;
    st.hits.forEach(h => { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h.n; } });
    return { n: best, x, y };
  }
  function onDown(e) {
    if (!st.map) return;
    const h = hitAt(e);
    st.press = { n: h.n, x: h.x, y: h.y, moved: false };
    if (h.n && h.n.kind !== 'center') st.cv.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!st.map) return;
    const h = hitAt(e), pr = st.press;
    if (pr && pr.n && pr.n.kind !== 'center') {
      if (!pr.moved && Math.hypot(h.x - pr.x, h.y - pr.y) < 4) return;
      pr.moved = true; st.dragging = pr.n;
      pr.n.fx = (h.x - st.view.x) / st.view.s; pr.n.fy = (h.y - st.view.y) / st.view.s;
      st.alpha = Math.max(st.alpha, 0.3); st.alphaTarget = 0.3;
      st.hover = pr.n;
      if (!st.running) redraw();
      return;
    }
    if (e.pointerType === 'mouse' && st.hover !== h.n) {
      st.hover = h.n;
      st.cv.style.cursor = h.n && h.n.kind !== 'center' ? 'pointer' : 'default';
      if (!st.running) redraw();
    }
  }
  function onUp(e) {
    const pr = st.press; st.press = null;
    if (st.dragging) {
      st.dragging.fx = st.dragging.fy = null; st.dragging = null; st.alphaTarget = 0;
      if (e.pointerType !== 'mouse') st.hover = null;
      return;
    }
    if (!pr) return;
    const n = pr.n;
    if (!n || n.kind === 'center') { if (st.selected) select(null); return; }
    const id = n.kind === 'system' ? n.sys[0] : (n.sys.includes(st.selected) ? st.selected : n.sys[0]);
    select(id === st.selected && n.kind === 'system' ? null : id);
  }

  document.addEventListener('click', e => {
    const t = e.target;
    if (!st.panel || !st.panel.contains(t)) return;
    const act = t.closest('[data-sys]');
    if (act) {
      const a = act.dataset.sys;
      if (a === 'init') { st.map = { center: 'Charles', systems: [], links: [] }; st.loadState = 'ready'; renderPanel(); save(); start(); }
      if (a === 'back') select(null);
      if (a === 'add-system') {
        const inp = st.panel.querySelector('#sysNew'); const name = inp.value.trim(); if (!name) return;
        const s = { id: uid(), name, items: [] }; st.map.systems.push(s); save(); select(s.id);
      }
      if (a === 'add-item') {
        const sys = st.map.systems.find(s => s.id === st.selected); const inp = st.panel.querySelector('#sysNewItem');
        const name = inp.value.trim(); if (!sys || !name) return;
        sys.items.push({ id: uid(), name }); save(); renderPanel(); st.panel.querySelector('#sysNewItem').focus();
      }
      if (a === 'del-system') {
        const sys = st.map.systems.find(s => s.id === st.selected); if (!sys) return;
        if (!confirm('刪除「' + sys.name + '」和它底下的項目？')) return;
        st.map.systems = st.map.systems.filter(s => s.id !== sys.id);
        st.map.links = st.map.links.filter(([x, y]) => x !== sys.id && y !== sys.id);
        save(); select(null);
      }
      return;
    }
    const open = t.closest('[data-sys-open]'); if (open) { select(open.dataset.sysOpen); return; }
    const del = t.closest('[data-sys-del-item]');
    if (del) {
      const sys = st.map.systems.find(s => s.id === st.selected); if (!sys) return;
      sys.items = sys.items.filter(it => it.id !== del.dataset.sysDelItem); save(); renderPanel(); return;
    }
    const link = t.closest('[data-sys-link]');
    if (link) {
      const a = st.selected, b = link.dataset.sysLink;
      const i = st.map.links.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (i >= 0) st.map.links.splice(i, 1); else st.map.links.push([a, b]);
      save(); renderPanel();
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (!st.panel || !st.panel.contains(t) || !st.map) return;
    if (t.id === 'sysCenter') { st.map.center = t.value.trim() || 'Charles'; save(); }
    if (t.id === 'sysName') { const s = st.map.systems.find(x => x.id === st.selected); if (s) { s.name = t.value.trim() || s.name; save(); } }
    if (t.dataset.sysItem) {
      const s = st.map.systems.find(x => x.id === st.selected); const it = s && s.items.find(x => x.id === t.dataset.sysItem);
      if (it) { it.name = t.value.trim() || it.name; save(); }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || !st.panel || !st.panel.contains(e.target)) return;
    if (e.target.id === 'sysNew') { e.preventDefault(); st.panel.querySelector('[data-sys="add-system"]').click(); }
    if (e.target.id === 'sysNewItem') { e.preventDefault(); st.panel.querySelector('[data-sys="add-item"]').click(); }
  });

  // ── build and wire into the site ──
  function build() {
    const container = document.querySelector('.container');
    if (!container || document.getElementById('page-system')) return;
    // nav entry, beside the other private pages
    const nav = document.querySelector('nav');
    const after = nav && nav.querySelector('[data-page="inbox"]');
    if (nav) {
      const b = document.createElement('button');
      b.dataset.page = 'system'; b.className = 'private-only'; b.textContent = 'System';
      if (after && after.nextSibling) nav.insertBefore(b, after.nextSibling); else nav.appendChild(b);
    }
    const page = document.createElement('div');
    page.className = 'page'; page.id = 'page-system';
    page.innerHTML = `
      <div class="page-header"><div>
        <h1 class="page-title">System</h1>
        <p class="page-subtitle">你、你的系統，和它們之間的連結</p>
      </div></div>
      <div class="sys-stage" id="sysStage">
        <canvas role="img" aria-label="關係圖：中間是你，連到你的各個系統，再連到每個系統的項目"></canvas>
      </div>
      <div class="sys-panel" id="sysPanel"></div>`;
    const inbox = document.getElementById('page-inbox');
    container.insertBefore(page, inbox ? inbox.nextSibling : null);
    st.page = page; st.wrap = page.querySelector('#sysStage');
    st.cv = page.querySelector('canvas');
    st.panel = page.querySelector('#sysPanel');
    st.cv.addEventListener('pointerdown', onDown);
    st.cv.addEventListener('pointermove', onMove);
    st.cv.addEventListener('pointerup', onUp);
    st.cv.addEventListener('pointercancel', onUp);
    st.cv.addEventListener('pointerleave', () => { if (!st.dragging && st.hover) { st.hover = null; redraw(); } });

    const privRow = document.querySelector('#privateUnlocked .x-row');
    if (privRow && !privRow.querySelector('[data-x-goto="system"]')) {
      const b = document.createElement('button');
      b.className = 'x-btn'; b.dataset.xGoto = 'system'; b.textContent = '我的系統';
      privRow.appendChild(b);
    }
  }

  function show() {
    if (!st.page) return;
    st.ink = window.UnwindPoints ? UnwindPoints.readInk() : st.ink;
    layout();
    if (!st.view.x) { st.view.x = st.W / 2; st.view.y = st.H / 2; }
    if (unlocked() && st.loadState === 'idle') load();
    else renderPanel();
    start();
  }

  function init() {
    build();
    const baseNavigate = window.navigate;
    window.navigate = function (page) { baseNavigate(page); if (page === 'system') show(); else stop(); };
    const baseRenderPrivate = window.renderPrivate;
    window.renderPrivate = function () {
      baseRenderPrivate();
      if (!unlocked()) { st.map = null; st.nodes = null; st.loadState = 'idle'; st.selected = null; st.hover = null; }
      if (onPage()) show();
    };
    window.addEventListener('resize', () => { if (onPage()) { layout(); if (st.nodes) st.alpha = Math.max(st.alpha, 0.3); fit(true); redraw(); } });
    new MutationObserver(() => { st.ink = window.UnwindPoints ? UnwindPoints.readInk() : st.ink; if (onPage()) redraw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (onPage()) show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
