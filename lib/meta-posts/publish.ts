/**
 * Publishing one approved post, and the pass over due posts. Server-only.
 *
 * A row is claimed (scheduled → publishing) before any call to Meta, so the
 * "publish now" request and the pass can never both send it, and claimPost
 * refuses a row with no approved_at. Every outcome is written back as a stable
 * code; nothing Meta says in words is stored. Retry only for a rate limit or an
 * outage, at most 3 attempts, 15 minutes apart. One post at a time with a pause.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { MetaApiError, type MetaErrorCode } from './errors'
import { publishToFacebook, publishToInstagram, type PublishedPost } from './api'
import {
  claimPost, finishPost, readMetaConnection, readProjectPage, decryptPageToken, markMetaConnection,
  duePostIds, stalePublishingIds, STALE_PUBLISHING_MS, type MetaPostRow,
} from './store'

type Admin = ReturnType<typeof createAdminClient>
export const META_MAX_ATTEMPTS = 3
const RETRY_MS = 15 * 60 * 1000

export interface PublishDeps {
  facebook: (pageToken: string, args: { pageId: string; text: string; link: string | null; imageUrl: string | null }) => Promise<PublishedPost>
  instagram: (pageToken: string, args: { igUserId: string; caption: string; imageUrl: string }) => Promise<PublishedPost>
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
}
export const defaultPublishDeps: PublishDeps = {
  facebook: (t, a) => publishToFacebook(t, a),
  instagram: (t, a) => publishToInstagram(t, a),
}

export type PublishOutcome =
  | { ok: true; post: Pick<MetaPostRow, 'id'> }
  | { ok: false; code: MetaErrorCode | 'not_claimable'; willRetry: boolean }

export async function publishPost(admin: Admin, postId: string, deps: PublishDeps = defaultPublishDeps): Promise<PublishOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const post = await claimPost(admin, postId, new Date(now.getTime() - STALE_PUBLISHING_MS).toISOString())
  if (!post) return { ok: false, code: 'not_claimable', willRetry: false }
  const attempts = (post.attempts ?? 0) + 1

  const giveUp = async (code: MetaErrorCode, retryable: boolean): Promise<PublishOutcome> => {
    if (retryable && attempts < META_MAX_ATTEMPTS) {
      await finishPost(admin, post.id, { status: 'scheduled', code, attempts, retryAt: new Date(now.getTime() + RETRY_MS).toISOString() })
      return { ok: false, code, willRetry: true }
    }
    await finishPost(admin, post.id, { status: 'failed', code, attempts })
    return { ok: false, code, willRetry: false }
  }

  let page, conn
  try {
    page = await readProjectPage(admin, post.project_id)
    conn = await readMetaConnection(admin, post.user_id)
  } catch { return giveUp('unexpected', true) }
  if (!page) return giveUp('no_page', false)
  // The page must hang off THIS user's connection (never someone else's).
  if (!conn || page.connection_id !== conn.id || page.user_id !== post.user_id) return giveUp('not_connected', false)
  if (conn.status !== 'connected') return giveUp('reauth_required', false)
  const token = decryptPageToken(page)
  if (!token) return giveUp('reauth_required', false)

  try {
    let out: PublishedPost
    if (post.target === 'facebook') {
      out = await deps.facebook(token, { pageId: page.page_id, text: post.body, link: post.link_url, imageUrl: post.image_url })
    } else {
      if (!page.ig_user_id) return giveUp('no_instagram', false)
      if (!post.image_url) return giveUp('invalid_post', false)
      out = await deps.instagram(token, { igUserId: page.ig_user_id, caption: post.body, imageUrl: post.image_url })
    }
    await finishPost(admin, post.id, { status: 'published', remoteId: out.id, permalink: out.permalink, attempts })
    return { ok: true, post: { id: post.id } }
  } catch (e) {
    const err = e instanceof MetaApiError ? e : new MetaApiError('unexpected')
    if (err.code === 'reauth_required') await markMetaConnection(admin, conn.user_id, 'reauth_required', 'reauth_required')
    return giveUp(err.code, err.retryable)
  }
}

/** The pass: publish what is due, one at a time. */
export async function publishDuePosts(admin: Admin, deps: PublishDeps = defaultPublishDeps, opts: { limit?: number; pauseMs?: number } = {}):
  Promise<{ attempted: number; published: number; failed: number }> {
  const now = (deps.now ?? (() => new Date()))()
  const limit = opts.limit ?? 20
  const due = await duePostIds(admin, now.toISOString(), limit)
  const stale = due.length < limit
    ? (await stalePublishingIds(admin, new Date(now.getTime() - STALE_PUBLISHING_MS).toISOString(), limit - due.length)).filter((id) => !due.includes(id))
    : []
  const ids = [...due, ...stale]
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let published = 0, failed = 0
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) await sleep(opts.pauseMs ?? 5_000)
    const out = await publishPost(admin, ids[i], deps)
    if (out.ok) published++
    else if (out.code !== 'not_claimable') failed++
  }
  return { attempted: ids.length, published, failed }
}
