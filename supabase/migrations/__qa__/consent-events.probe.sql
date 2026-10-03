-- ============================================================================
-- EXECUTED PROBE — 20261003000000_consent_events.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles AND Supabase's
-- DEFAULT PRIVILEGES for new tables in `public`. The default grants are the
-- point: the consent log is the first table in this schema that NO browser role
-- may touch at all, so "the migration revokes what Supabase hands out" is the
-- claim under test, not an assumption.
--
--   'after'     anon and authenticated can neither read nor write; RLS is on
--               with no permissive policy; nothing anywhere has UPDATE or
--               DELETE (the log is append-only); service_role writes.
--   'mutated'   MUTATION CONTROL. Supabase's default grants are put back and a
--               permissive policy is added. Every isolation check must now
--               report a leak — a check that cannot fail tests nothing.
--   'restored'  the migration is applied again over the broken state and every
--               check holds again.
--   'limits'    the CHECK constraints: the closed action list (so a future
--               "implied by browsing" cannot be recorded as a decision), the
--               locale list, the lengths, categories having to be an object.
--   'dedupe'    a retried keepalive write in the same second collapses into one
--               row, while a genuine later change of mind is its own row.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/consent-events.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20261003000000_consent_events.sql
\i supabase/migrations/20261003000000_consent_events.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Run `sql` as `role_name` inside a subtransaction that is ALWAYS rolled back,
-- so no check leaves a row behind for the next one. Returns 'ok:<scalar>' or
-- 'denied:<sqlstate>'.
CREATE FUNCTION try_as(role_name text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE sql INTO r;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback:' || coalesce(r, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'rollback:%' THEN RETURN 'ok:' || substr(SQLERRM, 10); END IF;
    RETURN 'denied:' || SQLSTATE;
  END;
END; $$;

-- The isolation claims, run once per phase so the mutation control exercises
-- exactly the same assertions against deliberately broken grants.
CREATE FUNCTION isolation(ph text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- A browser role must not be able to read the consent log of every visitor.
  PERFORM chk(ph, 'anon cannot read the log',
    try_as('anon', 'SELECT count(*)::text FROM public.consent_events') LIKE 'denied:%');
  PERFORM chk(ph, 'authenticated cannot read the log',
    try_as('authenticated', 'SELECT count(*)::text FROM public.consent_events') LIKE 'denied:%');
  -- Nor write a row the server did not author: a forged record is worse than no
  -- record, because the log's whole job is to be evidence.
  PERFORM chk(ph, 'anon cannot write the log',
    try_as('anon', $q$INSERT INTO public.consent_events (consent_id, policy_version, action, categories)
      VALUES ('forged', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb) RETURNING id::text$q$) LIKE 'denied:%');
  PERFORM chk(ph, 'authenticated cannot write the log',
    try_as('authenticated', $q$INSERT INTO public.consent_events (consent_id, policy_version, action, categories)
      VALUES ('forged', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb) RETURNING id::text$q$) LIKE 'denied:%');
  -- RLS on regardless of the grants: the second lock, so a future grant by
  -- mistake still finds no permissive policy behind it.
  PERFORM chk(ph, 'row level security is enabled',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consent_events'::regclass));
  PERFORM chk(ph, 'no permissive policy exists',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_events') = 0);
  -- Append-only: a decision already recorded can never be edited or erased.
  -- Scoped to the roles the application connects as. The table's OWNER
  -- necessarily holds every privilege (that is what owning means) and migrations
  -- run as the owner; what matters is that no role a request can arrive under
  -- was granted the power to edit or erase a recorded decision.
  PERFORM chk(ph, 'no app role has UPDATE or DELETE on the log',
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'consent_events'
        AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
        AND privilege_type IN ('UPDATE', 'DELETE')) = 0);
  -- And the one writer still works.
  PERFORM chk(ph, 'service_role writes the log',
    try_as('service_role', $q$INSERT INTO public.consent_events (consent_id, policy_version, action, categories, locale, ip_hash)
      VALUES ('probe', '2026-10-03', 'reject_all', '{"necessary":true,"analytics":false,"marketing":false}'::jsonb, 'he', repeat('a', 64))
      RETURNING id::text$q$) LIKE 'ok:%');
END; $$;

SELECT isolation('after');

-- MUTATION CONTROL: hand the browser roles everything and open a policy.
GRANT ALL ON TABLE public.consent_events TO anon, authenticated;
CREATE POLICY consent_events_wide_open ON public.consent_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- `mutated` rows are INVERTED on purpose: here a passing isolation check is the
-- failure, so each one is recorded as the negation of itself.
CREATE FUNCTION mutated() RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  PERFORM isolation('mutated-raw');
  -- Only the claims this mutation actually breaks are inverted. `row level
  -- security is enabled` and `service_role writes the log` are TRUE in both
  -- states — the mutation adds grants and a permissive policy, it does not turn
  -- RLS off — so inverting them would assert the opposite of the truth.
  FOR r IN SELECT name, ok FROM results WHERE phase = 'mutated-raw'
      AND name NOT IN ('service_role writes the log', 'row level security is enabled') LOOP
    PERFORM chk('mutated', 'the leak is caught: ' || r.name, NOT r.ok);
  END LOOP;
  PERFORM chk('mutated', 'row level security stays on even while the grants are wrong',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consent_events'::regclass));
  DELETE FROM results WHERE phase = 'mutated-raw';
END; $$;
SELECT mutated();

DROP POLICY IF EXISTS consent_events_wide_open ON public.consent_events;
REVOKE ALL ON TABLE public.consent_events FROM anon, authenticated;
\i supabase/migrations/20261003000000_consent_events.sql
SELECT isolation('restored');

-- ---------------------------------------------------------------------------
-- The constraints. Each one is a thing the application must not be able to
-- record, checked by trying it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE ins text := 'INSERT INTO public.consent_events (consent_id, policy_version, action, categories';
BEGIN
  PERFORM chk('limits', 'an action outside the closed list is refused',
    try_as('service_role', ins || $q$) VALUES ('c1', '2026-10-03', 'implied_by_browsing', '{"necessary":true}'::jsonb) RETURNING id::text$q$) LIKE 'denied:23514');
  PERFORM chk('limits', 'a locale we do not publish is refused',
    try_as('service_role', ins || $q$, locale) VALUES ('c2', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb, 'fr') RETURNING id::text$q$) LIKE 'denied:23514');
  PERFORM chk('limits', 'categories must be a JSON object, not a bare string',
    try_as('service_role', ins || $q$) VALUES ('c3', '2026-10-03', 'accept_all', '"all"'::jsonb) RETURNING id::text$q$) LIKE 'denied:23514');
  PERFORM chk('limits', 'an over-long user agent is refused',
    try_as('service_role', ins || $q$, user_agent) VALUES ('c4', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb, repeat('x', 401)) RETURNING id::text$q$) LIKE 'denied:23514');
  PERFORM chk('limits', 'an empty consent id is refused',
    try_as('service_role', ins || $q$) VALUES ('', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb) RETURNING id::text$q$) LIKE 'denied:23514');
  -- All five legal actions must be storable, including the two that record a
  -- refusal (reject_all, gpc) and the one that records a grant ending (withdraw).
  PERFORM chk('limits', 'every legal action is accepted',
    try_as('service_role', $q$INSERT INTO public.consent_events (consent_id, policy_version, action, categories) VALUES
      ('c5', '2026-10-03', 'accept_all', '{"necessary":true,"analytics":true,"marketing":true}'::jsonb),
      ('c6', '2026-10-03', 'reject_all', '{"necessary":true,"analytics":false,"marketing":false}'::jsonb),
      ('c7', '2026-10-03', 'custom',     '{"necessary":true,"analytics":true,"marketing":false}'::jsonb),
      ('c8', '2026-10-03', 'withdraw',   '{"necessary":true,"analytics":false,"marketing":false}'::jsonb),
      ('c9', '2026-10-03', 'gpc',        '{"necessary":true,"analytics":false,"marketing":false}'::jsonb)
      RETURNING id::text$q$) LIKE 'ok:%');
  -- The address column exists but nothing forces it: a visitor behind a proxy
  -- we cannot read still gets their decision recorded.
  PERFORM chk('limits', 'a decision is recorded even with no address to hash',
    try_as('service_role', ins || $q$) VALUES ('c10', '2026-10-03', 'reject_all', '{"necessary":true}'::jsonb) RETURNING id::text$q$) LIKE 'ok:%');
END $$;

-- The dedupe index, which needs rows that persist, so it runs outside try_as.
SET ROLE service_role;
INSERT INTO public.consent_events (consent_id, policy_version, action, categories, created_at)
  VALUES ('dup', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb, '2026-10-03T12:00:00.100Z');
DO $$
DECLARE second_write boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.consent_events (consent_id, policy_version, action, categories, created_at)
      VALUES ('dup', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb, '2026-10-03T12:00:00.900Z');
    second_write := true;
  EXCEPTION WHEN unique_violation THEN second_write := false;
  END;
  PERFORM chk('dedupe', 'a retried write in the same second is collapsed', NOT second_write);
END $$;
DO $$
DECLARE other_action boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.consent_events (consent_id, policy_version, action, categories, created_at)
      VALUES ('dup', '2026-10-03', 'withdraw', '{"necessary":true}'::jsonb, '2026-10-03T12:00:00.900Z');
    other_action := true;
  EXCEPTION WHEN unique_violation THEN other_action := false;
  END;
  PERFORM chk('dedupe', 'a change of mind in the same second is its own row', other_action);
END $$;
DO $$
DECLARE later boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.consent_events (consent_id, policy_version, action, categories, created_at)
      VALUES ('dup', '2026-10-03', 'accept_all', '{"necessary":true}'::jsonb, '2026-10-03T12:00:05Z');
    later := true;
  EXCEPTION WHEN unique_violation THEN later := false;
  END;
  PERFORM chk('dedupe', 'the same decision five seconds later is its own row', later);
END $$;
RESET ROLE;

-- The table carries what Art. 7(1) has to be answerable from later.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['consent_id','policy_version','action','categories','locale','page_path','ip_hash','user_agent','user_id','decided_at','created_at'] LOOP
    PERFORM chk('columns', 'the log keeps ' || c,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'consent_events' AND column_name = c));
  END LOOP;
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;
