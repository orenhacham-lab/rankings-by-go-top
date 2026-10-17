/**
 * The author photo the owner may upload for the author box (author_box_image
 * 'upload'): one photo per project. This file holds only the facts every side
 * agrees on, with no I/O, so the settings card can use them in the browser:
 *
 *   WHERE IT IS KEPT   AUTHOR_PHOTO_BUCKET, a dedicated PRIVATE Supabase Storage
 *                      bucket (supabase/migrations/20261017120000_project_author_photo.sql).
 *                      No storage policy opens it to anyone: only the service role
 *                      reads it, for the settings preview (a short-lived signed URL)
 *                      and for the copy into the customer's site at publish time.
 *                      Our copy is never linked from an article.
 *   ITS PATH           authorPhotoPath: `<project_id>/<random uuid>.<ext>` and
 *                      nothing else (no name, no email, no slug). The column's
 *                      CHECK enforces the same shape.
 *   WHAT IS ACCEPTED   JPEG, PNG or WebP by their first bytes (sniffAuthorPhoto),
 *                      never by the name or the declared type; at most
 *                      AUTHOR_PHOTO_MAX_BYTES. The server re-encodes it without
 *                      its metadata (lib/content/author-box/photo.ts).
 *
 * THE PHOTO NEVER REACHES AN AI OR MODEL CALL. This module, lib/content/author-box/photo.ts
 * and ./photo-copy.ts import no model client, and a guard checks every module
 * that imports them (lib/content/__qa__/author-photo.qa.ts).
 */

/** The dedicated private bucket. */
export const AUTHOR_PHOTO_BUCKET = 'author-photos'

/** 2 MB, the most the owner may upload. */
export const AUTHOR_PHOTO_MAX_BYTES = 2 * 1024 * 1024

export type AuthorPhotoKind = 'jpeg' | 'png' | 'webp'

export const AUTHOR_PHOTO_MIME: Record<AuthorPhotoKind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export const AUTHOR_PHOTO_EXT: Record<AuthorPhotoKind, 'jpg' | 'png' | 'webp'> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

/** What the file picker offers (the server still sniffs every byte it is sent). */
export const AUTHOR_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

/** The file's kind by its first bytes, or null when it is not a JPEG, PNG or WebP. */
export function sniffAuthorPhoto(bytes: Uint8Array): AuthorPhotoKind | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The only shape a stored photo's path may have: `<project uuid>/<uuid>.<jpg|png|webp>`. */
export const AUTHOR_PHOTO_PATH = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/

/**
 * The storage path for a new photo of this project: the project id, a random
 * uuid, the extension of the sniffed kind. Nothing the owner typed or named.
 * Throws on a project id that is not a uuid (the caller proved it is).
 */
export function authorPhotoPath(projectId: string, kind: AuthorPhotoKind, uuid: string = globalThis.crypto.randomUUID()): string {
  const project = String(projectId).toLowerCase()
  const id = String(uuid).toLowerCase()
  if (!UUID.test(project) || !UUID.test(id)) throw new Error('author photo path: not a uuid')
  return `${project}/${id}.${AUTHOR_PHOTO_EXT[kind]}`
}

/** True when the path is a photo path of THIS project (and of nothing else). */
export function isAuthorPhotoPath(path: unknown, projectId: string): path is string {
  if (typeof path !== 'string') return false
  const m = path.match(AUTHOR_PHOTO_PATH)
  return !!m && m[1] === String(projectId).toLowerCase()
}
