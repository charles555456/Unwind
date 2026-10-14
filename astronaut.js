/*
 * The Unwind astronaut on the Private page.
 *
 * Bruce McCandless on the first untethered spacewalk, 1984 (NASA photo
 * S84-27017, public domain), turned into points and drawn the way the home
 * sphere is drawn. Its right edge slowly sheds points that drift away;
 * tapping it, or unlocking, pulls them home for a moment. A single quiet
 * line beside it reacts to the unlock form.
 */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SRC = 'art/astronaut.bin';

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
  let root, canvas, lineEl, scene = null, current = '', swap = 0;

  function say(text, opts) {
    if (!lineEl || text === current) return;
    current = text;
    clearTimeout(swap);
    if (reduce) { lineEl.textContent = text; }
    else {
      lineEl.classList.add('is-out');
      swap = setTimeout(() => { lineEl.textContent = text; lineEl.classList.remove('is-out'); }, 220);
    }
    if (opts && opts.turn) turn();
  }

  // pull the drifting points home for a moment
  function turn() { if (scene) scene.hold(); }

  function size() {
    const avail = root.clientWidth || 360;
    const narrow = avail < 560;
    const w = Math.min(360, narrow ? avail : 360);
    const figW = Math.round(w * 0.66);                    // room on the right for the drift
    const figH = Math.round(figW * 551 / 560);
    return { w, h: figH + 24, box: { x: 6, y: 12, w: figW, h: figH } };
  }

  function build() {
    const page = document.getElementById('page-private');
    if (!page || document.getElementById('astro')) return;
    root = document.createElement('div');
    root.id = 'astro';
    root.className = 'astro';
    root.innerHTML = `
      <button class="astro-figure" type="button" aria-label="太空人。點一下換一句話">
        <canvas aria-hidden="true"></canvas>
      </button>
      <p class="astro-line" role="status" aria-live="polite"></p>`;
    page.insertBefore(root, page.firstChild);
    canvas = root.querySelector('canvas');
    lineEl = root.querySelector('.astro-line');

    root.querySelector('.astro-figure').addEventListener('click', () => {
      const pool = unlocked() ? LINES.idleOpen : LINES.idleLocked;
      let next = pick(pool);
      if (next === current) next = pick(pool);
      say(next);
      turn();
    });

    const err = document.getElementById('errorMsg');
    if (err) new MutationObserver(() => {
      if (err.classList.contains('visible')) say(pick(LINES.wrong));
    }).observe(err, { attributes: true, attributeFilter: ['class'] });
    const btn = document.getElementById('unlockBtn');
    if (btn) new MutationObserver(() => {
      if (/unlocking/i.test(btn.textContent)) say(LINES.unlocking[0]);
    }).observe(btn, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => { if (scene) scene.reink(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => {
      if (!scene) return;
      const s = size();
      if (s.w !== scene.size[0]) { scene.resize(s.w, s.h); layout = s; }
    });
  }

  let layout = null, loading = null;
  function ensureScene() {
    if (scene || loading || !window.UnwindPoints) return loading;
    loading = UnwindPoints.load(SRC).then(data => {
      layout = size();
      scene = UnwindPoints.scene(canvas, data, {
        box: () => layout.box,
        size: [0.65, 1.7],
        peel: { edge: 0.6, spread: 0.14, share: 0.55, reach: 0.52, lift: 0.1, speed: 0.055 }
      });
      scene.resize(layout.w, layout.h);
      if (onPrivatePage()) scene.start();
    }).catch(() => { root.querySelector('.astro-figure').hidden = true; });
    return loading;
  }

  function start() { if (scene) scene.start(); else ensureScene(); }
  function stop() { if (scene) scene.stop(); }

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
