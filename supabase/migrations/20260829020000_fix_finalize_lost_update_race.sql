-- ============================================================================
-- Corrective migration — fixes a SECOND production-blocking bug reproduced
-- against the dedicated staging database, this time a genuine PostgreSQL
-- concurrency lost-update race in finalize_article_generation:
--
--   One 'reserved' article reservation (reserved_amount=1). A third
--   transaction held a FOR UPDATE lock on the row while two SEPARATE
--   transactions simultaneously called finalize_article_generation with the
--   SAME reservation_id, user_id, and valid reservation_token, but two
--   DIFFERENT slugs. Actual result: BOTH callers received 'consumed' with
--   two DIFFERENT article ids, TWO generated_articles rows were created, and
--   the ledger ended up consumed_amount=1 (only reflecting whichever caller
--   wrote last) despite two credits' worth of work having actually happened.
--
-- Root cause: finalize_article_generation's guard was a plain
-- `IF NOT EXISTS (SELECT 1 ... WHERE status='reserved' AND
-- reservation_token=p_reservation_token)` — a SELECT with NO row lock. Two
-- concurrent transactions can both read the SAME committed 'reserved' row,
-- both pass the check (a bare SELECT never blocks a concurrent bare SELECT),
-- and — because their article slugs differ — both successfully INSERT
-- generated_articles with no unique_violation to catch. The subsequent
-- UPDATE was guarded ONLY by `WHERE ur.id = p_reservation_id` (no
-- status/token re-check), so BOTH transactions' UPDATEs matched and
-- succeeded, the second one silently overwriting the first one's
-- consumed_amount/related_ref/timestamps — a textbook check-then-act race,
-- distinct from (and not fixed by) the ambiguous-column-reference fix in
-- 20260829010000_fix_reserve_usage_ambiguous_column_and_idempotency_lock.sql.
--
-- This migration does NOT modify, rename, remove, or rewrite ANY of:
--   20260828180000_add_billing_market_claim_gate.sql
--   20260829000000_add_usage_reservations_and_billing_periods.sql
--   20260829010000_fix_reserve_usage_ambiguous_column_and_idempotency_lock.sql
-- all three of which have already been manually applied to the dedicated
-- staging project. CREATE OR REPLACE FUNCTION is used, exactly as before —
-- every replaced function keeps its EXACT original signature (parameter
-- types + RETURNS TABLE shape unchanged), so the service_role-only
-- REVOKE/GRANT, SECURITY DEFINER, and fixed search_path properties already
-- applied by the base migration are preserved automatically by Postgres
-- across a same-signature CREATE OR REPLACE — no REVOKE/GRANT repeated here.
--
-- Locking / state-transition strategy — "row-lock-and-recheck", applied
-- consistently to BOTH functions that actually had the flawed pattern:
--
--   finalize_article_generation:
--     1. `SELECT ur.project_id INTO v_project_id FROM public.usage_reservations
--        AS ur WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND
--        ur.usage_type = 'article' AND ur.status = 'reserved' AND
--        ur.reservation_token = p_reservation_token FOR UPDATE;` — acquires
--        an exclusive row lock on the EXACT reservation FIRST, before doing
--        anything else. If a concurrent call already holds this lock (it got
--        there first), this SELECT BLOCKS until that call's transaction
--        commits or rolls back. Once unblocked, Postgres RE-EVALUATES the
--        WHERE clause against the now-committed row — if the winner already
--        flipped status away from 'reserved', the loser's FOR UPDATE finds
--        NO row (not a stale snapshot), so `IF NOT FOUND` correctly returns
--        not_reserved. This is what actually closes the race — a plain
--        SELECT can never provide this guarantee, only a locking read can.
--     2. A NEW project-integrity guard: when the locked reservation DOES
--        carry a project scope (project_id IS NOT NULL), it must equal the
--        article payload's project_id, or the call is rejected as
--        not_reserved BEFORE any insert. Today's article reservations are
--        always account-wide (project_id NULL at the ledger level, per the
--        base migration's own design comment) — this guard is therefore
--        pure defense-in-depth against a future/misbehaving caller and
--        changes nothing about today's actual call pattern.
--     3. Only after the lock + both guards succeed does the
--        generated_articles INSERT run — unchanged from before, still inside
--        the existing `EXCEPTION WHEN unique_violation THEN RETURN QUERY
--        SELECT 'slug_conflict', NULL::uuid` handler, so a slug collision
--        still rolls back the WHOLE function (article insert AND any
--        would-be reservation update), leaving the reservation exactly
--        'reserved' with the SAME token, safe to retry with a new slug.
--     4. The final UPDATE is hardened as defense-in-depth: it is guarded by
--        the FULL identity predicate again (id + user_id + usage_type +
--        status='reserved' + reservation_token — never id alone), and
--        `GET DIAGNOSTICS v_updated = ROW_COUNT` verifies EXACTLY one row
--        changed. Because the row is already locked by step 1 for the
--        remainder of this transaction, this can only ever fail if the
--        code's own invariants are violated somehow — in that case it
--        RAISES AN EXCEPTION (a plain PL/pgSQL RAISE, SQLSTATE P0001 — never
--        confused with the unique_violation handler above, which only
--        matches SQLSTATE 23505), rolling back the ENTIRE transaction
--        including the just-inserted article, so an article can never exist
--        without its matching consumed credit.
--
--   finalize_usage_reservation: the SAME check-then-act pattern existed here
--   too (initial SELECT with no lock, both the release-path and the
--   finalize-path UPDATEs guarded only by `WHERE ur.id = p_reservation_id`)
--   — fixed with the SAME row-lock-and-recheck strategy: the initial
--   `reserved_amount` lookup now uses `FOR UPDATE`, and both UPDATE
--   statements are re-guarded with the full identity predicate plus a
--   ROW_COUNT check that raises an exception on any unexpected mismatch.
--
--   release_usage_reservation: AUDITED, found to already be correct, and
--   therefore LEFT ENTIRELY UNCHANGED in this migration (not even a
--   CREATE OR REPLACE). It has no separate initial check at all — its ONE
--   UPDATE statement is already guarded by the full identity predicate
--   (id + user_id + status='reserved' + reservation_token) in a SINGLE
--   atomic statement, which is exactly the "single atomic guarded UPDATE"
--   alternative this fix's own instructions call out as sufficient — a
--   plain UPDATE's WHERE clause is inherently re-evaluated against the
--   latest committed row as part of acquiring its own row lock, so two
--   concurrent UPDATEs (or an UPDATE racing the new FOR UPDATE reads above)
--   against the SAME row can never both match; the second one always sees
--   the first one's already-applied state and correctly affects zero rows.
--
-- Preserved, unchanged from the base + first corrective migration (verified
-- in every function body below):
--   * a unique slug violation returns slug_conflict, no article remains
--     inserted, the reservation remains reserved, the SAME token remains
--     valid for a retry with another slug
--   * partial-consumption arithmetic (LEAST/GREATEST clamping) in
--     finalize_usage_reservation is byte-for-byte identical
--   * stale (superseded) reservation_token rejection — not_reserved,
--     row untouched
--   * every RPC remains SECURITY DEFINER, service_role-only, fixed
--     search_path = public
--   * RLS on public.usage_reservations is entirely untouched by this file
--
-- NOT applied by this change — staging was verified by MANUALLY running the
-- corrected SQL against the dedicated staging database outside of this
-- migration file; production has never received any Phase 3 migration.
-- ============================================================================

BEGIN;

-- ── finalize_usage_reservation — row-lock-and-recheck + guarded UPDATEs ──
CREATE OR REPLACE FUNCTION public.finalize_usage_reservation(
  p_reservation_id uuid, p_user_id uuid, p_consumed integer, p_related_ref text, p_reason text, p_reservation_token uuid
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reserved integer;
  v_updated  integer;
BEGIN
  -- Lock the exact row FIRST — closes the same check-then-act race fixed in
  -- finalize_article_generation below (see the file header for the full
  -- explanation). A concurrent finalize/finalize OR finalize/release call
  -- for this SAME row blocks here until the winner's transaction commits,
  -- then re-evaluates this WHERE clause against the now-committed row.
  SELECT ur.reserved_amount INTO v_reserved FROM public.usage_reservations AS ur
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token
    FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_reserved'; RETURN; END IF;

  IF p_consumed <= 0 THEN
    UPDATE public.usage_reservations AS ur SET status = 'released', released_amount = v_reserved,
      released_at = now(), release_reason = COALESCE(p_reason, 'no_provider_call')
      WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'finalize_usage_reservation: expected exactly one reservation row updated (release path), got %', v_updated;
    END IF;
    RETURN QUERY SELECT 'released'; RETURN;
  END IF;

  UPDATE public.usage_reservations AS ur
    SET status = CASE WHEN p_consumed >= v_reserved THEN 'consumed' ELSE 'partially_consumed' END,
        consumed_amount = LEAST(p_consumed, v_reserved),
        released_amount = GREATEST(v_reserved - p_consumed, 0),
        related_ref = p_related_ref, dispatched_at = now(), consumed_at = now(),
        released_at = CASE WHEN p_consumed < v_reserved THEN now() ELSE NULL END,
        release_reason = CASE WHEN p_consumed < v_reserved THEN p_reason ELSE NULL END
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'finalize_usage_reservation: expected exactly one reservation row updated (finalize path), got %', v_updated;
  END IF;
  RETURN QUERY SELECT 'finalized';
END $$;

-- ── finalize_article_generation — row-lock-and-recheck, project-id guard,
-- guarded final UPDATE with row-count verification ──────────────────────
CREATE OR REPLACE FUNCTION public.finalize_article_generation(
  p_reservation_id uuid, p_user_id uuid, p_article jsonb, p_reservation_token uuid
) RETURNS TABLE(outcome text, article_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_article_id uuid;
  v_updated    integer;
BEGIN
  -- Lock the EXACT reservation row FIRST — see the file header for the full
  -- lost-update race this closes. A concurrent caller holding the SAME
  -- valid token blocks here until the winner commits, then re-evaluates
  -- this WHERE clause against the now-committed row (status no longer
  -- 'reserved' => NOT FOUND => not_reserved, never a second successful
  -- consume).
  SELECT ur.project_id INTO v_project_id
    FROM public.usage_reservations AS ur
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.usage_type = 'article'
      AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_reserved', NULL::uuid; RETURN;
  END IF;

  -- Project-integrity guard — a reservation that DOES carry a project scope
  -- must never be consumed by an article for a DIFFERENT project. Today's
  -- article reservations are always account-wide (project_id NULL at the
  -- ledger level, per the base migration's design), so this guard is a
  -- no-op for the current call pattern and pure defense-in-depth against a
  -- future/misbehaving caller — the JSON payload's project_id is never
  -- trusted to silently redirect a locked reservation's credit.
  IF v_project_id IS NOT NULL AND v_project_id IS DISTINCT FROM (p_article->>'project_id')::uuid THEN
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

  -- Defense in depth — the row is ALREADY locked and re-validated above, so
  -- this cannot race with another finalize/release call in practice; it is
  -- guarded again by the FULL identity predicate (never id alone), and
  -- ROW_COUNT is verified to be exactly one. A mismatch here means the
  -- code's own invariants were violated — RAISE EXCEPTION rolls back the
  -- WHOLE transaction, including the just-inserted article, so an article
  -- can never exist without its matching consumed credit.
  UPDATE public.usage_reservations AS ur
    SET status = 'consumed', consumed_amount = 1, related_ref = v_article_id::text,
        dispatched_at = now(), consumed_at = now()
    WHERE ur.id = p_reservation_id AND ur.user_id = p_user_id AND ur.usage_type = 'article'
      AND ur.status = 'reserved' AND ur.reservation_token = p_reservation_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'finalize_article_generation: expected exactly one reservation row updated, got %', v_updated;
  END IF;

  RETURN QUERY SELECT 'consumed', v_article_id;
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'slug_conflict', NULL::uuid;
END $$;

COMMIT;
