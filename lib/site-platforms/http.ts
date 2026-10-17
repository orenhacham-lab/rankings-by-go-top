/**
 * The HTTP handlers behind /api/site-platforms/* and the manual Wix / webhook
 * publish route. Thin route files pass real dependencies; the QA suite passes
 * fakes (an in-memory admin, a fake Wix, a fake network) and reads exactly what
 * a browser would receive.
 *
 * Every handler:
 *   - authenticates and proves project ownership first (`auth`), because
 *     proxy.ts does not cover /api/*;
 *   - uses the service-role client only with `.eq('project_id', <owned id>)`;
 *   - answers with a stable code, never a provider's words;
 *   - never puts a secret in a response, except the ONE response that creates a
 *     webhook secret, which returns it once so the owner can copy it.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential, isCredentialsCryptoConfigured } from '@/lib/security/credentials-crypto'
import { admitWebhookUrl, type Resolver, type Transport } from './outbound'
import { buildTestPayload, deliverWebhook } from './webhook'
import { testWixConnection, type FetchLike } from './wix'
import { generateWebhookSecret, isWixSiteId, looksLikeWixApiKey, maskSecret } from './secrets'
import { loadSiteConnection, loadSwitchLock, markSiteConnection, readSiteConnection, SITE_TABLE, isMissingRelation } from './store'
import { publishArticleToSite, type SiteAdapter } from './publish'
import { sanitizeSiteConnection, type SiteConnectionRow, type SiteErrorCode, type SitePlatform } from './types'

type Admin = ReturnType<typeof createAdminClient>
export type AuthResult =
  | { error: string; status: 401 | 403 | 404 | 400 }
  | { user: { id: string }; admin: Admin; project: { id: string; user_id: string } }

export type SiteRouteDeps = {
  enabled: () => boolean
  auth: (projectId: string | null | undefined) => Promise<AuthResult>
  /** Service-role client, for the one pre-auth read (an article's project id). */
  admin: () => Admin
  wixFetch?: FetchLike
  resolver?: Resolver
  transport?: Transport
  adapters?: Record<SitePlatform, SiteAdapter>
  now?: () => Date
}

const json = (body: unknown, status = 200) => Response.json(body, { status })
const fail = (code: SiteErrorCode, status: number) => json({ error: code, reason: code }, status)
const notFound = () => json({ error: 'Not found' }, 404)

async function body(request: Request): Promise<Record<string, unknown>> {
  try { const b = await request.json(); return b && typeof b === 'object' ? b as Record<string, unknown> : {} } catch { return {} }
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Normalize an optional public site address; only an https URL of a public-looking host is kept. */
function siteUrlOrNull(raw: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (u.username || u.password || !/\./.test(u.hostname)) return null
    u.protocol = 'https:'
    u.hash = ''
    return u.toString().slice(0, 2048)
  } catch { return null }
}

// ── GET /api/site-platforms/connection?projectId= ──────────────────────────
export async function handleGetConnection(request: Request, deps: SiteRouteDeps): Promise<Response> {
  if (!deps.enabled()) return notFound()
  const auth = await deps.auth(new URL(request.url).searchParams.get('projectId'))
  if ('error' in auth) return json({ error: auth.error }, auth.status)
  const [read, lock] = await Promise.all([readSiteConnection(auth.admin, auth.project.id), loadSwitchLock(auth.admin, auth.user.id, auth.project.id)])
  if (!read.ok) return fail('unexpected', 500)
  return json({ connection: read.row ? sanitizeSiteConnection(read.row) : null, switchLocked: lock.locked })
}

// ── POST /api/site-platforms/connection ────────────────────────────────────
export async function handleSaveConnection(request: Request, deps: SiteRouteDeps): Promise<Response> {
  if (!deps.enabled()) return notFound()
  const b = await body(request)
  const auth = await deps.auth(str(b.projectId))
  if ('error' in auth) return json({ error: auth.error }, auth.status)
  const platform = str(b.platform)
  if (platform !== 'wix' && platform !== 'webhook') return fail('unexpected', 400)

  const lock = await loadSwitchLock(auth.admin, auth.user.id, auth.project.id)
  if (lock.locked) return fail('platform_switch_locked', 409)
  // One platform per project, enforced here and not only in the modal: the
  // modal disconnects WordPress / Shopify through their own routes first.
  if (lock.rows.wordpress || lock.rows.shopify) return json({ error: 'platform_already_connected', reason: 'platform_already_connected', platform: lock.rows.wordpress ? 'wordpress' : 'shopify' }, 409)
  if (!isCredentialsCryptoConfigured()) {
    console.error('[site-platform] encryption key missing, refusing to save credentials')
    return fail('encryption_unavailable', 500)
  }

  const read = await readSiteConnection(auth.admin, auth.project.id)
  if (!read.ok) return fail('unexpected', 500)
  const existing = read.row
  const now = (deps.now?.() ?? new Date()).toISOString()
  const siteUrl = siteUrlOrNull(str(b.siteUrl))

  let row: Partial<SiteConnectionRow>
  let revealSecret: string | null = null

  if (platform === 'wix') {
    const siteId = str(b.siteId).toLowerCase()
    if (!isWixSiteId(siteId)) return fail('invalid_site_id', 400)
    let apiKey = str(b.apiKey)
    if (!apiKey) {
      // Editing the site URL of an existing Wix pair may leave the key blank.
      const kept = existing?.platform === 'wix' && existing.wix_site_id === siteId ? await loadSiteConnection(auth.admin, auth.project.id, { allowInactive: true }) : null
      if (!kept || !kept.ok || kept.conn.platform !== 'wix') return fail('invalid_api_key', 400)
      apiKey = kept.conn.apiKey
    } else if (!looksLikeWixApiKey(apiKey)) {
      return fail('invalid_api_key', 400)
    }
    const test = await testWixConnection({ siteId, apiKey }, deps.wixFetch)
    if (!test.ok) return fail(test.code, test.code === 'wix_unavailable' ? 503 : 400)
    row = {
      platform: 'wix', wix_site_id: siteId, wix_member_id: test.memberId, endpoint_url: null, site_url: siteUrl,
      secret_encrypted: encryptCredential(apiKey), secret_hint: maskSecret(apiKey),
      connection_status: 'connected', last_error_code: null, last_tested_at: now,
    }
  } else {
    const admitted = await admitWebhookUrl(str(b.endpointUrl), deps.resolver)
    if (!admitted.ok) return fail(admitted.code, 400)
    // A new secret for a new connection (or on request); an edited URL keeps the secret.
    const keep = existing?.platform === 'webhook' && b.rotateSecret !== true
    let secretEncrypted = existing?.secret_encrypted ?? ''
    let hint = existing?.secret_hint ?? ''
    if (!keep) {
      revealSecret = generateWebhookSecret()
      secretEncrypted = encryptCredential(revealSecret)
      hint = maskSecret(revealSecret, 'whsec_')
    }
    row = {
      platform: 'webhook', endpoint_url: admitted.url.toString(), wix_site_id: null, wix_member_id: null,
      site_url: siteUrl ?? `${admitted.url.protocol}//${admitted.url.hostname}/`,
      secret_encrypted: secretEncrypted, secret_hint: hint,
      connection_status: 'connected', last_error_code: null, last_tested_at: null,
    }
  }

  const write = await auth.admin.from(SITE_TABLE)
    .upsert({ ...row, user_id: auth.user.id, project_id: auth.project.id, updated_at: now }, { onConflict: 'project_id' })
    .select('*').single()
  if (write.error || !write.data) {
    console.error('[site-platform] save failed', { platform, code: (write.error as { code?: string } | null)?.code ?? 'unknown' })
    return fail('save_failed', 500)
  }
  console.log('[site-platform] connection saved', { platform })
  return json({
    connection: sanitizeSiteConnection(write.data as SiteConnectionRow),
    // Shown ONCE. Every later read carries only secret_hint.
    ...(revealSecret ? { secret: revealSecret } : {}),
  })
}

// ── DELETE /api/site-platforms/connection?projectId= ───────────────────────
export async function handleDeleteConnection(request: Request, deps: SiteRouteDeps): Promise<Response> {
  if (!deps.enabled()) return notFound()
  const auth = await deps.auth(new URL(request.url).searchParams.get('projectId'))
  if ('error' in auth) return json({ error: auth.error }, auth.status)
  const lock = await loadSwitchLock(auth.admin, auth.user.id, auth.project.id)
  if (lock.locked) return fail('platform_switch_locked', 409)
  // The post pointers point at the site being disconnected; a later connection
  // (another Wix site, another endpoint) must not read them as "already there".
  // The articles and their published status stay.
  const cleared = await auth.admin.from('generated_articles')
    .update({ site_post_platform: null, site_post_id: null, site_post_url: null })
    .eq('project_id', auth.project.id)
  if (cleared.error && !isMissingRelation(cleared.error)) return fail('unexpected', 500)
  const { error } = await auth.admin.from(SITE_TABLE).delete().eq('project_id', auth.project.id)
  if (error && !isMissingRelation(error)) return fail('unexpected', 500)
  console.log('[site-platform] connection removed')
  return json({ success: true })
}

// ── POST /api/site-platforms/test ──────────────────────────────────────────
// { projectId, platform: 'wix', siteId, apiKey }  → tests an UNSAVED pair (the modal)
// { projectId }                                    → tests the saved connection:
//                                                     Wix: one read; webhook: a signed test event
export async function handleTest(request: Request, deps: SiteRouteDeps): Promise<Response> {
  if (!deps.enabled()) return notFound()
  const b = await body(request)
  const auth = await deps.auth(str(b.projectId))
  if ('error' in auth) return json({ error: auth.error }, auth.status)

  if (str(b.platform) === 'wix' && str(b.apiKey)) {
    const siteId = str(b.siteId).toLowerCase()
    const apiKey = str(b.apiKey)
    if (!isWixSiteId(siteId)) return json({ ok: false, code: 'invalid_site_id' })
    if (!looksLikeWixApiKey(apiKey)) return json({ ok: false, code: 'invalid_api_key' })
    const t = await testWixConnection({ siteId, apiKey }, deps.wixFetch)
    return json(t.ok ? { ok: true } : { ok: false, code: t.code })
  }
  if (str(b.platform) === 'webhook' && str(b.endpointUrl)) {
    const admitted = await admitWebhookUrl(str(b.endpointUrl), deps.resolver)
    return json(admitted.ok ? { ok: true } : { ok: false, code: admitted.code })
  }

  const loaded = await loadSiteConnection(auth.admin, auth.project.id, { allowInactive: true })
  if (!loaded.ok) return json({ ok: false, code: loaded.code })
  const conn = loaded.conn
  if (conn.platform === 'wix') {
    const t = await testWixConnection({ siteId: conn.siteId, apiKey: conn.apiKey }, deps.wixFetch)
    if (t.ok) {
      await markSiteConnection(auth.admin, auth.project.id, { status: 'connected', code: null })
      if (t.memberId && t.memberId !== conn.memberId) {
        await auth.admin.from(SITE_TABLE).update({ wix_member_id: t.memberId }).eq('project_id', auth.project.id)
      }
      return json({ ok: true })
    }
    // A Wix outage says nothing about the pair: the status is left as it was.
    if (t.code !== 'wix_unavailable') await markSiteConnection(auth.admin, auth.project.id, { status: 'failed', code: t.code })
    return json({ ok: false, code: t.code })
  }
  const sent = await deliverWebhook(conn.endpointUrl, conn.secret, buildTestPayload(deps.now?.() ?? new Date()), {
    resolver: deps.resolver, transport: deps.transport, now: deps.now,
  })
  if (sent.ok) {
    await markSiteConnection(auth.admin, auth.project.id, { status: 'connected', code: null })
    return json({ ok: true })
  }
  await markSiteConnection(auth.admin, auth.project.id, { status: 'failed', code: sent.code })
  return json({ ok: false, code: sent.code, ...(sent.status ? { httpStatus: sent.status } : {}) })
}

// ── POST /api/content/articles/:id/site-platform ───────────────────────────
export async function handlePublishArticle(articleId: string, deps: SiteRouteDeps): Promise<Response> {
  if (!deps.enabled()) return notFound()
  const { data: art } = await deps.admin().from('generated_articles').select('project_id').eq('id', articleId).maybeSingle()
  if (!art) return json({ error: 'Article not found' }, 404)
  const auth = await deps.auth((art as { project_id: string }).project_id)
  if ('error' in auth) return json({ error: auth.error }, auth.status)
  const out = await publishArticleToSite(auth.admin, auth.project.id, articleId, {
    fetch: deps.wixFetch, webhook: { resolver: deps.resolver, transport: deps.transport, now: deps.now }, adapters: deps.adapters,
  })
  if (!out.ok) {
    const status = out.code === 'no_site_connection' || out.code === 'article_empty' ? 400
      : out.code === 'site_connection_inactive' || out.code === 'wix_auth_failed' ? 409
      : out.code === 'article_missing' ? 404
      : out.retryable ? 503 : 502
    return json({ error: out.code, reason: out.code, platform: out.platform }, status)
  }
  return json({ ok: true, platform: out.platform, site_post_id: out.postId, site_post_url: out.url, reconciled: out.reconciled })
}
