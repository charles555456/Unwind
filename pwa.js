/*
 * Unwind as a home-screen app: registers the service worker and runs the
 * 「手機通知」 row on the Review page.
 *
 * Loaded after extras.js. Leans on the main script's globals:
 *   sb, storedPassword, isPrivate, currentPage, navigate, renderPrivate
 */
(function () {
  'use strict';

  // Public half of the push key pair. The private half is a GitHub secret.
  const VAPID_PUBLIC_KEY = 'BO_QOl_W-8K6msoGOdaHXOIQ8aK0PbxEcSBOCv8BHRCRFSngo9sqkbXKvNmhpl-O6J4zoXotagA-6LDOl4VJG7U';

  const q = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  let reg = null;
  let sub = null;
  let busy = false;
  let note = null; // { text, kind }

  function b64uToBytes(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  function friendlyError(err) {
    const msg = (err && err.message) || String(err);
    if (/could not find the function|schema cache/i.test(msg) || (err && err.code === 'PGRST202')) {
      return '資料庫還沒更新。先在 Supabase 執行 supabase/migration-v3.sql。';
    }
    if (/unauthorized/i.test(msg)) return '密碼不對，重新解鎖 Private 再試。';
    return msg;
  }

  // ── what the row should say ──
  function state() {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    if (isIOS && !isStandalone()) return 'ios-browser';
    if (!canPush()) return isIOS ? 'ios-old' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (sub) return 'on';
    if (!isPrivate || !storedPassword) return 'locked';
    return 'off';
  }

  function render() {
    const row = q('#pushRow');
    if (!row) return;
    const s = state();
    let text = '', buttons = '';
    switch (s) {
      case 'unsupported':
        text = '這個瀏覽器不支援通知。';
        break;
      case 'ios-browser':
        text = 'iPhone 只有從主畫面圖示打開 Unwind 才能收通知。先在 Safari 按分享 → 加入主畫面，再從那個圖示打開。';
        break;
      case 'ios-old':
        text = '需要 iOS 16.4 以上才能收通知。';
        break;
      case 'denied':
        text = '通知被關掉了。到手機的 設定 → 通知 → Unwind 打開，再回來這裡。';
        break;
      case 'locked':
        text = '開啟通知前要先解鎖 Private，只需要做一次。';
        buttons = '<button class="x-btn small" data-x-goto="private">前往 Private</button>';
        break;
      case 'off':
        text = '這支手機還沒開通知。';
        buttons = '<button class="x-btn small primary" data-push="on">開啟通知</button>';
        break;
      case 'on':
        text = '這支手機已開啟。每天早上 8 點會收到今日回顧。';
        buttons = '<button class="x-btn small" data-push="test">送一則測試</button>'
          + '<button class="x-btn small" data-push="off">關閉</button>';
        break;
    }
    if (busy) buttons = '<span class="x-note">處理中…</span>';
    row.innerHTML = `
      <div class="x-row">
        <span class="x-note">手機通知</span>
        ${buttons}
      </div>
      <p class="review-scope-status ${s === 'on' ? 'ok' : ''}">${esc(text)}</p>
      ${note ? `<p class="x-status ${note.kind || ''}" style="margin:4px 0 0">${esc(note.text)}</p>` : ''}`;
  }

  async function enable() {
    if (!reg || busy) return;
    busy = true; note = null; render();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        note = { text: '沒有允許通知。想開的話再按一次，並選「允許」。', kind: 'err' };
        return;
      }
      const fresh = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToBytes(VAPID_PUBLIC_KEY)
      });
      const j = fresh.toJSON();
      const { error } = await sb.rpc('add_push_subscription', {
        pw: storedPassword,
        p_endpoint: j.endpoint,
        p_p256dh: j.keys.p256dh,
        p_auth: j.keys.auth,
        p_user_agent: ua.slice(0, 300)
      });
      if (error) {
        await fresh.unsubscribe().catch(() => {});
        throw error;
      }
      sub = fresh;
      note = { text: '開好了。按「送一則測試」確認手機會跳通知。', kind: 'ok' };
    } catch (err) {
      note = { text: '開不了：' + friendlyError(err), kind: 'err' };
    } finally {
      busy = false; render();
    }
  }

  async function disable() {
    if (!sub || busy) return;
    busy = true; note = null; render();
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
      sub = null;
      if (isPrivate && storedPassword) {
        await sb.rpc('remove_push_subscription', { pw: storedPassword, p_endpoint: endpoint });
      }
      // when locked, the sender drops the stale address itself on the next run
      note = { text: '已關閉。', kind: '' };
    } catch (err) {
      note = { text: '關不掉：' + friendlyError(err), kind: 'err' };
    } finally {
      busy = false; render();
    }
  }

  async function test() {
    if (!reg) return;
    try {
      await reg.showNotification('Unwind · 測試通知', {
        body: '通知可以正常顯示。每天早上 8 點會收到今日回顧。',
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-96.png',
        tag: 'unwind-test',
        data: { url: './#review' }
      });
      note = { text: '已送出。沒看到的話，檢查手機的專注模式或通知設定。', kind: 'ok' };
    } catch (err) {
      note = { text: '送不出去：' + friendlyError(err), kind: 'err' };
    }
    render();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-push]');
    if (!b) return;
    const act = b.dataset.push;
    if (act === 'on') enable();
    else if (act === 'off') disable();
    else if (act === 'test') test();
  });

  // tapping a notification while the app is open
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type !== 'open' || !d.url) return;
      const page = (new URL(d.url).hash || '#review').slice(1);
      if (typeof window.navigate === 'function' && q('#page-' + page)) window.navigate(page);
    });
  }

  // re-render whenever something that affects the row changes
  const baseNavigate = window.navigate;
  window.navigate = function (page) {
    baseNavigate(page);
    if (page === 'review') { note = null; render(); }
  };
  const baseRenderPrivate = window.renderPrivate;
  window.renderPrivate = function () {
    baseRenderPrivate();
    render();
  };

  async function start() {
    render();
    if (!('serviceWorker' in navigator)) return;
    try {
      reg = await navigator.serviceWorker.register('sw.js');
      if (reg.pushManager) sub = await reg.pushManager.getSubscription();
    } catch (err) {
      // file:// previews and some private modes refuse service workers
    }
    render();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);

  window.UnwindApp = { state, render, isStandalone };
})();
