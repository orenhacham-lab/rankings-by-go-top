-- ============================================================================
-- P0 — OPTIONAL additive column: content_topic_ideas.link_plan (JSONB).
--
-- ADDITIVE + IDEMPOTENT (ADD COLUMN IF NOT EXISTS; nothing dropped, no data
-- changed/deleted, no type change). Stores the canonical ROLE-AWARE internal-link
-- plan + metadata for a generated topic idea, so link roles (primary / secondary
-- commercial targets, supporting informational links, source references),
-- recommendedPageType, demandEvidence and confidence SURVIVE persistence + reload
-- and are never re-inferred in the UI.
--
-- Backward compatible: old rows get link_plan = NULL and load exactly as before
-- (flat links, null primary target). The application ALSO works WITHOUT this column
-- (insertPendingIdeas retries without link_plan on a missing-column error); apply
-- this only to make roles persist across reloads.
--
-- DO NOT APPLY AUTOMATICALLY. Run manually in the Supabase SQL Editor.
-- ============================================================================

ALTER TABLE public.content_topic_ideas
  ADD COLUMN IF NOT EXISTS link_plan jsonb;

COMMENT ON COLUMN public.content_topic_ideas.link_plan IS
  'Canonical role-aware link plan + metadata (LinkPlan, recommendedPageType, demandEvidence, confidence). Additive/nullable; old rows are NULL.';
