/*
 * The Unwind astronaut — a dot-matrix character that lives on the Private
 * page and talks about what is happening there.
 *
 * Drawn like the home page sphere: a few thousand points sampled on simple
 * 3D solids, seen side-on and lit from the upper left. The far side keeps
 * coming apart into square fragments that drift right and fade into a faint
 * mosaic. On first view the points gather out of a scattered cloud; tapping
 * it, or unlocking, pulls the fragments home for a moment before they let
 * go again.
 * Inserted by script, so index.html needs no markup for it.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── the figure: a point cloud on simple 3D solids, seen side-on ──
  // The lit side reads as small blocky strokes; the far side breaks into
  // square fragments that drift off to the right and fade.
  const CSS_W = 280, CSS_H = 380;
  const SCALE = 205;                       // px per model unit
  const CX = 112, CY = 214;                // where the model origin lands on the canvas
  const PIX = 3;                           // fragment grid, px

  const rnd = (a, b) => a + Math.random() * (b - a);
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function randDir() {
    const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
    return [r * Math.cos(th), u, r * Math.sin(th)];
  }

  // Solids. y points down, z toward the viewer before the turn. p > 2 is boxier.
  const ell = (c, r, p, n, tag) => ({ type: 'ell', c, r, p: p || 2, n, tag });
  const cap = (a, b, r, n, tag) => ({ type: 'cap', a, b, r, n, tag });
  const SOLIDS = [
    ell([0, -0.66, 0.02], [0.27, 0.27, 0.27], 2, 1500, 'helmet'),
    ell([0, -0.40, 0], [0.22, 0.055, 0.2], 2, 220, 'ring'),
    ell([0, -0.08, 0], [0.31, 0.34, 0.21], 3.2, 1500, 'torso'),
    ell([0, -0.10, 0.2], [0.15, 0.1, 0.05], 4, 220, 'chest'),
    ell([0, -0.12, -0.25], [0.29, 0.33, 0.12], 4, 600, 'pack'),
    cap([-0.35, -0.27, 0], [-0.43, 0.04, 0.05], 0.088, 380, 'arm'),
    cap([-0.43, 0.04, 0.05], [-0.40, 0.31, 0.13], 0.08, 340, 'arm'),
    ell([-0.39, 0.38, 0.15], [0.078, 0.09, 0.07], 2, 140, 'glove'),
    cap([0.35, -0.27, 0], [0.43, 0.04, 0.04], 0.088, 380, 'arm'),
    cap([0.43, 0.04, 0.04], [0.41, 0.30, 0.12], 0.08, 340, 'arm'),
    ell([0.40, 0.37, 0.14], [0.078, 0.09, 0.07], 2, 140, 'glove'),
    ell([0, 0.27, 0], [0.28, 0.07, 0.2], 2.6, 220, 'belt'),
    cap([-0.13, 0.30, 0], [-0.15, 0.62, 0.05], 0.115, 360, 'leg'),
    cap([0.13, 0.30, 0], [0.16, 0.62, 0.06], 0.115, 360, 'leg')
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

  // A few fragments carry a trace of colour, as in a dissolving photograph.
  const TINTS = [[120, 176, 196], [178, 82, 70]];
  const VISOR_DIR = norm([0.12, 0.06, 1]);
  const POINTS = [];
  SOLIDS.forEach(sol => {
    let made = 0, tries = 0;
    while (made < sol.n && tries++ < sol.n * 8) {
      const s = sampleSolid(sol);
      if (SOLIDS.some(o => o !== sol && inside(o, s.pos, 0.006))) continue;   // hidden inside another part
      let kind = 'suit';
      if (sol.tag === 'helmet') {
        const d = s.n[0] * VISOR_DIR[0] + s.n[1] * VISOR_DIR[1] + s.n[2] * VISOR_DIR[2];
        const inVisor = d > 0.42 && s.n[1] > -0.66 && s.n[1] < 0.6;
        if (inVisor) kind = 'visor';
        else if (d > 0.3 && s.n[1] > -0.78 && s.n[1] < 0.72) kind = 'frame';      // the visor's rim
      }
      if (sol.tag === 'pack' || sol.tag === 'ring' || sol.tag === 'belt' || sol.tag === 'chest') kind = 'shade';
      const r = Math.random(), r2 = Math.random();
      POINTS.push({
        p: s.pos, n: s.n, kind,
        sz: r < 0.75 ? rnd(1.1, 1.8) : r < 0.95 ? rnd(1.9, 2.8) : rnd(3, 4),
        ph: rnd(0, Math.PI * 2),
        sp: rnd(0.05, 0.16),               // fragment drift speed
        reach: rnd(30, 170),               // how far a fragment travels
        lift: rnd(-14, 8),
        fsz: PIX * (r2 < 0.6 ? 1 : r2 < 0.9 ? 2 : 3),
        tint: Math.random() < 0.06 ? TINTS[Math.random() < 0.65 ? 0 : 1] : null,
        cut: Math.random(),                // where along the edge this point lets go
        from: (() => { const d = randDir(), rr = rnd(0.9, 2.2); return [d[0] * rr, d[1] * rr, d[2] * rr]; })(),
        delay: Math.random()
      });
      made++;
    }
  });

  // a faint mosaic hanging to the right, where the fragments end up
  const MOSAIC = Array.from({ length: 260 }, () => {
    const x = CX + 30 + Math.pow(Math.random(), 0.8) * (CSS_W - CX - 26);
    const r = Math.random();
    return {
      x: Math.round(x / (PIX * 2)) * PIX * 2, y: Math.round(rnd(20, CSS_H - 20) / (PIX * 2)) * PIX * 2,
      s: PIX * (r < 0.55 ? 1 : r < 0.88 ? 2 : 3), ph: rnd(0, Math.PI * 2), sp: rnd(0.2, 0.8),
      a: rnd(0.04, 0.16) * (1 - (x - CX) / (CSS_W - CX) * 0.6),
      tint: Math.random() < 0.08 ? TINTS[Math.random() < 0.6 ? 0 : 1] : null
    };
  });

  const LIGHT_DIR = norm([-0.62, -0.62, 0.48]);   // from the upper left, slightly in front
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fract = x => x - Math.floor(x);
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

  // pull the fragments home for a moment, then let them go again
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
  const rgbaCache = {};
  function rgba(c, a) {
    const i = Math.round(Math.min(1, a) * 20);
    if (i <= 0) return null;
    const k = c[0] + ',' + c[1] + ',' + c[2] + ',' + i;
    return rgbaCache[k] || (rgbaCache[k] = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (i / 20).toFixed(2) + ')');
  }

  // how whole the figure is: 0 dissolving as usual, 1 fully assembled
  function wholeness(now) {
    if (turnFrom < 0) return 0;
    const k = (now - turnFrom) / 4200;
    if (k >= 1) { turnFrom = -1; return 0; }
    if (k < 0.2) return ease(k / 0.2);          // fragments fly home
    if (k < 0.55) return 1;                     // hold
    return 1 - ease((k - 0.55) / 0.45);         // let go again
  }

  function draw(now) {
    if (!ctx || !styles.length) return;
    const t = now / 1000;
    ctx.clearRect(0, 0, CSS_W, CSS_H);

    if (bornAt < 0) bornAt = now;
    const gather = reduce ? 1 : Math.min(1, (now - bornAt) / MORPH_MS);
    // the dissolve eases in after the figure has gathered
    const settle = reduce ? 1 : smooth(0.75, 1, (now - bornAt) / (MORPH_MS + 1400));
    const whole = reduce ? 0 : wholeness(now);
    const loosen = settle * (1 - whole);

    const yaw = 0.78 + (reduce ? 0 : Math.sin(t * 0.25) * 0.07);
    const pitch = 0.08 + (reduce ? 0 : Math.sin(t * 0.4) * 0.025);
    const fy = reduce ? 0 : Math.sin(t * 0.5) * 4;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const L = LIGHT_DIR;

    // the edge where the suit lets go, wavering down its length
    const edge = y => CX + 40 + Math.sin(y * 0.045 + t * 0.6) * 10 + Math.sin(y * 0.12 - t * 1.1) * 5 + Math.sin(y * 0.021 + t * 0.27) * 9;

    // faint mosaic
    for (const m of MOSAIC) {
      const a = m.a * loosen * (reduce ? 1 : 0.55 + 0.45 * Math.sin(t * m.sp + m.ph)) * smooth(CSS_W - 2, CSS_W - 56, m.x);
      const st = rgba(m.tint || ink, m.tint ? a * 0.8 : a);
      if (!st) continue;
      ctx.fillStyle = st;
      ctx.fillRect(m.x, m.y, m.s, m.s);
    }

    for (const pt of POINTS) {
      const k = gather >= 1 ? 1 : ease(Math.max(0, Math.min(1, (gather - pt.delay * 0.35) / 0.65)));
      const src = k >= 1 ? pt.p : [pt.from[0] + (pt.p[0] - pt.from[0]) * k, pt.from[1] + (pt.p[1] - pt.from[1]) * k, pt.from[2] + (pt.p[2] - pt.from[2]) * k];
      let x = src[0] * cyw + src[2] * syw, z = -src[0] * syw + src[2] * cyw, y = src[1];
      const y2 = y * cp - z * sp; z = y * sp + z * cp; y = y2;
      const f = 1 + 0.2 * z;
      let px = CX + x * SCALE * f, py = CY + fy + y * SCALE * f;
      if (py < -10 || py > CSS_H + 10) continue;

      const nx = pt.n[0] * cyw + pt.n[2] * syw, nz0 = -pt.n[0] * syw + pt.n[2] * cyw, ny = pt.n[1] * cp - nz0 * sp, nz = pt.n[1] * sp + nz0 * cp;
      if (nz < 0.04) continue;                     // no depth buffer: only surfaces facing us are drawn
      const depth = Math.max(0, Math.min(1, (z + 0.6) / 1.2));
      const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const rim = Math.pow(1 - Math.abs(nz), 3);

      let a;
      if (pt.kind === 'visor') {
        a = 0.05 + 0.08 * depth;
        const refl = Math.max(0, 1 - Math.abs((pt.n[0] * 0.8 - pt.n[1]) - 0.55) / 0.12);   // one curved reflection
        a += refl * 0.45 * depth;
      } else if (pt.kind === 'frame') {
        a = (0.35 + 0.6 * lam + 0.4 * rim) * (0.3 + 0.7 * depth);
      } else {
        const base = pt.kind === 'shade' ? 0.6 : 1;
        a = 1.2 * base * (0.12 + 0.75 * lam + 0.25 * rim) * (0.3 + 0.7 * depth);
      }
      if (!reduce) a *= 0.9 + 0.1 * Math.sin(t * 1.7 + pt.ph);
      if (k < 1) a *= 0.4 + 0.6 * k;

      // dissolve: how far past the edge this point sits
      const past = (px - edge(py)) / 60;                                  // ~0 at the edge, 1 a body-width past it
      const go = loosen * smooth(-0.25, 0.35, past + (pt.cut - 0.5) * 0.5);
      if (go > 0.02) {
        const life = reduce ? 0.5 : fract(t * pt.sp + pt.ph / 6.2832);
        const travel = Math.pow(life, 1.25) * pt.reach * go;
        const fx = px + travel;
        const fyy = py + pt.lift * life * go + Math.sin(pt.ph * 3 + t * 0.6) * 3 * life;
        const qx = Math.round(fx / PIX) * PIX, qy = Math.round(fyy / PIX) * PIX;
        const edgeFade = smooth(CSS_W - 2, CSS_W - 56, qx) * smooth(2, 26, qy) * smooth(CSS_H - 2, CSS_H - 26, qy);
        const fa = Math.max(a, 0.25) * Math.pow(1 - life, 1.3) * go * edgeFade;
        const st = rgba(pt.tint || ink, pt.tint ? fa * 0.9 : fa);
        if (st && qx < CSS_W) { ctx.fillStyle = st; ctx.fillRect(qx, qy, pt.fsz, pt.fsz); }
        a *= 1 - go;                                                      // the solid fades as it lets go
      }

      const st = rgba(ink, a);
      if (!st) continue;
      ctx.fillStyle = st;
      const w = pt.sz * (0.75 + 0.45 * depth);
      ctx.fillRect(px, py, w * 1.35, w);                                  // short, wide strokes
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
