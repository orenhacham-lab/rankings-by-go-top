/**
 * Shared server-side internal-link APPLY engine.
 *
 * The exact natural-only insertion + snapshot + audit + internal_links_json
 * update that the manual apply route performs, extracted so BOTH the manual
 * route (POST …/insert/apply) and the Phase 2F.3 auto-apply-after-generation
 * path run identical, safety-preserving logic — no duplicated insertion code and
 * no internal fetch() of app routes.
 *
 * DRAFT-ONLY, natural-only, idempotent (already-linked → skip), snapshots before
 * mutating, records audit rows, and writes ONLY generated_articles.content_html /
 * internal_links_json. Never publishes, never touches WordPress.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { evaluateApprovedLinks, type EvalResult } from '@/lib/content/internal-link-insertion-eval'
import { applyNaturalAnchor, sha256, INTERNAL_LINK_APPLY_MIN_WORD_GAP } from '@/lib/content/internal-link-insertion'
import { isUrlAlreadyLinked } from '@/lib/content/internal-links'
import { sanitizeArticleHtml } from '@/lib/content/article-html'

type Admin = ReturnType<typeof createAdminClient>

export interface ApplyArticle {
  content_html: string | null
  content_markdown: string | null
  internal_links_json: Record<string, unknown>[] | null
  status: string
}

export interface ApplyLinkResult { linkId: string; targetUrl: string; anchorText: string; outcome: 'inserted' | 'skipped'; reason: string }

export interface ApplyOutcome {
  contentChanged: boolean
  applied: number
  skipped: number
  snapshotId: string | null
  checksumBefore?: string
  checksumAfter?: string
  results: ApplyLinkResult[]
  reason?: 'nothing_inserted'
}

/**
 * Apply the token-pinned `evalRes.wouldInsert` links to a DRAFT. Pure w.r.t.
 * inputs aside from the DB writes; caller is responsible for auth/ownership,
 * draft status, and (for the manual route) previewToken integrity.
 */
export async function applyEvaluatedLinks(
  admin: Admin,
  opts: { projectId: string; userId: string; generatedArticleId: string; article: ApplyArticle; evalRes: EvalResult },
): Promise<ApplyOutcome> {
  const { projectId, userId, generatedArticleId, article, evalRes } = opts
  const originalHtml = article.content_html || ''

  const results: ApplyLinkResult[] = []
  const usedWordOffsets: number[] = []
  let html = originalHtml
  for (const w of evalRes.wouldInsert) {
    if (isUrlAlreadyLinked(html, w.targetUrl)) {
      results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: w.anchorText, outcome: 'skipped', reason: 'already_linked' })
      continue
    }
    const applied = applyNaturalAnchor(html, w.anchorText, w.targetUrl, usedWordOffsets, { minWordGap: INTERNAL_LINK_APPLY_MIN_WORD_GAP })
    if (!applied.ok || !applied.html) {
      results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: w.anchorText, outcome: 'skipped', reason: applied.skipReason || 'no_safe_placement' })
      continue
    }
    html = applied.html
    if (applied.wordOffset !== undefined) usedWordOffsets.push(applied.wordOffset)
    results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: applied.anchorText || w.anchorText, outcome: 'inserted', reason: 'inserted' })
  }

  const inserted = results.filter((r) => r.outcome === 'inserted')
  const skipped = results.filter((r) => r.outcome === 'skipped')

  // No-op: nothing inserted → no snapshot, no article update, no writes.
  if (inserted.length === 0) {
    return { contentChanged: false, applied: 0, skipped: skipped.length, snapshotId: null, results, reason: 'nothing_inserted' }
  }

  const finalHtml = sanitizeArticleHtml(html)
  const checksumBefore = sha256(originalHtml)
  const checksumAfter = sha256(finalHtml)
  const nowIso = new Date().toISOString()

  // 1) Snapshot the ORIGINAL draft (verbatim rollback).
  const { data: snapRow } = await admin
    .from('generated_article_content_snapshots')
    .insert({
      user_id: userId,
      project_id: projectId,
      generated_article_id: generatedArticleId,
      batch_id: evalRes.batch!.id,
      reason: 'internal_link_apply',
      content_html_before: originalHtml,
      content_markdown_before: article.content_markdown,
      internal_links_json_before: article.internal_links_json,
      article_status_before: article.status,
      checksum_before: checksumBefore,
    })
    .select('id')
    .single()
  const snapshotId = (snapRow as { id: string } | null)?.id ?? null

  // 2) internal_links_json — append ONLY actually inserted links (deduped).
  const existing = Array.isArray(article.internal_links_json) ? article.internal_links_json : []
  const additions = inserted
    .map((r) => ({ anchor: r.anchorText, url: r.targetUrl, source: 'planned' as const }))
    .filter((e) => !existing.some((x) => String((x as { anchor?: unknown }).anchor ?? '').toLowerCase() === e.anchor.toLowerCase() && String((x as { url?: unknown }).url ?? '') === e.url))
  const nextLinksJson = [...existing, ...additions]

  // 3) Mutate ONLY the draft's content_html + internal_links_json (never markdown).
  await admin.from('generated_articles').update({ content_html: finalHtml, internal_links_json: nextLinksJson, updated_at: nowIso }).eq('id', generatedArticleId).eq('project_id', projectId)

  // 4) Stamp link insertion outcomes + audit rows.
  for (const r of inserted) {
    await admin.from('article_internal_link_plan_links').update({ insertion_status: 'inserted', insertion_reason: 'inserted', inserted_at: nowIso, inserted_article_id: generatedArticleId, inserted_anchor_text: r.anchorText, updated_at: nowIso }).eq('id', r.linkId).eq('project_id', projectId)
  }
  for (const r of skipped) {
    await admin.from('article_internal_link_plan_links').update({ insertion_status: 'skipped', insertion_reason: r.reason, updated_at: nowIso }).eq('id', r.linkId).eq('project_id', projectId)
  }
  try {
    await admin.from('article_internal_link_insertions').insert(results.map((r) => ({
      user_id: userId, project_id: projectId, batch_id: evalRes.batch!.id, link_id: r.linkId,
      generated_article_id: generatedArticleId, outcome: r.outcome, reason: r.reason,
      anchor_text: r.anchorText, target_url: r.targetUrl,
      checksum_before: checksumBefore, checksum_after: r.outcome === 'inserted' ? checksumAfter : checksumBefore,
    })))
    await admin.from('article_internal_link_plan_batches').update({ inserted_count: inserted.length, skipped_count: skipped.length, updated_at: nowIso }).eq('id', evalRes.batch!.id)
  } catch (e) {
    console.warn('[ilp-apply] audit/counter write skipped', { message: e instanceof Error ? e.message : String(e) })
  }

  return { contentChanged: true, applied: inserted.length, skipped: skipped.length, snapshotId, checksumBefore, checksumAfter, results }
}

export interface AutoApplyResult {
  enabled: boolean
  attempted: boolean
  applied: number
  skipped: number
  reasons: string[]
  snapshotId: string | null
}

interface AutoArticleRow { id: string; topic_id: string | null; status: string; content_html: string | null; content_markdown: string | null; internal_links_json: Record<string, unknown>[] | null }

/**
 * Phase 2F.3 — auto-apply approved links to a freshly-generated DRAFT, once.
 * Reuses evaluateApprovedLinks + applyEvaluatedLinks (identical safety to manual
 * apply). Draft-only. Never throws — on any issue it returns a skip so article
 * generation always succeeds. Never publishes / touches WordPress.
 */
export async function autoApplyApprovedLinksToDraft(
  admin: Admin,
  opts: { projectId: string; userId: string; generatedArticleId: string },
): Promise<AutoApplyResult> {
  const { projectId, userId, generatedArticleId } = opts
  try {
    const { data } = await admin
      .from('generated_articles')
      .select('id, topic_id, status, content_html, content_markdown, internal_links_json')
      .eq('id', generatedArticleId)
      .eq('project_id', projectId)
      .maybeSingle()
    const article = data as AutoArticleRow | null
    if (!article) return { enabled: true, attempted: false, applied: 0, skipped: 0, reasons: ['article_not_found'], snapshotId: null }
    if (article.status !== 'draft') return { enabled: true, attempted: false, applied: 0, skipped: 0, reasons: ['article_not_draft'], snapshotId: null }

    const evalRes = await evaluateApprovedLinks(admin, projectId, {
      topicId: article.topic_id,
      contentHtml: article.content_html || '',
      internalLinksJson: article.internal_links_json,
    })
    if (evalRes.reason) return { enabled: true, attempted: true, applied: 0, skipped: 0, reasons: [evalRes.reason], snapshotId: null }

    const outcome = await applyEvaluatedLinks(admin, { projectId, userId, generatedArticleId, article, evalRes })
    const reasons = outcome.applied === 0
      ? Array.from(new Set(outcome.results.map((r) => r.reason)))
      : outcome.results.filter((r) => r.outcome === 'skipped').map((r) => r.reason)
    return { enabled: true, attempted: true, applied: outcome.applied, skipped: outcome.skipped, reasons, snapshotId: outcome.snapshotId }
  } catch (e) {
    console.warn('[ilp-auto-apply] failed (article left as plain draft)', { generatedArticleId, message: e instanceof Error ? e.message : String(e) })
    return { enabled: true, attempted: true, applied: 0, skipped: 0, reasons: ['auto_apply_error'], snapshotId: null }
  }
}
