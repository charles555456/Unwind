/*
 * The Unwind astronaut — a dot-matrix character that lives on the Private
 * page and talks about what is happening there.
 *
 * Drawn like the home page sphere: a few thousand points sampled on simple
 * 3D solids, sized and faded by depth, with loose dust around it. On first
 * view the points gather out of a scattered cloud. Motion stays small: a
 * slow sway and float, a glint across the visor, and one full turn when
 * tapped or when you unlock.
 * Inserted by script, so index.html needs no markup for it.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── the figure: a point cloud on simple 3D solids, drawn like the home sphere ──
  const CSS_W = 240, CSS_H = 320;
  const SCALE = 128;                       // px per model unit; the figure is ~2 units tall
  const CX = CSS_W / 2, CY = CSS_H / 2 + 6;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function randDir() {
    const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
    return [r * Math.cos(th), u, r * Math.sin(th)];
  }

  // Solids. y points down, z toward the viewer. p > 2 makes an ellipsoid boxier.
  const ell = (c, r, p, n, tag) => ({ type: 'ell', c, r, p: p || 2, n, tag });
  const cap = (a, b, r, n, tag) => ({ type: 'cap', a, b, r, n, tag });
  const SOLIDS = [
    ell([0, -0.66, 0.02], [0.27, 0.27, 0.27], 2, 900, 'helmet'),
    ell([0, -0.40, 0], [0.21, 0.05, 0.19], 2, 120, 'ring'),
    ell([0, -0.08, 0], [0.31, 0.34, 0.21], 3.2, 900, 'torso'),
    ell([0, -0.10, 0.2], [0.15, 0.1, 0.05], 4, 110, 'chest'),
    ell([0, -0.12, -0.25], [0.29, 0.33, 0.12], 4, 380, 'pack'),
    cap([-0.35, -0.27, 0], [-0.47, 0.03, 0.06], 0.085, 170, 'arm'),
    cap([-0.47, 0.03, 0.06], [-0.40, 0.30, 0.16], 0.078, 150, 'arm'),
    ell([-0.39, 0.37, 0.18], [0.075, 0.085, 0.07], 2, 70, 'glove'),
    cap([0.35, -0.27, 0], [0.53, -0.06, 0.06], 0.085, 170, 'arm'),
    cap([0.53, -0.06, 0.06], [0.60, -0.33, 0.17], 0.078, 150, 'arm'),
    ell([0.61, -0.41, 0.19], [0.075, 0.085, 0.07], 2, 70, 'glove'),
    ell([0, 0.27, 0], [0.27, 0.07, 0.19], 2.6, 120, 'belt'),
    cap([-0.13, 0.30, 0], [-0.17, 0.60, 0.09], 0.11, 230, 'leg'),
    cap([-0.17, 0.60, 0.09], [-0.12, 0.90, 0.0], 0.095, 200, 'leg'),
    ell([-0.12, 0.96, 0.05], [0.1, 0.06, 0.15], 2.8, 110, 'boot'),
    cap([0.13, 0.30, 0], [0.21, 0.56, 0.14], 0.11, 230, 'leg'),
    cap([0.21, 0.56, 0.14], [0.24, 0.84, -0.04], 0.095, 200, 'leg'),
    ell([0.25, 0.90, 0.0], [0.1, 0.06, 0.15], 2.8, 110, 'boot')
  ];

  function inside(sol, q, pad) {
    if (sol.type === 'ell') {
      const x = Math.abs(q[0] - sol.c[0]) / (sol.r[0] - pad), y = Math.abs(q[1] - sol.c[1]) / (sol.r[1] - pad), z = Math.abs(q[2] - sol.c[2]) / (sol.r[2] - pad);
      return x ** sol.p + y ** sol.p + z ** sol.p < 1;
    }
    const ab = [sol.b[0] - sol.a[0], sol.b[1] - sol.a[1], sol.b[2] - sol.a[2]];
    const ap = [q[0] - sol.a[0], q[1] - sol.a[1], q[2] - sol.a[2]];
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return Math.hypot(q[0] - (sol.a[0] + ab[0] * t), q[1] - (sol.a[1] + ab[1] * t), q[2] - (sol.a[2] + ab[2] * t)) < sol.r - pad;
  }

  function sampleSolid(sol) {
    if (sol.type === 'ell') {
      const d = randDir(), e = 2 / sol.p;
      const f = v => Math.sign(v) * Math.abs(v) ** e;
      const local = [f(d[0]), f(d[1]), f(d[2])];
      return { pos: [sol.c[0] + local[0] * sol.r[0], sol.c[1] + local[1] * sol.r[1], sol.c[2] + local[2] * sol.r[2]],
               n: norm([local[0] / sol.r[0], local[1] / sol.r[1], local[2] / sol.r[2]]) };
    }
    const ab = [sol.b[0] - sol.a[0], sol.b[1] - sol.a[1], sol.b[2] - sol.a[2]];
    const axis = norm(ab);
    const ref = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm([axis[1] * ref[2] - axis[2] * ref[1], axis[2] * ref[0] - axis[0] * ref[2], axis[0] * ref[1] - axis[1] * ref[0]]);
    const v = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
    const t = Math.random(), th = rnd(0, Math.PI * 2);
    const n = [u[0] * Math.cos(th) + v[0] * Math.sin(th), u[1] * Math.cos(th) + v[1] * Math.sin(th), u[2] * Math.cos(th) + v[2] * Math.sin(th)];
    return { pos: [sol.a[0] + ab[0] * t + n[0] * sol.r, sol.a[1] + ab[1] * t + n[1] * sol.r, sol.a[2] + ab[2] * t + n[2] * sol.r], n };
  }

  const VISOR_DIR = norm([0.12, 0.08, 1]);
  const POINTS = [];
  SOLIDS.forEach(sol => {
    let made = 0, tries = 0;
    while (made < sol.n && tries++ < sol.n * 8) {
      const s = sampleSolid(sol);
      if (SOLIDS.some(o => o !== sol && inside(o, s.pos, 0.006))) continue;   // hidden inside another part
      let kind = 'suit';
      if (sol.tag === 'helmet') {
        const d = s.n[0] * VISOR_DIR[0] + s.n[1] * VISOR_DIR[1] + s.n[2] * VISOR_DIR[2];
        if (d > 0.5 && s.n[1] > -0.62 && s.n[1] < 0.55) { kind = 'visor'; if (Math.random() < 0.55) continue; }
      }
      if (sol.tag === 'pack' || sol.tag === 'ring' || sol.tag === 'belt' || sol.tag === 'boot') kind = 'shade';
      if (sol.tag === 'chest') kind = 'shade';
      const big = Math.random();
      POINTS.push({
        p: s.pos, n: s.n, kind,
        sz: big < 0.84 ? rnd(0.7, 1.05) : big < 0.97 ? rnd(1.1, 1.6) : rnd(1.7, 2.2),
        ph: rnd(0, Math.PI * 2),
        from: (() => { const d = randDir(), r = rnd(0.9, 2.2); return [d[0] * r, d[1] * r, d[2] * r]; })(),
        delay: Math.random()
      });
      made++;
    }
  });

  // loose dust around the figure, like the halo on the home page
  const DUST = Array.from({ length: 140 }, () => {
    const d = randDir(), r = rnd(1.05, 1.5);
    return { p: [d[0] * r * 0.62, d[1] * r * 0.95, d[2] * r * 0.5], sz: rnd(0.5, 1.1), ph: rnd(0, Math.PI * 2), sp: rnd(0.3, 0.9) };
  });

  const LIGHT_DIR = norm([-0.55, -0.7, 0.55]);
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const MORPH_MS = 2600;

  // ── what it says ──
  const LINES = {
    locked: ['這裡是 Private。輸入密碼，我幫你開門。', '門鎖著。鑰匙只有你有。'],
    wrong: ['密碼好像不對，再試一次？', '這把鑰匙打不開，換一把看看。'],
    unlocking: ['對一下鑰匙…'],
    lockedAgain: ['鎖好了。下次見。'],
    idleLocked: ['我在外面幫你看門。', '這頁只有你看得到裡面。', '太空很安靜，適合想事情。'],
    idleOpen: ['存起來的文章，記得回來看。', '今天有讀到什麼嗎？', '一次一條就好，慢慢來。', '想到什麼，記一則 Stream。', '電子報可以先封存，不用全看完。']
  };
  function greeting() {
    const h = new Date().getHours();
    const when = h < 5 ? '夜深了' : h < 11 ? '早安' : h < 14 ? '午安' : h < 18 ? '下午好' : '晚安';
    return when + '，歡迎回來。要看稍後閱讀、電子報，還是今天的回顧？';
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // isPrivate and currentPage are top-level `let`s in the main script:
  // visible to this script by name, but not as window properties.
  const unlocked = () => (typeof isPrivate !== 'undefined' && !!isPrivate);
  const onPrivatePage = () => (typeof currentPage !== 'undefined' && currentPage === 'private');

  // ── DOM ──
  let root, canvas, ctx, bubble, textEl;
  let typing = null, current = '';
  let turnFrom = -1, running = false, raf = 0, ink = [242, 242, 242], dpr = 1, styles = [];
  let bornAt = -1;   // first frame on screen; the cloud gathers into the figure from here

  function readInk() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f2f2f2';
    const probe = document.createElement('span');
    probe.style.color = c; probe.style.display = 'none';
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+/g);
    probe.remove();
    if (m) ink = [+m[0], +m[1], +m[2]];
    styles = [];
    for (let i = 0; i <= 20; i++) styles.push('rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + (i / 20).toFixed(2) + ')');
  }

  function say(text, opts) {
    if (!textEl || text === current) return;
    current = text;
    clearInterval(typing);
    bubble.classList.remove('astro-pop');
    void bubble.offsetWidth;            // restart the pop animation
    bubble.classList.add('astro-pop');
    if (reduce) { textEl.textContent = text; return; }
    let i = 0;
    textEl.textContent = '';
    typing = setInterval(() => {
      i++;
      textEl.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typing);
    }, 38);
    if (opts && opts.turn) turn();
  }

  // one slow full turn, to show it is a solid thing
  function turn() { if (!reduce) turnFrom = performance.now(); }

  function build() {
    const page = document.getElementById('page-private');
    if (!page || document.getElementById('astro')) return;
    root = document.createElement('div');
    root.id = 'astro';
    root.className = 'astro';
    root.innerHTML = `
      <button class="astro-figure" type="button" aria-label="和太空人說話">
        <canvas width="${CSS_W}" height="${CSS_H}" aria-hidden="true"></canvas>
      </button>
      <div class="astro-bubble" role="status" aria-live="polite"><span class="astro-text"></span></div>`;
    page.insertBefore(root, page.firstChild);
    canvas = root.querySelector('canvas');
    bubble = root.querySelector('.astro-bubble');
    textEl = root.querySelector('.astro-text');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = CSS_W * dpr; canvas.height = CSS_H * dpr;
    canvas.style.width = CSS_W + 'px'; canvas.style.height = CSS_H + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readInk();

    root.querySelector('.astro-figure').addEventListener('click', () => {
      const open = unlocked();
      let next = pick(open ? LINES.idleOpen : LINES.idleLocked);
      if (next === current) next = pick(open ? LINES.idleOpen : LINES.idleLocked);
      say(next);
      turn();
    });

    // react to the unlock form without touching its code
    const err = document.getElementById('errorMsg');
    if (err) new MutationObserver(() => {
      if (err.classList.contains('visible')) { say(pick(LINES.wrong)); }
    }).observe(err, { attributes: true, attributeFilter: ['class'] });
    const btn = document.getElementById('unlockBtn');
    if (btn) new MutationObserver(() => {
      if (/unlocking/i.test(btn.textContent)) say(LINES.unlocking[0]);
    }).observe(btn, { childList: true, characterData: true, subtree: true });
    new MutationObserver(readInk).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // ── drawing ──
  function draw(now) {
    if (!ctx || !styles.length) return;
    const t = now / 1000;
    ctx.clearRect(0, 0, CSS_W, CSS_H);

    if (bornAt < 0) bornAt = now;
    const gather = reduce ? 1 : Math.min(1, (now - bornAt) / MORPH_MS);

    // slow sway, a full turn when tapped, a gentle float and roll
    let yaw = reduce ? -0.35 : Math.sin(t * 0.32) * 0.42 - 0.18;
    if (turnFrom >= 0) {
      const k = (now - turnFrom) / 2600;
      if (k >= 1) turnFrom = -1; else yaw += ease(k) * Math.PI * 2;
    }
    const pitch = 0.1 + (reduce ? 0 : Math.sin(t * 0.45) * 0.04);
    const roll = reduce ? 0 : Math.sin(t * 0.27) * 0.06;
    const fy = reduce ? 0 : Math.sin(t * 0.55) * 6;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const light = LIGHT_DIR;
    // glint sweeping across the visor every ~7 s
    const cycle = (t % 7) / 7;
    const glint = !reduce && cycle < 0.18 ? cycle / 0.18 : -1;

    function project(q) {
      let x = q[0] * cy + q[2] * sy, z = -q[0] * sy + q[2] * cy, y = q[1];
      const y2 = y * cp - z * sp; z = y * sp + z * cp; y = y2;
      const x2 = x * cr - y * sr; y = x * sr + y * cr; x = x2;
      const f = 1 + 0.22 * z;
      return [CX + x * SCALE * f, CY + fy + y * SCALE * f, z];
    }
    function rot(n) {
      let x = n[0] * cy + n[2] * sy, z = -n[0] * sy + n[2] * cy, y = n[1];
      const y2 = y * cp - z * sp; z = y * sp + z * cp;
      return [x, y2, z];
    }

    // dust
    for (const d of DUST) {
      const q = project(d.p);
      const depth = Math.max(0, Math.min(1, (q[2] + 1) / 2));
      let a = (0.05 + 0.22 * depth) * (reduce ? 1 : 0.6 + 0.4 * Math.sin(t * d.sp + d.ph)) * gather;
      const idx = Math.round(a * 20); if (idx <= 0) continue;
      ctx.fillStyle = styles[idx];
      ctx.fillRect(q[0], q[1], d.sz, d.sz);
    }

    for (const pt of POINTS) {
      const k = gather >= 1 ? 1 : ease(Math.max(0, Math.min(1, (gather - pt.delay * 0.35) / 0.65)));
      const src = k >= 1 ? pt.p : [pt.from[0] + (pt.p[0] - pt.from[0]) * k, pt.from[1] + (pt.p[1] - pt.from[1]) * k, pt.from[2] + (pt.p[2] - pt.from[2]) * k];
      const q = project(src);
      const n = rot(pt.n);
      const depth = Math.max(0, Math.min(1, (q[2] + 0.8) / 1.6));
      const lam = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      const rim = Math.pow(1 - Math.abs(n[2]), 3);          // silhouettes read brighter, like the sphere's edge
      let a;
      if (pt.kind === 'visor') {
        a = 0.12 + 0.18 * depth;
        if (glint >= 0) {
          const band = (pt.n[0] - pt.n[1] * 0.8 + 1.2) / 2.4;    // 0..1 across the visor
          a += 0.75 * Math.max(0, 1 - Math.abs(band - glint) / 0.09);
        }
      } else {
        const base = pt.kind === 'shade' ? 0.55 : 0.92;
        a = 1.3 * base * (0.22 + 0.55 * lam + 0.35 * rim) * (0.25 + 0.75 * depth);
      }
      if (!reduce) a *= 0.88 + 0.12 * Math.sin(t * 2 + pt.ph);
      a *= k < 1 ? 0.4 + 0.6 * k : 1;
      const idx = Math.round(Math.min(1, a) * 20); if (idx <= 0) continue;
      const size = pt.sz * (0.7 + 0.5 * depth);
      ctx.fillStyle = styles[idx];
      ctx.fillRect(q[0], q[1], size, size);
    }
  }

  function loop(now) {
    if (!running) return;
    if (!document.hidden) draw(now);
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (bornAt < 0 && !reduce) bornAt = performance.now();   // gather when first seen, not when built
    if (running || reduce) { if (reduce) draw(performance.now()); return; }
    running = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // ── state from the main script ──
  let wasOpen = null;
  function syncState() {
    if (!root) return;
    const open = unlocked();
    if (open && wasOpen === false) say(greeting(), { turn: true });
    else if (open && wasOpen === null) say(greeting());
    else if (!open && wasOpen === true) say(LINES.lockedAgain[0]);
    else if (!open && wasOpen === null) say(LINES.locked[0]);
    else if (!open && /unlocking|對一下/.test(current)) say(LINES.locked[0]);
    wasOpen = open;
  }

  function init() {
    build();
    if (!root) return;
    syncState();
    if (onPrivatePage()) start();

    const baseNavigate = window.navigate;
    window.navigate = function (page) {
      baseNavigate(page);
      if (page === 'private') { start(); syncState(); } else stop();
    };
    const baseRenderPrivate = window.renderPrivate;
    window.renderPrivate = function () {
      baseRenderPrivate();
      syncState();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.UnwindAstronaut = { say, turn };
})();
