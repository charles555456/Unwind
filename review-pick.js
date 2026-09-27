/*
 * Daily Review picker — shared by the site (browser) and the push script (Node).
 * Same date in, same highlights out, so the notification and the page agree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviewPick = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // FNV-1a, 32-bit
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // YYYY-MM-DD in Asia/Taipei, whatever the machine's own timezone is
  function taipeiDate(d) {
    var t = new Date((d || new Date()).getTime() + 8 * 3600 * 1000);
    return t.toISOString().slice(0, 10);
  }

  // Kobo exports carry the book's own indentation: tabs, full-width spaces,
  // blank lines. Keep the line breaks, drop the rest.
  function tidy(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) { return line.replace(/[\t\u3000 ]+/g, ' ').trim(); })
      .filter(function (line) { return line.length; })
      .join('\n');
  }

  function idOf(bookTitle, text) {
    return hash(bookTitle + '|' + text).toString(36);
  }

  function flatten(books) {
    var all = [];
    (books || []).forEach(function (b) {
      (b.highlights || []).forEach(function (h) {
        var text = tidy(h.text);
        if (text.length < 12) return; // skip stray words and page fragments
        all.push({
          id: idOf(b.title, text),
          text: text,
          note: h.note || '',
          chapter: h.chapter || '',
          date: h.date || '',
          bookTitle: b.title,
          bookAuthor: b.author || ''
        });
      });
    });
    // stable order, independent of how the export happened to be sorted
    all.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return all;
  }

  /*
   * pick(books, seed, n, opts)
   *   seed        any string; use the date for the daily set
   *   opts.favs   array of ids; when present, one slot is drawn from them
   *   opts.onlyFavs  draw every slot from favourites
   */
  function pick(books, seed, n, opts) {
    opts = opts || {};
    n = n || 5;
    var all = flatten(books);
    var favSet = {};
    (opts.favs || []).forEach(function (id) { favSet[id] = true; });
    var rand = rng(hash(String(seed)));

    function shuffled(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }

    var favList = all.filter(function (h) { return favSet[h.id]; });
    if (opts.onlyFavs) return shuffled(favList).slice(0, n);

    var out = [], usedBooks = {}, usedIds = {};
    if (favList.length) {
      var f = shuffled(favList)[0];
      out.push(f); usedBooks[f.bookTitle] = true; usedIds[f.id] = true;
    }
    var pool = shuffled(all);
    // first pass: one highlight per book, for variety
    for (var i = 0; i < pool.length && out.length < n; i++) {
      var h = pool[i];
      if (usedIds[h.id] || usedBooks[h.bookTitle]) continue;
      out.push(h); usedBooks[h.bookTitle] = true; usedIds[h.id] = true;
    }
    // second pass: fill up if the library has fewer books than slots
    for (var k = 0; k < pool.length && out.length < n; k++) {
      if (usedIds[pool[k].id]) continue;
      out.push(pool[k]); usedIds[pool[k].id] = true;
    }
    return out;
  }

  var RECENT_DAYS = 14;

  // YYYY-MM-DD that lies `days` before `day` (both plain calendar dates)
  function daysBefore(day, days) {
    var t = new Date(day + 'T00:00:00Z').getTime() - days * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }

  /*
   * daily(books, day, scope, n)
   *   scope 'all'     every highlight ever made
   *   scope 'recent'  highlights made in the last 14 days; tops up from the
   *                   full library when there are fewer than n of them
   * opts.round  0 is the day's set, the one the push sends. Higher rounds are
   *             extra draws for the same day.
   * opts.favs   favourite ids; only used from round 1 on, so round 0 stays
   *             identical for every device and for the push.
   * Returns { items, scope, recentCount, fallback } where fallback is true
   * when 'recent' was asked for and nothing recent exists.
   */
  function daily(books, day, scope, n, opts) {
    n = n || 5;
    opts = opts || {};
    scope = scope === 'recent' ? 'recent' : 'all';
    var round = opts.round || 0;
    var seed = round ? day + '#' + round : day;
    var pickOpts = round ? { favs: opts.favs || [] } : {};
    if (scope === 'all') {
      return { items: pick(books, seed, n, pickOpts), scope: 'all', recentCount: 0, fallback: false };
    }
    var cut = daysBefore(day, RECENT_DAYS);
    var recentBooks = (books || []).map(function (b) {
      return {
        title: b.title, author: b.author,
        highlights: (b.highlights || []).filter(function (h) {
          var d = h.date ? String(h.date).slice(0, 10) : '';
          return d && d >= cut && d <= day;
        })
      };
    }).filter(function (b) { return b.highlights.length; });
    var recentCount = flatten(recentBooks).length;
    if (!recentCount) {
      return { items: pick(books, seed, n, pickOpts), scope: 'recent', recentCount: 0, fallback: true };
    }
    var items = pick(recentBooks, seed + '|recent', n, pickOpts);
    if (items.length < n) {
      var have = {};
      items.forEach(function (h) { have[h.id] = true; });
      pick(books, seed, n * 2).forEach(function (h) {
        if (items.length < n && !have[h.id]) { items.push(h); have[h.id] = true; }
      });
    }
    return { items: items, scope: 'recent', recentCount: recentCount, fallback: false };
  }

  return {
    hash: hash, taipeiDate: taipeiDate, flatten: flatten, pick: pick, idOf: idOf,
    daily: daily, daysBefore: daysBefore, tidy: tidy, RECENT_DAYS: RECENT_DAYS
  };
});
