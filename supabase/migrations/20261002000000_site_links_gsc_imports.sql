-- ============================================================================
-- SITE LINKS: THE SEARCH CONSOLE LINKS FILE A PROJECT'S OWNER IMPORTED.
--
-- WHAT. The Search Console API has no links report, so the owner may export the
-- Links report from Search Console and upload the file on the "Links to your
-- site" tab. What is stored is a SNAPSHOT of that file, never a live feed:
--
--   site_links_gsc_imports   one row per project (UNIQUE project_id); a new
--                            import REPLACES the row
--     user_id              the project's owner, written by the server from the project row
--     imported_at          when the file was imported (shown to the owner)
--     file_name            the uploaded file's name (cleaned, <= 200 chars)
--     linking_sites        jsonb array, top 500: {site, linkingPages, targetPages}
--     target_pages         jsonb array, top 500: {page, incomingLinks, linkingSites}
--     latest_links         jsonb array, top 500: {linkingPage, lastCrawled}
--     *_total              how many rows each list had in the file
--
-- ACCESS. Owner only: RLS limits every browser-role row to projects the caller
-- owns (admins included: no special read), anon has nothing. The app writes with
-- the service role after checking ownership (lib/site-links/gsc-import/http.ts).
-- The jsonb lists are capped by CHECK constraints so no writer can store more
-- than the app does. Grants follow 20260928000100_site_platform_connections.sql.
--
-- Additive: one new table; nothing existing changes. Idempotent: every statement
-- can be re-run. The screen works without it (the import is shown as not yet
-- available), so this can be applied after the code ships.
-- Rollback:
--   DROP TABLE IF EXISTS public.site_links_gsc_imports;
-- Executed probe: supabase/migrations/__qa__/site-links-gsc-imports.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_links_gsc_imports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL,
  imported_at          timestamptz NOT NULL DEFAULT now(),
  file_name            text,
  linking_sites        jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_pages         jsonb NOT NULL DEFAULT '[]'::jsonb,
  latest_links         jsonb NOT NULL DEFAULT '[]'::jsonb,
  linking_sites_total  integer NOT NULL DEFAULT 0,
  target_pages_total   integer NOT NULL DEFAULT 0,
  latest_links_total   integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_links_gsc_imports_project_unique UNIQUE (project_id),
  CONSTRAINT site_links_gsc_imports_file_name CHECK (file_name IS NULL OR length(file_name) <= 200),
  CONSTRAINT site_links_gsc_imports_linking_sites
    CHECK (jsonb_typeof(linking_sites) = 'array' AND jsonb_array_length(linking_sites) <= 500),
  CONSTRAINT site_links_gsc_imports_target_pages
    CHECK (jsonb_typeof(target_pages) = 'array' AND jsonb_array_length(target_pages) <= 500),
  CONSTRAINT site_links_gsc_imports_latest_links
    CHECK (jsonb_typeof(latest_links) = 'array' AND jsonb_array_length(latest_links) <= 500),
  CONSTRAINT site_links_gsc_imports_totals
    CHECK (linking_sites_total BETWEEN 0 AND 100000 AND target_pages_total BETWEEN 0 AND 100000 AND latest_links_total BETWEEN 0 AND 100000)
);

COMMENT ON TABLE public.site_links_gsc_imports IS
  'The Search Console Links export a project owner imported: a snapshot (never live), replaced by each new import. Written by service-role server code after an ownership check.';

ALTER TABLE public.site_links_gsc_imports ENABLE ROW LEVEL SECURITY;

-- Browser roles: the owner works with their own project's row. anon: nothing.
REVOKE ALL ON TABLE public.site_links_gsc_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_links_gsc_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_links_gsc_imports TO service_role;

-- Owner only, and only for a project the caller owns (user_id alone could be forged on insert).
DROP POLICY IF EXISTS site_links_gsc_imports_owner ON public.site_links_gsc_imports;
CREATE POLICY site_links_gsc_imports_owner ON public.site_links_gsc_imports
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;
