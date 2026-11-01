/**
 * ACCOUNT DELETION — the merchant's own erasure right (GDPR Art. 17), served.
 *
 * Until now a merchant could delete a project but not themselves: the only way out
 * was to delete each project by hand and leave the account behind. The privacy
 * policy meanwhile promised erasure. This module is that promise, in one place.
 *
 * TWO THINGS MAKE THIS MORE THAN ONE `deleteUser` CALL.
 *
 * 1. A FOREIGN KEY REACHES ROWS, NOT OBJECTS. Eighteen tables reference
 *    auth.users, so deleting the user takes their rows with it — but no key
 *    reaches a file in storage. A merchant's uploads live under `<project>/` in
 *    two buckets, and one of those buckets is PUBLIC: our copy of a Maps-post
 *    photo is served from a public URL, because that URL is what Google fetches
 *    (lib/gbp/image-store.ts). Delete the user first and those files become
 *    orphans that no row points at any more: still served, and now unfindable.
 *    So STORAGE GOES FIRST, while the projects that name it still exist.
 *
 * 2. A FAILED STORAGE PASS ABORTS THE WHOLE DELETE. If any object could not be
 *    removed we do NOT go on to delete the user. That looks like the wrong way
 *    round — the merchant asked to be erased — but a half-delete here is the one
 *    outcome nobody can repair: with the owning rows gone, there is no longer any
 *    record of which files belonged to whom, so a photo of a person stays at a
 *    public address for ever and no later pass can find it. Stopping leaves the
 *    account intact and the request retryable, which is recoverable. Erasure
 *    delayed by a retry is a worse service; erasure that strands published photos
 *    is a worse breach.
 *
 * WHAT SURVIVES THE DELETE, AND WHY THAT IS LAWFUL. Art. 17(3) carves out what
 * must be kept. None of these tables has a foreign key to auth.users, so they are
 * untouched by design rather than by omission:
 *   - `site_fix_audit` — append-only proof that the merchant approved each write
 *     we made to their own site. No role may DELETE from it. Keeping it is how we
 *     can show a write was authorised, Art. 17(3)(e).
 *   - `consent_events` — the cookie decision log, three years, and the policy
 *     already says it is not erased with the account: it is the evidence of
 *     consent that Art. 7(1) requires.
 *   - `email_suppressions` — keyed by the hash of the address, never lifted. This
 *     one must survive precisely BECAUSE the person is gone: erase it and a later
 *     campaign could write to someone who asked never to be written to again.
 *   - `affiliate_referrals`, `affiliate_commissions` — money owed to a third
 *     party, and that affiliate's own record, not the departing merchant's.
 *   - `marketplace_orders` — `claimed_by` is ON DELETE SET NULL, so the receipt
 *     survives without the person attached to it.
 * The seven-year tax record is NOT in this database: invoices are issued and held
 * by PayPal, Creem or Shopify and in the company's books. A `subscriptions` row is
 * operational state, so letting it go with the user breaches no retention duty.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not reach into anything outside our
 * own systems, because it cannot: an article already published on the merchant's
 * own site, a photo already placed on their Google Business Profile, and a post on
 * their Shopify blog are all theirs to remove where they live. The policy says so
 * in those words, and no code here pretends otherwise.
 *
 * IRREVERSIBLE, AND IMMEDIATE. There is no grace period: see the route for why a
 * 90-day undo window was rejected rather than built.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { AUTHOR_PHOTO_BUCKET } from '@/lib/content/author-box/photo-file'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/featured-image'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Every bucket that holds a merchant's own uploads under a `<project>/` prefix.
 *
 * `content-article-images` is PUBLIC and holds article images and, under
 * `<project>/gbp/`, the Maps-post photos. `author-photos` is private and holds the
 * author-box photo. The blog bucket (`article-images`) is deliberately absent: it
 * is our own marketing blog, not a merchant's content, and is not keyed by project.
 */
export const MERCHANT_PROJECT_BUCKETS = [CONTENT_IMAGE_BUCKET, AUTHOR_PHOTO_BUCKET] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** One listing page. Supabase caps a listing; 100 keeps each round small and bounded. */
const PAGE = 100
/**
 * A stop against a prefix that never empties — a removal that reports success and
 * keeps nothing would otherwise spin here. 200 rounds is 20,000 objects per
 * prefix, far past any project, so hitting it means something is wrong and the
 * caller must hear about it rather than loop.
 */
const MAX_ROUNDS = 200

export type StorageSweep = { removed: number; failed: boolean }

/**
 * Remove every object under one prefix, recursing into sub-prefixes.
 *
 * Supabase's `list` is per-prefix and reports a sub-folder as an entry whose `id`
 * is null, so a flat listing of `<project>/` would never see `<project>/gbp/`.
 * Each round lists from the START of the prefix and removes what it listed, so the
 * objects it removed are simply absent from the next listing: there is no offset to
 * carry and no page to skip past deleted entries. A short page is the last one.
 */
async function removePrefix(admin: Admin, bucket: string, prefix: string): Promise<StorageSweep> {
  let removed = 0
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE })
    if (error) {
      // The message can carry the object's path, which is the merchant's content:
      // only the bucket and a fixed line are logged, never the path or a name.
      console.error('[account-delete] listing failed', { bucket })
      return { removed, failed: true }
    }
    // `id` is null for a sub-folder, which the client's own type does not admit,
    // so the shape is narrowed here rather than asserted at each use.
    const entries = (data ?? []) as { name: string; id: string | null }[]
    if (entries.length === 0) return { removed, failed: false }

    // Clear each sub-prefix first, then this level's files.
    const folders = entries.filter((e) => e.id === null).map((e) => e.name)
    const files = entries.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`)

    for (const folder of folders) {
      const sub = await removePrefix(admin, bucket, `${prefix}/${folder}`)
      removed += sub.removed
      if (sub.failed) return { removed, failed: true }
    }

    if (files.length > 0) {
      const { error: rmError } = await admin.storage.from(bucket).remove(files)
      if (rmError) {
        console.error('[account-delete] removal failed', { bucket })
        return { removed, failed: true }
      }
      removed += files.length
    }

    // Every entry this round was a folder, and each has just been cleared, so
    // nothing at this level remains — but only when the listing was the LAST page.
    // At exactly PAGE entries there may be more sub-folders waiting, and the next
    // listing will not show the cleared ones, so the loop makes progress.
    if (files.length === 0 && entries.length < PAGE) return { removed, failed: false }
  }
  console.error('[account-delete] prefix did not empty', { bucket })
  return { removed, failed: true }
}

/**
 * Remove every stored file of ONE project, in every merchant bucket.
 *
 * The project id is checked against the UUID shape before it is used as a prefix:
 * it is interpolated into a storage path, and a caller that passed something else
 * would be addressing a prefix of its own choosing. Callers pass an id read back
 * from the database, so this is a guard by construction rather than a live hole.
 */
export async function removeProjectStorage(admin: Admin, projectId: string): Promise<StorageSweep> {
  if (!UUID.test(projectId)) return { removed: 0, failed: true }
  let removed = 0
  for (const bucket of MERCHANT_PROJECT_BUCKETS) {
    const sweep = await removePrefix(admin, bucket, projectId)
    removed += sweep.removed
    if (sweep.failed) return { removed, failed: true }
  }
  return { removed, failed: false }
}

export type DeleteAccountResult =
  | { ok: true; projects: number; filesRemoved: number }
  | { ok: false; error: 'projects_unreadable' | 'storage_incomplete' | 'user_delete_failed' }

/**
 * Delete one account: the merchant's files, then their rows, then their login.
 *
 * `admin` bypasses RLS, so every read here filters by `user_id` explicitly — the
 * house rule for the service role, and here it is also what decides which files
 * are swept. Nothing about the caller is trusted: the route proves who is asking
 * and passes their own id, and this function never reads an id from a request.
 */
export async function deleteAccount(admin: Admin, userId: string): Promise<DeleteAccountResult> {
  if (!UUID.test(userId)) return { ok: false, error: 'projects_unreadable' }

  // Read the projects BEFORE anything is deleted: once the user's rows are gone
  // there is nothing left that says which prefixes were theirs.
  const { data, error } = await admin.from('projects').select('id').eq('user_id', userId)
  if (error) {
    console.error('[account-delete] projects unreadable', { code: (error as { code?: string }).code })
    return { ok: false, error: 'projects_unreadable' }
  }
  const projectIds = ((data as { id: string }[] | null) ?? []).map((p) => p.id)

  let filesRemoved = 0
  for (const projectId of projectIds) {
    const sweep = await removeProjectStorage(admin, projectId)
    filesRemoved += sweep.removed
    // Stop before the rows go. See the header: an orphaned public photo cannot be
    // found again, and this is the only failure mode that is not recoverable.
    if (sweep.failed) return { ok: false, error: 'storage_incomplete' }
  }

  // The login and the email address themselves, and with them every row in the
  // eighteen tables whose user_id cascades from auth.users.
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError) {
    console.error('[account-delete] user delete failed', { status: (authError as { status?: number }).status })
    return { ok: false, error: 'user_delete_failed' }
  }

  return { ok: true, projects: projectIds.length, filesRemoved }
}
