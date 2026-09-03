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
import { resolveArticleDepth, DEPTH_PROMPT_LABEL } from '@/lib/content/article-depth'
import { loadApprovedPlanAnchors } from '@/lib/content/internal-link-generation-guidance'
import { autoApplyApprovedLinksToDraft, type AutoApplyResult } from '@/lib/content/internal-link-apply'
import { isInternalLinkAutoInsertAfterManualGenerationEnabled } from '@/lib/content/api-auth'
import { assertContentGenerationAllowedForUser } from '@/lib/content/entitlement-guard'
import { getUserEntitlement } from '@/lib/subscription'
import { resolveCurrentUsagePeriod } from '@/lib/billing/usage-period'
import { reserveUsage, finalizeArticleGeneration, releaseUsageReservation } from '@/lib/billing/usage-reservations'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'

type Admin = ReturnType<typeof createAdminClient>

// Phase 3J — how many approved plan anchors are threaded into the generation
// prompt as writing requirements (was 3 — the 4th+ selected link never reached
// the model and was later skipped as "anchor not found").
const MAX_PLANNED_ANCHOR_GUIDANCE = 6

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
  // Blocker D fix — the project owner is Shopify-billing-required (no
  // verified Shopify App Pricing plan). Checked BEFORE any Gemini call.
  | { ok: false; kind: 'billing_required' }
  // The entitlement could not be DETERMINED (governance, connection or Partner
  // API failure). An outage, not a verdict: retryable, and never presented to
  // the merchant as "buy a plan". No provider call is made in either state.
  | { ok: false; kind: 'entitlement_unavailable'; detail: string }
  // Phase 3 — the account's article allowance for the current billing
  // period is exhausted. Checked BEFORE any Gemini call, via an atomic
  // reservation (lib/billing/usage-reservations.ts) — never a plain
  // count-then-insert (race-prone under concurrent generation jobs).
  | { ok: false; kind: 'quota_exceeded' }
  // The account's billing period could not be RESOLVED — a different fact
  // entirely from an exhausted allowance, and the two must never be conflated.
  // Production incident: a Shopify managed-pricing TRIAL reports an active
  // subscription with no billing cycle, no period resolved, and the merchant
  // was told their 20-article allowance was used up before generating one.
  // Nothing is reserved and no Gemini call is made; it is retryable.
  | { ok: false; kind: 'usage_period_unavailable' }
  // A DIFFERENT in-flight attempt already holds this topic's reservation
  // (concurrent retry of the same logical request) — transient, safe to
  // retry shortly; never a permanent failure.
  | { ok: false; kind: 'generation_in_progress' }
  | { ok: false; kind: 'reservation_error'; message: string }

export type GenerateForTopicResult = GenerateForTopicSuccess | GenerateForTopicFailure

/**
 * The two PROVIDER calls this function makes, injectable so the generation
 * path can be exercised end-to-end in a test without reaching Gemini.
 *
 * Production never passes this — the defaults below are the real
 * implementations, and every existing call site is a two-argument call that
 * behaves exactly as before. It exists because the alternative proofs are not
 * proofs: a global `fetch` stub does NOT intercept @google/generative-ai (the
 * SDK reaches the network anyway), and a test that merely counts its own
 * bookkeeping after reserveUsage succeeds proves nothing about whether
 * generation was ever reached.
 */
export interface ArticleGenerationDeps {
  generate: typeof generateValidatedArticle
  createFeaturedImage: typeof createFeaturedImageForArticle
  /**
   * The clock, threaded to EVERY time-dependent decision this function makes:
   * the entitlement gate's Shopify cache-freshness check, getUserEntitlement's
   * trial/period expiry, and the usage-period resolution (including the Shopify
   * trial's "is it still in the future?" test). Without it a behavioural test
   * pinned to a fixed trial date silently starts failing once the wall clock
   * passes that date.
   */
  now: () => Date
}
const REAL_GENERATION_DEPS: ArticleGenerationDeps = {
  generate: generateValidatedArticle,
  createFeaturedImage: createFeaturedImageForArticle,
  now: () => new Date(),
}

/**
 * Generate + persist an article draft for a topic. `userId` is stamped as
 * generated_articles.user_id (the project owner). Ownership is the caller's job.
 */
export async function generateArticleForTopic(
  admin: Admin,
  opts: { topicId: string; userId: string; autoApplyInternalLinks?: boolean },
  deps: ArticleGenerationDeps = REAL_GENERATION_DEPS,
): Promise<GenerateForTopicResult> {
  const { topicId, userId } = opts

  // Blocker D fix — the CENTRAL gate for article + auto-image generation.
  // This is the ONE function every entry point (manual per-topic generate,
  // the manual per-item route, the cron job, the "run automation now"
  // route, and every retry) funnels through — see generatePoolItem() below,
  // which is itself the sole caller reachable from cron/queue/retry. Checked
  // FIRST, before any DB read beyond what's needed, and before any Gemini
  // call (generateValidatedArticle / createFeaturedImageForArticle).
  const gate = await assertContentGenerationAllowedForUser(admin, userId, deps.now)
  if (!gate.allowed) {
    return gate.reason === 'entitlement_unavailable'
      ? { ok: false, kind: 'entitlement_unavailable', detail: gate.detail }
      : { ok: false, kind: 'billing_required' }
  }

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

  // Phase 3D — resolve article depth + target word range. Manual override
  // (brief_notes flag) wins; otherwise auto-classify from the topic. Drives length
  // and structure guidance; back-compat when absent (auto-classify → standard).
  const depth = resolveArticleDepth(
    { title: String(t.topic || ''), primaryKeyword: (t.primary_keyword as string) ?? null, secondaryKeywords: Array.isArray(t.secondary_keywords) ? (t.secondary_keywords as string[]) : [], searchIntent: (t.search_intent as string) ?? null, briefNotes: decodedNotes.notes },
    decodedNotes.flags.articleDepth,
  )
  console.log('[content-article-generation] depth', { topicId, depth: depth.depth, auto: depth.auto, words: `${depth.minWords}-${depth.maxWords}` })

  // Phase 2F.2: fold the topic's APPROVED saved-plan anchors into the phrase-only
  // internal-link guidance (stale plans skipped). Guidance ONLY — the model is
  // asked to include the phrase as plain text; nothing here inserts <a> tags or
  // writes internal_links_json. If none/stale, generation proceeds unchanged.
  //
  // Phase 3J — the cap was 3, so with 4+ user-approved links the extra anchors
  // never reached the prompt and died at apply time as "anchor not found".
  // EVERY approved anchor now flows (bounded at 6 to keep placement natural).
  const approvedGuidance = await loadApprovedPlanAnchors(
    admin, projectId, topicId,
    { title: String(t.topic || ''), primaryKeyword: (t.primary_keyword as string) ?? null },
    MAX_PLANNED_ANCHOR_GUIDANCE,
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
    targetWordMin: depth.minWords,
    targetWordMax: depth.maxWords,
    depthKind: depth.depth,
    depthLabel: DEPTH_PROMPT_LABEL[depth.depth],
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

  // Phase 3 — atomic article-credit reservation, taken immediately before
  // the Gemini call (never before it — validation failures above never
  // touch the ledger). Admins bypass the ledger entirely (same convention as
  // every other quota check in this app) and fall through to a plain insert.
  const entitlement = await getUserEntitlement(userId, admin, deps.now)
  let reservationId: string | null = null
  let reservationToken: string | null = null
  if (!entitlement.isAdmin) {
    const period = await resolveCurrentUsagePeriod(admin, userId, deps.now)
    // NOT quota_exceeded. No period means we could not determine WHICH window
    // to count against — the allowance itself is untouched, nothing is
    // reserved, and the caller should retry rather than tell the merchant they
    // are out of articles.
    if (!period) return { ok: false, kind: 'usage_period_unavailable' }
    const reservation = await reserveUsage(admin, {
      userId, projectId: null, usageType: 'article', amount: 1,
      periodStart: period.start, periodEnd: period.end,
      limit: entitlement.limits.maxArticlesPerPeriodAccountWide,
      idempotencyKey: `topic:${topicId}`,
    })
    if (reservation.outcome === 'quota_exceeded') return { ok: false, kind: 'quota_exceeded' }
    if (reservation.outcome === 'already_reserved') return { ok: false, kind: 'generation_in_progress' }
    if (reservation.outcome === 'already_consumed') {
      // A retry of a request that already produced an article — return the
      // existing outcome, never regenerate or consume a second credit.
      if (reservation.articleId) {
        return { ok: true, articleId: reservation.articleId, warnings: [], audit: null, imageGenerated: false }
      }
      return { ok: false, kind: 'reservation_error', message: 'already_consumed with no article reference' }
    }
    if (reservation.outcome === 'error' || reservation.outcome === 'project_not_owned') {
      return { ok: false, kind: 'reservation_error', message: reservation.outcome === 'error' ? reservation.message : reservation.outcome }
    }
    reservationId = reservation.reservationId
    reservationToken = reservation.reservationToken
  }

  const gen = await deps.generate(brief)
  if ('error' in gen) {
    const reason = gen.reason || 'unknown'
    console.log(`[content-article-generation] failed reason=${reason} attempts=${gen.attempts}`)
    if (reservationId && reservationToken) await releaseUsageReservation(admin, { reservationId, userId, reservationToken, reason: `generation_failed:${reason}` })
    return { ok: false, kind: 'generation', reason, audit: gen.audit ?? null, attempts: gen.attempts }
  }

  const article = gen.article
  const safeHtml = gen.safeHtml

  const baseRow = {
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
    wp_connection_id: (wpConn as { id?: string } | null)?.id ?? null,
  }

  const baseSlug = gen.slug || `article-${Date.now().toString(36)}`
  let inserted: { id: string } | null = null
  let lastError: { code?: string; message?: string } | null = null

  if (reservationId && reservationToken) {
    // Phase 3 — ATOMIC: the RPC persists generated_articles AND consumes the
    // reservation in ONE transaction (either both happen or neither does),
    // closing the "article exists without a consumed credit" gap. A
    // 'slug_conflict' rolls back the whole attempt (reservation stays
    // 'reserved') — safe to retry with the next slug candidate.
    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`.slice(0, 90)
      const result = await finalizeArticleGeneration(admin, { reservationId, userId, reservationToken, article: { ...baseRow, slug } })
      if (result.outcome === 'consumed') { inserted = { id: result.articleId }; break }
      if (result.outcome === 'slug_conflict') { lastError = { code: '23505', message: 'slug_conflict' }; continue }
      lastError = { message: result.outcome === 'error' ? result.message : result.outcome }
      break
    }
    if (!inserted) {
      await releaseUsageReservation(admin, { reservationId, userId, reservationToken, reason: 'insert_failed' })
      console.error('[content-article-generation] atomic insert failed', { message: lastError?.message })
      return { ok: false, kind: 'insert_failed' }
    }
  } else {
    // Admin bypass — no ledger involvement.
    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`.slice(0, 90)
      const { data, error } = await admin.from('generated_articles')
        .insert({ ...baseRow, slug, user_id: userId, status: 'draft', updated_at: new Date().toISOString() })
        .select('id').single()
      if (!error && data) { inserted = data as { id: string }; break }
      lastError = error as { code?: string; message?: string }
      if ((error as { code?: string })?.code !== '23505') break
    }
    if (!inserted) {
      console.error('[content-article-generation] insert failed', { code: lastError?.code, message: lastError?.message })
      return { ok: false, kind: 'insert_failed' }
    }
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
      const img = await deps.createFeaturedImage(admin, inserted.id)
      imageGenerated = !('error' in img)
      if ('error' in img) console.warn('[content-article-generation] auto image skipped', { articleId: inserted.id, reason: img.error })
    } catch (e) {
      console.warn('[content-article-generation] auto image threw', { message: e instanceof Error ? e.message : String(e) })
    }
  }

  return { ok: true, articleId: inserted.id, warnings: article.warnings, audit: gen.audit, imageGenerated, autoInternalLinks }
}
