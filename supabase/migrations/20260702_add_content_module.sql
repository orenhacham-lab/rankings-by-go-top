-- Content module (Phase 1): WordPress connections + article content tables.
--
-- Adds the per-project content/articles module tables:
--   wordpress_connections, article_topics, generated_articles,
--   article_pools, article_pool_items, ai_usage_logs
--
-- NOTE: the table is named generated_articles (NOT articles) on purpose —
-- a global `articles` table already exists for the public marketing blog
-- and must not be touched.
--
-- ADDITIVE ONLY. No existing table is altered. No data is deleted.
-- Rollback: DROP TABLE IF EXISTS public.article_pool_items, public.article_pools,
--           public.generated_articles, public.article_topics,
--           public.ai_usage_logs, public.wordpress_connections;

-- ============================================================================
-- 1. wordpress_connections — one WordPress site per project (MVP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wordpress_connections (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                             uuid NOT NULL,
  project_id                          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  site_url                            text NOT NULL,
  wp_username                         text NOT NULL,
  -- AES-256-GCM encrypted Application Password, stored as iv:tag:ciphertext (hex).
  -- NEVER returned to the client; decrypted server-side only at call time.
  wp_application_password_encrypted   text NOT NULL,

  default_author_id                   integer,
  default_category_id                 integer,
  default_status                      text NOT NULL DEFAULT 'draft'
                                        CHECK (default_status IN ('draft', 'publish', 'future')),
  default_timezone                    text NOT NULL DEFAULT 'Asia/Jerusalem',

  connection_status                   text NOT NULL DEFAULT 'untested'
                                        CHECK (connection_status IN ('untested', 'connected', 'failed')),
  last_tested_at                      timestamptz,

  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),

  -- MVP: a single WordPress connection per project.
  CONSTRAINT wordpress_connections_project_unique UNIQUE (project_id),
  CONSTRAINT wordpress_connections_site_url_https CHECK (site_url LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS idx_wordpress_connections_user
  ON public.wordpress_connections (user_id);

-- ============================================================================
-- 2. article_topics — topic ideas (manual or AI-suggested)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_topics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  source              text NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'ai', 'keyword', 'ai_question', 'competitor')),
  topic               text NOT NULL,
  primary_keyword     text,
  secondary_keywords  text[] NOT NULL DEFAULT '{}',
  search_intent       text,
  target_audience     text,
  status              text NOT NULL DEFAULT 'suggested'
                        CHECK (status IN ('suggested', 'approved', 'rejected', 'used')),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT article_topics_topic_not_empty CHECK (length(trim(topic)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_article_topics_project_status
  ON public.article_topics (project_id, status, created_at DESC);

-- ============================================================================
-- 3. generated_articles — per-project AI/user articles (NOT the global blog!)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.generated_articles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  topic_id             uuid REFERENCES public.article_topics(id) ON DELETE SET NULL,

  title                text NOT NULL,
  slug                 text NOT NULL,
  meta_title           text,
  meta_description     text,
  excerpt              text,
  content_html         text,
  content_markdown     text,
  faq_json             jsonb DEFAULT NULL,
  internal_links_json  jsonb DEFAULT NULL,
  image_prompt         text,
  featured_image_url   text,

  -- 'publishing' is the idempotency lock claimed by the publish flow.
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'ready', 'scheduled', 'publishing', 'published', 'failed')),

  wp_connection_id     uuid REFERENCES public.wordpress_connections(id) ON DELETE SET NULL,
  wp_post_id           integer,
  wp_post_url          text,
  scheduled_at         timestamptz,
  published_at         timestamptz,
  last_error           text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Slugs are unique per project (unlike the global blog's global slugs).
  CONSTRAINT generated_articles_project_slug_unique UNIQUE (project_id, slug),
  CONSTRAINT generated_articles_title_not_empty CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_generated_articles_project_status
  ON public.generated_articles (project_id, status, created_at DESC);

-- Cron lookup: scheduled articles due for publishing.
CREATE INDEX IF NOT EXISTS idx_generated_articles_due
  ON public.generated_articles (scheduled_at)
  WHERE status = 'scheduled';

-- ============================================================================
-- 4. article_pools — auto-publish queues with a cadence
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_pools (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  name             text NOT NULL,
  cadence          text NOT NULL DEFAULT 'weekly'
                     CHECK (cadence IN ('daily', 'weekly', 'monthly', 'custom')),
  interval_days    integer CHECK (interval_days IS NULL OR interval_days > 0),
  publish_time     text,
  timezone         text NOT NULL DEFAULT 'Asia/Jerusalem',
  is_active        boolean NOT NULL DEFAULT false,
  next_publish_at  timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT article_pools_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_article_pools_project
  ON public.article_pools (project_id, created_at DESC);

-- Cron lookup: active pools due for their next publish.
CREATE INDEX IF NOT EXISTS idx_article_pools_due
  ON public.article_pools (next_publish_at)
  WHERE is_active = true;

-- ============================================================================
-- 5. article_pool_items — ordered queue of articles inside a pool
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_pool_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pool_id       uuid NOT NULL REFERENCES public.article_pools(id) ON DELETE CASCADE,
  article_id    uuid NOT NULL REFERENCES public.generated_articles(id) ON DELETE CASCADE,

  position      integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'scheduled', 'published', 'skipped', 'failed')),
  scheduled_at  timestamptz,
  published_at  timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT article_pool_items_unique UNIQUE (pool_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_pool_items_pool
  ON public.article_pool_items (pool_id, position);

-- ============================================================================
-- 6. ai_usage_logs — token/cost accounting per AI operation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  article_id      uuid REFERENCES public.generated_articles(id) ON DELETE SET NULL,

  provider        text NOT NULL,
  model           text NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  estimated_cost  numeric(10, 6) NOT NULL DEFAULT 0,
  operation       text NOT NULL
                    CHECK (operation IN ('topic_generation', 'outline', 'article_generation', 'polish', 'metadata')),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created
  ON public.ai_usage_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project
  ON public.ai_usage_logs (project_id, created_at DESC);

-- ============================================================================
-- Row-Level Security — ownership via projects.user_id = auth.uid()
-- (same pattern as ai_question_suggestion_cache, the canonical in-repo example)
-- ============================================================================

ALTER TABLE public.wordpress_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_topics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_articles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_pools         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_pool_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs         ENABLE ROW LEVEL SECURITY;

-- wordpress_connections
CREATE POLICY wordpress_connections_select ON public.wordpress_connections
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY wordpress_connections_insert ON public.wordpress_connections
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY wordpress_connections_update ON public.wordpress_connections
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY wordpress_connections_delete ON public.wordpress_connections
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- article_topics
CREATE POLICY article_topics_select ON public.article_topics
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_topics_insert ON public.article_topics
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_topics_update ON public.article_topics
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_topics_delete ON public.article_topics
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- generated_articles
CREATE POLICY generated_articles_select ON public.generated_articles
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY generated_articles_insert ON public.generated_articles
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY generated_articles_update ON public.generated_articles
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY generated_articles_delete ON public.generated_articles
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- article_pools
CREATE POLICY article_pools_select ON public.article_pools
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_pools_insert ON public.article_pools
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_pools_update ON public.article_pools
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_pools_delete ON public.article_pools
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- article_pool_items
-- INSERT/UPDATE also verify that the referenced pool AND article resolve to a
-- project the caller owns — not just that project_id is theirs — so a caller
-- cannot link another owner's pool/article into a row under their own project.
CREATE POLICY article_pool_items_select ON public.article_pool_items
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY article_pool_items_insert ON public.article_pool_items
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    AND pool_id IN (
      SELECT id FROM public.article_pools
      WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    )
    AND article_id IN (
      SELECT id FROM public.generated_articles
      WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    )
  );
CREATE POLICY article_pool_items_update ON public.article_pool_items
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    AND pool_id IN (
      SELECT id FROM public.article_pools
      WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    )
    AND article_id IN (
      SELECT id FROM public.generated_articles
      WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    )
  );
CREATE POLICY article_pool_items_delete ON public.article_pool_items
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- ai_usage_logs — users can read their own usage; writes happen server-side
-- (service role) so no INSERT/UPDATE/DELETE policies are defined.
CREATE POLICY ai_usage_logs_select ON public.ai_usage_logs
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.wordpress_connections IS 'Per-project WordPress site connection (content module). Application Password stored encrypted (AES-256-GCM).';
COMMENT ON TABLE public.generated_articles IS 'Per-project generated/user articles (content module). Distinct from the global marketing blog table `articles`.';
