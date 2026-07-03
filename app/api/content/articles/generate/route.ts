/**
 * Content module — POST /api/content/articles/generate
 *
 * Body: { topicId }. The server loads the topic + brief + project context from
 * the DB itself (no client-supplied content — anti-spoofing), generates a full
 * SEO/GEO article via Gemini, sanitizes it, saves it to generated_articles as a
 * draft, records best-effort AI usage, and returns the new article id + anchor
 * warnings.
 *
 * Gated by ENABLE_CONTENT + auth + project ownership. Never touches /api/articles
 * or the global articles table. No publish/schedule.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { generateArticleWithGemini, type ArticleBrief } from '@/lib/content/gemini-article'
import { sanitizeArticleHtml, slugify } from '@/lib/content/article-html'
import { validateAnchorPlacement } from '@/lib/content/anchors-check'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'

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
    .select('*')
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

  const t = topic as Record<string, unknown>
  const auth = await authContentProject(t.project_id as string)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Project context (safe fields only).
  const { data: project } = await auth.admin
    .from('projects')
    .select('business_name, target_domain, ai_business_profile')
    .eq('id', auth.project.id)
    .maybeSingle()

  const category =
    (project as { ai_business_profile?: { primaryCategory?: string } } | null)?.ai_business_profile?.primaryCategory ?? null

  // Optional WordPress connection (to stamp wp_connection_id; no secrets read).
  const { data: wpConn } = await auth.admin
    .from('wordpress_connections')
    .select('id')
    .eq('project_id', auth.project.id)
    .maybeSingle()

  const anchors = (Array.isArray(t.anchors_json) ? t.anchors_json : []) as ArticleTopicAnchor[]
  const language = String(t.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'

  const brief: ArticleBrief = {
    language,
    topic: String(t.topic || ''),
    primaryKeyword: (t.primary_keyword as string) ?? null,
    secondaryKeywords: Array.isArray(t.secondary_keywords) ? (t.secondary_keywords as string[]) : [],
    searchIntent: (t.search_intent as string) ?? null,
    targetAudience: (t.target_audience as string) ?? null,
    toneOfVoice: (t.tone_of_voice as string) ?? null,
    desiredWordCount: (t.desired_word_count as number) ?? null,
    ctaPreference: (t.cta_preference as string) ?? null,
    briefNotes: (t.brief_notes as string) ?? null,
    anchors,
    businessName: (project as { business_name?: string } | null)?.business_name ?? null,
    domain: (project as { target_domain?: string } | null)?.target_domain ?? null,
    category,
  }

  const gen = await generateArticleWithGemini(brief)
  if ('error' in gen) {
    console.log('[content-article-generation] failed reason=' + gen.error)
    return Response.json({ error: 'Article generation failed', reason: gen.error }, { status: 502 })
  }

  const article = gen.article
  const safeHtml = sanitizeArticleHtml(article.contentHtml)
  if (!safeHtml) {
    console.log('[content-article-generation] failed reason=empty_after_sanitize')
    return Response.json({ error: 'Article generation failed', reason: 'empty_after_sanitize' }, { status: 502 })
  }

  // Anchor validation (live) — informational; article still saves as draft.
  const validation = validateAnchorPlacement(anchors, safeHtml)

  const baseRow = {
    user_id: auth.user.id,
    project_id: auth.project.id,
    topic_id: body.topicId,
    title: article.title,
    meta_title: article.metaTitle || null,
    meta_description: article.metaDescription || null,
    excerpt: article.excerpt || null,
    content_html: safeHtml,
    content_markdown: article.contentMarkdown || null,
    faq_json: article.faq.length ? article.faq : null,
    image_prompt: article.imagePrompt || null,
    status: 'draft' as const,
    wp_connection_id: (wpConn as { id?: string } | null)?.id ?? null,
    updated_at: new Date().toISOString(),
  }

  // Unique slug per project: retry with a numeric suffix on 23505.
  const baseSlug = slugify(article.slug || article.title)
  let inserted: { id: string } | null = null
  let lastError: { code?: string; message?: string } | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`.slice(0, 90)
    const { data, error } = await auth.admin
      .from('generated_articles')
      .insert({ ...baseRow, slug })
      .select('id')
      .single()
    if (!error && data) { inserted = data as { id: string }; break }
    lastError = error as { code?: string; message?: string }
    if ((error as { code?: string })?.code !== '23505') break // only retry slug conflicts
  }

  if (!inserted) {
    console.error('[content-article-generation] insert failed', { code: lastError?.code, message: lastError?.message })
    return Response.json({ error: 'Failed to save article' }, { status: 500 })
  }

  // Best-effort AI usage logging (never blocks).
  if (gen.usage) {
    try {
      await auth.admin.from('ai_usage_logs').insert({
        user_id: auth.user.id,
        project_id: auth.project.id,
        article_id: inserted.id,
        provider: 'gemini',
        model: gen.usage.model,
        input_tokens: gen.usage.inputTokens,
        output_tokens: gen.usage.outputTokens,
        estimated_cost: 0,
        operation: 'article_generation',
        updated_at: new Date().toISOString(),
      })
    } catch (e) {
      console.warn('[content-article-generation] usage log skipped:', e instanceof Error ? e.message : String(e))
    }
  }

  // Mark the topic as used (best-effort).
  try {
    await auth.admin.from('article_topics').update({ status: 'used', updated_at: new Date().toISOString() }).eq('id', body.topicId)
  } catch {
    // non-fatal
  }

  console.log('[content-article-generation] created', {
    articleId: inserted.id,
    projectId: auth.project.id,
    missingRequiredAnchors: validation.missingRequired.length,
  })

  return Response.json({
    articleId: inserted.id,
    warnings: article.warnings,
    anchorValidation: validation,
  })
}
