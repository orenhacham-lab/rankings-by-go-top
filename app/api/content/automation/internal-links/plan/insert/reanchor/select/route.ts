/**
 * Content automation — POST …/internal-links/plan/insert/reanchor/select
 *
 * Phase 3B.4. Records a user-chosen SAFE alternative anchor for approved links
 * whose original anchor is missing from the draft: it updates the plan link's
 * anchor_text ONLY. It inserts nothing into the article — the user then re-runs
 * the existing preview → confirmed apply flow. Owner + flag gated.
 *
 * Every selection is re-validated server-side against a fresh suggestReanchors()
 * pass: an anchor is accepted only if it is one of THAT link's currently-offered
 * safe in-draft alternatives (vetted anchor phrase + present as natural prose).
 * Arbitrary/invented anchor text is rejected, so the article is never linked
 * against text that does not exist in it.
 *
 * Body: { projectId, generatedArticleId, selections: [{ linkId, anchorText }] }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getLatestBatchForTopic } from '@/lib/content/internal-link-plan-store'
import { suggestReanchors } from '@/lib/content/internal-link-reanchor'

export const dynamic = 'force-dynamic'

interface Selection { linkId: string; anchorText: string }

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown; selections?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null
  const rawSelections = Array.isArray(body.selections) ? body.selections : []

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth
  if (!generatedArticleId) return Response.json({ error: 'generatedArticleId_required' }, { status: 400 })

  const selections: Selection[] = rawSelections
    .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
    .filter((s) => typeof s.linkId === 'string' && typeof s.anchorText === 'string' && (s.anchorText as string).trim())
    .map((s) => ({ linkId: s.linkId as string, anchorText: (s.anchorText as string).trim() }))
  if (selections.length === 0) return Response.json({ error: 'no_selections' }, { status: 400 })

  const { data: artData } = await admin
    .from('generated_articles')
    .select('id, topic_id, content_html, internal_links_json')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as { topic_id: string | null; content_html: string | null; internal_links_json: unknown } | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  if (!article.topic_id) return Response.json({ error: 'no_topic' }, { status: 400 })

  const batch = await getLatestBatchForTopic(admin, project.id, article.topic_id)
  if (!batch) return Response.json({ error: 'no_plan_batch' }, { status: 400 })

  // Re-validate every selection against fresh, safe in-draft suggestions so we
  // never write an anchor that isn't a currently-offered safe alternative.
  const res = await suggestReanchors(admin, project.id, {
    topicId: article.topic_id,
    contentHtml: article.content_html || '',
    internalLinksJson: article.internal_links_json,
  })
  const allowedByLink = new Map<string, Set<string>>()
  for (const l of res.links) allowedByLink.set(l.linkId, new Set(l.suggestions.map((s) => s.anchorText.toLowerCase())))

  const nowIso = new Date().toISOString()
  let updated = 0
  const rejected: string[] = []
  for (const sel of selections) {
    const allowed = allowedByLink.get(sel.linkId)
    if (!allowed || !allowed.has(sel.anchorText.toLowerCase())) { rejected.push(sel.linkId); continue }
    // anchor_text update only — status stays 'approved'; no content mutation.
    const { data } = await admin
      .from('article_internal_link_plan_links')
      .update({ anchor_text: sel.anchorText, anchor_source: 'reanchor_from_draft', updated_at: nowIso })
      .eq('project_id', project.id)
      .eq('batch_id', batch.id)
      .eq('id', sel.linkId)
      .eq('status', 'approved')
      .select('id')
    if (((data ?? []) as { id: string }[]).length > 0) updated++
    else rejected.push(sel.linkId)
  }

  return Response.json({ ok: true, updated, rejected, batchId: batch.id })
}
