/**
 * Publishing one post, and the cron pass over due posts. Server-only.
 *
 * A post row is claimed (scheduled → publishing) before any call to Google, so
 * the "publish now" button and the cron can never both send it. Every outcome
 * is written back as a stable code; nothing Google says in words is stored.
 * Retry: only a rate limit or a Google outage, at most 3 attempts, 15 minutes
 * apart. One post at a time, with a pause between posts (10 edits per minute
 * per profile, research.md).
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { GbpApiError, type GbpErrorCode } from './errors'
import { refreshGbpAccessToken } from './oauth'
import { createLocalPost, getLocalPost, type CreatedLocalPost } from './api'
import type { LocalPostSpec } from './request'
import {
  claimPost, finishPost, readGbpConnection, readProjectLocation, decryptRefreshToken, markGbpConnection,
  duePostIds, updateGoogleState, type GbpConnectionRow, type GbpPostRow,
} from './store'

type Admin = ReturnType<typeof createAdminClient>
export const GBP_MAX_ATTEMPTS = 3
const RETRY_MS = 15 * 60 * 1000

export interface PublishDeps {
  refresh: (refreshToken: string) => Promise<{ accessToken: string }>
  create: (accessToken: string, spec: LocalPostSpec) => Promise<CreatedLocalPost>
  get?: (accessToken: string, name: string) => Promise<CreatedLocalPost>
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
}

export const defaultPublishDeps: PublishDeps = {
  refresh: (t) => refreshGbpAccessToken(t),
  create: (a, s) => createLocalPost(a, s),
  get: (a, n) => getLocalPost(a, n),
}

/** A live access token for this user's connection, or a code. Marks the connection when Google says reconnect. */
export async function accessTokenFor(admin: Admin, conn: GbpConnectionRow | null, deps: Pick<PublishDeps, 'refresh'>):
  Promise<{ ok: true; accessToken: string } | { ok: false; code: GbpErrorCode }> {
  if (!conn) return { ok: false, code: 'not_connected' }
  if (conn.status !== 'connected') return { ok: false, code: 'reauth_required' }
  const refresh = decryptRefreshToken(conn)
  if (!refresh) return { ok: false, code: 'reauth_required' }
  try {
    const tok = await deps.refresh(refresh)
    return { ok: true, accessToken: tok.accessToken }
  } catch (e) {
    const code = e instanceof GbpApiError ? e.code : 'unexpected'
    if (code === 'reauth_required') await markGbpConnection(admin, conn.user_id, 'reauth_required', 'reauth_required')
    return { ok: false, code }
  }
}

export type PublishOutcome =
  | { ok: true; post: Pick<GbpPostRow, 'id'>; state: CreatedLocalPost['state'] }
  | { ok: false; code: GbpErrorCode | 'not_claimable'; willRetry: boolean }

export async function publishPost(admin: Admin, postId: string, deps: PublishDeps = defaultPublishDeps): Promise<PublishOutcome> {
  const post = await claimPost(admin, postId)
  if (!post) return { ok: false, code: 'not_claimable', willRetry: false }
  const attempts = (post.attempts ?? 0) + 1
  const now = (deps.now ?? (() => new Date()))()

  const giveUp = async (code: GbpErrorCode, retryable: boolean): Promise<PublishOutcome> => {
    if (retryable && attempts < GBP_MAX_ATTEMPTS) {
      await finishPost(admin, post.id, { status: 'scheduled', code, attempts, retryAt: new Date(now.getTime() + RETRY_MS).toISOString() })
      return { ok: false, code, willRetry: true }
    }
    await finishPost(admin, post.id, { status: 'failed', code, attempts })
    return { ok: false, code, willRetry: false }
  }

  let location, conn
  try {
    location = await readProjectLocation(admin, post.project_id)
    conn = await readGbpConnection(admin, post.user_id)
  } catch {
    return giveUp('unexpected', true)
  }
  if (!location) return giveUp('no_location', false)
  // The location must hang off THIS user's connection (never someone else's).
  if (!conn || !conn.id || location.connection_id !== conn.id || location.user_id !== post.user_id) return giveUp('not_connected', false)

  const token = await accessTokenFor(admin, conn, deps)
  if (!token.ok) return giveUp(token.code, token.code === 'google_unavailable')

  try {
    const created = await deps.create(token.accessToken, {
      accountName: location.account_name,
      locationName: location.location_name,
      summary: post.summary,
      ctaType: post.cta_type,
      ctaUrl: post.cta_url,
      imageUrl: post.image_url,
      languageCode: post.language_code,
    })
    await finishPost(admin, post.id, { status: 'published', googlePostName: created.name, googleState: created.state, searchUrl: created.searchUrl, attempts })
    return { ok: true, post: { id: post.id }, state: created.state }
  } catch (e) {
    const err = e instanceof GbpApiError ? e : new GbpApiError('unexpected')
    if (err.code === 'reauth_required') await markGbpConnection(admin, conn.user_id, 'reauth_required', 'reauth_required')
    return giveUp(err.code, err.retryable)
  }
}

/** The cron pass: publish what is due, one at a time. */
export async function publishDuePosts(admin: Admin, deps: PublishDeps = defaultPublishDeps, opts: { limit?: number; pauseMs?: number } = {}):
  Promise<{ attempted: number; published: number; failed: number }> {
  const now = (deps.now ?? (() => new Date()))()
  const ids = await duePostIds(admin, now.toISOString(), opts.limit ?? 20)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let published = 0, failed = 0
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) await sleep(opts.pauseMs ?? 7_000)
    const out = await publishPost(admin, ids[i], deps)
    if (out.ok) published++
    else if (out.code !== 'not_claimable') failed++
  }
  return { attempted: ids.length, published, failed }
}

/**
 * Ask Google whether posts still under review went live or were rejected.
 * Bounded; a failure leaves the state as it was.
 */
export async function refreshReviewStates(admin: Admin, deps: PublishDeps = defaultPublishDeps, limit = 20): Promise<number> {
  if (!deps.get) return 0
  const { data } = await admin.from('gbp_posts').select('id, user_id, google_post_name')
    .eq('status', 'published').eq('google_state', 'PROCESSING').order('published_at', { ascending: true }).limit(limit)
  let changed = 0
  const tokens = new Map<string, string | null>()
  for (const row of (data as { id: string; user_id: string; google_post_name: string | null }[] | null) ?? []) {
    if (!row.google_post_name) continue
    if (!tokens.has(row.user_id)) {
      const conn = await readGbpConnection(admin, row.user_id).catch(() => null)
      const t = await accessTokenFor(admin, conn, deps)
      tokens.set(row.user_id, t.ok ? t.accessToken : null)
    }
    const access = tokens.get(row.user_id)
    if (!access) continue
    try {
      const p = await deps.get(access, row.google_post_name)
      if (p.state !== 'PROCESSING') { await updateGoogleState(admin, row.id, p.state); changed++ }
    } catch { /* leave as is */ }
  }
  return changed
}
