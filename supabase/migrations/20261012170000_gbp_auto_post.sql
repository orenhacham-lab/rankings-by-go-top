-- ============================================================================
-- AUTOMATIC POSTS ON GOOGLE MAPS, alongside the articles. Additive.
--
-- An article that publishes to the owner's site can also become a post on the
-- business profile, with no one pressing anything. It is OPT-IN and OFF by
-- default: it happens only for a project that has a connected Business Profile
-- location AND whose owner turned the switch on (Oren, 2026-10-12: "it must not
-- be mandatory, the customer connects Google Business Profile and approves
-- automatic posting").
--
--   project_gbp_locations.auto_post_on_publish  the owner's switch. false by default,
--                          so applying this file changes nothing for anyone.
--   project_gbp_locations.auto_post_enabled_at  WHEN they turned it on, cleared when
--                          they turn it off. Asked for by the legal thread 2026-10-12:
--                          we are the ones publishing in the owner's name without a
--                          person reading it, so there has to be something that answers
--                          "I never approved this". Who turned it on needs no column —
--                          user_id on the row is the owner and the route proved
--                          ownership — and "was it on when this post went out" is
--                          already answered by gbp_posts.auto_created.
--   gbp_posts.auto_created  this row was queued by the article publish, not by a person.
--   gbp_posts.needs_ai_draft  the row carries the article's own title + summary as a
--                          placeholder; the GBP cron rewrites it with the AI draft
--                          before sending it to Google. The article publish path makes
--                          NO model call and NO Google call: it only writes this row,
--                          so a Google or model failure can never delay or block an
--                          article (the article cron stalled 2026-10-07..11; never again).
--
-- uq_gbp_posts_auto_article makes the whole thing idempotent in the DATABASE, not
-- just in a read: one automatic post per article, so a retried or reconciled
-- publish cannot post twice. A post the owner wrote by hand is not covered by the
-- index (auto_created = false), so a merchant may still post about the same
-- article as often as they like.
--
-- Idempotent: every statement can be re-run. No column is dropped, no constraint
-- is tightened, no existing row changes value.
-- Rollback:
--   DROP INDEX IF EXISTS public.uq_gbp_posts_auto_article;
--   ALTER TABLE public.gbp_posts DROP COLUMN IF EXISTS needs_ai_draft, DROP COLUMN IF EXISTS auto_created;
--   ALTER TABLE public.project_gbp_locations
--     DROP CONSTRAINT IF EXISTS project_gbp_locations_auto_post_enabled_at,
--     DROP COLUMN IF EXISTS auto_post_enabled_at, DROP COLUMN IF EXISTS auto_post_on_publish;
-- Executed probe: supabase/migrations/__qa__/gbp-auto-post.probe.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.project_gbp_locations
  ADD COLUMN IF NOT EXISTS auto_post_on_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_post_enabled_at timestamptz;

-- A timestamp only ever accompanies the switch being on.
ALTER TABLE public.project_gbp_locations
  DROP CONSTRAINT IF EXISTS project_gbp_locations_auto_post_enabled_at;
ALTER TABLE public.project_gbp_locations
  ADD CONSTRAINT project_gbp_locations_auto_post_enabled_at
  CHECK (auto_post_on_publish OR auto_post_enabled_at IS NULL);

ALTER TABLE public.gbp_posts
  ADD COLUMN IF NOT EXISTS auto_created   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_ai_draft boolean NOT NULL DEFAULT false;

-- One automatic post per article. Partial, so hand-written posts are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbp_posts_auto_article
  ON public.gbp_posts (source_article_id)
  WHERE auto_created AND source_article_id IS NOT NULL;

COMMIT;
