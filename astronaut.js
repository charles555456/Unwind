/*
 * The Unwind astronaut — a dot-matrix character that lives on the Private
 * page and talks about what is happening there.
 *
 * Drawn on a canvas from a grid of dots, in the page's ink colour, with a
 * little motion: a slow zero-gravity float, a glint across the visor, a
 * blinking chest light, twinkling stars, and a wave when you tap it.
 * Inserted by script, so index.html needs no markup for it.
 */
(function () {
  'use strict';

  const GRID_W = 30, GRID_H = 36;     // the character's dot grid
  const STEP = 5;                     // CSS px between dots
  const PAD_X = 14, PAD_Y = 18;       // room to float and for stars
  const CSS_W = GRID_W * STEP + PAD_X * 2;
  const CSS_H = GRID_H * STEP + PAD_Y * 2;
  const ACCENT = [228, 87, 46];       // the site's one accent, #e4572e

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── shapes (grid units) ──
  const HELMET = { cx: 15, cy: 10, r: 8.6 };
  const VISOR = { cx: 15.6, cy: 10.6, rx: 6.2, ry: 4.7 };
  const TORSO = { x0: 8.5, x1: 21.5, y0: 19, y1: 28.5, r: 2.2 };
  const PANEL = { x0: 12, x1: 18, y0: 21, y1: 24.6 };
  const LIGHT = { x: 16.6, y: 22.2 };
  const LEFT_ARM = [[8.4, 20.5], [5.2, 27.2], 1.9];
  const LEGS = [[[12.4, 29], [12, 33.2], 2.1], [[17.6, 29], [18, 33.2], 2.1]];
  const BOOTS = [{ cx: 11.6, cy: 34.4, rx: 2.8, ry: 1.3 }, { cx: 18.4, cy: 34.4, rx: 2.8, ry: 1.3 }];

  const inEllipse = (x, y, e) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;
  const inCircle = (x, y, c) => (x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r * c.r;
  function inRoundRect(x, y, b) {
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
    const dx = Math.max(b.x0 + b.r - x, 0, x - (b.x1 - b.r));
    const dy = Math.max(b.y0 + b.r - y, 0, y - (b.y1 - b.r));
    return dx * dx + dy * dy <= b.r * b.r;
  }
  function segDist(x, y, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - (a[0] + vx * t), y - (a[1] + vy * t));
  }
  const inCapsule = (x, y, cap) => segDist(x, y, cap[0], cap[1]) <= cap[2];

  // brighter toward the upper left, like the home sphere
  function lit(x, y, cx, cy, r) {
    const n = (-(x - cx) * 0.55 - (y - cy) * 0.8) / r;
    return Math.max(0.55, Math.min(1.15, 0.85 + n * 0.35));
  }

  // Every static dot, computed once. kind: suit | shade | visor | panel | light
  const BASE = [];
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const x = gx + 0.5, y = gy + 0.5;
      let kind = null, tone = 0;
      if (inEllipse(x, y, VISOR)) { kind = 'visor'; tone = 0.16; }
      else if (inCircle(x, y, HELMET)) { kind = 'suit'; tone = 0.92 * lit(x, y, HELMET.cx, HELMET.cy, HELMET.r); }
      else if (y >= 18 && y <= 19.6 && x >= 9.5 && x <= 20.5) { kind = 'shade'; tone = 0.5; }   // neck ring
      else if (Math.hypot(x - LIGHT.x, y - LIGHT.y) <= 0.75) { kind = 'light'; tone = 1; }
      else if (x >= PANEL.x0 && x <= PANEL.x1 && y >= PANEL.y0 && y <= PANEL.y1) { kind = 'panel'; tone = 0.42; }
      else if (inRoundRect(x, y, TORSO)) { kind = 'suit'; tone = (y > 27.6 ? 0.5 : 0.88) * lit(x, y, 15, 23, 7); }
      else if (inCapsule(x, y, LEFT_ARM) || Math.hypot(x - 5, y - 27.8) <= 1.9) { kind = 'suit'; tone = 0.8 * lit(x, y, 6, 24, 5); }
      else if (LEGS.some(l => inCapsule(x, y, l))) { kind = 'suit'; tone = 0.78 * lit(x, y, 15, 31, 5); }
      else if (BOOTS.some(b => inEllipse(x, y, b))) { kind = 'shade'; tone = 0.55; }
      else if ((x >= 6 && x < 8.6 || x > 21.4 && x <= 24) && y >= 19.5 && y <= 27.5) { kind = 'shade'; tone = 0.38; } // backpack
      if (kind) BASE.push({ x, y, kind, tone, ph: Math.random() * Math.PI * 2 });
    }
  }
  const OCCUPIED = new Set(BASE.map(d => (d.x | 0) + ',' + (d.y | 0)));

  // right arm: shoulder fixed, hand swings between resting and waving
  function rightArmDots(angle) {
    const sh = [21.6, 20.5], len = 7.2;
    const hand = [sh[0] + Math.sin(angle) * len, sh[1] + Math.cos(angle) * len];
    const cap = [sh, hand, 1.9];
    const out = [];
    for (let gy = 8; gy < GRID_H; gy++) {
      for (let gx = 17; gx < GRID_W; gx++) {
        const x = gx + 0.5, y = gy + 0.5;
        if (OCCUPIED.has(gx + ',' + gy) && !(x > 21.4)) continue;
        if (inCapsule(x, y, cap) || Math.hypot(x - hand[0], y - hand[1]) <= 1.9) {
          out.push({ x, y, kind: 'suit', tone: 0.82 * lit(x, y, 23, 22, 6), ph: (gx * 7 + gy * 13) % 6 });
        }
      }
    }
    return out;
  }

  const STARS = Array.from({ length: 22 }, () => {
    let x, y;
    do { x = Math.random() * CSS_W; y = Math.random() * CSS_H; }
    while (x > PAD_X - 4 && x < PAD_X + GRID_W * STEP + 4 && y > PAD_Y - 4 && y < PAD_Y + GRID_H * STEP + 4 && Math.random() < 0.85);
    return { x, y, r: Math.random() < 0.8 ? 0.6 : 1.1, ph: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 1.4 };
  });

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
  let waveUntil = 0, running = false, raf = 0, ink = [242, 242, 242], dpr = 1;

  function readInk() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f2f2f2';
    const probe = document.createElement('span');
    probe.style.color = c; probe.style.display = 'none';
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+/g);
    probe.remove();
    if (m) ink = [+m[0], +m[1], +m[2]];
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
    if (opts && opts.wave) wave();
  }

  function wave(ms) { waveUntil = performance.now() + (ms || 2200); }

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
      wave();
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

    draw(performance.now());
  }

  // ── drawing ──
  function dot(x, y, r, a, rgb) {
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }

  function draw(now) {
    if (!ctx) return;
    const t = now / 1000;
    ctx.clearRect(0, 0, CSS_W, CSS_H);

    // stars
    for (const s of STARS) {
      const a = reduce ? 0.35 : 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      dot(s.x, s.y, s.r, a, ink);
    }

    // zero-gravity float
    const fy = reduce ? 0 : Math.sin(t * 0.9) * 4;
    const fx = reduce ? 0 : Math.sin(t * 0.43) * 2;
    const rot = reduce ? 0 : Math.sin(t * 0.6) * 0.045;
    const ox = PAD_X + fx, oy = PAD_Y + fy;
    const pivotX = ox + 15 * STEP, pivotY = oy + 20 * STEP;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(rot);
    ctx.translate(-pivotX, -pivotY);

    // arm angle: resting, or waving while waveUntil is ahead
    const waving = !reduce && now < waveUntil;
    const rest = 0.42;
    const angle = waving ? 2.55 + Math.sin(now / 1000 * 9) * 0.38 : rest;

    // glint across the visor every ~6 s
    const cycle = (t % 6) / 6;
    const glint = !reduce && cycle < 0.22 ? (cycle / 0.22) * 18 - 4 : -100;
    const lightOn = reduce ? 0.85 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.4));

    const all = BASE.concat(rightArmDots(angle));
    for (const d of all) {
      const px = ox + d.x * STEP, py = oy + d.y * STEP;
      let a = d.tone, rgb = ink, r;
      if (d.kind === 'light') {
        rgb = ACCENT; a = lightOn; r = 1.9;
      } else if (d.kind === 'visor') {
        const band = (d.x - VISOR.cx + 6) - (d.y - VISOR.cy) * 0.7;
        const g = Math.max(0, 1 - Math.abs(band - glint) / 1.4);
        a = 0.14 + g * 0.8;
        // a fixed little reflection, upper left of the visor
        if (Math.hypot(d.x - 12.6, d.y - 8.6) < 1.3) a = Math.max(a, 0.75);
        r = 0.9 + g * 0.8;
      } else {
        const shimmer = reduce ? 1 : 0.9 + 0.1 * Math.sin(t * 2.2 + d.ph);
        a = Math.min(1, d.tone * shimmer);
        r = 0.7 + a * 1.25;
      }
      dot(px, py, r, a, rgb);
    }
    ctx.restore();
  }

  function loop(now) {
    if (!running) return;
    if (!document.hidden) draw(now);
    raf = requestAnimationFrame(loop);
  }
  function start() {
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
    if (open && wasOpen === false) say(greeting(), { wave: true });
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

  window.UnwindAstronaut = { say, wave };
})();
