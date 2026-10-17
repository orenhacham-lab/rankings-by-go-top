-- ============================================================================
-- ARTICLE DESIGN SETTINGS, per project.
--
-- WHAT. One new table, nothing else:
--
--   project_article_styles   one row per project: the brand colours, the article
--                            design (formatted | minimal), the image style, the
--                            hero shape, how many images go inside an article
--                            (0-4), "no AI images, I use my own", and the
--                            business's official profiles (Google Business
--                            Profile, Facebook, Instagram, LinkedIn, X, YouTube,
--                            TikTok, Wikidata, Wikipedia), which every article's
--                            structured data lists as the publisher's sameAs.
--
-- NO ROW IS TODAY'S BEHAVIOUR. The app reads defaults when a project has no row
-- or when this table does not exist (lib/content/article-style/types.ts
-- DEFAULT_ARTICLE_STYLE): minimal design, realistic 16:9 hero, no automatic
-- inline images. So applying this migration changes nothing until an owner
-- saves the card; until it is applied, the card is read-only.
--
-- WHO MAY DO WHAT. The repository's owner pattern (as project_profiles in
-- 20260927000000_project_seed_scan.sql):
--   * the owner reads, creates and edits their own projects' row, through
--     their own RLS-scoped client, and every write carries user_id = auth.uid();
--   * nobody deletes a row from the browser (it goes with the project);
--   * an administrator who is not the owner reads nothing; anon gets nothing;
--   * service_role (generation and publishing) reads it, filtering by the
--     project and its owner in code.
--
-- CHECKS mirror the app's validation: colours are lower-case #rrggbb, at most
-- six; every choice is one of its list; the image count is 0-4; profiles are a
-- JSON object of known networks to https URLs of at most 300 characters (the
-- pattern writes the length as two bounded runs, because the regex engine caps
-- one repetition at 255; the per-network host rules live in
-- lib/content/article-style/profiles.ts).
--
-- PERMISSIONS follow 20260925000000_security_owasp_hardening.sql: policies are
-- TO authenticated, RLS is on, and Supabase's default grants (ALL, TRUNCATE
-- included, to anon and authenticated) are revoked and re-granted narrowly.
--
-- Additive and idempotent: one new table, no existing object altered.
-- Rollback: DROP TABLE public.project_article_styles;
-- Executed probe: supabase/migrations/__qa__/project-article-styles.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-article-styles.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_article_styles (
  project_id       uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The project owner, written from the session, never from a request body.
  user_id          uuid NOT NULL,

  brand_colors     text[] NOT NULL DEFAULT '{}'::text[],
  design           text NOT NULL DEFAULT 'minimal',
  image_style      text NOT NULL DEFAULT 'realistic',
  hero_ratio       text NOT NULL DEFAULT '16:9',
  inline_images    smallint NOT NULL DEFAULT 0,
  own_images_only  boolean NOT NULL DEFAULT false,
  official_profiles jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_article_styles_brand_colors
    CHECK (cardinality(brand_colors) <= 6
           AND array_to_string(brand_colors, ',') ~ '^(#[0-9a-f]{6}(,#[0-9a-f]{6})*)?$'
           AND array_position(brand_colors, NULL) IS NULL),
  CONSTRAINT project_article_styles_design
    CHECK (design IN ('formatted', 'minimal')),
  CONSTRAINT project_article_styles_image_style
    CHECK (image_style IN ('realistic', 'illustration', 'watercolor', 'sketch', 'render3d', 'clay')),
  CONSTRAINT project_article_styles_hero_ratio
    CHECK (hero_ratio IN ('16:9', '1:1')),
  CONSTRAINT project_article_styles_inline_images
    CHECK (inline_images BETWEEN 0 AND 4),
  CONSTRAINT project_article_styles_official_profiles
    CHECK (jsonb_typeof(official_profiles) = 'object'
           AND pg_column_size(official_profiles) <= 8192
           AND NOT jsonb_path_exists(official_profiles,
             'strict $.keyvalue() ? (!(@.key like_regex "^(google_business|facebook|instagram|linkedin|x|youtube|tiktok|wikidata|wikipedia)$") || @.value.type() != "string" || !(@.value like_regex "^https://[^ ]{1,200}[^ ]{0,92}$"))'))
);

COMMENT ON TABLE public.project_article_styles IS
  'Article design settings per project (brand colours, formatted/minimal design, image style, hero ratio, inline image count) and the business''s official profiles (structured-data sameAs). No row = the app defaults, which are the pre-existing behaviour. Owner reads and writes under RLS.';

DROP TRIGGER IF EXISTS project_article_styles_update_updated_at ON public.project_article_styles;
CREATE TRIGGER project_article_styles_update_updated_at
  BEFORE UPDATE ON public.project_article_styles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_article_styles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_article_styles_select ON public.project_article_styles;
CREATE POLICY project_article_styles_select ON public.project_article_styles
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));
DROP POLICY IF EXISTS project_article_styles_insert ON public.project_article_styles;
CREATE POLICY project_article_styles_insert ON public.project_article_styles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS project_article_styles_update ON public.project_article_styles;
CREATE POLICY project_article_styles_update ON public.project_article_styles
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid())
  );

REVOKE ALL ON TABLE public.project_article_styles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_article_styles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_article_styles TO service_role;

COMMIT;
