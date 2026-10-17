-- ============================================================================
-- POSTS ON GOOGLE MAPS (Google Business Profile local posts). Additive.
--
-- Nothing here is read by any existing code path. The feature is behind
-- GBP_POSTS_ENABLED (off everywhere) and every read treats a missing table as
-- "not available", so applying this file changes nothing a merchant sees until
-- the owner turns the flag on.
--
--   gbp_connections        one Google connection per user, business.manage only.
--                          The OAuth REFRESH token is stored AES-256-GCM encrypted
--                          with the Search Console key ("v1:iv:tag:ciphertext",
--                          lib/gsc/token-crypto.ts). Access tokens are never stored.
--   gbp_oauth_states       one-time OAuth state (sha256 only) + the PKCE verifier,
--                          encrypted the same way. No browser role sees this table.
--   project_gbp_locations  the business location a project posts to.
--   gbp_posts              every post: text (<= 1,500 characters), button, image,
--                          when to publish, and Google's answer as a stable code.
--
-- ACCOUNT DELETION. Every table's user_id references auth.users ON DELETE CASCADE,
-- so deleting a user removes their encrypted refresh token and every GBP row.
--
-- ACCESS. Written ONLY by service-role server code, after the route proves the
-- caller owns the project. The owner may SELECT their own rows (the connection
-- without its token). anon has nothing. Pattern: 20260928000100_site_platform_connections.sql.
--
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.gbp_posts;
--   DROP TABLE IF EXISTS public.project_gbp_locations;
--   DROP TABLE IF EXISTS public.gbp_oauth_states;
--   DROP TABLE IF EXISTS public.gbp_connections;
-- Executed probe: supabase/migrations/__qa__/gbp-local-posts.probe.sql
-- ============================================================================

BEGIN;

-- ── gbp_connections ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbp_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_refresh_token  text NOT NULL,
  encryption_version       integer NOT NULL DEFAULT 1,
  granted_scope            text,
  status                   text NOT NULL DEFAULT 'connected',
  last_error_code          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gbp_connections_user_unique UNIQUE (user_id),
  CONSTRAINT gbp_connections_status CHECK (status IN ('connected', 'reauth_required', 'revoked')),
  CONSTRAINT gbp_connections_token_encrypted
    CHECK (encrypted_refresh_token ~ '^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$'),
  CONSTRAINT gbp_connections_error_code
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$')
);

ALTER TABLE public.gbp_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gbp_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, granted_scope, status, last_error_code, created_at, updated_at)
  ON TABLE public.gbp_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gbp_connections TO service_role;
DROP POLICY IF EXISTS gbp_connections_owner_select ON public.gbp_connections;
CREATE POLICY gbp_connections_owner_select ON public.gbp_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── gbp_oauth_states ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbp_oauth_states (
  state_hash               text PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code_verifier_encrypted  text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  consumed_at              timestamptz,
  CONSTRAINT gbp_oauth_states_hash CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT gbp_oauth_states_verifier_encrypted
    CHECK (code_verifier_encrypted ~ '^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')
);
CREATE INDEX IF NOT EXISTS idx_gbp_oauth_states_expires ON public.gbp_oauth_states (expires_at);

ALTER TABLE public.gbp_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gbp_oauth_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gbp_oauth_states TO service_role;

-- ── project_gbp_locations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_gbp_locations (
  project_id       uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id    uuid NOT NULL REFERENCES public.gbp_connections(id) ON DELETE CASCADE,
  account_name     text NOT NULL,
  location_name    text NOT NULL,
  location_title   text NOT NULL,
  location_address text,
  website_uri      text,
  maps_uri         text,
  selected_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_gbp_locations_account CHECK (account_name ~ '^accounts/[0-9A-Za-z_-]{1,64}$'),
  CONSTRAINT project_gbp_locations_location CHECK (location_name ~ '^locations/[0-9A-Za-z_-]{1,64}$'),
  CONSTRAINT project_gbp_locations_title CHECK (char_length(location_title) BETWEEN 1 AND 300),
  CONSTRAINT project_gbp_locations_maps_uri CHECK (maps_uri IS NULL OR (maps_uri ~ '^https://' AND length(maps_uri) <= 2048)),
  CONSTRAINT project_gbp_locations_website CHECK (website_uri IS NULL OR length(website_uri) <= 2048)
);
CREATE INDEX IF NOT EXISTS idx_project_gbp_locations_connection ON public.project_gbp_locations (connection_id);

ALTER TABLE public.project_gbp_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_gbp_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_gbp_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_gbp_locations TO service_role;
DROP POLICY IF EXISTS project_gbp_locations_owner_select ON public.project_gbp_locations;
CREATE POLICY project_gbp_locations_owner_select ON public.project_gbp_locations
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

-- ── gbp_posts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbp_posts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_article_id  uuid REFERENCES public.generated_articles(id) ON DELETE SET NULL,
  summary            text NOT NULL,
  cta_type           text,
  cta_url            text,
  image_url          text,
  image_path         text,
  language_code      text NOT NULL DEFAULT 'he',
  status             text NOT NULL DEFAULT 'scheduled',
  scheduled_at       timestamptz NOT NULL DEFAULT now(),
  attempts           integer NOT NULL DEFAULT 0,
  google_post_name   text,
  google_state       text,
  google_search_url  text,
  last_error_code    text,
  published_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Google's limit (Business Profile help: up to 1,500 characters). char_length counts
  -- characters, not bytes, exactly like countPostChars in lib/gbp/validate.ts.
  CONSTRAINT gbp_posts_summary_length CHECK (char_length(summary) BETWEEN 1 AND 1500),
  CONSTRAINT gbp_posts_cta_type
    CHECK (cta_type IS NULL OR cta_type IN ('LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL')),
  -- No button: no URL. CALL: no URL (it dials the business). Any other button: an https URL.
  -- Every branch is NULL-safe: a CHECK that evaluates to NULL passes, so `cta_type <> 'CALL'`
  -- alone would let a URL without a button through (the probe caught exactly that).
  CONSTRAINT gbp_posts_cta_url CHECK (
    (cta_type IS NULL AND cta_url IS NULL)
    OR (cta_type = 'CALL' AND cta_url IS NULL)
    OR (cta_type IS NOT NULL AND cta_type <> 'CALL' AND cta_url IS NOT NULL AND cta_url ~ '^https://' AND length(cta_url) <= 2048)
  ),
  CONSTRAINT gbp_posts_image_url CHECK (image_url IS NULL OR (image_url ~ '^https://' AND length(image_url) <= 2048)),
  CONSTRAINT gbp_posts_language CHECK (language_code IN ('he', 'en')),
  CONSTRAINT gbp_posts_status CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  CONSTRAINT gbp_posts_attempts CHECK (attempts BETWEEN 0 AND 10),
  CONSTRAINT gbp_posts_google_state CHECK (google_state IS NULL OR google_state IN ('LIVE', 'PROCESSING', 'REJECTED', 'UNKNOWN')),
  CONSTRAINT gbp_posts_google_name
    CHECK (google_post_name IS NULL OR google_post_name ~ '^accounts/[^/]+/locations/[^/]+/localPosts/[^/]+$'),
  CONSTRAINT gbp_posts_search_url CHECK (google_search_url IS NULL OR google_search_url ~ '^https://'),
  CONSTRAINT gbp_posts_error_code CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'),
  -- A published post always carries Google's id; nothing else may claim to be published.
  CONSTRAINT gbp_posts_published_has_name CHECK (status <> 'published' OR google_post_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_project_created ON public.gbp_posts (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_due ON public.gbp_posts (scheduled_at) WHERE status = 'scheduled';
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbp_posts_google_name ON public.gbp_posts (google_post_name) WHERE google_post_name IS NOT NULL;

ALTER TABLE public.gbp_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gbp_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gbp_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gbp_posts TO service_role;
DROP POLICY IF EXISTS gbp_posts_owner_select ON public.gbp_posts;
CREATE POLICY gbp_posts_owner_select ON public.gbp_posts
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;
