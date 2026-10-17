-- ============================================================================
-- SITE PAGE MAP — the full-site mapping of the "existing content" screen.
--
-- The screen shows every page of the merchant's site in tabs (pages, products,
-- articles, categories) with the true total of each. The list comes from the
-- site's own sitemaps, then the connected platform's REST lists, read in the
-- background by lib/content/existing-content/site-map-run.ts. This table keeps
-- that run's state (so the screen can show its progress) and its result.
--
--   site_page_map   one row per project: the run's status and phase, the
--                   counters the progress line shows, a lease so only one run
--                   works at a time (and a dead one frees itself), a stable
--                   stop_reason code (never provider text), the entries found
--                   (a JSON array, capped by the code at 10 000) and their
--                   counts per tab.
--
-- WHO MAY DO WHAT (the repository's pattern, as site_crawl_index):
--   * written ONLY by server code with the service role; there is no write
--     policy, and the grants give authenticated SELECT alone;
--   * the owner may read the row of their own projects:
--       project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
--   * anon gets nothing.
--
-- PERMISSIONS follow 20260925000000_security_owasp_hardening.sql: RLS on, every
-- policy TO authenticated, and Supabase's default ALL grants revoked and
-- re-granted narrowly, TRUNCATE included, so the two layers deny independently.
--
-- Additive only: no existing table, function or policy is altered. The code
-- reads a missing table as "no mapping yet" and hides the feature, so the app
-- works before and after this is applied.
--
-- Executed probe: supabase/migrations/__qa__/site-page-map.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-page-map.probe.sql
--
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.site_page_map;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_page_map (
  project_id        uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,

  site_url          text CHECK (site_url IS NULL OR char_length(site_url) <= 300),

  status            text NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  phase             text CHECK (phase IS NULL OR phase IN ('robots', 'sitemaps', 'platform')),
  urls_found        integer NOT NULL DEFAULT 0 CHECK (urls_found >= 0),
  docs_read         integer NOT NULL DEFAULT 0 CHECK (docs_read >= 0),
  docs_seen         integer NOT NULL DEFAULT 0 CHECK (docs_seen >= 0),
  capped            boolean NOT NULL DEFAULT false,
  -- A stable code such as 'cap', 'time', 'no_sitemap', 'robots_unreadable'.
  stop_reason       text CHECK (stop_reason IS NULL OR stop_reason ~ '^[a-z0-9_]{1,64}$'),

  -- [{"u": url, "k": kind, "p": platform type, "t": title, "m": lastmod}, …]
  entries           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(entries) = 'array'),
  -- {"all": n, "product": n, "article": n, "page": n, "category": n}
  counts            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),

  -- The live run's lease. Once it has passed while status is still 'running',
  -- the run died, and a new one may take the row.
  lease_expires_at  timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.site_page_map IS
  'Full-site mapping of a project (sitemaps, then platform lists) for the existing-content screen. Written only by service-role server code; the project owner may read.';

DROP TRIGGER IF EXISTS site_page_map_update_updated_at ON public.site_page_map;
CREATE TRIGGER site_page_map_update_updated_at
  BEFORE UPDATE ON public.site_page_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.site_page_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_page_map_select ON public.site_page_map;
CREATE POLICY site_page_map_select ON public.site_page_map
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

REVOKE ALL ON TABLE public.site_page_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_page_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_page_map TO service_role;

COMMIT;
