-- ============================================================================
-- SCHEMA ONLY — the provenance column. NO DATA IS TOUCHED HERE.
--
-- WHY. classifyStoredCredential must decide whether a NON-EXPIRING credential
-- (no expiry, no refresh material) may be sent to the Admin API. Commit
-- f9a9324 made that decision depend on oauth_app_edition, and every connection
-- created before 20260901010000 has that column NULL — so the one intentional
-- pre-approval direct connection was refused, and the automation queue reported
-- it as "no connected Shopify store".
--
-- NULL is NOT read as legacy. It means UNKNOWN and stays refused: it also
-- covers manually imported, partially written and corrupt rows. Provenance must
-- be ASSERTED for a specific connection, by a human, with the identity checked.
--
-- THE MARKING IS DELIBERATELY NOT IN THIS FILE. An earlier revision carried an
-- UPDATE with a placeholder id. Applied, that would have marked zero rows,
-- recorded itself as applied, and left the connection blocked — with no valid
-- way to re-run it. Data repair lives in scripts/reconcile-shopify-provenance.ts,
-- which REQUIRES the exact identity and refuses to run without it.
--
-- TRANSITION SAFETY. No query names this column: loadShopifyConnection uses
-- select('*'), so before the column exists the field is simply absent, which
-- the classifier already treats as unknown and refuses — the same answer it
-- gives today. Applying this migration alone changes NO behaviour for ANY
-- connection.
-- ============================================================================

BEGIN;

ALTER TABLE public.shopify_connections
  -- WHY this connection may hold a non-expiring credential. Written only by a
  -- reviewed, identity-checked reconciliation — never by an OAuth flow, never
  -- inferred at runtime. NULL = unknown = refused.
  ADD COLUMN IF NOT EXISTS connection_provenance text
    CHECK (connection_provenance IN ('direct_legacy_preapproval') OR connection_provenance IS NULL);

COMMENT ON COLUMN public.shopify_connections.connection_provenance IS
  'Explicit, human-asserted reason a non-expiring credential is permitted. Never inferred; NULL is refused. Set only by scripts/reconcile-shopify-provenance.ts.';

COMMIT;

-- Rollback:
--   ALTER TABLE public.shopify_connections DROP COLUMN connection_provenance;
