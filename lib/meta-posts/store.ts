/**
 * Reading and writing the meta_* tables. Server-only.
 *
 * Every function takes the service-role client, which BYPASSES RLS, so each
 * query filters by the owner explicitly: the user id for a connection, the
 * project id the route already proved the user owns for everything else. The
 * one exception is the data-deletion callback, whose owner is the Facebook user
 * named in a VERIFIED signed_request: it filters by that id and by the user ids
 * of the connections that carry it, never by anything the caller sent.
 *
 * The tables arrive with a migration the owner applies. Until then every read
 * reports `missing` and the screen says the feature is not available yet.
 */
import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { encryptGscToken, decryptGscToken, GSC_ENCRYPTION_VERSION } from '@/lib/gsc/token-crypto'
import { isMetaErrorCode, type MetaErrorCode } from './errors'

type Admin = ReturnType<typeof createAdminClient>
const STATE_TTL_MS = 10 * 60 * 1000

export const META_TABLES = ['meta_connections', 'meta_oauth_states', 'project_meta_pages', 'meta_posts', 'meta_deletion_requests'] as const

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

export class MetaStoreError extends Error {
  code: 'missing' | 'db'
  constructor(code: 'missing' | 'db') { super(code); this.name = 'MetaStoreError'; this.code = code }
}
const fail = (error: { code?: string; message?: string }) => new MetaStoreError(isMissingRelation(error) ? 'missing' : 'db')

// ── rows ──────────────────────────────────────────────────────────────────
export interface MetaConnectionRow {
  id: string
  user_id: string
  fb_user_id: string
  encrypted_user_token: string
  granted_scopes: string | null
  token_expires_at: string | null
  status: 'connected' | 'reauth_required' | 'revoked'
  last_error_code: string | null
  updated_at: string
}
export interface MetaPageRow {
  project_id: string
  user_id: string
  connection_id: string
  page_id: string
  page_name: string
  encrypted_page_token: string
  ig_user_id: string | null
  ig_username: string | null
}
export type MetaTarget = 'facebook' | 'instagram'
export type MetaPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
export interface MetaPostRow {
  id: string
  project_id: string
  user_id: string
  group_id: string
  target: MetaTarget
  source_article_id: string | null
  body: string
  link_url: string | null
  image_url: string | null
  language_code: string
  status: MetaPostStatus
  approved_at: string | null
  scheduled_at: string
  attempts: number
  remote_post_id: string | null
  remote_permalink: string | null
  last_error_code: string | null
  published_at: string | null
  created_at: string
}

export async function metaTablesPresent(admin: Admin): Promise<boolean> {
  for (const t of META_TABLES) {
    const { error } = await admin.from(t).select('*', { count: 'exact', head: true }).limit(1)
    if (error) {
      if (isMissingRelation(error)) return false
      throw new MetaStoreError('db')
    }
  }
  return true
}

// ── OAuth state ───────────────────────────────────────────────────────────
const hashState = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex')

export async function createMetaOAuthState(admin: Admin, args: { userId: string; projectId: string }): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex')
  const { error } = await admin.from('meta_oauth_states').insert({
    state_hash: hashState(raw), user_id: args.userId, project_id: args.projectId,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (error) throw fail(error)
  return raw
}

/** Consume a state once: it must exist, be unconsumed, unexpired and belong to this user. Returns the project, or null. */
export async function consumeMetaOAuthState(admin: Admin, args: { rawState: string; userId: string }): Promise<{ projectId: string } | null> {
  if (!args.rawState || !/^[0-9a-f]{64}$/.test(args.rawState)) return null
  const nowIso = new Date().toISOString()
  const { data, error } = await admin.from('meta_oauth_states')
    .update({ consumed_at: nowIso })
    .eq('state_hash', hashState(args.rawState)).eq('user_id', args.userId)
    .is('consumed_at', null).gt('expires_at', nowIso)
    .select('project_id')
  if (error || !data || data.length === 0) return null
  return { projectId: String((data[0] as { project_id: string }).project_id) }
}

// ── connection ────────────────────────────────────────────────────────────
export async function readMetaConnection(admin: Admin, userId: string): Promise<MetaConnectionRow | null> {
  const { data, error } = await admin.from('meta_connections').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw fail(error)
  return (data as MetaConnectionRow | null) ?? null
}

/** Store the long-lived user token, encrypted before it is written. */
export async function storeMetaConnection(admin: Admin, userId: string, args: { fbUserId: string; userToken: string; scopes: string[]; expiresAt: string | null }): Promise<void> {
  const existing = await readMetaConnection(admin, userId)
  const patch = {
    user_id: userId,
    fb_user_id: args.fbUserId,
    encrypted_user_token: encryptGscToken(args.userToken),
    encryption_version: GSC_ENCRYPTION_VERSION,
    granted_scopes: args.scopes.join(','),
    token_expires_at: args.expiresAt,
    status: 'connected' as const,
    last_error_code: null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('meta_connections').upsert(existing ? { ...patch, id: existing.id } : patch, { onConflict: 'user_id' })
  if (error) throw fail(error)
}

export async function markMetaConnection(admin: Admin, userId: string, status: 'reauth_required' | 'revoked', code: MetaErrorCode): Promise<void> {
  await admin.from('meta_connections').update({ status, last_error_code: code, updated_at: new Date().toISOString() }).eq('user_id', userId)
}

/** Deleting the connection deletes the page rows (and their tokens) with it: ON DELETE CASCADE. */
export async function deleteMetaConnection(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin.from('meta_connections').delete().eq('user_id', userId)
  if (error) throw fail(error)
}

export function decryptUserToken(row: Pick<MetaConnectionRow, 'encrypted_user_token'>): string | null {
  try { return decryptGscToken(row.encrypted_user_token) } catch { return null }
}
export function decryptPageToken(row: Pick<MetaPageRow, 'encrypted_page_token'>): string | null {
  try { return decryptGscToken(row.encrypted_page_token) } catch { return null }
}

// ── page ──────────────────────────────────────────────────────────────────
export async function readProjectPage(admin: Admin, projectId: string): Promise<MetaPageRow | null> {
  const { data, error } = await admin.from('project_meta_pages').select('*').eq('project_id', projectId).maybeSingle()
  if (error) throw fail(error)
  return (data as MetaPageRow | null) ?? null
}

export async function saveProjectPage(admin: Admin, row: {
  project_id: string; user_id: string; connection_id: string; page_id: string; page_name: string
  page_token: string; ig_user_id: string | null; ig_username: string | null
}): Promise<void> {
  // Moving the project to a DIFFERENT page cancels what was approved for the old
  // one: the owner approved posting to the page they picked, not to the next one.
  const previous = await readProjectPage(admin, row.project_id)
  if (previous && previous.page_id !== row.page_id) {
    const { error: e } = await admin.from('meta_posts')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('project_id', row.project_id).in('status', ['draft', 'scheduled'])
    if (e) throw fail(e)
  }
  const { error } = await admin.from('project_meta_pages').upsert({
    project_id: row.project_id, user_id: row.user_id, connection_id: row.connection_id,
    page_id: row.page_id, page_name: row.page_name.slice(0, 300),
    encrypted_page_token: encryptGscToken(row.page_token),
    ig_user_id: row.ig_user_id, ig_username: row.ig_username,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })
  if (error) throw fail(error)
}

// ── posts ─────────────────────────────────────────────────────────────────
export async function listProjectPosts(admin: Admin, projectId: string, limit = 40): Promise<MetaPostRow[]> {
  const { data, error } = await admin.from('meta_posts').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw fail(error)
  return (data as MetaPostRow[] | null) ?? []
}

export async function readProjectPost(admin: Admin, projectId: string, postId: string): Promise<MetaPostRow | null> {
  const { data, error } = await admin.from('meta_posts').select('*').eq('id', postId).eq('project_id', projectId).maybeSingle()
  if (error) throw fail(error)
  return (data as MetaPostRow | null) ?? null
}

/** New posts are ALWAYS drafts: nothing has an approval until approvePost writes one. */
export async function insertDrafts(admin: Admin, rows: Array<{
  project_id: string; user_id: string; group_id: string; target: MetaTarget; source_article_id: string | null
  body: string; link_url: string | null; image_url: string | null; language_code: string; scheduled_at: string
}>): Promise<MetaPostRow[]> {
  const { data, error } = await admin.from('meta_posts').insert(rows.map((r) => ({ ...r, status: 'draft' }))).select('*')
  if (error || !data) throw fail(error ?? {})
  return data as MetaPostRow[]
}

/** The owner edits the text of a post that is still a draft. Anything else is refused (false). */
export async function updateDraftBody(admin: Admin, projectId: string, groupId: string, body: string): Promise<boolean> {
  const { data, error } = await admin.from('meta_posts')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('project_id', projectId).eq('group_id', groupId).eq('status', 'draft')
    .select('id')
  if (error) throw fail(error)
  return !!data && data.length > 0
}

/**
 * The owner's approval: draft → scheduled, with the moment of approval recorded.
 * It is the only function that writes approved_at, and only from 'draft', for a
 * project the route proved the user owns.
 */
export async function approveGroup(admin: Admin, projectId: string, userId: string, groupId: string, scheduledAtIso: string): Promise<MetaPostRow[]> {
  const now = new Date().toISOString()
  const { data, error } = await admin.from('meta_posts')
    .update({ status: 'scheduled', approved_at: now, scheduled_at: scheduledAtIso, updated_at: now })
    .eq('project_id', projectId).eq('user_id', userId).eq('group_id', groupId).eq('status', 'draft')
    .select('*')
  if (error) throw fail(error)
  return (data as MetaPostRow[] | null) ?? []
}

/** How long a row may sit in 'publishing' before another pass may take it over. */
export const STALE_PUBLISHING_MS = 10 * 60 * 1000

/** Claim one approved, due post: scheduled → publishing, atomically. A dead pass's stale claim is taken over. */
export async function claimPost(admin: Admin, postId: string, staleBefore?: string): Promise<MetaPostRow | null> {
  const claim = async (apply: (q: ReturnType<ReturnType<Admin['from']>['update']>) => unknown) => {
    const q = admin.from('meta_posts').update({ status: 'publishing', updated_at: new Date().toISOString() }).eq('id', postId).not('approved_at', 'is', null)
    const { data, error } = await (apply(q) as ReturnType<typeof q.select>)
    if (error || !data || data.length === 0) return null
    return data[0] as MetaPostRow
  }
  const fresh = await claim((q) => q.eq('status', 'scheduled').select('*'))
  if (fresh || !staleBefore) return fresh
  return claim((q) => q.eq('status', 'publishing').lt('updated_at', staleBefore).select('*'))
}

export async function finishPost(admin: Admin, postId: string, patch:
  | { status: 'published'; remoteId: string; permalink: string | null; attempts: number }
  | { status: 'failed' | 'scheduled'; code: MetaErrorCode; attempts: number; retryAt?: string }): Promise<void> {
  const now = new Date().toISOString()
  const update = patch.status === 'published'
    ? { status: 'published', remote_post_id: patch.remoteId, remote_permalink: patch.permalink, last_error_code: null, published_at: now, attempts: patch.attempts, updated_at: now }
    : { status: patch.status, last_error_code: isMetaErrorCode(patch.code) ? patch.code : 'unexpected', attempts: patch.attempts, ...(patch.retryAt ? { scheduled_at: patch.retryAt } : {}), updated_at: now }
  await admin.from('meta_posts').update(update).eq('id', postId)
}

/** Cancel a post that has not gone out: a draft or a scheduled one, the whole group of the same text. */
export async function cancelGroup(admin: Admin, projectId: string, groupId: string): Promise<boolean> {
  const { data, error } = await admin.from('meta_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('project_id', projectId).eq('group_id', groupId).in('status', ['draft', 'scheduled'])
    .select('id')
  if (error) throw fail(error)
  return !!data && data.length > 0
}

export async function duePostIds(admin: Admin, nowIso: string, limit: number): Promise<string[]> {
  const { data, error } = await admin.from('meta_posts').select('id').eq('status', 'scheduled').not('approved_at', 'is', null).lte('scheduled_at', nowIso).order('scheduled_at', { ascending: true }).limit(limit)
  if (error) throw fail(error)
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id)
}

export async function stalePublishingIds(admin: Admin, beforeIso: string, limit: number): Promise<string[]> {
  const { data, error } = await admin.from('meta_posts').select('id').eq('status', 'publishing').lt('updated_at', beforeIso).order('updated_at', { ascending: true }).limit(limit)
  if (error) throw fail(error)
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id)
}

// ── Meta's callbacks (Data Deletion, Deauthorize) ─────────────────────────
/** The users who connected this Facebook account. Never empty-matches: an invalid id matches nothing. */
async function userIdsForFbUser(admin: Admin, fbUserId: string): Promise<string[]> {
  if (!/^[0-9]{1,32}$/.test(fbUserId)) return []
  const { data, error } = await admin.from('meta_connections').select('user_id').eq('fb_user_id', fbUserId)
  if (error) throw fail(error)
  return ((data as { user_id: string }[] | null) ?? []).map((r) => String(r.user_id))
}

/**
 * The person removed the app at Facebook: delete the tokens and the saved page
 * at once (the connection row takes the page rows with it). Post history stays,
 * exactly as an in-app disconnect leaves it.
 */
export async function deauthorizeFbUser(admin: Admin, fbUserId: string): Promise<{ users: number }> {
  const users = await userIdsForFbUser(admin, fbUserId)
  for (const userId of users) {
    const { error } = await admin.from('meta_connections').delete().eq('user_id', userId).eq('fb_user_id', fbUserId)
    if (error) throw fail(error)
  }
  return { users: users.length }
}

/**
 * Data deletion: the connection, the saved pages, the pending OAuth states and
 * every post record (drafts, scheduled and published) of the users who connected
 * this Facebook account. Each delete names the user id AND, for the connection,
 * the Facebook id, because the service-role client ignores RLS.
 */
export async function deleteFbUserData(admin: Admin, fbUserId: string): Promise<{ users: number }> {
  const users = await userIdsForFbUser(admin, fbUserId)
  for (const userId of users) {
    for (const table of ['meta_posts', 'meta_oauth_states'] as const) {
      const { error } = await admin.from(table).delete().eq('user_id', userId)
      if (error) throw fail(error)
    }
    const { error } = await admin.from('meta_connections').delete().eq('user_id', userId).eq('fb_user_id', fbUserId)
    if (error) throw fail(error)
  }
  return { users: users.length }
}

export async function recordDeletionRequest(admin: Admin, kind: 'deletion' | 'deauthorize', status: 'completed' | 'failed'): Promise<string> {
  const code = crypto.randomBytes(12).toString('hex')
  const { error } = await admin.from('meta_deletion_requests').insert({ code, kind, status })
  if (error) throw fail(error)
  return code
}

export async function readDeletionRequest(admin: Admin, code: string): Promise<{ kind: 'deletion' | 'deauthorize'; status: 'completed' | 'failed'; createdAt: string } | null> {
  if (!/^[0-9a-f]{24}$/.test(code)) return null
  const { data, error } = await admin.from('meta_deletion_requests').select('kind, status, created_at').eq('code', code).maybeSingle()
  if (error) throw fail(error)
  if (!data) return null
  const r = data as { kind: 'deletion' | 'deauthorize'; status: 'completed' | 'failed'; created_at: string }
  return { kind: r.kind, status: r.status, createdAt: r.created_at }
}
