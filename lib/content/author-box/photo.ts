/**
 * The author photo the owner uploads for the author box (author_box_image
 * 'upload'): one photo per project. Server only.
 *
 *   uploadAuthorPhoto      the settings card's upload (owner only)
 *   deleteAuthorPhoto      the settings card's "delete photo" (owner only)
 *   removeAuthorPhotoObject  the one place a stored photo leaves our storage:
 *                          storage.remove() on the object itself, used by the
 *                          delete, by a replaced photo, and by a save that sets
 *                          the image back to 'none' or 'site_icon'
 *                          (lib/content/writing-guidance/data.ts)
 *   authorPhotoPath        `<project_id>/<random uuid>.<ext>`, nothing else
 *                          (lib/content/author-box/photo-file.ts)
 *   AUTHOR_PHOTO_BUCKET    'author-photos', a dedicated PRIVATE bucket
 *                          (supabase/migrations/20261017120000_project_author_photo.sql)
 *
 * WHO. The project must be the signed-in user's own: the dashboard's owner
 * check (writing-guidance/data.ts owner: their RLS client, the owner named),
 * the same one every settings action uses. The pointer row is written with
 * that same RLS client, filtered by the project AND the owner. Only the
 * storage calls use the service role, and only on a path of THAT project
 * (isAuthorPhotoPath), after the check.
 *
 * WHAT. JPEG, PNG or WebP by their first bytes, at most 2 MB, then decoded and
 * written again by sharp (already a dependency) without any of its metadata
 * (EXIF, GPS, XMP, ICC), turned upright and fitted within 512x512.
 *
 * READ. Our file is read only for the settings preview (a signed URL that
 * lasts AUTHOR_PHOTO_PREVIEW_SECONDS) and for the copy into the customer's
 * site at publish time (lib/content/author-box/photo-copy.ts). It is never
 * linked from an article and never handed to any model or AI service: this
 * module imports no such client, and lib/content/__qa__/author-photo.qa.ts
 * checks every module that imports it.
 *
 * WHILE THE MIGRATION IS NOT APPLIED the columns are missing: uploads answer
 * `unavailable`, nothing is stored, and the box is exactly as before.
 * Failures are codes; nothing the database or the storage says reaches the screen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ARTICLE_STYLE_TABLE, isMissingRelation } from '@/lib/content/article-style/store'
import { owner, type GuidanceSession } from '@/lib/content/writing-guidance/data'
import {
  AUTHOR_PHOTO_BUCKET, AUTHOR_PHOTO_MAX_BYTES, AUTHOR_PHOTO_MIME, authorPhotoPath, isAuthorPhotoPath, sniffAuthorPhoto,
  type AuthorPhotoKind,
} from '@/lib/content/author-box/photo-file'

export { AUTHOR_PHOTO_BUCKET, AUTHOR_PHOTO_MAX_BYTES, authorPhotoPath, isAuthorPhotoPath, sniffAuthorPhoto }

/** The stored photo's path (NULL = none). */
export const AUTHOR_PHOTO_PATH_COLUMN = 'author_box_photo_path'
/** The copy in the customer's site, reused per project and site: { site, path, media_id, url }. */
export const AUTHOR_PHOTO_MEDIA_COLUMN = 'author_box_photo_media'

export const AUTHOR_PHOTO_PREVIEW_SECONDS = 300

/** The storage calls this module makes (the service-role client's `storage`). */
export type PhotoStorage = Pick<SupabaseClient, 'storage'>

export type AuthorPhotoMedia = { site: string; path: string; media_id: number; url: string }

export type AuthorPhotoRead = {
  state: 'saved' | 'default' | 'missing_column' | 'error'
  path: string | null
  media: AuthorPhotoMedia | null
}

function toMedia(v: unknown): AuthorPhotoMedia | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const m = v as Record<string, unknown>
  return typeof m.site === 'string' && typeof m.path === 'string' && typeof m.media_id === 'number' && typeof m.url === 'string' && /^https:\/\//i.test(m.url)
    ? { site: m.site, path: m.path, media_id: m.media_id, url: m.url } : null
}

/** The project's photo pointer and site copy, read for its owner (any client; always filtered by both). */
export async function readAuthorPhoto(db: SupabaseClient, projectId: string, ownerId: string): Promise<AuthorPhotoRead> {
  const none = (state: AuthorPhotoRead['state']): AuthorPhotoRead => ({ state, path: null, media: null })
  try {
    const { data, error } = await db
      .from(ARTICLE_STYLE_TABLE)
      .select(`project_id, user_id, ${AUTHOR_PHOTO_PATH_COLUMN}, ${AUTHOR_PHOTO_MEDIA_COLUMN}`)
      .eq('project_id', projectId)
      .eq('user_id', ownerId)
      .maybeSingle()
    if (error) return none(isMissingRelation(error) ? 'missing_column' : 'error')
    const row = data as Record<string, unknown> | null
    if (!row || row.project_id !== projectId || row.user_id !== ownerId) return none('default')
    const path = isAuthorPhotoPath(row[AUTHOR_PHOTO_PATH_COLUMN], projectId) ? (row[AUTHOR_PHOTO_PATH_COLUMN] as string) : null
    return { state: 'saved', path, media: toMedia(row[AUTHOR_PHOTO_MEDIA_COLUMN]) }
  } catch {
    return none('error')
  }
}

/**
 * Remove the stored object itself (storage.remove), not only its pointer.
 * Only a path of this project is ever removed. True when the object is gone.
 */
export async function removeAuthorPhotoObject(storage: PhotoStorage, projectId: string, path: string | null): Promise<boolean> {
  if (!path) return true
  if (!isAuthorPhotoPath(path, projectId)) return false
  try {
    const { error } = await storage.storage.from(AUTHOR_PHOTO_BUCKET).remove([path])
    return !error
  } catch {
    return false
  }
}

export type AuthorPhotoDeps = {
  session: () => Promise<GuidanceSession>
  /** The service-role client, used only for the storage calls, only after the owner check. */
  storage: () => PhotoStorage
  /** Tests only. */
  uuid?: () => string
}

export type AuthorPhotoErrorCode =
  | 'unauthorized' | 'not_found' | 'invalid_request' | 'unavailable' | 'save_failed'
  | 'photo_too_large' | 'photo_type' | 'photo_unreadable' | 'delete_failed'

export type AuthorPhotoResult = { ok: true; hasPhoto: boolean } | { ok: false; code: AuthorPhotoErrorCode }

/**
 * The owner's "delete photo": the object is removed from our storage first
 * (storage.remove), and only then the pointer and the site copy's record are
 * cleared and an 'upload' choice goes back to 'none'. If the object cannot be
 * removed nothing is changed, so the owner can try again. A copy already
 * placed in the customer's site stays there (the site's owner controls it).
 */
export async function deleteAuthorPhoto(deps: AuthorPhotoDeps, projectId: unknown): Promise<AuthorPhotoResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  const current = await readAuthorPhoto(o.db, o.projectId, o.userId)
  if (current.state === 'missing_column' || current.state === 'error') return { ok: false, code: 'unavailable' }
  if (current.state === 'default' || (!current.path && !current.media)) return { ok: true, hasPhoto: false }
  if (!(await removeAuthorPhotoObject(deps.storage(), o.projectId, current.path))) return { ok: false, code: 'delete_failed' }
  const { data: row } = await o.db.from(ARTICLE_STYLE_TABLE).select('project_id, user_id, author_box_image').eq('project_id', o.projectId).eq('user_id', o.userId).maybeSingle()
  const image = (row as { author_box_image?: unknown } | null)?.author_box_image
  const { error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .update({
      [AUTHOR_PHOTO_PATH_COLUMN]: null,
      [AUTHOR_PHOTO_MEDIA_COLUMN]: null,
      ...(image === 'upload' ? { author_box_image: 'none' } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('project_id', o.projectId)
    .eq('user_id', o.userId)
  if (error) return { ok: false, code: 'save_failed' }
  return { ok: true, hasPhoto: false }
}

/** A signed address of OUR storage: under the project's Supabase URL (https in every deployment). */
function isOurSignedUrl(url: string): boolean {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return base ? url.startsWith(`${base}/storage/v1/object/sign/${AUTHOR_PHOTO_BUCKET}/`) : /^https:\/\//i.test(url)
}

/** A short-lived signed address of the stored photo, for the settings preview only. Null on any failure. */
export async function authorPhotoPreviewUrl(storage: PhotoStorage, projectId: string, path: string | null): Promise<string | null> {
  if (!path || !isAuthorPhotoPath(path, projectId)) return null
  try {
    const { data, error } = await storage.storage.from(AUTHOR_PHOTO_BUCKET).createSignedUrl(path, AUTHOR_PHOTO_PREVIEW_SECONDS)
    const url = data?.signedUrl
    return !error && typeof url === 'string' && isOurSignedUrl(url) ? url : null
  } catch {
    return null
  }
}
