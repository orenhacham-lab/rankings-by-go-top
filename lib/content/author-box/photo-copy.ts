/**
 * The owner's author photo (lib/content/author-box/photo.ts) copied into the
 * customer's WordPress media library at publish time, so the article's box
 * links to THAT copy and never to our private storage.
 *
 * HOW. Over the site's application password, through the same media upload
 * the featured image uses (lib/wordpress/client.ts uploadMedia, the REST
 * /wp/v2/media endpoint). The GO TOP SEO Bridge plugin's /media accepts only
 * addresses in GO TOP's PUBLIC storage, which a private bucket has none of, so
 * a site connected through the plugin alone gets no photo, and the settings
 * card does not offer the choice there (canCopyAuthorPhoto). A Shopify store
 * is not offered it either: the app's scopes (read_products, read_content,
 * write_content) cannot write to Shopify Files. A custom site has no media
 * library we can write to.
 *
 * ONCE PER PROJECT AND SITE. The copy's media id and address are kept on the
 * owner's row (author_box_photo_media) with the site and the stored path they
 * came from; the next article on the same site with the same photo reuses
 * them. A new photo or another site uploads once more.
 *
 * SERVICE ROLE. Reads and writes of the row name the project AND its owner.
 * Never throws: any failure is null, and the box has no image.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase/admin'
import { uploadMedia } from '@/lib/wordpress/client'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { ARTICLE_STYLE_TABLE } from '@/lib/content/article-style/store'
import { loadWordPressCredentials } from '@/lib/content/api-auth'
import { AUTHOR_PHOTO_BUCKET, AUTHOR_PHOTO_EXT, AUTHOR_PHOTO_MIME, isAuthorPhotoPath, sniffAuthorPhoto } from './photo-file'
import { AUTHOR_PHOTO_MEDIA_COLUMN, readAuthorPhoto, type AuthorPhotoMedia } from '@/lib/content/author-box/photo'

export type PhotoCopyDeps = { upload?: typeof uploadMedia }

/** The site a copy belongs to: the connection's origin, lowercased, no trailing slash. */
export function photoSite(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl)
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.protocol}//${u.host.toLowerCase()}` : null
  } catch {
    return null
  }
}

/** The address of the project's photo in this WordPress site's media library, uploading it there once. */
export async function copyAuthorPhotoToWordPress(
  admin: SupabaseClient,
  creds: WordPressCredentials,
  projectId: string,
  ownerId: string,
  deps: PhotoCopyDeps = {},
): Promise<string | null> {
  try {
    const site = photoSite(creds.siteUrl)
    if (!site) return null
    const photo = await readAuthorPhoto(admin, projectId, ownerId)
    if (photo.state !== 'saved' || !photo.path || !isAuthorPhotoPath(photo.path, projectId)) return null
    if (photo.media && photo.media.site === site && photo.media.path === photo.path) return photo.media.url

    const dl = await admin.storage.from(AUTHOR_PHOTO_BUCKET).download(photo.path)
    if (dl.error || !dl.data) return null
    const bytes = Buffer.from(await dl.data.arrayBuffer())
    const kind = sniffAuthorPhoto(bytes)
    if (!kind) return null
    // A file name with no person in it: a hash of the random path.
    const name = `author-photo-${createHash('sha256').update(photo.path).digest('hex').slice(0, 12)}.${AUTHOR_PHOTO_EXT[kind]}`
    const media = await (deps.upload ?? uploadMedia)(creds, { data: bytes, filename: name, mimeType: AUTHOR_PHOTO_MIME[kind], altText: '', title: 'Author photo' })
    if (!media.sourceUrl || !/^https:\/\//i.test(media.sourceUrl)) return null
    const record: AuthorPhotoMedia = { site, path: photo.path, media_id: media.id, url: media.sourceUrl }
    await admin.from(ARTICLE_STYLE_TABLE).update({ [AUTHOR_PHOTO_MEDIA_COLUMN]: record }).eq('project_id', projectId).eq('user_id', ownerId)
    return media.sourceUrl
  } catch {
    return null
  }
}

/** The settings card offers 'upload' only where a copy can be made: a WordPress site with an application password. */
export async function canCopyAuthorPhoto(admin: SupabaseClient, projectId: string): Promise<boolean> {
  try {
    const loaded = await loadWordPressCredentials(admin as unknown as ReturnType<typeof createAdminClient>, projectId)
    return !('error' in loaded)
  } catch {
    return false
  }
}
