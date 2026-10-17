-- ============================================================================
-- Site fixes: a fifth channel, 'shopify'.
--
-- A Shopify store's own articles and pages get the fixes the Admin API allows
-- with the store's existing connection (write_content, already granted for
-- publishing): the search engine listing title and description, image alt
-- text, a broken link, an FAQ block, an extra main heading. Products,
-- collections, the theme and the store's settings are never written
-- (lib/site-fix/shopify-admin.ts).
--
-- Additive only: the closed channel whitelist of site_fix_jobs and of
-- site_fix_audit is widened by this one value. Every existing row and every
-- other constraint, policy, grant and trigger stays as it is (the audit stays
-- append-only). Idempotent (drop-if-exists + add).
-- Until this is applied, a Shopify approval answers queue_unavailable (the
-- insert fails the old check) and nothing is written to the store.
-- Probe: supabase/migrations/__qa__/site-fix-shopify-channel.probe.sql
-- ============================================================================
ALTER TABLE public.site_fix_jobs DROP CONSTRAINT IF EXISTS site_fix_jobs_channel;
ALTER TABLE public.site_fix_jobs ADD CONSTRAINT site_fix_jobs_channel
  CHECK (channel IN ('plugin', 'app_password', 'webhook', 'manual', 'shopify'));
ALTER TABLE public.site_fix_audit DROP CONSTRAINT IF EXISTS site_fix_audit_channel;
ALTER TABLE public.site_fix_audit ADD CONSTRAINT site_fix_audit_channel
  CHECK (channel IS NULL OR channel IN ('plugin', 'app_password', 'webhook', 'manual', 'shopify'));
