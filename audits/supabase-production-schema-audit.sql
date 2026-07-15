-- ============================================================================
-- READ-ONLY Supabase production-schema audit  (paste into the Supabase SQL Editor)
--
-- Verifies that every durable object expected by the repository's real migrations
-- actually exists in the live schema. There is NO migration-history table
-- (supabase_migrations.schema_migrations is absent), so this catalog-based audit
-- is the source of truth.
--
-- SAFETY: SELECT-only. It never CREATEs/ALTERs/DROPs/DELETEs/UPDATEs/INSERTs/
-- TRUNCATEs/GRANTs/REVOKEs and never executes dynamic SQL. Every existence check
-- is name-based against pg_catalog / information_schema / pg_policies (to_regclass
-- returns NULL for an absent table instead of raising), so a missing object yields
-- FAIL for that one row and never aborts the whole audit. Storage checks degrade to
-- REVIEW when storage metadata is not visible to the running role.
--
-- Output columns: migration_file, check_name, expected_state, actual_state, result
-- result ∈ PASS | FAIL | REVIEW.  Sort puts FAIL/REVIEW first for triage.
-- ============================================================================

WITH
-- Tables every real migration is expected to have created.
expected_tables(migration_file, tbl) AS (VALUES
  ('20260412_create_articles_table.sql','articles'),
  ('20260510_add_ai_visibility.sql','ai_prompts'),
  ('20260510_add_ai_visibility.sql','ai_scan_runs'),
  ('20260510_add_ai_visibility.sql','ai_scan_results'),
  ('20260510_add_ai_visibility.sql','ai_citations'),
  ('20260522_add_ai_visibility_competitors.sql','ai_visibility_competitors'),
  ('20260528_add_ai_question_suggestion_cache.sql','ai_question_suggestion_cache'),
  ('20260702_add_content_module.sql','wordpress_connections'),
  ('20260702_add_content_module.sql','article_topics'),
  ('20260702_add_content_module.sql','generated_articles'),
  ('20260702_add_content_module.sql','article_pools'),
  ('20260702_add_content_module.sql','article_pool_items'),
  ('20260702_add_content_module.sql','ai_usage_logs'),
  ('20260707_add_content_topic_ideas.sql','content_topic_ideas'),
  ('20260716_add_keyword_research_cache.sql','keyword_research_cache'),
  ('20260718_add_wordpress_content_index.sql','wordpress_content_index'),
  ('20260719_add_internal_link_plans.sql','article_internal_link_plan_batches'),
  ('20260719_add_internal_link_plans.sql','article_internal_link_plan_links'),
  ('20260720_add_internal_link_insertion.sql','generated_article_content_snapshots'),
  ('20260720_add_internal_link_insertion.sql','article_internal_link_insertions'),
  ('20260722_add_content_automation_alerts.sql','content_automation_alerts'),
  ('20260723_add_article_inline_images.sql','article_inline_images'),
  ('20260725_add_shopify.sql','shopify_connections'),
  ('20260725_add_shopify.sql','shopify_entities'),
  ('20260726_add_shopify_oauth.sql','shopify_oauth_states')
),
-- Core tables the current code depends on that predate this migration set (must
-- already exist in production). Absence = highest-severity integrity break.
expected_core_tables(migration_file, tbl) AS (VALUES
  ('(pre-existing core)','projects'),
  ('(pre-existing core)','tracking_targets'),
  ('(pre-existing core)','profiles'),
  ('(pre-existing core)','subscriptions'),
  ('(pre-existing core)','scans'),
  ('(pre-existing core)','scan_results'),
  ('(pre-existing core)','clients')
),
-- Tables that must have RLS ENABLED.
expected_rls(migration_file, tbl) AS (VALUES
  ('20260702_add_content_module.sql','wordpress_connections'),
  ('20260702_add_content_module.sql','article_topics'),
  ('20260702_add_content_module.sql','generated_articles'),
  ('20260702_add_content_module.sql','article_pools'),
  ('20260702_add_content_module.sql','article_pool_items'),
  ('20260702_add_content_module.sql','ai_usage_logs'),
  ('20260707_add_content_topic_ideas.sql','content_topic_ideas'),
  ('20260716_add_keyword_research_cache.sql','keyword_research_cache'),
  ('20260718_add_wordpress_content_index.sql','wordpress_content_index'),
  ('20260719_add_internal_link_plans.sql','article_internal_link_plan_batches'),
  ('20260719_add_internal_link_plans.sql','article_internal_link_plan_links'),
  ('20260720_add_internal_link_insertion.sql','generated_article_content_snapshots'),
  ('20260720_add_internal_link_insertion.sql','article_internal_link_insertions'),
  ('20260722_add_content_automation_alerts.sql','content_automation_alerts'),
  ('20260723_add_article_inline_images.sql','article_inline_images'),
  ('20260725_add_shopify.sql','shopify_connections'),
  ('20260725_add_shopify.sql','shopify_entities'),
  ('20260726_add_shopify_oauth.sql','shopify_oauth_states')
),
-- Minimum owner-policy count per RLS table (each has FOR-each-command or ALL policies).
expected_policy_min(migration_file, tbl, min_policies) AS (VALUES
  ('20260702_add_content_module.sql','generated_articles',4),
  ('20260702_add_content_module.sql','article_topics',4),
  ('20260702_add_content_module.sql','article_pool_items',4),
  ('20260702_add_content_module.sql','wordpress_connections',4),
  ('20260707_add_content_topic_ideas.sql','content_topic_ideas',4),
  ('20260722_add_content_automation_alerts.sql','content_automation_alerts',3),
  ('20260723_add_article_inline_images.sql','article_inline_images',3),
  ('20260725_add_shopify.sql','shopify_connections',4),
  ('20260726_add_shopify_oauth.sql','shopify_oauth_states',4)
),
-- High-risk columns the CURRENT production code reads (an absent one breaks a live
-- feature — e.g. the wp_* taxonomy columns caused the Buy Buy article_load failure).
expected_columns(migration_file, tbl, col, expected_type) AS (VALUES
  ('20260703_add_topic_brief_fields.sql','article_topics','anchors_json','jsonb'),
  ('20260703_add_topic_brief_fields.sql','article_topics','brief_notes','text'),
  ('20260703_add_topic_brief_fields.sql','article_topics','tone_of_voice','text'),
  ('20260703_add_topic_brief_fields.sql','article_topics','desired_word_count','integer'),
  ('20260703_add_topic_brief_fields.sql','article_topics','cta_preference','text'),
  ('20260703_add_topic_brief_fields.sql','article_topics','language','text'),
  ('20260715_add_content_automation.sql','article_topics','suggestion_reason','text'),
  ('20260715_add_content_automation.sql','article_topics','suggestion_score','numeric'),
  ('20260715_add_content_automation.sql','article_pool_items','topic_id','uuid'),
  ('20260715_add_content_automation.sql','article_pool_items','attempts','integer'),
  ('20260715_add_content_automation.sql','article_pool_items','last_error','text'),
  ('20260715_add_content_automation.sql','article_pool_items','locked_at','timestamp with time zone'),
  ('20260710_add_article_featured_image.sql','generated_articles','featured_image_storage_path','text'),
  ('20260710_add_article_featured_image.sql','generated_articles','wp_featured_media_id','integer'),
  ('20260724_add_article_wp_taxonomy.sql','generated_articles','wp_primary_category_id','integer'),
  ('20260724_add_article_wp_taxonomy.sql','generated_articles','wp_category_ids','ARRAY'),
  ('20260724_add_article_wp_taxonomy.sql','generated_articles','wp_tag_ids','ARRAY'),
  ('20260717_add_pool_publish_days.sql','article_pools','publish_days','ARRAY'),
  ('20260722_add_content_automation_alerts.sql','content_automation_alerts','dedupe_key','text'),
  ('20260722_add_content_automation_alerts.sql','content_automation_alerts','status','text'),
  ('20260726_add_shopify_oauth.sql','shopify_connections','granted_scopes','ARRAY'),
  ('20260726_add_shopify_oauth.sql','shopify_connections','auth_method','text'),
  ('20260727_add_shopify_article_publishing.sql','shopify_connections','default_blog_id','text'),
  ('20260727_add_shopify_article_publishing.sql','generated_articles','shopify_blog_id','text'),
  ('20260727_add_shopify_article_publishing.sql','generated_articles','shopify_article_id','text'),
  ('20260727_add_shopify_article_publishing.sql','generated_articles','shopify_status','text'),
  ('20260720_add_internal_link_insertion.sql','article_internal_link_plan_links','insertion_status','text')
),
-- Named constraints / unique indexes the app relies on for idempotency + integrity.
expected_constraints(migration_file, tbl, conname) AS (VALUES
  ('20260702_add_content_module.sql','wordpress_connections','wordpress_connections_project_unique'),
  ('20260702_add_content_module.sql','generated_articles','generated_articles_project_slug_unique'),
  ('20260702_add_content_module.sql','article_pool_items','article_pool_items_unique'),
  ('20260707_add_content_topic_ideas.sql','content_topic_ideas','content_topic_ideas_project_fingerprint_unique'),
  ('20260716_add_keyword_research_cache.sql','keyword_research_cache','keyword_research_cache_unique'),
  ('20260718_add_wordpress_content_index.sql','wordpress_content_index','wordpress_content_index_project_unique'),
  ('20260725_add_shopify.sql','shopify_connections','shopify_connections_project_unique'),
  ('20260725_add_shopify.sql','shopify_entities','shopify_entities_project_gid_unique')
),
expected_indexes(migration_file, tbl, idxname) AS (VALUES
  ('20260715_add_content_automation.sql','article_pool_items','idx_article_pool_items_pool_topic'),
  ('20260722_add_content_automation_alerts.sql','content_automation_alerts','uq_content_automation_alerts_dedupe')
),
-- CHECK-constraint widenings that the current state machine depends on.
expected_check_values(migration_file, tbl, conname, needle) AS (VALUES
  ('20260715_add_content_automation.sql','article_pool_items','article_pool_items_status_check','generating'),
  ('20260715_add_content_automation.sql','article_topics','article_topics_source_check','project_data')
),
-- Public storage buckets the code uploads to.
expected_buckets(migration_file, bucket) AS (VALUES
  ('20260613_create_article_images_bucket.sql','article-images'),
  ('20260710_add_article_featured_image.sql','content-article-images')
)

-- ── table existence (module migrations) ───────────────────────────────────────
SELECT migration_file,
       'table_exists: public.'||tbl AS check_name,
       'present' AS expected_state,
       CASE WHEN to_regclass('public.'||tbl) IS NOT NULL THEN 'present' ELSE 'MISSING' END AS actual_state,
       CASE WHEN to_regclass('public.'||tbl) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result
FROM expected_tables
UNION ALL
-- ── core (pre-existing) table existence ──────────────────────────────────────
SELECT migration_file,
       'core_table_exists: public.'||tbl,
       'present (code depends on it)',
       CASE WHEN to_regclass('public.'||tbl) IS NOT NULL THEN 'present' ELSE 'MISSING' END,
       CASE WHEN to_regclass('public.'||tbl) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
FROM expected_core_tables
UNION ALL
-- ── RLS enabled ──────────────────────────────────────────────────────────────
SELECT migration_file,
       'rls_enabled: public.'||tbl,
       'enabled',
       CASE
         WHEN to_regclass('public.'||tbl) IS NULL THEN 'table missing'
         WHEN COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=tbl), false) THEN 'enabled'
         ELSE 'DISABLED'
       END,
       CASE
         WHEN to_regclass('public.'||tbl) IS NULL THEN 'FAIL'
         WHEN COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=tbl), false) THEN 'PASS'
         ELSE 'FAIL'
       END
FROM expected_rls
UNION ALL
-- ── minimum owner-policy count ───────────────────────────────────────────────
SELECT migration_file,
       'rls_policies_present: public.'||tbl,
       '>= '||min_policies||' owner policies',
       COALESCE((SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename=tbl), '0'),
       CASE WHEN COALESCE((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=tbl), 0) >= min_policies THEN 'PASS' ELSE 'FAIL' END
FROM expected_policy_min
UNION ALL
-- ── high-risk columns (existence + type) ─────────────────────────────────────
SELECT migration_file,
       'column: public.'||tbl||'.'||col,
       'exists ('||expected_type||')',
       COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name=col), 'MISSING'),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name=col) THEN 'FAIL'
         WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name=col) = expected_type THEN 'PASS'
         ELSE 'REVIEW'
       END
FROM expected_columns
UNION ALL
-- ── named constraints ────────────────────────────────────────────────────────
SELECT migration_file,
       'constraint: '||conname||' on public.'||tbl,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=tbl AND c.conname=conname) THEN 'present' ELSE 'MISSING' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=tbl AND c.conname=conname) THEN 'PASS' ELSE 'FAIL' END
FROM expected_constraints
UNION ALL
-- ── named indexes ────────────────────────────────────────────────────────────
SELECT migration_file,
       'index: '||idxname||' on public.'||tbl,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=tbl AND indexname=idxname) THEN 'present' ELSE 'MISSING' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=tbl AND indexname=idxname) THEN 'PASS' ELSE 'FAIL' END
FROM expected_indexes
UNION ALL
-- ── CHECK-constraint widenings (definition must contain the new value) ───────
SELECT migration_file,
       'check_widened: '||conname||' includes '||needle,
       'definition contains '||needle,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=tbl AND c.conname=conname) THEN 'constraint missing'
         WHEN (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=tbl AND c.conname=conname) LIKE '%'||needle||'%' THEN 'contains '||needle
         ELSE 'stale (missing '||needle||')'
       END,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=tbl AND c.conname=conname) THEN 'FAIL'
         WHEN (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=tbl AND c.conname=conname) LIKE '%'||needle||'%' THEN 'PASS'
         ELSE 'FAIL'
       END
FROM expected_check_values
UNION ALL
-- ── storage buckets (REVIEW when storage metadata is not visible) ────────────
SELECT migration_file,
       'storage_bucket: '||bucket,
       'present + public',
       CASE
         WHEN to_regclass('storage.buckets') IS NULL THEN 'storage not visible'
         WHEN EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id=bucket) THEN 'present'
         ELSE 'MISSING'
       END,
       CASE
         WHEN to_regclass('storage.buckets') IS NULL THEN 'REVIEW'
         WHEN EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id=bucket) THEN 'PASS'
         ELSE 'FAIL'
       END
FROM expected_buckets
UNION ALL
-- ── migration-history table (informational: proves why history is untrusted) ──
SELECT '(supabase cli)' AS migration_file,
       'migration_history: supabase_migrations.schema_migrations',
       'absent (history not tracked)',
       CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'absent' ELSE 'present' END,
       'REVIEW'

ORDER BY CASE result WHEN 'FAIL' THEN 0 WHEN 'REVIEW' THEN 1 ELSE 2 END, migration_file, check_name;
