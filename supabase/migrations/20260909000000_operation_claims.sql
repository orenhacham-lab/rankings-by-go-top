-- ============================================================================
-- SINGLE-FLIGHT CLAIMS for merchant-facing operations that call a provider.
--
-- WHY. Two operations — the manual ranking scan and the search-volume update —
-- could each be started twice and do the work twice. The protections that
-- existed were not protections:
--
--   * the scan route's trial branch asserted "no concurrent-job race risk for a
--     single trial user clicking scan from one browser session". That is false,
--     and the reviewer disproved it: the first attempt appeared stuck, so they
--     clicked again. Two requests can both read no previous result and both
--     dispatch.
--   * the paid branch keyed its usage reservation on the SERVER'S per-request
--     id, which is fresh for every HTTP request. Two clicks therefore reserved
--     twice and dispatched twice; the comment claiming a network retry reused
--     the reservation was wrong.
--   * the search-volume guard lived in a React ref, which stops a second click
--     in one component and nothing else — not two tabs, not a reload mid-flight,
--     not two direct POSTs, not the automatic refresh racing a manual one.
--
-- The claim below is enforced by the DATABASE, not by a read-then-insert
-- sequence in a route: `claim_key` is the primary key, and the claim is taken
-- by a single INSERT ... ON CONFLICT statement. Two concurrent transactions
-- cannot both win it, whatever the application does.
--
-- EXPIRY, NOT LOCKING. A serverless function can be killed between claiming and
-- releasing, so a claim that is never released must not wedge the operation
-- forever. Every claim carries `expires_at`; a claim at or past it is dead and
-- the next caller takes it over. The TTL is the caller's operation budget plus
-- a margin — long enough that a live operation is never stolen, short enough
-- that an abandoned one recovers on its own.
--
-- SCOPE IS PART OF THE IDENTITY. "Scan all" and "scan this one keyword" are
-- different operations and must not block each other, so the scope is in the
-- key. So is the user id: one tenant's claim can never be observed or joined
-- by another, and `claim_operation` refuses to report a holder across users.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.operation_claims (
  -- Deterministic, and derived only from server-verified values:
  --   '<user_id>:<operation>:<scope>'
  -- Never a request id, never anything a client can choose.
  claim_key      text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation      text NOT NULL CHECK (operation IN ('ranking_scan', 'search_volume')),
  scope          text NOT NULL,
  -- The request that currently holds the claim. Only that request may release
  -- it, so a slow first attempt cannot release the claim a later one took over.
  holder_request_id text NOT NULL,
  claimed_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL
);

COMMENT ON TABLE public.operation_claims IS
  'Single-flight claims for provider-calling merchant operations. Written only by service-role server code; one live claim per (user, operation, scope).';

CREATE INDEX IF NOT EXISTS idx_operation_claims_expiry
  ON public.operation_claims (expires_at);

-- RLS on with no policies, and the grants revoked: only service_role touches
-- this. A claim is a server-side concurrency control, never client state.
ALTER TABLE public.operation_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operation_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operation_claims TO service_role;

-- ── claim ───────────────────────────────────────────────────────────────────
--
-- Returns 'claimed' to exactly one caller, and 'in_progress' to everyone else
-- while that claim is live. Takes over a claim that has expired.
--
-- ATOMIC BY CONSTRUCTION. The INSERT ... ON CONFLICT DO UPDATE ... WHERE is one
-- statement: the conflicting row is locked, the WHERE decides, and at most one
-- concurrent transaction can see the row as expired. No read-then-write.
--
-- `claimed_at` is returned so the caller can derive a per-OPERATION idempotency
-- key for its usage reservation. That key must be stable for every request that
-- joins one operation and different for a later legitimate retry — which the
-- claim's own start time is, and a per-request id is not.
CREATE OR REPLACE FUNCTION public.claim_operation(
  p_user_id      uuid,
  p_operation    text,
  p_scope        text,
  p_request_id   text,
  p_ttl_seconds  integer
) RETURNS TABLE (
  outcome           text,
  holder_request_id text,
  claimed_at        timestamptz,
  expires_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
  v_row public.operation_claims%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_operation IS NULL OR p_scope IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'claim_operation: missing argument';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'claim_operation: ttl out of range';
  END IF;

  v_key := p_user_id::text || ':' || p_operation || ':' || p_scope;

  INSERT INTO public.operation_claims AS c
    (claim_key, user_id, operation, scope, holder_request_id, claimed_at, expires_at)
  VALUES
    (v_key, p_user_id, p_operation, p_scope, p_request_id, now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (claim_key) DO UPDATE
    SET holder_request_id = EXCLUDED.holder_request_id,
        claimed_at        = EXCLUDED.claimed_at,
        expires_at        = EXCLUDED.expires_at
    -- Only an EXPIRED claim may be taken over. A live one leaves this UPDATE
    -- with no matching row, so RETURNING yields nothing and the caller falls
    -- through to reporting the current holder.
    WHERE c.expires_at <= now()
  RETURNING 'claimed'::text, c.holder_request_id, c.claimed_at, c.expires_at
  INTO outcome, holder_request_id, claimed_at, expires_at;

  IF outcome IS NOT NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Someone else holds a live claim. Report it — but only within the same
  -- tenant; the key already includes the user id, so a row found here always
  -- belongs to this user, and the guard below is belt and braces.
  SELECT * INTO v_row FROM public.operation_claims WHERE claim_key = v_key;
  IF NOT FOUND OR v_row.user_id <> p_user_id THEN
    outcome := 'unavailable'; holder_request_id := NULL; claimed_at := NULL; expires_at := NULL;
    RETURN NEXT; RETURN;
  END IF;

  outcome := 'in_progress';
  holder_request_id := v_row.holder_request_id;
  claimed_at := v_row.claimed_at;
  expires_at := v_row.expires_at;
  RETURN NEXT;
END;
$$;

-- ── release ─────────────────────────────────────────────────────────────────
--
-- Only the CURRENT holder may release. A first attempt that was superseded
-- after its claim expired must not release the claim its successor now holds.
CREATE OR REPLACE FUNCTION public.release_operation_claim(
  p_user_id    uuid,
  p_operation  text,
  p_scope      text,
  p_request_id text
) RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
  v_deleted integer;
BEGIN
  v_key := p_user_id::text || ':' || p_operation || ':' || p_scope;
  DELETE FROM public.operation_claims
   WHERE claim_key = v_key
     AND user_id = p_user_id
     AND holder_request_id = p_request_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  outcome := CASE WHEN v_deleted > 0 THEN 'released' ELSE 'not_holder' END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_operation(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_operation_claim(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_operation(uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_operation_claim(uuid, text, text, text) TO service_role;

COMMIT;
