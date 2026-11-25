-- ============================================================================
-- POSTS ON FACEBOOK AND INSTAGRAM (the Meta app "Go Top SEO Publisher"). Additive.
--
-- Nothing here is read by any existing code path. The feature is behind
-- META_POSTS_ENABLED (off everywhere) and every read treats a missing table as
-- "not available", so applying this file changes nothing a merchant sees until
-- the owner turns the flag on.
--
--   meta_connections       one Facebook connection per user. The long-lived USER
--                          token is stored AES-256-GCM encrypted with the Search
--                          Console key ("v1:iv:tag:ciphertext", lib/gsc/token-crypto.ts).
--                          fb_user_id is the Facebook user's app-scoped id: it is
--                          what Meta's data-deletion callback names.
--   meta_oauth_states      one-time OAuth state (sha256 only). No browser role sees it.
--   project_meta_pages     the Facebook Page (and the Instagram professional account
--                          linked to it) a project posts to. Holds the PAGE token,
--                          encrypted the same way.
--   meta_posts             every post: text, photo, target (facebook | instagram),
--                          approval, schedule and the platform's answer as a stable code.
--   meta_deletion_requests the confirmation codes handed to Meta's data-deletion
--                          callback. A code and a state, nothing about a person.
--
-- APPROVAL IS A DATABASE FACT. A row can be scheduled, publishing or published
-- only with approved_at set (meta_posts_approved_before_publish), so no code path
-- can send a post nobody approved, whatever a future change does.
--
-- ACCOUNT DELETION. user_id references auth.users ON DELETE CASCADE everywhere,
-- so deleting a user removes their encrypted tokens and every post row.
--
-- ACCESS. Written ONLY by service-role server code, after the route proves the
-- caller owns the project. The owner may SELECT their own rows, never the token
-- columns (column grants). anon has nothing. Pattern: 20260929020000_gbp_local_posts.sql.
--
-- Idempotent: every statement can be re-run.
-- Rollback:
--   DROP TABLE IF EXISTS public.meta_deletion_requests;
--   DROP TABLE IF EXISTS public.meta_posts;
--   DROP TABLE IF EXISTS public.project_meta_pages;
--   DROP TABLE IF EXISTS public.meta_oauth_states;
--   DROP TABLE IF EXISTS public.meta_connections;
-- Executed probe: supabase/migrations/__qa__/meta-social-posts.probe.sql
-- ============================================================================

BEGIN;

-- ── meta_connections ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_user_id            text NOT NULL,
  encrypted_user_token  text NOT NULL,
  encryption_version    integer NOT NULL DEFAULT 1,
  granted_scopes        text,
  token_expires_at      timestamptz,
  status                text NOT NULL DEFAULT 'connected',
  last_error_code       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_connections_user_unique UNIQUE (user_id),
  CONSTRAINT meta_connections_fb_user CHECK (fb_user_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT meta_connections_status CHECK (status IN ('connected', 'reauth_required', 'revoked')),
  CONSTRAINT meta_connections_token_encrypted
    CHECK (encrypted_user_token ~ '^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$'),
  CONSTRAINT meta_connections_error_code
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$')
);
CREATE INDEX IF NOT EXISTS idx_meta_connections_fb_user ON public.meta_connections (fb_user_id);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, granted_scopes, token_expires_at, status, last_error_code, created_at, updated_at)
  ON TABLE public.meta_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_connections TO service_role;
DROP POLICY IF EXISTS meta_connections_owner_select ON public.meta_connections;
CREATE POLICY meta_connections_owner_select ON public.meta_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── meta_oauth_states ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_oauth_states (
  state_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  CONSTRAINT meta_oauth_states_hash CHECK (state_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_meta_oauth_states_expires ON public.meta_oauth_states (expires_at);

ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_oauth_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_oauth_states TO service_role;

-- ── project_meta_pages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_meta_pages (
  project_id            uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id         uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  page_id               text NOT NULL,
  page_name             text NOT NULL,
  encrypted_page_token  text NOT NULL,
  ig_user_id            text,
  ig_username           text,
  selected_at           timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_meta_pages_page_id CHECK (page_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT project_meta_pages_ig_id CHECK (ig_user_id IS NULL OR ig_user_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT project_meta_pages_name CHECK (char_length(page_name) BETWEEN 1 AND 300),
  CONSTRAINT project_meta_pages_ig_name CHECK (ig_username IS NULL OR char_length(ig_username) <= 300),
  CONSTRAINT project_meta_pages_token_encrypted
    CHECK (encrypted_page_token ~ '^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')
);
CREATE INDEX IF NOT EXISTS idx_project_meta_pages_connection ON public.project_meta_pages (connection_id);

ALTER TABLE public.project_meta_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_meta_pages FROM PUBLIC, anon, authenticated;
GRANT SELECT (project_id, user_id, connection_id, page_id, page_name, ig_user_id, ig_username, selected_at, updated_at)
  ON TABLE public.project_meta_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_meta_pages TO service_role;
DROP POLICY IF EXISTS project_meta_pages_owner_select ON public.project_meta_pages;
CREATE POLICY project_meta_pages_owner_select ON public.project_meta_pages
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

-- ── meta_posts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_posts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id           uuid NOT NULL DEFAULT gen_random_uuid(),
  target             text NOT NULL,
  source_article_id  uuid REFERENCES public.generated_articles(id) ON DELETE SET NULL,
  body               text NOT NULL,
  link_url           text,
  image_url          text,
  language_code      text NOT NULL DEFAULT 'en',
  status             text NOT NULL DEFAULT 'draft',
  approved_at        timestamptz,
  scheduled_at       timestamptz NOT NULL DEFAULT now(),
  attempts           integer NOT NULL DEFAULT 0,
  remote_post_id     text,
  remote_permalink   text,
  last_error_code    text,
  published_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Instagram's caption limit is 2,200 characters; the same ceiling is used for both
  -- targets so one text can go to both.
  CONSTRAINT meta_posts_body_length CHECK (char_length(body) BETWEEN 1 AND 2200),
  CONSTRAINT meta_posts_target CHECK (target IN ('facebook', 'instagram')),
  CONSTRAINT meta_posts_language CHECK (language_code IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko')),
  CONSTRAINT meta_posts_status CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  CONSTRAINT meta_posts_attempts CHECK (attempts BETWEEN 0 AND 10),
  CONSTRAINT meta_posts_link_url CHECK (link_url IS NULL OR (link_url ~ '^https://' AND length(link_url) <= 2048)),
  CONSTRAINT meta_posts_image_url CHECK (image_url IS NULL OR (image_url ~ '^https://' AND length(image_url) <= 2048)),
  -- Instagram feed posts need a photo; a Facebook text post does not.
  CONSTRAINT meta_posts_instagram_needs_image CHECK (target <> 'instagram' OR image_url IS NOT NULL),
  CONSTRAINT meta_posts_error_code CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'),
  CONSTRAINT meta_posts_remote_id CHECK (remote_post_id IS NULL OR remote_post_id ~ '^[0-9_]{1,64}$'),
  CONSTRAINT meta_posts_permalink CHECK (remote_permalink IS NULL OR remote_permalink ~ '^https://'),
  -- Nothing leaves without the owner's approval, and nothing claims to be published without the platform's id.
  CONSTRAINT meta_posts_approved_before_publish
    CHECK (status NOT IN ('scheduled', 'publishing', 'published') OR approved_at IS NOT NULL),
  CONSTRAINT meta_posts_published_has_id CHECK (status <> 'published' OR remote_post_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_meta_posts_project_created ON public.meta_posts (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_posts_group ON public.meta_posts (group_id);
CREATE INDEX IF NOT EXISTS idx_meta_posts_due ON public.meta_posts (scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.meta_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.meta_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_posts TO service_role;
DROP POLICY IF EXISTS meta_posts_owner_select ON public.meta_posts;
CREATE POLICY meta_posts_owner_select ON public.meta_posts
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

-- ── meta_deletion_requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_deletion_requests (
  code          text PRIMARY KEY,
  kind          text NOT NULL,
  status        text NOT NULL DEFAULT 'completed',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_deletion_requests_code CHECK (code ~ '^[0-9a-f]{24}$'),
  CONSTRAINT meta_deletion_requests_kind CHECK (kind IN ('deletion', 'deauthorize')),
  CONSTRAINT meta_deletion_requests_status CHECK (status IN ('completed', 'failed'))
);

ALTER TABLE public.meta_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_deletion_requests TO service_role;

COMMIT;
