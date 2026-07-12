-- ============================================================================
-- Phase 4F.1 — Shopify connection + entity discovery (additive, reversible).
--
-- Mirrors the wordpress_connections ownership/RLS pattern exactly. Adds:
--   shopify_connections  — one Shopify store per project (encrypted Admin token)
--   shopify_entities     — synced storefront entities (products/collections/
--                          pages/blogs/articles), source-neutral target rows.
--
-- ADDITIVE ONLY. No existing table is altered. No data deleted. WordPress is
-- untouched. Rollback: DROP TABLE public.shopify_entities, public.shopify_connections;
-- ============================================================================

-- 1. shopify_connections — one Shopify store per project (MVP, manual Admin token)
CREATE TABLE IF NOT EXISTS public.shopify_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Normalized *.myshopify.com admin domain (authoritative for API calls).
  shop_domain              text NOT NULL,
  -- Optional custom storefront domain host (e.g. shop.example.com) used to build
  -- canonical internal-link URLs; falls back to shop_domain when absent.
  storefront_domain        text,

  -- AES-256-GCM encrypted Admin API access token (iv:tag:ciphertext hex).
  -- NEVER returned to the client; decrypted server-side only at call time.
  access_token_encrypted   text NOT NULL,

  api_version              text NOT NULL DEFAULT '2026-07',

  connection_status        text NOT NULL DEFAULT 'untested'
                             CHECK (connection_status IN ('untested', 'connected', 'failed')),
  last_tested_at           timestamptz,
  last_synced_at           timestamptz,
  last_error               text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shopify_connections_project_unique UNIQUE (project_id),
  CONSTRAINT shopify_connections_domain_myshopify CHECK (shop_domain LIKE '%.myshopify.com')
);

CREATE INDEX IF NOT EXISTS idx_shopify_connections_user
  ON public.shopify_connections (user_id);

-- 2. shopify_entities — synced storefront entities (source-neutral targets)
CREATE TABLE IF NOT EXISTS public.shopify_entities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  connection_id       uuid NOT NULL REFERENCES public.shopify_connections(id) ON DELETE CASCADE,

  -- Global Shopify id (e.g. gid://shopify/Product/123) — the idempotency key.
  shopify_gid         text NOT NULL,
  entity_type         text NOT NULL
                        CHECK (entity_type IN ('product', 'collection', 'page', 'blog', 'article')),
  shopify_numeric_id  text,

  title               text,
  handle              text,
  canonical_url       text,
  -- Raw Shopify status/state where available (e.g. ACTIVE/DRAFT/ARCHIVED); null otherwise.
  status              text,
  -- Whether this entity is a currently-valid internal-link target (published +
  -- still present in the latest sync). Removed/unpublished → false, never deleted.
  is_active           boolean NOT NULL DEFAULT true,

  -- Searchable text/excerpt + type-specific relevance metadata (tags, product_type,
  -- vendor, blog handle for articles, …). Best-effort; may be empty.
  body_excerpt        text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

  shopify_updated_at  timestamptz,
  synced_at           timestamptz NOT NULL DEFAULT now(),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- One row per (project, Shopify entity): repeated syncs UPSERT, never duplicate.
  CONSTRAINT shopify_entities_project_gid_unique UNIQUE (project_id, shopify_gid)
);

CREATE INDEX IF NOT EXISTS idx_shopify_entities_project_type_active
  ON public.shopify_entities (project_id, entity_type, is_active);
CREATE INDEX IF NOT EXISTS idx_shopify_entities_connection
  ON public.shopify_entities (connection_id);

-- ============================================================================
-- Row-Level Security — ownership via projects.user_id = auth.uid()
-- (identical pattern to wordpress_connections).
-- ============================================================================
ALTER TABLE public.shopify_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_entities    ENABLE ROW LEVEL SECURITY;

CREATE POLICY shopify_connections_select ON public.shopify_connections
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_connections_insert ON public.shopify_connections
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_connections_update ON public.shopify_connections
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_connections_delete ON public.shopify_connections
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY shopify_entities_select ON public.shopify_entities
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_entities_insert ON public.shopify_entities
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_entities_update ON public.shopify_entities
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_entities_delete ON public.shopify_entities
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
