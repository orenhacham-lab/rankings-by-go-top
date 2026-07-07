-- ============================================================================
-- Content Automation — persisted TOPIC IDEAS (Phase 3F.3, additive)
--
-- Persists generated topic-idea suggestions per project so they survive a page
-- refresh, can be approved into article_topics, and can be REJECTED durably
-- (rejected fingerprints are remembered so the same idea is not suggested again).
--
-- Additive + reversible: no existing table references this one; DROP to undo.
-- 'approved' here links to the created article_topics row (approved_topic_id).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.content_topic_ideas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Which generator produced it (engine RecommendationSource string) + run id.
  source                   text NOT NULL,
  batch_id                 uuid NOT NULL,

  title                    text NOT NULL,
  primary_keyword          text,
  secondary_keywords       jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_intent            text,
  angle                    text,
  recommended_word_count   integer,
  suggested_internal_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestion_reason        text,
  source_context           text,
  source_url               text,
  score                    numeric,

  -- Conservative normalized fingerprint (from primary_keyword or title) used to
  -- avoid re-suggesting an idea already pending/approved/rejected in the project.
  fingerprint              text NOT NULL,

  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected', 'duplicate')),
  approved_topic_id        uuid REFERENCES public.article_topics(id) ON DELETE SET NULL,
  rejected_at              timestamptz,
  approved_at              timestamptz,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- One row per (project, fingerprint): a re-generated idea never duplicates an
  -- existing pending/approved/rejected one.
  CONSTRAINT content_topic_ideas_project_fingerprint_unique UNIQUE (project_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_content_topic_ideas_project_status
  ON public.content_topic_ideas (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_topic_ideas_project_source
  ON public.content_topic_ideas (project_id, source, status);

ALTER TABLE public.content_topic_ideas ENABLE ROW LEVEL SECURITY;

-- Ownership-gated: a user may only touch ideas for projects they own.
CREATE POLICY content_topic_ideas_select ON public.content_topic_ideas
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY content_topic_ideas_insert ON public.content_topic_ideas
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY content_topic_ideas_update ON public.content_topic_ideas
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY content_topic_ideas_delete ON public.content_topic_ideas
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
