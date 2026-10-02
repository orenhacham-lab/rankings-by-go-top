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
 * DELETE ?url=… → remove ONE automatic internal link (source 'auto', added at
 *        generation by lib/content/auto-internal-links) from THIS article: the
 *        <a> goes, its words stay, and the entry is marked removed so it is
 *        never listed or added again. Only a link the automatic step added, and
 *        only while the body still has it; the body the customer is editing
 *        gets the same edit in the browser.
 *
 * All gated by ENABLE_CONTENT + project ownership. Never calls WordPress.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { manualAnchorShapeValid } from '@/lib/content/internal-links'
import { loadInternalLinkCandidates, readAnchorBank } from '@/lib/content/internal-link-candidates'
import { decodeBriefNotes } from '@/lib/content/brief-notes'
import { autoEntries, markAutoRemoved } from '@/lib/content/auto-internal-links/entries'
import { removeLink } from '@/lib/link-network/anchor'

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

  const { candidates } = await loadInternalLinkCandidates(auth.admin, auth.project.id, id)

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

  // The article's automatic outgoing links are kept as they are (they are not anchors of the bank).
  const kept = autoEntries((target as { internal_links_json?: unknown }).internal_links_json)
  const nextJson = [...bank.map((a) => ({ anchor: a, source: 'manual' as const })), ...kept]
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params
  const url = new URL(request.url).searchParams.get('url')?.trim() ?? ''
  if (!/^https:\/\//i.test(url) || url.length > 2048) return Response.json({ error: 'invalid_url' }, { status: 400 })

  const admin = createAdminClient()
  const { data: target, error } = await admin
    .from('generated_articles')
    .select('id, project_id, content_html, internal_links_json')
    .eq('id', id)
    .maybeSingle()
  if (error) return Response.json({ error: 'Failed to load article' }, { status: 500 })
  if (!target) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject((target as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const row = target as { content_html: string | null; internal_links_json: unknown }
  // Only a link the automatic step added: never a link the customer or a plan put there.
  if (!autoEntries(row.internal_links_json).some((e) => e.url === url && !e.removed)) {
    return Response.json({ error: 'not_auto_link' }, { status: 404 })
  }
  const html = row.content_html ?? ''
  const nextHtml = removeLink(html, url) ?? html
  const { error: writeErr } = await auth.admin
    .from('generated_articles')
    .update({ content_html: nextHtml, internal_links_json: markAutoRemoved(row.internal_links_json, url), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('project_id', auth.project.id)
  if (writeErr) {
    console.error('[internal-links] auto-link removal failed', { code: (writeErr as { code?: string }).code })
    return Response.json({ error: 'Failed to remove link' }, { status: 500 })
  }
  return Response.json({ removed: true })
}
