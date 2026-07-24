/**
 * Content-automation — headless "generate one queued item" service (Phase 5).
 *
 * Atomically claims a queued (or, on retry, failed/quality_check_failed) pool
 * item, generates ONE article via the shared generation core (no session, no
 * HTTP route), runs the quality gate, and writes the item + article status.
 * Idempotent: it never creates a duplicate article for a topic that already has
 * one, and a second concurrent run is a no-op. NO WordPress publishing here.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateArticleForTopic } from '@/lib/content/article-generation'
import { TRANSIENT_GEN_REASONS } from '@/lib/content/gemini-article'
import { runQualityGate } from '@/lib/content/automation/quality-gate'

type Admin = ReturnType<typeof createAdminClient>

// generateValidatedArticle reasons that mean "content quality" vs. "model/transport".
const QUALITY_REASONS = new Set(['article_quality_gate_failed', 'required_anchor_missing'])

/** Max total processing attempts per item before it stays 'failed' for a human. */
export const AUTOMATION_MAX_ATTEMPTS = Math.max(1, Number(process.env.AUTOMATION_MAX_ATTEMPTS) || 3)

export interface GenerateItemResult {
  itemId: string
  status: string
  articleId: string | null
  reason?: string
  noop?: 'already_claimed' | 'reconciled' | 'already_generated' | 'item_not_found' | 'max_attempts'
}

interface ItemRow {
  id: string
  project_id: string
  topic_id: string | null
  article_id: string | null
  status: string
  attempts: number
}

const nowIso = () => new Date().toISOString()

async function finalize(admin: Admin, itemId: string, status: string, lastError: string | null, attempts?: number): Promise<void> {
  const patch: Record<string, unknown> = { status, last_error: lastError, locked_at: null, updated_at: nowIso() }
  // Phase 3G.2 — roll the attempt counter back for transient provider failures so a
  // Gemini quota/timeout blip doesn't consume the retry budget.
  if (typeof attempts === 'number') patch.attempts = attempts
  await admin.from('article_pool_items').update(patch).eq('id', itemId)
}

async function loadArticle(admin: Admin, articleId: string) {
  const { data } = await admin.from('generated_articles').select('id, title, content_html, slug, status').eq('id', articleId).maybeSingle()
  return (data as { id: string; title: string | null; content_html: string | null; slug: string | null; status: string } | null) ?? null
}

/** Run the gate on an existing article + write item/article status. */
async function gateAndFinalize(admin: Admin, itemId: string, article: { id: string; title: string | null; content_html: string | null; slug: string | null }): Promise<GenerateItemResult> {
  const gate = runQualityGate(article)
  if (gate.ok) {
    // Area E — reset the shared attempt counter at the generated transition.
    // Generation and publishing share article_pool_items.attempts + the same
    // AUTOMATION_MAX_ATTEMPTS cap. Once an item is successfully generated, the
    // publish phase must start with a FULL retry budget instead of inheriting
    // the attempts already consumed by generation (which could otherwise leave a
    // freshly-generated item with 0 publish retries). No new column.
    await admin.from('article_pool_items').update({ article_id: article.id, status: 'generated', attempts: 0, last_error: null, locked_at: null, updated_at: nowIso() }).eq('id', itemId)
    return { itemId, status: 'generated', articleId: article.id }
  }
  const reason = gate.failures.join(', ')
  await admin.from('article_pool_items').update({ article_id: article.id, status: 'quality_check_failed', last_error: reason, locked_at: null, updated_at: nowIso() }).eq('id', itemId)
  // An article row exists but is unusable → mark it failed (never published).
  await admin.from('generated_articles').update({ status: 'failed', last_error: reason, updated_at: nowIso() }).eq('id', article.id)
  return { itemId, status: 'quality_check_failed', articleId: article.id, reason }
}

export async function generatePoolItem(
  admin: Admin,
  itemId: string,
  opts: { allowRetry?: boolean; autoApplyInternalLinks?: boolean } = {},
): Promise<GenerateItemResult> {
  try {
    const { data: itemData } = await admin
      .from('article_pool_items')
      .select('id, project_id, topic_id, article_id, status, attempts')
      .eq('id', itemId)
      .maybeSingle()
    const item = itemData as ItemRow | null
    if (!item) return { itemId, status: 'failed', articleId: null, noop: 'item_not_found' }

    // (D) Already has an article → reconcile status, never regenerate.
    if (item.article_id) {
      const existing = await loadArticle(admin, item.article_id)
      if (existing) {
        const res = await gateAndFinalize(admin, itemId, existing)
        return { ...res, noop: 'already_generated' }
      }
      // Article was deleted — clear the stale link and continue.
      await admin.from('article_pool_items').update({ article_id: null, updated_at: nowIso() }).eq('id', itemId)
    }

    // Retry cap: a failed/quality_check_failed item stops retrying after
    // AUTOMATION_MAX_ATTEMPTS and stays 'failed' (visible for a human) — never
    // an infinite loop. Fresh 'queued' items are unaffected.
    if (opts.allowRetry !== false && ['failed', 'quality_check_failed'].includes(item.status) && (item.attempts ?? 0) >= AUTOMATION_MAX_ATTEMPTS) {
      return { itemId, status: item.status, articleId: item.article_id, noop: 'max_attempts' }
    }

    // (C) Atomic claim: only one worker may flip a claimable item to 'generating'.
    const claimable = opts.allowRetry === false ? ['queued'] : ['queued', 'failed', 'quality_check_failed']
    const { data: claimed } = await admin
      .from('article_pool_items')
      .update({ status: 'generating', locked_at: nowIso(), attempts: (item.attempts ?? 0) + 1, updated_at: nowIso() })
      .eq('id', itemId)
      .in('status', claimable)
      .select('id')
      .maybeSingle()
    if (!claimed) return { itemId, status: item.status, articleId: item.article_id, noop: 'already_claimed' }

    if (!item.topic_id) {
      await finalize(admin, itemId, 'failed', 'topic_missing')
      return { itemId, status: 'failed', articleId: null, reason: 'topic_missing' }
    }

    // (D) Duplicate: this topic already has an article → link it instead.
    const { data: existingForTopic } = await admin
      .from('generated_articles')
      .select('id, title, content_html, slug')
      .eq('topic_id', item.topic_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingForTopic) {
      const res = await gateAndFinalize(admin, itemId, existingForTopic as { id: string; title: string | null; content_html: string | null; slug: string | null })
      return { ...res, noop: 'reconciled' }
    }

    // Resolve the project owner to stamp generated_articles.user_id.
    const { data: proj } = await admin.from('projects').select('user_id').eq('id', item.project_id).maybeSingle()
    const ownerId = (proj as { user_id?: string } | null)?.user_id
    if (!ownerId) {
      await finalize(admin, itemId, 'failed', 'project_owner_missing')
      return { itemId, status: 'failed', articleId: null, reason: 'project_owner_missing' }
    }

    // Generate via the shared core (same path as manual generation). Phase 3G.1 —
    // when the caller opts in (the MANUAL "generate" button on a queued item), the
    // topic's APPROVED internal links are auto-inserted into the draft, exactly like
    // the per-topic manual generate. Cron/scheduled runs do NOT opt in (unchanged).
    const gen = await generateArticleForTopic(admin, { topicId: item.topic_id, userId: ownerId, autoApplyInternalLinks: opts.autoApplyInternalLinks === true })
    if (!gen.ok) {
      let status = 'failed'
      let reason: string = gen.kind
      if (gen.kind === 'required_anchor_missing_url' || gen.kind === 'cta_details_missing') {
        status = 'quality_check_failed'; reason = gen.kind
      } else if (gen.kind === 'generation') {
        status = QUALITY_REASONS.has(gen.reason) ? 'quality_check_failed' : 'failed'
        reason = gen.reason
      }
      // Transient provider failure (Gemini quota/overload/timeout) → keep the retry
      // budget by rolling the attempt counter back to its pre-claim value.
      const transient = gen.kind === 'generation' && TRANSIENT_GEN_REASONS.has(gen.reason)
      await finalize(admin, itemId, status, reason, transient ? (item.attempts ?? 0) : undefined)
      return { itemId, status, articleId: null, reason }
    }

    // (E) Quality gate on the freshly-created article.
    const article = await loadArticle(admin, gen.articleId)
    if (!article) {
      await finalize(admin, itemId, 'failed', 'article_load_failed')
      return { itemId, status: 'failed', articleId: gen.articleId, reason: 'article_load_failed' }
    }
    return await gateAndFinalize(admin, itemId, article)
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'unexpected_error'
    console.error('[automation-generate-item] unexpected', { itemId, message: msg })
    try { await finalize(admin, itemId, 'failed', `unexpected: ${msg}`) } catch { /* ignore */ }
    return { itemId, status: 'failed', articleId: null, reason: 'unexpected_error' }
  }
}
