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
import { decodeBriefNotes } from '@/lib/content/brief-notes'
import { runArticleAudit, type AuditResult } from '@/lib/content/article-audit'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'
// Anchor placement is included inside runArticleAudit.

const EDITABLE_STATUSES = ['draft', 'ready'] as const
const META_TITLE_MAX = 60
const META_DESC_MAX = 155

/**
 * Compute the live SEO/GEO audit for an article using its stored fields + the
 * linked topic's brief context (keyword/secondary/language/cta/brand/anchors)
 * and the project's business name. Never persists — computed on demand.
 */
async function computeAudit(admin: ReturnType<typeof createAdminClient>, article: Record<string, unknown>): Promise<AuditResult> {
  const topicId = article.topic_id
  let topic: Record<string, unknown> | null = null
  if (topicId && typeof topicId === 'string') {
    const { data } = await admin
      .from('article_topics')
      .select('primary_keyword, secondary_keywords, language, cta_preference, desired_word_count, brief_notes, anchors_json')
      .eq('id', topicId)
      .maybeSingle()
    topic = (data as Record<string, unknown>) ?? null
  }
  const { data: project } = await admin.from('projects').select('business_name').eq('id', article.project_id as string).maybeSingle()
  const decoded = decodeBriefNotes((topic?.brief_notes as string) ?? null)
  const language = String(topic?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'

  return runArticleAudit({
    language,
    desiredWordCount: (topic?.desired_word_count as number) || 1000,
    primaryKeyword: (topic?.primary_keyword as string) ?? null,
    secondaryKeywords: Array.isArray(topic?.secondary_keywords) ? (topic!.secondary_keywords as string[]) : [],
    ctaPreference: (topic?.cta_preference as string) ?? null,
    ctaDetails: decoded.flags.cta,
    includeBrandName: decoded.flags.includeBrandName,
    brandName: decoded.flags.brandNameToInclude,
    businessName: (project as { business_name?: string } | null)?.business_name ?? null,
    title: String(article.title || ''),
    metaTitle: (article.meta_title as string) ?? null,
    metaDescription: (article.meta_description as string) ?? null,
    slug: String(article.slug || ''),
    excerpt: (article.excerpt as string) ?? null,
    contentHtml: String(article.content_html || ''),
    faq: Array.isArray(article.faq_json) ? (article.faq_json as { question: string; answer: string }[]) : [],
    anchors: Array.isArray(topic?.anchors_json) ? (topic!.anchors_json as ArticleTopicAnchor[]) : [],
  })
}

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
    featured_image_url: a.featured_image_url,
    status: a.status,
    wp_post_id: a.wp_post_id,
    wp_post_url: a.wp_post_url,
    wp_featured_media_id: a.wp_featured_media_id,
    created_at: a.created_at,
    updated_at: a.updated_at,
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const audit = await computeAudit(owned.admin, owned.article)
  return Response.json({ article: sanitizeArticleRow(owned.article), audit })
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
  // Never downgrade a WordPress-PUBLISHED article back to draft/ready — the
  // status change is ignored (all other edited fields still save).
  if ('status' in body && (owned.article as { status?: string }).status === 'published') {
    console.log('[content-articles] status change ignored — already published', { articleId: id })
    delete body.status
  }
  if ('status' in body) {
    const status = String(body.status ?? '')
    if (!(EDITABLE_STATUSES as readonly string[]).includes(status)) {
      return Response.json({ error: 'invalid status (allowed: draft, ready)' }, { status: 400 })
    }
    if (status === 'ready') {
      // Audit the POST-EDIT article; block "ready" while any blocker remains.
      const merged = { ...owned.article, ...patch, content_html: nextContentHtml }
      const audit = await computeAudit(owned.admin, merged)
      if (audit.blockers.length > 0) {
        return Response.json({ error: 'quality_blockers', audit }, { status: 409 })
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

  const audit = await computeAudit(owned.admin, write.data as Record<string, unknown>)
  return Response.json({ article: sanitizeArticleRow(write.data as Record<string, unknown>), warnings, audit })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  // Delete only the generated_articles row. Does NOT touch WordPress, the
  // global articles table, or /api/articles.
  const { error } = await owned.admin.from('generated_articles').delete().eq('id', id)
  if (error) {
    console.error('[content-articles] delete failed', { message: error.message })
    return Response.json({ error: 'Failed to delete article' }, { status: 500 })
  }

  console.log('[content-articles] deleted', { articleId: id, projectId: owned.article.project_id })
  return Response.json({ success: true, project_id: owned.article.project_id })
}
