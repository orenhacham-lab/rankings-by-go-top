-- ============================================================================
-- Content Automation — keyword-research cache (additive, minimal)
--
-- Caches Google Ads keyword-ideas responses per project + seed so the
-- recommendation engine does not hit Google repeatedly for the same domain/seed
-- (default TTL 30 days, enforced in app). All cache access is best-effort: if
-- this table is absent the engine still works (just re-fetches).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.keyword_research_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  seed_type    text NOT NULL CHECK (seed_type IN ('url', 'keyword', 'keyword_url')),
  seed_value   text NOT NULL,
  country      text NOT NULL,
  language     text NOT NULL,

  results_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT keyword_research_cache_unique UNIQUE (project_id, seed_type, seed_value, country, language)
);

CREATE INDEX IF NOT EXISTS idx_keyword_research_cache_project
  ON public.keyword_research_cache (project_id, fetched_at DESC);

ALTER TABLE public.keyword_research_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY keyword_research_cache_select ON public.keyword_research_cache
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY keyword_research_cache_insert ON public.keyword_research_cache
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY keyword_research_cache_update ON public.keyword_research_cache
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY keyword_research_cache_delete ON public.keyword_research_cache
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
