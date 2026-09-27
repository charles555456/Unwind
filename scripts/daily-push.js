#!/usr/bin/env node
/*
 * Sends today's Daily Review as a push notification.
 *
 * Channels are enabled by whichever secrets are present:
 *   NTFY_TOPIC                                 -> ntfy.sh (or NTFY_SERVER)
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID      -> Telegram
 * With neither set, the message is printed and nothing is sent.
 *
 * SITE_URL      where the notification should open (default: the GitHub Pages site)
 * COUNT         how many highlights to include (default 3)
 * REVIEW_SCOPE  'all' or 'recent'; overrides the choice saved from the Review page
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

function clip(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function readScope() {
  if (process.env.REVIEW_SCOPE) return process.env.REVIEW_SCOPE === 'recent' ? 'recent' : 'all';
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/settings?key=eq.review_scope&select=value', {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return 'all'; // table not created yet, or Supabase unreachable
    const rows = await res.json();
    return rows[0] && rows[0].value === 'recent' ? 'recent' : 'all';
  } catch (e) {
    return 'all';
  }
}

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
  const books = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kobo-highlights.json'), 'utf8'));
  const day = taipeiDate();
  const scope = await readScope();
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

  const jobs = [];
  if (process.env.NTFY_TOPIC) jobs.push(['ntfy', sendNtfy(title, body, click)]);
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) jobs.push(['telegram', sendTelegram(title, body, click)]);

  if (!jobs.length) {
    console.log('[dry run — no channel configured]\n');
    console.log(title + '\n\n' + body + '\n\n' + click);
    return;
  }

  let failed = false;
  for (const [name, job] of jobs) {
    try { await job; console.log('sent via ' + name); }
    catch (e) { failed = true; console.error(name + ' failed: ' + e.message); }
  }
  if (failed) process.exit(1);
})();
