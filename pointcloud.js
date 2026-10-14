/*
 * Shared point renderer for Unwind's page art.
 *
 * Images are stored as point files (art/*.bin, made from photographs) and
 * drawn the way the home sphere is drawn: small square points in the page's
 * ink, sized and faded by brightness. On first view they gather out of a
 * scattered cloud. Optionally, points past an edge peel away and drift off.
 *
 *   UnwindPoints.load('art/hands.bin') -> Promise<data>
 *   const scene = UnwindPoints.scene(canvas, data, options)
 *   scene.start(); scene.stop(); scene.hold(); scene.resize(cssW, cssH)
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cache = {};

  function parse(buf) {
    const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'UPTS') throw new Error('not a point file');
    const w = dv.getUint16(4, true), h = dv.getUint16(6, true), n = dv.getUint32(8, true);
    const x = new Float32Array(n), y = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0, o = 12; i < n; i++, o += 5) {
      x[i] = dv.getUint16(o, true) / 65535;
      y[i] = dv.getUint16(o + 2, true) / 65535;
      b[i] = dv.getUint8(o + 4) / 255;
    }
    return { w, h, n, x, y, b };
  }

  function load(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(r => {
        if (!r.ok) throw new Error(url + ' responded ' + r.status);
        return r.arrayBuffer();
      }).then(parse);
    }
    return cache[url];
  }

  function readInk() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f2f2f2';
    const probe = document.createElement('span');
    probe.style.color = c; probe.style.display = 'none';
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+/g);
    probe.remove();
    return m ? [+m[0], +m[1], +m[2]] : [242, 242, 242];
  }

  const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fract = v => v - Math.floor(v);

  /*
   * options
   *   box       { x, y, w, h } in CSS px where the image is drawn (aspect kept by caller)
   *   size      [min, max] point size in CSS px across brightness (default [0.7, 1.9])
   *   gatherMs  first-view gather duration (default 2400)
   *   peel      { edge, spread, share, reach, lift, speed } — points past `edge`
   *             (0..1 across the box) peel off rightward; omit for none
   *   after     (ctx, t, box, ink) => void, drawn on top each frame
   *   feather   0..0.5 — fade points toward the left and right edges of the box,
   *             for images that were cropped through the subject (default 0)
   *   fps       frame cap (default 30)
   */
  function scene(canvas, data, options) {
    const o = Object.assign({ size: [0.7, 1.9], gatherMs: 2400, fps: 30, feather: 0 }, options || {});
    const ctx = canvas.getContext('2d');
    const n = data.n;
    const rnd = new Float32Array(n * 5);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    // scattered start positions, in box units, from a loose ring around the image
    const sx = new Float32Array(n), sy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rnd[i * 5] * Math.PI * 2, r = 0.55 + rnd[i * 5 + 1] * 0.75;
      sx[i] = 0.5 + Math.cos(a) * r; sy[i] = 0.5 + Math.sin(a) * r * 0.8;
    }

    let cssW = 0, cssH = 0, ink = readInk(), styles = [];
    let running = false, raf = 0, last = 0, bornAt = -1, holdFrom = -1;

    function buildStyles() {
      styles = [];
      for (let i = 0; i <= 24; i++) styles.push('rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + (i / 24).toFixed(3) + ')');
    }
    buildStyles();

    function resize(w, h) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = w; cssH = h;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 0 = shedding as usual, 1 = whole (after a tap, for a few seconds)
    function wholeness(now) {
      if (holdFrom < 0) return 0;
      const k = (now - holdFrom) / 4200;
      if (k >= 1) { holdFrom = -1; return 0; }
      if (k < 0.2) return easeInOut(k / 0.2);
      if (k < 0.55) return 1;
      return 1 - easeInOut((k - 0.55) / 0.45);
    }

    function draw(now) {
      const box = typeof o.box === 'function' ? o.box(cssW, cssH) : o.box;
      ctx.clearRect(0, 0, cssW, cssH);
      if (bornAt < 0) bornAt = now;
      const t = now / 1000;
      const g = reduce ? 1 : Math.min(1, (now - bornAt) / o.gatherMs);
      const settle = reduce ? 1 : Math.min(1, Math.max(0, ((now - bornAt) - o.gatherMs) / 1600));
      const peel = o.peel && !reduce ? settle * (1 - wholeness(now)) : 0;
      const [s0, s1] = o.size;
      const floatY = reduce ? 0 : Math.sin(t * 0.5) * 2;

      for (let i = 0; i < n; i++) {
        const r = i * 5;
        // gather: each point leaves the cloud a little later than the last
        const k = g >= 1 ? 1 : easeOutExpo(Math.max(0, Math.min(1, (g - rnd[r + 2] * 0.35) / 0.65)));
        let u = data.x[i], v = data.y[i];
        if (k < 1) { u = sx[i] + (u - sx[i]) * k; v = sy[i] + (v - sy[i]) * k; }
        let a = 0.22 + 0.78 * data.b[i];
        if (k < 1) a *= 0.35 + 0.65 * k;
        if (o.feather > 0) {
          const e = Math.min(data.x[i], 1 - data.x[i]) / o.feather;
          if (e < 1) a *= e * e * (3 - 2 * e);
        }

        if (peel > 0) {
          const p = o.peel;
          const edge = p.edge + (rnd[r + 3] - 0.5) * p.spread + Math.sin(v * 9 + t * 0.4) * 0.02;
          if (u > edge && rnd[r + 4] < p.share) {
            const life = fract(t * p.speed * (0.6 + rnd[r + 1] * 0.8) + rnd[r]);
            const reach = p.reach * (0.4 + rnd[r + 2] * 0.6) * peel;
            u += Math.pow(life, 1.6) * reach;
            v -= life * p.lift * (rnd[r + 3] - 0.3) * peel;
            a *= 1 - Math.pow(life, 0.8) * peel;
          }
        }
        const idx = Math.round(Math.min(1, a) * 24);
        if (idx <= 0) continue;
        const sz = s0 + (s1 - s0) * data.b[i];
        ctx.fillStyle = styles[idx];
        ctx.fillRect(box.x + u * box.w, box.y + v * box.h + floatY, sz, sz);
      }
      if (o.after) o.after(ctx, t, box, ink, g);
    }

    function loop(now) {
      if (!running) return;
      if (!document.hidden && now - last >= 1000 / o.fps - 1) { last = now; draw(now); }
      raf = requestAnimationFrame(loop);
    }

    return {
      resize,
      draw: () => draw(performance.now()),
      start() {
        if (bornAt < 0 && !reduce) bornAt = performance.now();
        if (reduce) { draw(performance.now()); return; }
        if (running) return;
        running = true;
        raf = requestAnimationFrame(loop);
      },
      stop() { running = false; cancelAnimationFrame(raf); },
      hold() { if (!reduce) holdFrom = performance.now(); },
      reink() { ink = readInk(); buildStyles(); if (!running) draw(performance.now()); },
      get size() { return [cssW, cssH]; }
    };
  }

  window.UnwindPoints = { load, scene, readInk, reduce };
})();
