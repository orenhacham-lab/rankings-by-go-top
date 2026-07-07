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
import { applyNaturalAnchor, existingLinkWordOffsets, sha256, INTERNAL_LINK_APPLY_MIN_WORD_GAP } from '@/lib/content/internal-link-insertion'
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

/**
 * PURE natural-only insertion of `wouldInsert` links into `html` (no I/O).
 * `seedOffsets` seeds the spacing check with the word offsets of links ALREADY
 * in the html so new links keep their distance from existing ones too.
 */
export function applyWouldInsertToHtml(
  html: string,
  wouldInsert: { linkId: string; anchorText: string; targetUrl: string }[],
  seedOffsets: number[] = [],
): { html: string; results: ApplyLinkResult[] } {
  const results: ApplyLinkResult[] = []
  const usedWordOffsets: number[] = [...seedOffsets]
  let cur = html
  for (const w of wouldInsert) {
    if (isUrlAlreadyLinked(cur, w.targetUrl)) {
      results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: w.anchorText, outcome: 'skipped', reason: 'already_linked' })
      continue
    }
    const applied = applyNaturalAnchor(cur, w.anchorText, w.targetUrl, usedWordOffsets, { minWordGap: INTERNAL_LINK_APPLY_MIN_WORD_GAP })
    if (!applied.ok || !applied.html) {
      results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: w.anchorText, outcome: 'skipped', reason: applied.skipReason || 'no_safe_placement' })
      continue
    }
    cur = applied.html
    if (applied.wordOffset !== undefined) usedWordOffsets.push(applied.wordOffset)
    results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: applied.anchorText || w.anchorText, outcome: 'inserted', reason: 'inserted' })
  }
  return { html: cur, results }
}

/** Append inserted links to an internal_links_json array (deduped by anchor+url). */
function mergeLinksJson(existing: Record<string, unknown>[], inserted: ApplyLinkResult[]): Record<string, unknown>[] {
  const additions = inserted
    .map((r) => ({ anchor: r.anchorText, url: r.targetUrl, source: 'planned' as const }))
    .filter((e) => !existing.some((x) => String((x as { anchor?: unknown }).anchor ?? '').toLowerCase() === e.anchor.toLowerCase() && String((x as { url?: unknown }).url ?? '') === e.url))
  return [...existing, ...additions]
}

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

  const { html, results } = applyWouldInsertToHtml(originalHtml, evalRes.wouldInsert, existingLinkWordOffsets(originalHtml))

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
  const nextLinksJson = mergeLinksJson(Array.isArray(article.internal_links_json) ? article.internal_links_json : [], inserted)

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
  // Phase 2J.1 multi-pass diagnostics
  passes: number
  appliedByPass: number[]
  remainingWouldInsertAfterFinalPass: number
  finalReasons: string[]
  insertedAnchors: string[]
}

interface AutoArticleRow { id: string; topic_id: string | null; status: string; content_html: string | null; content_markdown: string | null; internal_links_json: Record<string, unknown>[] | null }

const AUTO_APPLY_MAX_PASSES = 3

const emptyAuto = (attempted: boolean, reasons: string[]): AutoApplyResult => ({
  enabled: true, attempted, applied: 0, skipped: 0, reasons, snapshotId: null,
  passes: 0, appliedByPass: [], remainingWouldInsertAfterFinalPass: 0, finalReasons: reasons, insertedAnchors: [],
})

/**
 * Phase 2J.1 — auto-insert approved links into a freshly-generated DRAFT, running
 * MULTIPLE passes until no would_insert remains (or no progress / max passes), so
 * the draft ends in a stable state where a fresh preview shows only already-linked
 * / legitimately-skipped items. Reuses evaluateApprovedLinks + the shared pure
 * insertion; identical safety to manual apply. Draft-only. Never throws.
 *
 * Rollback stays safe: a SINGLE snapshot of the ORIGINAL (pre-auto-insert) draft
 * is written once, and all passes are persisted as one final content update — so
 * rollback restores the whole auto-insert session, not just the last pass.
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
    if (!article) return emptyAuto(false, ['article_not_found'])
    if (article.status !== 'draft') return emptyAuto(false, ['article_not_draft'])

    const originalHtml = article.content_html || ''
    const originalJson = Array.isArray(article.internal_links_json) ? article.internal_links_json : []

    let currentHtml = originalHtml
    let currentJson = originalJson
    const insertedResults: ApplyLinkResult[] = []
    const appliedByPass: number[] = []
    let finalEval: EvalResult | null = null
    let passes = 0

    for (let pass = 0; pass < AUTO_APPLY_MAX_PASSES; pass++) {
      const evalRes = await evaluateApprovedLinks(admin, projectId, { topicId: article.topic_id, contentHtml: currentHtml, internalLinksJson: currentJson })
      finalEval = evalRes
      if (evalRes.reason) { if (insertedResults.length === 0) return emptyAuto(true, [evalRes.reason]); break }
      passes++
      if (evalRes.wouldInsert.length === 0) break
      const { html: newHtml, results } = applyWouldInsertToHtml(currentHtml, evalRes.wouldInsert, existingLinkWordOffsets(currentHtml))
      const insertedThisPass = results.filter((r) => r.outcome === 'inserted')
      appliedByPass.push(insertedThisPass.length)
      if (insertedThisPass.length === 0) break
      currentHtml = sanitizeArticleHtml(newHtml)
      currentJson = mergeLinksJson(currentJson, insertedThisPass)
      insertedResults.push(...insertedThisPass)
    }

    const remainingWouldInsert = finalEval && !finalEval.reason ? finalEval.wouldInsert.length : 0
    const insertedIds = new Set(insertedResults.map((r) => r.linkId))
    const finalSkipped = (finalEval?.items ?? []).filter((i) => i.status === 'skipped' && !insertedIds.has(i.linkId))
    const finalReasons = Array.from(new Set(finalSkipped.map((i) => i.reason).filter((r): r is string => !!r)))

    // Nothing inserted across all passes → no snapshot, no write.
    if (insertedResults.length === 0) {
      return { ...emptyAuto(true, finalReasons.length ? finalReasons : ['nothing_inserted']), passes, appliedByPass, remainingWouldInsertAfterFinalPass: remainingWouldInsert, finalReasons }
    }

    const finalHtml = currentHtml // already sanitized per pass
    const checksumBefore = sha256(originalHtml)
    const checksumAfter = sha256(finalHtml)
    const nowIso = new Date().toISOString()
    const batchId = finalEval?.batch?.id ?? null

    // 1) ONE snapshot of the ORIGINAL draft → rollback restores the whole session.
    const { data: snapRow } = await admin
      .from('generated_article_content_snapshots')
      .insert({
        user_id: userId, project_id: projectId, generated_article_id: generatedArticleId, batch_id: batchId,
        reason: 'internal_link_auto_apply', content_html_before: originalHtml, content_markdown_before: article.content_markdown,
        internal_links_json_before: article.internal_links_json, article_status_before: article.status, checksum_before: checksumBefore,
      })
      .select('id')
      .single()
    const snapshotId = (snapRow as { id: string } | null)?.id ?? null

    // 2) Persist final html + merged json ONCE.
    await admin.from('generated_articles').update({ content_html: finalHtml, internal_links_json: currentJson, updated_at: nowIso }).eq('id', generatedArticleId).eq('project_id', projectId)

    // 3) Stamp inserted + skipped links, audit rows.
    for (const r of insertedResults) {
      await admin.from('article_internal_link_plan_links').update({ insertion_status: 'inserted', insertion_reason: 'inserted', inserted_at: nowIso, inserted_article_id: generatedArticleId, inserted_anchor_text: r.anchorText, updated_at: nowIso }).eq('id', r.linkId).eq('project_id', projectId)
    }
    for (const i of finalSkipped) {
      await admin.from('article_internal_link_plan_links').update({ insertion_status: 'skipped', insertion_reason: i.reason ?? 'skipped', updated_at: nowIso }).eq('id', i.linkId).eq('project_id', projectId)
    }
    try {
      const auditRows = [
        ...insertedResults.map((r) => ({ user_id: userId, project_id: projectId, batch_id: batchId, link_id: r.linkId, generated_article_id: generatedArticleId, outcome: 'inserted' as const, reason: 'inserted', anchor_text: r.anchorText, target_url: r.targetUrl, checksum_before: checksumBefore, checksum_after: checksumAfter })),
        ...finalSkipped.map((i) => ({ user_id: userId, project_id: projectId, batch_id: batchId, link_id: i.linkId, generated_article_id: generatedArticleId, outcome: 'skipped' as const, reason: i.reason ?? 'skipped', anchor_text: i.anchorText, target_url: i.targetUrl, checksum_before: checksumBefore, checksum_after: checksumBefore })),
      ]
      if (auditRows.length) await admin.from('article_internal_link_insertions').insert(auditRows)
      if (batchId) await admin.from('article_internal_link_plan_batches').update({ inserted_count: insertedResults.length, skipped_count: finalSkipped.length, updated_at: nowIso }).eq('id', batchId)
    } catch (e) {
      console.warn('[ilp-auto-apply] audit/counter write skipped', { message: e instanceof Error ? e.message : String(e) })
    }

    const insertedAnchors = insertedResults.map((r) => r.anchorText)
    return {
      enabled: true, attempted: true, applied: insertedResults.length, skipped: finalSkipped.length,
      reasons: finalReasons, snapshotId, passes, appliedByPass, remainingWouldInsertAfterFinalPass: remainingWouldInsert, finalReasons, insertedAnchors,
    }
  } catch (e) {
    console.warn('[ilp-auto-apply] failed (article left as plain draft)', { generatedArticleId, message: e instanceof Error ? e.message : String(e) })
    return emptyAuto(true, ['auto_apply_error'])
  }
}
