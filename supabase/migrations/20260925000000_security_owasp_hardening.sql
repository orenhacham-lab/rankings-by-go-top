-- ============================================================================
-- SECURITY HARDENING — findings from the OWASP Top 10:2025 audit (A01).
--
-- Every statement below closes a gap that was PROVEN against the live schema
-- (read-only catalog queries, counts only — no row contents were read):
--
-- 1. PRIVILEGE ESCALATION TO ADMIN. `profiles_update_own` lets a user UPDATE
--    their own profile row with no WITH CHECK, and `authenticated` held UPDATE
--    on every column — including `role`. Any signed-in merchant could run
--      supabase.from('profiles').update({ role: 'admin' }).eq('id', <self>)
--    from the browser with the public anon key. `role = 'admin'` is what
--    is_admin() reads, and is_admin() is OR-ed into the isolation policies of
--    projects, clients, scans, scan_results and tracking_targets — so the
--    escalation became read/write access to every tenant's data, plus the
--    admin pages and unlimited quotas (lib/subscription.ts). The same grant let
--    a user reset `billing_market_claimed_at`, defeating the one-time market
--    choice. The application never writes profiles through a user session
--    (only createAdminClient() in billing-market/select, and the
--    handle_new_user trigger, both of which bypass these grants), so the
--    writes are revoked outright rather than narrowed.
--
-- 2. CROSS-TENANT READ WITHOUT SIGNING IN. The views latest_rankings and
--    project_ranking_summary were created without security_invoker, so they
--    ran with the OWNER's rights and RLS on scan_results/tracking_targets never
--    applied. `anon` held SELECT on both. Measured as `anon`:
--    latest_rankings returned 610 rows spanning 24 projects, while
--    scan_results read directly returned 0 — i.e. the public anon key exposed
--    every tenant's keywords, positions, and ranking URLs through the views.
--    No application code reads either view (grep of app/, lib/, components/),
--    so they are switched to security_invoker and closed to anon.
--
-- 3. PLANTING ROWS IN ANOTHER TENANT'S PROJECT. tracking_targets' policy only
--    required `user_id = auth.uid()` on write, not that project_id belong to
--    the caller; projects' policy likewise never checked client_id. A user
--    could insert keywords into a victim's project, which every service-role
--    scan of that project then loads by project_id and bills to the victim.
--    Live data was measured before tightening: 0 targets point at a project
--    owned by someone else, and 0 projects point at another owner's client,
--    so the stricter WITH CHECK rejects nothing that exists today.
--
-- 4. SECURITY DEFINER functions reachable over /rest/v1/rpc by `anon`
--    (Supabase advisor 0028/0029), and four functions with a mutable
--    search_path (advisor 0011).
--
-- 5. PUBLIC BLOG BUCKET WRITABLE BY EVERY MERCHANT. storage.objects carried
--    "Allow authenticated uploads/updates/deletes" on bucket article-images with
--    no other condition, plus four `private/` folder policies granting the same
--    to any signed-in user. Any merchant could overwrite or delete the images
--    of the public blog. The only writer in the application is
--    /api/articles/upload, which is admin-gated and uses the service role
--    (bypasses these policies); components/RichTextEditor.tsx, the one browser
--    uploader, is not imported anywhere. Writes are narrowed to administrators;
--    public reads are unchanged.
--
-- Idempotent: every statement can be re-run.
-- ============================================================================

BEGIN;

-- ── 1. profiles: no direct writes from browser roles ───────────────────────
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon, authenticated;
-- Column-level grants survive a table-level REVOKE, so remove those explicitly.
DO $$
DECLARE col text;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
  LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.profiles FROM anon, authenticated', col, col);
  END LOOP;
END $$;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- ── 2. ranking views: caller's rights, never anon ──────────────────────────
ALTER VIEW public.latest_rankings SET (security_invoker = true);
ALTER VIEW public.project_ranking_summary SET (security_invoker = true);
REVOKE ALL ON TABLE public.latest_rankings FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_ranking_summary FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.latest_rankings, public.project_ranking_summary FROM authenticated;

-- ── 3. writes must reference the caller's own project / client ─────────────
DROP POLICY IF EXISTS tracking_targets_isolation_policy ON public.tracking_targets;
CREATE POLICY tracking_targets_isolation_policy ON public.tracking_targets
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (
    is_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS projects_isolation_policy ON public.projects;
CREATE POLICY projects_isolation_policy ON public.projects
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (
    is_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND (client_id IS NULL OR client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()))
    )
  );

-- ── 4. SECURITY DEFINER functions and search_path ──────────────────────────
-- handle_new_user is a trigger function; nobody needs to call it over RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- is_admin is evaluated inside policies granted TO authenticated, so that role
-- keeps EXECUTE; anon never evaluates those policies and loses it.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_articles_updated_at() SET search_path = public;
ALTER FUNCTION public.gsc_opp_decisions_lock_created_topic() SET search_path = public;

-- ── 5. article-images bucket: writes for administrators only ───────────────
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder qt2lnz_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder qt2lnz_1" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder qt2lnz_2" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder qt2lnz_3" ON storage.objects;
DROP POLICY IF EXISTS article_images_admin_insert ON storage.objects;
DROP POLICY IF EXISTS article_images_admin_update ON storage.objects;
DROP POLICY IF EXISTS article_images_admin_delete ON storage.objects;
CREATE POLICY article_images_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'article-images' AND public.is_admin(auth.uid()));
CREATE POLICY article_images_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'article-images' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'article-images' AND public.is_admin(auth.uid()));
CREATE POLICY article_images_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'article-images' AND public.is_admin(auth.uid()));

COMMIT;
