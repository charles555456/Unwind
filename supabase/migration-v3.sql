-- ═══════════════════════════════════════════════════════════
--  Unwind — Migration v3
--  Review scope sync · Read Later · Newsletter inbox · App notifications
--
--  Run once in the Supabase SQL Editor. Safe to run again.
--  Contains no secrets. Every write and every private read goes
--  through verify_pw(), the same check the rest of the site uses.
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ───────────────────────────────────────────────────────────
--  1. Public settings (nothing sensitive: the Review scope)
--     Readable by anyone so the push script can read it.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_settings" ON settings;
CREATE POLICY "public_read_settings" ON settings FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION set_setting(pw TEXT, p_key TEXT, p_value JSONB)
RETURNS settings
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result settings;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO settings (key, value, updated_at) VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$;

-- ───────────────────────────────────────────────────────────
--  2. Private settings (newsletter feed address)
--     RLS on, no policy: only the functions below can touch it.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE private_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_private_settings(pw TEXT)
RETURNS SETOF private_settings
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM private_settings;
END;
$$;

CREATE OR REPLACE FUNCTION set_private_setting(pw TEXT, p_key TEXT, p_value JSONB)
RETURNS private_settings
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result private_settings;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO private_settings (key, value, updated_at) VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$;

-- ───────────────────────────────────────────────────────────
--  3. Fetching a page on the site's behalf
--     Browsers cannot read other sites directly, so the database
--     fetches the page and hands the HTML back.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fetch_url(pw TEXT, p_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE resp extensions.http_response;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_url !~* '^https?://[^/]+' THEN RAISE EXCEPTION 'only http and https addresses are allowed'; END IF;
  -- no reaching into private networks
  IF p_url ~* '^https?://(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)' THEN
    RAISE EXCEPTION 'address not allowed';
  END IF;

  BEGIN
    PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  EXCEPTION WHEN OTHERS THEN NULL; -- older extension versions: keep the default
  END;

  SELECT * INTO resp FROM extensions.http((
    'GET', p_url,
    ARRAY[
      extensions.http_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'),
      extensions.http_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
      extensions.http_header('Accept-Language', 'zh-TW,zh;q=0.9,en;q=0.8')
    ],
    NULL, NULL
  )::extensions.http_request);

  RETURN jsonb_build_object(
    'status', resp.status,
    'content_type', resp.content_type,
    'content', resp.content
  );
END;
$$;

-- ───────────────────────────────────────────────────────────
--  4. Read Later
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  site TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  archived BOOLEAN DEFAULT false
);
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS article_highlights (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE article_highlights ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS article_highlights_article_idx ON article_highlights(article_id);

-- list without the body, so the list stays light
CREATE OR REPLACE FUNCTION get_articles(pw TEXT)
RETURNS TABLE (
  id BIGINT, url TEXT, title TEXT, site TEXT, author TEXT, excerpt TEXT,
  saved_at TIMESTAMPTZ, read_at TIMESTAMPTZ, archived BOOLEAN, highlight_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT a.id, a.url, a.title, a.site, a.author, a.excerpt,
           a.saved_at, a.read_at, a.archived,
           (SELECT count(*) FROM article_highlights h WHERE h.article_id = a.id)
    FROM articles a
    ORDER BY a.saved_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_article(pw TEXT, p_id BIGINT)
RETURNS articles
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result articles;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO result FROM articles WHERE articles.id = p_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION add_article(
  pw TEXT, p_url TEXT, p_title TEXT, p_site TEXT, p_author TEXT, p_excerpt TEXT, p_content TEXT
)
RETURNS articles
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result articles;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO articles (url, title, site, author, excerpt, content)
  VALUES (p_url, p_title, p_site, p_author, p_excerpt, p_content)
  ON CONFLICT (url) DO UPDATE SET
    title = EXCLUDED.title, site = EXCLUDED.site, author = EXCLUDED.author,
    excerpt = EXCLUDED.excerpt, content = EXCLUDED.content, archived = false
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION update_article(pw TEXT, p_id BIGINT, p_read BOOLEAN, p_archived BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE articles SET
    read_at = CASE WHEN p_read IS NULL THEN read_at WHEN p_read THEN COALESCE(read_at, now()) ELSE NULL END,
    archived = COALESCE(p_archived, archived)
  WHERE articles.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_article(pw TEXT, p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM articles WHERE articles.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_article_highlights(pw TEXT)
RETURNS TABLE (
  id BIGINT, article_id BIGINT, text TEXT, note TEXT, created_at TIMESTAMPTZ,
  article_title TEXT, article_url TEXT, article_site TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT h.id, h.article_id, h.text, h.note, h.created_at, a.title, a.url, a.site
    FROM article_highlights h JOIN articles a ON a.id = h.article_id
    ORDER BY h.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION add_article_highlight(pw TEXT, p_article_id BIGINT, p_text TEXT, p_note TEXT)
RETURNS article_highlights
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result article_highlights;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO article_highlights (article_id, text, note)
  VALUES (p_article_id, p_text, COALESCE(p_note, ''))
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION delete_article_highlight(pw TEXT, p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM article_highlights WHERE article_highlights.id = p_id;
END;
$$;

-- ───────────────────────────────────────────────────────────
--  5. Newsletter inbox
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox (
  id BIGSERIAL PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  sender TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE inbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_inbox(pw TEXT)
RETURNS TABLE (
  id BIGINT, entry_id TEXT, title TEXT, sender TEXT,
  received_at TIMESTAMPTZ, read_at TIMESTAMPTZ, archived BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT i.id, i.entry_id, i.title, i.sender, i.received_at, i.read_at, i.archived
    FROM inbox i
    ORDER BY i.received_at DESC NULLS LAST, i.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_inbox_item(pw TEXT, p_id BIGINT)
RETURNS inbox
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result inbox;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO result FROM inbox WHERE inbox.id = p_id;
  RETURN result;
END;
$$;

-- p_items: [{ "entry_id", "title", "sender", "content", "received_at" }, ...]
-- Returns how many were new.
CREATE OR REPLACE FUNCTION add_inbox_items(pw TEXT, p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE added INTEGER;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  WITH ins AS (
    INSERT INTO inbox (entry_id, title, sender, content, received_at)
    SELECT x->>'entry_id',
           COALESCE(x->>'title', ''),
           COALESCE(x->>'sender', ''),
           COALESCE(x->>'content', ''),
           NULLIF(x->>'received_at', '')::timestamptz
    FROM jsonb_array_elements(p_items) AS x
    WHERE COALESCE(x->>'entry_id', '') <> ''
    ON CONFLICT (entry_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO added FROM ins;
  RETURN added;
END;
$$;

CREATE OR REPLACE FUNCTION update_inbox_item(pw TEXT, p_id BIGINT, p_read BOOLEAN, p_archived BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE inbox SET
    read_at = CASE WHEN p_read IS NULL THEN read_at WHEN p_read THEN COALESCE(read_at, now()) ELSE NULL END,
    archived = COALESCE(p_archived, archived)
  WHERE inbox.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_inbox_item(pw TEXT, p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM inbox WHERE inbox.id = p_id;
END;
$$;

-- ───────────────────────────────────────────────────────────
--  6. App notifications
--     Each phone that turns on notifications leaves one row here.
--     Adding or removing a phone needs the site password.
--     The daily sender reads the list with its own key.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_success_at TIMESTAMPTZ
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- The sender key lives only in GitHub secrets. This is its SHA-256.
-- The key is 32 random bytes, so the hash cannot be turned back into it.
CREATE OR REPLACE FUNCTION push_sender_ok(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN p_key IS NOT NULL
     AND encode(extensions.digest(p_key, 'sha256'), 'hex') = '108f4fab48cdc935c49c7a63534353fbe8b8b3148a359716a26845959f5a4822';
END;
$$;
REVOKE ALL ON FUNCTION push_sender_ok(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION add_push_subscription(
  pw TEXT, p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_user_agent TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_endpoint !~* '^https://' THEN RAISE EXCEPTION 'bad endpoint'; END IF;
  INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent)
  VALUES (p_endpoint, p_p256dh, p_auth, left(COALESCE(p_user_agent, ''), 300))
  ON CONFLICT (endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
END;
$$;

CREATE OR REPLACE FUNCTION remove_push_subscription(pw TEXT, p_endpoint TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
END;
$$;

CREATE OR REPLACE FUNCTION get_push_subscriptions(p_key TEXT)
RETURNS TABLE (endpoint TEXT, p256dh TEXT, auth TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT push_sender_ok(p_key) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT s.endpoint, s.p256dh, s.auth FROM push_subscriptions s ORDER BY s.id;
END;
$$;

-- p_ok true: delivered. p_ok false: the phone no longer accepts it, so forget it.
CREATE OR REPLACE FUNCTION report_push_result(p_key TEXT, p_endpoint TEXT, p_ok BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT push_sender_ok(p_key) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_ok THEN
    UPDATE push_subscriptions SET last_success_at = now() WHERE endpoint = p_endpoint;
  ELSE
    DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  END IF;
END;
$$;
