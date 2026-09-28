#!/usr/bin/env node
/*
 * Sends today's Daily Review as a push notification.
 *
 * Channels are enabled by whichever secrets are present:
 *   VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + PUSH_SENDER_KEY
 *                                              -> the Unwind home-screen app
 *   NTFY_TOPIC                                 -> ntfy.sh (or NTFY_SERVER)
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID      -> Telegram
 * With neither set, the message is printed and nothing is sent.
 *
 * SITE_URL      where the notification should open (default: the GitHub Pages site)
 * COUNT         how many highlights to include (default 3)
 * REVIEW_SCOPE  'all' or 'recent'; overrides the choice saved from the Review page
 * PUSH_TIME     'HH:MM' Taipei time; overrides the time saved from the Review page
 * FORCE         'true' sends right now, ignoring the time and whether today's
 *               push already went out, and does not count as today's push
 *
 * Timing: the workflow wakes every 15 minutes. A run sends only when the
 * chosen time has passed and today's push has not gone out yet, then marks
 * the day as done. `--check` only answers "is it time?" for the workflow.
 *
 * The scope normally comes from the site: the Review page stores it in the
 * public `settings` table, and this script reads it from there.
 */
const fs = require('fs');
const path = require('path');
const { daily, taipeiDate } = require('../review-pick.js');

// Same public values the site ships in index.html
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoriszrkgoqfqorudcth.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON || 'sb_publishable_2WDf4cHELLvK_EWEWwKKwA_WJ_6vTBq';

const SITE_URL = (process.env.SITE_URL || 'https://charles555456.github.io/Unwind/').replace(/\/?$/, '/');
const COUNT = Math.max(1, Math.min(5, parseInt(process.env.COUNT || '3', 10) || 3));

// Publishers pad titles with sales copy in trailing brackets.
function shortTitle(title) {
  let t = String(title || '').trim();
  for (let i = 0; i < 3; i++) {
    const cut = t.replace(/\s*[（(【\[][^（）()【】\[\]]*[）)】\]]\s*$/, '').trim();
    if (cut === t || cut.length < 2) break;
    t = cut;
  }
  return t;
}

function clip(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const DEFAULT_TIME = '08:00';

function validTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}

// Public settings saved from the site. Missing table or network trouble
// falls back to the defaults, so the push still goes out.
async function readSettings() {
  const out = { scope: 'all', time: DEFAULT_TIME, lastSent: '' };
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/settings?key=in.(review_scope,push_time,push_last_sent)&select=key,value', {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      for (const row of await res.json()) {
        if (row.key === 'review_scope') out.scope = row.value === 'recent' ? 'recent' : 'all';
        if (row.key === 'push_time') out.time = validTime(row.value) || DEFAULT_TIME;
        if (row.key === 'push_last_sent') out.lastSent = String(row.value || '');
      }
    }
  } catch (e) { /* keep defaults */ }
  if (process.env.REVIEW_SCOPE) out.scope = process.env.REVIEW_SCOPE === 'recent' ? 'recent' : 'all';
  if (validTime(process.env.PUSH_TIME)) out.time = process.env.PUSH_TIME;
  return out;
}

// Minutes since midnight in Asia/Taipei
function taipeiMinutes(d) {
  const t = new Date((d || new Date()).getTime() + 8 * 3600 * 1000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

function decide(settings, day, force) {
  if (force) return { send: true, why: 'forced' };
  const [h, m] = settings.time.split(':').map(Number);
  const now = taipeiMinutes();
  if (settings.lastSent === day) return { send: false, why: 'already sent today' };
  if (now < h * 60 + m) return { send: false, why: 'not yet (' + settings.time + ')' };
  return { send: true, why: 'due (' + settings.time + ')' };
}

async function supabaseRpc(name, args) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(name + ' responded ' + res.status + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

// Web push to every phone that turned notifications on in the app.
async function sendApp(title, body, click) {
  let webpush;
  try { webpush = require('web-push'); }
  catch (e) { throw new Error('web-push is not installed (npm install web-push)'); }
  webpush.setVapidDetails(SITE_URL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const key = process.env.PUSH_SENDER_KEY;
  const subs = (await supabaseRpc('get_push_subscriptions', { p_key: key })) || [];
  if (!subs.length) {
    console.log('app: no phone has turned notifications on yet');
    return;
  }
  const payload = JSON.stringify({ title, body: appBody, url: click, tag: 'unwind-daily' });
  let delivered = 0, dropped = 0, failed = 0;
  for (const s of subs) {
    const target = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(target, payload, { TTL: 6 * 3600, urgency: 'normal' });
      delivered++;
      await supabaseRpc('report_push_result', { p_key: key, p_endpoint: s.endpoint, p_ok: true }).catch(() => {});
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        dropped++;
        await supabaseRpc('report_push_result', { p_key: key, p_endpoint: s.endpoint, p_ok: false }).catch(() => {});
      } else {
        failed++;
        console.error('app push failed (' + (e.statusCode || 'no status') + '): ' + (e.body || e.message));
      }
    }
  }
  console.log('app: delivered ' + delivered + ', removed ' + dropped + ' stale, failed ' + failed);
  if (failed && !delivered) throw new Error('no phone accepted the push');
}

let appBody = '';

async function sendNtfy(title, body, click) {
  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const res = await fetch(server + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: process.env.NTFY_TOPIC, title, message: body, click, tags: ['books'] })
  });
  if (!res.ok) throw new Error('ntfy responded ' + res.status + ': ' + (await res.text()));
}

async function sendTelegram(title, body, click) {
  const url = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: title + '\n\n' + body + '\n\n' + click,
      disable_web_page_preview: true
    })
  });
  if (!res.ok) throw new Error('Telegram responded ' + res.status + ': ' + (await res.text()));
}

(async () => {
  const day = taipeiDate();
  const force = process.env.FORCE === 'true' || process.env.FORCE === '1';
  const settings = await readSettings();
  const gate = decide(settings, day, force);
  console.log('time ' + settings.time + ' · last sent ' + (settings.lastSent || 'never') + ' · ' + gate.why);

  if (process.argv.includes('--check')) {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'send=' + gate.send + '\n');
    return;
  }
  if (!gate.send) return;

  const books = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kobo-highlights.json'), 'utf8'));
  const scope = settings.scope;
  const result = daily(books, day, scope, 5);
  const picks = result.items.slice(0, COUNT);
  console.log('scope: ' + scope + (result.fallback ? ' (nothing in the last 14 days, using the full library)' : ''));
  if (!picks.length) {
    console.error('No highlights to send.');
    process.exit(1);
  }

  const label = scope === 'recent' && !result.fallback ? '近兩週' : '今日回顧';
  const title = 'Unwind · ' + label + ' ' + day.slice(5).replace('-', '/');
  const body = picks
    .map(h => '「' + clip(h.text, 220) + '」\n— ' + h.bookTitle)
    .join('\n\n');
  const click = SITE_URL + '#review';

  // A phone notification shows a few lines, so keep each quote short there.
  appBody = picks
    .map(h => '「' + clip(h.text.replace(/\s*\n\s*/g, ' '), 70) + '」— ' + clip(shortTitle(h.bookTitle).split(/[：:]/)[0], 24))
    .join('\n');

  const jobs = [];
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.PUSH_SENDER_KEY) {
    jobs.push(['app', sendApp(title, body, click)]);
  }
  if (process.env.NTFY_TOPIC) jobs.push(['ntfy', sendNtfy(title, body, click)]);
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) jobs.push(['telegram', sendTelegram(title, body, click)]);

  if (!jobs.length) {
    console.log('[dry run — no channel configured]\n');
    console.log(title + '\n\n' + body + '\n\n' + click);
    console.log('\n[app notification body]\n' + appBody);
    return;
  }

  let failed = false, sent = 0;
  for (const [name, job] of jobs) {
    try { await job; sent++; console.log('sent via ' + name); }
    catch (e) { failed = true; console.error(name + ' failed: ' + e.message); }
  }

  // Count the day as done once anything went out, so the next 15-minute
  // wake-up does not send it again. A forced test run never counts.
  if (sent && !force && process.env.PUSH_SENDER_KEY) {
    try { await supabaseRpc('mark_daily_push', { p_key: process.env.PUSH_SENDER_KEY, p_day: day }); }
    catch (e) { failed = true; console.error('could not mark today as sent: ' + e.message); }
  }
  if (failed) process.exit(1);
})();
