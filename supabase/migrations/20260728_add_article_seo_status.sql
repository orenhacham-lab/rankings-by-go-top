-- Persist the latest SEO-meta publishing outcome per article so BOTH the article editor and
-- the ContentHub publishing flow can show a truthful status (verified / written_not_verifiable
-- / seo_bridge_required / …). Written by manual + automated + update-in-place publishing
-- through the ONE shared SEO service. Never stores meta VALUES here — only the outcome.
--
-- Rollback: ALTER TABLE public.generated_articles
--   DROP COLUMN seo_status, DROP COLUMN seo_plugin, DROP COLUMN seo_last_error,
--   DROP COLUMN seo_verified_at;

ALTER TABLE public.generated_articles
  ADD COLUMN IF NOT EXISTS seo_status       text,   -- verified | written_not_verifiable | seo_bridge_required | plugin_unavailable | permission_error | exact_failure
  ADD COLUMN IF NOT EXISTS seo_plugin       text,   -- yoast | rankmath | none | unknown
  ADD COLUMN IF NOT EXISTS seo_last_error   text,   -- safe short detail (no credentials / no content)
  ADD COLUMN IF NOT EXISTS seo_verified_at  timestamptz;
