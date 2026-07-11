-- ============================================================================
-- Content Automation — internal-link PLAN persistence (Phase 2C, additive, INERT)
--
-- Persists a reviewed internal-link PLAN per planning subject (topic / pool item
-- / generated article). A parent BATCH row records one planning run (even with
-- ZERO links) so zero-link results are auditable; child LINK rows record each
-- proposed link.
--
-- INERT BY DESIGN: nothing in generation / publishing / cron / queue / approval
-- reads these tables. 'approved' here is a REVIEW status only — NOT permission to
-- insert links into article HTML (insertion is a later phase). Fully reversible:
-- DROP the two tables (no FK from any existing table points at them).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_internal_link_plan_batches (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Planning subject (at least one set).
  topic_id                 uuid REFERENCES public.article_topics(id) ON DELETE CASCADE,
  article_pool_item_id     uuid REFERENCES public.article_pool_items(id) ON DELETE CASCADE,
  generated_article_id     uuid REFERENCES public.generated_articles(id) ON DELETE CASCADE,
  subject_type             text NOT NULL CHECK (subject_type IN ('topic', 'pool_item', 'generated_article')),

  -- Snapshot of the subject + provenance at plan time (audit + staleness).
  subject_title_snapshot   text,
  primary_keyword_snapshot text,
  planner_version          text,
  cache_scanner_version    text,
  cache_scan_completed_at  timestamptz,
  cache_state              text,
  allow_caution            boolean NOT NULL DEFAULT false,
  strict                   boolean NOT NULL DEFAULT false,
  stale_at_creation        boolean NOT NULL DEFAULT false,

  status                   text NOT NULL DEFAULT 'planned'
                             CHECK (status IN ('planned', 'approved', 'rejected', 'superseded')),
  link_count               integer NOT NULL DEFAULT 0,
  selected_count           integer NOT NULL DEFAULT 0,
  rejected_count           integer NOT NULL DEFAULT 0,
  diagnostics_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings                 jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ilp_batches_subject
  ON public.article_internal_link_plan_batches (project_id, subject_type, topic_id, article_pool_item_id, generated_article_id, status);
-- Fast "latest active batch per subject".
CREATE INDEX IF NOT EXISTS idx_ilp_batches_topic_latest
  ON public.article_internal_link_plan_batches (topic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.article_internal_link_plan_links (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                 uuid NOT NULL REFERENCES public.article_internal_link_plan_batches(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  topic_id                 uuid,
  article_pool_item_id     uuid,
  generated_article_id     uuid,

  target_url               text NOT NULL,
  target_title             text,
  target_role              text,
  target_priority          text,
  anchor_text              text,
  anchor_source            text,
  confidence               numeric,
  relevance                numeric,
  reason                   text,

  status                   text NOT NULL DEFAULT 'planned'
                             CHECK (status IN ('planned', 'approved', 'rejected', 'superseded')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- No duplicate target within one batch.
  CONSTRAINT ilp_links_batch_target_unique UNIQUE (batch_id, target_url)
);

CREATE INDEX IF NOT EXISTS idx_ilp_links_batch ON public.article_internal_link_plan_links (batch_id);

ALTER TABLE public.article_internal_link_plan_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_internal_link_plan_links   ENABLE ROW LEVEL SECURITY;

-- Ownership-gated: a user may only touch plans for projects they own.
CREATE POLICY ilp_batches_select ON public.article_internal_link_plan_batches
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_batches_insert ON public.article_internal_link_plan_batches
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_batches_update ON public.article_internal_link_plan_batches
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_batches_delete ON public.article_internal_link_plan_batches
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY ilp_links_select ON public.article_internal_link_plan_links
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_links_insert ON public.article_internal_link_plan_links
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_links_update ON public.article_internal_link_plan_links
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_links_delete ON public.article_internal_link_plan_links
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
