/**
 * Content module — /api/content/articles/:id/image
 *
 * POST   → generate (or regenerate) the article's featured image via Gemini,
 *          store it in the content-article-images bucket, save the public URL +
 *          storage path + prompt on the article. Returns { featured_image_url }.
 * DELETE → remove the featured image (clears the fields; best-effort deletes the
 *          stored object). Does NOT touch WordPress.
 *
 * Gated by ENABLE_CONTENT + project ownership. Never publishes. Never touches
 * /api/articles or the global articles table.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateArticleImage, normalizeFeaturedImage } from '@/lib/content/gemini-image'

const BUCKET = 'content-article-images'

async function loadOwnedArticle(articleId: string) {
  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id, title, slug, topic_id, image_prompt, featured_image_storage_path')
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

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  return 'png'
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { admin, article } = owned

  // Language hint from the linked topic (best-effort).
  let language: 'he' | 'en' = 'he'
  if (article.topic_id && typeof article.topic_id === 'string') {
    const { data: topic } = await admin.from('article_topics').select('language').eq('id', article.topic_id).maybeSingle()
    language = String((topic as { language?: string } | null)?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  }

  const gen = await generateArticleImage({
    title: String(article.title || ''),
    imagePrompt: (article.image_prompt as string) ?? null,
    language,
  })
  if ('error' in gen) {
    console.log('[content-article-image] failed reason=' + gen.error)
    return Response.json({ error: 'image_generation_failed', reason: gen.error }, { status: 502 })
  }

  // Normalize to a consistent WordPress-friendly JPEG 1600x900 (16:9) before
  // storing. Falls back to the raw bytes only if sharp fails.
  let bytes = gen.data
  let mimeType = gen.mimeType
  try {
    const norm = await normalizeFeaturedImage(gen.data)
    bytes = norm.data
    mimeType = norm.mimeType
  } catch (e) {
    console.warn('[content-article-image] normalize failed, using original', { message: e instanceof Error ? e.message : String(e) })
  }

  const ext = extFor(mimeType)
  const path = `${article.project_id}/${id}-${Date.now().toString(36)}.${ext}`
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true })
  if (up.error) {
    console.error('[content-article-image] storage upload failed', { message: up.error.message })
    return Response.json({ error: 'image_upload_failed' }, { status: 500 })
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

  // Remove the previous object (best-effort) once the new one is saved.
  const prevPath = article.featured_image_storage_path
  if (prevPath && typeof prevPath === 'string' && prevPath !== path) {
    admin.storage.from(BUCKET).remove([prevPath]).catch(() => {})
  }

  const { error: updErr } = await admin
    .from('generated_articles')
    .update({
      featured_image_url: pub.publicUrl,
      featured_image_storage_path: path,
      featured_image_prompt: gen.prompt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updErr) {
    console.error('[content-article-image] db update failed', { message: updErr.message })
    return Response.json({ error: 'image_save_failed' }, { status: 500 })
  }

  console.log('[content-article-image] created', { articleId: id, projectId: article.project_id })
  return Response.json({ featured_image_url: pub.publicUrl })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const owned = await loadOwnedArticle(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { admin, article } = owned

  const prevPath = article.featured_image_storage_path
  if (prevPath && typeof prevPath === 'string') {
    admin.storage.from(BUCKET).remove([prevPath]).catch(() => {})
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
