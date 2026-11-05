/*
 * Question — the 問題 tab on the Reading page (Private only).
 *
 * One question, read through at most three books. The top half lays the
 * three books' Kobo highlights side by side, with one search box over all
 * of them; any highlight can be quoted into that book's answer. The bottom
 * half is the worked answer, in the owner's structure:
 *
 *   問題 → each book's answer (own words + quoted highlights) → 我怎麼實踐
 *          (具體做法 / 什麼時候做 / 怎麼知道有效)
 *
 * The answer is saved on the question node in System (answers, practice),
 * through window.UnwindSystem, so later steps can read it. "複製 Markdown"
 * puts the whole thing on the clipboard for an article.
 */
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lib = () => (typeof LIBRARY !== 'undefined' && Array.isArray(LIBRARY) ? LIBRARY : []);
  const SYS = () => window.UnwindSystem;
  const QL = { active: '進行中', queued: '排隊', done: '完成' };
  const st = { root: null, qid: null, data: null, query: '', on: false, timer: 0 };

  function currentId() {
    const qs = SYS() ? SYS().questions() : [];
    if (st.qid && qs.some(q => q.id === st.qid)) return st.qid;
    const a = qs.find(q => q.q === 'active');
    return a ? a.id : (qs[0] ? qs[0].id : null);
  }
  const bookOf = id => lib().find(b => b.id === id);

  // ── render ──
  async function render() {
    if (!st.root || !st.on) return;
    const R = st.root;
    if (!lib().length) { R.innerHTML = '<p class="sys-note">解鎖 Private 後才看得到。</p>'; return; }
    if (!SYS() || !(await SYS().ensure())) { R.innerHTML = '<p class="sys-note">讀不到你的系統圖。</p>'; return; }
    const qs = SYS().questions();
    const id = currentId();
    if (!id) {
      R.innerHTML = '<p class="sys-note">還沒有問題。到「書架」點一本書，在卡片上寫下你想解決的問題。</p><button class="x-btn small" data-qz="to-shelf">到書架 →</button>';
      return;
    }
    if (st.data && st.data.id !== id) flush();
    st.qid = id;
    flush();                                     // never drop what was just typed
    const q = st.data = SYS().question(id);
    const sub = document.getElementById('readingSubtitle');
    if (sub) sub.textContent = '一個問題 · ' + q.books.length + ' 本書';
    const books = q.books.map(b => ({ node: b, lib: bookOf(b.book) }));
    const ql = st.query.trim().toLowerCase();

    const column = ({ node, lib: lb }) => {
      const all = lb ? lb.highlights.map((h, i) => ({ h, i })) : [];
      const shown = ql ? all.filter(x => (x.h.text + ' ' + x.h.note + ' ' + x.h.chapter).toLowerCase().includes(ql)) : all;
      const quoted = new Set(((q.answers[node.id] || {}).quotes || []).map(x => x.text));
      const meta = lb ? [lb.author, lb.readStatus === 2 ? '讀完' : (lb.percentRead || 0) + '%', lb.highlights.length + ' 條劃線'].filter(Boolean).join(' · ') : '書庫裡找不到這本';
      return `<section class="qz-col">
          <h3 class="qz-book">${esc(node.name)}</h3>
          <p class="qz-meta">${esc(meta)}</p>
          ${shown.length ? `<ul class="qz-hl">${shown.map(({ h, i }) => `<li>
              <p>${esc(h.text)}</p>
              ${h.note ? `<p class="qz-note">${esc(h.note)}</p>` : ''}
              <div class="qz-hl-foot">${h.chapter ? `<span>${esc(h.chapter)}</span>` : '<span></span>'}
                ${quoted.has(h.text) ? '<span class="qz-quoted">已引用</span>' : `<button class="qz-quote" data-qz-quote="${esc(node.id)}" data-i="${i}">引用 →</button>`}</div>
            </li>`).join('')}</ul>`
          : `<p class="sys-note">${lb && lb.highlights.length ? '沒有符合的劃線。' : '這本還沒有劃線。'}</p>`}
        </section>`;
    };

    const answer = ({ node }) => {
      const a = q.answers[node.id] || { text: '', quotes: [] };
      return `<div class="qz-answer">
          <p class="qz-answer-title">《${esc(node.name)}》的答案</p>
          <textarea class="sys-text qz-text" data-qz-answer="${esc(node.id)}" rows="3" placeholder="這本書怎麼回答這個問題？用你自己的話寫 3–5 個重點。">${esc(a.text)}</textarea>
          ${a.quotes.length ? `<ul class="qz-quotes">${a.quotes.map((x, k) => `<li><span>「${esc(x.text)}」${x.chapter ? `<em>— ${esc(x.chapter)}</em>` : ''}</span>
            <button class="sys-del" data-qz-unquote="${esc(node.id)}" data-k="${k}" aria-label="移除這段引用">×</button></li>`).join('')}</ul>` : '<p class="qz-hint">從上面的劃線按「引用 →」，當作這個答案的證據。</p>'}
        </div>`;
    };

    const p = q.practice;
    R.innerHTML = `
      <div class="qz-head">
        ${qs.length > 1 ? `<select class="shelf-sort qz-pick" id="qzPick" aria-label="選擇問題">${qs.map(x => `<option value="${esc(x.id)}"${x.id === id ? ' selected' : ''}>${esc(QL[x.q])} · ${esc(x.name)}</option>`).join('')}</select>` : ''}
        <h2 class="qz-question">${esc(q.name)}</h2>
        <p class="qz-meta">${esc(QL[q.q])} · ${q.books.length} / 3 本　<button class="qz-link" data-qz="to-system">在 System 裡編輯 →</button></p>
      </div>
      ${q.books.length ? `
      <input type="text" class="reading-search qz-search" id="qzSearch" placeholder="在這 ${q.books.length} 本的劃線裡搜尋…" value="${esc(st.query)}">
      <div class="qz-cols n${q.books.length}">${books.map(column).join('')}</div>

      <div class="qz-work">
        <p class="qz-step">1　問題</p>
        <p class="qz-question-small">${esc(q.name)}</p>
        <p class="qz-step">2　每本書的答案</p>
        ${books.map(answer).join('')}
        <p class="qz-step">3　我怎麼實踐</p>
        <label class="qz-label" for="qzHow">具體做法</label>
        <textarea class="sys-text qz-text" id="qzHow" data-qz-practice="how" rows="3" placeholder="把三本書的答案合起來，你要做什麼？">${esc(p.how)}</textarea>
        <label class="qz-label" for="qzWhen">什麼時候做</label>
        <textarea class="sys-text qz-text" id="qzWhen" data-qz-practice="when" rows="2" placeholder="每天哪個時段？什麼情況下觸發？">${esc(p.when)}</textarea>
        <label class="qz-label" for="qzCheck">怎麼知道有效</label>
        <textarea class="sys-text qz-text" id="qzCheck" data-qz-practice="check" rows="2" placeholder="兩週後看什麼，就知道它有沒有用？">${esc(p.check)}</textarea>
        <div class="sys-row qz-foot">
          <button class="x-btn small" data-qz="copy">複製 Markdown</button>
          <span class="sys-status" id="qzStatus"></span>
        </div>
      </div>` : '<p class="sys-note">這個問題還沒有書。到「書架」點一本書，按「放進這個問題」。</p><button class="x-btn small" data-qz="to-shelf">到書架 →</button>'}`;
    R.querySelectorAll('.qz-text').forEach(grow);
  }
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(420, ta.scrollHeight + 2) + 'px'; }

  // only the column lists change while searching, so the search box keeps its focus
  function renderColumnsOnly() {
    const cur = st.root.querySelector('#qzSearch');
    const pos = cur ? cur.selectionStart : 0;
    render().then(() => { const s = st.root.querySelector('#qzSearch'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } });
  }

  // ── saving ──
  function flush() {
    if (!st.timer || !st.data) return;
    clearTimeout(st.timer); st.timer = 0;
    SYS().setQuestionData(st.data.id, { answers: st.data.answers, practice: st.data.practice });
  }
  function saveSoon() {
    clearTimeout(st.timer);
    const s = st.root.querySelector('#qzStatus'); if (s) s.textContent = '儲存中…';
    st.timer = setTimeout(() => {
      st.timer = 0;
      SYS().setQuestionData(st.data.id, { answers: st.data.answers, practice: st.data.practice });
      const s2 = st.root.querySelector('#qzStatus'); if (s2) s2.textContent = '已儲存';
    }, 500);
  }

  function markdown() {
    const q = st.data, lines = ['# ' + q.name, ''];
    q.books.forEach(b => {
      const a = q.answers[b.id] || { text: '', quotes: [] };
      lines.push('## 《' + b.name + '》的答案', '');
      if (a.text.trim()) lines.push(a.text.trim(), '');
      a.quotes.forEach(x => lines.push('> ' + x.text.replace(/\n+/g, ' ') + (x.chapter ? ' — ' + x.chapter : ''), ''));
    });
    lines.push('## 我怎麼實踐', '', '- **具體做法**：' + q.practice.how.trim(), '- **什麼時候做**：' + q.practice.when.trim(), '- **怎麼知道有效**：' + q.practice.check.trim(), '');
    return lines.join('\n');
  }

  // ── events ──
  document.addEventListener('click', e => {
    if (!st.root || !st.root.contains(e.target)) return;
    const t = e.target;
    const quote = t.closest('[data-qz-quote]');
    if (quote) {
      const nodeId = quote.dataset.qzQuote, b = st.data.books.find(x => x.id === nodeId), lb = b && bookOf(b.book);
      const h = lb && lb.highlights[+quote.dataset.i];
      if (!h) return;
      const a = st.data.answers[nodeId] = st.data.answers[nodeId] || { text: '', quotes: [] };
      if (!a.quotes.some(x => x.text === h.text)) a.quotes.push({ text: h.text, chapter: h.chapter || '' });
      saveSoon(); render(); return;
    }
    const un = t.closest('[data-qz-unquote]');
    if (un) { const a = st.data.answers[un.dataset.qzUnquote]; if (a) { a.quotes.splice(+un.dataset.k, 1); saveSoon(); render(); } return; }
    const act = t.closest('[data-qz]');
    if (!act) return;
    const a = act.dataset.qz;
    if (a === 'to-shelf' && window.UnwindShelf) window.UnwindShelf.tab('shelf');
    if (a === 'to-system') window.navigate('system');
    if (a === 'copy') {
      const s = st.root.querySelector('#qzStatus');
      navigator.clipboard.writeText(markdown()).then(() => { if (s) s.textContent = '已複製'; }, () => { if (s) s.textContent = '複製失敗，瀏覽器不允許'; });
    }
  });
  document.addEventListener('input', e => {
    if (!st.root || !st.root.contains(e.target) || !st.data) return;
    const t = e.target;
    if (t.id === 'qzSearch') { st.query = t.value; renderColumnsOnly(); return; }
    if (t.dataset.qzAnswer) {
      const a = st.data.answers[t.dataset.qzAnswer] = st.data.answers[t.dataset.qzAnswer] || { text: '', quotes: [] };
      a.text = t.value; grow(t); saveSoon(); return;
    }
    if (t.dataset.qzPractice) { st.data.practice[t.dataset.qzPractice] = t.value; grow(t); saveSoon(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'qzPick') { st.qid = e.target.value; st.query = ''; render(); }
  });
  document.addEventListener('unwind:reading-tab', e => { st.on = e.detail === 'question'; if (st.on) render(); });

  window.UnwindQuestion = {
    open(id) { st.qid = id || st.qid; st.query = ''; if (window.UnwindShelf) window.UnwindShelf.tab('question'); window.scrollTo({ top: 0 }); }
  };

  function init() {
    const page = document.getElementById('page-reading');
    if (!page || document.getElementById('questionRoot')) return;
    const root = document.createElement('section');
    root.id = 'questionRoot'; root.className = 'qz';
    page.insertBefore(root, document.getElementById('readingList'));
    st.root = root;
    st.on = page.classList.contains('question-on');
    if (st.on) render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
