-- ═══════════════════════════════════════════════════════════
--  Unwind v4 — the Kobo library moves into the private database
-- ═══════════════════════════════════════════════════════════
--
--  Until now the books and highlights were a public file in the repo
--  (kobo-highlights.json). From here they live in three tables that
--  nobody can read directly (RLS on, no policies). Access goes through
--  these functions only:
--
--    get_library(pw)              the site, after unlocking
--    get_kobo_covers(pw, ids)     the site, cover images on demand
--    kobo_sync(key, books)        the Mac's sync job: replaces the library
--    kobo_set_covers(key, covers) the Mac's sync job: cover images
--    get_library_for_push(key)    the daily review push (GitHub Action)
--
--  The sync key lives only in the owner's macOS keychain
--  (service "unwind-kobo-sync"); this file holds its SHA-256.
--  The key is 32 random bytes, so the hash cannot be turned back into it.
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS kobo_books (
  id              TEXT PRIMARY KEY,          -- Kobo ContentID (VolumeID)
  title           TEXT NOT NULL,
  author          TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'purchased',  -- purchased | sideloaded | subscription | sample
  on_device       BOOLEAN NOT NULL DEFAULT false,
  percent_read    INT,
  read_status     INT,                       -- 0 unread, 1 reading, 2 finished
  last_read       TEXT,
  has_cover       BOOLEAN NOT NULL DEFAULT false,
  position        INT NOT NULL DEFAULT 0,    -- order from the sync (most highlights first)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kobo_highlights (
  id        BIGSERIAL PRIMARY KEY,
  book_id   TEXT NOT NULL REFERENCES kobo_books(id) ON DELETE CASCADE,
  position  INT NOT NULL DEFAULT 0,
  text      TEXT NOT NULL,
  note      TEXT NOT NULL DEFAULT '',
  chapter   TEXT NOT NULL DEFAULT '',
  created   TEXT
);
CREATE INDEX IF NOT EXISTS kobo_highlights_book ON kobo_highlights (book_id, position);

CREATE TABLE IF NOT EXISTS kobo_covers (
  book_id     TEXT PRIMARY KEY,              -- not a foreign key: covers survive a library replace
  jpeg_b64    TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kobo_books      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kobo_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE kobo_covers     ENABLE ROW LEVEL SECURITY;

-- ── the sync key ──
CREATE OR REPLACE FUNCTION kobo_sync_ok(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN p_key IS NOT NULL
     AND encode(extensions.digest(p_key, 'sha256'), 'hex') = '3f7a7f210235ca9f8780e4c4aeb2e32861085b3b1226315f6ed85192b57fce36';
END;
$$;
REVOKE ALL ON FUNCTION kobo_sync_ok(TEXT) FROM PUBLIC, anon, authenticated;

-- ── the library as the site used to read it from the JSON file ──
-- [{ id, title, author, kind, onDevice, percentRead, readStatus, lastRead,
--    hasCover, highlights: [{ text, note, chapter, date }] }]
CREATE OR REPLACE FUNCTION library_json()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(b.obj ORDER BY b.position), '[]'::jsonb)
  FROM (
    SELECT k.position, jsonb_build_object(
      'id', k.id, 'title', k.title, 'author', k.author, 'kind', k.kind,
      'onDevice', k.on_device, 'percentRead', k.percent_read, 'readStatus', k.read_status,
      'lastRead', k.last_read, 'hasCover', k.has_cover,
      'highlights', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('text', h.text, 'note', h.note, 'chapter', h.chapter, 'date', h.created) ORDER BY h.position)
        FROM kobo_highlights h WHERE h.book_id = k.id), '[]'::jsonb)
    ) AS obj
    FROM kobo_books k
  ) b;
$$;
REVOKE ALL ON FUNCTION library_json() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_library(pw TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN library_json();
END;
$$;

CREATE OR REPLACE FUNCTION get_library_for_push(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT push_sender_ok(p_key) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN library_json();
END;
$$;

CREATE OR REPLACE FUNCTION get_kobo_covers(pw TEXT, p_ids TEXT[])
RETURNS TABLE (book_id TEXT, jpeg_b64 TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT c.book_id, c.jpeg_b64 FROM kobo_covers c WHERE c.book_id = ANY (p_ids[1:200]);
END;
$$;

-- ── written by the Mac's sync job ──
-- Replaces the whole library with what the reader holds now. Refuses a
-- payload with far fewer highlights than before, so a bad export can
-- never wipe good data (the 2026-09 empty-export bug).
CREATE OR REPLACE FUNCTION kobo_sync(p_key TEXT, p_books JSONB, p_force BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_hl INT; old_hl INT; b JSONB; h JSONB; i INT := 0; j INT;
BEGIN
  IF NOT kobo_sync_ok(p_key) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF jsonb_typeof(p_books) <> 'array' THEN RAISE EXCEPTION 'books must be an array'; END IF;
  SELECT COALESCE(sum(jsonb_array_length(COALESCE(x->'highlights', '[]'::jsonb))), 0) INTO new_hl FROM jsonb_array_elements(p_books) x;
  SELECT count(*) INTO old_hl FROM kobo_highlights;
  IF NOT p_force AND new_hl < old_hl * 0.8 THEN
    RAISE EXCEPTION 'refusing: % highlights now vs % before', new_hl, old_hl;
  END IF;

  DELETE FROM kobo_highlights WHERE true;   -- the API refuses a DELETE without WHERE
  DELETE FROM kobo_books WHERE true;
  FOR b IN SELECT * FROM jsonb_array_elements(p_books) LOOP
    INSERT INTO kobo_books (id, title, author, kind, on_device, percent_read, read_status, last_read, has_cover, position)
    VALUES (b->>'id', b->>'title', COALESCE(b->>'author', ''), COALESCE(b->>'kind', 'purchased'),
            COALESCE((b->>'onDevice')::boolean, false), (b->>'percentRead')::int, (b->>'readStatus')::int,
            b->>'lastRead', EXISTS (SELECT 1 FROM kobo_covers c WHERE c.book_id = b->>'id'), i)
    ON CONFLICT (id) DO NOTHING;
    j := 0;
    FOR h IN SELECT * FROM jsonb_array_elements(COALESCE(b->'highlights', '[]'::jsonb)) LOOP
      INSERT INTO kobo_highlights (book_id, position, text, note, chapter, created)
      VALUES (b->>'id', j, h->>'text', COALESCE(h->>'note', ''), COALESCE(h->>'chapter', ''), h->>'date');
      j := j + 1;
    END LOOP;
    i := i + 1;
  END LOOP;
  RETURN jsonb_build_object('books', i, 'highlights', new_hl);
END;
$$;

-- p_covers: [{ id, b64 }], a batch at a time
CREATE OR REPLACE FUNCTION kobo_set_covers(p_key TEXT, p_covers JSONB)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c JSONB; n INT := 0;
BEGIN
  IF NOT kobo_sync_ok(p_key) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_covers) LOOP
    IF length(c->>'b64') > 400000 THEN CONTINUE; END IF;
    INSERT INTO kobo_covers (book_id, jpeg_b64, updated_at) VALUES (c->>'id', c->>'b64', now())
    ON CONFLICT (book_id) DO UPDATE SET jpeg_b64 = EXCLUDED.jpeg_b64, updated_at = now();
    UPDATE kobo_books SET has_cover = true WHERE id = c->>'id';
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ── the daily push's sender key, replaced 2026-11-04 ──
-- The old key had never been set as a GitHub secret. The new one lives in
-- the owner's keychain (service "unwind-push-sender") and in the GitHub
-- secret PUSH_SENDER_KEY; this is its SHA-256.
CREATE OR REPLACE FUNCTION push_sender_ok(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN p_key IS NOT NULL
     AND encode(extensions.digest(p_key, 'sha256'), 'hex') = 'cbf1e8562ef59c0d6df1a8388aadbe48961a74f22dbe3e1ba10844de1dcf6cb7';
END;
$$;
REVOKE ALL ON FUNCTION push_sender_ok(TEXT) FROM PUBLIC, anon, authenticated;
