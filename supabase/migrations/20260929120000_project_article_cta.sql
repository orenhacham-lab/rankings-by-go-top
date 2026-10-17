-- ============================================================================
-- The project's own call to action at the end of its articles (wave 8).
--
-- One new column on public.project_article_styles (20260928001000), the
-- article-design settings row the owner already reads and writes under RLS.
-- No new table, no policy change: the row's existing owner-only policies
-- cover the column.
--
--   article_cta  {enabled, heading, text, button_label, button_url}
--                '{}' (the default, every existing row) = off, exactly
--                today's articles. Written by the owner from the article
--                design card (lib/content/article-style/data.ts); read for
--                the preview, the article view and WordPress/webhook
--                publishing (lib/content/article-style/render.ts).
--
-- The CHECK is the database's own copy of the app's rules
-- (lib/content/article-style/cta.ts): only the five keys, the texts are
-- strings within their lengths, the link is '' or https with no whitespace
-- or markup characters, and a call to action that is on has a heading, a
-- button label and a link. So nothing that could run as script is ever
-- stored, whoever writes the row.
--
-- Additive and idempotent. Rollback:
--   ALTER TABLE public.project_article_styles DROP COLUMN IF EXISTS article_cta;
-- Executed probe: supabase/migrations/__qa__/project-article-cta.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-article-cta.probe.sql
-- NOT APPLIED ANYWHERE: needs the owner's approval before Production.
-- ============================================================================

BEGIN;

ALTER TABLE public.project_article_styles
  ADD COLUMN IF NOT EXISTS article_cta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_article_cta;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_article_cta CHECK (
  jsonb_typeof(article_cta) = 'object'
  AND pg_column_size(article_cta) <= 2048
  AND NOT jsonb_path_exists(article_cta,
    'strict $.keyvalue() ? (!(@.key like_regex "^(enabled|heading|text|button_label|button_url)$"))')
  AND (NOT article_cta ? 'enabled' OR jsonb_typeof(article_cta -> 'enabled') = 'boolean')
  AND (NOT article_cta ? 'heading' OR (jsonb_typeof(article_cta -> 'heading') = 'string' AND char_length(article_cta ->> 'heading') <= 80))
  AND (NOT article_cta ? 'text' OR (jsonb_typeof(article_cta -> 'text') = 'string' AND char_length(article_cta ->> 'text') <= 240))
  AND (NOT article_cta ? 'button_label' OR (jsonb_typeof(article_cta -> 'button_label') = 'string' AND char_length(article_cta ->> 'button_label') <= 40))
  AND (NOT article_cta ? 'button_url' OR (jsonb_typeof(article_cta -> 'button_url') = 'string'
       AND (article_cta ->> 'button_url' = ''
            OR (article_cta ->> 'button_url' ~ '^https://[^[:space:]<>"''`]+$' AND char_length(article_cta ->> 'button_url') <= 300 AND strpos(article_cta ->> 'button_url', chr(92)) = 0))))
  AND (article_cta -> 'enabled' IS DISTINCT FROM 'true'::jsonb OR (
       coalesce(article_cta ->> 'heading', '') <> ''
       AND coalesce(article_cta ->> 'button_label', '') <> ''
       AND coalesce(article_cta ->> 'button_url', '') ~ '^https://'))
);

COMMENT ON COLUMN public.project_article_styles.article_cta IS
  'The project''s call to action at the end of its articles: {enabled, heading, text, button_label, button_url}. ''{}'' = off (the pre-existing behaviour). https links only.';

COMMIT;
