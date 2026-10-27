/**
 * The owner's author photo (lib/content/author-box/photo.ts) copied into the
 * customer's WordPress media library at publish time, so the article's box
 * links to THAT copy and never to our private storage.
 *
 * HOW, TWO WAYS, in this order.
 *   1. The site's application password, through the same media upload the
 *      featured image uses (lib/wordpress/client.ts uploadMedia, the REST
 *      /wp/v2/media endpoint).
 *   2. The GO TOP SEO Bridge plugin from 3.2.0, whose /media now also accepts
 *      an address GO TOP SIGNED on its own storage (includes/publish.php
 *      gotop_seo_bridge_image_sources). The photo's bucket is private and has
 *      no public address at all, which is why a plugin before 3.2.0 answered
 *      `off_site` and a plugin-only site got no photo.
 * The signature lasts AUTHOR_PHOTO_COPY_SECONDS and is handed to that one site
 * only, to be fetched once; nothing is made public and no other address can be
 * passed, because the plugin checks the prefix itself.
 *
 * A Shopify store is still not offered the choice: the app's scopes
 * (read_products, read_content, write_content) cannot write to Shopify Files.
 * A custom site has no media library we can write to. The settings card offers
 * 'upload' exactly where a copy can be made (canCopyAuthorPhoto).
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
import { pluginMedia } from '@/lib/site-fix/plugin-client'
import { loadPluginFor, type ConnectedPlugin } from '@/lib/site-fix/plugin-capabilities'

/** All the copy needs of a connected plugin: the signed link to its site. */
export type PhotoCopyPlugin = Pick<ConnectedPlugin, 'link'>
import { AUTHOR_PHOTO_BUCKET, AUTHOR_PHOTO_EXT, AUTHOR_PHOTO_MIME, isAuthorPhotoPath, sniffAuthorPhoto } from './photo-file'
import { AUTHOR_PHOTO_MEDIA_COLUMN, readAuthorPhoto, type AuthorPhotoMedia } from '@/lib/content/author-box/photo'

/** How long the one signature handed to the customer's site lasts. */
export const AUTHOR_PHOTO_COPY_SECONDS = 300

export type PhotoCopyDeps = {
  upload?: typeof uploadMedia
  media?: typeof pluginMedia
  plugin?: (projectId: string, ownerId: string) => Promise<PhotoCopyPlugin | null>
}

/** The site a copy belongs to: the connection's origin, lowercased, no trailing slash. */
export function photoSite(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl)
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.protocol}//${u.host.toLowerCase()}` : null
  } catch {
    return null
  }
}

/**
 * The address of the project's photo in this site's media library, put there once, through the
 * plugin when it can (3.2.0) and otherwise over an application password. `creds` is null on a
 * site that has no application password, which is the case this exists for.
 */
export async function copyAuthorPhoto(
  admin: SupabaseClient,
  target: { creds?: WordPressCredentials | null; plugin?: PhotoCopyPlugin | null },
  projectId: string,
  ownerId: string,
  deps: PhotoCopyDeps = {},
): Promise<string | null> {
  if (target.creds) {
    const direct = await copyAuthorPhotoToWordPress(admin, target.creds, projectId, ownerId, deps)
    if (direct) return direct
  }
  return target.plugin ? copyAuthorPhotoViaPlugin(admin, target.plugin, projectId, ownerId, deps) : null
}

/** The photo this project has to copy, and the copy already made, or null when there is nothing to do. */
async function photoToCopy(admin: SupabaseClient, projectId: string, ownerId: string, site: string | null) {
  if (!site) return null
  const photo = await readAuthorPhoto(admin, projectId, ownerId)
  if (photo.state !== 'saved' || !photo.path || !isAuthorPhotoPath(photo.path, projectId)) return null
  const done = photo.media && photo.media.site === site && photo.media.path === photo.path ? photo.media.url : null
  return { site, path: photo.path, done }
}

/** A file name with no person in it: a hash of the random path. */
function photoFileName(path: string, kind: keyof typeof AUTHOR_PHOTO_EXT): string {
  return `author-photo-${createHash('sha256').update(path).digest('hex').slice(0, 12)}.${AUTHOR_PHOTO_EXT[kind]}`
}

async function rememberCopy(admin: SupabaseClient, projectId: string, ownerId: string, record: AuthorPhotoMedia) {
  await admin.from(ARTICLE_STYLE_TABLE).update({ [AUTHOR_PHOTO_MEDIA_COLUMN]: record }).eq('project_id', projectId).eq('user_id', ownerId)
}

/**
 * The plugin route (3.2.0). GO TOP signs the one file for AUTHOR_PHOTO_COPY_SECONDS and the
 * plugin's /media fetches it; the bucket stays private and nothing else is signed. The caller
 * proved the plugin can `author_photo`.
 */
export async function copyAuthorPhotoViaPlugin(
  admin: SupabaseClient,
  plugin: PhotoCopyPlugin,
  projectId: string,
  ownerId: string,
  deps: PhotoCopyDeps = {},
): Promise<string | null> {
  try {
    const todo = await photoToCopy(admin, projectId, ownerId, photoSite(plugin.link.siteUrl))
    if (!todo) return null
    if (todo.done) return todo.done

    const signed = await admin.storage.from(AUTHOR_PHOTO_BUCKET).createSignedUrl(todo.path, AUTHOR_PHOTO_COPY_SECONDS)
    const url = signed.error ? null : signed.data?.signedUrl ?? null
    if (!url || !/^https:\/\//i.test(url)) return null

    const answer = await (deps.media ?? pluginMedia)(plugin.link, { url, alt: '' })
    if (!answer.ok || typeof answer.body.url !== 'string' || !/^https?:\/\//i.test(answer.body.url)) return null
    const record: AuthorPhotoMedia = { site: todo.site, path: todo.path, media_id: answer.body.media_id, url: answer.body.url }
    await rememberCopy(admin, projectId, ownerId, record)
    return answer.body.url
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
    const todo = await photoToCopy(admin, projectId, ownerId, photoSite(creds.siteUrl))
    if (!todo) return null
    if (todo.done) return todo.done
    const site = todo.site
    const photo = { path: todo.path }

    const dl = await admin.storage.from(AUTHOR_PHOTO_BUCKET).download(photo.path)
    if (dl.error || !dl.data) return null
    const bytes = Buffer.from(await dl.data.arrayBuffer())
    const kind = sniffAuthorPhoto(bytes)
    if (!kind) return null
    const name = photoFileName(photo.path, kind)
    const media = await (deps.upload ?? uploadMedia)(creds, { data: bytes, filename: name, mimeType: AUTHOR_PHOTO_MIME[kind], altText: '', title: 'Author photo' })
    if (!media.sourceUrl || !/^https:\/\//i.test(media.sourceUrl)) return null
    const record: AuthorPhotoMedia = { site, path: photo.path, media_id: media.id, url: media.sourceUrl }
    await rememberCopy(admin, projectId, ownerId, record)
    return media.sourceUrl
  } catch {
    return null
  }
}

/**
 * The settings card offers 'upload' only where a copy can be made: a WordPress site with an
 * application password, or one connected by the plugin from 3.2.0. A plugin older than that
 * cannot take the photo, so the card says so instead of offering a choice that would do nothing.
 */
export async function canCopyAuthorPhoto(admin: SupabaseClient, projectId: string, deps: PhotoCopyDeps = {}): Promise<boolean> {
  try {
    const loaded = await loadWordPressCredentials(admin as unknown as ReturnType<typeof createAdminClient>, projectId)
    if (!('error' in loaded)) return true
    return !!(await authorPhotoPlugin(admin, projectId, null, deps))
  } catch {
    return false
  }
}

/** The project's plugin when it can take the author photo (3.2.0), else null. */
export async function authorPhotoPlugin(
  admin: SupabaseClient, projectId: string, ownerId: string | null, deps: PhotoCopyDeps = {},
): Promise<PhotoCopyPlugin | null> {
  try {
    if (deps.plugin) return await deps.plugin(projectId, ownerId ?? '')
    return await loadPluginFor(admin as unknown as ReturnType<typeof createAdminClient>, projectId, 'author_photo', ownerId ? { ownerId } : {})
  } catch {
    return null
  }
}
