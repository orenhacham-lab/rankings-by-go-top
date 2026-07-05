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
  let articles: ArticleRow[] = []
  const { data: articlesData, error: articlesError } = await supabase
    .from('generated_articles')
    .select('id, topic_id, title, slug, status, wp_post_id, wp_post_url, wp_featured_media_id, featured_image_url, scheduled_at, published_at, created_at, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1000)

  if (articlesError) {
    // 42P01 = undefined_table (migration not run yet) — degrade gracefully.
    if ((articlesError as { code?: string }).code !== '42P01') {
      console.error('[content overview] articles load failed:', articlesError.message)
    }
  } else {
    articles = (articlesData || []) as ArticleRow[]
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

  return Response.json({ projects, selected: projectId, counts, articles, wordpress })
}
