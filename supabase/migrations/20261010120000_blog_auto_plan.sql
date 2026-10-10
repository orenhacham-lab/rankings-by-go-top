-- ============================================================
-- THE PUBLIC BLOG'S OWN ARTICLE QUEUE
-- ============================================================
-- gotopseo.com's blog (the `articles` table) was written by hand, one article
-- at a time. This is the queue behind publishing one article a day: a row per
-- planned article, each one a keyword that Keyword Planner reports real monthly
-- searches for, in one of the blog's languages.
--
-- It is NOT the customer content automation (article_pool_items /
-- generated_articles / article_topics). That engine is bound to a project, a
-- plan and an entitlement; our own blog has none of those, and the two must not
-- share tables — a bug in ours would reach every paying customer's queue.
--
-- Service role only. There is no RLS policy on purpose: the queue is operator
-- data, read by the admin screen through the service-role client and by the
-- cron, never by a browser session.

CREATE TABLE IF NOT EXISTS public.blog_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The blog language this article is for. Mirrors articles.locale, which
  -- mirrors PUBLIC_LOCALES (lib/i18n/locales.ts). The generator supports
  -- he/en/es (lib/content/language.ts ContentLanguage), so 'pt-BR' is allowed
  -- here but is never picked by the rotation until the content layer learns it.
  locale text NOT NULL DEFAULT 'he',

  topic text NOT NULL,
  primary_keyword text NOT NULL,
  secondary_keywords text[] NOT NULL DEFAULT '{}',

  -- What Keyword Planner reported when this row was planned. NULL means the
  -- row was added by hand, not from research.
  monthly_searches integer,
  competition text,

  status text NOT NULL DEFAULT 'planned',
  -- The day the runner may publish this row. NULL = "any day its locale comes
  -- up", which is how research-filled rows arrive.
  scheduled_for date,

  -- Set once the row has produced an article on the public blog.
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  article_slug text,

  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  -- Crash safety: the runner claims a row by stamping this, and recovers a row
  -- whose stamp is older than the lock timeout.
  locked_at timestamptz,

  -- Why this row exists: 'keyword_planner' (researched) or 'manual' (typed in).
  source text NOT NULL DEFAULT 'keyword_planner',
  -- An operator's reason for taking a row out of the queue.
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT blog_plan_locale_check CHECK (locale IN ('he', 'en', 'es', 'pt-BR')),
  CONSTRAINT blog_plan_status_check CHECK (
    status IN ('planned', 'generating', 'ready', 'published', 'failed', 'rejected')
  ),
  -- The same keyword is never planned twice in the same language: that is the
  -- cannibalisation this queue exists to prevent.
  CONSTRAINT blog_plan_keyword_unique UNIQUE (locale, primary_keyword)
);

ALTER TABLE public.blog_plan ENABLE ROW LEVEL SECURITY;

-- The runner's query: the next publishable row of one language.
CREATE INDEX IF NOT EXISTS blog_plan_locale_status_idx
  ON public.blog_plan (locale, status, monthly_searches DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS blog_plan_status_created_idx
  ON public.blog_plan (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_blog_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_plan_update_updated_at ON public.blog_plan;
CREATE TRIGGER blog_plan_update_updated_at
  BEFORE UPDATE ON public.blog_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_blog_plan_updated_at();

COMMENT ON TABLE public.blog_plan IS
  'Queue of planned articles for the PUBLIC blog (gotopseo.com), one row per keyword per language. Operator data: service role only, no RLS policy.';
