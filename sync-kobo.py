#!/usr/bin/env python3
"""
Kobo → Unwind library sync.

Reads the reader's database while it is plugged in, and uploads the whole
library (books, reading progress, highlights) and the cover thumbnails to
the private Supabase tables. Nothing is written to the public repo.

Run by hand:     python3 ~/Desktop/charlesshen/sync-kobo.py
Run on plug-in:  ~/.kobo-sync/auto-sync-kobo.sh (launchd), which runs the
                 copy at ~/.kobo-sync/sync-kobo.py

The upload key is read from the macOS keychain (service "unwind-kobo-sync").
A local backup of the export is kept at ~/.kobo-sync/kobo-library-backup.json;
it is not part of the site.
"""

import base64, glob, json, os, sqlite3, subprocess, sys

SUPABASE_URL = "https://zoriszrkgoqfqorudcth.supabase.co"
# the public anon key index.html also ships with; on its own it can only call the
# password- or key-checked functions. Kept here because launchd cannot read ~/Desktop.
SUPABASE_ANON = "sb_publishable_2WDf4cHELLvK_EWEWwKKwA_WJ_6vTBq"
KEYCHAIN_SERVICE = "unwind-kobo-sync"
COVER_BATCH = 40


def find_kobo():
    """The mounted reader's root folder, or None."""
    roots = ["/Volumes/KOBOeReader", "/Volumes/KOBO eReader"]
    roots += [v.rstrip("/") for v in glob.glob("/Volumes/*/") if v.rstrip("/") not in roots]
    for r in roots:
        if os.path.exists(os.path.join(r, ".kobo", "KoboReader.sqlite")):
            return r
    return None


# ── export ──
def kind_of(access, downloaded, content_id):
    if access == 1:
        return "purchased"
    if access == 8:
        return "subscription"
    if access == 6:
        return "sample"
    return "sideloaded" if downloaded or content_id.startswith("file://") else "purchased"


def export_library(db_path):
    conn = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    cur = conn.cursor()

    # chapter titles, for each highlight
    chapter_map = {}
    for cid, title in cur.execute("SELECT ContentID, Title FROM content WHERE ContentType = 899").fetchall():
        chapter_map[cid.split("#")[0] if "#" in cid else cid] = title

    # highlights, grouped by book
    highlights = {}
    rows = cur.execute("""
        SELECT VolumeID, Text, Annotation, DateCreated, ContentID
        FROM Bookmark
        WHERE Text IS NOT NULL AND LENGTH(Text) > 2
        ORDER BY DateCreated
    """).fetchall()
    for vid, text, annotation, date, content_id in rows:
        highlights.setdefault(vid, []).append({
            "text": text.strip(),
            "note": (annotation or "").strip(),
            "chapter": chapter_map.get(content_id, ""),
            "date": date,
        })

    # the library: bought, own files, Kobo Plus, and anything opened or highlighted;
    # store listings the reader merely knows about are left out
    books = []
    rows = cur.execute("""
        SELECT ContentID, Title, Attribution, ___PercentRead, ReadStatus, DateLastRead,
               ImageId, IsDownloaded, Accessibility
        FROM content WHERE ContentType = 6 AND Title IS NOT NULL
    """).fetchall()
    for cid, title, author, pct, status, last, image_id, downloaded, access in rows:
        downloaded = str(downloaded).lower() == "true"
        hl = highlights.get(cid, [])
        if not (access == 1 or downloaded or (status or 0) > 0 or hl):
            continue
        books.append({
            "id": cid, "title": title, "author": author or "",
            "kind": kind_of(access, downloaded, cid), "onDevice": downloaded,
            "percentRead": pct or 0, "readStatus": status or 0, "lastRead": last,
            "imageId": image_id or "", "highlights": hl,
        })
    conn.close()

    # most highlighted first, then most recently opened
    books.sort(key=lambda b: (len(b["highlights"]), str(b["lastRead"] or "")), reverse=True)
    total = sum(len(b["highlights"]) for b in books)
    if total == 0:
        raise SystemExit("讀到 0 條書摘，不上傳。請檢查 Kobo 資料庫或腳本。")
    return books, total


def find_covers(root, books):
    """book id → path of its library thumbnail on the reader"""
    suffix = " - N3_LIBRARY_GRID.parsed"
    index = {}
    for d, _, files in os.walk(os.path.join(root, ".kobo-images")):
        for f in files:
            if f.endswith(suffix):
                index[f[: -len(suffix)]] = os.path.join(d, f)
    return {b["id"]: index[b["imageId"]] for b in books if b["imageId"] in index}


# ── upload ──
def sync_key():
    try:
        return subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
                              check=True, capture_output=True, text=True).stdout.strip()
    except subprocess.CalledProcessError:
        raise SystemExit("鑰匙圈裡沒有 unwind-kobo-sync 金鑰，無法上傳。")


def rpc(name, args, anon):
    # curl rather than urllib: it uses the system's certificates, which the
    # python.org build of Python does not have unless set up separately
    res = subprocess.run(
        ["curl", "-sS", "--fail-with-body", "--max-time", "180", "-X", "POST",
         SUPABASE_URL + "/rest/v1/rpc/" + name,
         "-H", "apikey: " + anon, "-H", "Content-Type: application/json", "--data-binary", "@-"],
        input=json.dumps(args).encode("utf-8"), capture_output=True)
    if res.returncode != 0:
        raise SystemExit(f"上傳失敗（{name}）：{(res.stdout or res.stderr).decode('utf-8', 'replace')[:300]}")
    return json.loads(res.stdout or b"null")


def main():
    force = "--force" in sys.argv
    print("Kobo → Unwind 書庫同步")
    root = find_kobo()
    if not root:
        raise SystemExit("找不到 Kobo。請確認閱讀器已接上電腦。")
    print("找到閱讀器：", root)

    books, total = export_library(os.path.join(root, ".kobo", "KoboReader.sqlite"))
    print(f"書庫 {len(books)} 本，書摘 {total} 條（有書摘的 {sum(1 for b in books if b['highlights'])} 本）")

    # local backup, private to this Mac
    backup = os.path.expanduser("~/.kobo-sync/kobo-library-backup.json")
    with open(backup, "w", encoding="utf-8") as f:
        json.dump([{k: v for k, v in b.items() if k != "imageId"} for b in books], f, ensure_ascii=False, indent=1)

    anon, key = SUPABASE_ANON, sync_key()
    payload = [{k: v for k, v in b.items() if k != "imageId"} for b in books]
    res = rpc("kobo_sync", {"p_key": key, "p_books": payload, "p_force": force}, anon)
    print("已上傳書庫：", res)

    covers = find_covers(root, books)
    items = list(covers.items())
    sent = 0
    for i in range(0, len(items), COVER_BATCH):
        batch = []
        for book_id, path in items[i:i + COVER_BATCH]:
            with open(path, "rb") as f:
                batch.append({"id": book_id, "b64": base64.b64encode(f.read()).decode("ascii")})
        sent += rpc("kobo_set_covers", {"p_key": key, "p_covers": batch}, anon) or 0
    print(f"已上傳封面 {sent} 張")


if __name__ == "__main__":
    main()
