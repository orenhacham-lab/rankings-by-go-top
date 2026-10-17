-- ============================================================================
-- EXECUTED PROBE — 20261016170000_outreach_postal_address_page.sql
--
-- A one-column additive migration, so what is worth proving is narrow and
-- specific: that it applies to a table that already holds rows, that it applies
-- TWICE without erroring (the cron and a retry must not care), that it does not
-- quietly demand anything of the rows already there, and that it does not touch
-- the constraints the existing rows live under. A migration that broke the
-- redaction rule while adding a column would be the worst kind of change: it
-- would pass review as "additive".
--
--   'before'  the prospects table exists with a live row and a redacted row.
--   'after'   the column exists, nullable, documented, and both rows survive.
--   'repeat'  applied again over itself: no error, nothing changed.
--   'intact'  the redaction and postal-present constraints still refuse what
--             they refused before, which is what proves this was additive.
--
-- NOT run against Supabase or Production; every address below is fabricated.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/outreach-postal-address-page.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

\i supabase/migrations/20261012170000_outreach_prospects.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(p text, n text, c boolean) RETURNS void LANGUAGE sql AS
  $$ INSERT INTO results VALUES (p, n, coalesce(c, false)) $$;

-- Two rows the migration must not disturb: one live, one already redacted.
SET ROLE service_role;
INSERT INTO public.outreach_prospects
  (email, email_hash, company, site_host, platform, postal_address, source_site, source_second)
VALUES
  ('info@store.example', encode(sha256('info@store.example'::bytea), 'hex'), 'Store Example LLC',
   'store.example', 'shopify', '1420 Industrial Blvd, Nashville, TN 37210',
   'https://store.example/contact', 'https://grown.example/directory/');
INSERT INTO public.outreach_prospects
  (email, email_hash, company, site_host, platform, postal_address, source_site, source_second, redacted_at)
VALUES
  (NULL, encode(sha256('gone@store.example'::bytea), 'hex'), 'Gone Example LLC',
   'gone.example', 'wordpress', NULL,
   'https://gone.example/contact', 'https://grown.example/directory/', '2026-09-01T00:00:00Z');
RESET ROLE;

DO $$ BEGIN
  PERFORM chk('before', 'the table holds the two fixture rows',
    (SELECT count(*) = 2 FROM public.outreach_prospects));
  PERFORM chk('before', 'and has no postal_address_page column yet',
    NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outreach_prospects'
        AND column_name = 'postal_address_page'));
END $$;

\i supabase/migrations/20261016170000_outreach_postal_address_page.sql

DO $$ BEGIN
  PERFORM chk('after', 'the column exists as text',
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outreach_prospects'
        AND column_name = 'postal_address_page' AND data_type = 'text'));
  -- Nullable on purpose: rows written before this cannot say which page it was,
  -- and a guessed URL would read as evidence.
  PERFORM chk('after', 'and is nullable, so the rows already there stay legal',
    (SELECT is_nullable = 'YES' FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outreach_prospects'
        AND column_name = 'postal_address_page'));
  PERFORM chk('after', 'both fixture rows survived with the column empty',
    (SELECT count(*) = 2 FROM public.outreach_prospects WHERE postal_address_page IS NULL));
  -- The comment is the only place a stranger reading the schema learns which of
  -- the two source columns answers which question.
  PERFORM chk('after', 'the column says in the schema what it is for',
    coalesce(col_description('public.outreach_prospects'::regclass,
      (SELECT ordinal_position FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'outreach_prospects'
          AND column_name = 'postal_address_page')::int), '') LIKE '%postal address was read from%');
END $$;

\i supabase/migrations/20261016170000_outreach_postal_address_page.sql

DO $$ BEGIN
  PERFORM chk('repeat', 'applying it twice changed nothing and errored not at all',
    (SELECT count(*) = 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outreach_prospects'
        AND column_name = 'postal_address_page')
    AND (SELECT count(*) = 2 FROM public.outreach_prospects));
END $$;

-- The constraints the table already had must refuse exactly what they refused
-- before. This is what "additive" has to mean to be worth saying.
CREATE FUNCTION try_as(r text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE out text;
BEGIN
  EXECUTE format('SET ROLE %I', r);
  BEGIN
    EXECUTE sql INTO out;
    RESET ROLE;
    RETURN 'ok:' || coalesce(out, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'denied:' || SQLSTATE;
  END;
END $$;

DO $$
DECLARE r text;
BEGIN
  -- A live row with no published postal address still never enters the list,
  -- whatever it says about the page the address came from.
  r := try_as('service_role', $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, company, site_host, platform, postal_address, postal_address_page,
     source_site, source_second)
    VALUES ('new@a.example', encode(sha256('new@a.example'::bytea), 'hex'), 'A', 'a.example',
      'shopify', NULL, 'https://a.example/contact', 'https://a.example/contact',
      'https://grown.example/directory/') RETURNING 'inserted' $q$);
  PERFORM chk('intact', 'a live row with no postal address is still rejected -> ' || r, r = 'denied:23514');
  -- And a redacted row still may not keep the postal address itself.
  r := try_as('service_role', $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, company, site_host, platform, postal_address, postal_address_page,
     source_site, source_second, redacted_at)
    VALUES (NULL, encode(sha256('b@b.example'::bytea), 'hex'), 'B', 'b.example',
      'wordpress', '5 Main St, Nashville, TN 37210', 'https://b.example/contact',
      'https://b.example/contact', 'https://grown.example/directory/', now())
    RETURNING 'inserted' $q$);
  PERFORM chk('intact', 'a redacted row keeping the postal address is still rejected -> ' || r, r = 'denied:23514');
  -- What the column is for: a well-formed new row naming both pages is accepted.
  r := try_as('service_role', $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, company, site_host, platform, postal_address, postal_address_page,
     source_site, source_second)
    VALUES ('c@c.example', encode(sha256('c@c.example'::bytea), 'hex'), 'C', 'c.example',
      'shopify', '9 Market St, Nashville, TN 37210', 'https://c.example/',
      'https://c.example/contact', 'https://grown.example/directory/') RETURNING 'inserted' $q$);
  PERFORM chk('intact', 'a row naming a different page for each source is accepted -> ' || r, r = 'ok:inserted');
  PERFORM chk('intact', 'and the two pages are stored apart',
    (SELECT postal_address_page = 'https://c.example/' AND source_site = 'https://c.example/contact'
      FROM public.outreach_prospects WHERE site_host = 'c.example'));
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['before','after','repeat','intact'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;
