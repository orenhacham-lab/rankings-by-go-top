-- ============================================================================
-- SITE PLATFORMS: WIX AND A CUSTOM SITE (WEBHOOK).
--
-- WHAT. A web project publishes to ONE site platform. WordPress and Shopify
-- keep their own tables (wordpress_connections, shopify_connections), which are
-- NOT touched here. The two new platforms share one new table:
--
--   site_platform_connections   one row per project (UNIQUE project_id)
--     platform           'wix' | 'webhook'
--     wix_site_id        Wix only: the site's id (a UUID)
--     wix_member_id      Wix only: the blog author the posts are created as,
--                        read from the site during "test connection"
--     site_url           the public site address, shown to the owner
--     endpoint_url       webhook only: the https:// address we POST to
--     secret_encrypted   the Wix API key, or the webhook signing secret,
--                        AES-256-GCM "iv:tag:ciphertext" exactly like
--                        wordpress_connections.wp_application_password_encrypted
--     secret_hint        a masked form for the screen ("••••a1b2"), never the secret
--     connection_status  untested | connected | failed
--     last_error_code    a stable code the app localizes, never a provider's text
--
-- And three nullable columns on generated_articles, so a post is created once
-- and never duplicated on a retry (the same role wp_post_id and
-- shopify_article_id play for the other two platforms):
--
--     site_post_platform   'wix' | 'webhook'
--     site_post_id         the Wix post id, or the delivery id we sent the site
--     site_post_url        the live URL when the platform returned one
--
-- ACCESS. Rows are written ONLY by service-role server code (the API routes
-- check ownership first). The project owner may SELECT their own rows under
-- RLS, and only the non-secret columns: authenticated has no SELECT on
-- secret_encrypted at all, so even the ciphertext never reaches a browser.
-- anon has nothing. Grants follow 20260927000100_keyword_competitor_positions.sql.
--
-- Additive: one new table and three nullable columns; nothing existing changes.
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.site_platform_connections;
--   ALTER TABLE public.generated_articles DROP COLUMN IF EXISTS site_post_platform,
--     DROP COLUMN IF EXISTS site_post_id, DROP COLUMN IF EXISTS site_post_url;
-- Executed probe: supabase/migrations/__qa__/site-platform-connections.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_platform_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The project owner. Written by the server from the project row, never from a request.
  user_id            uuid NOT NULL,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform           text NOT NULL,
  wix_site_id        text,
  wix_member_id      text,
  site_url           text,
  endpoint_url       text,
  secret_encrypted   text NOT NULL,
  secret_hint        text NOT NULL,
  connection_status  text NOT NULL DEFAULT 'untested',
  last_error_code    text,
  last_tested_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_platform_connections_project_unique UNIQUE (project_id),
  CONSTRAINT site_platform_connections_platform
    CHECK (platform IN ('wix', 'webhook')),
  CONSTRAINT site_platform_connections_status
    CHECK (connection_status IN ('untested', 'connected', 'failed')),
  -- Each platform carries exactly its own fields. IS NOT NULL is spelled out:
  -- a regex match against NULL is NULL, which a CHECK lets through.
  CONSTRAINT site_platform_connections_wix_fields
    CHECK (platform <> 'wix' OR (wix_site_id IS NOT NULL AND wix_site_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND endpoint_url IS NULL)),
  CONSTRAINT site_platform_connections_webhook_fields
    CHECK (platform <> 'webhook' OR (endpoint_url IS NOT NULL AND endpoint_url ~ '^https://' AND length(endpoint_url) <= 2048 AND wix_site_id IS NULL AND wix_member_id IS NULL)),
  -- The stored secret is the encrypted form (iv:tag:ciphertext), never plaintext.
  CONSTRAINT site_platform_connections_secret_encrypted
    CHECK (secret_encrypted ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$'),
  CONSTRAINT site_platform_connections_secret_hint
    CHECK (length(secret_hint) BETWEEN 1 AND 24),
  CONSTRAINT site_platform_connections_error_code
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'),
  CONSTRAINT site_platform_connections_site_url
    CHECK (site_url IS NULL OR (site_url ~ '^https://' AND length(site_url) <= 2048))
);

COMMENT ON TABLE public.site_platform_connections IS
  'The Wix or custom-site (webhook) publishing connection of one project. secret_encrypted is AES-256-GCM and is never granted to browser roles. Written only by service-role server code.';

ALTER TABLE public.site_platform_connections ENABLE ROW LEVEL SECURITY;

-- Browser roles: the owner reads the non-secret columns of their own row. anon: nothing.
REVOKE ALL ON TABLE public.site_platform_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, project_id, platform, wix_site_id, site_url, endpoint_url, secret_hint,
              connection_status, last_error_code, last_tested_at, created_at, updated_at)
  ON TABLE public.site_platform_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_platform_connections TO service_role;

DROP POLICY IF EXISTS site_platform_connections_owner_select ON public.site_platform_connections;
CREATE POLICY site_platform_connections_owner_select ON public.site_platform_connections
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

-- Where a published article lives on the Wix / custom site (see header).
ALTER TABLE public.generated_articles
  ADD COLUMN IF NOT EXISTS site_post_platform text,
  ADD COLUMN IF NOT EXISTS site_post_id       text,
  ADD COLUMN IF NOT EXISTS site_post_url      text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.generated_articles'::regclass
                   AND conname = 'generated_articles_site_post_platform_check') THEN
    ALTER TABLE public.generated_articles
      ADD CONSTRAINT generated_articles_site_post_platform_check
      CHECK (site_post_platform IS NULL OR site_post_platform IN ('wix', 'webhook'));
  END IF;
END $$;

COMMIT;
