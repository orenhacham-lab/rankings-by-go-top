/**
 * Content module — /api/content/articles/:id
 *
 * GET   → article (safe fields) + live anchor validation.
 * PATCH → edit article fields and/or transition status (draft/ready).
 *
 * Gated by ENABLE_CONTENT. Ownership via the article's project_id. Sanitizes
 * content HTML on write. "ready" is blocked server-side while required anchors
 * are missing. Never touches /api/articles or the global articles table. Does
 * NOT modify wp_post_id/wp_post_url (no publish here).
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeArticleHtml, slugify } from '@/lib/content/article-html'
import { validateAnchorPlacement } from '@/lib/content/anchors-check'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'

const EDITABLE_STATUSES = ['draft', 'ready'] as const
const META_TITLE_MAX = 60
const META_DESC_MAX = 155

async function loadOwnedArticle(articleId: string) {
  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('*')
    .eq('id', articleId)
    .maybeSingle()

  if (error) {
    if ((error as { code?: string }).code === '42P01') return { error: 'Content module not initialized', status: 404 as const }
    return { error: 'Failed to load article', status: 500 as const }
  }
  if (!article) return { error: 'Article not found', status: 404 as const }

  const auth = await authContentProject((article as { project_id: string }).project_id)
  if ('error' in auth) return { error: auth.error, status: auth.status }
  return { admin, auth, article: article as Record<string, unknown> }
}

/** Load the anchors from the article's linked topic (for live validation). */
async function loadTopicAnchors(admin: ReturnType<typeof createAdminClient>, topicId: unknown): Promise<ArticleTopicAnchor[]> {
  if (!topicId || typeof topicId !== 'string') return []
  const { data } = await admin.from('article_topics').select('anchors_json').eq('id', topicId).maybeSingle()
  const raw = (data as { anchors_json?: unknown } | null)?.anchors_json
  return Array.isArray(raw) ? (raw as ArticleTopicAnchor[]) : []
}

function sanitizeArticleRow(a: Record<string, unknown>) {
  // Return only safe, editor-relevant fields (no secrets exist on this table).
  return {
    id: a.id,
    project_id: a.project_id,
    topic_id: a.topic_id,
    title: a.title,
    slug: a.slug,
    meta_title: a.meta_title,
    meta_description: a.meta_description,
    excerpt: a.excerpt,
    content_html: a.content_html,
    content_markdown: a.content_markdown,
    faq_json: a.faq_json,
    image_prompt: a.image_prompt,
    status: a.status,
    wp_post_url: a.wp_post_url,
    created_at: a.created_at,
    updated_at: a.updated_at,
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const anchors = await loadTopicAnchors(owned.admin, owned.article.topic_id)
  const validation = validateAnchorPlacement(anchors, String(owned.article.content_html || ''))

  return Response.json({ article: sanitizeArticleRow(owned.article), anchorValidation: validation })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const warnings: string[] = []

  if ('title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return Response.json({ error: 'title is required' }, { status: 400 })
    patch.title = title
  }
  if ('meta_title' in body) {
    const mt = String(body.meta_title ?? '').trim()
    patch.meta_title = mt || null
    if (mt.length > META_TITLE_MAX) warnings.push('meta_title_too_long')
  }
  if ('meta_description' in body) {
    const md = String(body.meta_description ?? '').trim()
    patch.meta_description = md || null
    if (md.length > META_DESC_MAX) warnings.push('meta_description_too_long')
  }
  if ('excerpt' in body) patch.excerpt = String(body.excerpt ?? '').trim() || null
  if ('image_prompt' in body) patch.image_prompt = String(body.image_prompt ?? '').trim() || null
  if ('content_markdown' in body) patch.content_markdown = String(body.content_markdown ?? '') || null
  if ('faq_json' in body) {
    const faq = Array.isArray(body.faq_json)
      ? (body.faq_json as unknown[])
          .map((f) => ({ question: String((f as Record<string, unknown>)?.question ?? '').trim(), answer: String((f as Record<string, unknown>)?.answer ?? '').trim() }))
          .filter((f) => f.question && f.answer)
      : null
    patch.faq_json = faq && faq.length ? faq : null
  }

  // Content is sanitized on every write.
  let nextContentHtml = String(owned.article.content_html || '')
  if ('content_html' in body) {
    const safe = sanitizeArticleHtml(String(body.content_html ?? ''))
    if (!safe) return Response.json({ error: 'content_html is required' }, { status: 400 })
    patch.content_html = safe
    nextContentHtml = safe
  }

  // Slug: sanitize + keep unique per project.
  if ('slug' in body) {
    const nextSlug = slugify(String(body.slug ?? ''))
    if (!nextSlug) return Response.json({ error: 'slug is required' }, { status: 400 })
    patch.slug = nextSlug
  }

  // Status transition (draft/ready). Block "ready" while required anchors miss.
  if ('status' in body) {
    const status = String(body.status ?? '')
    if (!(EDITABLE_STATUSES as readonly string[]).includes(status)) {
      return Response.json({ error: 'invalid status (allowed: draft, ready)' }, { status: 400 })
    }
    if (status === 'ready') {
      const title = String(patch.title ?? owned.article.title ?? '').trim()
      if (!title || !nextContentHtml.trim()) {
        return Response.json({ error: 'Article needs a title and content before it can be marked ready.' }, { status: 400 })
      }
      const anchors = await loadTopicAnchors(owned.admin, owned.article.topic_id)
      const validation = validateAnchorPlacement(anchors, nextContentHtml)
      if (validation.hasBlockingIssues) {
        return Response.json(
          { error: 'required_anchors_missing', anchorValidation: validation },
          { status: 409 }
        )
      }
    }
    patch.status = status
  }

  const write = await owned.admin
    .from('generated_articles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (write.error || !write.data) {
    const code = (write.error as { code?: string })?.code
    if (code === '23505') {
      return Response.json({ error: 'slug_taken' }, { status: 409 })
    }
    console.error('[content-articles] update failed', { code, message: write.error?.message })
    return Response.json({ error: 'Failed to save article' }, { status: 500 })
  }

  const anchors = await loadTopicAnchors(owned.admin, owned.article.topic_id)
  const validation = validateAnchorPlacement(anchors, String((write.data as Record<string, unknown>).content_html || ''))

  return Response.json({ article: sanitizeArticleRow(write.data as Record<string, unknown>), warnings, anchorValidation: validation })
}
