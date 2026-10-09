-- ============================================================
-- PUBLIC BLOG: ONE LANGUAGE PER ARTICLE
-- ============================================================
-- The public blog (app/(public)/articles) was Hebrew-only: every row in
-- `articles` was Hebrew by assumption, and /en|/es|/pt-BR/articles were static
-- "coming soon" pages with no list and no [slug] route.
--
-- This adds the language the row is written in, so each locale's blog can show
-- its own articles and nothing else. Additive and backward compatible:
--   * every existing row becomes 'he', which is what it already is;
--   * the default is 'he', so an insert that predates this column still works;
--   * the CHECK mirrors PUBLIC_LOCALES in lib/i18n/locales.ts — a language is
--     added there and here together, never only in code.
--
-- No data is changed beyond the backfill of the new column.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'he';

ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS articles_locale_check;

ALTER TABLE public.articles
  ADD CONSTRAINT articles_locale_check
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR'));

-- The list page's query: published articles of one language, newest first.
CREATE INDEX IF NOT EXISTS articles_locale_published_idx
  ON public.articles (locale, is_published, published_at DESC);

COMMENT ON COLUMN public.articles.locale IS
  'Language of this article. One of PUBLIC_LOCALES (lib/i18n/locales.ts); the public blog of that locale lists only its own rows.';
