-- ============================================================================
-- P0 brand-safety — OPTIONAL additive column: projects.competitor_terms (text[]).
--
-- ADDITIVE + IDEMPOTENT (ADD COLUMN IF NOT EXISTS; nothing dropped, no data
-- changed/deleted, no type change). A user-maintained list of competitor / forbidden
-- business terms that must NEVER appear in generated recommendations (title, primary/
-- secondary keywords, reason, anchors, target titles) unless an explicit competitor-
-- comparison workflow is enabled.
--
-- Backward compatible: old rows get NULL (no exclusions). The application ALSO works
-- WITHOUT this column (it selects defensively and falls back to the RECO_COMPETITOR_
-- TERMS env list); apply this to let users maintain per-project exclusions.
--
-- DO NOT APPLY AUTOMATICALLY. Run manually in the Supabase SQL Editor.
--
-- Names are NEVER hardcoded in the engine — they live in this per-project column (or
-- the env fallback). For this project, seed it after applying, e.g.:
--   UPDATE public.projects SET competitor_terms = ARRAY['פרחי אביה','פרחי דליה']
--   WHERE id = '<project-id>';
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS competitor_terms text[];

COMMENT ON COLUMN public.projects.competitor_terms IS
  'User-maintained competitor/forbidden business terms excluded from generated recommendations (brand safety). Additive/nullable.';
