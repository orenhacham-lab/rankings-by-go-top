-- ============================================================================
-- SITE HEALTH AUTO-FIX: the owner's switch for automatic fixes, per project.
--
-- WHAT. A project's owner may let three kinds of site-health fix be applied
-- without a click: image alt text where an image has none, a dead internal link
-- removed (its words kept), and a meta description where a page has none. Only
-- on WordPress with the Go Top plugin; never Shopify. OFF until the owner turns
-- it on in the project's settings, after the covered types are shown.
--
--   site_fix_auto_grants   one row per time the switch was turned on
--     fix_types          the closed list below (the same three names as
--                        AUTO_SAFE_TYPES in lib/site-fix/types.ts; a QA guard
--                        holds them together)
--     enabled_by / enabled_at / enabled_ip
--                        who turned it on, when, and the IP of that request.
--                        Every automatic fix is recorded in site_fix_jobs and
--                        site_fix_audit with THESE values; no new IP is read
--                        when a fix runs. Never changed afterwards (a trigger).
--     disabled_at / disabled_by
--                        turning it off; final for that row. Turning it on
--                        again is a new row, so the history stays.
--     last_run_at / run_claimed_until
--                        the scheduler's bookkeeping (one run every 7 days per
--                        project; a run holds the project for 10 minutes).
--
-- At most one active row per project (a partial unique index). No row is ever
-- deleted, except by the project's own deletion (ON DELETE CASCADE).
--
-- ACCESS. Written ONLY by service-role server code, after the API route proved
-- the user owns the project (filtered by project AND owner). The owner may
-- SELECT their own rows under RLS. anon has nothing; no role may DELETE.
-- Grants follow 20260928000300_site_fix_queue.sql.
--
-- Additive: one new table, one function; nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.site_fix_auto_grants;
--   DROP FUNCTION IF EXISTS public.site_fix_auto_grants_guard();
-- Executed probe: supabase/migrations/__qa__/site-fix-auto-grants.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_fix_auto_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fix_types          text[] NOT NULL,
  enabled_by         uuid NOT NULL,
  enabled_at         timestamptz NOT NULL DEFAULT now(),
  enabled_ip         text,
  disabled_at        timestamptz,
  disabled_by        uuid,
  last_run_at        timestamptz,
  run_claimed_until  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- The closed list of what may ever be fixed without a click.
  CONSTRAINT site_fix_auto_grants_types CHECK (cardinality(fix_types) BETWEEN 1 AND 3
    AND fix_types <@ ARRAY['image_alt', 'broken_link', 'meta_description']::text[]),
  CONSTRAINT site_fix_auto_grants_owner CHECK (enabled_by = user_id),
  CONSTRAINT site_fix_auto_grants_ip CHECK (enabled_ip IS NULL OR length(enabled_ip) <= 64),
  CONSTRAINT site_fix_auto_grants_off CHECK (disabled_at IS NULL OR disabled_at >= enabled_at),
  CONSTRAINT site_fix_auto_grants_off_by CHECK ((disabled_at IS NULL) = (disabled_by IS NULL)
    AND (disabled_by IS NULL OR disabled_by = user_id))
);

CREATE UNIQUE INDEX IF NOT EXISTS site_fix_auto_grants_one_active
  ON public.site_fix_auto_grants (project_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS site_fix_auto_grants_due_idx
  ON public.site_fix_auto_grants (last_run_at NULLS FIRST) WHERE disabled_at IS NULL;

COMMENT ON TABLE public.site_fix_auto_grants IS
  'The owner''s switch for automatic site-health fixes (image alt, dead link, missing meta description) on one project: who turned it on, when, from which IP, and when it was turned off. Written only by service-role server code; rows are never deleted.';

-- Who turned it on, when, from where and for what never changes; off is final for a row;
-- a row is deleted only with its project.
CREATE OR REPLACE FUNCTION public.site_fix_auto_grants_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'site_fix_auto_grants rows are never deleted' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- The project's ON DELETE CASCADE runs as a nested trigger, after the project row is gone.
    IF pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = OLD.project_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'site_fix_auto_grants rows are never deleted' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.fix_types IS DISTINCT FROM OLD.fix_types OR NEW.enabled_by IS DISTINCT FROM OLD.enabled_by
     OR NEW.enabled_at IS DISTINCT FROM OLD.enabled_at OR NEW.enabled_ip IS DISTINCT FROM OLD.enabled_ip
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'site_fix_auto_grants: what was granted never changes' USING ERRCODE = '42501';
  END IF;
  IF OLD.disabled_at IS NOT NULL
     AND (NEW.disabled_at IS DISTINCT FROM OLD.disabled_at OR NEW.disabled_by IS DISTINCT FROM OLD.disabled_by) THEN
    RAISE EXCEPTION 'site_fix_auto_grants: a grant turned off stays off' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS site_fix_auto_grants_guard ON public.site_fix_auto_grants;
CREATE TRIGGER site_fix_auto_grants_guard BEFORE UPDATE OR DELETE ON public.site_fix_auto_grants
  FOR EACH ROW EXECUTE FUNCTION public.site_fix_auto_grants_guard();
DROP TRIGGER IF EXISTS site_fix_auto_grants_no_truncate ON public.site_fix_auto_grants;
CREATE TRIGGER site_fix_auto_grants_no_truncate BEFORE TRUNCATE ON public.site_fix_auto_grants
  FOR EACH STATEMENT EXECUTE FUNCTION public.site_fix_auto_grants_guard();

-- ── Row level security and grants ───────────────────────────────────────────
ALTER TABLE public.site_fix_auto_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_fix_auto_grants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.site_fix_auto_grants TO authenticated;
-- The server: read, turn on (insert), turn off and run (update). No DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE public.site_fix_auto_grants TO service_role;

DROP POLICY IF EXISTS site_fix_auto_grants_owner_select ON public.site_fix_auto_grants;
CREATE POLICY site_fix_auto_grants_owner_select ON public.site_fix_auto_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;
