#!/usr/bin/env python3
"""
Kobo → Unwind 書摘同步工具
使用方式：接上 Kobo 後，在終端機執行：
  python3 ~/Desktop/charlesshen/sync-kobo.py
"""

import sqlite3, json, os, glob

# 自動尋找 Kobo 裝置
def find_kobo_db():
    # macOS: Kobo 通常掛載在 /Volumes/KOBOeReader
    paths = [
        "/Volumes/KOBOeReader/.kobo/KoboReader.sqlite",
        "/Volumes/KOBO eReader/.kobo/KoboReader.sqlite",
    ]
    # 也搜尋其他可能的掛載點
    for vol in glob.glob("/Volumes/*/"):
        candidate = os.path.join(vol, ".kobo", "KoboReader.sqlite")
        if os.path.exists(candidate) and candidate not in paths:
            paths.insert(0, candidate)

    for p in paths:
        if os.path.exists(p):
            return p

    # 如果沒插 Kobo，看看本地有沒有之前複製的
    local = os.path.join(os.path.dirname(__file__), "KoboReader.sqlite")
    if os.path.exists(local):
        return local

    return None


def export_highlights(db_path, output_path):
    conn = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    cursor = conn.cursor()

    # 建立章節對照表
    cursor.execute("SELECT ContentID, Title FROM content WHERE ContentType = 899")
    chapter_map = {}
    for cid, title in cursor.fetchall():
        file_part = cid.split('#')[0] if '#' in cid else cid
        chapter_map[file_part] = title

    # 取得書籍資訊
    cursor.execute('''
        SELECT DISTINCT BookTitle, Attribution, BookID
        FROM content
        WHERE BookID IN (SELECT DISTINCT VolumeID FROM Bookmark WHERE Text IS NOT NULL AND LENGTH(Text) > 2)
        AND BookTitle IS NOT NULL
    ''')
    book_info = {}
    for row in cursor.fetchall():
        if row[2] not in book_info:
            book_info[row[2]] = {"title": row[0], "author": row[1] or ""}

    # 閱讀進度:content 表的書籍列(ContentID = BookID)帶 ___PercentRead 與
    # ReadStatus(0=未讀 1=閱讀中 2=讀完)。書單推薦用它分「接著讀」vs「新開」。
    progress_map = {}
    try:
        cursor.execute("SELECT ContentID, ___PercentRead, ReadStatus FROM content WHERE ContentType = 6")
        for cid, pct, st in cursor.fetchall():
            progress_map[cid] = {"percent": pct or 0, "status": st or 0}
    except Exception:
        pass  # 舊韌體沒這欄位就略過,輸出維持原形

    # 取得所有書摘
    cursor.execute('''
        SELECT VolumeID, Text, Annotation, DateCreated, ContentID
        FROM Bookmark
        WHERE Text IS NOT NULL AND LENGTH(Text) > 2
        ORDER BY DateCreated
    ''')

    books = {}
    total = 0
    for row in cursor.fetchall():
        vid, text, annotation, date, content_id = row
        if vid not in book_info:
            continue
        if vid not in books:
            info = book_info[vid]
            prog = progress_map.get(vid, {})
            books[vid] = {"title": info["title"], "author": info["author"],
                          "percentRead": prog.get("percent", None),
                          "readStatus": prog.get("status", None),
                          "highlights": []}

        chapter = chapter_map.get(content_id, "")
        books[vid]["highlights"].append({
            "text": text.strip(),
            "note": (annotation or "").strip(),
            "chapter": chapter,
            "date": date
        })
        total += 1

    result = sorted(books.values(), key=lambda b: len(b["highlights"]), reverse=True)

    if total == 0:
        conn.close()
        raise SystemExit("❌ 讀到 0 條書摘,不覆蓋舊檔。請檢查 Kobo 資料庫或腳本。")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    conn.close()
    return total, len(result)


def main():
    print("📚 Kobo → Unwind 書摘同步工具")
    print("=" * 40)

    db_path = find_kobo_db()
    if not db_path:
        print("❌ 找不到 Kobo 裝置！")
        print("   請確認 Kobo 已接上電腦，或把 KoboReader.sqlite 複製到這個資料夾。")
        return

    print(f"✅ 找到資料庫: {db_path}")

    output_path = os.path.join(os.path.dirname(__file__), "kobo-highlights.json")
    total, book_count = export_highlights(db_path, output_path)

    print(f"✅ 匯出完成！{total} 條書摘，{book_count} 本書")
    print(f"   儲存到: {output_path}")
    print()
    print("下一步：把 kobo-highlights.json 上傳到 GitHub repo 即可更新網站。")


if __name__ == "__main__":
    main()
