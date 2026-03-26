-- ═══════════════════════════════════════════════════════════
--  Unwind — Database Setup
-- ═══════════════════════════════════════════════════════════

-- 1. Create tables
CREATE TABLE IF NOT EXISTS stream (
  id BIGSERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writing (
  id BIGSERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  read_time TEXT DEFAULT '3 min',
  private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS highlights (
  id BIGSERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#e8d5b7',
  private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

-- 3. Public can only read non-private items
CREATE POLICY "public_read_stream" ON stream FOR SELECT USING (private = false);
CREATE POLICY "public_read_writing" ON writing FOR SELECT USING (private = false);
CREATE POLICY "public_read_highlights" ON highlights FOR SELECT USING (private = false);

-- 4. Password verification (SECURITY DEFINER = source hidden from public)
CREATE OR REPLACE FUNCTION verify_pw(pw TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pw = 'everysecondcounts';
END;
$$;

-- 5. Read ALL items (including private) — requires password
CREATE OR REPLACE FUNCTION get_private_stream(pw TEXT)
RETURNS SETOF stream
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM stream ORDER BY date DESC, id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_private_writing(pw TEXT)
RETURNS SETOF writing
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM writing ORDER BY date DESC, id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_private_highlights(pw TEXT)
RETURNS SETOF highlights
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM highlights ORDER BY date DESC, id DESC;
END;
$$;

-- 6. Add entries — requires password
CREATE OR REPLACE FUNCTION add_stream(pw TEXT, p_date TEXT, p_content TEXT, p_tags TEXT[], p_private BOOLEAN)
RETURNS stream
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result stream;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO stream (date, content, tags, private)
  VALUES (p_date, p_content, p_tags, p_private) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION add_writing(pw TEXT, p_date TEXT, p_title TEXT, p_summary TEXT, p_read_time TEXT, p_private BOOLEAN)
RETURNS writing
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result writing;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO writing (date, title, summary, read_time, private)
  VALUES (p_date, p_title, p_summary, p_read_time, p_private) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION add_highlight(pw TEXT, p_date TEXT, p_title TEXT, p_description TEXT, p_color TEXT, p_private BOOLEAN)
RETURNS highlights
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result highlights;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO highlights (date, title, description, color, private)
  VALUES (p_date, p_title, p_description, p_color, p_private) RETURNING * INTO result;
  RETURN result;
END;
$$;

-- 7. Delete entries — requires password
CREATE OR REPLACE FUNCTION delete_stream(pw TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM stream WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_writing(pw TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM writing WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_highlight(pw TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM highlights WHERE id = p_id;
END;
$$;
