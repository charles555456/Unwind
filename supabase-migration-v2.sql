-- ═══════════════════════════════════════════════════════════
--  Unwind — Migration v2: Draft + Edit + Writing Tags
--  Run this in Supabase SQL Editor AFTER the initial setup
-- ═══════════════════════════════════════════════════════════

-- 1. Add draft column to all tables
ALTER TABLE stream ADD COLUMN IF NOT EXISTS draft BOOLEAN DEFAULT false;
ALTER TABLE writing ADD COLUMN IF NOT EXISTS draft BOOLEAN DEFAULT false;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS draft BOOLEAN DEFAULT false;

-- 2. Add tags column to writing table
ALTER TABLE writing ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 3. Update public read policies — hide drafts from public
DROP POLICY IF EXISTS "public_read_stream" ON stream;
DROP POLICY IF EXISTS "public_read_writing" ON writing;
DROP POLICY IF EXISTS "public_read_highlights" ON highlights;

CREATE POLICY "public_read_stream" ON stream FOR SELECT USING (private = false AND draft = false);
CREATE POLICY "public_read_writing" ON writing FOR SELECT USING (private = false AND draft = false);
CREATE POLICY "public_read_highlights" ON highlights FOR SELECT USING (private = false AND draft = false);

-- 4. Update add functions to support draft + writing tags
CREATE OR REPLACE FUNCTION add_stream(pw TEXT, p_date TEXT, p_content TEXT, p_tags TEXT[], p_private BOOLEAN, p_draft BOOLEAN DEFAULT false)
RETURNS stream
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result stream;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO stream (date, content, tags, private, draft)
  VALUES (p_date, p_content, p_tags, p_private, p_draft) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION add_writing(pw TEXT, p_date TEXT, p_title TEXT, p_summary TEXT, p_read_time TEXT, p_tags TEXT[] DEFAULT '{}', p_private BOOLEAN DEFAULT false, p_draft BOOLEAN DEFAULT false)
RETURNS writing
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result writing;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO writing (date, title, summary, read_time, tags, private, draft)
  VALUES (p_date, p_title, p_summary, p_read_time, p_tags, p_private, p_draft) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION add_highlight(pw TEXT, p_date TEXT, p_title TEXT, p_description TEXT, p_color TEXT, p_private BOOLEAN, p_draft BOOLEAN DEFAULT false)
RETURNS highlights
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result highlights;
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO highlights (date, title, description, color, private, draft)
  VALUES (p_date, p_title, p_description, p_color, p_private, p_draft) RETURNING * INTO result;
  RETURN result;
END;
$$;

-- 5. Update (edit) functions — requires password
CREATE OR REPLACE FUNCTION update_stream(pw TEXT, p_id BIGINT, p_content TEXT, p_tags TEXT[], p_private BOOLEAN, p_draft BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE stream SET content = p_content, tags = p_tags, private = p_private, draft = p_draft WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_writing(pw TEXT, p_id BIGINT, p_title TEXT, p_summary TEXT, p_read_time TEXT, p_tags TEXT[] DEFAULT '{}', p_private BOOLEAN DEFAULT false, p_draft BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE writing SET title = p_title, summary = p_summary, read_time = p_read_time, tags = p_tags, private = p_private, draft = p_draft WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_highlight(pw TEXT, p_id BIGINT, p_title TEXT, p_description TEXT, p_color TEXT, p_private BOOLEAN, p_draft BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT verify_pw(pw) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE highlights SET title = p_title, description = p_description, color = p_color, private = p_private, draft = p_draft WHERE id = p_id;
END;
$$;
