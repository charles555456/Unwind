/*
 * System — the owner's life systems as a knowledge graph (Private only).
 *
 * The map is a tree: Charles at the root, his systems under him, their items
 * under them, as deep as he likes. Every node can hold a note and links.
 *
 * The graph shows one node in the middle with two rings of what is under it
 * (only one ring at the top, so Charles's view stays uncluttered).
 * Tapping something that has sub-items makes it the new middle, and tapping
 * the middle goes back up a level; tapping a leaf opens it in the side panel, where its note, links and sub-items are
 * edited; dragging a node onto another makes it that node's sub-item. Items with the same name under two siblings are drawn as one node
 * with two links, so overlaps show as bridges. Nodes are small point spheres
 * like the home page; a force layout spreads them out, then they barely sway.
 *
 * The map lives only in the private database (private_settings key
 * "system_map"), read and written with the Private password; nothing about
 * it ships in the site's files. Older maps (center / systems / items) are
 * read and upgraded on the first save, keeping the old copy as "legacy".
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
    page: null, wrap: null, stage: null, cv: null, panel: null, crumbs: null, statusEl: null,
    W: 0, H: 0, wide: false, squash: 1,
    map: null, index: new Map(), loadState: 'idle', path: ['root'], sel: null, hits: [],
    nodes: null, edges: [], byId: null, gOf: new Map(), sig: '',
    alpha: 0, alphaTarget: 0, view: { s: 1, x: 0, y: 0 },
    hover: null, press: null, dragging: null, drop: null,
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
  // each level of the tree has its own figure, all made of the same points:
  // 0 a dense sphere, 1 a globe of meridians, 2 a globe of latitude lines, 3+ a small spiral disk
  function meridians(k, per) {
    const pts = [];
    for (let m = 0; m < k; m++) {
      const lon = m / k * Math.PI;
      for (let i = 0; i < per; i++) { const a = i / per * Math.PI * 2; pts.push([Math.cos(a) * Math.cos(lon), Math.sin(a), Math.cos(a) * Math.sin(lon)]); }
    }
    return pts;
  }
  function bands(k, per) {
    const pts = [];
    for (let b = 1; b <= k; b++) {
      const lat = -Math.PI / 2 + Math.PI * b / (k + 1), r = Math.cos(lat), m = Math.max(6, Math.round(per * r));
      for (let i = 0; i < m; i++) { const a = (i + Math.random() * 0.3) / m * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(lat), Math.sin(a) * r]); }
    }
    return pts;
  }
  function disk(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = Math.sqrt(Math.random()), arm = i % 2 ? Math.PI : 0, a = arm + t * 4.2 + (Math.random() - 0.5) * 0.5;
      pts.push([Math.cos(a) * t, (Math.random() - 0.5) * 0.08 * (1 - t), Math.sin(a) * t]);
    }
    return pts;
  }
  const LOOK = [sphere(260), meridians(6, 36), bands(5, 26), disk(110)];
  const LOOK_SMALL = [sphere(40), meridians(4, 14), bands(3, 12), disk(40)];
  const look = (d, small) => (small ? LOOK_SMALL : LOOK)[Math.min(d || 0, 3)];

  const TILT = 0.42, CT = Math.cos(TILT), STL = Math.sin(TILT);
  function drawSphere(ctx, pts, cx, cy, R, t, alpha) {
    const rot = reduce ? 0.5 : t * 0.6, c = Math.cos(rot), s = Math.sin(rot);
    const ink = st.ink;
    for (const p of pts) {
      const x = p[0] * c + p[2] * s, z0 = -p[0] * s + p[2] * c;
      // tipped toward the viewer so lines and disks read in depth
      const y = p[1] * CT - z0 * STL, z = p[1] * STL + z0 * CT;
      const depth = Math.max(0, Math.min(1, (z + 1) / 2));
      const a = (0.25 + 0.75 * depth) * alpha;
      if (a < 0.02) continue;
      ctx.fillStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + a.toFixed(3) + ')';
      const sz = 0.7 + 0.8 * depth;
      ctx.fillRect(cx + x * R, cy + y * R, sz, sz);
    }
  }

  // ── the tree ──
  const isUrl = u => /^https?:\/\/\S+$/i.test(String(u || ''));
  function normNode(n, isRoot) {
    const o = typeof n === 'string' ? { name: n } : (n || {});
    return {
      id: isRoot ? 'root' : String(o.id || uid()),
      name: String(o.name || ''),
      note: String(o.note || ''),
      links: (o.links || []).filter(l => l && isUrl(l.url)).map(l => ({ url: String(l.url), title: String(l.title || '') })),
      children: (o.children || o.items || []).map(c => normNode(c))
    };
  }
  const cleanLinks = ls => (ls || []).filter(l => Array.isArray(l) && l.length === 2).map(l => [String(l[0]), String(l[1])]);

  function normalise(v) {
    const m = typeof v === 'string' ? JSON.parse(v) : (v || {});
    if (m.root) return { v: 2, root: normNode(m.root, true), links: cleanLinks(m.links), legacy: m.legacy };
    // the first version: { center, systems: [{ id, name, items }], links }
    const root = normNode({ name: m.center || 'Charles', children: m.systems || [] }, true);
    return { v: 2, root, links: cleanLinks(m.links), legacy: m.systems ? m : undefined };
  }

  function reindex() {
    st.index = new Map();
    const walk = (n, parent, depth) => { st.index.set(n.id, { node: n, parent, depth }); n.children.forEach(c => walk(c, n, depth + 1)); };
    if (st.map) walk(st.map.root, null, 0);
    // the node in the middle may have been moved: rebuild the way to it
    const keep = st.path.filter(id => st.index.has(id)).pop();
    st.path = keep ? pathTo(keep) : ['root'];
    if (st.sel && !st.index.has(st.sel)) st.sel = null;
  }
  const node = id => { const e = st.index.get(id); return e ? e.node : null; };
  const parentOf = id => { const e = st.index.get(id); return e ? e.parent : null; };
  const focusId = () => st.path[st.path.length - 1];
  const hasContent = n => !!(n.note.trim() || n.links.length);
  function pathTo(id) {
    const out = [];
    for (let n = node(id); n; n = parentOf(n.id)) out.unshift(n.id);
    return out.length ? out : ['root'];
  }

  // ── the graph: the node in focus, what is under it, and one ring further ──
  const norm = s => String(s || '').trim().toLowerCase();
  const SANS = 'Inter, "PingFang TC", "Noto Sans TC", sans-serif';
  const FONTS = {
    center: k => 'italic 400 ' + Math.round(24 * k) + 'px "Instrument Serif", Georgia, serif',
    child: k => '500 ' + (13 * k).toFixed(1) + 'px ' + SANS,
    leaf: k => '400 ' + (11.5 * k).toFixed(1) + 'px ' + SANS
  };

  function rebuild() {
    const focus = node(focusId());
    const old = new Map((st.nodes || []).map(n => [n.id, n]));
    const nodes = [], edges = [], byId = new Map(), gOf = new Map();
    const add = (id, kind, tn, near) => {
      let n = byId.get(id);
      if (!n) {
        n = old.get(id) || { id, x: (near ? near.x : 0) + (Math.random() - 0.5) * 12, y: (near ? near.y : 0) + (Math.random() - 0.5) * 12, vx: 0, vy: 0, ph: Math.random() * 6.28 };
        n.kind = kind; n.label = tn.name; n.tree = [];
        n.r = kind === 'center' ? 18 : kind === 'child' ? 9 : 1.6;
        n.charge = kind === 'center' ? 4 : kind === 'child' ? 2.2 : 0.8;
        // the box the node and its label take, for collisions
        const mctx = st.cv.getContext('2d');
        mctx.font = FONTS[kind](1);
        n.bw = Math.max(n.r * 2, mctx.measureText(n.label).width) + 14;
        n.bh = n.r * 2 + 5 + (kind === 'center' ? 24 : 15) + 6;
        nodes.push(n); byId.set(id, n);
      }
      if (!n.tree.includes(tn.id)) n.tree.push(tn.id);
      n.full = n.tree.some(t => hasContent(node(t)));
      n.kids = n.tree.reduce((k, t) => k + node(t).children.length, 0);
      n.depth = st.index.get(n.tree[0]).depth;
      gOf.set(tn.id, n);
      return n;
    };
    const c = add('n:' + focus.id, 'center', focus);
    c.x = 0; c.y = 0;
    const kids = focus.children;
    kids.forEach((ch, i) => {
      const a = i / Math.max(1, kids.length) * Math.PI * 2 - Math.PI / 2;
      const cn = add('n:' + ch.id, 'child', ch, { x: Math.cos(a) * 24, y: Math.sin(a) * 24 });
      edges.push({ a: c, b: cn, len: 150, k: 0.7 });
    });
    const byName = new Map();
    // at the top only the systems show; their items wait until you go in
    if (focus.id !== 'root') kids.forEach(ch => {
      const cn = gOf.get(ch.id);
      ch.children.forEach(g => {
        const key = norm(g.name); if (!key) return;
        const id = byName.get(key) || 'n:' + g.id;
        byName.set(key, id);
        const had = byId.get(id);
        const gn = add(id, 'leaf', g, cn);
        if (!had || !edges.some(e => e.a === cn && e.b === gn)) edges.push({ a: cn, b: gn, len: 64, k: 0.6 });
      });
    });
    st.map.links.forEach(([x, y]) => {
      const a = gOf.get(x), b = gOf.get(y);
      if (a && b && a !== b) edges.push({ a, b, len: 170, k: 0.08, cross: true });
    });
    nodes.forEach(n => { n.nb = new Set([n]); });
    edges.forEach(e => { e.a.nb.add(e.b); e.b.nb.add(e.a); });
    // only a change in shape sets the layout moving again, not a typed note
    const sig = nodes.map(n => n.id + n.label).join('|') + '#' + edges.map(e => e.a.id + '>' + e.b.id).join('|');
    if (sig !== st.sig) st.alpha = Math.max(st.alpha || 0, old.size ? 0.4 : 1);
    st.sig = sig;
    st.nodes = nodes; st.edges = edges; st.byId = byId; st.gOf = gOf;
  }

  // a small force layout, in the manner of d3-force
  function tick() {
    const N = st.nodes, a = st.alpha;
    for (let i = 0; i < N.length; i++) {
      const p = N[i];
      for (let j = i + 1; j < N.length; j++) {
        const q = N[j];
        if (p.fx != null || q.fx != null) continue;   // a dragged node passes over the others
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

  // ── view: on a computer the stage runs edge to edge, the panel floats at its right ──
  const WIDE = 900, SIDE_W = 340;
  const sideOpen = () => st.wide && st.loadState === 'ready' && !!st.map;
  function layout() {
    const docW = document.documentElement.clientWidth;
    st.wide = docW >= WIDE;
    st.stage.style.width = ''; st.stage.style.marginLeft = '';
    const colLeft = st.wrap.getBoundingClientRect().left, colRight = colLeft + st.wrap.clientWidth;
    if (st.wide) {
      st.stage.style.width = docW + 'px';
      st.stage.style.marginLeft = -Math.round(colLeft) + 'px';
    }
    const W = Math.round(st.wide ? docW : st.stage.clientWidth || 600);
    const H = Math.round(st.wide ? Math.max(520, Math.min(900, window.innerHeight - 200)) : Math.max(420, Math.min(620, W * 0.82)));
    // a wide frame flattens the layout so the graph spreads sideways
    st.squash = st.wide ? Math.min(1.8, (W - SIDE_W) / H) : 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    st.W = W; st.H = H;
    st.stage.style.height = H + 'px';
    st.cv.width = W * dpr; st.cv.height = H * dpr; st.cv.style.width = W + 'px'; st.cv.style.height = H + 'px';
    st.cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    st.panel.classList.toggle('side', sideOpen());
    st.panel.style.right = sideOpen() ? Math.round(colRight - docW + 32) + 'px' : '';
    st.panel.style.maxHeight = sideOpen() ? (H - 32) + 'px' : '';
  }
  function fit(instant) {
    if (!st.nodes || !st.nodes.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of st.nodes) {
      x0 = Math.min(x0, n.x - n.bw / 2); x1 = Math.max(x1, n.x + n.bw / 2);
      y0 = Math.min(y0, n.y - n.r - 6); y1 = Math.max(y1, n.y - n.r + n.bh);
    }
    const pad = st.wide ? 64 : 24, inset = sideOpen() ? SIDE_W + 48 : 0;
    const availW = st.W - pad * 2 - inset;
    // a small graph should not be blown up to fill the frame
    const cap = Math.min(st.wide ? 2.4 : 1.25, 1.2 + st.nodes.length / 10);
    const s = Math.min(cap, availW / (x1 - x0), (st.H - 24) / (y1 - y0));
    const tx = pad + availW / 2 - (x0 + x1) / 2 * s, ty = st.H / 2 - (y0 + y1) / 2 * s;
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

    // what is in focus: the hovered node, else the selected one, with their neighbours
    const focus = st.hover || (st.sel && st.gOf.get(st.sel)) || null;
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
      const on = focus && (e.a === focus || e.b === focus);
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
      let R = n.r * vs * (sel ? 1.25 : 1);
      if (n.kind === 'center') drawSphere(ctx, look(n.depth), p.x, p.y, R, t * 0.5, dim);
      else if (n.kind === 'child') drawSphere(ctx, look(n.depth), p.x, p.y, R, t, (n.full || n.kids ? 0.9 : 0.6) * dim);
      else if (n.kids) { R = 4.2 * vs; drawSphere(ctx, look(n.depth, true), p.x, p.y, R, t + n.ph, 0.85 * dim); }
      else {
        // a leaf is a single point: brighter when it holds a note or links, larger when shared
        const sz = ((n.tree.length > 1 ? 3.4 : 2.6) + (n.full ? 0.6 : 0)) * vs * (sel ? 1.3 : 1);
        ctx.fillStyle = 'rgba(' + ink + ',' + ((n.full ? 1 : 0.55) * dim).toFixed(3) + ')';
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      st.hits.push({ n, x: p.x, y: p.y, r: Math.max(14, R + 8) });
      // while dragging over a node that can take it, a dotted circle marks the drop
      if (st.drop === n) {
        const rr = Math.max(16, R * 1.6 + 10);
        ctx.fillStyle = 'rgba(' + ink + ',0.9)';
        for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2 + t * 0.4; ctx.fillRect(p.x + Math.cos(a) * rr - 0.8, p.y + Math.sin(a) * rr - 0.8, 1.6, 1.6); }
      }

      // label under the node
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = FONTS[n.kind](vs);
      const la = n.kind === 'center' ? 0.95 : n.kind === 'child' ? 0.9 : (focus && on) || n.full ? 0.85 : 0.55;
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

  // ── moving through the tree ──
  function shift(dx, dy) {
    (st.nodes || []).forEach(n => { n.x += dx; n.y += dy; });
    st.view.x -= dx * st.view.s; st.view.y -= dy * st.view.s;
  }
  // make a node the middle: it slides to the centre and what is under it spreads out
  function goTo(id) {
    if (!node(id) || id === focusId()) return;
    const g = st.gOf.get(id), was = st.byId && st.byId.get('n:' + focusId());
    if (g) shift(-g.x, -g.y);
    else if (was) shift(150, 0);      // going up: the old middle steps aside
    st.path = pathTo(id); st.sel = null; st.hover = null;
    rebuild();
    st.alpha = Math.max(st.alpha, 0.5);
    renderCrumbs(); renderPanel(); redraw();
  }
  function up() { if (st.path.length > 1) goTo(st.path[st.path.length - 2]); }
  // a node with sub-items becomes the middle; a leaf opens in the panel
  function open(id) {
    const n = node(id); if (!n) return;
    if (n.children.length && id !== focusId()) goTo(id);
    else select(id === focusId() ? null : id);
  }
  function select(id) {
    st.sel = id;
    renderPanel();
    redraw();
    if (id && !st.wide && st.panel.getBoundingClientRect().top > window.innerHeight - 80) st.panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

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
    if (st.map) { reindex(); layout(); rebuild(); }
    renderCrumbs(); renderPanel();
    if (st.map && onPage()) start();
  }

  // the map changed: re-read the tree and the graph, keeping positions
  function changed() { if (st.map) { reindex(); rebuild(); redraw(); } }

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

  // ── links ──
  // "title https://…" keeps the title; a bare domain gets https://
  function parseLink(text) {
    text = String(text || '').trim();
    if (!text) return null;
    const m = text.match(/https?:\/\/\S+/i);
    let url = m ? m[0] : text, title = m ? text.replace(m[0], '').trim() : '';
    if (!m) { if (!/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) return null; url = 'https://' + url; }
    try { new URL(url); } catch (e) { return null; }
    return { url, title };
  }
  function linkLabel(l) {
    if (l.title) return l.title;
    try {
      const u = new URL(l.url);
      const host = u.hostname.replace(/^www\./, '');
      const last = decodeURIComponent(u.pathname).split('/').filter(Boolean).pop();
      return last ? host + ' / ' + (last.length > 40 ? last.slice(0, 40) + '…' : last) : host;
    } catch (e) { return l.url; }
  }

  // ── where you are ──
  function renderCrumbs() {
    const C = st.crumbs;
    if (!C) return;
    if (!st.map || st.loadState !== 'ready' || st.path.length < 2) { C.innerHTML = ''; return; }
    C.innerHTML = st.path.map((id, i) => {
      const n = node(id), last = i === st.path.length - 1;
      return (i ? '<span class="sep" aria-hidden="true">›</span>' : '')
        + (last ? `<span aria-current="page">${esc(n.name)}</span>` : `<button data-sys-crumb="${esc(id)}">${esc(n.name)}</button>`);
    }).join('');
  }

  // ── the panel: the selected node, or the one in the middle ──
  function renderPanel() {
    const P = st.panel;
    if (!P) return;
    st.statusEl = null;
    P.classList.toggle('side', sideOpen());
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
    const id = st.sel || focusId(), n = node(id), parent = parentOf(id);
    const isRoot = id === 'root', isMiddle = id === focusId();
    const siblings = parent ? parent.children.filter(s => s.id !== id) : [];
    const linked = sid => st.map.links.some(([a, b]) => (a === id && b === sid) || (b === id && a === sid));
    const meta = c => [c.children.length ? c.children.length : '', hasContent(c) ? '•' : ''].filter(Boolean).join(' ');
    P.innerHTML = `
      <div class="sys-p-head">
        <input class="sys-input sys-title" id="sysName" value="${esc(n.name)}" maxlength="60" aria-label="名稱">
        ${isMiddle ? (st.path.length > 1 ? '<button class="sys-x" data-sys="up" aria-label="回上一層" title="回上一層">↑</button>' : '') : '<button class="sys-x" data-sys="close" aria-label="關閉" title="關閉">×</button>'}
      </div>
      <textarea class="sys-text" id="sysNote" rows="3" placeholder="寫點什麼…" aria-label="筆記">${esc(n.note)}</textarea>
      <p class="sys-label">連結</p>
      ${n.links.length ? `<ul class="sys-links">${n.links.map((l, i) => `<li>
          <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(linkLabel(l))} <span aria-hidden="true">↗</span></a>
          <button class="sys-del" data-sys-del-link="${i}" aria-label="移除連結 ${esc(linkLabel(l))}">×</button>
        </li>`).join('')}</ul>` : ''}
      <div class="sys-row">
        <input class="sys-input" id="sysNewLink" placeholder="貼上連結（前面可加標題）" inputmode="url" autocomplete="off">
        <button class="x-btn small" data-sys="add-link">加入</button>
      </div>
      <p class="sys-label">子項目</p>
      ${n.children.length ? `<ul class="sys-list">${n.children.map(c => `<li><button class="sys-link" data-sys-open="${esc(c.id)}">${esc(c.name)}</button><span class="sys-count">${meta(c)}</span></li>`).join('')}</ul>` : ''}
      <div class="sys-row">
        <input class="sys-input" id="sysNewChild" placeholder="新增子項目" maxlength="60" autocomplete="off">
        <button class="x-btn small" data-sys="add-child">新增</button>
      </div>
      ${siblings.length ? `<p class="sys-label">和這些有關</p>
      <div class="sys-chips">${siblings.map(o => `<button class="review-tab ${linked(o.id) ? 'active' : ''}" data-sys-link="${esc(o.id)}">${esc(o.name)}</button>`).join('')}</div>` : ''}
      ${isRoot ? '' : `<p class="sys-label"><label for="sysMove">移到</label></p>
      <select class="sys-input sys-select" id="sysMove">
        <option value="">放到另一個項目底下…</option>
        ${moveTargets(n).map(o => `<option value="${esc(o.id)}">${'\u3000'.repeat(o.depth)}${esc(o.name)}</option>`).join('')}
      </select>
      <div class="sys-row sys-danger"><button class="x-btn small danger" data-sys="del-node">刪除這個項目</button></div>`}
      <p class="sys-status" id="sysStatus"></p>`;
    st.statusEl = P.querySelector('#sysStatus');
    grow(P.querySelector('#sysNote'));
  }
  // anywhere except inside itself or where it already is
  function moveTargets(n) {
    const out = [], parent = parentOf(n.id);
    (function walk(x, d) {
      if (x.id === n.id) return;
      if (!parent || x.id !== parent.id) out.push({ id: x.id, name: x.name, depth: d });
      x.children.forEach(c => walk(c, d + 1));
    })(st.map.root, 0);
    return out;
  }
  function moveTo(n, targetId) {
    const from = parentOf(n.id), to = node(targetId);
    if (!from || !to || to.id === n.id) return;
    from.children = from.children.filter(c => c.id !== n.id);
    to.children.push(n);
    save(); renderCrumbs(); renderPanel();
    status('已移到「' + to.name + '」底下');
  }
  function grow(ta) { if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(360, ta.scrollHeight + 2) + 'px'; } }
  const current = () => node(st.sel || focusId());

  function addLink() {
    const inp = st.panel.querySelector('#sysNewLink'), n = current();
    if (!inp || !n) return;
    const l = parseLink(inp.value);
    if (!l) { status('這看起來不是連結', true); return; }
    n.links.push(l); save(); renderPanel();
    st.panel.querySelector('#sysNewLink').focus();
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
      st.drop = dropTarget(pr.n, h.x, h.y);
      if (!st.running) redraw();
      return;
    }
    if (e.pointerType === 'mouse' && st.hover !== h.n) {
      st.hover = h.n;
      st.cv.style.cursor = h.n && (h.n.kind !== 'center' || st.path.length > 1) ? 'pointer' : 'default';
      if (!st.running) redraw();
    }
  }
  // the node under the pointer, other than the one being dragged, that can take it
  function dropTarget(dragged, x, y) {
    let best = null, bd = 1e9;
    st.hits.forEach(h => { if (h.n === dragged) return; const d = Math.hypot(h.x - x, h.y - y); if (d < h.r + 10 && d < bd) { bd = d; best = h.n; } });
    if (!best) return null;
    const a = dragged.tree[0], b = best.tree[0], from = parentOf(a);
    if (a === b || (from && from.id === b)) return null;
    for (let x = node(b); x; x = parentOf(x.id)) if (x.id === a) return null;   // not into itself
    return best;
  }
  function onUp(e) {
    const pr = st.press; st.press = null;
    if (st.dragging) {
      const dragged = st.dragging, target = st.drop;
      dragged.fx = dragged.fy = null; st.dragging = null; st.drop = null; st.alphaTarget = 0;
      if (e.pointerType !== 'mouse') st.hover = null;
      // dropped on another node: it becomes that node's sub-item
      if (target) moveTo(node(dragged.tree[0]), target.tree[0]);
      return;
    }
    if (!pr) return;
    const n = pr.n;
    if (!n) { if (st.sel) select(null); return; }
    // the middle node takes you back up a level
    if (n.kind === 'center') { if (st.path.length > 1) up(); else if (st.sel) select(null); return; }
    const id = n.tree.includes(st.sel) ? st.sel : n.tree[0];
    if (!node(id).children.length && id === st.sel) select(null);
    else open(id);
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const crumb = t.closest('[data-sys-crumb]');
    if (crumb && st.crumbs && st.crumbs.contains(crumb)) { goTo(crumb.dataset.sysCrumb); return; }
    if (!st.panel || !st.panel.contains(t)) return;
    const act = t.closest('[data-sys]');
    if (act) {
      const a = act.dataset.sys, n = current();
      if (a === 'init') { st.map = normalise({ center: 'Charles', systems: [] }); st.loadState = 'ready'; reindex(); layout(); rebuild(); renderPanel(); save(); start(); }
      if (a === 'close') select(null);
      if (a === 'up') up();
      if (a === 'add-link') addLink();
      if (a === 'add-child') {
        const inp = st.panel.querySelector('#sysNewChild'); const name = inp.value.trim(); if (!n || !name) return;
        n.children.push({ id: uid(), name, note: '', links: [], children: [] });
        save(); renderPanel(); st.panel.querySelector('#sysNewChild').focus();
      }
      if (a === 'del-node') {
        const parent = parentOf(n.id); if (!parent) return;
        if (!confirm('刪除「' + n.name + '」' + (n.children.length ? '和底下所有項目' : '') + '？')) return;
        const gone = new Set();
        (function walk(x) { gone.add(x.id); x.children.forEach(walk); })(n);
        parent.children = parent.children.filter(c => c.id !== n.id);
        st.map.links = st.map.links.filter(([x, y]) => !gone.has(x) && !gone.has(y));
        if (st.path.some(p => gone.has(p))) st.path = pathTo(parent.id);
        st.sel = null;
        save(); renderCrumbs(); renderPanel();
      }
      return;
    }
    const op = t.closest('[data-sys-open]'); if (op) { open(op.dataset.sysOpen); return; }
    const del = t.closest('[data-sys-del-link]');
    if (del) { const n = current(); n.links.splice(+del.dataset.sysDelLink, 1); save(); renderPanel(); return; }
    const link = t.closest('[data-sys-link]');
    if (link) {
      const a = st.sel || focusId(), b = link.dataset.sysLink;
      const i = st.map.links.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (i >= 0) st.map.links.splice(i, 1); else st.map.links.push([a, b]);
      save(); renderPanel();
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (!st.panel || !st.panel.contains(t) || !st.map) return;
    if (t.id === 'sysMove' && t.value) { const n = current(); if (n) moveTo(n, t.value); return; }
    if (t.id === 'sysName') { const n = current(); if (n) { n.name = t.value.trim() || n.name; t.value = n.name; save(); renderCrumbs(); } }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (!st.panel || !st.panel.contains(t) || !st.map) return;
    if (t.id === 'sysNote') { const n = current(); if (n) { n.note = t.value; grow(t); save(); } }
  });

  document.addEventListener('paste', e => {
    if (!st.panel || e.target.id !== 'sysNewLink' || !st.panel.contains(e.target)) return;
    setTimeout(() => { if (parseLink(e.target.value) && !/\s/.test(e.target.value.trim())) addLink(); }, 0);
  });

  document.addEventListener('keydown', e => {
    if (!onPage() || e.isComposing) return;
    const t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (e.key === 'Escape' && !typing && st.map) { if (st.sel) select(null); else up(); return; }
    if (e.key !== 'Enter' || !st.panel || !st.panel.contains(t)) return;
    if (t.id === 'sysNewLink') { e.preventDefault(); addLink(); }
    if (t.id === 'sysNewChild') { e.preventDefault(); st.panel.querySelector('[data-sys="add-child"]').click(); }
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
      <div class="sys-crumbs" id="sysCrumbs" role="navigation" aria-label="目前位置"></div>
      <div class="sys-wrap">
        <div class="sys-stage" id="sysStage">
          <canvas role="img" aria-label="關係圖：中間是目前所在的項目，連到它底下的項目"></canvas>
        </div>
        <div class="sys-panel" id="sysPanel"></div>
      </div>`;
    const inbox = document.getElementById('page-inbox');
    container.insertBefore(page, inbox ? inbox.nextSibling : null);
    st.page = page; st.wrap = page.querySelector('.sys-wrap'); st.stage = page.querySelector('#sysStage');
    st.cv = page.querySelector('canvas');
    st.panel = page.querySelector('#sysPanel'); st.crumbs = page.querySelector('#sysCrumbs');
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
    else { renderCrumbs(); renderPanel(); }
    start();
  }

  function init() {
    build();
    const baseNavigate = window.navigate;
    window.navigate = function (page) { baseNavigate(page); if (page === 'system') show(); else stop(); };
    const baseRenderPrivate = window.renderPrivate;
    window.renderPrivate = function () {
      baseRenderPrivate();
      if (!unlocked()) { st.map = null; st.nodes = null; st.sig = ''; st.loadState = 'idle'; st.path = ['root']; st.sel = null; st.hover = null; renderCrumbs(); }
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
