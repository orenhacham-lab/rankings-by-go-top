-- ============================================================================
-- Corrective migration — fixes a PRODUCTION-BLOCKING runtime bug discovered
-- against the dedicated staging database, on every reserve_usage call:
--
--   ERROR:  column reference "reservation_token" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   CONTEXT: PL/pgSQL function reserve_usage(...) line 23
--
-- Root cause: reserve_usage's RETURNS TABLE(... reservation_token uuid, ...)
-- makes PL/pgSQL create an OUT variable named `reservation_token` that is in
-- scope for the WHOLE function body. The idempotency-lookup SELECT in
-- 20260829000000_add_usage_reservations_and_billing_periods.sql referenced
-- the table's `reservation_token` column unqualified, which Postgres cannot
-- disambiguate from the same-named OUT variable — a genuine runtime error on
-- every single call, never exercised by the FakeAdmin JS simulation (which
-- has no PL/pgSQL variable-scoping rules to reproduce this class of bug).
--
-- This migration does NOT rename, rewrite, or remove
-- 20260829000000_add_usage_reservations_and_billing_periods.sql, which is
-- already committed, pushed, and was manually applied to the dedicated
-- staging project — CREATE OR REPLACE FUNCTION is used here instead, exactly
-- as Postgres migrations are meant to layer corrections. Every one of the
-- four RPCs keeps its EXACT original signature (parameter types and RETURNS
-- TABLE shape unchanged), so the service_role-only REVOKE/GRANT and
-- SECURITY DEFINER/search_path properties already applied by the prior
-- migration are preserved automatically by Postgres across a same-signature
-- CREATE OR REPLACE — no REVOKE/GRANT statements are repeated here.
--
-- Two independent fixes, both scoped to the RPC bodies only (NO schema/
-- table/column/constraint/index/RLS-policy changes in this file):
--
--   1) Ambiguity fix — every reference to a public.usage_reservations column
--      in all four RPCs is now qualified with an explicit `ur` table alias
--      (ur.id, ur.status, ur.reserved_at, ur.related_ref,
--      ur.reservation_token, ur.user_id, ur.idempotency_key,
--      ur.usage_type, ur.period_start, ur.reserved_amount,
--      ur.consumed_amount, and the capacity-query's ur.status /
--      ur.consumed_amount / ur.reserved_amount / ur.reserved_at), even in
--      the three RPCs that were not actually broken today (their OUT
--      variable names — outcome / article_id — happen not to collide with
--      any current column name) — this is deliberate hardening against the
--      SAME class of bug reappearing the moment a RETURNS TABLE column or a
--      table column is ever renamed to match the other.
--
--   2) Concurrency-ordering fix in reserve_usage — the idempotency-key
--      lookup SELECT previously ran with NO lock held at all, before even
--      the existing per-(user,usage_type,period) capacity advisory lock.
--      Two genuinely concurrent reserve_usage calls for the SAME
--      (user_id, idempotency_key) could both run that SELECT, both observe
--      no row (FOUND = false), and both attempt an INSERT — the loser
--      failing with a unique_violation on usage_reservations_idem_unique
--      instead of being correctly folded into 'already_reserved'. A NEW,
--      idempotency-scoped pg_advisory_xact_lock (keyed on
--      user_id + idempotency_key, using a DIFFERENT hashtextextended salt
--      from the capacity lock so the two lock namespaces never collide) is
--      now acquired FIRST, before that SELECT — serializing any two calls
--      that share the same key, even if they disagree on usage_type or
--      period_start. The existing capacity lock is acquired SECOND,
--      unchanged in scope or behavior — this fixed idempotency-lock-first,
--      capacity-lock-second ordering is used on every call, so no deadlock
--      between concurrent reserve_usage invocations is possible.
--
-- Preserved, unchanged from 20260829000000 (verified in every function body
-- below — same statements, only qualification + the new lock added):
--   * released/expired rows are reused through UPDATE, never a second INSERT
--   * a fresh reservation_token is generated on every grant AND every reuse
--   * a live duplicate (still within the 30-minute reserved_at TTL) returns
--     already_reserved with the CURRENT (not regenerated) token
--   * consumed/partially_consumed rows return already_consumed
--   * quota accounting (v_used + p_amount > p_limit) and the 30-minute
--     reserved_at-based expiry window are byte-for-byte identical
--   * a stale (superseded) reservation_token cannot finalize or release a
--     reused row (finalize_usage_reservation / finalize_article_generation /
--     release_usage_reservation all still require BOTH status='reserved'
--     AND reservation_token = p_reservation_token)
--   * every RPC remains SECURITY DEFINER, service_role-only, fixed
--     search_path = public — REVOKE/GRANT for anon/authenticated/PUBLIC are
--     untouched (still governed by the 20260829000000 migration's REVOKE/
--     GRANT statements, which remain valid because the signatures are
--     identical)
--   * RLS on public.usage_reservations (owner-scoped SELECT only, no
--     insert/update/delete policy) is entirely untouched by this file
--
-- NOT applied by this change — staging was verified by MANUALLY running the
-- corrected SQL against the dedicated staging database outside of this
-- migration file; production has never received either migration.
-- ============================================================================

BEGIN;

-- ── reserve_usage — ambiguity fix + idempotency-lock-before-capacity-lock ──
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

  -- Corrective migration — idempotency-scoped advisory lock, acquired
  -- BEFORE the idempotency-key lookup below (lock order: idempotency lock
  -- FIRST, capacity lock SECOND, consistently on every call — see the file
  -- header for the exact race this closes). Salt `1` keeps this lock
  -- namespace independent of the capacity lock's salt `0` below.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_idempotency_key, 1));

  -- Idempotent-retry branch: an existing row for this exact key wins outright,
  -- with each existing status handled explicitly (never silently re-inserted,
  -- which is exactly the unique-constraint conflict this design corrects).
  -- Every usage_reservations column below is qualified with the `ur` alias —
  -- this is the exact statement that raised "column reference
  -- reservation_token is ambiguous" before this migration (the bare column
  -- collided with the RETURNS TABLE OUT variable of the same name).
  SELECT ur.id, ur.status, ur.reserved_at, ur.related_ref, ur.reservation_token
    INTO v_id, v_status, v_reserved_at, v_ref, v_token
    FROM public.usage_reservations AS ur
    WHERE ur.user_id = p_user_id AND ur.idempotency_key = p_idempotency_key;

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
      UPDATE public.usage_reservations AS ur SET status = 'released', released_at = now(),
        released_amount = ur.reserved_amount, release_reason = 'expired'
        WHERE ur.id = v_id;
    END IF;
  END IF;

  -- Serialize concurrent reservation attempts for the SAME user+usage_type+
  -- period only (near-zero cross-user/cross-period contention). Acquired
  -- SECOND, after the idempotency lock above.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_usage_type || p_period_start::text, 0));

  SELECT COALESCE(sum(
    CASE
      WHEN ur.status IN ('consumed', 'partially_consumed') THEN ur.consumed_amount
      WHEN ur.status = 'reserved' AND ur.reserved_at > now() - interval '30 minutes' THEN ur.reserved_amount
      ELSE 0
    END
  ), 0) INTO v_used
  FROM public.usage_reservations AS ur
  WHERE ur.user_id = p_user_id AND ur.usage_type = p_usage_type AND ur.period_start = p_period_start
    AND ur.id IS DISTINCT FROM v_id; -- exclude the row we're about to reuse, if any

  IF v_used + p_amount > p_limit THEN
    RETURN QUERY SELECT 'quota_exceeded', NULL::uuid, NULL::text, NULL::uuid; RETURN;
  END IF;

  -- A FRESH token every time this row is granted or reused — the actual
  -- identity guard finalize/release check against.
  v_token := gen_random_uuid();

  IF v_id IS NOT NULL THEN
    UPDATE public.usage_reservations AS ur
      SET status = 'reserved', reserved_amount = p_amount, consumed_amount = 0, released_amount = 0,
          period_start = p_period_start, period_end = p_period_end, project_id = p_project_id,
          dispatched_at = NULL, related_ref = NULL, release_reason = NULL,
          reservation_token = v_token, reserved_at = v_now, consumed_at = NULL, released_at = NULL
      WHERE ur.id = v_id;
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

-- ── finalize_usage_reservation — hardened with the SAME qualification ────
-- (no ambiguity today — its only OUT variable is `outcome`, which no
-- usage_reservations column is named — qualified anyway per the audit).
CREATE OR REPLACE FUNCTION public.finalize_usage_reservation(
  p_reservation_id uuid, p_user_id uuid, p_consumed integer, p_related_ref text, p_reason text, p_reservation_token uuid
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reserved integer;
BEGIN
  SELECT ur.reserved_amount INTO v_reserved FROM public.usage_reservations AS ur
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_reserved'; RETURN; END IF;

  IF p_consumed <= 0 THEN
    UPDATE public.usage_reservations AS ur SET status = 'released', released_amount = v_reserved,
      released_at = now(), release_reason = COALESCE(p_reason, 'no_provider_call')
      WHERE ur.id = p_reservation_id;
    RETURN QUERY SELECT 'released'; RETURN;
  END IF;

  UPDATE public.usage_reservations AS ur
    SET status = CASE WHEN p_consumed >= v_reserved THEN 'consumed' ELSE 'partially_consumed' END,
        consumed_amount = LEAST(p_consumed, v_reserved),
        released_amount = GREATEST(v_reserved - p_consumed, 0),
        related_ref = p_related_ref, dispatched_at = now(), consumed_at = now(),
        released_at = CASE WHEN p_consumed < v_reserved THEN now() ELSE NULL END,
        release_reason = CASE WHEN p_consumed < v_reserved THEN p_reason ELSE NULL END
    WHERE ur.id = p_reservation_id;
  RETURN QUERY SELECT 'finalized';
END $$;

-- ── finalize_article_generation — hardened with the SAME qualification ───
-- (no ambiguity today — OUT variables are `outcome`/`article_id`, neither
-- matches a usage_reservations column — qualified anyway per the audit).
CREATE OR REPLACE FUNCTION public.finalize_article_generation(
  p_reservation_id uuid, p_user_id uuid, p_article jsonb, p_reservation_token uuid
) RETURNS TABLE(outcome text, article_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_article_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usage_reservations AS ur
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.usage_type = 'article' AND ur.status = 'reserved'
      AND ur.reservation_token = p_reservation_token
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

  UPDATE public.usage_reservations AS ur
    SET status = 'consumed', consumed_amount = 1, related_ref = v_article_id::text,
        dispatched_at = now(), consumed_at = now()
    WHERE ur.id = p_reservation_id;

  RETURN QUERY SELECT 'consumed', v_article_id;
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'slug_conflict', NULL::uuid;
END $$;

-- ── release_usage_reservation — hardened with the SAME qualification ─────
-- (no ambiguity today — its only OUT variable is `outcome` — qualified
-- anyway per the audit).
CREATE OR REPLACE FUNCTION public.release_usage_reservation(
  p_reservation_id uuid, p_user_id uuid, p_reason text, p_reservation_token uuid
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.usage_reservations AS ur
    SET status = 'released', released_amount = ur.reserved_amount, released_at = now(),
        release_reason = p_reason
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_reserved'; RETURN; END IF;
  RETURN QUERY SELECT 'released';
END $$;

COMMIT;
