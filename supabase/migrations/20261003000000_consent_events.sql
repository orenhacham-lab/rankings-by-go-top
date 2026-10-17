-- ============================================================================
-- CONSENT EVENTS: THE PROOF, PER DECISION, THAT A VISITOR WAS ASKED AND CHOSE.
--
-- WHY. GDPR Art. 7(1) makes the controller able-to-demonstrate consent, and
-- the ePrivacy consent for non-essential storage has to be shown to have been
-- prior, specific and freely given. The visitor's own copy lives in their
-- localStorage and they may clear it at any time, so the record that answers a
-- regulator, or a visitor asking "what did I agree to", is this table.
--
--   consent_events       APPEND ONLY. One row per decision, never updated,
--                        never deleted by the app. A withdrawal is a NEW row
--                        with action='withdraw', so the history reads as a
--                        timeline and a grant is never silently rewritten.
--     consent_id         the id in the visitor's own stored record, so a later
--                        withdrawal can be matched to the grant it revokes
--     policy_version     the cookie disclosure the visitor was actually shown
--     action             accept_all | reject_all | custom | withdraw | gpc
--     categories         {"necessary":true,"analytics":bool,"marketing":bool}
--     locale             which language the disclosure was read in. Mirrors
--                        CONSENT_LOCALES in lib/consent/categories.ts; a new
--                        public language goes in that list first, then here,
--                        or the decision is refused and the proof is lost
--     page_path          where on the site the decision was made
--     ip_hash            sha256(salt || ip). NOT the address. Data minimisation
--                        (GDPR Art. 5(1)(c)): enough to show two decisions came
--                        from one client and to rate-limit, not enough to
--                        identify or re-identify a person from this table.
--     user_agent         truncated to 400 chars; part of showing WHAT banner
--                        the visitor saw, not a fingerprint we query on
--     user_id            set only when the decision was made while signed in,
--                        so an account's own consent history can be answered
--
-- ACCESS. NOBODY reads this from a browser. anon and authenticated have no
-- grants and no policy at all; RLS is on with no permissive policy, so even a
-- leaked browser key returns nothing. The route writes with the service role
-- (which bypasses RLS by design) and never reads back. Answering a subject
-- access request is a deliberate server-side act, not a screen.
--
-- Additive: one new table; nothing existing changes. Idempotent: every
-- statement can be re-run. THE BANNER WORKS WITHOUT IT — app/api/consent
-- treats a missing table as a logged warning and still answers 204, so this can
-- be applied after the code ships, or before, in either order.
-- Rollback:
--   DROP TABLE IF EXISTS public.consent_events;
-- Probe: supabase/migrations/__qa__/consent-events.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.consent_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id      text NOT NULL,
  policy_version  text NOT NULL,
  action          text NOT NULL,
  categories      jsonb NOT NULL,
  locale          text NOT NULL DEFAULT 'he',
  page_path       text,
  ip_hash         text,
  user_agent      text,
  user_id         uuid,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT consent_events_consent_id      CHECK (length(consent_id) BETWEEN 1 AND 120),
  CONSTRAINT consent_events_policy_version  CHECK (length(policy_version) BETWEEN 1 AND 40),
  CONSTRAINT consent_events_action          CHECK (action IN ('accept_all','reject_all','custom','withdraw','gpc')),
  CONSTRAINT consent_events_categories      CHECK (jsonb_typeof(categories) = 'object'),
  CONSTRAINT consent_events_locale          CHECK (locale IN ('he','en','es')),
  CONSTRAINT consent_events_page_path       CHECK (page_path IS NULL OR length(page_path) <= 300),
  CONSTRAINT consent_events_ip_hash         CHECK (ip_hash IS NULL OR length(ip_hash) <= 80),
  CONSTRAINT consent_events_user_agent      CHECK (user_agent IS NULL OR length(user_agent) <= 400)
);

COMMENT ON TABLE public.consent_events IS
  'Append-only proof of cookie/tracker consent (GDPR Art. 7(1)): one row per decision, written by the service role only. ip_hash is a salted hash, never an address. No browser role can read it.';

-- One decision per (consent_id, action, second): a double-clicked button or a
-- retried keepalive request cannot inflate the log into two separate decisions.
--
-- `created_at AT TIME ZONE 'UTC'` and not `date_trunc('second', created_at)`:
-- truncating a timestamptz depends on the session's TimeZone, so it is STABLE,
-- and PostgreSQL refuses a non-IMMUTABLE expression in an index — the first
-- draft of this file aborted the whole transaction on that error. Converting to
-- a plain timestamp at a LITERAL zone first is immutable, and UTC is the zone
-- the log is reasoned about in anyway.
CREATE UNIQUE INDEX IF NOT EXISTS consent_events_dedupe
  ON public.consent_events (consent_id, action, date_trunc('second', created_at AT TIME ZONE 'UTC'));

CREATE INDEX IF NOT EXISTS consent_events_consent_id_idx ON public.consent_events (consent_id);
CREATE INDEX IF NOT EXISTS consent_events_user_id_idx    ON public.consent_events (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

-- No browser role touches this table: not read, not written, not counted.
-- RLS is enabled with NO permissive policy, so the grants below are the whole
-- story and the service role (which bypasses RLS) is the only writer.
--
-- service_role IS IN THE REVOKE ON PURPOSE. Supabase's default privileges for
-- new tables in `public` grant ALL to anon, authenticated AND service_role, and
-- a GRANT only ever adds — so revoking from the browser roles alone left the
-- writer holding UPDATE, DELETE and TRUNCATE, and "append only" was a comment
-- rather than a rule. The probe caught it. Revoking everything first and then
-- granting back exactly SELECT and INSERT makes it enforced by the database:
-- a bug in our own server code cannot rewrite or erase a recorded decision,
-- which is the only reason the log is worth anything as evidence.
REVOKE ALL ON TABLE public.consent_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.consent_events TO service_role;

COMMIT;
