-- ============================================================================
-- Phase 3 — Usage-reservation ledger (Google checks / AI checks / articles),
-- authoritative billing-period columns, and the rank-scan weekly removal.
--
-- Design summary (full rationale in the approved design discussion):
--   * ONE coherent `usage_reservations` table serves all three usage types.
--     Articles are account-scoped (project_id NULL); Google/AI checks are
--     project-scoped. Partial consumption (reserve N, consume M<=N, release
--     N-M) is supported via reserved_amount/consumed_amount/released_amount.
--   * Atomic reserve-or-get via SECURITY DEFINER RPCs using a per-(user,period)
--     advisory lock — never a plain "count then insert" race.
--   * A `reserved` row self-expires after RESERVATION_TTL (30 min) — a crashed
--     job's slot frees up on its own, no cleanup cron required.
--   * Idempotency keys are DURABLE, server-resolved identifiers (topic id for
--     articles; project+occurrence for automatic scans) — never timestamps.
--   * finalize_article_generation() persists the generated_articles row AND
--     consumes the reservation in ONE transaction — an article can never exist
--     without a consumed credit (the requirement this directly satisfies).
--   * Every RPC: fixed `search_path`, EXECUTE revoked from PUBLIC/anon/
--     authenticated, granted ONLY to service_role (the same trust boundary the
--     app's admin/service-role client already operates under everywhere else)
--     — so "trusting a caller-supplied p_limit" is a non-issue: only our own
--     server code (which resolves the limit from PLAN_CATALOG/entitlement) can
--     ever call these functions at all.
--
-- Billing-period columns:
--   * subscriptions.current_period_start (nullable — backfilled going forward
--     by activation/renewal; NULL for a pre-existing row until its next
--     renewal, at which point the resolver falls back to
--     current_period_end - 1 month as a documented compatibility value).
--   * shopify_connections.shopify_current_period_start (cache/audit only,
--     same pattern as shopify_current_period_end from Phase 2).
--
-- Rank-scan weekly removal:
--   * `weekly` and `monthly_first_day` are converted to `monthly` (the latter
--     was already bugged into daily re-scanning — see lib/utils.ts comment).
--   * next_scan_at is recomputed in the SAME statement so no migrated project
--     is left scheduled within days.
--   * projects.scan_claimed_at / scan_retry_count are new columns supporting
--     safe cross-day retry of ONE monthly occurrence without double-charging
--     (see app/api/schedule/route.ts for the consuming logic).
--
-- Wrapped in one explicit transaction. NOT APPLIED by this change.
-- ============================================================================

BEGIN;

-- ── 1) Billing-period columns ────────────────────────────────────────────

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS shopify_current_period_start timestamptz;

-- ── 2) usage_reservations — the shared ledger for all three usage types ──

CREATE TABLE IF NOT EXISTS public.usage_reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_type        text NOT NULL CHECK (usage_type IN ('google_check', 'ai_check', 'article')),

  -- Account scope (always required) + optional project scope. Articles are
  -- account-wide (project_id NULL at the ledger level — the winning article's
  -- own project is recorded via related_ref/the generated_articles row
  -- itself, never here); Google/AI checks are per-project.
  user_id           uuid NOT NULL,
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,

  reserved_amount   integer NOT NULL DEFAULT 1 CHECK (reserved_amount > 0),
  consumed_amount   integer NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  released_amount   integer NOT NULL DEFAULT 0 CHECK (released_amount >= 0),

  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,

  -- Durable, server-resolved, non-timestamp key. Articles: 'topic:<topic_id>'.
  -- Automatic scans: 'scan:<project_id>:<occurrence next_scan_at ISO value>'.
  -- Manual scans / AI checks: 'manual:<...>' variants, always caller-stable.
  idempotency_key   text NOT NULL,

  status            text NOT NULL DEFAULT 'reserved'
                       CHECK (status IN ('reserved', 'consumed', 'partially_consumed', 'released')),

  -- 3rd review correction — the reservation-INSTANCE identity guard. NEVER a
  -- timestamp: created_at/reserved_at describe WHEN something happened, not
  -- WHICH grant this is, and two grants can in principle share a timestamp
  -- (clock resolution, a mocked/clamped clock in tests, a future logical-
  -- clock backend). reservation_token is regenerated every time this row is
  -- GRANTED or REUSED (expired-and-reused by a later reserve_usage call for
  -- the same idempotency key) — it is the ONLY thing
  -- finalize_usage_reservation / finalize_article_generation /
  -- release_usage_reservation ever compare against to decide whether a
  -- caller is still holding the CURRENT grant on this row. Never parsed or
  -- transformed anywhere — always compared for exact equality only.
  reservation_token uuid NOT NULL DEFAULT gen_random_uuid(),

  dispatched_at     timestamptz,
  -- Free-text pointer to the thing this reservation ended up producing/
  -- covering (generated_articles.id, scans.id, ai_scan_runs.id, ...). Never a
  -- foreign key — the referenced table varies by usage_type.
  related_ref       text,
  release_reason    text,

  -- created_at is the row's OWN creation timestamp — set ONCE, on the
  -- original INSERT, and NEVER updated again (an audit trail of when this
  -- ledger row first came into existence, regardless of how many times it is
  -- later reused). reserved_at is the SEPARATE, TTL-relevant timestamp: it is
  -- updated every time this row is granted or reused, and is what the
  -- 30-minute abandoned-reservation window is actually computed against —
  -- never created_at, which correctly stays fixed across reuse.
  created_at        timestamptz NOT NULL DEFAULT now(),
  reserved_at       timestamptz NOT NULL DEFAULT now(),
  consumed_at       timestamptz,
  released_at       timestamptz,

  CONSTRAINT usage_reservations_idem_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_reservations_capacity
  ON public.usage_reservations (user_id, usage_type, period_start, status);
CREATE INDEX IF NOT EXISTS idx_usage_reservations_project
  ON public.usage_reservations (project_id, usage_type, period_start)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.usage_reservations ENABLE ROW LEVEL SECURITY;
-- Owner-scoped READ ONLY (debugging/future account-usage UI). No insert/
-- update/delete policy — every write goes through the SECURITY DEFINER RPCs
-- below, callable only by service_role (which bypasses RLS entirely anyway;
-- this policy only matters if a client ever queries the table directly).
CREATE POLICY usage_reservations_select ON public.usage_reservations
  FOR SELECT USING (user_id = auth.uid());

-- ── 3) reserve_usage — atomic reserve-or-get, all three usage types ──────
--
-- Returns exactly one row: (outcome, reservation_id, article_id_if_any,
-- reservation_token). Outcomes: 'reserved' (new slot claimed) |
-- 'already_reserved' (idempotent retry of a still-live in-flight attempt) |
-- 'already_consumed' (idempotent retry of a request that already completed —
-- caller must NOT redo the work) | 'quota_exceeded' (no slot available;
-- caller must not call the provider).
--
-- p_limit is ALWAYS resolved by trusted server code (PLAN_CATALOG /
-- getUserEntitlement) BEFORE this call — never read from inside the
-- function, never supplied by an untrusted caller (EXECUTE is service_role
-- only, see the REVOKE/GRANT at the end of this file).
--
-- 3rd review correction — the reservation-instance identity guard is now an
-- EXPLICIT `reservation_token` (uuid), never a timestamp. `reservation_token`
-- is returned here so the caller can pass it back into
-- finalize_usage_reservation / finalize_article_generation /
-- release_usage_reservation as p_reservation_token. Those three RPCs now
-- require BOTH status='reserved' AND reservation_token to still match before
-- acting. A NEW token is generated every single time this row is GRANTED
-- (first INSERT) or REUSED (an idempotency key's prior 'reserved' row had
-- expired, per the reserved_at TTL — NOT created_at, which never changes).
-- This closes the "stolen reservation" gap: if the SAME row is later reused
-- while an earlier, abnormally slow caller is still holding the OLD
-- reservation_token for it, that stale caller's token comparison fails (the
-- row's token changed when it was reused) and it correctly gets
-- 'not_reserved' instead of silently finalizing/releasing a DIFFERENT
-- logical reservation it was never actually holding.
CREATE OR REPLACE FUNCTION public.reserve_usage(
  p_user_id         uuid,
  p_project_id      uuid,
  p_usage_type      text,
  p_amount          integer,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_limit           integer,
  p_idempotency_key text
) RETURNS TABLE(outcome text, reservation_id uuid, article_id text, reservation_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id          uuid;
  v_status      text;
  v_reserved_at timestamptz;
  v_ref         text;
  v_token       uuid;
  v_used        integer;
  v_now         timestamptz := now();
BEGIN
  IF p_project_id IS NOT NULL THEN
    -- Defense-in-depth ownership check (the calling TS code already verifies
    -- this before ever reaching here) — never allow reserving against a
    -- project that isn't the caller's own.
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND user_id = p_user_id) THEN
      RETURN QUERY SELECT 'project_not_owned', NULL::uuid, NULL::text, NULL::uuid; RETURN;
    END IF;
  END IF;

  -- Idempotent-retry branch: an existing row for this exact key wins outright,
  -- with each existing status handled explicitly (never silently re-inserted,
  -- which is exactly the unique-constraint conflict this design corrects).
  SELECT id, status, reserved_at, related_ref, reservation_token
    INTO v_id, v_status, v_reserved_at, v_ref, v_token
    FROM public.usage_reservations WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_status IN ('consumed', 'partially_consumed') THEN
      RETURN QUERY SELECT 'already_consumed', v_id, v_ref, NULL::uuid; RETURN;
    END IF;
    IF v_status = 'reserved' AND v_reserved_at > now() - interval '30 minutes' THEN
      -- Still live — the CURRENT token (fetched above, not regenerated) is
      -- returned so a genuinely-concurrent duplicate caller for the same
      -- occurrence CAN still finalize/release using it if it chooses to.
      RETURN QUERY SELECT 'already_reserved', v_id, NULL::text, v_token; RETURN;
    END IF;
    -- Either genuinely 'released', or a 'reserved' row that has expired
    -- (abandoned/crashed job, per reserved_at — never created_at) — mark it
    -- released before deciding whether a fresh reservation can be granted,
    -- then REUSE the same row via UPDATE (never a second INSERT — that's
    -- what the unique constraint is for).
    IF v_status = 'reserved' THEN
      UPDATE public.usage_reservations SET status = 'released', released_at = now(),
        released_amount = reserved_amount, release_reason = 'expired'
        WHERE id = v_id;
    END IF;
  END IF;

  -- Serialize concurrent reservation attempts for the SAME user+usage_type+
  -- period only (near-zero cross-user/cross-period contention).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_usage_type || p_period_start::text, 0));

  SELECT COALESCE(sum(
    CASE
      WHEN status IN ('consumed', 'partially_consumed') THEN consumed_amount
      WHEN status = 'reserved' AND reserved_at > now() - interval '30 minutes' THEN reserved_amount
      ELSE 0
    END
  ), 0) INTO v_used
  FROM public.usage_reservations
  WHERE user_id = p_user_id AND usage_type = p_usage_type AND period_start = p_period_start
    AND id IS DISTINCT FROM v_id; -- exclude the row we're about to reuse, if any

  IF v_used + p_amount > p_limit THEN
    RETURN QUERY SELECT 'quota_exceeded', NULL::uuid, NULL::text, NULL::uuid; RETURN;
  END IF;

  -- A FRESH token every time this row is granted or reused — the actual
  -- identity guard finalize/release check against.
  v_token := gen_random_uuid();

  IF v_id IS NOT NULL THEN
    UPDATE public.usage_reservations
      SET status = 'reserved', reserved_amount = p_amount, consumed_amount = 0, released_amount = 0,
          period_start = p_period_start, period_end = p_period_end, project_id = p_project_id,
          dispatched_at = NULL, related_ref = NULL, release_reason = NULL,
          reservation_token = v_token, reserved_at = v_now, consumed_at = NULL, released_at = NULL
      WHERE id = v_id;
      -- created_at is deliberately NOT touched here — it stays the row's
      -- original creation time even across reuse.
  ELSE
    INSERT INTO public.usage_reservations
      (user_id, project_id, usage_type, reserved_amount, period_start, period_end, idempotency_key,
       reservation_token, created_at, reserved_at)
      VALUES (p_user_id, p_project_id, p_usage_type, p_amount, p_period_start, p_period_end, p_idempotency_key,
              v_token, v_now, v_now)
      RETURNING id INTO v_id;
  END IF;

  RETURN QUERY SELECT 'reserved', v_id, NULL::text, v_token;
END $$;

-- ── 4) finalize_usage_reservation — Google/AI checks: consume only what was
-- actually dispatched to the provider, release the rest. p_consumed=0 with
-- p_reason set is the "no provider call was ever made" release path.
--
-- 3rd review correction — p_reservation_token must match the row's CURRENT
-- reservation_token (see the note above reserve_usage) — an explicit token,
-- never a timestamp. A caller whose reservation was reused out from under it
-- (expired, then reused by a recovering worker's reserve_usage call) now
-- gets 'not_reserved' here instead of silently finalizing whatever the row
-- currently represents.
CREATE OR REPLACE FUNCTION public.finalize_usage_reservation(
  p_reservation_id uuid, p_user_id uuid, p_consumed integer, p_related_ref text, p_reason text, p_reservation_token uuid
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reserved integer;
BEGIN
  SELECT reserved_amount INTO v_reserved FROM public.usage_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'reserved' AND reservation_token = p_reservation_token;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_reserved'; RETURN; END IF;

  IF p_consumed <= 0 THEN
    UPDATE public.usage_reservations SET status = 'released', released_amount = v_reserved,
      released_at = now(), release_reason = COALESCE(p_reason, 'no_provider_call')
      WHERE id = p_reservation_id;
    RETURN QUERY SELECT 'released'; RETURN;
  END IF;

  UPDATE public.usage_reservations
    SET status = CASE WHEN p_consumed >= v_reserved THEN 'consumed' ELSE 'partially_consumed' END,
        consumed_amount = LEAST(p_consumed, v_reserved),
        released_amount = GREATEST(v_reserved - p_consumed, 0),
        related_ref = p_related_ref, dispatched_at = now(), consumed_at = now(),
        released_at = CASE WHEN p_consumed < v_reserved THEN now() ELSE NULL END,
        release_reason = CASE WHEN p_consumed < v_reserved THEN p_reason ELSE NULL END
    WHERE id = p_reservation_id;
  RETURN QUERY SELECT 'finalized';
END $$;

-- ── 5) finalize_article_generation — ATOMIC persist-article + consume-credit.
-- Prevents the exact gap flagged in review: an article existing without a
-- consumed credit. p_article carries the already-generated, already-
-- validated row (everything generateValidatedArticle produced); this
-- function performs ONLY the insert + the reservation update, both inside
-- ONE transaction — either both happen or neither does. A slug collision
-- (23505) rolls back the WHOLE function (including the reservation state),
-- so the caller can safely retry with a new slug candidate against the SAME
-- still-'reserved' reservation.
--
-- 3rd review correction — same p_reservation_token guard as
-- finalize_usage_reservation (explicit token, never a timestamp).
CREATE OR REPLACE FUNCTION public.finalize_article_generation(
  p_reservation_id uuid, p_user_id uuid, p_article jsonb, p_reservation_token uuid
) RETURNS TABLE(outcome text, article_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_article_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usage_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id AND usage_type = 'article' AND status = 'reserved'
      AND reservation_token = p_reservation_token
  ) THEN
    RETURN QUERY SELECT 'not_reserved', NULL::uuid; RETURN;
  END IF;

  INSERT INTO public.generated_articles (
    user_id, project_id, topic_id, title, meta_title, meta_description, excerpt,
    content_html, content_markdown, faq_json, image_prompt, status, wp_connection_id, slug, updated_at
  ) VALUES (
    p_user_id, (p_article->>'project_id')::uuid, NULLIF(p_article->>'topic_id', '')::uuid,
    p_article->>'title', p_article->>'meta_title', p_article->>'meta_description', p_article->>'excerpt',
    p_article->>'content_html', p_article->>'content_markdown', (p_article->'faq_json'),
    p_article->>'image_prompt', 'draft', NULLIF(p_article->>'wp_connection_id', '')::uuid,
    p_article->>'slug', now()
  ) RETURNING id INTO v_article_id;

  UPDATE public.usage_reservations
    SET status = 'consumed', consumed_amount = 1, related_ref = v_article_id::text,
        dispatched_at = now(), consumed_at = now()
    WHERE id = p_reservation_id;

  RETURN QUERY SELECT 'consumed', v_article_id;
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'slug_conflict', NULL::uuid;
END $$;

-- ── 6) release_usage_reservation — explicit release (Gemini/audit/DB/
-- platform failure BEFORE any provider dispatch, or an insert_failed article
-- attempt that exhausted its slug-retry budget).
--
-- 3rd review correction — same p_reservation_token guard.
CREATE OR REPLACE FUNCTION public.release_usage_reservation(
  p_reservation_id uuid, p_user_id uuid, p_reason text, p_reservation_token uuid
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.usage_reservations
    SET status = 'released', released_amount = reserved_amount, released_at = now(),
        release_reason = p_reason
    WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'reserved' AND reservation_token = p_reservation_token;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_reserved'; RETURN; END IF;
  RETURN QUERY SELECT 'released';
END $$;

-- ── 7) RPC security — service_role only (see rationale in the header). ───
REVOKE ALL ON FUNCTION public.reserve_usage(uuid, uuid, text, integer, timestamptz, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_usage_reservation(uuid, uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_article_generation(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_usage_reservation(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_usage(uuid, uuid, text, integer, timestamptz, timestamptz, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_usage_reservation(uuid, uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_article_generation(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_usage_reservation(uuid, uuid, text, uuid) TO service_role;

-- ── 8) Automatic-scan occurrence tracking (retry without double-charging) ─
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS scan_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_retry_count integer NOT NULL DEFAULT 0;

-- ── 9) Rank-scan weekly / monthly_first_day removal ───────────────────────
--
-- monthly_first_day was already bugged into daily re-scanning (lib/utils.ts's
-- calculateNextScanDate has no branch for it, so next_scan_at fell through to
-- NULL, which the cron's `next_scan_at IS NULL` filter treats as overdue).
-- Both values collapse into the single 'monthly' cadence. Cadence and
-- next_scan_at are updated TOGETHER in one statement so no migrated project
-- is left scheduled within days of the migration running.
UPDATE public.projects
  SET scan_frequency = 'monthly',
      next_scan_at = GREATEST(
        COALESCE(last_scan_at, now()) + interval '1 month',
        now() + interval '1 day'
      )
  WHERE scan_frequency IN ('weekly', 'monthly_first_day');

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_scan_frequency_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_scan_frequency_check
  CHECK (scan_frequency IN ('manual', 'monthly'));

COMMIT;
