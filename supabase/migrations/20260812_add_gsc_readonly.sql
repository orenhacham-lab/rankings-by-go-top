-- ============================================================================
-- Stage E1 — Google Search Console READ-ONLY ingestion (additive, reversible).
--
-- Ingestion + observability ONLY. Completely disconnected from the recommendation
-- engine: no table here is read by any recommendation code path.
--
-- Ownership model: per-user via projects.user_id = auth.uid() (the canonical
-- in-repo model). A single Google connection (encrypted refresh token) may serve
-- multiple projects owned by the SAME authorized user. RLS is defense-in-depth;
-- server routes use the service role AFTER an explicit ownership + session-user
-- check (authContentProject).
--
-- Secrets: only the OAuth REFRESH token is stored, AES-256-GCM encrypted
-- (iv:tag:ciphertext hex, GSC_TOKEN_ENCRYPTION_KEY). Access tokens are NEVER
-- persisted. Raw Google responses are NEVER persisted.
--
-- Rollback:
--   DROP TABLE public.gsc_query_page_metrics;
--   DROP TABLE public.gsc_sync_runs;
--   DROP TABLE public.gsc_oauth_states;
--   DROP TABLE public.project_gsc_properties;
--   DROP TABLE public.gsc_connections;
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1) gsc_connections — one encrypted Google OAuth connection per owner ──────
CREATE TABLE IF NOT EXISTS public.gsc_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- AES-256-GCM encrypted OAuth refresh token (iv:tag:ciphertext hex). NEVER
  -- returned to the client. Access tokens are NEVER stored.
  encrypted_refresh_token  text,
  encryption_version       integer NOT NULL DEFAULT 1,
  granted_scope            text,
  status                   text NOT NULL DEFAULT 'connected'
                             CHECK (status IN ('connected', 'reauth_required', 'revoked', 'error')),
  last_error_code          text,
  last_error_message       text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- One Google connection per user. A REAL unique constraint (not just an index) so the
-- OAuth callback can perform a safe onConflict upsert instead of a race-prone
-- select-then-insert/update. Also serves as the user_id lookup index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gsc_connections_user ON public.gsc_connections (user_id);

ALTER TABLE public.gsc_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY gsc_connections_select ON public.gsc_connections
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY gsc_connections_insert ON public.gsc_connections
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY gsc_connections_update ON public.gsc_connections
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY gsc_connections_delete ON public.gsc_connections
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY gsc_connections_service ON public.gsc_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2) project_gsc_properties — one assigned Search Console property per project ──
CREATE TABLE IF NOT EXISTS public.project_gsc_properties (
  project_id        uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  connection_id     uuid NOT NULL REFERENCES public.gsc_connections(id) ON DELETE CASCADE,
  -- The exact Search Console property identifier as returned by the API, e.g.
  -- 'sc-domain:example.com' or 'https://www.example.com/'.
  site_url          text NOT NULL,
  permission_level  text,
  selected_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_gsc_properties_connection ON public.project_gsc_properties (connection_id);

ALTER TABLE public.project_gsc_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_gsc_properties_select ON public.project_gsc_properties
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
-- INSERT/UPDATE enforce that the caller owns the project AND the connection AND is the
-- selector — so a browser client that learns another user's connection UUID can NEVER
-- attach that connection to its own project (ownership, not UUID secrecy).
CREATE POLICY project_gsc_properties_insert ON public.project_gsc_properties
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    AND connection_id IN (SELECT id FROM public.gsc_connections WHERE user_id = auth.uid())
    AND selected_by = auth.uid()
  );
-- USING guards ownership of the EXISTING row; WITH CHECK enforces all three conditions on
-- the RESULTING row (so an update can't repoint connection_id to a foreign connection).
CREATE POLICY project_gsc_properties_update ON public.project_gsc_properties
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    AND connection_id IN (SELECT id FROM public.gsc_connections WHERE user_id = auth.uid())
    AND selected_by = auth.uid()
  );
CREATE POLICY project_gsc_properties_delete ON public.project_gsc_properties
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY project_gsc_properties_service ON public.project_gsc_properties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3) gsc_oauth_states — short-lived one-time CSRF/replay state ───────────────
-- state_hash = sha256(hex) of the opaque state; the raw state lives only in the
-- authorization URL / callback query, never at rest (mirrors the token-hashing
-- security convention). Bound to the initiating user + project.
CREATE TABLE IF NOT EXISTS public.gsc_oauth_states (
  state_hash    text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gsc_oauth_states_project ON public.gsc_oauth_states (project_id);
CREATE INDEX IF NOT EXISTS idx_gsc_oauth_states_expires ON public.gsc_oauth_states (expires_at);

ALTER TABLE public.gsc_oauth_states ENABLE ROW LEVEL SECURITY;

-- The state row is bound to the INITIATING user; a browser client cannot create or mutate
-- a state whose user_id is not its own (defense-in-depth over the server-side user binding).
CREATE POLICY gsc_oauth_states_select ON public.gsc_oauth_states
  FOR SELECT USING (user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gsc_oauth_states_insert ON public.gsc_oauth_states
  FOR INSERT WITH CHECK (user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gsc_oauth_states_update ON public.gsc_oauth_states
  FOR UPDATE USING (user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gsc_oauth_states_service ON public.gsc_oauth_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4) gsc_sync_runs — one immutable run per project, property and window ──────
CREATE TABLE IF NOT EXISTS public.gsc_sync_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- groups the 28-day and 90-day runs started by a single manual sync action.
  sync_group_id           uuid NOT NULL,
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  connection_id           uuid NOT NULL REFERENCES public.gsc_connections(id) ON DELETE CASCADE,
  site_url                text NOT NULL,
  window_days             integer NOT NULL CHECK (window_days IN (28, 90)),
  start_date              date,
  end_date                date,
  status                  text NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'succeeded', 'failed')),
  rows_fetched            integer NOT NULL DEFAULT 0,
  api_batches             integer NOT NULL DEFAULT 0,
  truncated               boolean NOT NULL DEFAULT false,
  latest_available_date   date,
  -- Precomputed weighted aggregates so summary cards never re-scan the metric rows.
  -- ctr = total_clicks / total_impressions; avg position = weighted_position_sum / total_impressions.
  total_clicks            bigint NOT NULL DEFAULT 0,
  total_impressions       bigint NOT NULL DEFAULT 0,
  weighted_position_sum   double precision NOT NULL DEFAULT 0,
  started_at              timestamptz NOT NULL DEFAULT now(),
  finished_at             timestamptz,
  sanitized_error_code    text,
  sanitized_error_message text
);

CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_project_window
  ON public.gsc_sync_runs (project_id, window_days, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_group ON public.gsc_sync_runs (sync_group_id);
-- At most ONE active (running) sync run per project — prevents concurrent syncs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gsc_sync_runs_one_active
  ON public.gsc_sync_runs (project_id) WHERE status = 'running';

ALTER TABLE public.gsc_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY gsc_sync_runs_select ON public.gsc_sync_runs
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gsc_sync_runs_service ON public.gsc_sync_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5) gsc_query_page_metrics — immutable per-run query+page rows ──────────────
-- Numeric types preserve the API values: clicks/impressions are large integers
-- (bigint), ctr/position are doubles (never integer-truncated).
CREATE TABLE IF NOT EXISTS public.gsc_query_page_metrics (
  sync_run_id   uuid NOT NULL REFERENCES public.gsc_sync_runs(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  query         text NOT NULL,
  page          text NOT NULL,
  clicks        bigint NOT NULL DEFAULT 0,
  impressions   bigint NOT NULL DEFAULT 0,
  ctr           double precision NOT NULL DEFAULT 0,
  position      double precision NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sync_run_id, query, page)
);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_project_run ON public.gsc_query_page_metrics (project_id, sync_run_id);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_query ON public.gsc_query_page_metrics (query);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_page ON public.gsc_query_page_metrics (page);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_impressions ON public.gsc_query_page_metrics (impressions);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_position ON public.gsc_query_page_metrics (position);

ALTER TABLE public.gsc_query_page_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY gsc_query_page_metrics_select ON public.gsc_query_page_metrics
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY gsc_query_page_metrics_service ON public.gsc_query_page_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
