-- ============================================================================
-- MANUAL VERIFICATION SCRIPT — run in Supabase SQL Editor
-- Use this to inspect the REAL production state of the suggestion cache.
-- Replace <TESTED_PROJECT_ID> with the project you are testing.
-- ============================================================================

-- 1. Does the table exist?  (expect: public.ai_question_suggestion_cache)
SELECT to_regclass('public.ai_question_suggestion_cache') AS table_exists;

-- 2. What CONSTRAINTS exist?  (expect a UNIQUE on
--    project_id, context_hash, question_hash, source after running the fix)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.ai_question_suggestion_cache'::regclass;

-- 3. What INDEXES exist?  (a *partial* unique index with a WHERE clause is NOT
--    usable for ON CONFLICT — that is the original bug.)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ai_question_suggestion_cache';

-- 4. Are Gemini rows actually being inserted for the tested project?
SELECT id, project_id, context_hash, question, status, source, intent,
       created_at, last_shown_at
FROM public.ai_question_suggestion_cache
WHERE project_id = '<TESTED_PROJECT_ID>'
ORDER BY created_at DESC
LIMIT 100;

-- 5. Summary counts per context_hash / status / source for the tested project.
SELECT context_hash, status, source, count(*) AS rows
FROM public.ai_question_suggestion_cache
WHERE project_id = '<TESTED_PROJECT_ID>'
GROUP BY context_hash, status, source
ORDER BY rows DESC;
