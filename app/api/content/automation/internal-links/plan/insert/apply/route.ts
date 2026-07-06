/**
 * Content automation — POST /api/content/automation/internal-links/plan/insert/apply
 *
 * MANUAL, DRAFT-ONLY apply of approved internal-link plans (Phase 2D.2). Requires
 * a fresh `previewToken`; recomputes it server-side and refuses on any change
 * (stale_preview). Inserts ONLY natural existing-phrase occurrences (no synthetic
 * sentences, never in headings/tables/buttons/nav/existing links), snapshots the
 * draft first for verbatim rollback, and records ONLY actually-inserted links in
 * internal_links_json. Idempotent (already-linked → skip). No-op writes nothing.
 *
 * NOT wired to cron/queue/publish/generation. Only draft articles may be mutated.
 * Never touches brief_notes or anchors_json.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, generatedArticleId, previewToken }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { evaluateApprovedLinks } from '@/lib/content/internal-link-insertion-eval'
import { computePreviewToken, applyNaturalAnchor, sha256 } from '@/lib/content/internal-link-insertion'
import { isUrlAlreadyLinked } from '@/lib/content/internal-links'
import { sanitizeArticleHtml } from '@/lib/content/article-html'

export const dynamic = 'force-dynamic'

interface ArticleRow {
  id: string
  topic_id: string | null
  status: string
  content_html: string | null
  content_markdown: string | null
  internal_links_json: Record<string, unknown>[] | null
}

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown; previewToken?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null
  const previewToken = typeof body.previewToken === 'string' ? body.previewToken : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project, user } = auth
  if (!generatedArticleId) return Response.json({ error: 'generatedArticleId_required' }, { status: 400 })
  if (!previewToken) return Response.json({ error: 'preview_required' }, { status: 409 })

  const { data: artData } = await admin
    .from('generated_articles')
    .select('id, topic_id, status, content_html, content_markdown, internal_links_json')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as ArticleRow | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  if (article.status !== 'draft') return Response.json({ error: 'article_not_draft', status: article.status }, { status: 409 })

  const originalHtml = article.content_html || ''
  const evalRes = await evaluateApprovedLinks(admin, project.id, {
    topicId: article.topic_id,
    contentHtml: originalHtml,
    internalLinksJson: article.internal_links_json,
  })
  const base = { projectId: project.id, generatedArticleId, contentChanged: false }
  if (evalRes.reason) return Response.json({ ...base, applied: 0, skipped: 0, reason: evalRes.reason })

  // Fresh-preview integrity: recompute the token from CURRENT state and compare.
  const recomputed = computePreviewToken({
    generatedArticleId,
    batchId: evalRes.batch!.id,
    contentChecksum: evalRes.contentChecksum,
    linksChecksum: evalRes.linksChecksum,
    cacheScanCompletedAt: evalRes.cacheRow?.scan_completed_at ?? null,
    cacheScannerVersion: evalRes.cacheRow?.scanner_version ?? null,
    wouldInsert: evalRes.wouldInsert,
  })
  if (recomputed !== previewToken) {
    return Response.json({ ...base, applied: 0, skipped: 0, error: 'stale_preview', hint: 're-run preview and use the fresh previewToken' }, { status: 409 })
  }

  // Apply ONLY the token-pinned would_insert links, in order, natural-only.
  const results: { linkId: string; targetUrl: string; anchorText: string; outcome: 'inserted' | 'skipped'; reason: string }[] = []
  const usedWordOffsets: number[] = []
  let html = originalHtml
  for (const w of evalRes.wouldInsert) {
    if (isUrlAlreadyLinked(html, w.targetUrl)) {
      results.push({ linkId: w.linkId, targetUrl: w.targetUrl, anchorText: w.anchorText, outcome: 'skipped', reason: 'already_linked' })
      continue
    }
    const applied = applyNaturalAnchor(html, w.anchorText, w.targetUrl, usedWordOffsets)
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
    return Response.json({ ...base, applied: 0, skipped: skipped.length, reason: 'nothing_inserted', results })
  }

  const finalHtml = sanitizeArticleHtml(html)
  const checksumBefore = sha256(originalHtml)
  const checksumAfter = sha256(finalHtml)
  const nowIso = new Date().toISOString()

  // 1) Snapshot the ORIGINAL draft (verbatim rollback).
  const { data: snapRow } = await admin
    .from('generated_article_content_snapshots')
    .insert({
      user_id: user.id,
      project_id: project.id,
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
  await admin.from('generated_articles').update({ content_html: finalHtml, internal_links_json: nextLinksJson, updated_at: nowIso }).eq('id', generatedArticleId).eq('project_id', project.id)

  // 4) Stamp link insertion outcomes + audit rows.
  for (const r of inserted) {
    await admin.from('article_internal_link_plan_links').update({ insertion_status: 'inserted', insertion_reason: 'inserted', inserted_at: nowIso, inserted_article_id: generatedArticleId, inserted_anchor_text: r.anchorText, updated_at: nowIso }).eq('id', r.linkId).eq('project_id', project.id)
  }
  for (const r of skipped) {
    await admin.from('article_internal_link_plan_links').update({ insertion_status: 'skipped', insertion_reason: r.reason, updated_at: nowIso }).eq('id', r.linkId).eq('project_id', project.id)
  }
  try {
    await admin.from('article_internal_link_insertions').insert(results.map((r) => ({
      user_id: user.id, project_id: project.id, batch_id: evalRes.batch!.id, link_id: r.linkId,
      generated_article_id: generatedArticleId, outcome: r.outcome, reason: r.reason,
      anchor_text: r.anchorText, target_url: r.targetUrl,
      checksum_before: checksumBefore, checksum_after: r.outcome === 'inserted' ? checksumAfter : checksumBefore,
    })))
    await admin.from('article_internal_link_plan_batches').update({ inserted_count: inserted.length, skipped_count: skipped.length, updated_at: nowIso }).eq('id', evalRes.batch!.id)
  } catch (e) {
    console.warn('[ilp-apply] audit/counter write skipped', { message: e instanceof Error ? e.message : String(e) })
  }

  return Response.json({ ...base, contentChanged: true, applied: inserted.length, skipped: skipped.length, snapshotId, checksumBefore, checksumAfter, results })
}
