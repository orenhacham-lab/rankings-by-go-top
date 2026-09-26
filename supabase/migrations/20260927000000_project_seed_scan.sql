-- ============================================================================
-- SEED SCAN DATA MODEL — the initial site scan (plan §0, work package W2).
--
-- A new project starts from its URL. A two-stage pipeline reads the site,
-- understands the business, fills the project's settings, and shows every step
-- in the dashboard's activity feed as it finishes. This migration adds only the
-- tables that the pipeline, the onboarding screens and the settings will read
-- and write. No application code reads them yet, so applying it is inert.
--
--   project_profiles    one row per project: description, commerce type,
--                       niche, local or not, detected platform, and
--                       field_sources, which records for every field whether
--                       the scan or the user set it. A rescan must not
--                       overwrite a field the user set.
--   project_audiences   one row per audience, ordered, each with its source.
--   project_seed_runs   one row per pipeline run: trigger, stage, status, a
--                       lease so the 15-minute cron can resume a stuck run,
--                       a stable error code (never provider text), timings.
--   project_seed_steps  one row per step of a run (a1-a4, b1-b6): status, the
--                       item count for the feed line, a stable error code.
--   site_crawl_index    the site index built by step b1. Exactly the columns,
--                       defaults and CHECKs of wordpress_content_index, so code
--                       that reads that index can read this one for a site
--                       with no WordPress connection.
--
-- WHO MAY DO WHAT. Ownership is the repository's pattern:
--   project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
--   * profiles and audiences are the merchant's settings. The owner may read
--     and write them for their own projects, and every write must carry
--     user_id = auth.uid(). A profile is never deleted from the browser,
--     because it carries field_sources.
--   * runs, steps and the crawl index are written ONLY by server code with
--     the service role. The owner may read them; there is no write policy.
--   * anon gets nothing from any of the five tables.
--
-- PERMISSIONS follow 20260925000000_security_owasp_hardening.sql: every policy
-- is TO authenticated, RLS is on, and the table grants are narrowed to what the
-- policies allow. Supabase's default privileges grant ALL on every new public
-- table to anon and authenticated, TRUNCATE included, and RLS does not govern
-- TRUNCATE; so the grants are revoked and re-granted explicitly, and the two
-- layers deny independently.
--
-- Additive only: no existing table, function or policy is altered. The
-- updated_at trigger reuses public.update_updated_at_column(), the shared
-- trigger function already in Production (its search_path was pinned by
-- 20260925000000).
--
-- Executed probe: supabase/migrations/__qa__/project-seed-scan.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-seed-scan.probe.sql
--
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.project_seed_steps, public.project_seed_runs,
--     public.project_audiences, public.project_profiles, public.site_crawl_index;
-- ============================================================================

BEGIN;

-- ── 1. project_profiles — one row per project ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_profiles (
  project_id         uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,

  description        text CHECK (char_length(description) <= 1500),
  commerce_type      text CHECK (commerce_type IN ('product', 'service', 'content', 'other')),
  niche              text CHECK (char_length(niche) <= 120),
  is_local           boolean,
  detected_platform  text CHECK (char_length(detected_platform) <= 40),

  -- Per-field origin: {"<field>": "scan" | "user"}. Contract for the writers:
  -- the pipeline fills only fields that are empty or marked "scan", and an
  -- edit by the owner marks the field "user". The CHECK admits only a JSON
  -- object whose values are exactly "scan" or "user".
  field_sources      jsonb NOT NULL DEFAULT '{}'::jsonb
                       CHECK (CASE WHEN jsonb_typeof(field_sources) = 'object'
                                   THEN NOT jsonb_path_exists(field_sources,
                                          'strict $.* ? (@.type() != "string" || (@ != "scan" && @ != "user"))')
                                   ELSE false END),
  scanned_at         timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_profiles IS
  'Business profile of a project, filled by the seed scan and editable by the owner. One row per project.';
COMMENT ON COLUMN public.project_profiles.field_sources IS
  'Per-field origin: {"<field>": "scan" | "user"}. A rescan never overwrites a field marked "user".';

DROP TRIGGER IF EXISTS project_profiles_update_updated_at ON public.project_profiles;
CREATE TRIGGER project_profiles_update_updated_at
  BEFORE UPDATE ON public.project_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. project_audiences — one row per audience ────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_audiences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  position    smallint NOT NULL DEFAULT 0,
  label       text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 300),
  source      text NOT NULL DEFAULT 'user' CHECK (source IN ('scan', 'user')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_audiences_project_position
  ON public.project_audiences (project_id, position);

COMMENT ON TABLE public.project_audiences IS
  'Target audiences of a project, ordered by position; source says whether the seed scan or the owner added it.';

-- ── 3. project_seed_runs — one row per pipeline run ────────────────────────
CREATE TABLE IF NOT EXISTS public.project_seed_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  trigger           text NOT NULL CHECK (trigger IN ('create', 'rescan', 'claim', 'shopify_install')),
  stage             text NOT NULL DEFAULT 'a' CHECK (stage IN ('a', 'b')),
  status            text NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'done', 'partial', 'failed')),
  summary           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- A stable code such as 'site_unreachable', never provider or exception text.
  error_code        text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  -- Lease of the worker executing the run. Once it has passed while status is
  -- still 'running', the 15-minute cron may take the run over and resume it at
  -- its current step.
  lease_expires_at  timestamptz,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_seed_runs_project_created
  ON public.project_seed_runs (project_id, created_at DESC);
-- The cron's "stuck runs" lookup: only running rows carry a live lease.
CREATE INDEX IF NOT EXISTS idx_project_seed_runs_lease
  ON public.project_seed_runs (lease_expires_at) WHERE status = 'running';

COMMENT ON TABLE public.project_seed_runs IS
  'Seed-scan pipeline runs. Written only by service-role server code; the project owner may read.';

-- ── 4. project_seed_steps — one row per step of a run ──────────────────────
CREATE TABLE IF NOT EXISTS public.project_seed_steps (
  run_id       uuid NOT NULL REFERENCES public.project_seed_runs(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  step         text NOT NULL
                 CHECK (step IN ('a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'skipped', 'failed')),
  -- The number the feed line shows ("124 pages scanned"); NULL when a step
  -- has nothing to count.
  item_count   integer CHECK (item_count IS NULL OR item_count >= 0),
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code   text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  started_at   timestamptz,
  finished_at  timestamptz,
  PRIMARY KEY (run_id, step)
);

-- The dashboard activity feed: a project's finished steps, newest first.
CREATE INDEX IF NOT EXISTS idx_project_seed_steps_project_finished
  ON public.project_seed_steps (project_id, finished_at DESC);

COMMENT ON TABLE public.project_seed_steps IS
  'Steps of a seed-scan run (a1-a4, b1-b6). Written only by service-role server code; the project owner may read.';

-- ── 5. site_crawl_index — the site index from step b1 ──────────────────────
-- Column for column, default for default and CHECK for CHECK the shape of
-- public.wordpress_content_index (20260718_add_wordpress_content_index.sql),
-- so a reader of one reads the other. The writer stores a stable message in
-- error_message, never provider text.
CREATE TABLE IF NOT EXISTS public.site_crawl_index (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  site_url           text,
  site_host          text,

  scan_status        text NOT NULL DEFAULT 'completed'
                       CHECK (scan_status IN ('running', 'completed', 'partial', 'failed')),
  scanner_version    text,

  scan_params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary            jsonb NOT NULL DEFAULT '{}'::jsonb,
  targets            jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_links       jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings           jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message      text,

  scan_started_at    timestamptz,
  scan_completed_at  timestamptz,
  scan_duration_ms   integer,
  expires_at         timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- One row per project: the crawl upserts on this key.
  CONSTRAINT site_crawl_index_project_unique UNIQUE (project_id)
);

COMMENT ON TABLE public.site_crawl_index IS
  'Site index from the seed scan crawl, same shape as wordpress_content_index. Written only by service-role server code; the project owner may read.';

-- ── 6. Row-level security ──────────────────────────────────────────────────
ALTER TABLE public.project_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_audiences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_seed_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_seed_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_crawl_index   ENABLE ROW LEVEL SECURITY;

-- project_profiles: the owner reads, creates and edits; never deletes.
DROP POLICY IF EXISTS project_profiles_select ON public.project_profiles;
CREATE POLICY project_profiles_select ON public.project_profiles
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS project_profiles_insert ON public.project_profiles;
CREATE POLICY project_profiles_insert ON public.project_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS project_profiles_update ON public.project_profiles;
CREATE POLICY project_profiles_update ON public.project_profiles
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- project_audiences: the owner reads, adds, edits and removes.
DROP POLICY IF EXISTS project_audiences_select ON public.project_audiences;
CREATE POLICY project_audiences_select ON public.project_audiences
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS project_audiences_insert ON public.project_audiences;
CREATE POLICY project_audiences_insert ON public.project_audiences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS project_audiences_update ON public.project_audiences;
CREATE POLICY project_audiences_update ON public.project_audiences
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS project_audiences_delete ON public.project_audiences;
CREATE POLICY project_audiences_delete ON public.project_audiences
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- Runs, steps and the crawl index: the owner reads. No write policy exists
-- for any browser role; the service role writes (it bypasses RLS).
DROP POLICY IF EXISTS project_seed_runs_select ON public.project_seed_runs;
CREATE POLICY project_seed_runs_select ON public.project_seed_runs
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS project_seed_steps_select ON public.project_seed_steps;
CREATE POLICY project_seed_steps_select ON public.project_seed_steps
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS site_crawl_index_select ON public.site_crawl_index;
CREATE POLICY site_crawl_index_select ON public.site_crawl_index
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- ── 7. Table grants: exactly what the policies allow ───────────────────────
REVOKE ALL ON TABLE public.project_profiles, public.project_audiences, public.project_seed_runs,
  public.project_seed_steps, public.site_crawl_index FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_audiences TO authenticated;
GRANT SELECT ON TABLE public.project_seed_runs, public.project_seed_steps, public.site_crawl_index
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_profiles, public.project_audiences,
  public.project_seed_runs, public.project_seed_steps, public.site_crawl_index TO service_role;

COMMIT;
