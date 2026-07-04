/**
 * Content module — POST /api/content/articles/:id/wordpress
 *
 * Exports the article to the project's connected WordPress site as a DRAFT:
 *   1. Requires a generated featured image (block otherwise).
 *   2. Uploads that image to the WP Media Library (/wp-json/wp/v2/media).
 *   3. Creates a DRAFT post (/wp-json/wp/v2/posts, status=draft) with the image
 *      as featured_media.
 * Saves wp_post_id, wp_post_url, wp_featured_media_id, wp_connection_id.
 *
 * NEVER publishes. No scheduling/cron/pools. Gated by ENABLE_CONTENT + ownership.
 * Credentials are decrypted server-side and never logged or returned.
 */

import { authContentProject, isContentModuleEnabled, loadWordPressCredentials } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadMedia, createDraftPost, WordPressClientError } from '@/lib/wordpress/client'

const BUCKET = 'content-article-images'

function extFromPath(path: string): string {
  const m = path.toLowerCase().match(/\.(png|webp|jpe?g)$/)
  return m ? m[1].replace('jpeg', 'jpg') : 'png'
}
function mimeFromExt(ext: string): string {
  return ext === 'webp' ? 'image/webp' : ext === 'jpg' ? 'image/jpeg' : 'image/png'
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id, title, slug, excerpt, meta_description, content_html, featured_image_url, featured_image_storage_path')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!article) return Response.json({ error: 'Article not found' }, { status: 404 })

  const a = article as Record<string, unknown>
  const auth = await authContentProject(a.project_id as string)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // 1) Require a featured image.
  const storagePath = a.featured_image_storage_path as string | null
  if (!a.featured_image_url || !storagePath) {
    return Response.json({ error: 'featured_image_required', reason: 'featured_image_required' }, { status: 400 })
  }

  // 2) Load the WordPress connection (decrypted server-side).
  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_wordpress_connection' : 'wordpress_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }

  // 3) Fetch the stored image bytes.
  const dl = await auth.admin.storage.from(BUCKET).download(storagePath)
  if (dl.error || !dl.data) {
    console.error('[content-wp-export] image download failed', { message: dl.error?.message })
    return Response.json({ error: 'image_unavailable', reason: 'image_unavailable' }, { status: 500 })
  }
  const buffer = Buffer.from(await dl.data.arrayBuffer())
  const ext = extFromPath(storagePath)
  const title = String(a.title || 'article')
  const slug = String(a.slug || 'article')

  // 4) Upload the image to the WP Media Library.
  let media: { id: number; sourceUrl: string }
  try {
    media = await uploadMedia(loaded.creds, {
      data: buffer,
      filename: `${slug}.${ext}`,
      mimeType: (dl.data.type && dl.data.type.startsWith('image/') ? dl.data.type : mimeFromExt(ext)),
      altText: title,
      title,
    })
  } catch (err) {
    const detail = err instanceof WordPressClientError ? err.message : 'Media upload failed.'
    console.log('[content-wp-export] media upload failed', { projectId: auth.project.id })
    return Response.json({ error: 'wordpress_media_upload_failed', reason: 'wordpress_media_upload_failed', detail }, { status: 502 })
  }

  // 5) Create the DRAFT post with the featured image.
  let post: { id: number; link: string; status: string }
  try {
    post = await createDraftPost(loaded.creds, {
      title,
      content: String(a.content_html || ''),
      slug,
      excerpt: String(a.excerpt || a.meta_description || '') || undefined,
      featuredMedia: media.id,
    })
  } catch (err) {
    const detail = err instanceof WordPressClientError ? err.message : 'Draft creation failed.'
    console.log('[content-wp-export] draft creation failed', { projectId: auth.project.id })
    return Response.json({ error: 'wordpress_post_failed', reason: 'wordpress_post_failed', detail }, { status: 502 })
  }

  // 6) Save the WordPress references (local article stays editable; not published).
  await auth.admin
    .from('generated_articles')
    .update({
      wp_post_id: post.id,
      wp_post_url: post.link || null,
      wp_featured_media_id: media.id,
      wp_connection_id: loaded.connection.id,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  console.log('[content-wp-export] draft created', { articleId: id, projectId: auth.project.id, wpPostId: post.id, status: post.status })
  return Response.json({
    wp_post_id: post.id,
    wp_post_url: post.link || null,
    wp_featured_media_id: media.id,
    wp_status: 'draft',
  })
}
