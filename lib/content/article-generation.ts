/**
 * Shared article-generation core (extracted verbatim from the manual generate
 * route so BOTH the route and the headless automation service reuse ONE code
 * path — no duplicated generation logic).
 *
 * Given a topicId + the user_id to stamp, it: loads the topic + project context,
 * runs the same pre-checks, builds the same ArticleBrief, calls
 * generateValidatedArticle (which owns the audit + repair), inserts the
 * generated_articles draft (unique-slug retry), logs AI usage, marks the topic
 * used, and auto-generates the featured image — exactly as the route did.
 *
 * It performs NO auth/ownership — the caller verifies ownership first (the route
 * via authContentProject; the automation service via the project owner). It uses
 * only the admin (service-role) client, so it is fully headless-safe.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateValidatedArticle, type ArticleBrief } from '@/lib/content/gemini-article'
import { createFeaturedImageForArticle } from '@/lib/content/featured-image'
import { decodeBriefNotes } from '@/lib/content/brief-notes'
import { loadApprovedPlanAnchors } from '@/lib/content/internal-link-generation-guidance'
import { autoApplyApprovedLinksToDraft, type AutoApplyResult } from '@/lib/content/internal-link-apply'
import { isInternalLinkAutoInsertAfterManualGenerationEnabled } from '@/lib/content/api-auth'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'

type Admin = ReturnType<typeof createAdminClient>

export interface GenerateForTopicSuccess {
  ok: true
  articleId: string
  warnings: string[]
  audit: unknown
  imageGenerated: boolean
  // Phase 2F.3 — present only when auto-apply ran (flag ON + opted-in path).
  autoInternalLinks?: AutoApplyResult
}
export type GenerateForTopicFailure =
  | { ok: false; kind: 'topic_not_found' }
  | { ok: false; kind: 'required_anchor_missing_url' }
  | { ok: false; kind: 'cta_details_missing' }
  | { ok: false; kind: 'generation'; reason: string; audit: unknown; attempts: number | undefined }
  | { ok: false; kind: 'insert_failed' }

export type GenerateForTopicResult = GenerateForTopicSuccess | GenerateForTopicFailure

/**
 * Generate + persist an article draft for a topic. `userId` is stamped as
 * generated_articles.user_id (the project owner). Ownership is the caller's job.
 */
export async function generateArticleForTopic(
  admin: Admin,
  opts: { topicId: string; userId: string; autoApplyInternalLinks?: boolean },
): Promise<GenerateForTopicResult> {
  const { topicId, userId } = opts

  const { data: topic } = await admin.from('article_topics').select('*').eq('id', topicId).maybeSingle()
  if (!topic) return { ok: false, kind: 'topic_not_found' }
  const t = topic as Record<string, unknown>
  const projectId = t.project_id as string

  // Project context (safe fields only).
  const { data: project } = await admin
    .from('projects')
    .select('business_name, target_domain, ai_business_profile')
    .eq('id', projectId)
    .maybeSingle()
  const category =
    (project as { ai_business_profile?: { primaryCategory?: string } } | null)?.ai_business_profile?.primaryCategory ?? null

  const { data: wpConn } = await admin.from('wordpress_connections').select('id').eq('project_id', projectId).maybeSingle()

  const anchors = (Array.isArray(t.anchors_json) ? t.anchors_json : []) as ArticleTopicAnchor[]
  const language = String(t.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  const decodedNotes = decodeBriefNotes((t.brief_notes as string) ?? null)

  // Pre-check: a required anchor with no usable URL can never be placed.
  const requiredNoUrl = anchors.some(
    (a) => a.required && (a.anchor_text?.trim() || a.target_url?.trim()) && !/^https?:\/\//i.test((a.target_url || '').trim()),
  )
  if (requiredNoUrl) return { ok: false, kind: 'required_anchor_missing_url' }

  // Pre-check: WhatsApp/phone/contact CTA needs real details (never invented).
  const ctaPref = (t.cta_preference as string) || ''
  if (ctaPref === 'whatsapp' || ctaPref === 'phone' || ctaPref === 'contact') {
    const c = decodedNotes.flags.cta
    const enough = ctaPref === 'whatsapp'
      ? !!(c.whatsapp.trim() || c.url.trim())
      : ctaPref === 'phone'
        ? !!(c.phone.trim() || c.url.trim())
        : !!(c.text.trim() || c.url.trim())
    if (!enough) return { ok: false, kind: 'cta_details_missing' }
  }

  const businessName = (project as { business_name?: string } | null)?.business_name ?? null

  // Phase 2F.2: fold the topic's APPROVED saved-plan anchors into the phrase-only
  // internal-link guidance (max 3, stale plans skipped). Guidance ONLY — the model
  // is asked to include the phrase as plain text; nothing here inserts <a> tags or
  // writes internal_links_json. If none/stale, generation proceeds unchanged.
  const approvedGuidance = await loadApprovedPlanAnchors(
    admin, projectId, topicId,
    { title: String(t.topic || ''), primaryKeyword: (t.primary_keyword as string) ?? null },
    3,
  )
  const plannedInternalAnchors = Array.from(new Set([
    ...decodedNotes.flags.internalLinks.map((l) => l.anchorText),
    ...approvedGuidance.anchors,
  ].map((s) => (s || '').trim()).filter(Boolean)))
  console.log('[content-article-generation] internal-link guidance', {
    topicId,
    approvedPlanLinksLoaded: approvedGuidance.diagnostics.approvedPlanLinksLoaded,
    approvedAnchorsPassedToPrompt: approvedGuidance.diagnostics.approvedAnchorsPassedToPrompt,
    anchorsRequestedInPrompt: plannedInternalAnchors.length,
    planStale: approvedGuidance.diagnostics.planStale,
  })

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
    ctaText: decodedNotes.flags.cta.text || null,
    ctaPhone: decodedNotes.flags.cta.phone || null,
    ctaWhatsApp: decodedNotes.flags.cta.whatsapp || null,
    ctaUrl: decodedNotes.flags.cta.url || null,
    briefNotes: decodedNotes.notes || null,
    includeBrandName: decodedNotes.flags.includeBrandName,
    brandNameToInclude: decodedNotes.flags.brandNameToInclude || businessName,
    includeManualToc: decodedNotes.flags.includeManualToc,
    anchors,
    plannedInternalAnchors,
    businessName,
    domain: (project as { target_domain?: string } | null)?.target_domain ?? null,
    category,
  }

  const gen = await generateValidatedArticle(brief)
  if ('error' in gen) {
    const reason = gen.reason || 'unknown'
    console.log(`[content-article-generation] failed reason=${reason} attempts=${gen.attempts}`)
    return { ok: false, kind: 'generation', reason, audit: gen.audit ?? null, attempts: gen.attempts }
  }

  const article = gen.article
  const safeHtml = gen.safeHtml

  const baseRow = {
    user_id: userId,
    project_id: projectId,
    topic_id: topicId,
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

  const baseSlug = gen.slug || `article-${Date.now().toString(36)}`
  let inserted: { id: string } | null = null
  let lastError: { code?: string; message?: string } | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`.slice(0, 90)
    const { data, error } = await admin.from('generated_articles').insert({ ...baseRow, slug }).select('id').single()
    if (!error && data) { inserted = data as { id: string }; break }
    lastError = error as { code?: string; message?: string }
    if ((error as { code?: string })?.code !== '23505') break
  }
  if (!inserted) {
    console.error('[content-article-generation] insert failed', { code: lastError?.code, message: lastError?.message })
    return { ok: false, kind: 'insert_failed' }
  }

  // Best-effort AI usage logging (never blocks).
  if (gen.usage) {
    try {
      await admin.from('ai_usage_logs').insert({
        user_id: userId,
        project_id: projectId,
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
    await admin.from('article_topics').update({ status: 'used', updated_at: new Date().toISOString() }).eq('id', topicId)
  } catch { /* non-fatal */ }

  console.log('[content-article-generation] created', { articleId: inserted.id, projectId, score: gen.audit.score, warnings: gen.audit.warnings.length })

  // Phase 2J — auto-insert approved internal links into the fresh DRAFT, once,
  // right after insert. Runs when the caller opts in (autoApplyInternalLinks, set
  // ONLY by the manual "generate now" route — cron/queue never opt in) AND the
  // feature is not kill-switched. Default ON for manual generate. Draft-only;
  // best-effort (never fails generation); never publishes / touches WordPress.
  let autoInternalLinks: AutoApplyResult | undefined
  if (opts.autoApplyInternalLinks && isInternalLinkAutoInsertAfterManualGenerationEnabled()) {
    autoInternalLinks = await autoApplyApprovedLinksToDraft(admin, { projectId, userId, generatedArticleId: inserted.id })
    console.log('[content-article-generation] auto internal-links', {
      articleId: inserted.id,
      autoInternalLinksEnabled: true,
      autoInternalLinksAttempted: autoInternalLinks.attempted,
      autoInternalLinksApplied: autoInternalLinks.applied,
      autoInternalLinksSkipped: autoInternalLinks.skipped,
      autoInternalLinksPasses: autoInternalLinks.passes,
      autoInternalLinksAppliedByPass: autoInternalLinks.appliedByPass,
      autoInternalLinksRemainingWouldInsertAfterFinalPass: autoInternalLinks.remainingWouldInsertAfterFinalPass,
      autoInternalLinksFinalReasons: autoInternalLinks.finalReasons,
      autoInternalLinksInsertedAnchors: autoInternalLinks.insertedAnchors,
      snapshotId: autoInternalLinks.snapshotId,
    })
  }

  // Auto-generate a brand-neutral featured image (default ON). Best-effort.
  let imageGenerated = false
  if (process.env.CONTENT_AUTO_FEATURED_IMAGE !== 'false') {
    try {
      const img = await createFeaturedImageForArticle(admin, inserted.id)
      imageGenerated = !('error' in img)
      if ('error' in img) console.warn('[content-article-generation] auto image skipped', { articleId: inserted.id, reason: img.error })
    } catch (e) {
      console.warn('[content-article-generation] auto image threw', { message: e instanceof Error ? e.message : String(e) })
    }
  }

  return { ok: true, articleId: inserted.id, warnings: article.warnings, audit: gen.audit, imageGenerated, autoInternalLinks }
}
