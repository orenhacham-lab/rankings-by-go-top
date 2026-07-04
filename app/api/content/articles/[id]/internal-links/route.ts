/**
 * Content module — /api/content/articles/:id/internal-links
 *
 * GET  → candidate articles in the SAME project to link to. Only PUBLISHED
 *        articles with a public wp_post_url (excluding self). For each candidate
 *        we return SEO-defined anchor data: the target topic's primary keyword,
 *        its secondary keywords, and its saved manual-anchor bank. Anchors are
 *        never inferred from title/body — suggestion + exact-match happen
 *        client-side in the editor.
 *
 * POST → append an editor-approved manual anchor to THIS article's inbound
 *        "anchor bank" (persisted in generated_articles.internal_links_json, an
 *        already-existing jsonb column — no migration). So a manual anchor
 *        approved while editing one article becomes a reusable candidate the
 *        next time this same target is suggested elsewhere.
 *
 * Both gated by ENABLE_CONTENT + project ownership. Never calls WordPress.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeHref, manualAnchorShapeValid } from '@/lib/content/internal-links'

/** Read the saved inbound anchor bank out of a row's internal_links_json. */
function readAnchorBank(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (entry && typeof entry === 'object' && typeof (entry as { anchor?: unknown }).anchor === 'string') {
      const a = ((entry as { anchor: string }).anchor).trim()
      if (a) out.push(a)
    }
  }
  return Array.from(new Set(out))
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!article) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject((article as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Only PUBLISHED articles with a public URL are safe link targets.
  const { data: rows } = await auth.admin
    .from('generated_articles')
    .select('id, title, wp_post_url, topic_id, internal_links_json')
    .eq('project_id', auth.project.id)
    .eq('status', 'published')
    .neq('id', id)
    .not('wp_post_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50)

  const list = (rows ?? []) as {
    id: string
    title: string
    wp_post_url: string | null
    topic_id: string | null
    internal_links_json: unknown
  }[]

  // Keyword + secondary keywords come from the linked topic (no such columns on
  // the article). We never derive anchors from the title or body.
  const topicIds = Array.from(new Set(list.map((r) => r.topic_id).filter((x): x is string => !!x)))
  const kwByTopic: Record<string, { primary: string | null; secondary: string[] }> = {}
  if (topicIds.length) {
    const { data: topics } = await auth.admin
      .from('article_topics')
      .select('id, primary_keyword, secondary_keywords')
      .in('id', topicIds)
    for (const t of (topics ?? []) as { id: string; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
      kwByTopic[t.id] = { primary: t.primary_keyword, secondary: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [] }
    }
  }

  const candidates = list
    .filter((r) => r.wp_post_url)
    .map((r) => {
      const topic = r.topic_id ? kwByTopic[r.topic_id] : undefined
      return {
        id: r.id,
        title: r.title,
        url: normalizeHref(r.wp_post_url as string),
        keyword: topic?.primary ?? null,
        secondaryKeywords: topic?.secondary ?? [],
        manualAnchors: readAnchorBank(r.internal_links_json),
      }
    })

  return Response.json({ candidates })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { anchor?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const anchor = String(body.anchor ?? '').trim()
  if (!anchor || !manualAnchorShapeValid(anchor)) {
    return Response.json({ error: 'invalid_anchor' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: target, error } = await admin
    .from('generated_articles')
    .select('id, project_id, internal_links_json')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!target) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject((target as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const bank = readAnchorBank((target as { internal_links_json?: unknown }).internal_links_json)
  if (!bank.some((a) => a.toLowerCase() === anchor.toLowerCase())) bank.push(anchor)

  const nextJson = bank.map((a) => ({ anchor: a, source: 'manual' as const }))
  const { error: writeErr } = await auth.admin
    .from('generated_articles')
    .update({ internal_links_json: nextJson })
    .eq('id', id)
  if (writeErr) {
    console.error('[internal-links] anchor-bank save failed', { message: writeErr.message })
    return Response.json({ error: 'Failed to save anchor' }, { status: 500 })
  }

  return Response.json({ manualAnchors: bank })
}
