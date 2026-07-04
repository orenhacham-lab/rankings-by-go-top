/**
 * Content module — /api/content/articles/:id/image
 *
 * POST   → generate (or regenerate) the article's featured image and save it.
 *          Reuses createFeaturedImageForArticle (shared with auto-image-on-
 *          create). Returns { featured_image_url }.
 * DELETE → remove the featured image (clears the fields; best-effort deletes the
 *          stored object). Does NOT touch WordPress.
 *
 * Gated by ENABLE_CONTENT + project ownership. Never publishes. Never touches
 * /api/articles or the global articles table.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createFeaturedImageForArticle, CONTENT_IMAGE_BUCKET } from '@/lib/content/featured-image'

async function loadOwnedArticle(articleId: string) {
  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id, featured_image_storage_path')
    .eq('id', articleId)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return { error: 'Content module not initialized', status: 404 as const }
    return { error: 'Failed to load article', status: 500 as const }
  }
  if (!article) return { error: 'Article not found', status: 404 as const }
  const auth = await authContentProject((article as { project_id: string }).project_id)
  if ('error' in auth) return { error: auth.error, status: auth.status }
  return { admin, auth, article: article as Record<string, unknown> }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const result = await createFeaturedImageForArticle(owned.admin, id)
  if ('error' in result) {
    console.log('[content-article-image] failed reason=' + result.error)
    return Response.json({ error: 'image_generation_failed', reason: result.error }, { status: 502 })
  }
  return Response.json({ featured_image_url: result.featured_image_url })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { admin, article } = owned

  const prevPath = article.featured_image_storage_path
  if (prevPath && typeof prevPath === 'string') {
    admin.storage.from(CONTENT_IMAGE_BUCKET).remove([prevPath]).catch(() => {})
  }
  const { error } = await admin
    .from('generated_articles')
    .update({ featured_image_url: null, featured_image_storage_path: null, featured_image_prompt: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('[content-article-image] delete failed', { message: error.message })
    return Response.json({ error: 'image_remove_failed' }, { status: 500 })
  }
  return Response.json({ success: true })
}
