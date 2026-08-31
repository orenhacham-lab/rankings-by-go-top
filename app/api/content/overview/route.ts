/**
 * Content module — GET /api/content/overview?projectId=<optional>
 *
 * READ-ONLY. Powers the Content Hub:
 *   - `projects`: the user's projects (for the selector)
 *   - when projectId is provided & owned: article status `counts`, a lightweight
 *     `articles` list, and safe `wordpress` connection status.
 *
 * Uses the session (RLS-scoped) client — never the service role — so it can
 * only ever see the caller's own rows. It NEVER selects or returns the
 * encrypted Application Password or any secret. It performs NO writes.
 *
 * Resilient to the content migration not having run yet: a missing table
 * degrades to zero counts / not-connected rather than a 500.
 */

import { createClient } from '@/lib/supabase/server'
import { hasWriteContent } from '@/lib/shopify/constants'
import { resolveActivePlatform } from '@/lib/content/platform/active-platform'

const EMPTY_COUNTS = {
  total: 0,
  draft: 0,
  ready: 0,
  scheduled: 0,
  publishing: 0,
  published: 0,
  failed: 0,
}

type ArticleRow = {
  id: string
  topic_id: string | null
  title: string
  slug: string
  status: keyof typeof EMPTY_COUNTS | string
  wp_post_id: number | null
  wp_post_url: string | null
  wp_featured_media_id: number | null
  featured_image_url: string | null
  scheduled_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  // Shopify publication (safe fields only — never any token). Lets ContentHub route + show
  // Shopify state for a Shopify project instead of hard-coding WordPress.
  shopify_article_id: string | null
  shopify_article_url: string | null
  shopify_status: string | null
  shopify_blog_id: string | null
}

export async function GET(request: Request) {
  if (process.env.ENABLE_CONTENT !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Projects for the selector (RLS also enforces ownership).
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, business_name, target_domain, language')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name')

  if (projectsError) {
    console.error('[content overview] projects load failed:', projectsError.message)
    return Response.json({ error: 'Failed to load projects' }, { status: 500 })
  }

  const projects = projectsData || []
  const projectId = new URL(request.url).searchParams.get('projectId')

  // No project selected → just return the list for the selector.
  if (!projectId) {
    return Response.json({ projects, selected: null, counts: null, articles: [], wordpress: null })
  }

  // Ownership check: the id must be one of the user's own projects.
  if (!projects.some((p) => p.id === projectId)) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  // Articles for the selected project. Tolerate the table not existing yet.
  const WP_COLS = 'id, topic_id, title, slug, status, wp_post_id, wp_post_url, wp_featured_media_id, featured_image_url, scheduled_at, published_at, created_at, updated_at'
  const SHOPIFY_COLS = 'shopify_article_id, shopify_article_url, shopify_status, shopify_blog_id'
  let articles: ArticleRow[] = []
  const loadArticles = (cols: string) => supabase
    .from('generated_articles').select(cols).eq('project_id', projectId)
    .order('updated_at', { ascending: false }).limit(1000)
  let { data: articlesData, error: articlesError } = await loadArticles(`${WP_COLS}, ${SHOPIFY_COLS}`)
  // The Shopify-publishing columns are behind a later migration — if they are absent,
  // retry WordPress-only so a not-yet-migrated (WordPress) project never regresses.
  if (articlesError && (articlesError as { code?: string }).code === '42703') {
    ;({ data: articlesData, error: articlesError } = await loadArticles(WP_COLS))
  }
  if (articlesError) {
    // 42P01 = undefined_table (migration not run yet) — degrade gracefully.
    if ((articlesError as { code?: string }).code !== '42P01') {
      console.error('[content overview] articles load failed:', articlesError.message)
    }
  } else {
    articles = ((articlesData || []) as unknown as ArticleRow[]).map((a) => ({
      ...a,
      shopify_article_id: a.shopify_article_id ?? null,
      shopify_article_url: a.shopify_article_url ?? null,
      shopify_status: a.shopify_status ?? null,
      shopify_blog_id: a.shopify_blog_id ?? null,
    }))
  }

  const counts = { ...EMPTY_COUNTS, total: articles.length }
  for (const a of articles) {
    if (a.status in counts) counts[a.status as keyof typeof EMPTY_COUNTS] += 1
  }

  // "Scheduled" (מתוזמנים) must reflect the AUTOMATION QUEUE, not only articles.
  // Count article_pool_items that are planned/in-flight for this project — i.e.
  // still heading toward publish. Deliberately excludes published / skipped /
  // failed / quality_check_failed / paused so finished or halted work is never
  // shown as "scheduled". Tolerates the automation table not existing yet.
  const PENDING_QUEUE_STATUSES = ['queued', 'scheduled', 'generating', 'generated', 'publishing']
  const { count: queueCount, error: queueError } = await supabase
    .from('article_pool_items')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', PENDING_QUEUE_STATUSES)
  if (queueError) {
    if ((queueError as { code?: string }).code !== '42P01') {
      console.error('[content overview] pool items count failed:', queueError.message)
    }
  } else {
    counts.scheduled += queueCount ?? 0
  }

  // WordPress connection status — SAFE FIELDS ONLY. The encrypted password
  // column is deliberately never selected.
  let wordpress: { connected: boolean; siteUrl: string | null; status: string | null; lastTestedAt: string | null } = {
    connected: false,
    siteUrl: null,
    status: null,
    lastTestedAt: null,
  }
  const { data: wpData, error: wpError } = await supabase
    .from('wordpress_connections')
    .select('site_url, connection_status, last_tested_at')
    .eq('project_id', projectId)
    .maybeSingle()

  if (wpError) {
    if ((wpError as { code?: string }).code !== '42P01') {
      console.error('[content overview] wp status load failed:', wpError.message)
    }
  } else if (wpData) {
    wordpress = {
      connected: (wpData as { connection_status?: string }).connection_status === 'connected',
      siteUrl: (wpData as { site_url?: string }).site_url ?? null,
      status: (wpData as { connection_status?: string }).connection_status ?? null,
      lastTestedAt: (wpData as { last_tested_at?: string }).last_tested_at ?? null,
    }
  }

  // Shopify connection status — SAFE FIELDS ONLY (never the encrypted token). Lets
  // ContentHub route by the ACTIVE platform instead of hard-coding WordPress.
  let shopify: { connected: boolean; shopDomain: string | null; status: string | null; canPublish: boolean; defaultBlogId: string | null } = {
    connected: false, shopDomain: null, status: null, canPublish: false, defaultBlogId: null,
  }
  const { data: shData, error: shError } = await supabase
    .from('shopify_connections')
    .select('shop_domain, connection_status, granted_scopes, default_blog_id')
    .eq('project_id', projectId)
    .is('archived_at', null)
    .maybeSingle()
  if (shError) {
    if ((shError as { code?: string }).code !== '42P01') console.error('[content overview] shopify status load failed:', shError.message)
  } else if (shData) {
    const s = shData as { shop_domain?: string; connection_status?: string; granted_scopes?: string[]; default_blog_id?: string }
    shopify = {
      connected: s.connection_status === 'connected',
      shopDomain: s.shop_domain ?? null,
      status: s.connection_status ?? null,
      canPublish: hasWriteContent(s.granted_scopes),
      defaultBlogId: s.default_blog_id ?? null,
    }
  }

  // ONE shared resolver decides the active publishing platform (by VALIDITY, not row
  // existence) so the client routes single-row Shopify/WordPress correctly and shows the
  // right panel; two genuinely-connected platforms are an explicit conflict.
  const platform = resolveActivePlatform({
    wordpress: { present: !!wpData, connectionStatus: wordpress.status },
    shopify: { present: !!shData, connectionStatus: shopify.status, canPublish: shopify.canPublish },
  })

  return Response.json({ projects, selected: projectId, counts, articles, wordpress, shopify, platform })
}
