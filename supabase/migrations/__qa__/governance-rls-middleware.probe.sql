-- ============================================================================
-- EXECUTED PROBE — which database ROLE can read public.billing_governance.
--
-- WHY THIS EXISTS. PR #53 fixed decideShopifyRouteAccess, shipped, and
-- Production still answered 307 -> /billing. The predicate was never reached:
-- proxy.ts built its Supabase client from the ANON key plus the merchant's
-- session, so PostgREST ran the governance read as `authenticated` against a
-- table that grants only service_role. Whether that read ERRORS or merely
-- returns nothing decides how the failure surfaces, and both were consistent
-- with the observed 307 — so it was ASSERTED from the migration text rather
-- than proven. This probe proves it.
--
-- RUN against a disposable PostgreSQL cluster (initdb, discarded afterwards).
-- NOT against Supabase, NOT against Production, and no production data was
-- read. The user id below is the one from the incident report; the row is
-- created here, not fetched.
--
-- Result at time of commit: 6 passed, 0 failed.
--
-- To re-run (initdb refuses to run as root — use an unprivileged user):
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 55451' start
--   psql -h 127.0.0.1 -p 55451 -U postgres -f <this file>
-- ============================================================================

CREATE ROLE anon LOGIN; CREATE ROLE authenticated LOGIN; CREATE ROLE service_role LOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.billing_governance (
  user_id uuid PRIMARY KEY, signup_origin text NOT NULL,
  billing_authority text NOT NULL, authority_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- ── VERBATIM from 20260901000000_billing_governance.sql:85-87 ───────────────
ALTER TABLE public.billing_governance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_governance FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_governance TO service_role;
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority, authority_reason)
VALUES ('674fc7c3-2048-48f4-ba25-6e2a6dff4a06', 'shopify_app_store', 'shopify', 'verified_app_store_install');

CREATE TABLE results (name text, ok boolean);
CREATE OR REPLACE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (n, COALESCE(c,false)); END; $$;

/**
 * Read the table as `role` and report what actually happened:
 *   'denied:<sqlstate>' — the read was refused
 *   'rows:<n>'          — the read succeeded, returning n rows
 */
CREATE OR REPLACE FUNCTION read_as(role_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role_name);
  EXECUTE 'SELECT count(*) FROM public.billing_governance WHERE user_id = ''674fc7c3-2048-48f4-ba25-6e2a6dff4a06''' INTO n;
  RESET ROLE;
  RETURN 'rows:' || n;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'denied:' || SQLSTATE;
END; $$;

DO $$
BEGIN
  -- 1-2. THE INCIDENT. The middleware's session client runs as `authenticated`
  -- and is REFUSED — an error, not an empty result. loadBillingGovernance maps
  -- that to status 'unavailable', resolveBillingAuthority to ok:false, and
  -- isShopifyGovernedAndActive to governed:true/active:false => 307 /billing,
  -- with decideShopifyRouteAccess never called.
  PERFORM chk('1: `authenticated` is REFUSED, not given an empty result',
    read_as('authenticated') = 'denied:42501');
  PERFORM chk('2: `anon` is refused identically', read_as('anon') = 'denied:42501');

  -- 3. A bare service_role still sees NOTHING, because RLS is on with no
  -- policies. The fix therefore depends on service_role having BYPASSRLS.
  PERFORM chk('3: service_role WITHOUT bypassrls reads 0 rows (RLS, no policies)',
    read_as('service_role') = 'rows:0');

  -- 4. Supabase creates service_role WITH BYPASSRLS, which is what makes the
  -- corrected middleware work. Independently corroborated in Production:
  -- /api/shopify/app-home uses createAdminClient() and DID read
  -- billing_authority='shopify' for this exact account.
  EXECUTE 'ALTER ROLE service_role BYPASSRLS';
  PERFORM chk('4: service_role WITH bypassrls reads the row — the fix works',
    read_as('service_role') = 'rows:1');

  -- 5. Sanity: the row really is the incident's row.
  PERFORM chk('5: and it carries billing_authority = shopify',
    (SELECT billing_authority FROM public.billing_governance
      WHERE user_id = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06') = 'shopify');

  -- 6. NEGATIVE CONTROL — read_as() is not a function that always says
  -- 'denied'. Granting authenticated a policy + grant makes it succeed, so
  -- test 1 is a real observation about the migration's posture.
  EXECUTE 'CREATE POLICY p ON public.billing_governance FOR SELECT TO authenticated USING (true)';
  EXECUTE 'GRANT SELECT ON public.billing_governance TO authenticated';
  PERFORM chk('6: NEGATIVE CONTROL — with a policy + grant, authenticated CAN read',
    read_as('authenticated') = 'rows:1');
END $$;

SELECT CASE WHEN ok THEN '  ok  ' ELSE ' FAIL ' END AS status, name FROM results;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;
