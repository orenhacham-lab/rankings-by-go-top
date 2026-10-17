-- ============================================================================
-- Site fixes: two more fix types for the Go Top plugin 2.1.0.
--
--   h1_demote   an extra main heading in the post's OWN content becomes an H2
--               (words unchanged); offered only where lib/site-fix/h1.ts proves
--               it safe.
--   llms_txt    an llms.txt the plugin answers at <home>/llms.txt when the site
--               has no llms.txt file of its own (never overwrites one).
--
-- Additive only: the closed fix-type whitelist of site_fix_jobs is widened by
-- these two values, and the finding-kind shape admits digits (the finding
-- behind h1_demote is "h1_multiple"; the old shape ^[a-z_]{1,40}$ rejected it).
-- Every existing row and every other constraint, policy, grant and trigger
-- stays as it is. Idempotent (drop-if-exists + add).
-- Until this is applied, approving one of the two new types answers
-- queue_unavailable (the insert fails the old check) and nothing is written.
-- Probe: supabase/migrations/__qa__/site-fix-h1-llms.probe.sql
-- ============================================================================
ALTER TABLE public.site_fix_jobs DROP CONSTRAINT IF EXISTS site_fix_jobs_fix_type;
ALTER TABLE public.site_fix_jobs ADD CONSTRAINT site_fix_jobs_fix_type CHECK (fix_type IN (
  'seo_title', 'meta_description', 'canonical', 'focus_keyphrase', 'image_alt',
  'faq_block', 'schema_jsonld', 'broken_link', 'internal_link',
  'h1_demote', 'llms_txt'));
ALTER TABLE public.site_fix_jobs DROP CONSTRAINT IF EXISTS site_fix_jobs_finding_kind;
ALTER TABLE public.site_fix_jobs ADD CONSTRAINT site_fix_jobs_finding_kind CHECK (finding_kind ~ '^[a-z0-9_]{1,40}$');
