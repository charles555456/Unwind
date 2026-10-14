/*
 * System — the owner's life systems as a small solar system (Private only).
 *
 * Charles sits at the centre as Saturn (Voyager 2, NASA/JPL, public domain),
 * drawn as point dust. Each system is a satellite on an orbit in the plane
 * of the rings; tapping one opens its items as moons around it and an editor
 * below. The map lives only in the private database (private_settings key
 * "system_map"), read and written with the Private password; nothing about
 * it ships in the site's files.
 *
 * Inserts its own nav button and page; index.html is unchanged.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'system_map';
  const SATURN = 'art/saturn.bin';
  const SATURN_ASPECT = 640 / 447;          // height / width of the point file
  const RING_TILT = 56 * Math.PI / 180;     // the rings run from upper left to lower right
  const unlocked = () => typeof isPrivate !== 'undefined' && !!isPrivate && typeof storedPassword !== 'undefined' && !!storedPassword;
  const onPage = () => typeof currentPage !== 'undefined' && currentPage === 'system';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);

  const st = {
    page: null, wrap: null, back: null, front: null, saturnCv: null, panel: null, statusEl: null,
    W: 0, H: 0, scene: null, map: null, loadState: 'idle', selected: null, hits: [],
    raf: 0, running: false, last: 0, t0: 0, pausedAt: 0, drift: 0, saveTimer: 0, ink: [242, 242, 242]
  };

  // ── a tiny point sphere, the home page's signature, for each satellite ──
  function sphere(n) {
    const pts = [];
    while (pts.length < n) {
      const lat = (Math.random() * 2 - 1) * Math.PI / 2, lon = Math.random() * Math.PI * 2;
      if (Math.random() > 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(lat)), 1.3)) continue;
      pts.push([Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat)]);
    }
    return pts;
  }
  const SAT_PTS = sphere(70), MOON_PTS = sphere(28);

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

  // ── layout ──
  function layout() {
    const W = Math.round(st.wrap.clientWidth || 600);
    const H = Math.round(Math.max(420, Math.min(640, W * 1.02)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    st.W = W; st.H = H;
    st.wrap.style.height = H + 'px';
    [st.back, st.front].forEach(cv => {
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    const sh = Math.round(H * 0.58), sw = Math.round(sh / SATURN_ASPECT);
    st.saturnBox = { x: Math.round((W - sw) / 2), y: Math.round((H - sh) / 2), w: sw, h: sh };
    // the orbit: an ellipse in the ring plane, as long as the frame allows
    const reach = Math.min((W / 2 - 70) / Math.cos(RING_TILT), (H / 2 - 40) / Math.sin(RING_TILT));
    st.orbit = { cx: W / 2, cy: H / 2, a: Math.max(140, reach), b: Math.max(90, reach * 0.52) };
    // even spacing along the path, not by angle, so satellites do not bunch at the ends
    const N = 720, cum = [0];
    let prev = orbitPoint(0);
    for (let k = 1; k <= N; k++) { const q = orbitPoint(k / N * Math.PI * 2); cum.push(cum[k - 1] + Math.hypot(q.x - prev.x, q.y - prev.y)); prev = q; }
    st.arc = { N, cum, total: cum[N] };
    if (st.scene) st.scene.resize(W, H);
  }

  // position at fraction u (0..1) of the way round, measured along the path
  function orbitAt(u) {
    const A = st.arc; u = ((u % 1) + 1) % 1;
    const target = u * A.total;
    let lo = 0, hi = A.N;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (A.cum[mid] < target) lo = mid + 1; else hi = mid; }
    return orbitPoint(lo / A.N * Math.PI * 2);
  }

  function orbitPoint(theta) {
    const o = st.orbit;
    const lx = Math.cos(theta) * o.a, ly = Math.sin(theta) * o.b;
    const c = Math.cos(RING_TILT), s = Math.sin(RING_TILT);
    return { x: o.cx + lx * c - ly * s, y: o.cy + lx * s + ly * c, front: Math.sin(theta) > 0, depth: (Math.sin(theta) + 1) / 2 };
  }

  // ── drawing ──
  function frame(now) {
    if (!st.map) return;
    const t = now / 1000;
    if (!reduce && !st.selected) st.drift += (now - (st.lastNow || now)) / 1000 * (Math.PI * 2 / 300);   // one lap in five minutes
    st.lastNow = now;
    const bctx = st.back.getContext('2d'), fctx = st.front.getContext('2d');
    bctx.clearRect(0, 0, st.W, st.H); fctx.clearRect(0, 0, st.W, st.H);

    // the orbit itself, faint dots, back half behind Saturn
    for (let k = 0; k < 180; k++) {
      const p = orbitPoint(k / 180 * Math.PI * 2);
      const ctx = p.front ? fctx : bctx;
      ctx.fillStyle = 'rgba(' + st.ink.join(',') + ',' + (0.06 + 0.1 * p.depth).toFixed(3) + ')';
      ctx.fillRect(p.x, p.y, 1, 1);
    }

    const systems = st.map.systems || [];
    const n = Math.max(1, systems.length);
    const pos = {};
    st.hits = [];
    systems.forEach((sys, i) => {
      pos[sys.id] = orbitAt(st.drift / (Math.PI * 2) + i / n + 0.08);
    });

    // links between systems
    (st.map.links || []).forEach(([a, b]) => {
      const pa = pos[a], pb = pos[b];
      if (!pa || !pb) return;
      const lit = st.selected && (st.selected === a || st.selected === b);
      const ctx = pa.front && pb.front ? fctx : bctx;
      ctx.strokeStyle = 'rgba(' + st.ink.join(',') + ',' + (lit ? 0.35 : 0.1) + ')';
      ctx.setLineDash([2, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(st.orbit.cx + (pa.x + pb.x - 2 * st.orbit.cx) * 0.15, st.orbit.cy + (pa.y + pb.y - 2 * st.orbit.cy) * 0.15, pb.x, pb.y);
      ctx.stroke(); ctx.setLineDash([]);
    });

    const font = '400 13px Inter, "PingFang TC", "Noto Sans TC", sans-serif';
    systems.forEach(sys => {
      const p = pos[sys.id];
      const sel = st.selected === sys.id, dim = st.selected && !sel;
      const ctx = p.front || sel ? fctx : bctx;
      const alpha = (0.45 + 0.55 * p.depth) * (dim ? 0.35 : 1);
      const R = (sel ? 10 : 7) * (0.8 + 0.3 * p.depth);
      drawSphere(ctx, SAT_PTS, p.x, p.y, R, t, alpha);
      // outward = away from Saturn; the label sits outward, or inward once the moons take that side
      const out = Math.atan2(p.y - st.orbit.cy, p.x - st.orbit.cx);
      const labAng = sel ? (st.fanDir != null ? st.fanDir : out) + Math.PI : out;
      const lx = p.x + Math.cos(labAng) * (R + 8), ly = p.y + Math.sin(labAng) * (R + 8);
      ctx.font = font; ctx.textBaseline = 'middle';
      ctx.textAlign = Math.abs(Math.cos(labAng)) < 0.35 ? 'center' : (Math.cos(labAng) < 0 ? 'right' : 'left');
      ctx.fillStyle = 'rgba(' + st.ink.join(',') + ',' + Math.min(1, alpha + 0.15).toFixed(3) + ')';
      // keep the whole label inside the frame
      const tw = ctx.measureText(sys.name).width;
      const x0 = ctx.textAlign === 'right' ? lx - tw : ctx.textAlign === 'center' ? lx - tw / 2 : lx;
      const shift = Math.max(0, 4 - x0) - Math.max(0, x0 + tw - (st.W - 4));
      ctx.fillText(sys.name, lx + shift, ly + (Math.abs(Math.cos(labAng)) < 0.35 ? Math.sign(Math.sin(labAng)) * 6 : 0));
      st.hits.push({ id: sys.id, x: p.x, y: p.y, r: 26 });

      if (sel) {
        const items = sys.items || [];
        const m = items.length, step = Math.min(0.62, 2.6 / Math.max(1, m)), rr = 60;
        fctx.font = '400 12px Inter, "PingFang TC", "Noto Sans TC", sans-serif';
        const widths = items.map(it => fctx.measureText(it.name).width);
        // fan the moons where they and their labels fit: try outward first, then turn
        const sb = st.saturnBox;
        const cost = centre => {
          let c = 0;
          items.forEach((it, j) => {
            const ang = centre + (j - (m - 1) / 2) * step;
            const mx = p.x + Math.cos(ang) * rr, my = p.y + Math.sin(ang) * rr;
            const left = Math.cos(ang) < -0.2, w = widths[j] + 12;
            const x0 = left ? mx - w : mx, x1 = left ? mx : mx + w;
            c += Math.max(0, -x0) + Math.max(0, x1 - st.W) + Math.max(0, 12 - my) * 3 + Math.max(0, my - (st.H - 12)) * 3;
            if (mx > sb.x + sb.w * 0.2 && mx < sb.x + sb.w * 0.8 && my > sb.y + sb.h * 0.15 && my < sb.y + sb.h * 0.85) c += 40;
          });
          return c;
        };
        let centre = out, best = cost(out);
        for (const d of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
          const c = cost(out + d);
          if (c < best - 0.5) { best = c; centre = out + d; }
        }
        st.fanDir = centre;                // next frame's label sits opposite the fan
        items.forEach((it, j) => {
          const ang = centre + (j - (m - 1) / 2) * step;
          const mx = p.x + Math.cos(ang) * rr, my = p.y + Math.sin(ang) * rr;
          fctx.strokeStyle = 'rgba(' + st.ink.join(',') + ',0.14)'; fctx.lineWidth = 1;
          fctx.beginPath(); fctx.moveTo(p.x, p.y); fctx.lineTo(mx, my); fctx.stroke();
          drawSphere(fctx, MOON_PTS, mx, my, 3.5, t + j, 0.9);
          const l2 = Math.cos(ang) < -0.2;
          fctx.font = '400 12px Inter, "PingFang TC", "Noto Sans TC", sans-serif';
          fctx.textAlign = l2 ? 'right' : 'left'; fctx.textBaseline = 'middle';
          fctx.fillStyle = 'rgba(' + st.ink.join(',') + ',0.82)';
          const w2 = widths[j], tx0 = l2 ? mx - 8 - w2 : mx + 8;
          const sh2 = Math.max(0, 4 - tx0) - Math.max(0, tx0 + w2 - (st.W - 4));
          fctx.fillText(it.name, mx + (l2 ? -8 : 8) + sh2, my);
        });
      }
    });
  }

  function loop(now) {
    if (!st.running) return;
    if (!document.hidden && now - st.last > 32) { st.last = now; frame(now); }
    st.raf = requestAnimationFrame(loop);
  }
  function start() {
    if (st.scene) st.scene.start();
    if (reduce) { frame(performance.now()); return; }
    if (st.running) return;
    st.running = true; st.lastNow = 0;
    st.raf = requestAnimationFrame(loop);
  }
  function stop() { st.running = false; cancelAnimationFrame(st.raf); if (st.scene) st.scene.stop(); }

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
    centerName();
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

  function centerName() {
    const el = document.getElementById('sysCenterName');
    if (el) el.textContent = (st.map && st.map.center) || 'Charles';
  }

  function select(id) {
    st.selected = id;
    renderPanel();
    if (reduce || !st.running) frame(performance.now());
  }

  // ── events ──
  function onCanvasClick(e) {
    if (!st.map) return;
    const r = st.front.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 1e9;
    st.hits.forEach(h => { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h.id; } });
    if (best) select(best === st.selected ? null : best);
    else if (st.selected) select(null);
    else if (st.scene) st.scene.hold();            // tapping empty space: the dust stirs
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
    if (t.id === 'sysCenter') { st.map.center = t.value.trim() || 'Charles'; save(); centerName(); }
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
        <p class="page-subtitle">你和繞著你轉的系統</p>
      </div></div>
      <div class="sys-stage" id="sysStage">
        <canvas class="sys-back" aria-hidden="true"></canvas>
        <canvas class="sys-saturn" role="img" aria-label="中間是土星，代表你；周圍的衛星是你的各個系統"></canvas>
        <canvas class="sys-front" aria-hidden="true"></canvas>
      </div>
      <p class="sys-center" id="sysCenterName">Charles</p>
      <div class="sys-panel" id="sysPanel"></div>`;
    const inbox = document.getElementById('page-inbox');
    container.insertBefore(page, inbox ? inbox.nextSibling : null);
    st.page = page; st.wrap = page.querySelector('#sysStage');
    st.back = page.querySelector('.sys-back'); st.front = page.querySelector('.sys-front'); st.saturnCv = page.querySelector('.sys-saturn');
    st.panel = page.querySelector('#sysPanel');
    st.front.addEventListener('click', onCanvasClick);

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
    if (!st.scene && window.UnwindPoints) {
      UnwindPoints.load(SATURN).then(data => {
        st.scene = UnwindPoints.scene(st.saturnCv, data, { box: () => st.saturnBox, size: [0.6, 1.8], gatherMs: 2600 });
        st.scene.resize(st.W, st.H);
        if (onPage()) st.scene.start();
      }).catch(() => {});
    }
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
      if (!unlocked()) { st.map = null; st.loadState = 'idle'; st.selected = null; }
      if (onPage()) show();
    };
    window.addEventListener('resize', () => { if (onPage()) { layout(); if (!st.running) frame(performance.now()); } });
    new MutationObserver(() => { st.ink = window.UnwindPoints ? UnwindPoints.readInk() : st.ink; if (st.scene) st.scene.reink(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (onPage()) show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
