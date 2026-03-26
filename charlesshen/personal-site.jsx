import { useState, useEffect, useRef } from "react";

// ─── Sample Data ───────────────────────────────────────────
const STREAM_DATA = [
  { id: 1, date: "2026-03-18", content: "開始認真思考個人網站的定位。不想做成作品集，更像是一個思考的容器。", tags: ["thoughts"], private: false },
  { id: 2, date: "2026-03-15", content: "讀完《The Art of Doing Science and Engineering》，Hamming 說的「你必須為你的領域的重要問題工作」這句話一直在腦中迴盪。", tags: ["reading"], private: false },
  { id: 3, date: "2026-03-12", content: "今天跟朋友聊到「輸出」這件事。寫作不只是記錄，更是一種思考的方式。把模糊的想法寫下來，才知道自己真正在想什麼。", tags: ["thoughts"], private: false },
  { id: 4, date: "2026-03-10", content: "週末去了一趟淡水，黃昏的光打在河面上很美。有時候需要離開螢幕，去感受真實的世界。", tags: ["life"], private: false },
  { id: 5, date: "2026-03-05", content: "Private note: 最近的焦慮來自於不確定下一步要做什麼。但也許不確定本身就是答案的一部分。", tags: ["thoughts"], private: true },
  { id: 6, date: "2026-02-28", content: "發現一個有趣的概念：Digital Garden。不是部落格那種線性時間流，而是像花園一樣，讓想法慢慢長大。", tags: ["thoughts"], private: false },
  { id: 7, date: "2026-02-20", content: "Private: 今天的 1-on-1 讓我重新思考了職涯方向。也許該勇敢一點。", tags: ["work"], private: true },
];

const WRITING_DATA = [
  { id: 1, title: "為什麼我開始寫個人網站", date: "2026-03-16", summary: "在社群媒體的時代，為什麼還需要一個自己的空間？這篇文章記錄了我的思考過程。", readTime: "5 min", private: false },
  { id: 2, title: "關於「慢思考」的練習", date: "2026-03-01", summary: "我們的注意力越來越碎片化。這是我嘗試找回深度思考能力的一些方法。", readTime: "8 min", private: false },
  { id: 3, title: "2025 年度回顧：不確定的一年", date: "2026-01-15", summary: "回顧過去一年的變化、學習和成長。有些事情沒有按計畫走，但也許這就是生活。", readTime: "12 min", private: false },
  { id: 4, title: "Private: 離職後的第一個月", date: "2025-12-20", summary: "記錄離開上一份工作後的心路歷程，那些沒辦法公開說的感受。", readTime: "10 min", private: true },
];

const HIGHLIGHTS_DATA = [
  { id: 1, date: "2026-03-10", title: "淡水黃昏", description: "和朋友在淡水河邊散步，看到了今年最美的夕陽。", image: null, color: "#e8d5b7", private: false },
  { id: 2, date: "2026-01-01", title: "2026 的第一天", description: "在山上迎接新年的日出。新的一年，希望能更誠實地面對自己。", image: null, color: "#d4a574", private: false },
  { id: 3, date: "2025-11-15", title: "東京散步", description: "一個人在下北澤的巷弄裡走了一整個下午，買了幾本二手書。", image: null, color: "#a8b5a0", private: false },
  { id: 4, date: "2025-09-20", title: "Private: 那場重要的對話", description: "改變了我很多想法的一次深夜對話。", image: null, color: "#b0a0b8", private: true },
  { id: 5, date: "2025-07-04", title: "第一次衝浪", description: "在宜蘭烏石港學衝浪，被浪打了無數次，但站起來的那一刻什麼都值了。", image: null, color: "#7eb8c9", private: false },
];

// ─── Utility ───────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ─── Components ────────────────────────────────────────────
function Nav({ page, setPage, isPrivateMode }) {
  const links = [
    { key: "home", label: "Home" },
    { key: "stream", label: "Stream" },
    { key: "writing", label: "Writing" },
    { key: "highlights", label: "Highlights" },
  ];
  return (
    <nav style={{ display: "flex", gap: "24px", alignItems: "center", padding: "32px 0 48px 0" }}>
      {links.map(l => (
        <button
          key={l.key}
          onClick={() => setPage(l.key)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "15px", fontFamily: "inherit", padding: 0,
            color: page === l.key ? "var(--text-primary)" : "var(--text-tertiary)",
            fontWeight: page === l.key ? 500 : 400,
            transition: "color 0.2s",
            textDecoration: "none",
          }}
          onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
          onMouseLeave={e => { if (page !== l.key) e.target.style.color = "var(--text-tertiary)" }}
        >
          {l.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      {isPrivateMode && (
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: "4px" }}>
          Private Mode
        </span>
      )}
      <button
        onClick={() => setPage("private")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: "15px", fontFamily: "inherit", padding: 0,
          color: page === "private" ? "var(--text-primary)" : "var(--text-tertiary)",
          transition: "color 0.2s",
        }}
        title="Private"
      >
        ○
      </button>
    </nav>
  );
}

function HomePage({ setPage }) {
  const recentItems = [
    ...STREAM_DATA.filter(s => !s.private).slice(0, 2).map(s => ({ type: "stream", date: s.date, content: s.content })),
    ...WRITING_DATA.filter(w => !w.private).slice(0, 1).map(w => ({ type: "writing", date: w.date, content: w.title })),
    ...HIGHLIGHTS_DATA.filter(h => !h.private).slice(0, 1).map(h => ({ type: "highlight", date: h.date, content: h.title })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <div style={{ marginBottom: "64px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "20px", color: "var(--text-primary)" }}>
          charlesshen
        </h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.75, fontSize: "15px", maxWidth: "520px" }}>
          這裡是我輸出想法的地方。記錄一些思考、一些人生的片段。
          不販賣焦慮，只是誠實地寫下此刻的想法。
        </p>
        <div style={{ display: "flex", gap: "16px", marginTop: "20px" }}>
          <a href="#" style={{ color: "var(--text-tertiary)", fontSize: "14px", textDecoration: "none", borderBottom: "1px solid var(--border)" }}>Twitter</a>
          <a href="#" style={{ color: "var(--text-tertiary)", fontSize: "14px", textDecoration: "none", borderBottom: "1px solid var(--border)" }}>GitHub</a>
          <a href="#" style={{ color: "var(--text-tertiary)", fontSize: "14px", textDecoration: "none", borderBottom: "1px solid var(--border)" }}>Email</a>
        </div>
      </div>

      <div style={{ marginBottom: "48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-tertiary)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Recent</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {recentItems.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "16px 0",
                borderTop: i === 0 ? "1px solid var(--border)" : "none",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                transition: "opacity 0.2s",
              }}
              onClick={() => {
                if (item.type === "stream") setPage("stream");
                else if (item.type === "writing") setPage("writing");
                else setPage("highlights");
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <div style={{ display: "flex", gap: "12px", alignItems: "baseline" }}>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "monospace", minWidth: "36px" }}>
                  {item.type === "stream" ? "想法" : item.type === "writing" ? "文章" : "時刻"}
                </span>
                <span style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, flex: 1 }}>
                  {item.content.length > 80 ? item.content.slice(0, 80) + "..." : item.content}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-tertiary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {formatDateShort(item.date)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        {["stream", "writing", "highlights"].map(p => (
          <button
            key={p}
            onClick={() => setPage(p)}
            style={{
              background: "none", border: "1px solid var(--border)", borderRadius: "6px",
              padding: "10px 20px", cursor: "pointer", color: "var(--text-secondary)",
              fontSize: "14px", fontFamily: "inherit", transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.target.style.borderColor = "var(--text-tertiary)"; e.target.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
          >
            {p === "stream" ? "All Thoughts →" : p === "writing" ? "All Writing →" : "All Highlights →"}
          </button>
        ))}
      </div>
    </div>
  );
}

function StreamPage({ isPrivateMode }) {
  const [activeTag, setActiveTag] = useState("all");
  const items = STREAM_DATA.filter(s => isPrivateMode || !s.private);
  const tags = ["all", ...new Set(items.flatMap(s => s.tags))];
  const filtered = activeTag === "all" ? items : items.filter(s => s.tags.includes(activeTag));

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "8px", color: "var(--text-primary)" }}>Stream</h1>
      <p style={{ color: "var(--text-tertiary)", fontSize: "14px", marginBottom: "32px" }}>短想法、隨筆、日常觀察</p>

      <div style={{ display: "flex", gap: "12px", marginBottom: "32px", flexWrap: "wrap" }}>
        {tags.map(tag => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag)}
            style={{
              background: activeTag === tag ? "var(--text-primary)" : "none",
              color: activeTag === tag ? "var(--bg)" : "var(--text-tertiary)",
              border: activeTag === tag ? "1px solid var(--text-primary)" : "1px solid var(--border)",
              borderRadius: "20px", padding: "4px 14px", fontSize: "13px",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
            }}
          >
            {tag}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {filtered.map((item, i) => (
          <div
            key={item.id}
            style={{
              padding: "20px 0",
              borderBottom: "1px solid var(--border)",
              opacity: 0,
              animation: `fadeSlideIn 0.4s ease ${i * 0.05}s forwards`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.75, flex: 1 }}>
                {item.private && <span style={{ fontSize: "11px", color: "var(--text-tertiary)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: "3px", marginRight: "8px" }}>private</span>}
                {item.content}
              </p>
              <span style={{ fontSize: "13px", color: "var(--text-tertiary)", fontFamily: "monospace", whiteSpace: "nowrap", paddingTop: "2px" }}>
                {formatDateShort(item.date)}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {item.tags.map(t => (
                <span key={t} style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>#{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingPage({ isPrivateMode }) {
  const items = WRITING_DATA.filter(w => isPrivateMode || !w.private);

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "8px", color: "var(--text-primary)" }}>Writing</h1>
      <p style={{ color: "var(--text-tertiary)", fontSize: "14px", marginBottom: "32px" }}>長一點的文章和思考</p>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              padding: "24px 0",
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
              transition: "opacity 0.2s",
              opacity: 0,
              animation: `fadeSlideIn 0.4s ease ${i * 0.06}s forwards`,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 500, color: "var(--text-primary)" }}>
                {item.private && <span style={{ fontSize: "11px", color: "var(--text-tertiary)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: "3px", marginRight: "8px", fontWeight: 400 }}>private</span>}
                {item.title}
              </h3>
            </div>
            <p style={{ color: "var(--text-tertiary)", fontSize: "14px", lineHeight: 1.6, marginBottom: "8px" }}>
              {item.summary}
            </p>
            <div style={{ display: "flex", gap: "12px", fontSize: "13px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
              <span>{formatDate(item.date)}</span>
              <span>·</span>
              <span>{item.readTime}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightsPage({ isPrivateMode }) {
  const items = HIGHLIGHTS_DATA.filter(h => isPrivateMode || !h.private);

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "8px", color: "var(--text-primary)" }}>Highlights</h1>
      <p style={{ color: "var(--text-tertiary)", fontSize: "14px", marginBottom: "32px" }}>人生的精華時刻</p>

      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: "32px" }}>
        {/* Timeline line */}
        <div style={{
          position: "absolute", left: "6px", top: "8px", bottom: "8px",
          width: "1px", background: "var(--border)"
        }} />

        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              position: "relative", marginBottom: "36px",
              opacity: 0,
              animation: `fadeSlideIn 0.4s ease ${i * 0.08}s forwards`,
            }}
          >
            {/* Timeline dot */}
            <div style={{
              position: "absolute", left: "-29px", top: "6px",
              width: "9px", height: "9px", borderRadius: "50%",
              background: item.color, border: "2px solid var(--bg)",
              boxShadow: `0 0 0 1px ${item.color}40`,
            }} />

            <span style={{ fontSize: "13px", color: "var(--text-tertiary)", fontFamily: "monospace", display: "block", marginBottom: "8px" }}>
              {formatDate(item.date)}
            </span>

            {/* Image placeholder */}
            <div style={{
              width: "100%", height: "180px", borderRadius: "8px",
              background: `linear-gradient(135deg, ${item.color}30, ${item.color}10)`,
              border: "1px solid var(--border)",
              marginBottom: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-tertiary)", fontSize: "13px",
            }}>
              photo placeholder
            </div>

            <h3 style={{ fontSize: "16px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
              {item.private && <span style={{ fontSize: "11px", color: "var(--text-tertiary)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: "3px", marginRight: "8px", fontWeight: 400 }}>private</span>}
              {item.title}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6 }}>
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivatePage({ isPrivateMode, setPrivateMode }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const CORRECT_PASSWORD = "charles";

  if (isPrivateMode) {
    return (
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "20px", color: "var(--text-primary)" }}>Private Mode</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.75, marginBottom: "24px" }}>
          已解鎖。現在你可以在 Stream、Writing、Highlights 頁面看到所有私密內容。
        </p>
        <button
          onClick={() => setPrivateMode(false)}
          style={{
            background: "none", border: "1px solid var(--border)",
            borderRadius: "6px", padding: "8px 20px", cursor: "pointer",
            color: "var(--text-secondary)", fontSize: "14px", fontFamily: "inherit",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.borderColor = "var(--text-tertiary)"; }}
          onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; }}
        >
          Lock again
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "320px" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "8px", color: "var(--text-primary)" }}>Private</h1>
      <p style={{ color: "var(--text-tertiary)", fontSize: "14px", marginBottom: "32px" }}>
        輸入密碼以查看私密內容
      </p>
      <div>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false); }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              if (password === CORRECT_PASSWORD) setPrivateMode(true);
              else setError(true);
            }
          }}
          placeholder="Password"
          style={{
            width: "100%", padding: "10px 12px", fontSize: "15px",
            border: error ? "1px solid #c44" : "1px solid var(--border)",
            borderRadius: "6px", background: "var(--bg)",
            color: "var(--text-primary)", fontFamily: "inherit",
            outline: "none", boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
          onFocus={e => { if (!error) e.target.style.borderColor = "var(--text-tertiary)"; }}
          onBlur={e => { if (!error) e.target.style.borderColor = "var(--border)"; }}
        />
        {error && (
          <p style={{ color: "#c44", fontSize: "13px", marginTop: "8px" }}>密碼錯誤</p>
        )}
        <button
          onClick={() => {
            if (password === CORRECT_PASSWORD) setPrivateMode(true);
            else setError(true);
          }}
          style={{
            marginTop: "12px", width: "100%", padding: "10px",
            background: "var(--text-primary)", color: "var(--bg)",
            border: "none", borderRadius: "6px", cursor: "pointer",
            fontSize: "14px", fontFamily: "inherit",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={e => e.target.style.opacity = "0.85"}
          onMouseLeave={e => e.target.style.opacity = "1"}
        >
          Unlock
        </button>
        <p style={{ color: "var(--text-tertiary)", fontSize: "12px", marginTop: "16px" }}>
          Demo password: charles
        </p>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [isDark, setIsDark] = useState(false);
  const [isPrivateMode, setPrivateMode] = useState(false);

  const theme = isDark
    ? { "--bg": "#111", "--text-primary": "#e8e8e8", "--text-secondary": "#aaa", "--text-tertiary": "#666", "--border": "#222" }
    : { "--bg": "#fafafa", "--text-primary": "#1a1a1a", "--text-secondary": "#555", "--text-tertiary": "#999", "--border": "#e5e5e5" };

  return (
    <div style={{ ...theme, background: "var(--bg)", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: ${isDark ? "#111" : "#fafafa"}; }
        ::selection { background: ${isDark ? "#333" : "#ddd"}; }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        maxWidth: "640px", margin: "0 auto", padding: "0 24px 80px 24px",
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
        color: "var(--text-primary)", fontSize: "15px",
      }}>
        <Nav page={page} setPage={setPage} isPrivateMode={isPrivateMode} />

        <div style={{ opacity: 0, animation: "fadeSlideIn 0.3s ease forwards" }}>
          {page === "home" && <HomePage setPage={setPage} />}
          {page === "stream" && <StreamPage isPrivateMode={isPrivateMode} />}
          {page === "writing" && <WritingPage isPrivateMode={isPrivateMode} />}
          {page === "highlights" && <HighlightsPage isPrivateMode={isPrivateMode} />}
          {page === "private" && <PrivatePage isPrivateMode={isPrivateMode} setPrivateMode={setPrivateMode} />}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "80px", paddingTop: "24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>© 2026 charlesshen</span>
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", fontSize: "13px", fontFamily: "inherit",
              padding: "4px 8px", borderRadius: "4px",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.target.style.color = "var(--text-tertiary)"}
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </div>
    </div>
  );
}
