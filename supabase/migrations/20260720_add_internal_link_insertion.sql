-- ============================================================================
-- Content Automation — internal-link INSERTION apply/rollback (Phase 2D.2)
--
-- Additive support for a MANUAL, DRAFT-ONLY apply of approved internal-link
-- plans: a content snapshot (for verbatim rollback), a per-attempt insertion
-- audit trail, and insertion-outcome columns on the plan links.
--
-- Nothing here is read by generation / publishing / cron / queue / approval.
-- Fully reversible: DROP the two tables + the added columns.
-- ============================================================================

-- Pre-apply snapshot of the draft (exact prior state → verbatim rollback).
CREATE TABLE IF NOT EXISTS public.generated_article_content_snapshots (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL,
  project_id                uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  generated_article_id      uuid NOT NULL REFERENCES public.generated_articles(id) ON DELETE CASCADE,
  batch_id                  uuid,
  reason                    text NOT NULL DEFAULT 'internal_link_apply',
  content_html_before       text,
  content_markdown_before   text,
  internal_links_json_before jsonb,
  article_status_before     text,
  checksum_before           text,
  restored_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gac_snapshots_article
  ON public.generated_article_content_snapshots (generated_article_id, created_at DESC);

-- One row per apply attempt per link (full history).
CREATE TABLE IF NOT EXISTS public.article_internal_link_insertions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL,
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  batch_id              uuid,
  link_id               uuid,
  generated_article_id  uuid,
  outcome               text NOT NULL CHECK (outcome IN ('inserted', 'skipped', 'failed', 'rolled_back')),
  reason                text,
  anchor_text           text,
  target_url            text,
  checksum_before       text,
  checksum_after        text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ilp_insertions_article
  ON public.article_internal_link_insertions (generated_article_id, created_at DESC);

-- Insertion-outcome columns on the plan links (separate from the review status).
ALTER TABLE public.article_internal_link_plan_links
  ADD COLUMN IF NOT EXISTS insertion_status text NOT NULL DEFAULT 'pending'
    CHECK (insertion_status IN ('pending', 'inserted', 'skipped', 'failed', 'superseded', 'rolled_back')),
  ADD COLUMN IF NOT EXISTS insertion_reason text,
  ADD COLUMN IF NOT EXISTS inserted_at timestamptz,
  ADD COLUMN IF NOT EXISTS inserted_article_id uuid,
  ADD COLUMN IF NOT EXISTS inserted_anchor_text text;

-- Batch-level counters (advisory).
ALTER TABLE public.article_internal_link_plan_batches
  ADD COLUMN IF NOT EXISTS inserted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.generated_article_content_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_internal_link_insertions   ENABLE ROW LEVEL SECURITY;

CREATE POLICY gac_snapshots_select ON public.generated_article_content_snapshots
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gac_snapshots_insert ON public.generated_article_content_snapshots
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gac_snapshots_update ON public.generated_article_content_snapshots
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gac_snapshots_delete ON public.generated_article_content_snapshots
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY ilp_insertions_select ON public.article_internal_link_insertions
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_insertions_insert ON public.article_internal_link_insertions
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_insertions_update ON public.article_internal_link_insertions
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY ilp_insertions_delete ON public.article_internal_link_insertions
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
