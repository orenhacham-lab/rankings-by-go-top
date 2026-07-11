-- =============================================================================
-- Add ai_business_profile column to projects — manual AI profile override
-- =============================================================================
-- Stores a user-editable AI Business Profile that overrides the auto-detected
-- category for AI Visibility question generation. When the column is NULL or
-- `mode` is 'auto', the generator falls back to inferBusinessProfile(). When
-- `mode` is 'manual', the user's primary category, secondary categories and
-- excluded topics drive question selection.
--
-- Shape:
--   {
--     "mode": "auto" | "manual",
--     "primaryCategory": "florist" | "perfume" | ... | null,
--     "secondaryCategories": ["flower_gifts", "plants", ...] | [],
--     "excludedTopics": ["מתנות כלליות", "גאדג'טים", ...] | [],
--     "updatedAt": "ISO-8601 timestamp",
--     "updatedBy": "user id"
--   }
--
-- ADDITIVE ONLY. Rollback: ALTER TABLE projects DROP COLUMN ai_business_profile;
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ai_business_profile jsonb DEFAULT NULL;

COMMENT ON COLUMN public.projects.ai_business_profile IS
  'Manual AI Business Profile override for AI Visibility question generation. NULL = auto-detect.';
