/*
 * Page art for Projects and Stream. Inserts itself; index.html is unchanged.
 *
 * Projects — the two hands from Michelangelo's Creation of Adam (public
 *            domain), turned into points like the home sphere, with a tiny
 *            version of that sphere turning in the gap between the fingers.
 *            "Create with happiness" sits beneath.
 * Stream   — on wide screens, a few faint words from the Stream posts drift
 *            slowly upward in the side margins, outside the reading column.
 *
 * Home     — three thin concentric rings around the dot sphere, drawn
 *            underneath it, shown only on the home page.
 *
 * Each scene runs only while its page is open, and holds still under
 * prefers-reduced-motion.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isOn = page => typeof currentPage !== 'undefined' && currentPage === page;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ════════════════════════════════════════════════════════
  //  PROJECTS
  // ════════════════════════════════════════════════════════
  const HANDS = 'art/hands.bin';
  const ASPECT = 262 / 900;                 // of the point file
  const GAP = { x: 0.462, y: 0.48 };        // between the two fingertips, in image units
  const proj = { root: null, canvas: null, scene: null, loading: null, layout: null };

  // a few dozen points on a small sphere, denser at the poles, like the home page
  const SPARK = (() => {
    const pts = [];
    while (pts.length < 90) {
      const lat = rnd(-1, 1) * Math.PI / 2, lon = rnd(0, Math.PI * 2);
      if (Math.random() > 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(lat)), 1.4)) continue;
      pts.push([Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat), Math.random()]);
    }
    return pts;
  })();

  function drawSpark(ctx, t, box, ink, gathered) {
    const fadeIn = Math.max(0, Math.min(1, (gathered - 0.85) / 0.15));
    if (fadeIn <= 0) return;
    const cx = box.x + GAP.x * box.w, cy = box.y + GAP.y * box.h;
    const R = Math.max(6, box.w * 0.012);
    const rot = reduce ? 0.6 : t * 0.5, c = Math.cos(rot), s = Math.sin(rot);
    const tilt = 0.25, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (const p of SPARK) {
      const x = p[0] * c + p[2] * s, z0 = -p[0] * s + p[2] * c;
      const y = p[1] * ct - z0 * st, z = p[1] * st + z0 * ct;
      const depth = (z + 1) / 2;
      const a = (0.2 + 0.8 * depth) * fadeIn * (reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 2 + p[3] * 6));
      ctx.fillStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + a.toFixed(3) + ')';
      const sz = 0.7 + 0.7 * depth;
      ctx.fillRect(cx + x * R, cy + y * R, sz, sz);
    }
  }

  function projSize() {
    const w = Math.round(proj.root.clientWidth || 600);
    const imgH = Math.round(w * ASPECT);
    const h = Math.round(imgH + Math.max(40, w * 0.08));
    return { w, h, box: { x: 0, y: Math.round((h - imgH) / 2), w, h: imgH } };
  }

  function projBuild() {
    const page = document.getElementById('page-projects');
    if (!page || document.getElementById('projArt')) return;
    const sec = document.createElement('section');
    sec.id = 'projArt';
    sec.className = 'proj-art';
    sec.innerHTML = '<canvas role="img" aria-label="兩隻手的指尖之間，一顆小小的光點"></canvas>'
      + '<h2 class="proj-art-title"><span>Create with</span> <em>happiness</em></h2>';
    const sig = page.querySelector('.page-sig');
    page.insertBefore(sec, sig ? sig.nextSibling : page.firstChild);
    proj.root = sec;
    proj.canvas = sec.querySelector('canvas');
  }

  function projStart() {
    if (!proj.root) projBuild();
    if (!proj.root || !window.UnwindPoints) return;
    if (proj.scene) { proj.scene.start(); return; }
    if (proj.loading) return;
    proj.loading = UnwindPoints.load(HANDS).then(data => {
      proj.layout = projSize();
      proj.scene = UnwindPoints.scene(proj.canvas, data, {
        box: () => proj.layout.box,
        size: [0.6, 1.6],
        gatherMs: 2600,
        feather: 0.14,
        after: drawSpark
      });
      proj.scene.resize(proj.layout.w, proj.layout.h);
      if (isOn('projects')) proj.scene.start();
    }).catch(() => { proj.root.hidden = true; });
  }
  function projStop() { if (proj.scene) proj.scene.stop(); }

  // ════════════════════════════════════════════════════════
  //  STREAM — faint words in the margins
  // ════════════════════════════════════════════════════════
  const strm = { cv: null, ctx: null, W: 0, H: 0, words: [], items: [], raf: 0, running: false, last: 0, ink: null };
  const COLUMN = 640;                        // the site's reading column
  const MIN_MARGIN = 200;                    // below this there is no room, so nothing is drawn

  // Whole short phrases only, never a word cut in half.
  function wordsFromStream() {
    const out = new Set();
    const posts = typeof STREAM !== 'undefined' && Array.isArray(STREAM) ? STREAM : [];
    posts.forEach(p => {
      String(p.content || '').replace(/[#*_>`\[\]()]/g, ' ').split(/[\s，。、！？；：,.!?;:「」『』（）]+/).forEach(w => {
        w = w.trim();
        if (/^[㐀-鿿]{3,7}$/.test(w)) out.add(w);
        else if (/^[A-Za-z][A-Za-z'-]{3,13}$/.test(w)) out.add(w.toLowerCase());
      });
    });
    return Array.from(out);
  }

  function strmLayout() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    strm.W = W; strm.H = H;
    strm.cv.width = W * dpr; strm.cv.height = H * dpr;
    strm.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const margin = (W - COLUMN) / 2;
    strm.items = [];
    if (margin < MIN_MARGIN || !strm.words.length) return;
    // few, spaced apart, each phrase used once
    const pool = strm.words.slice().sort(() => Math.random() - 0.5);
    const count = Math.min(pool.length, 12, Math.round(H / 70));
    const placed = [];
    for (let i = 0, tries = 0; placed.length < count && tries < 400; tries++) {
      const left = placed.length % 2 === 0;
      const lo = left ? 40 : W - margin + 64, hi = left ? margin - 64 : W - 40;
      const x = rnd(lo, Math.max(lo + 1, hi - 110)), y = rnd(0, H + 40);
      if (placed.some(p => Math.abs(p.x - x) < 150 && Math.abs(p.y - y) < 90)) continue;
      placed.push({ x, y, word: pool[i++], speed: rnd(2.5, 5), base: rnd(0.045, 0.085), ph: rnd(0, 6.28), size: 12.5 });
    }
    strm.items = placed;
  }

  function strmDraw(now) {
    const { ctx, W, H } = strm;
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    if (!strm.items.length) return;
    const ink = strm.ink || (strm.ink = UnwindPoints.readInk());
    ctx.textBaseline = 'middle';
    for (const it of strm.items) {
      let y = it.y - (reduce ? 0 : t * it.speed);
      y = ((y % (H + 40)) + H + 40) % (H + 40) - 20;
      // now and then a word surfaces a little, then sinks back
      const lift = reduce ? 0 : Math.pow(Math.max(0, Math.sin(t * 0.13 + it.ph)), 16) * 0.22;
      const edge = Math.min(1, y / 80, (H - y) / 80);
      const a = (it.base + lift) * Math.max(0, edge);
      if (a < 0.01) continue;
      ctx.font = '400 ' + it.size.toFixed(1) + 'px Inter, "PingFang TC", "Noto Sans TC", sans-serif';
      ctx.fillStyle = 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + a.toFixed(3) + ')';
      ctx.fillText(it.word, it.x, y);
    }
  }

  function strmLoop(now) {
    if (!strm.running) return;
    if (!document.hidden && now - strm.last > 48) { strm.last = now; strmDraw(now); }
    strm.raf = requestAnimationFrame(strmLoop);
  }
  function strmStart() {
    if (!strm.cv) {
      strm.cv = document.createElement('canvas');
      strm.cv.className = 'stream-art';
      strm.cv.setAttribute('aria-hidden', 'true');
      const bg = document.getElementById('bgCanvas');
      document.body.insertBefore(strm.cv, bg ? bg.nextSibling : document.body.firstChild);
      strm.ctx = strm.cv.getContext('2d');
    }
    strm.words = wordsFromStream();
    strmLayout();
    strm.cv.classList.add('on');
    if (reduce) { strmDraw(0); return; }
    if (strm.running) return;
    strm.running = true;
    strm.raf = requestAnimationFrame(strmLoop);
  }
  function strmStop() {
    strm.running = false; cancelAnimationFrame(strm.raf);
    if (strm.cv) strm.cv.classList.remove('on');
  }

  // ════════════════════════════════════════════════════════
  //  HOME — thin concentric rings around the dot sphere
  // ════════════════════════════════════════════════════════
  // Centred where the sphere in index.html is drawn (same formulas), under it.
  const RINGS = [1.8, 2.6, 3.6];             // radii, in sphere radii
  const home = { svg: null };
  function homeLayout() {
    const svg = home.svg, r = svg.getBoundingClientRect();
    const W = Math.round(r.width) || window.innerWidth, H = Math.round(r.height) || window.innerHeight;
    const mobile = W < 640;
    const R = mobile ? Math.min(W * 0.27, H * 0.115) : Math.min(W * 0.18, H * 0.24, 290);
    const cx = mobile ? W * 0.5 : W * 0.74, cy = mobile ? H * 0.27 : H * 0.42;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.querySelectorAll('circle').forEach((c, i) => {
      c.setAttribute('cx', cx.toFixed(1)); c.setAttribute('cy', cy.toFixed(1)); c.setAttribute('r', (R * RINGS[i]).toFixed(1));
    });
  }
  function homeBuild() {
    if (home.svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'home-rings'); svg.setAttribute('aria-hidden', 'true');
    RINGS.forEach(() => svg.appendChild(document.createElementNS(NS, 'circle')));
    const bg = document.getElementById('bgCanvas');
    document.body.insertBefore(svg, bg || document.body.firstChild);
    home.svg = svg;
    homeLayout();
  }

  // ── wiring ──
  function sync() {
    if (home.svg) home.svg.classList.toggle('on', isOn('home'));
    if (isOn('projects')) projStart(); else projStop();
    if (isOn('stream')) strmStart(); else strmStop();
  }

  function init() {
    homeBuild();
    projBuild();
    const baseNavigate = window.navigate;
    window.navigate = function (page) { baseNavigate(page); sync(); };
    window.addEventListener('resize', () => {
      if (home.svg) homeLayout();
      if (proj.scene) {
        const s = projSize();
        if (s.w !== proj.scene.size[0]) { proj.layout = s; proj.scene.resize(s.w, s.h); if (reduce) proj.scene.draw(); }
      }
      if (strm.running || (reduce && strm.cv)) { strmLayout(); if (reduce) strmDraw(0); }
    });
    new MutationObserver(() => { strm.ink = null; if (proj.scene) proj.scene.reink(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
