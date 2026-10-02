-- ============================================================================
-- COMPETITOR POSITIONS PER KEYWORD (W10, "you vs. your competitors").
--
-- WHAT. For every tracked keyword check, where each of the project's
-- competitors ranked in the same Google result page:
--
--   position    1-20, or NULL when the competitor is not in the top 20
--   url         the competitor's result URL when it ranked, otherwise NULL
--   checked_at  the checked_at of the scan_results row written for the same
--               check. That is how a screen pairs "your position" with theirs:
--               both come from one result page, never from two different days.
--
-- NO NEW PROVIDER REQUEST. The rank scan already fetches the top 20 organic
-- results for the project's own position. The scanner now also locates the
-- competitors in that same list (lib/scanner/competitor-positions.ts), with the
-- same domain normalization, and the scan routes write what it found
-- (lib/competitors/scan-positions.ts). Writing is best effort: a failed insert
-- is logged and never fails or delays the scan.
--
-- ACCESS. Rows are written ONLY by service-role server code. The project owner
-- reads their own rows under RLS; no browser role can insert, update or delete,
-- and anon has no access at all. The grants follow
-- 20260925000000_security_owasp_hardening.sql and
-- 20260909000000_operation_claims.sql: Supabase's default table grants are
-- revoked and only what is needed is granted back.
--
-- Additive: one new table, no change to an existing one. Idempotent: every
-- statement can be re-run. Rollback: DROP TABLE public.keyword_competitor_positions;
-- Executed probe: supabase/migrations/__qa__/keyword-competitor-positions.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.keyword_competitor_positions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The project owner. Written by the server from the project row, never from a request.
  user_id             uuid NOT NULL,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tracking_target_id  uuid NOT NULL REFERENCES public.tracking_targets(id) ON DELETE CASCADE,
  -- Normalized exactly as the scanner normalizes the project's own domain.
  competitor_domain   text NOT NULL,
  "position"          integer,
  url                 text,
  checked_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT keyword_competitor_positions_domain_length
    CHECK (length(competitor_domain) BETWEEN 1 AND 253),
  CONSTRAINT keyword_competitor_positions_position_top20
    CHECK ("position" IS NULL OR "position" BETWEEN 1 AND 20),
  CONSTRAINT keyword_competitor_positions_url_only_when_ranked
    CHECK (url IS NULL OR ("position" IS NOT NULL AND length(url) <= 2048))
);

COMMENT ON TABLE public.keyword_competitor_positions IS
  'Where each project competitor ranked (1-20, or NULL outside the top 20) in the result page of one keyword check; checked_at equals that check''s scan_results.checked_at. Written only by service-role server code; the project owner reads it under RLS.';

-- Latest per target and competitor: WHERE tracking_target_id = $1 AND
-- competitor_domain = $2 ORDER BY checked_at DESC LIMIT 1, and one row per
-- competitor per check. Its prefix also serves the tracking_target_id cascade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_competitor_positions_target_competitor_checked
  ON public.keyword_competitor_positions (tracking_target_id, competitor_domain, checked_at DESC);

-- The project_id cascade and the owner policy below.
CREATE INDEX IF NOT EXISTS idx_keyword_competitor_positions_project
  ON public.keyword_competitor_positions (project_id);

ALTER TABLE public.keyword_competitor_positions ENABLE ROW LEVEL SECURITY;

-- Browser roles: read only, and only through the owner policy. anon: nothing.
REVOKE ALL ON TABLE public.keyword_competitor_positions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.keyword_competitor_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.keyword_competitor_positions TO service_role;

DROP POLICY IF EXISTS keyword_competitor_positions_owner_select ON public.keyword_competitor_positions;
CREATE POLICY keyword_competitor_positions_owner_select ON public.keyword_competitor_positions
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;
