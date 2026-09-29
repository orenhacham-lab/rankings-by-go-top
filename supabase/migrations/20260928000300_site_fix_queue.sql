-- ============================================================================
-- SITE HEALTH AUTO-FIX: the fix queue, its audit trail, and the plugin link.
--
-- WHAT. "Fix it for me" on the site-health screen now goes through a queue:
-- the merchant approves ONE fix (one element of one page), the server records
-- the approval, applies it through the site's channel, and records the outcome.
-- Three new tables; nothing existing changes.
--
--   site_fix_plugin_links   one row per project: the Go Top WordPress plugin
--                           paired with this project. The plugin authenticates
--                           every request we send with an HMAC over a per-site
--                           secret; the secret is stored here AES-256-GCM
--                           ("iv:tag:ciphertext", like wordpress_connections).
--     key_id             public id of the key ("gtk_" + 16 hex), sent in a header
--     secret_encrypted   never granted to a browser role
--     status             pending (code issued, plugin not seen yet) | connected |
--                        disconnected (the last signed call failed)
--
--   site_fix_jobs           one row per approved fix
--     fix_type           the closed whitelist below; nothing else can be queued
--     page_url           the page that is written to
--     payload            the approved new value(s), as the approval showed them
--     before_value       what the page held when the merchant approved (display)
--     channel            plugin | app_password | webhook | manual
--     status             pending | applied | failed | cancelled | sent | manual | reverted
--     undo               what restores the previous value (server use only)
--     approved_by / approved_at / approved_ip   who approved, when, from where
--
--   site_fix_audit          APPEND-ONLY, one row per event of a job: approved,
--                           applied, failed, sent, marked_manual, cancelled,
--                           retried, reverted, revert_failed. Holds the previous
--                           and the new value of every write. No UPDATE, no
--                           DELETE for anyone (a trigger refuses both, and no
--                           role is granted them). project_id carries no foreign
--                           key on purpose: the trail outlives a deleted project
--                           (the retention the terms clause states).
--
-- ACCESS. Rows are written ONLY by service-role server code, after the API route
-- proved the user owns the project (the routes filter every service-role read
-- and write by project AND owner). The project owner may SELECT their own rows
-- under RLS (jobs and audit: all columns; plugin link: the non-secret columns).
-- anon has nothing. Grants follow 20260928000100_site_platform_connections.sql.
--
-- Additive: three new tables; nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.site_fix_audit;
--   DROP TABLE IF EXISTS public.site_fix_jobs;
--   DROP TABLE IF EXISTS public.site_fix_plugin_links;
--   DROP FUNCTION IF EXISTS public.site_fix_audit_append_only();
-- Executed probe: supabase/migrations/__qa__/site-fix-queue.probe.sql
-- ============================================================================

BEGIN;

-- ── The plugin link ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_fix_plugin_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_url          text NOT NULL,
  key_id            text NOT NULL,
  secret_encrypted  text NOT NULL,
  secret_hint       text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  plugin_version    text,
  seo_plugin        text,
  last_seen_at      timestamptz,
  last_error_code   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_fix_plugin_links_project_unique UNIQUE (project_id),
  CONSTRAINT site_fix_plugin_links_key_unique UNIQUE (key_id),
  CONSTRAINT site_fix_plugin_links_key_id CHECK (key_id ~ '^gtk_[0-9a-f]{16}$'),
  CONSTRAINT site_fix_plugin_links_site_url CHECK (site_url ~ '^https://' AND length(site_url) <= 2048),
  CONSTRAINT site_fix_plugin_links_secret_encrypted CHECK (secret_encrypted ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$'),
  CONSTRAINT site_fix_plugin_links_secret_hint CHECK (length(secret_hint) BETWEEN 1 AND 24),
  CONSTRAINT site_fix_plugin_links_status CHECK (status IN ('pending', 'connected', 'disconnected')),
  CONSTRAINT site_fix_plugin_links_version CHECK (plugin_version IS NULL OR plugin_version ~ '^[0-9]{1,3}(\.[0-9]{1,3}){0,3}$'),
  CONSTRAINT site_fix_plugin_links_seo_plugin CHECK (seo_plugin IS NULL OR seo_plugin IN ('yoast', 'rankmath', 'none')),
  CONSTRAINT site_fix_plugin_links_error_code CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$')
);

COMMENT ON TABLE public.site_fix_plugin_links IS
  'The Go Top WordPress plugin paired with one project. secret_encrypted (AES-256-GCM) signs every request to the plugin and is never granted to browser roles. Written only by service-role server code.';

-- ── The jobs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_fix_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fix_type       text NOT NULL,
  finding_kind   text NOT NULL,
  page_url       text NOT NULL,
  payload        jsonb NOT NULL,
  before_value   text,
  after_summary  text,
  channel        text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  error_code     text,
  undo           jsonb,
  remote_ref     text,
  approved_by    uuid NOT NULL,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  approved_ip    text,
  applied_at     timestamptz,
  reverted_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- The closed list of what may ever be written to a merchant's site.
  CONSTRAINT site_fix_jobs_fix_type CHECK (fix_type IN (
    'seo_title', 'meta_description', 'canonical', 'focus_keyphrase', 'image_alt',
    'faq_block', 'schema_jsonld', 'broken_link', 'internal_link')),
  CONSTRAINT site_fix_jobs_finding_kind CHECK (finding_kind ~ '^[a-z_]{1,40}$'),
  CONSTRAINT site_fix_jobs_page_url CHECK (page_url ~ '^https?://' AND length(page_url) <= 2048),
  CONSTRAINT site_fix_jobs_payload CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  CONSTRAINT site_fix_jobs_before CHECK (before_value IS NULL OR length(before_value) <= 65536),
  CONSTRAINT site_fix_jobs_after CHECK (after_summary IS NULL OR length(after_summary) <= 4000),
  CONSTRAINT site_fix_jobs_channel CHECK (channel IN ('plugin', 'app_password', 'webhook', 'manual')),
  CONSTRAINT site_fix_jobs_status CHECK (status IN ('pending', 'applied', 'failed', 'cancelled', 'sent', 'manual', 'reverted')),
  CONSTRAINT site_fix_jobs_error_code CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  CONSTRAINT site_fix_jobs_undo CHECK (undo IS NULL OR (jsonb_typeof(undo) = 'object' AND octet_length(undo::text) <= 1100000)),
  CONSTRAINT site_fix_jobs_remote_ref CHECK (remote_ref IS NULL OR remote_ref ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  CONSTRAINT site_fix_jobs_ip CHECK (approved_ip IS NULL OR length(approved_ip) <= 64)
);

CREATE INDEX IF NOT EXISTS site_fix_jobs_project_created_idx ON public.site_fix_jobs (project_id, created_at DESC);

COMMENT ON TABLE public.site_fix_jobs IS
  'One approved site-health fix: what was approved (payload), through which channel, and its state. Written only by service-role server code.';

-- ── The audit trail (append-only) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_fix_audit (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id          uuid NOT NULL,
  user_id         uuid NOT NULL,
  project_id      uuid NOT NULL,
  action          text NOT NULL,
  actor_id        uuid,
  actor_ip        text,
  channel         text,
  previous_value  text,
  new_value       text,
  result_code     text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_fix_audit_action CHECK (action IN (
    'approved', 'applied', 'failed', 'sent', 'marked_manual', 'cancelled', 'retried', 'reverted', 'revert_failed')),
  CONSTRAINT site_fix_audit_channel CHECK (channel IS NULL OR channel IN ('plugin', 'app_password', 'webhook', 'manual')),
  CONSTRAINT site_fix_audit_ip CHECK (actor_ip IS NULL OR length(actor_ip) <= 64),
  CONSTRAINT site_fix_audit_previous CHECK (previous_value IS NULL OR length(previous_value) <= 1100000),
  CONSTRAINT site_fix_audit_new CHECK (new_value IS NULL OR length(new_value) <= 1100000),
  CONSTRAINT site_fix_audit_result CHECK (result_code IS NULL OR result_code ~ '^[a-z0-9_]{1,64}$')
);

CREATE INDEX IF NOT EXISTS site_fix_audit_job_idx ON public.site_fix_audit (job_id, created_at);
CREATE INDEX IF NOT EXISTS site_fix_audit_project_idx ON public.site_fix_audit (project_id, created_at DESC);

COMMENT ON TABLE public.site_fix_audit IS
  'Append-only trail of every site-health fix event: who approved, when, from which IP, the previous and the new value. No UPDATE or DELETE for any role.';

CREATE OR REPLACE FUNCTION public.site_fix_audit_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'site_fix_audit is append-only' USING ERRCODE = '42501';
END; $$;

DROP TRIGGER IF EXISTS site_fix_audit_no_update ON public.site_fix_audit;
CREATE TRIGGER site_fix_audit_no_update BEFORE UPDATE OR DELETE ON public.site_fix_audit
  FOR EACH ROW EXECUTE FUNCTION public.site_fix_audit_append_only();
DROP TRIGGER IF EXISTS site_fix_audit_no_truncate ON public.site_fix_audit;
CREATE TRIGGER site_fix_audit_no_truncate BEFORE TRUNCATE ON public.site_fix_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.site_fix_audit_append_only();

-- ── Row level security and grants ───────────────────────────────────────────
ALTER TABLE public.site_fix_plugin_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_fix_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_fix_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_fix_plugin_links FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.site_fix_jobs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.site_fix_audit FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (id, user_id, project_id, site_url, key_id, secret_hint, status, plugin_version, seo_plugin,
              last_seen_at, last_error_code, created_at, updated_at)
  ON TABLE public.site_fix_plugin_links TO authenticated;
GRANT SELECT ON TABLE public.site_fix_jobs TO authenticated;
GRANT SELECT ON TABLE public.site_fix_audit TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_fix_plugin_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_fix_jobs TO service_role;
-- The trail: read and append, nothing else.
GRANT SELECT, INSERT ON TABLE public.site_fix_audit TO service_role;

DROP POLICY IF EXISTS site_fix_plugin_links_owner_select ON public.site_fix_plugin_links;
CREATE POLICY site_fix_plugin_links_owner_select ON public.site_fix_plugin_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS site_fix_jobs_owner_select ON public.site_fix_jobs;
CREATE POLICY site_fix_jobs_owner_select ON public.site_fix_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS site_fix_audit_owner_select ON public.site_fix_audit;
CREATE POLICY site_fix_audit_owner_select ON public.site_fix_audit
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;
