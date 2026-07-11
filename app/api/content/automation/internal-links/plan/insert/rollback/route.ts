/**
 * Content automation — POST /api/content/automation/internal-links/plan/insert/rollback
 *
 * MANUAL rollback of a draft-only internal-link apply (Phase 2D.2). Restores the
 * draft's content_html / content_markdown / internal_links_json from a snapshot
 * (latest un-restored, or an explicit snapshotId), marks the snapshot restored,
 * and flips the affected inserted links to 'rolled_back'. Draft-only. Safe to
 * call twice (latest-un-restored becomes a no-op once restored).
 *
 * NOT wired to cron/queue/publish/generation. Never touches brief_notes/anchors_json.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, generatedArticleId, snapshotId? }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import type { GeneratedArticleContentSnapshotRow } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown; snapshotId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null
  const snapshotId = typeof body.snapshotId === 'string' ? body.snapshotId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth
  if (!generatedArticleId) return Response.json({ error: 'generatedArticleId_required' }, { status: 400 })

  const { data: artData } = await admin
    .from('generated_articles')
    .select('id, status')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as { id: string; status: string } | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  if (article.status !== 'draft') return Response.json({ error: 'article_not_draft', status: article.status }, { status: 409 })

  // Resolve the snapshot (explicit id, or latest un-restored for this article).
  let snapQuery = admin
    .from('generated_article_content_snapshots')
    .select('*')
    .eq('project_id', project.id)
    .eq('generated_article_id', generatedArticleId)
  snapQuery = snapshotId ? snapQuery.eq('id', snapshotId) : snapQuery.is('restored_at', null)
  const { data: snapData } = await snapQuery.order('created_at', { ascending: false }).limit(1).maybeSingle()
  const snap = snapData as GeneratedArticleContentSnapshotRow | null
  if (!snap) return Response.json({ ok: false, reason: 'no_snapshot', rolledBack: false })

  const nowIso = new Date().toISOString()

  // Restore the draft's content verbatim from the snapshot.
  await admin
    .from('generated_articles')
    .update({
      content_html: snap.content_html_before,
      content_markdown: snap.content_markdown_before,
      internal_links_json: snap.internal_links_json_before,
      updated_at: nowIso,
    })
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)

  // Mark the snapshot restored (idempotent for latest-un-restored).
  await admin.from('generated_article_content_snapshots').update({ restored_at: nowIso }).eq('id', snap.id).eq('project_id', project.id)

  // Flip the links inserted into this article by this batch to 'rolled_back'.
  const { data: flipped } = await admin
    .from('article_internal_link_plan_links')
    .update({ insertion_status: 'rolled_back', updated_at: nowIso })
    .eq('project_id', project.id)
    .eq('inserted_article_id', generatedArticleId)
    .eq('insertion_status', 'inserted')
    .select('id')
  const rolledBackLinkIds = ((flipped ?? []) as { id: string }[]).map((r) => r.id)

  try {
    if (snap.batch_id && rolledBackLinkIds.length) {
      await admin.from('article_internal_link_insertions').insert(rolledBackLinkIds.map((linkId) => ({
        user_id: auth.user.id, project_id: project.id, batch_id: snap.batch_id, link_id: linkId,
        generated_article_id: generatedArticleId, outcome: 'rolled_back' as const, reason: 'rollback',
      })))
    }
  } catch { /* audit best-effort */ }

  return Response.json({ ok: true, rolledBack: true, snapshotId: snap.id, restoredChecksum: snap.checksum_before, rolledBackLinks: rolledBackLinkIds.length })
}
