-- ============================================================================
-- RESEARCH BEFORE SIGN-UP — the free check running the whole seed stage A for
-- an anonymous visitor (lib/presignup).
--
-- WHAT IS REUSED, AND WHY TWO NEW TABLES ARE STILL NEEDED
--   free_site_checks        (20260926000000) holds each finished research as a
--                           free check's ledger row: `result` is the public
--                           teaser (what the free check's 24h cache replays),
--                           `seed` the ungated set PLUS `seed.research`, the
--                           whole stage-A snapshot a claim replays into the
--                           new project. No change to it.
--   free_site_check_claims  (20260926000000) is the one-time claim token, as
--                           for the free check: SHA-256 only, single use, 24h.
--                           No change to it.
--   free_check_research_runs  NEW. One row per research REQUEST, inserted
--                           BEFORE any money is spent, so the per-visitor and
--                           daily caps count runs still in flight (the ledger
--                           row is written only at the end, and a placeholder
--                           row there would be replayed by the free check's
--                           cache). It also records what each run spent.
--   free_check_report_requests  NEW. "Email me the report": an address kept
--                           ONLY with the visitor's explicit consent, the
--                           consent's exact words and time (Communications Law
--                           s.30A; Privacy Protection Law). The CHECKs make an
--                           address without consent impossible to store.
--                           Nothing is sent yet: `sent_at` stays null until a
--                           sender exists.
--
-- WHO MAY DO WHAT. Only server code with the service role. RLS is enabled
-- with NO policies, and every privilege is revoked from PUBLIC, anon and
-- authenticated (Supabase's default privileges grant them ALL, TRUNCATE
-- included, on a new table), then granted back to service_role only. The rows
-- describe third-party sites and visitors' addresses: no browser role may
-- read or write them.
--
-- Additive only: no existing table, function or policy is altered. Inert until
-- ENABLE_SEED_SCAN and ENABLE_PRESIGNUP_RESEARCH are both "true"; until then
-- nothing reads or writes these tables, and with the tables missing the code
-- answers "not available" and the free check stays the short check.
--
-- Executed probe: supabase/migrations/__qa__/free-check-research.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/free-check-research.probe.sql
--
-- Idempotent: every statement can be re-run.
-- Rollback (loses the run records and the stored consents):
--   DROP TABLE IF EXISTS public.free_check_report_requests, public.free_check_research_runs;
-- ============================================================================

BEGIN;

-- ── 1. free_check_research_runs — one row per research request ─────────────
CREATE TABLE IF NOT EXISTS public.free_check_research_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The free check's salted SHA-256 of the caller's address; never the address.
  client_hash  text NOT NULL CHECK (char_length(client_hash) BETWEEN 1 AND 128),
  domain       text NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 253),
  locale       text NOT NULL CHECK (locale IN ('he', 'en')),
  -- running: reserved, may be spending   done/failed: finished (may have spent)
  -- replayed: answered from the ledger, spent nothing   refused: over a cap
  status       text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'done', 'failed', 'replayed', 'refused')),
  -- The ledger row the research was recorded as (or replayed from).
  check_id     uuid REFERENCES public.free_site_checks(id) ON DELETE SET NULL,
  model_calls  smallint NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  searches     smallint NOT NULL DEFAULT 0 CHECK (searches >= 0),
  -- A stable code such as 'site_unreachable', never provider or exception text.
  error_code   text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

-- Per-visitor allowance: this client's recent runs.
CREATE INDEX IF NOT EXISTS free_check_research_runs_client_idx
  ON public.free_check_research_runs (client_hash, created_at DESC);
-- Daily cap: runs that may have spent, since midnight UTC.
CREATE INDEX IF NOT EXISTS free_check_research_runs_spending_idx
  ON public.free_check_research_runs (created_at DESC)
  WHERE status IN ('running', 'done', 'failed');
-- Cache: the newest finished research of a domain in a language.
CREATE INDEX IF NOT EXISTS free_check_research_runs_cache_idx
  ON public.free_check_research_runs (domain, locale, created_at DESC)
  WHERE status = 'done';

COMMENT ON TABLE public.free_check_research_runs IS
  'Research-before-sign-up requests: reserved before spending, for the per-visitor and daily caps and the spend record. Service role only.';

-- ── 2. free_check_report_requests — "email me the report", with consent ────
CREATE TABLE IF NOT EXISTS public.free_check_report_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id       uuid NOT NULL REFERENCES public.free_site_checks(id) ON DELETE CASCADE,
  email          text NOT NULL
                   CHECK (char_length(email) BETWEEN 6 AND 254 AND email = lower(email)
                          AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  -- Explicit consent is the only way in: there is no row without it.
  consent        boolean NOT NULL CHECK (consent),
  consented_at   timestamptz NOT NULL,
  -- The exact words the visitor agreed to, with their version.
  consent_text   text NOT NULL CHECK (char_length(consent_text) BETWEEN 20 AND 1000),
  locale         text NOT NULL CHECK (locale IN ('he', 'en')),
  client_hash    text NOT NULL CHECK (char_length(client_hash) BETWEEN 1 AND 128),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Set by a future sender; nothing sends today.
  sent_at        timestamptz,
  CONSTRAINT free_check_report_requests_once UNIQUE (check_id, email)
);

CREATE INDEX IF NOT EXISTS free_check_report_requests_client_idx
  ON public.free_check_report_requests (client_hash, created_at DESC);

COMMENT ON TABLE public.free_check_report_requests IS
  'Report-by-email requests after a research before sign-up, stored only with explicit consent (its words and time). Nothing is sent yet. Service role only.';

-- ── 3. Nobody but the service role ─────────────────────────────────────────
ALTER TABLE public.free_check_research_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_check_report_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.free_check_research_runs, public.free_check_report_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.free_check_research_runs, public.free_check_report_requests
  TO service_role;

COMMIT;
