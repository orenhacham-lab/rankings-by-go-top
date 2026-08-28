/**
 * Content module — POST /api/content/articles/generate
 *
 * Body: { topicId }. The server loads the topic + brief + project context from
 * the DB itself (no client-supplied content — anti-spoofing), generates a full
 * SEO/GEO article via Gemini, sanitizes it, saves it to generated_articles as a
 * draft, records best-effort AI usage, and returns the new article id + anchor
 * warnings.
 *
 * The generation core lives in lib/content/article-generation.ts (shared with
 * the content-automation service). This route keeps its exact previous behavior:
 * ENABLE_CONTENT gate + auth + project ownership, then delegates. Never touches
 * /api/articles or the global articles table. No publish/schedule.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { generateArticleForTopic } from '@/lib/content/article-generation'

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: { topicId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.topicId) {
    return Response.json({ error: 'topicId is required' }, { status: 400 })
  }

  // Load the topic (service role), then verify ownership via its project_id.
  const admin = (await import('@/lib/supabase/admin')).createAdminClient()
  const { data: topic, error: topicError } = await admin
    .from('article_topics')
    .select('project_id')
    .eq('id', body.topicId)
    .maybeSingle()

  if (topicError) {
    if ((topicError as { code?: string }).code === '42P01') {
      return Response.json({ error: 'Content module not fully migrated on the server.' }, { status: 503 })
    }
    console.error('[content-article-generation] topic load failed:', topicError.message)
    return Response.json({ error: 'Failed to load topic' }, { status: 500 })
  }
  if (!topic) return Response.json({ error: 'Topic not found' }, { status: 404 })

  const auth = await authContentProject((topic as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Manual "generate now" opts INTO Phase 2F.3 auto-apply (still gated by the
  // server flag, default OFF). The automation/cron path does NOT pass this.
  const result = await generateArticleForTopic(auth.admin, { topicId: body.topicId, userId: auth.user.id, autoApplyInternalLinks: true })

  if (result.ok) {
    return Response.json({ articleId: result.articleId, warnings: result.warnings, audit: result.audit, imageGenerated: result.imageGenerated, autoInternalLinks: result.autoInternalLinks })
  }

  switch (result.kind) {
    case 'topic_not_found':
      return Response.json({ error: 'Topic not found' }, { status: 404 })
    case 'required_anchor_missing_url':
      console.log('[content-article-generation] failed reason=required_anchor_missing_url')
      return Response.json({ error: 'Article generation failed', reason: 'required_anchor_missing_url' }, { status: 400 })
    case 'cta_details_missing':
      console.log('[content-article-generation] failed reason=cta_details_missing')
      return Response.json({ error: 'Article generation failed', reason: 'cta_details_missing' }, { status: 400 })
    case 'generation': {
      const qualityGate = result.reason === 'article_quality_gate_failed' || result.reason === 'required_anchor_missing'
      return Response.json(
        { error: 'article_quality_gate_failed', reason: result.reason, audit: result.audit ?? null, generationAttempts: result.attempts },
        { status: qualityGate ? 422 : 502 },
      )
    }
    case 'billing_required':
      return Response.json({ error: 'Shopify billing required', reason: 'shopify_billing_required' }, { status: 403 })
    case 'quota_exceeded':
      return Response.json({ error: 'Article quota exceeded', reason: 'quota_exceeded' }, { status: 429 })
    case 'generation_in_progress':
      return Response.json({ error: 'A generation for this topic is already in progress', reason: 'generation_in_progress' }, { status: 409 })
    case 'reservation_error':
      console.error('[content-article-generation] reservation_error', { message: result.message })
      return Response.json({ error: 'Failed to reserve article credit' }, { status: 500 })
    case 'insert_failed':
    default:
      return Response.json({ error: 'Failed to save article' }, { status: 500 })
  }
}
