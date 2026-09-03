/**
 * Content — /api/content/articles/:id/inline-images
 *
 * Phase 4D. GET → list this article's inline images + eligible H2 sections.
 * POST → create one inline-image entry (optionally generate immediately),
 * enforcing the max of 3 and one-image-per-section. Owner-scoped via the
 * article's project. Never touches content_html / featured image.
 */

import { authContentProject } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { eligibleSections, generateInlineImage, INLINE_IMAGE_MAX } from '@/lib/content/inline-images'
import { imageGenerationHttpStatus } from '@/lib/content/image-generation-http'


async function loadArticle(articleId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('generated_articles').select('id, project_id, content_html').eq('id', articleId).maybeSingle()
  return data as { id: string; project_id: string; content_html: string | null } | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await loadArticle(id)
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  const auth = await authContentProject(article.project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    const { data, error } = await auth.admin.from('article_inline_images').select('*').eq('article_id', id).order('position', { ascending: true })
    if (error) {
      if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'inline_images_migration_required', migrationRequired: true }, { status: 503 })
      return Response.json({ error: 'Failed to load images' }, { status: 500 })
    }
    return Response.json({ images: data ?? [], eligibleSections: eligibleSections(article.content_html || ''), max: INLINE_IMAGE_MAX })
  } catch {
    return Response.json({ error: 'inline_images_unavailable' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { sectionId?: unknown; prompt?: unknown; altText?: unknown; caption?: unknown; generate?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : ''
  if (!sectionId) return Response.json({ error: 'section_required' }, { status: 400 })

  const article = await loadArticle(id)
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  const auth = await authContentProject(article.project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Section must be a real eligible H2; one image per section.
  const sections = eligibleSections(article.content_html || '')
  if (!sections.some((s) => s.sectionId === sectionId)) return Response.json({ error: 'section_not_eligible' }, { status: 400 })

  const { data: existing } = await auth.admin.from('article_inline_images').select('id, section_id, position').eq('article_id', id)
  const rows = (existing ?? []) as { id: string; section_id: string; position: number }[]
  if (rows.length >= INLINE_IMAGE_MAX) return Response.json({ error: 'max_images_reached', max: INLINE_IMAGE_MAX }, { status: 400 })
  if (rows.some((r) => r.section_id === sectionId)) return Response.json({ error: 'section_already_has_image' }, { status: 400 })

  const position = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1
  const nowIso = new Date().toISOString()
  const { data: created, error } = await auth.admin.from('article_inline_images').insert({
    user_id: auth.user.id, project_id: auth.project.id, article_id: id, section_id: sectionId,
    prompt: typeof body.prompt === 'string' ? body.prompt : null,
    alt_text: typeof body.altText === 'string' ? body.altText : null,
    caption: typeof body.caption === 'string' ? body.caption : null,
    position, status: 'pending', updated_at: nowIso,
  }).select('id').single()
  if (error || !created) {
    if ((error as { code?: string })?.code === '42P01') return Response.json({ error: 'inline_images_migration_required', migrationRequired: true }, { status: 503 })
    return Response.json({ error: 'Failed to create image' }, { status: 500 })
  }
  const imageId = (created as { id: string }).id
  let generation: { ok: true; url: string } | { ok: false; error: string; transient?: boolean } | null = null
  if (body.generate === true) generation = await generateInlineImage(auth.admin, imageId)
  const { data: row } = await auth.admin.from('article_inline_images').select('*').eq('id', imageId).maybeSingle()
  // The row is still returned (it exists and the client should render it), but
  // the STATUS now tells the truth about the generation attempt.
  if (generation && !generation.ok) {
    return Response.json({ image: row, error: 'image_generation_failed', reason: generation.error },
      { status: imageGenerationHttpStatus(generation.error) })
  }
  return Response.json({ image: row })
}
