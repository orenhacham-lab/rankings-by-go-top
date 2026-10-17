-- =============================================================================
-- projects.ai_auto_check_enabled — the "automatic monthly AI check" setting
-- =============================================================================
-- The owner approved an automatic monthly AI-visibility check (2026-09-29, UX
-- review section B; lib/ai-visibility/monthly-check). Each project can turn it
-- off from the AI tab. ON by default: a project with no choice made gets the
-- check, as approved. OFF means every AI check of the period stays manual.
--
-- Why a column and not a key in projects.ai_business_profile (the existing AI
-- JSON): PUT /api/projects/[id]/ai-profile replaces that object whole, so a key
-- kept there would silently turn the setting back on at the next profile save.
--
-- ADDITIVE ONLY, idempotent. The code reads a database without this column as
-- ON (the default) and answers a save with a friendly "not saved", so it may
-- ship before this is applied. Writes go through the service role after an
-- owner check; the existing projects RLS policy covers the owner's own reads.
-- NOT APPLIED ANYWHERE: needs the owner's approval before Production.
-- Rollback: ALTER TABLE public.projects DROP COLUMN ai_auto_check_enabled;
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ai_auto_check_enabled boolean NOT NULL DEFAULT true;

-- Re-applying restores the default even if it was ever changed by hand.
ALTER TABLE public.projects
  ALTER COLUMN ai_auto_check_enabled SET DEFAULT true;

COMMENT ON COLUMN public.projects.ai_auto_check_enabled IS
  'Automatic monthly AI check for this project (lib/ai-visibility/monthly-check). Default true; false keeps every AI check manual.';
