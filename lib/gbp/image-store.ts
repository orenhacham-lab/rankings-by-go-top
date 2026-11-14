/**
 * OUR COPY of a Maps-post photo: where it lives, and how it is removed.
 *
 * A merchant-uploaded post photo is written to the CONTENT_IMAGE_BUCKET, which
 * is public, and the public URL is what we hand Google as the post's
 * `media[].sourceUrl` — Google fetches it from there. So unlike the author
 * photo, whose bucket is private, our copy of a post photo sits at a
 * permanently, publicly addressable URL for as long as the object exists.
 * That makes removing it a feature of the product, not housekeeping: a photo
 * of a person, published under the merchant's name, must stop being served by
 * us once the post it belonged to is gone.
 *
 * THE PATH IS THE PERMISSION. Every path here is `<project>/gbp/<uuid>.jpg`,
 * built and matched in this one place. A delete takes a path from the caller
 * only through `isPostImagePath`, which binds it to that project: a path for
 * another project, another folder of the same project (an article's featured
 * image lives beside it), or any traversal cannot match, so a caller who owns
 * project A can never reach project B's objects or A's other images.
 *
 * WHAT SURVIVES, EXACTLY. A cancel reaches only a SCHEDULED post (cancelPost
 * filters on that status) and no route deletes a single published post, so the
 * one copy that outlives its post is a published post's — and only while its
 * project exists, because `removeAllPostImages` lists the whole folder and takes
 * published posts' photos with it. Deleting the project is therefore the complete
 * erasure route, and it is the route a merchant actually uses.
 *
 * REMOVAL IS BEST-EFFORT, AND SAYS SO. Storage is not in the database's
 * transaction and has no foreign key, so a removal can fail on its own. Each
 * function here answers whether it removed what it was asked to and never
 * throws into its caller's path: a photo left behind is a thing to log and
 * retry, never a reason to fail the cancel or the delete the merchant asked
 * for. What we cannot do at all is reach INTO the Google business profile: a
 * photo already published there is removed in the profile, by the merchant.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/image-bucket'

type Admin = ReturnType<typeof createAdminClient>
/** Just the storage corner of the admin client, so a caller can pass a stub. */
type Storage = { storage: Admin['storage'] }

/** What a project id must look like before it is put into a pattern. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The one folder a project's post photos live in. Public, hence everything above. */
export const postImageFolder = (projectId: string) => `${projectId}/gbp`
/** The path of a new post photo. The only place one is composed. */
export const postImagePath = (projectId: string, id: string) => `${postImageFolder(projectId)}/${id}.jpg`

/**
 * True when this path is one of THIS project's post photos. PURE, and the only
 * gate a caller-supplied path passes through. Anchored at both ends, so
 * `other/gbp/<uuid>.jpg`, `<project>/featured/<uuid>.jpg` and
 * `<project>/gbp/../featured/x.jpg` are all refused.
 */
export function isPostImagePath(projectId: string, path: unknown): path is string {
  if (typeof path !== 'string') return false
  // The project id is interpolated into a pattern, so it is asserted to BE a uuid
  // rather than trusted to be one. Every caller passes a value from our own database
  // today; a value carrying `.`, `*` or `|` would widen the pattern instead of
  // narrowing it, and this closes that by construction rather than by call site.
  if (!UUID.test(projectId)) return false
  return new RegExp(`^${projectId}/gbp/[0-9a-f-]{36}\\.jpg$`).test(path)
}

/**
 * Remove one post photo of this project. A path that is not this project's is
 * refused without touching storage. Answers true only when the object is gone.
 */
export async function removePostImage(admin: Storage, projectId: string, path: unknown): Promise<boolean> {
  if (!isPostImagePath(projectId, path)) return false
  try {
    const { error } = await admin.storage.from(CONTENT_IMAGE_BUCKET).remove([path])
    if (error) {
      // The message can name the object's path, which is not a secret, but it
      // is the merchant's content: only a fixed line and the project are logged.
      console.error('[gbp-image] removal failed', { projectId })
      return false
    }
    return true
  } catch {
    console.error('[gbp-image] removal threw', { projectId })
    return false
  }
}

/**
 * Remove EVERY post photo of this project — for a project being deleted.
 * The listing is paged, because a long-lived project can hold more photos than
 * one page returns, and only `<project>/gbp/` is listed, so an article's
 * featured images in the same bucket are never in the set.
 */
export async function removeAllPostImages(admin: Storage, projectId: string): Promise<{ removed: number; failed: boolean }> {
  if (!projectId) return { removed: 0, failed: true }
  const folder = postImageFolder(projectId)
  let removed = 0
  try {
    // Each round lists from the START of the folder and removes what it lists,
    // so the objects it removed are simply not in the next listing — there is no
    // offset to carry, and no page to skip past deleted entries. A short page is
    // the last one. The round cap is a stop against a listing that never empties
    // (a removal that silently keeps nothing), not an expected limit: 100 rounds
    // is 10,000 photos, far past any project.
    const PAGE = 100
    for (let round = 0; round < 100; round++) {
      const { data, error } = await admin.storage.from(CONTENT_IMAGE_BUCKET).list(folder, { limit: PAGE })
      if (error) { console.error('[gbp-image] listing failed', { projectId }); return { removed, failed: true } }
      const names = (data ?? []).map((f) => `${folder}/${f.name}`)
      if (names.length === 0) return { removed, failed: false }
      const { error: rmError } = await admin.storage.from(CONTENT_IMAGE_BUCKET).remove(names)
      if (rmError) { console.error('[gbp-image] bulk removal failed', { projectId }); return { removed, failed: true } }
      removed += names.length
      if (names.length < PAGE) return { removed, failed: false }
    }
    console.error('[gbp-image] listing did not empty', { projectId })
    return { removed, failed: true }
  } catch {
    console.error('[gbp-image] bulk removal threw', { projectId })
    return { removed, failed: true }
  }
}
