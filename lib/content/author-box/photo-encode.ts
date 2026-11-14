/**
 * The author photo's ENCODER, and the upload that uses it.
 *
 * It is a module of its own because sharp is a module of its own cost: it
 * carries a prebuilt libvips of about 19 MB into every serverless function
 * whose import graph reaches it. The checked re-encode used to sit in
 * lib/content/author-box/photo.ts, beside readAuthorPhoto and the column
 * names, which the writing-guidance screens and the author-box preview all
 * import — so four dashboard pages that only ever READ a photo were each
 * shipping libvips. Only this file and the settings action that uploads a
 * photo need it now.
 *
 * Nothing here changes what the upload does; see photo.ts for the storage and
 * pointer rules it follows. lib/__qa__/function-storage.qa.ts guards the
 * separation, and lib/content/__qa__/author-photo.qa.ts the behaviour.
 */
import sharp from 'sharp'
import { ARTICLE_STYLE_TABLE, isMissingRelation } from '@/lib/content/article-style/store'
import { owner } from '@/lib/content/writing-guidance/data'
import {
  AUTHOR_PHOTO_BUCKET, AUTHOR_PHOTO_MAX_BYTES, AUTHOR_PHOTO_MIME, authorPhotoPath, sniffAuthorPhoto,
  type AuthorPhotoKind,
} from '@/lib/content/author-box/photo-file'
import {
  AUTHOR_PHOTO_MEDIA_COLUMN, AUTHOR_PHOTO_PATH_COLUMN, readAuthorPhoto, removeAuthorPhotoObject,
  type AuthorPhotoDeps, type AuthorPhotoResult,
} from '@/lib/content/author-box/photo'

/** The largest side after re-encoding (the box draws it at 56 px; 512 keeps it sharp on any screen). */
export const AUTHOR_PHOTO_MAX_SIDE = 512

export type PreparedPhoto = { ok: true; bytes: Buffer; kind: AuthorPhotoKind } | { ok: false; code: 'photo_too_large' | 'photo_type' | 'photo_unreadable' }

/**
 * The checked, re-encoded photo: the type by its first bytes (never the name or
 * the declared type), the size cap, then sharp decodes it (a pixel cap against
 * decompression bombs, the first frame only), turns it upright, fits it within
 * AUTHOR_PHOTO_MAX_SIDE and writes it again in the same format with no metadata.
 */
export async function prepareAuthorPhoto(input: Uint8Array): Promise<PreparedPhoto> {
  if (input.byteLength > AUTHOR_PHOTO_MAX_BYTES) return { ok: false, code: 'photo_too_large' }
  const kind = sniffAuthorPhoto(input)
  if (!kind) return { ok: false, code: 'photo_type' }
  try {
    const img = sharp(Buffer.from(input), { failOn: 'error', limitInputPixels: 40_000_000, pages: 1 })
      .rotate()
      .resize(AUTHOR_PHOTO_MAX_SIDE, AUTHOR_PHOTO_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    // sharp writes no metadata unless asked to (withMetadata/keepMetadata are never called here).
    const out = kind === 'jpeg' ? await img.jpeg({ quality: 86 }).toBuffer()
      : kind === 'png' ? await img.png().toBuffer()
        : await img.webp({ quality: 86 }).toBuffer()
    if (sniffAuthorPhoto(out) !== kind || out.byteLength > AUTHOR_PHOTO_MAX_BYTES) return { ok: false, code: 'photo_unreadable' }
    return { ok: true, bytes: out, kind }
  } catch {
    return { ok: false, code: 'photo_unreadable' }
  }
}

type FileLike = { size?: unknown; arrayBuffer: () => Promise<ArrayBuffer> }
const isFileLike = (v: unknown): v is FileLike => !!v && typeof v === 'object' && typeof (v as FileLike).arrayBuffer === 'function'

/**
 * The owner's upload: checked, re-encoded, stored at a new random path in the
 * private bucket, then the pointer written on the owner's row (the image
 * becomes 'upload' and any earlier site copy is forgotten). A replaced photo's
 * object is removed. A pointer that cannot be written removes the new object.
 */
export async function uploadAuthorPhoto(deps: AuthorPhotoDeps, projectId: unknown, file: unknown): Promise<AuthorPhotoResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  if (!isFileLike(file)) return { ok: false, code: 'invalid_request' }
  // The declared size first, so a large file is refused before it is read.
  if (typeof file.size === 'number' && file.size > AUTHOR_PHOTO_MAX_BYTES) return { ok: false, code: 'photo_too_large' }
  const current = await readAuthorPhoto(o.db, o.projectId, o.userId)
  if (current.state === 'missing_column' || current.state === 'error') return { ok: false, code: 'unavailable' }
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.arrayBuffer()) } catch { return { ok: false, code: 'invalid_request' } }
  const prepared = await prepareAuthorPhoto(bytes)
  if (!prepared.ok) return prepared
  const path = authorPhotoPath(o.projectId, prepared.kind, deps.uuid?.())
  const storage = deps.storage()
  try {
    const { error } = await storage.storage.from(AUTHOR_PHOTO_BUCKET).upload(path, prepared.bytes, { contentType: AUTHOR_PHOTO_MIME[prepared.kind], upsert: false, cacheControl: 'private, max-age=0' })
    if (error) return { ok: false, code: 'save_failed' }
  } catch {
    return { ok: false, code: 'save_failed' }
  }
  const { error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .upsert({
      project_id: o.projectId,
      user_id: o.userId,
      [AUTHOR_PHOTO_PATH_COLUMN]: path,
      [AUTHOR_PHOTO_MEDIA_COLUMN]: null,
      author_box_image: 'upload',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' })
  if (error) {
    await removeAuthorPhotoObject(storage, o.projectId, path)
    return { ok: false, code: isMissingRelation(error) ? 'unavailable' : 'save_failed' }
  }
  if (current.path && current.path !== path && !(await removeAuthorPhotoObject(storage, o.projectId, current.path))) {
    // Once more: a replaced photo must not stay in our storage.
    if (!(await removeAuthorPhotoObject(storage, o.projectId, current.path))) console.error('[author-photo] replaced photo not removed')
  }
  return { ok: true, hasPhoto: true }
}

