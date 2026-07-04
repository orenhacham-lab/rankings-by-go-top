/**
 * Content module — /api/content/articles/:id/internal-links
 *
 * GET  → { candidates, plannedLinks }. `candidates` are other published
 *        articles in the project usable as link targets (keyword + secondary +
 *        merged anchor bank/historical anchors), via the shared loader.
 *        `plannedLinks` are the internal links approved at planning time for
 *        THIS article, decoded from its topic's brief_notes — the editor uses
 *        them for QA/insertion.
 *
 * POST → append an editor-approved manual anchor to THIS article's inbound
 *        anchor bank (generated_articles.internal_links_json — existing column,
 *        no migration), so it becomes a reusable candidate elsewhere.
 *
 * Both gated by ENABLE_CONTENT + project ownership. Never calls WordPress.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { manualAnchorShapeValid } from '@/lib/content/internal-links'
import { loadInternalLinkCandidates, readAnchorBank } from '@/lib/content/internal-link-candidates'
import { decodeBriefNotes } from '@/lib/content/brief-notes'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id, topic_id')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!article) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject((article as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const candidates = await loadInternalLinkCandidates(auth.admin, auth.project.id, id)

  // Approved planned links for THIS article come from its topic's brief_notes.
  let plannedLinks: unknown[] = []
  const topicId = (article as { topic_id?: string | null }).topic_id
  if (topicId) {
    const { data: topic } = await auth.admin.from('article_topics').select('brief_notes').eq('id', topicId).maybeSingle()
    plannedLinks = decodeBriefNotes((topic as { brief_notes?: string } | null)?.brief_notes ?? null).flags.internalLinks
  }

  return Response.json({ candidates, plannedLinks })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { anchor?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const anchor = String(body.anchor ?? '').trim()
  if (!anchor || !manualAnchorShapeValid(anchor)) {
    return Response.json({ error: 'invalid_anchor' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: target, error } = await admin
    .from('generated_articles')
    .select('id, project_id, internal_links_json')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!target) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject((target as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const bank = readAnchorBank((target as { internal_links_json?: unknown }).internal_links_json)
  if (!bank.some((a) => a.toLowerCase() === anchor.toLowerCase())) bank.push(anchor)

  const nextJson = bank.map((a) => ({ anchor: a, source: 'manual' as const }))
  const { error: writeErr } = await auth.admin
    .from('generated_articles')
    .update({ internal_links_json: nextJson })
    .eq('id', id)
  if (writeErr) {
    console.error('[internal-links] anchor-bank save failed', { message: writeErr.message })
    return Response.json({ error: 'Failed to save anchor' }, { status: 500 })
  }

  return Response.json({ manualAnchors: bank })
}
