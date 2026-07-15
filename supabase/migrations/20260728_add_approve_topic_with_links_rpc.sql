-- ============================================================================
-- Phase 4B — OPTIONAL atomic "approve topic + confirm link plan + enqueue" RPC.
--
-- ADDITIVE + IDEMPOTENT (CREATE OR REPLACE FUNCTION; no table/column/data change,
-- nothing dropped, no data deleted). Provides SINGLE-TRANSACTION atomicity for the
-- approve-and-queue flow so a partial write (links saved but enqueue failed, or vice
-- versa) can never occur. The API works WITHOUT this RPC (it verifies the link plan
-- persisted before approving/enqueuing); apply this only to upgrade to full
-- transactionality, then set RECO_APPROVE_QUEUE_RPC=1.
--
-- DO NOT APPLY AUTOMATICALLY. Run manually in the Supabase SQL Editor.
--
-- Contract: for ONE owned, manual+suggested (or already-approved) topic whose link
-- plan is confirmed present (when expects_links), approve it and enqueue it into the
-- pool in one transaction. SECURITY DEFINER + explicit ownership check inside.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_topic_with_links_and_enqueue(
  p_user_id       uuid,
  p_project_id    uuid,
  p_pool_id       uuid,
  p_topic_id      uuid,
  p_expects_links boolean
)
RETURNS text                       -- 'success' | 'already_queued' | 'link_plan_failed'
                                   -- | 'validation_failed' | 'approval_failed'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status      text;
  v_source      text;
  v_has_plan    boolean;
  v_next_pos    integer;
  v_exists      boolean;
BEGIN
  -- Ownership: the pool + topic must belong to a project owned by p_user_id.
  IF NOT EXISTS (
    SELECT 1 FROM public.article_pools ap
    JOIN public.projects pr ON pr.id = ap.project_id
    WHERE ap.id = p_pool_id AND ap.project_id = p_project_id AND pr.user_id = p_user_id
  ) THEN
    RETURN 'validation_failed';
  END IF;

  SELECT status, source INTO v_status, v_source
  FROM public.article_topics WHERE id = p_topic_id AND project_id = p_project_id;
  IF v_status IS NULL THEN
    RETURN 'validation_failed';
  END IF;

  -- Link plan must be present when the caller selected links.
  IF p_expects_links THEN
    SELECT EXISTS (
      SELECT 1 FROM public.article_internal_link_plan_batches
      WHERE project_id = p_project_id AND topic_id = p_topic_id
        AND status IN ('planned', 'approved')
    ) INTO v_has_plan;
    IF NOT v_has_plan THEN
      RETURN 'link_plan_failed';
    END IF;
  END IF;

  -- Approve (manual+suggested → approved; already-approved is fine).
  IF v_source = 'manual' AND v_status = 'suggested' THEN
    UPDATE public.article_topics SET status = 'approved', updated_at = now()
    WHERE id = p_topic_id AND project_id = p_project_id AND source = 'manual' AND status = 'suggested';
  ELSIF v_status <> 'approved' THEN
    RETURN 'approval_failed';
  END IF;

  -- Enqueue (idempotent via the unique (pool_id, topic_id) index).
  SELECT EXISTS (
    SELECT 1 FROM public.article_pool_items WHERE pool_id = p_pool_id AND topic_id = p_topic_id
  ) INTO v_exists;
  IF v_exists THEN
    RETURN 'already_queued';
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO v_next_pos
  FROM public.article_pool_items WHERE pool_id = p_pool_id;

  INSERT INTO public.article_pool_items (user_id, project_id, pool_id, topic_id, article_id, position, status, updated_at)
  VALUES (p_user_id, p_project_id, p_pool_id, p_topic_id, NULL, v_next_pos, 'queued', now())
  ON CONFLICT (pool_id, topic_id) DO NOTHING;

  RETURN 'success';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_topic_with_links_and_enqueue(uuid, uuid, uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_topic_with_links_and_enqueue(uuid, uuid, uuid, uuid, boolean) TO service_role;
