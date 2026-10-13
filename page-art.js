/*
 * Page art for Projects and Stream. Inserts itself; index.html is unchanged.
 *
 * Projects — a hand holding a glowing orb, rendered as 1-bit ordered dither,
 *            with "Create with happiness" beneath it, at the top of the page.
 * Stream   — a fixed backdrop: a pixelated black hole with an orange ring,
 *            and your own Stream posts spiralling into it along a funnel.
 *
 * Each scene animates only while its page is open, and holds still under
 * prefers-reduced-motion.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isOn = page => typeof currentPage !== 'undefined' && currentPage === page;

  function readInk() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f2f2f2';
    const probe = document.createElement('span');
    probe.style.color = c; probe.style.display = 'none';
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+/g);
    probe.remove();
    return m ? [+m[0], +m[1], +m[2]] : [242, 242, 242];
  }
  const isDark = () => document.documentElement.classList.contains('dark');

  // ── shared bits ──
  const rnd = (a, b) => a + Math.random() * (b - a);
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function randDir() {
    const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
    return [r * Math.cos(th), u, r * Math.sin(th)];
  }
  // value noise on a wrapping 64×64 lattice
  const NOISE = Float32Array.from({ length: 64 * 64 }, () => Math.random());
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const i = (a, b) => NOISE[((b & 63) << 6) | (a & 63)];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (i(xi, yi) * (1 - u) + i(xi + 1, yi) * u) * (1 - v) + (i(xi, yi + 1) * (1 - u) + i(xi + 1, yi + 1) * u) * v;
  }

  // ════════════════════════════════════════════════════════
  //  PROJECTS — dithered hand and orb
  // ════════════════════════════════════════════════════════
  const BAYER = (() => {
    const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
               [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
    return m.map(r => r.map(v => (v + 0.5) / 64));
  })();

  // The hand, in orb radii: orb at the origin, y down, z toward the viewer.
  // It comes in from the lower right: palm under the orb, four fingers
  // fanned around its lower-left edge, thumb resting on its right side.
  function handSolids() {
    const ell = (c, r, p) => ({ type: 'ell', c, r, p: p || 2 });
    const cap = (a, b, r) => ({ type: 'cap', a, b, r });
    const at = (deg, r, z) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r, z];
    const S = [
      cap([4.9, 4.0, -0.6], [2.0, 2.0, -0.1], 0.66),          // forearm
      ell([1.9, 1.95, -0.05], [0.7, 0.6, 0.62]),               // wrist
      ell([0.75, 1.55, 0.05], [1.12, 0.52, 0.86], 2.6),        // palm
      cap([1.55, 1.3, 0.55], [1.5, 0.62, 0.74], 0.23),         // thumb
      cap([1.5, 0.62, 0.74], [1.12, 0.08, 0.7], 0.2),
      ell([1.07, 0.02, 0.69], [0.19, 0.2, 0.18])
    ];
    // index, middle, ring, little: base on the palm, curling up the orb's left side
    [[98, 238, 0.42, 1.0], [104, 218, 0.22, 0.98], [110, 198, 0.02, 0.93], [116, 180, -0.18, 0.82]].forEach(([b, tip, z, len]) => {
      const reach = b + (tip - b) * len;
      const pts = [at(b, 1.3, z), at(b + (reach - b) * 0.42, 1.27, z), at(b + (reach - b) * 0.76, 1.2, z), at(reach, 1.13, z)];
      const r = [0.23, 0.2, 0.17];
      for (let k = 0; k < 3; k++) S.push(cap(pts[k], pts[k + 1], r[k]));
      S.push(ell(pts[3], [0.16, 0.16, 0.16]));
    });
    return S;
  }
  function sample(sol) {
    if (sol.type === 'ell') {
      const d = randDir(), e = 2 / sol.p, f = v => Math.sign(v) * Math.abs(v) ** e;
      const l = [f(d[0]), f(d[1]), f(d[2])];
      return { p: [sol.c[0] + l[0] * sol.r[0], sol.c[1] + l[1] * sol.r[1], sol.c[2] + l[2] * sol.r[2]], n: norm([l[0] / sol.r[0], l[1] / sol.r[1], l[2] / sol.r[2]]) };
    }
    const ab = [sol.b[0] - sol.a[0], sol.b[1] - sol.a[1], sol.b[2] - sol.a[2]], ax = norm(ab);
    const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm([ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]);
    const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
    // caps at both ends, so fingertips are round
    const t = rnd(-0.08, 1.08), th = rnd(0, Math.PI * 2);
    let n = [u[0] * Math.cos(th) + v[0] * Math.sin(th), u[1] * Math.cos(th) + v[1] * Math.sin(th), u[2] * Math.cos(th) + v[2] * Math.sin(th)];
    const tc = Math.max(0, Math.min(1, t));
    if (t !== tc) { const k = (t - tc) / 0.08; n = norm([n[0] * Math.sqrt(1 - Math.min(1, k * k)) + ax[0] * k, n[1] * Math.sqrt(1 - Math.min(1, k * k)) + ax[1] * k, n[2] * Math.sqrt(1 - Math.min(1, k * k)) + ax[2] * k]); }
    return { p: [sol.a[0] + ab[0] * tc + n[0] * sol.r, sol.a[1] + ab[1] * tc + n[1] * sol.r, sol.a[2] + ab[2] * tc + n[2] * sol.r], n };
  }

  const proj = { root: null, cv: null, ctx: null, W: 0, H: 0, cols: 0, rows: 0, cell: 3, hand: null, stars: [], raf: 0, running: false, last: 0 };

  function projBuild() {
    const page = document.getElementById('page-projects');
    if (!page || document.getElementById('projArt')) return false;
    const sec = document.createElement('section');
    sec.id = 'projArt';
    sec.className = 'proj-art';
    sec.setAttribute('aria-label', 'Create with happiness');
    sec.innerHTML = '<canvas aria-hidden="true"></canvas><h2 class="proj-art-title"><span>Create with</span><em>happiness</em></h2>';
    const after = page.querySelector('.page-sig');
    page.insertBefore(sec, after ? after.nextSibling : page.firstChild);
    proj.root = sec;
    proj.cv = sec.querySelector('canvas');
    proj.ctx = proj.cv.getContext('2d');
    return true;
  }

  function projLayout() {
    const W = Math.round(proj.root.clientWidth);
    if (!W || W === proj.W) return;
    const H = Math.round(Math.max(260, Math.min(420, W * 0.62)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    proj.W = W; proj.H = H;
    proj.cell = 2;
    proj.cols = Math.ceil(W / proj.cell); proj.rows = Math.ceil(H / proj.cell);
    proj.cv.width = W * dpr; proj.cv.height = H * dpr;
    proj.cv.style.width = W + 'px'; proj.cv.style.height = H + 'px';
    proj.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // geometry on the cell grid
    proj.R = H * 0.175 / proj.cell;                      // orb radius in cells
    proj.ox = proj.cols * 0.44; proj.oy = proj.rows * 0.40;

    // splat the hand into a depth buffer once
    const n = proj.cols * proj.rows;
    const hz = new Float32Array(n).fill(-1e9), hl = new Float32Array(n);
    const solids = handSolids();
    const per = Math.round(90000 * Math.min(1.6, Math.max(0.6, proj.R / 32)));
    const lens = solids.map(s => s.type === 'cap' ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]) * s.r + s.r * s.r : (s.r[0] * s.r[1] + s.r[1] * s.r[2] + s.r[0] * s.r[2]));
    const total = lens.reduce((a, b) => a + b, 0);
    solids.forEach((sol, si) => {
      const count = Math.round(per * lens[si] / total);
      for (let k = 0; k < count; k++) {
        const s = sample(sol);
        if (s.n[2] < -0.05) continue;                    // facing away
        const cx = Math.round(proj.ox + s.p[0] * proj.R), cy = Math.round(proj.oy + s.p[1] * proj.R);
        if (cx < 0 || cy < 0 || cx >= proj.cols || cy >= proj.rows) continue;
        const idx = cy * proj.cols + cx;
        if (s.p[2] <= hz[idx]) continue;
        // lit by the orb: facing it, and close to it
        const d = Math.hypot(s.p[0], s.p[1], s.p[2]) || 1;
        const L = [-s.p[0] / d, -s.p[1] / d, -s.p[2] / d];
        const lam = Math.max(0, s.n[0] * L[0] + s.n[1] * L[1] + s.n[2] * L[2]);
        const fall = 1.7 / (1 + 0.55 * Math.max(0, d - 1) ** 2);
        // a soft fill from the front and above, so the hand reads as grey, not black
        const fill = Math.max(0, s.n[0] * -0.25 + s.n[1] * -0.45 + s.n[2] * 0.86);
        const rim = Math.pow(1 - Math.abs(s.n[2]), 2) * 0.22;
        // the forearm falls away into the dark
        const fade = Math.max(0.25, Math.min(1, 1.25 - Math.max(0, s.p[0] - 1.6) * 0.32));
        hz[idx] = s.p[2];
        hl[idx] = Math.min(1, Math.pow((lam * fall * 0.95 + fill * 0.62 + rim * 1.4) * fade, 0.8));
      }
    });
    // a bright rim where the hand meets the dark, so its outline reads
    const edge = new Uint8Array(n);
    for (let y = 1; y < proj.rows - 1; y++) {
      for (let x = 1; x < proj.cols - 1; x++) {
        const i = y * proj.cols + x;
        if (hz[i] < -1e8) continue;
        if (hz[i - 1] < -1e8 || hz[i + 1] < -1e8 || hz[i - proj.cols] < -1e8 || hz[i + proj.cols] < -1e8) edge[i] = 1;
      }
    }
    proj.hand = { hz, hl, edge };
    proj.stars = Array.from({ length: Math.round(proj.cols * proj.rows / 420) }, () => ({
      c: Math.floor(Math.random() * proj.cols), r: Math.floor(Math.random() * proj.rows), ph: rnd(0, 6.28), sp: rnd(0.4, 1.4)
    }));
  }

  function projDraw(now) {
    const { ctx, W, H, cols, rows, cell, R, ox, oy, hand } = proj;
    if (!hand) return;
    const t = reduce ? 0 : now / 1000;
    const ink = proj.ink || (proj.ink = readInk());
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgb(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ')';
    const pulse = 1 + 0.06 * Math.sin(t * 1.6);
    const bx = 0.22, by = -0.975;                        // the plume rises straight up, clear of the fingers
    const sz = cell - 1;
    const lum = new Float32Array(cols * rows);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const qx = (c - ox) / R, qy = (r - oy) / R;
        const d = Math.hypot(qx, qy);
        let L = 0, z = -1e9;
        if (d < 1) {
          z = Math.sqrt(1 - d * d);
          const shade = 0.5 + 0.5 * (-qx * 0.45 - qy * 0.55 + z * 0.7);
          L = Math.min(1, (0.55 + 0.7 * shade) * pulse + 0.2 * noise(qx * 3 + t * 0.2, qy * 3));
        } else {
          L = 0.42 * Math.exp(-(d - 1) / 0.2) * pulse;
          const along = qx * bx + qy * by, px = qx - along * bx, py = qy - along * by, perp = Math.hypot(px, py);
          if (along > 0.4) {
            const width = 0.32 + 0.2 * along;
            const n1 = noise(along * 2.4 - t * 0.5, perp * 3 + 7) * 0.8 + noise(along * 6 - t * 1.1, perp * 8) * 0.4;
            L += 1.6 * Math.exp(-(perp * perp) / (width * width)) * Math.exp(-(along - 0.4) / 2.8) * n1;
          }
          // a thinner second wisp toward the upper right
          const a2 = qx * 0.9 + qy * -0.44;
          if (a2 > 1.2) {
            const p2 = Math.hypot(qx - a2 * 0.9, qy + a2 * 0.44);
            L += 0.45 * Math.exp(-(p2 * p2) / 0.08) * Math.exp(-(a2 - 0.8) / 1.4) * noise(a2 * 3 - t * 0.7, p2 * 5 + 3);
          }
        }
        const i = r * cols + c;
        if (hand.hz[i] > z) L = Math.min(1, hand.hl[i] * pulse + (hand.edge[i] ? 0.4 : 0));   // the hand sits in front of the orb
        lum[i] = L;
      }
    }
    for (const s of proj.stars) {
      const i = s.r * cols + s.c;
      lum[i] = Math.max(lum[i], 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)));
    }
    for (let r = 0; r < rows; r++) {
      const br = BAYER[r & 7];
      for (let c = 0; c < cols; c++) {
        if (lum[r * cols + c] > br[c & 7]) ctx.fillRect(c * cell, r * cell, sz, sz);
      }
    }
  }

  function projLoop(now) {
    if (!proj.running) return;
    if (!document.hidden && now - proj.last > 40) { proj.last = now; projDraw(now); }   // ~25 fps is plenty for dither
    proj.raf = requestAnimationFrame(projLoop);
  }
  function projStart() {
    if (!proj.root && !projBuild()) return;
    projLayout();
    if (reduce) { projDraw(0); return; }
    if (proj.running) return;
    proj.running = true;
    proj.raf = requestAnimationFrame(projLoop);
  }
  function projStop() { proj.running = false; cancelAnimationFrame(proj.raf); }

  // ════════════════════════════════════════════════════════
  //  STREAM — your posts spiralling into a black hole
  // ════════════════════════════════════════════════════════
  const strm = { cv: null, ctx: null, W: 0, H: 0, lanes: [], words: [], stars: [], hole: null, raf: 0, running: false, last: 0 };
  const TEXT_RGB = [206, 226, 240];
  const RING_RGB = [232, 138, 62];
  const FALLBACK = ('const thought = notice(); if (thought.matters) keep(thought); stream.push(idea); '
    + 'from(many).into(one); while (curious) { read(); write(); unwind(); } return attention;').split(/\s+/);

  function wordsFromStream() {
    const out = [];
    const posts = typeof STREAM !== 'undefined' && Array.isArray(STREAM) ? STREAM : [];
    posts.forEach(p => {
      const text = String(p.content || '').replace(/[#*_>`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
      // Latin words stay whole; Chinese runs are cut into short pieces
      text.split(' ').forEach(w => {
        if (!w) return;
        if (/[㐀-鿿]/.test(w)) { for (let i = 0; i < w.length; i += 5) out.push(w.slice(i, i + 5)); }
        else out.push(w.slice(0, 18));
      });
    });
    return out.length > 30 ? out : out.concat(FALLBACK);
  }

  function strmBuild() {
    if (strm.cv) return;
    const cv = document.createElement('canvas');
    cv.id = 'streamArt';
    cv.className = 'stream-art';
    cv.setAttribute('aria-hidden', 'true');
    const bg = document.getElementById('bgCanvas');
    document.body.insertBefore(cv, bg ? bg.nextSibling : document.body.firstChild);
    strm.cv = cv;
    strm.ctx = cv.getContext('2d');
  }

  function strmLayout(force) {
    const W = window.innerWidth, H = window.innerHeight;
    if (!force && W === strm.W && H === strm.H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    strm.W = W; strm.H = H;
    strm.cv.width = W * dpr; strm.cv.height = H * dpr;
    strm.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W >= 900;
    strm.hole = {
      x: wide ? Math.min(W - 160, W / 2 + 320 + (W / 2 - 320) * 0.35) : W * 0.72,
      y: wide ? H * 0.46 : H * 0.24,
      rx: wide ? 46 : 30, ry: wide ? 30 : 20, tilt: -0.32
    };
    strm.words = wordsFromStream();
    const N = wide ? 46 : 26;
    strm.lanes = Array.from({ length: N }, (_, i) => {
      // lanes start along the right edge and the top/bottom on the right half
      const k = i / (N - 1);
      const sx = W * (1.02 + rnd(0, 0.15)), sy = -H * 0.35 + k * H * 1.7 + rnd(-20, 20);
      return { sx, sy, swirl: rnd(0.35, 0.6), speed: rnd(0.018, 0.04), off: Math.random(), w0: Math.floor(Math.random() * 400), size: rnd(11, 16) };
    });
    strm.stars = Array.from({ length: Math.round(W * H / 9000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < 0.85 ? 0.7 : 1.3, ph: rnd(0, 6.28), sp: rnd(0.3, 1.2) }));
    strm.flares = [{ x: W * (wide ? 0.18 : 0.15), y: H * 0.1, s: 26 }, { x: strm.hole.x - W * 0.12, y: H * 0.36, s: 18 }];
  }

  function bez(s, a, c, b) {
    const m = 1 - s;
    return [m * m * a[0] + 2 * m * s * c[0] + s * s * b[0], m * m * a[1] + 2 * m * s * c[1] + s * s * b[1]];
  }

  function strmDraw(now) {
    const { ctx, W, H, hole } = strm;
    const t = reduce ? 0 : now / 1000;
    const dark = isDark();
    ctx.clearRect(0, 0, W, H);
    const k = W >= 900 ? 1 : 0.6;                      // dimmer where text sits on top of it

    // stars and two soft flares
    for (const s of strm.stars) {
      const a = 0.12 + 0.35 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = 'rgba(255,255,255,' + (a * k).toFixed(3) + ')';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    for (const f of strm.flares) {
      const a = (0.25 + 0.1 * Math.sin(t * 0.7 + f.x)) * k;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.s);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(f.x - f.s, f.y - f.s, f.s * 2, f.s * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.9).toFixed(3) + ')';
      ctx.fillRect(f.x - f.s * 1.6, f.y - 0.5, f.s * 3.2, 1);
      ctx.fillRect(f.x - 0.5, f.y - f.s * 1.6, 1, f.s * 3.2);
    }

    // text lanes flowing into the hole
    const B = [hole.x, hole.y];
    ctx.textBaseline = 'middle';
    for (const ln of strm.lanes) {
      const A = [ln.sx, ln.sy];
      const vx = A[0] - B[0], vy = A[1] - B[1];
      const ang = ln.swirl, ca = Math.cos(ang), sa = Math.sin(ang);
      const C = [B[0] + (vx * ca - vy * sa) * 0.55, B[1] + (vx * sa + vy * ca) * 0.55];
      let s = (ln.off + t * ln.speed) % 1;
      let wi = ln.w0 + Math.floor(t * ln.speed * 6);
      // walk from the far end toward the hole, one word at a time
      for (let step = 0; step < 40 && s < 0.985; step++) {
        const p = bez(s, A, C, B), q = bez(Math.min(1, s + 0.004), A, C, B);
        const size = Math.max(2.5, ln.size * Math.pow(1 - s, 0.85));
        const word = strm.words[wi % strm.words.length];
        const near = Math.hypot(p[0] - B[0], p[1] - B[1]);
        let a = Math.min(1, s * 6) * (1 - Math.pow(s, 4)) * (0.35 + 0.65 * Math.min(1, near / 260));
        a *= k * (0.55 + 0.45 * noise(s * 9 + wi, t * 0.3));
        if (a > 0.02 && p[0] > -40 && p[0] < W + 40 && p[1] > -40 && p[1] < H + 40) {
          ctx.save();
          ctx.translate(p[0], p[1]);
          ctx.rotate(Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI);
          ctx.font = '500 ' + size.toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = 'rgba(' + TEXT_RGB[0] + ',' + TEXT_RGB[1] + ',' + TEXT_RGB[2] + ',' + a.toFixed(3) + ')';
          ctx.fillText(word, 0, 0);
          ctx.restore();
        }
        const adv = (ctx.measureText ? (word.length * size * 0.62 + size * 0.7) : 40) / Math.max(120, Math.hypot(vx, vy) * 1.2);
        s += Math.max(0.006, adv * Math.pow(1 - s, -0.15));
        wi++;
      }
    }

    // the hole: pixelated, dark core, orange ring
    const cellPx = W >= 900 ? 6 : 5;
    const reach = hole.rx * 2.6;
    const ct = Math.cos(hole.tilt), st = Math.sin(hole.tilt);
    for (let y = -reach; y <= reach; y += cellPx) {
      for (let x = -reach; x <= reach; x += cellPx) {
        const u = (x * ct + y * st) / hole.rx, v = (-x * st + y * ct) / hole.ry;
        const d = Math.hypot(u, v);
        const flick = 0.85 + 0.15 * noise(Math.atan2(v, u) * 3 + t * 0.8, d * 4);
        if (d < 0.86) {
          ctx.fillStyle = 'rgba(0,0,0,0.96)';
        } else {
          const ring = Math.exp(-Math.pow((d - 1.02) / 0.16, 2));
          const glow = Math.exp(-(d - 1) / 0.55) * 0.5;
          const a = Math.min(1, (ring * 0.95 + glow) * flick) * k;
          if (a < 0.03) continue;
          const hot = Math.min(1, ring * 1.2);
          const r = Math.round(RING_RGB[0] + (255 - RING_RGB[0]) * hot * 0.5), g = Math.round(RING_RGB[1] + (230 - RING_RGB[1]) * hot * 0.5), b = Math.round(RING_RGB[2] + (180 - RING_RGB[2]) * hot * 0.4);
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
        }
        ctx.fillRect(hole.x + x, hole.y + y, cellPx - 0.5, cellPx - 0.5);
      }
    }

    // keep the reading column calm
    if (dark) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      const mid = W >= 900 ? 0.5 : 0.5;
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(Math.max(0, mid - 0.18), 'rgba(0,0,0,0.6)');
      g.addColorStop(Math.min(1, mid + 0.12), 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  function strmLoop(now) {
    if (!strm.running) return;
    if (!document.hidden && now - strm.last > 33) { strm.last = now; strmDraw(now); }
    strm.raf = requestAnimationFrame(strmLoop);
  }
  function strmStart() {
    strmBuild();
    strmLayout(true);
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

  // ── wiring ──
  function sync() {
    if (isOn('projects')) projStart(); else projStop();
    if (isOn('stream') && isDark()) strmStart(); else strmStop();
  }

  function init() {
    projBuild();
    const baseNavigate = window.navigate;
    window.navigate = function (page) { baseNavigate(page); sync(); };
    window.addEventListener('resize', () => {
      if (proj.running || reduce) { proj.W = 0; if (isOn('projects')) projStart(); }
      if (strm.running) strmLayout();
    });
    new MutationObserver(() => { proj.ink = null; sync(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
    // Stream posts arrive after load; refresh the words once they do
    setTimeout(() => { strm.words = wordsFromStream(); }, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.UnwindPageArt = { sync };
})();
