/**
 * Content — /api/content/articles/:id/inline-images/:imageId
 *
 * Phase 4D. PATCH → edit prompt/alt/caption, MOVE to another eligible section,
 * or regenerate/replace (action:'regenerate'). DELETE → remove the image + its
 * stored file. Owner-scoped via the article's project.
 */

import { authContentProject } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { eligibleSections, generateInlineImage } from '@/lib/content/inline-images'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/featured-image'

async function authForImage(articleId: string, imageId: string) {
  const admin = createAdminClient()
  const { data: article } = await admin.from('generated_articles').select('id, project_id, content_html').eq('id', articleId).maybeSingle()
  const a = article as { id: string; project_id: string; content_html: string | null } | null
  if (!a) return { error: 'article_not_found', status: 404 as const }
  const auth = await authContentProject(a.project_id)
  if ('error' in auth) return { error: auth.error, status: auth.status }
  const { data: img } = await auth.admin.from('article_inline_images').select('*').eq('id', imageId).eq('article_id', articleId).maybeSingle()
  if (!img) return { error: 'image_not_found', status: 404 as const }
  return { auth, article: a, img: img as Record<string, unknown> }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params
  let body: { sectionId?: unknown; prompt?: unknown; altText?: unknown; caption?: unknown; action?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const ctx = await authForImage(id, imageId)
  if ('error' in ctx) return Response.json({ error: ctx.error }, { status: ctx.status })
  const { auth, article } = ctx

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.prompt === 'string') patch.prompt = body.prompt
  if (typeof body.altText === 'string') patch.alt_text = body.altText
  if (typeof body.caption === 'string') patch.caption = body.caption
  // MOVE to another section — must be eligible AND not already used by another image.
  if (typeof body.sectionId === 'string' && body.sectionId) {
    const sections = eligibleSections(article.content_html || '')
    if (!sections.some((s) => s.sectionId === body.sectionId)) return Response.json({ error: 'section_not_eligible' }, { status: 400 })
    const { data: others } = await auth.admin.from('article_inline_images').select('id, section_id').eq('article_id', id).neq('id', imageId)
    if (((others ?? []) as { section_id: string }[]).some((o) => o.section_id === body.sectionId)) return Response.json({ error: 'section_already_has_image' }, { status: 400 })
    patch.section_id = body.sectionId
  }
  await auth.admin.from('article_inline_images').update(patch).eq('id', imageId)

  if (body.action === 'regenerate') await generateInlineImage(auth.admin, imageId)
  const { data: row } = await auth.admin.from('article_inline_images').select('*').eq('id', imageId).maybeSingle()
  return Response.json({ image: row })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params
  const ctx = await authForImage(id, imageId)
  if ('error' in ctx) return Response.json({ error: ctx.error }, { status: ctx.status })
  const { auth, img } = ctx
  const storagePath = img.storage_path
  if (typeof storagePath === 'string' && storagePath) auth.admin.storage.from(CONTENT_IMAGE_BUCKET).remove([storagePath]).catch(() => {})
  const { error } = await auth.admin.from('article_inline_images').delete().eq('id', imageId).eq('article_id', id)
  if (error) return Response.json({ error: 'Failed to delete image' }, { status: 500 })
  return Response.json({ success: true })
}
