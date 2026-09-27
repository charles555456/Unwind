-- ═══════════════════════════════════════════════════════════
--  Unwind — change the Private password
--
--  Why: the first setup script kept the password in plain text
--  inside verify_pw(), and that script was published with the site.
--  After this runs, the database stores only a salted hash, and the
--  password no longer appears in any file.
--
--  How:
--    1. Replace CHANGE_ME on the line marked below with a new password.
--    2. Run the whole script in the Supabase SQL Editor.
--    3. Do not save the edited script anywhere. Close the tab.
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS app_secret (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pw_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS on with no policy: nobody can read the hash through the API
ALTER TABLE app_secret ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  new_pw TEXT := 'CHANGE_ME';   -- ← put the new password here
BEGIN
  IF new_pw = 'CHANGE_ME' OR length(new_pw) < 10 THEN
    RAISE EXCEPTION 'Set a new password of at least 10 characters before running. Nothing was changed.';
  END IF;
  INSERT INTO app_secret (id, pw_hash, updated_at)
  VALUES (1, extensions.crypt(new_pw, extensions.gen_salt('bf', 10)), now())
  ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION verify_pw(pw TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE h TEXT;
BEGIN
  SELECT pw_hash INTO h FROM app_secret WHERE id = 1;
  IF h IS NULL OR pw IS NULL THEN RETURN false; END IF;
  RETURN h = extensions.crypt(pw, h);
END;
$$;
