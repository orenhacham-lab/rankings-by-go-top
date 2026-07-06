-- ============================================================================
-- Content Automation — WordPress content/link index cache (Phase 2A, additive)
--
-- Persists the READ-ONLY WordPress site-scan result per project (one row per
-- project, upserted) so future internal-link planning dry-runs can read the
-- cached index instead of rescanning the live WordPress site every time.
--
-- Cache-only: nothing here feeds generation/publishing/cron/queue or the
-- planner. All app access is best-effort — a missing table degrades to "no
-- cache" and the live scan still works. Fully reversible: DROP TABLE (no data
-- migration, no FK from other tables into it).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wordpress_content_index (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  site_url           text,
  site_host          text,

  -- running = a refresh is in progress; completed = full scan; partial =
  -- truncated / some items' content skipped but useful targets exist;
  -- failed = scan errored (prior good blobs are preserved on failure).
  scan_status        text NOT NULL DEFAULT 'completed'
                       CHECK (scan_status IN ('running', 'completed', 'partial', 'failed')),
  scanner_version    text,

  scan_params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- report minus targets/sample_links/warnings
  targets            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ScannedTarget[] (planner-relevant part)
  sample_links       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- diagnostics only
  warnings           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { notes: [], errors: [] }
  error_message      text,

  scan_started_at    timestamptz,
  scan_completed_at  timestamptz,
  scan_duration_ms   integer,
  expires_at         timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- One row per project (v1): refresh upserts on this key.
  CONSTRAINT wordpress_content_index_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_content_index_project
  ON public.wordpress_content_index (project_id, scan_completed_at DESC);

ALTER TABLE public.wordpress_content_index ENABLE ROW LEVEL SECURITY;

-- Ownership-gated: a user may only touch the index for projects they own.
CREATE POLICY wordpress_content_index_select ON public.wordpress_content_index
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY wordpress_content_index_insert ON public.wordpress_content_index
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY wordpress_content_index_update ON public.wordpress_content_index
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY wordpress_content_index_delete ON public.wordpress_content_index
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
