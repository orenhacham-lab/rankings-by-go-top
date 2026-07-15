# Supabase migration inventory & production-schema audit

**Audit only — nothing was executed against Production.** No migration was applied,
pushed, repaired, or marked applied; no data was modified.

## 0. Why migration history cannot be trusted

`supabase_migrations.schema_migrations` does **not** exist in Production
(`42P01 relation … does not exist`), so the Supabase CLI has **no record** of which
files were applied. Files here were applied ad-hoc through the SQL Editor (e.g.
`20260722_add_content_automation_alerts.sql` was applied manually and its table now
exists). Therefore the **only** trustworthy source of truth is the live catalog —
which `audits/supabase-production-schema-audit.sql` inspects read-only.

- **Files inspected:** 38 (`supabase/migrations/*.sql`; 3 of them are non-migration
  scripts misplaced in that folder). No standalone `.sql` exists in the repo root.

## 1. Classification of every SQL file

### (1) Real schema migrations — 33
`20260407_add_monthly_first_day_frequency.sql`, `20260412_add_user_id_and_fix_rls.sql`,
`20260412_create_articles_table.sql`, `20260419_add_scan_audit_data.sql`,
`20260421_add_location_mode_to_targets.sql`, `20260422_add_postal_code_support.sql`,
`20260423_add_exact_point_mode.sql`, `20260510_add_ai_visibility.sql`,
`20260516_add_ai_business_profile.sql`, `20260519_add_keyword_metrics_to_tracking_targets.sql`,
`20260522_add_ai_visibility_competitors.sql`, `20260527_add_exclusion_flag_to_ai_scan_results.sql`,
`20260528_add_ai_question_suggestion_cache.sql`, `20260529_fix_cache_constraint_for_upsert.sql`,
`20260610_add_project_brand_domain_aliases.sql`, `20260613_add_article_seo_fields.sql`,
`20260613_create_article_images_bucket.sql`, `20260622_add_generation_version_to_cache.sql`,
`20260702_add_content_module.sql`, `20260703_add_topic_brief_fields.sql`,
`20260707_add_content_topic_ideas.sql`, `20260710_add_article_featured_image.sql`,
`20260715_add_content_automation.sql`, `20260716_add_keyword_research_cache.sql`,
`20260717_add_pool_publish_days.sql`, `20260718_add_wordpress_content_index.sql`,
`20260719_add_internal_link_plans.sql`, `20260720_add_internal_link_insertion.sql`,
`20260722_add_content_automation_alerts.sql`, `20260723_add_article_inline_images.sql`,
`20260724_add_article_wp_taxonomy.sql`, `20260725_add_shopify.sql`,
`20260726_add_shopify_oauth.sql`, `20260727_add_shopify_article_publishing.sql`.
*(34 items listed — note `20260529` is also a corrective fix, see §5.)*

### (2) Data backfill — 1
`20260412_backfill_legacy_data_to_admin.sql` — assigns legacy rows to an admin
user. Re-running could re-assign ownership → **review before any re-run**.

### (3) Verification / query-only — 1
`VERIFY_cache_state.sql` — SELECT-only inspection of `ai_question_suggestion_cache`.
Misplaced in `migrations/` (would be treated as a migration by `db push`).

### (4) Seed / sample-data — 1
`insert_google_position_article.sql` — `INSERT` of one marketing-blog post into the
global `articles` table. Misplaced in `migrations/`.

### (5) Duplicate / superseded — see §5
`20260529_fix_cache_constraint_for_upsert.sql` supersedes the original UNIQUE
constraint/partial index from `20260528` (fixes an `ON CONFLICT`-incompatible
partial unique index). Not a duplicate — a **corrective** migration; both must be
applied, latest wins.

### (6) Potentially destructive / unsafe to re-run — 3
- `insert_google_position_article.sql` — re-run duplicates / conflicts on a blog row
  (global `articles.slug` uniqueness) → error or dupe. **Do not re-run blindly.**
- `20260412_backfill_legacy_data_to_admin.sql` — ownership backfill (see §2).
- `add_article_fields.sql` — `ALTER TABLE articles ADD COLUMN IF NOT EXISTS …`
  (idempotent, but a loose untimestamped file altering the global blog table).

### (7) Unknown / requires manual review — 3 (the misplaced non-migrations)
`VERIFY_cache_state.sql`, `add_article_fields.sql`, `insert_google_position_article.sql`
— none are timestamped migrations; they sit in `migrations/` and would be picked up
out of order by `supabase db push`. **Recommend moving them out of `migrations/`**
(no production change needed for the audit).

## 2. Notable ordering / safety notes
- Three files share date `20260412` (`add_user_id_and_fix_rls`, `backfill_legacy_data_to_admin`,
  `create_articles_table`). By filename sort, `add_user_id…` and `backfill…` precede
  `create_articles…`, which is the wrong dependency order. History is untracked, so
  they were applied manually in the correct order; flagged as **REVIEW** for any
  future `db push`.
- All content/automation/WordPress/Shopify migrations are **additive + idempotent**
  (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` +
  re-`ADD`). None drop tables or delete data.

## 3. Expected durable objects per real migration (active feature set)

| Migration | Tables | Key columns / constraints / indexes | RLS |
|---|---|---|---|
| 20260702_add_content_module | `wordpress_connections`, `article_topics`, `generated_articles`, `article_pools`, `article_pool_items`, `ai_usage_logs` | `wordpress_connections_project_unique`, `generated_articles_project_slug_unique`, `article_pool_items_unique(pool_id,article_id)`; status CHECKs; `idx_generated_articles_due` (partial) | ✅ all 6, owner policies via `projects.user_id=auth.uid()` |
| 20260703_add_topic_brief_fields | — | `article_topics`: `anchors_json jsonb`, `brief_notes`, `language`, `tone_of_voice`, `desired_word_count`, `cta_preference` | — |
| 20260707_add_content_topic_ideas | `content_topic_ideas` | `content_topic_ideas_project_fingerprint_unique(project_id,fingerprint)`; status CHECK | ✅ 4 policies |
| 20260710_add_article_featured_image | — (+ bucket `content-article-images`) | `generated_articles`: `featured_image_storage_path`, `featured_image_prompt`, `wp_featured_media_id` | — |
| 20260715_add_content_automation | — | `article_pool_items`: `topic_id`, `attempts`, `last_error`, `locked_at`, `article_id` **nullable**, **widened** `article_pool_items_status_check` (adds generating/generated/publishing/…), `idx_article_pool_items_pool_topic`; `article_topics`: **widened** `article_topics_source_check` (project_data/keyword_research_*), `suggestion_reason`, `suggestion_score` | — |
| 20260716_add_keyword_research_cache | `keyword_research_cache` | `keyword_research_cache_unique(project_id,seed_type,seed_value,country,language)` | ✅ 4 |
| 20260717_add_pool_publish_days | — | `article_pools.publish_days integer[]` | — |
| 20260718_add_wordpress_content_index | `wordpress_content_index` | `wordpress_content_index_project_unique` | ✅ 4 |
| 20260719_add_internal_link_plans | `article_internal_link_plan_batches`, `article_internal_link_plan_links` | `ilp_links_batch_target_unique`; subject/status CHECKs | ✅ 4+4 |
| 20260720_add_internal_link_insertion | `generated_article_content_snapshots`, `article_internal_link_insertions` | `article_internal_link_plan_links`: `insertion_status` + cols; batch counters | ✅ 4+4 |
| 20260722_add_content_automation_alerts | `content_automation_alerts` | `uq_content_automation_alerts_dedupe(dedupe_key)`; owner+service policies | ✅ 3 (**applied manually**) |
| 20260723_add_article_inline_images | `article_inline_images` | status CHECK; owner+service policies | ✅ 3 |
| 20260724_add_article_wp_taxonomy | — | `generated_articles`: `wp_primary_category_id int`, `wp_category_ids int[]`, `wp_tag_ids int[]` | — |
| 20260725_add_shopify | `shopify_connections`, `shopify_entities` | `shopify_connections_project_unique`, `…_domain_myshopify` CHECK, `shopify_entities_project_gid_unique` | ✅ 4+4 |
| 20260726_add_shopify_oauth | `shopify_oauth_states` | `shopify_connections`: `granted_scopes text[]`, `auth_method` CHECK | ✅ 4 |
| 20260727_add_shopify_article_publishing | — | `shopify_connections.default_blog_id`; `generated_articles`: `shopify_blog_id`, `shopify_tags[]`, `shopify_article_id`, `shopify_article_url`, `shopify_handle`, `shopify_status`, `shopify_published_at`, `shopify_last_error`, `shopify_last_synced_at` | — |

Storage buckets: `article-images` (global blog, `20260613`), `content-article-images`
(content module, `20260710`). Functions/triggers: `is_admin()` (20260412),
`update_articles_updated_at()` + trigger `articles_update_updated_at` (20260412).

## 4. Application dependency map (tables actively referenced by code)

Referenced via `.from('…')` in `app/` + `lib/` (ref-count): `generated_articles`(60),
`projects`(54), `article_pool_items`(35), `tracking_targets`(34), `article_topics`(31),
`article_inline_images`(22), `articles`(17), `subscriptions`(16), `scan_results`(16),
`wordpress_connections`(12), `scans`(12), `clients`(12), `ai_scan_runs`(11),
`shopify_connections`(10), `ai_visibility_competitors`(10), `ai_scan_results`(9),
`ai_question_suggestion_cache`(9), `ai_prompts`(9), `article_pools`(8),
`article_internal_link_plan_links`(8), `shopify_entities`(7), `profiles`(7),
`generated_article_content_snapshots`(4), `shopify_oauth_states`(3),
`content_topic_ideas`(3), `article_internal_link_plan_batches`(3),
`article_internal_link_insertions`(3), `ai_citations`(3), `keyword_research_cache`(2),
`content_automation_alerts`(2), `ai_usage_logs`(1). Storage buckets used:
`article-images`, `content-article-images`. No `.rpc()` calls; no code reference to the
migration-history table.

**Not created by any repo migration but required by code** (pre-existing core —
absence = highest severity): `projects`, `tracking_targets`, `profiles`,
`subscriptions`, `scans`, `scan_results`, `clients`. (The app is live, so these are
assumed present; the audit confirms.)

## 5. Duplicate / superseded / unsafe
- **Superseded:** `20260529_fix_cache_constraint_for_upsert.sql` replaces the
  `20260528` cache unique constraint (partial→full for `ON CONFLICT`). Audit checks
  the *current* constraint, distinguishing "missing" from "superseded".
- **Unsafe to re-run:** `insert_google_position_article.sql` (seed INSERT),
  `20260412_backfill_legacy_data_to_admin.sql` (ownership backfill).
- **Misplaced non-migrations:** `VERIFY_cache_state.sql`, `add_article_fields.sql`,
  `insert_google_position_article.sql`.

## 6. Highest-risk active-schema checks (run these first)
1. **`generated_articles.wp_primary_category_id` / `wp_category_ids` / `wp_tag_ids`
   (20260724).** Strong repo evidence they may be **absent in Production**: the live
   Buy Buy publish previously failed at `article_load` with a `42703 column does not
   exist`, and PR #24 switched the publish route to `select('*')` specifically to
   tolerate their absence. **Most likely missing migration.**
2. `content_automation_alerts` + `uq_…_dedupe` (20260722) — confirmed applied
   manually; audit should show PASS.
3. `shopify_connections` / `shopify_entities` / `shopify_oauth_states` +
   `granted_scopes`/`auth_method`/`default_blog_id` + Shopify publishing columns on
   `generated_articles` (20260725/26/27) — newest migrations, highest chance of lag.
4. `article_pool_items` automation columns + widened status CHECK (20260715) — the
   queue/publish state machine breaks without `topic_id`/`attempts`/`locked_at` and
   the `generating/publishing/…` statuses.
5. `article_topics` brief + source-widening (20260703/20260715) — manual-topic briefs
   + recommendation sources depend on these.
6. RLS enabled + owner policies on every content/shopify table (security-critical).

## 7. Migration that appears missing from repo evidence alone
Only **`20260724_add_article_wp_taxonomy.sql`** has direct code-behavior evidence of
possible absence (see §6.1). All other "applied vs not" determinations **require
running the audit SQL** — repo evidence alone cannot prove application state because
the history table does not exist.

## 8. How to run
Paste `audits/supabase-production-schema-audit.sql` into the Supabase SQL Editor and
run. It returns one row per check (FAIL/REVIEW first). Any `FAIL` on a §6 item is an
active-schema gap to remediate (separately — this task does not apply migrations).
