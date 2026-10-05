-- ============================================================================
-- The business owner's writing guidance for its articles.
--
-- One new column on public.project_article_styles (20260928001000), the
-- article settings row the owner already reads and writes under RLS. No new
-- table, no policy change: the row's existing owner-only policies cover it.
--
--   writing_guidance  {instructions, exclusions, rules}
--     instructions  text, <= 2000 characters: standing instructions
--     exclusions    <= 20 strings of <= 120: what the business does not sell
--     rules         <= 30 objects {text <= 300, at, article_id}: notes the
--                   owner left on an article, kept for the articles after it
--   '{}' (the default, every existing row) = no guidance: articles are written
--   exactly as today. Written by the owner from the settings card and the
--   article view (lib/content/writing-guidance/data.ts); read by article
--   generation (lib/content/writing-guidance/store.ts).
--
-- The CHECK is the database's copy of the app's limits
-- (lib/content/writing-guidance/guidance.ts): only the three keys, the right
-- types, the lengths and counts, and a size cap on the whole value.
--
-- Additive and idempotent. Rollback:
--   ALTER TABLE public.project_article_styles DROP COLUMN IF EXISTS writing_guidance;
-- Executed probe: supabase/migrations/__qa__/project-writing-guidance.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-writing-guidance.probe.sql
-- NOT APPLIED ANYWHERE: needs the owner's approval before Production.
-- ============================================================================

BEGIN;

ALTER TABLE public.project_article_styles
  ADD COLUMN IF NOT EXISTS writing_guidance jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_writing_guidance;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_writing_guidance CHECK (
  jsonb_typeof(writing_guidance) = 'object'
  AND pg_column_size(writing_guidance) <= 32768
  AND NOT jsonb_path_exists(writing_guidance,
    'strict $.keyvalue() ? (!(@.key like_regex "^(instructions|exclusions|rules)$"))')
  AND (NOT writing_guidance ? 'instructions' OR (jsonb_typeof(writing_guidance -> 'instructions') = 'string'
       AND char_length(writing_guidance ->> 'instructions') <= 2000))
  AND (NOT writing_guidance ? 'exclusions' OR (jsonb_typeof(writing_guidance -> 'exclusions') = 'array'
       AND jsonb_array_length(writing_guidance -> 'exclusions') <= 20
       AND NOT jsonb_path_exists(writing_guidance,
         'strict $.exclusions[*] ? (@.type() != "string" || !(@ like_regex "^.{1,120}$" flag "s"))')))
  AND (NOT writing_guidance ? 'rules' OR (jsonb_typeof(writing_guidance -> 'rules') = 'array'
       AND jsonb_array_length(writing_guidance -> 'rules') <= 30
       AND NOT jsonb_path_exists(writing_guidance, 'strict $.rules[*] ? (@.type() != "object")')
       AND NOT jsonb_path_exists(writing_guidance,
         'lax $.rules[*].keyvalue() ? (!(@.key like_regex "^(text|at|article_id)$"))')
       AND NOT jsonb_path_exists(writing_guidance,
         'lax $.rules[*] ? (!exists(@.text) || @.text.type() != "string" || !(@.text like_regex "^.{1,255}.{0,45}$" flag "s"))')))
);

COMMENT ON COLUMN public.project_article_styles.writing_guidance IS
  'The owner''s writing guidance for the project''s articles: {instructions, exclusions[], rules[{text, at, article_id}]}. ''{}'' = none (the pre-existing behaviour).';

COMMIT;
