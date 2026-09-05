-- ============================================================================
-- EXPLICIT PROVENANCE for a permitted historical DIRECT Shopify connection.
--
-- WHY. classifyStoredCredential must decide whether a NON-EXPIRING credential
-- (no expiry, no refresh material) may be sent to the Admin API. Commit
-- f9a9324 made that decision depend on oauth_app_edition, and every connection
-- created before 20260901010000 has that column NULL — so the one intentional
-- pre-approval direct connection was refused, and the automation queue reported
-- it as "no connected Shopify store".
--
-- The fix is NOT to read NULL as legacy. NULL means UNKNOWN: it covers rows
-- that are historical, manually imported, partially written or corrupt, and
-- promoting all of them to a trusted credential on the strength of an absent
-- value would hand Admin API access to anything that happens to lack an edition.
-- Provenance must be ASSERTED, by a human, for a specific connection.
--
-- WHAT THIS DOES. Adds a dedicated provenance column and marks ONLY connections
-- named explicitly below. The UPDATE is additionally fenced by the structural
-- fingerprint of a non-expiring direct credential, so a mistyped id cannot
-- promote a public-app row.
--
-- NOT APPLIED BY THIS TASK. Created and reviewed only. Before applying, run the
-- VERIFY block and confirm each row is the connection you intend to permit.
-- ============================================================================

BEGIN;

ALTER TABLE public.shopify_connections
  -- WHY this connection may hold a non-expiring credential. Written only by a
  -- reviewed reconciliation like this one — never by an OAuth flow, never
  -- inferred at runtime. NULL = unknown = refused.
  ADD COLUMN IF NOT EXISTS connection_provenance text
    CHECK (connection_provenance IN ('direct_legacy_preapproval') OR connection_provenance IS NULL);

COMMENT ON COLUMN public.shopify_connections.connection_provenance IS
  'Explicit, human-asserted reason a non-expiring credential is permitted. Never inferred; NULL is refused.';

-- ── VERIFY FIRST (read-only). Expect exactly the connection(s) you intend.
--    has_refresh / has_expiry MUST be false and has_token MUST be true.
--
--   SELECT id, project_id, shop_domain, connection_status, oauth_app_edition,
--          (refresh_token_encrypted IS NOT NULL) AS has_refresh,
--          (access_token_expires_at  IS NOT NULL) AS has_expiry,
--          (access_token_encrypted   IS NOT NULL) AS has_token,
--          archived_at
--     FROM public.shopify_connections
--    WHERE id IN ( '00000000-0000-0000-0000-000000000000' );  -- ← fill in
--
-- ── THE MARKING. Replace the id list with the reviewed connection id(s). The
--    extra predicates are a fence, not a filter: they make a wrong id a no-op
--    rather than a privilege grant.
UPDATE public.shopify_connections
   SET connection_provenance = 'direct_legacy_preapproval',
       updated_at = now()
 WHERE id IN (
         -- ← the positively identified historical direct connection(s) only.
         '00000000-0000-0000-0000-000000000000'
       )
   AND connection_provenance IS NULL
   AND oauth_app_edition IS NULL          -- never re-label a public-app grant
   AND refresh_token_encrypted IS NULL    -- nothing to rotate with
   AND access_token_expires_at IS NULL    -- genuinely non-expiring
   AND access_token_encrypted IS NOT NULL -- a credential actually exists
   AND archived_at IS NULL;

COMMIT;

-- Rollback:
--   UPDATE public.shopify_connections SET connection_provenance = NULL
--    WHERE connection_provenance = 'direct_legacy_preapproval';
--   ALTER TABLE public.shopify_connections DROP COLUMN connection_provenance;
