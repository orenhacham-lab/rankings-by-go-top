-- ============================================================================
-- Phase 4F.1 — Shopify OAuth (additive, reversible). Replaces the manual Admin
-- API token UX with the merchant OAuth authorization-code flow.
--
-- Why a migration is strictly required:
--   1. granted_scopes — OAuth returns the scopes the merchant approved; we must
--      persist them to show connected-state scope status (the manual flow never
--      stored them). Additive column.
--   2. shopify_oauth_states — OAuth needs a server-persisted, short-lived,
--      ONE-TIME, (user, project, shop)-bound state for CSRF/replay protection;
--      this cannot be done statelessly. New table.
--
-- ADDITIVE ONLY. No existing row is deleted. Existing (manually-connected) rows
-- are marked auth_method='manual' via the column default so legacy records are
-- clearly distinguishable. Rollback:
--   ALTER TABLE public.shopify_connections DROP COLUMN granted_scopes, DROP COLUMN auth_method;
--   DROP TABLE public.shopify_oauth_states;
-- ============================================================================

ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS granted_scopes text[] NOT NULL DEFAULT '{}',
  -- Existing rows were created by the manual-token POST → default 'manual'.
  -- OAuth connections set 'oauth' explicitly.
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'manual'
    CHECK (auth_method IN ('manual', 'oauth'));

-- Short-lived, one-time OAuth state (CSRF + replay protection), bound to the
-- initiating user + project + shop. Consumed exactly once at callback time.
CREATE TABLE IF NOT EXISTS public.shopify_oauth_states (
  state        text PRIMARY KEY,
  user_id      uuid NOT NULL,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shop_domain  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_project
  ON public.shopify_oauth_states (project_id);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_expires
  ON public.shopify_oauth_states (expires_at);

ALTER TABLE public.shopify_oauth_states ENABLE ROW LEVEL SECURITY;

-- Owner-scoped (defense-in-depth; server routes use the service role after an
-- explicit ownership + session-user check).
CREATE POLICY shopify_oauth_states_select ON public.shopify_oauth_states
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_oauth_states_insert ON public.shopify_oauth_states
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_oauth_states_update ON public.shopify_oauth_states
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_oauth_states_delete ON public.shopify_oauth_states
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
