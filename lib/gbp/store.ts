/**
 * Reading and writing the four gbp_* tables. Server-only.
 *
 * Every function takes the service-role client, which BYPASSES RLS, so each
 * query filters by the owner explicitly: the user id for a connection, the
 * project id the route already proved the user owns for everything else.
 *
 * The tables arrive with a migration the owner applies. Until then every read
 * reports `missing`, and the screen says the feature is not available yet.
 */
import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { encryptGscToken, decryptGscToken, GSC_ENCRYPTION_VERSION } from '@/lib/gsc/token-crypto'
import { isGbpErrorCode, type GbpErrorCode } from './errors'
import type { GbpCtaType, GbpPostLanguage } from './validate'

type Admin = ReturnType<typeof createAdminClient>
const STATE_TTL_MS = 10 * 60 * 1000

export const GBP_TABLES = ['gbp_connections', 'gbp_oauth_states', 'project_gbp_locations', 'gbp_posts'] as const

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

export class GbpStoreError extends Error {
  code: 'missing' | 'db'
  constructor(code: 'missing' | 'db') { super(code); this.name = 'GbpStoreError'; this.code = code }
}
const fail = (error: { code?: string; message?: string }) => new GbpStoreError(isMissingRelation(error) ? 'missing' : 'db')

// ── rows ──────────────────────────────────────────────────────────────────
export interface GbpConnectionRow {
  id: string
  user_id: string
  encrypted_refresh_token: string
  granted_scope: string | null
  status: 'connected' | 'reauth_required' | 'revoked'
  last_error_code: string | null
  updated_at: string
}
export interface GbpLocationRow {
  project_id: string
  user_id: string
  connection_id: string
  account_name: string
  location_name: string
  location_title: string
  location_address: string | null
  website_uri: string | null
  maps_uri: string | null
  /** The owner's switch: an article that publishes to their site also becomes a post here. */
  auto_post_on_publish: boolean
  /** When they turned it on; null whenever it is off. */
  auto_post_enabled_at: string | null
  /** Newest review updateTime the owner was already told about. No review content is stored. */
  reviews_seen_update_time: string | null
  /** When the last "new review" alert for this project was sent. */
  reviews_alerted_at: string | null
}
export type GbpPostStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
export interface GbpPostRow {
  id: string
  project_id: string
  user_id: string
  source_article_id: string | null
  summary: string
  cta_type: GbpCtaType | null
  cta_url: string | null
  image_url: string | null
  image_path: string | null
  language_code: GbpPostLanguage
  status: GbpPostStatus
  scheduled_at: string
  attempts: number
  google_post_name: string | null
  google_state: 'LIVE' | 'PROCESSING' | 'REJECTED' | 'UNKNOWN' | null
  google_search_url: string | null
  last_error_code: string | null
  published_at: string | null
  created_at: string
  /** Queued by an article publish, not by a person. */
  auto_created: boolean
  /** The summary is still the article's own text; the cron rewrites it with the AI draft. */
  needs_ai_draft: boolean
}

/** Is the schema there? One cheap read per table. */
export async function gbpTablesPresent(admin: Admin): Promise<boolean> {
  for (const t of GBP_TABLES) {
    const { error } = await admin.from(t).select('*', { count: 'exact', head: true }).limit(1)
    if (error) {
      if (isMissingRelation(error)) return false
      throw new GbpStoreError('db')
    }
  }
  return true
}

// ── OAuth state + PKCE ────────────────────────────────────────────────────
const hashState = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex')

export async function createGbpOAuthState(admin: Admin, args: { userId: string; projectId: string; codeVerifier: string }): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex')
  const { error } = await admin.from('gbp_oauth_states').insert({
    state_hash: hashState(raw),
    user_id: args.userId,
    project_id: args.projectId,
    code_verifier_encrypted: encryptGscToken(args.codeVerifier),
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (error) throw fail(error)
  return raw
}

/**
 * Consume a state once: it must exist, be unconsumed, unexpired and belong to
 * this user. Returns the project and the PKCE verifier, or null.
 */
export async function consumeGbpOAuthState(admin: Admin, args: { rawState: string; userId: string }): Promise<{ projectId: string; codeVerifier: string } | null> {
  if (!args.rawState || !/^[0-9a-f]{64}$/.test(args.rawState)) return null
  const nowIso = new Date().toISOString()
  const { data, error } = await admin.from('gbp_oauth_states')
    .update({ consumed_at: nowIso })
    .eq('state_hash', hashState(args.rawState))
    .eq('user_id', args.userId)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('project_id, code_verifier_encrypted')
  if (error || !data || data.length === 0) return null
  const row = data[0] as { project_id: string; code_verifier_encrypted: string }
  try {
    return { projectId: String(row.project_id), codeVerifier: decryptGscToken(row.code_verifier_encrypted) }
  } catch {
    return null
  }
}

// ── connection ────────────────────────────────────────────────────────────
export async function readGbpConnection(admin: Admin, userId: string): Promise<GbpConnectionRow | null> {
  const { data, error } = await admin.from('gbp_connections').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw fail(error)
  return (data as GbpConnectionRow | null) ?? null
}

/** Store the refresh token (encrypted). A reconnect without a new refresh token keeps the old one. */
export async function storeGbpConnection(admin: Admin, userId: string, tokens: { refreshToken?: string; scope: string }): Promise<void> {
  const existing = await readGbpConnection(admin, userId)
  const encrypted = tokens.refreshToken ? encryptGscToken(tokens.refreshToken) : existing?.encrypted_refresh_token
  if (!encrypted) throw new GbpStoreError('db')
  const patch = {
    user_id: userId,
    encrypted_refresh_token: encrypted,
    encryption_version: GSC_ENCRYPTION_VERSION,
    granted_scope: tokens.scope || existing?.granted_scope || null,
    status: 'connected' as const,
    last_error_code: null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('gbp_connections').upsert(existing ? { ...patch, id: existing.id } : patch, { onConflict: 'user_id' })
  if (error) throw fail(error)
}

export async function markGbpConnection(admin: Admin, userId: string, status: 'reauth_required' | 'revoked', code: GbpErrorCode): Promise<void> {
  await admin.from('gbp_connections').update({ status, last_error_code: code, updated_at: new Date().toISOString() }).eq('user_id', userId)
}

export async function deleteGbpConnection(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin.from('gbp_connections').delete().eq('user_id', userId)
  if (error) throw fail(error)
}

export function decryptRefreshToken(row: GbpConnectionRow): string | null {
  try { return decryptGscToken(row.encrypted_refresh_token) } catch { return null }
}

// ── location ──────────────────────────────────────────────────────────────
export async function readProjectLocation(admin: Admin, projectId: string): Promise<GbpLocationRow | null> {
  const { data, error } = await admin.from('project_gbp_locations').select('*').eq('project_id', projectId).maybeSingle()
  if (error) throw fail(error)
  return (data as GbpLocationRow | null) ?? null
}

export async function saveProjectLocation(
  admin: Admin,
  row: Omit<
    GbpLocationRow,
    | 'maps_uri' | 'website_uri' | 'location_address'
    | 'auto_post_on_publish' | 'auto_post_enabled_at'
    | 'reviews_seen_update_time' | 'reviews_alerted_at'
  > & Partial<GbpLocationRow>,
): Promise<void> {
  // Moving the project to a DIFFERENT business turns automatic posting off: the
  // owner approved posting to the business they picked, not to the next one.
  // The old location's review marks go with it, for the same reason — they say
  // what the owner was told about a business this project no longer tracks.
  // Staying on the same location leaves all four untouched (an upsert writes
  // only the columns named here).
  const previous = await readProjectLocation(admin, row.project_id)
  const switched = previous !== null && previous.location_name !== row.location_name
  const { error } = await admin.from('project_gbp_locations').upsert({
    ...(switched
      ? {
          auto_post_on_publish: false,
          auto_post_enabled_at: null,
          reviews_seen_update_time: null,
          reviews_alerted_at: null,
        }
      : {}),
    project_id: row.project_id,
    user_id: row.user_id,
    connection_id: row.connection_id,
    account_name: row.account_name,
    location_name: row.location_name,
    location_title: row.location_title.slice(0, 300),
    location_address: row.location_address ?? null,
    website_uri: row.website_uri ?? null,
    maps_uri: row.maps_uri ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })
  if (error) throw fail(error)
}

/**
 * The alert marks after the owner has been told. `seenUpdateTime` is the newest
 * review updateTime Google reported; it is a time, never review content.
 */
export async function markReviewsSeen(admin: Admin, projectId: string, args: { seenUpdateTime: string | null; alertedAt?: string }): Promise<void> {
  const patch: Record<string, string | null> = { reviews_seen_update_time: args.seenUpdateTime }
  if (args.alertedAt) patch.reviews_alerted_at = args.alertedAt
  const { error } = await admin.from('project_gbp_locations').update(patch).eq('project_id', projectId)
  if (error) throw fail(error)
}

// ── posts ─────────────────────────────────────────────────────────────────
export async function listProjectPosts(admin: Admin, projectId: string, limit = 25): Promise<GbpPostRow[]> {
  const { data, error } = await admin.from('gbp_posts').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw fail(error)
  return (data as GbpPostRow[] | null) ?? []
}

export async function readProjectPost(admin: Admin, projectId: string, postId: string): Promise<GbpPostRow | null> {
  const { data, error } = await admin.from('gbp_posts').select('*').eq('id', postId).eq('project_id', projectId).maybeSingle()
  if (error) throw fail(error)
  return (data as GbpPostRow | null) ?? null
}

export async function insertPost(admin: Admin, row: {
  project_id: string; user_id: string; source_article_id: string | null; summary: string
  cta_type: GbpCtaType | null; cta_url: string | null; image_url: string | null; image_path: string | null
  language_code: GbpPostLanguage; scheduled_at: string
  /** Both default to false: a post the merchant wrote in the composer. */
  auto_created?: boolean; needs_ai_draft?: boolean
}): Promise<GbpPostRow> {
  const { data, error } = await admin.from('gbp_posts').insert({ ...row, status: 'scheduled' }).select('*').single()
  if (error || !data) throw fail(error ?? {})
  return data as GbpPostRow
}

/**
 * The owner's automatic-posting switch. Written only after the route proved they
 * own the project AND a location is connected: without a location there is
 * nothing to post to, so the switch has nowhere to live.
 */
export async function setAutoPostOnPublish(admin: Admin, projectId: string, on: boolean): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await admin.from('project_gbp_locations')
    // When they approved it is recorded, because we publish in their name with
    // nobody reading it first (legal thread, 2026-10-12). Turning it off clears it.
    .update({ auto_post_on_publish: on, auto_post_enabled_at: on ? now : null, updated_at: now })
    .eq('project_id', projectId)
    .select('project_id')
  if (error) throw fail(error)
  return !!data && data.length > 0
}

/**
 * Replace an automatic post's placeholder text with the AI draft, and only while
 * it is still waiting for one. Called by the cron just before publishing, so the
 * article's own publish path never waits for a model.
 */
export async function applyAutoDraft(admin: Admin, postId: string, summary: string): Promise<boolean> {
  const { data, error } = await admin.from('gbp_posts')
    .update({ summary, needs_ai_draft: false, updated_at: new Date().toISOString() })
    .eq('id', postId).eq('needs_ai_draft', true)
    .select('id')
  if (error) return false
  return !!data && data.length > 0
}

/**
 * Claim a due post for publishing: scheduled → publishing, atomically. Two
 * runners racing (the button and the cron) cannot both win.
 */
/**
 * How long a row may sit in 'publishing' before another pass may take it over.
 * A pass that dies mid-publish (a function timeout, a lost container) used to
 * leave the row claimed for ever, and nothing selects 'publishing', so the post
 * was never sent and never reported. Publishing immediately on an article's
 * publish makes that window matter, so the claim now expires.
 */
export const STALE_PUBLISHING_MS = 10 * 60 * 1000

/**
 * Claim one post for publishing. A 'scheduled' row is claimed outright; with
 * `staleBefore`, a row left in 'publishing' since before that moment is taken
 * over too. Two statements rather than one OR, so the common path is unchanged
 * and the takeover is explicit.
 */
export async function claimPost(admin: Admin, postId: string, staleBefore?: string): Promise<GbpPostRow | null> {
  const claim = async (apply: (q: ReturnType<ReturnType<Admin['from']>['update']>) => unknown) => {
    const q = admin.from('gbp_posts').update({ status: 'publishing', updated_at: new Date().toISOString() }).eq('id', postId)
    const { data, error } = await (apply(q) as ReturnType<typeof q.select>)
    if (error || !data || data.length === 0) return null
    return data[0] as GbpPostRow
  }
  const fresh = await claim((q) => q.eq('status', 'scheduled').select('*'))
  if (fresh || !staleBefore) return fresh
  return claim((q) => q.eq('status', 'publishing').lt('updated_at', staleBefore).select('*'))
}

export async function finishPost(admin: Admin, postId: string, patch:
  | { status: 'published'; googlePostName: string; googleState: GbpPostRow['google_state']; searchUrl: string | null; attempts: number }
  | { status: 'failed' | 'scheduled'; code: GbpErrorCode; attempts: number; retryAt?: string }): Promise<void> {
  const now = new Date().toISOString()
  const update = patch.status === 'published'
    ? { status: 'published', google_post_name: patch.googlePostName, google_state: patch.googleState, google_search_url: patch.searchUrl,
        last_error_code: null, published_at: now, attempts: patch.attempts, updated_at: now }
    : { status: patch.status, last_error_code: isGbpErrorCode(patch.code) ? patch.code : 'unexpected', attempts: patch.attempts,
        ...(patch.retryAt ? { scheduled_at: patch.retryAt } : {}), updated_at: now }
  await admin.from('gbp_posts').update(update).eq('id', postId)
}

export async function cancelPost(admin: Admin, projectId: string, postId: string): Promise<boolean> {
  const { data, error } = await admin.from('gbp_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', postId).eq('project_id', projectId).eq('status', 'scheduled')
    .select('id')
  if (error) throw fail(error)
  return !!data && data.length > 0
}

export async function duePostIds(admin: Admin, nowIso: string, limit: number): Promise<string[]> {
  const { data, error } = await admin.from('gbp_posts').select('id').eq('status', 'scheduled').lte('scheduled_at', nowIso).order('scheduled_at', { ascending: true }).limit(limit)
  if (error) throw fail(error)
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id)
}

/** Posts stuck in 'publishing' since before `beforeIso`: a pass died holding them. */
export async function stalePublishingIds(admin: Admin, beforeIso: string, limit: number): Promise<string[]> {
  const { data, error } = await admin.from('gbp_posts').select('id').eq('status', 'publishing').lt('updated_at', beforeIso)
    .order('updated_at', { ascending: true }).limit(limit)
  if (error) throw fail(error)
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id)
}

export async function updateGoogleState(admin: Admin, postId: string, state: GbpPostRow['google_state']): Promise<void> {
  await admin.from('gbp_posts').update({ google_state: state, updated_at: new Date().toISOString() }).eq('id', postId)
}
