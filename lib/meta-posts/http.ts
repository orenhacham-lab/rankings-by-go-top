/**
 * The /api/meta/* handlers, with their collaborators injected so a guard can run
 * them against FakeAdmin and a fake Graph API. The route files are a few lines.
 *
 * Every project handler:
 *   - is reached only when META_POSTS_ENABLED is 'true' (the route checks first);
 *   - proves the caller owns the project (authContentProject) before touching data;
 *   - answers `not_available` while the tables are not applied;
 *   - returns stable codes, never a provider's or database's words;
 *   - never returns a token, and never takes an image address from the browser:
 *     a post's photo is rebuilt from the project's own article.
 *
 * APPROVAL. Creating a post only ever writes drafts. A draft goes out only
 * after /api/meta/approve, which is the single place that writes approved_at,
 * and the database refuses a scheduled or published row without it.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { ContentAuthResult } from '@/lib/content/api-auth'
import { isGscTokenCryptoConfigured } from '@/lib/gsc/token-crypto'
import { isMetaOAuthConfigured, getMetaAppSecret, META_APP_NAME } from './config'
import { MetaApiError, type MetaErrorCode } from './errors'
import {
  buildMetaAuthUrl, exchangeMetaCode, fetchMetaIdentity, grantsRequiredScopes, listMetaPages, revokeMetaPermissions,
  type MetaPage, type MetaUserToken,
} from './oauth'
import { validatePost, validateBody, normalizeMetaLanguage, type MetaValidationCode } from './validate'
import { draftMetaPost, type MetaGenerate } from './draft'
import { publishPost, defaultPublishDeps, type PublishDeps } from './publish'
import { parseSignedRequest } from './signed-request'
import {
  metaTablesPresent, MetaStoreError, createMetaOAuthState, consumeMetaOAuthState, readMetaConnection, storeMetaConnection,
  deleteMetaConnection, decryptUserToken, readProjectPage, saveProjectPage, listProjectPosts, insertDrafts, updateDraftBody,
  approveGroup, cancelGroup, readProjectPost, markMetaConnection, deauthorizeFbUser, deleteFbUserData, recordDeletionRequest,
  type MetaPostRow, type MetaConnectionRow,
} from './store'

type Admin = ReturnType<typeof createAdminClient>
export type Authed = Exclude<ContentAuthResult, { error: string }>

export interface MetaRouteDeps {
  auth: (projectId: string | null) => Promise<ContentAuthResult>
  exchange?: (code: string) => Promise<MetaUserToken>
  identity?: (userToken: string) => Promise<{ userId: string; granted: string[] }>
  fetchPages?: (userToken: string) => Promise<MetaPage[]>
  generate?: MetaGenerate
  publish?: PublishDeps
  authUrl?: (state: string) => string
  revoke?: (fbUserId: string, userToken: string) => Promise<boolean>
}

export const json = (body: unknown, status = 200) => Response.json(body, { status })
type ErrCode = MetaErrorCode | 'invalid_request' | 'forbidden' | 'unauthorized' | 'not_found'
export const err = (code: ErrCode, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, error: code, ...extra }, status)

export async function gate(deps: MetaRouteDeps, projectId: string | null): Promise<Authed | Response> {
  const auth = await deps.auth(projectId)
  if ('error' in auth) {
    const code = auth.status === 401 ? 'unauthorized' : auth.status === 403 ? 'forbidden' : auth.status === 404 ? 'not_found' : 'invalid_request'
    return err(code, auth.status)
  }
  try {
    if (!(await metaTablesPresent(auth.admin))) return err('not_available', 409, { reason: 'schema' })
  } catch { return err('unexpected', 500) }
  return auth
}
const storeFail = (e: unknown) => (e instanceof MetaStoreError && e.code === 'missing' ? err('not_available', 409, { reason: 'schema' }) : err('unexpected', 500))

export function sanitizePost(p: MetaPostRow) {
  return {
    id: p.id, groupId: p.group_id, target: p.target, body: p.body, linkUrl: p.link_url, imageUrl: p.image_url,
    status: p.status, approvedAt: p.approved_at, scheduledAt: p.scheduled_at, publishedAt: p.published_at,
    permalink: p.remote_permalink, errorCode: p.last_error_code, createdAt: p.created_at, sourceArticleId: p.source_article_id,
  }
}
export function sanitizeConnection(c: MetaConnectionRow | null) {
  return c ? { status: c.status, errorCode: c.last_error_code, updatedAt: c.updated_at } : null
}

const articleImage = (a: Record<string, unknown>): string | null =>
  typeof a.featured_image_url === 'string' && /^https:\/\//.test(a.featured_image_url) ? a.featured_image_url : null
const articleUrl = (a: Record<string, unknown>): string | null => {
  for (const k of ['wp_post_url', 'shopify_article_url', 'site_post_url']) {
    const v = a[k]
    if (typeof v === 'string' && /^https:\/\//.test(v)) return v
  }
  return null
}

// ── GET /api/meta/status?projectId= ───────────────────────────────────────
export async function handleStatus(req: Request, deps: MetaRouteDeps): Promise<Response> {
  const projectId = new URL(req.url).searchParams.get('projectId')
  const auth = await deps.auth(projectId)
  if ('error' in auth) return err(auth.status === 401 ? 'unauthorized' : auth.status === 403 ? 'forbidden' : 'not_found', auth.status)
  try { if (!(await metaTablesPresent(auth.admin))) return json({ ok: true, state: 'unavailable' }) } catch { return err('unexpected', 500) }
  try {
    const [connection, page, posts] = await Promise.all([
      readMetaConnection(auth.admin, auth.user.id), readProjectPage(auth.admin, auth.project.id), listProjectPosts(auth.admin, auth.project.id),
    ])
    const { data: project } = await auth.admin.from('projects').select('target_domain').eq('id', auth.project.id).maybeSingle()
    const { data: arts } = await auth.admin.from('generated_articles')
      .select('id, title, status, featured_image_url, wp_post_url, shopify_article_url, site_post_url')
      .eq('project_id', auth.project.id).in('status', ['published', 'ready', 'scheduled']).order('created_at', { ascending: false }).limit(30)
    const p = (project ?? {}) as { target_domain?: string | null }
    const own = !!(page && connection?.id && page.connection_id === connection.id)
    return json({
      ok: true, state: 'ready', appName: META_APP_NAME,
      configured: isMetaOAuthConfigured() && isGscTokenCryptoConfigured(),
      connection: sanitizeConnection(connection),
      // A page saved under a connection that is not this user's is ignored.
      page: own && page ? { name: page.page_name, pageId: page.page_id, instagramUsername: page.ig_username, hasInstagram: !!page.ig_user_id } : null,
      posts: posts.map(sanitizePost),
      siteUrl: p.target_domain ? (/^https?:\/\//.test(p.target_domain) ? p.target_domain : `https://${p.target_domain}`) : null,
      articles: ((arts ?? []) as Record<string, unknown>[]).map((a) => ({ id: String(a.id), title: String(a.title ?? ''), url: articleUrl(a), imageUrl: articleImage(a) })),
    })
  } catch (e) { return storeFail(e) }
}

// ── POST /api/meta/connect {projectId} ────────────────────────────────────
export async function handleConnect(req: Request, deps: MetaRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  if (!isMetaOAuthConfigured() || !isGscTokenCryptoConfigured()) return err('not_available', 503, { reason: 'not_configured' })
  try {
    const state = await createMetaOAuthState(g.admin, { userId: g.user.id, projectId: g.project.id })
    return json({ ok: true, authUrl: (deps.authUrl ?? buildMetaAuthUrl)(state) })
  } catch (e) { return storeFail(e) }
}

// ── GET /api/meta/callback?code&state ─────────────────────────────────────
/** The only GET that writes, and only after consuming its one-time state. The return address is fixed. */
export async function handleCallback(req: Request, deps: MetaRouteDeps & { sessionUserId: () => Promise<string | null>; admin: () => Admin }): Promise<Response> {
  const url = new URL(req.url)
  const back = (projectId: string | null, result: string) => {
    const to = new URL(projectId ? '/social-posts' : '/projects', url.origin)
    if (projectId) to.searchParams.set('projectId', projectId)
    to.searchParams.set('meta', result)
    return Response.redirect(to.toString(), 303)
  }
  const userId = await deps.sessionUserId()
  if (!userId) return back(null, 'unauthenticated')
  const admin = deps.admin()
  const consumed = await consumeMetaOAuthState(admin, { rawState: url.searchParams.get('state') ?? '', userId }).catch(() => null)
  if (!consumed) return back(null, 'invalid_state')
  const pid = consumed.projectId
  if (url.searchParams.get('error')) return back(pid, 'access_denied')
  const code = url.searchParams.get('code')
  if (!code) return back(pid, 'oauth_error')
  let token: MetaUserToken
  let who: { userId: string; granted: string[] }
  try {
    token = await (deps.exchange ?? ((c: string) => exchangeMetaCode(c)))(code)
    who = await (deps.identity ?? ((t: string) => fetchMetaIdentity(t)))(token.accessToken)
  } catch (e) {
    return back(pid, e instanceof MetaApiError && e.code === 'meta_unavailable' ? 'meta_unavailable' : 'oauth_error')
  }
  // The consent screen lets a person untick permissions; without the required ones there is nothing to store.
  if (!grantsRequiredScopes(who.granted)) return back(pid, 'scope_missing')
  try {
    await storeMetaConnection(admin, userId, { fbUserId: who.userId, userToken: token.accessToken, scopes: who.granted, expiresAt: token.expiresAt })
  } catch { return back(pid, 'store_failed') }
  return back(pid, 'connected')
}

// ── GET|POST /api/meta/pages ──────────────────────────────────────────────
async function userPages(g: Authed, deps: MetaRouteDeps): Promise<{ ok: true; conn: MetaConnectionRow; list: MetaPage[] } | { ok: false; res: Response }> {
  let conn: MetaConnectionRow | null
  try { conn = await readMetaConnection(g.admin, g.user.id) } catch (e) { return { ok: false, res: storeFail(e) } }
  if (!conn) return { ok: false, res: err('not_connected', 409) }
  if (conn.status !== 'connected') return { ok: false, res: err('reauth_required', 409) }
  const token = decryptUserToken(conn)
  if (!token) return { ok: false, res: err('reauth_required', 409) }
  try {
    return { ok: true, conn, list: await (deps.fetchPages ?? ((t: string) => listMetaPages(t)))(token) }
  } catch (e) {
    const code = e instanceof MetaApiError ? e.code : 'unexpected'
    if (code === 'reauth_required') await markMetaConnection(g.admin, g.user.id, 'reauth_required', 'reauth_required')
    return { ok: false, res: err(code, 502) }
  }
}

export async function handleListPages(req: Request, deps: MetaRouteDeps): Promise<Response> {
  const g = await gate(deps, new URL(req.url).searchParams.get('projectId'))
  if (g instanceof Response) return g
  const r = await userPages(g, deps)
  if (!r.ok) return r.res
  // The list never carries a token.
  return json({ ok: true, pages: r.list.map((p) => ({ pageId: p.pageId, name: p.name, instagramUsername: p.igUsername, hasInstagram: !!p.igUserId })) })
}

export async function handleSelectPage(req: Request, deps: MetaRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  const r = await userPages(g, deps)
  if (!r.ok) return r.res
  // Only a page Meta lists for THIS person; the name, ids and token come from Meta, not from the request.
  const pick = r.list.find((p) => p.pageId === body.pageId)
  if (!pick) return err('page_not_found', 404)
  try {
    await saveProjectPage(g.admin, {
      project_id: g.project.id, user_id: g.user.id, connection_id: r.conn.id, page_id: pick.pageId, page_name: pick.name,
      page_token: pick.accessToken, ig_user_id: pick.igUserId, ig_username: pick.igUsername,
    })
  } catch (e) { return storeFail(e) }
  return json({ ok: true })
}

// ── DELETE /api/meta/connection?projectId= ────────────────────────────────
/** Disconnect: asks Meta to revoke our permissions, then deletes the stored tokens and the saved pages. Post history stays. */
export async function handleDisconnect(req: Request, deps: MetaRouteDeps): Promise<Response> {
  const g = await gate(deps, new URL(req.url).searchParams.get('projectId'))
  if (g instanceof Response) return g
  try {
    const conn = await readMetaConnection(g.admin, g.user.id)
    if (conn) {
      const token = decryptUserToken(conn)
      if (token) await (deps.revoke ?? revokeMetaPermissions)(conn.fb_user_id, token)
      await deleteMetaConnection(g.admin, g.user.id)
    }
  } catch (e) { return storeFail(e) }
  return json({ ok: true })
}

// ── POST /api/meta/draft {projectId, articleId? | topic?, language?} ──────
export async function handleDraft(req: Request, deps: MetaRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  const language = normalizeMetaLanguage(body.language) ?? 'en'
  let article: { title: string; description: string | null } | null = null
  if (typeof body.articleId === 'string' && body.articleId) {
    const { data } = await g.admin.from('generated_articles').select('title, meta_description, excerpt').eq('id', body.articleId).eq('project_id', g.project.id).maybeSingle()
    if (!data) return err('not_found', 404)
    const a = data as { title?: string | null; meta_description?: string | null; excerpt?: string | null }
    article = { title: String(a.title ?? '').slice(0, 300), description: (a.meta_description || a.excerpt || null)?.slice(0, 600) ?? null }
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 300) : ''
  if (!article && !topic) return err('invalid_request', 400)
  const out = await draftMetaPost({ language, article, topic: article ? null : topic }, deps.generate)
  if (!out.ok) return err('draft_unavailable', 502)
  return json({ ok: true, body: out.body })
}

// ── POST /api/meta/posts {projectId, body, targets[], articleId?, link?, language?} → drafts ──
export async function handleCreateDrafts(req: Request, deps: MetaRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  let page
  try { page = await readProjectPage(g.admin, g.project.id) } catch (e) { return storeFail(e) }
  if (!page) return err('no_page', 409)

  const { data: project } = await g.admin.from('projects').select('target_domain').eq('id', g.project.id).maybeSingle()
  // The photo is the featured image of an article of THIS project, never an address from the request.
  let imageUrl: string | null = null
  let sourceArticleId: string | null = null
  if (typeof body.articleId === 'string' && body.articleId) {
    const { data } = await g.admin.from('generated_articles').select('id, featured_image_url').eq('id', body.articleId).eq('project_id', g.project.id).maybeSingle()
    if (data) { sourceArticleId = String((data as { id: string }).id); imageUrl = articleImage(data as Record<string, unknown>) }
  }
  const checked = validatePost({
    body: body.body, targets: body.targets, link: body.link, siteUrl: (project as { target_domain?: string | null } | null)?.target_domain ?? null,
    imageUrl, hasInstagram: !!page.ig_user_id,
  })
  if (!checked.ok) return json({ ok: false, error: 'invalid_post', fields: checked.errors satisfies MetaValidationCode[] }, 400)

  const groupId = crypto.randomUUID()
  try {
    const rows = await insertDrafts(g.admin, checked.value.targets.map((target) => ({
      project_id: g.project.id, user_id: g.user.id, group_id: groupId, target, source_article_id: sourceArticleId,
      body: checked.value.body, link_url: checked.value.link,
      // A text post on Facebook carries no photo only when the owner chose none; Instagram always has one (validated).
      image_url: imageUrl, language_code: normalizeMetaLanguage(body.language) ?? 'en', scheduled_at: new Date().toISOString(),
    })))
    return json({ ok: true, groupId, posts: rows.map(sanitizePost) })
  } catch (e) { return storeFail(e) }
}

// ── PATCH /api/meta/posts {projectId, groupId, body} (edit a draft) ───────
export async function handleEditDraft(req: Request, deps: MetaRouteDeps): Promise<Response> {
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof b.projectId === 'string' ? b.projectId : null)
  if (g instanceof Response) return g
  if (typeof b.groupId !== 'string' || !/^[0-9a-f-]{36}$/.test(b.groupId)) return err('invalid_request', 400)
  const v = validateBody(b.body)
  if (!v.ok) return json({ ok: false, error: 'invalid_post', fields: [v.code] }, 400)
  try {
    return (await updateDraftBody(g.admin, g.project.id, b.groupId, v.body)) ? json({ ok: true }) : err('not_found', 404)
  } catch (e) { return storeFail(e) }
}

// ── POST /api/meta/approve {projectId, groupId, scheduledAt?} ─────────────
/**
 * The owner's approval of exactly the text on screen. Without scheduledAt the
 * post goes out now, in this request; with it, at that time. The post is
 * published only if a connected page is saved, and only from the draft state.
 */
export async function handleApprove(req: Request, deps: MetaRouteDeps): Promise<Response> {
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof b.projectId === 'string' ? b.projectId : null)
  if (g instanceof Response) return g
  if (typeof b.groupId !== 'string' || !/^[0-9a-f-]{36}$/.test(b.groupId)) return err('invalid_request', 400)

  let when: string
  if (b.scheduledAt) {
    const t = typeof b.scheduledAt === 'string' ? Date.parse(b.scheduledAt) : NaN
    const now = Date.now()
    if (!Number.isFinite(t)) return json({ ok: false, error: 'invalid_post', fields: ['schedule_invalid'] }, 400)
    if (t < now + 5 * 60_000) return json({ ok: false, error: 'invalid_post', fields: ['schedule_in_past'] }, 400)
    if (t > now + 365 * 86_400_000) return json({ ok: false, error: 'invalid_post', fields: ['schedule_too_far'] }, 400)
    when = new Date(t).toISOString()
  } else when = new Date().toISOString()

  try {
    const [conn, page] = await Promise.all([readMetaConnection(g.admin, g.user.id), readProjectPage(g.admin, g.project.id)])
    if (!conn || conn.status !== 'connected') return err('not_connected', 409)
    if (!page || page.connection_id !== conn.id || page.user_id !== g.user.id) return err('no_page', 409)
    const rows = await approveGroup(g.admin, g.project.id, g.user.id, b.groupId, when)
    if (rows.length === 0) return err('not_found', 404)
    if (b.scheduledAt) return json({ ok: true, outcome: 'scheduled', posts: rows.map(sanitizePost) })
    const results: Array<{ id: string; ok: boolean; code: string | null }> = []
    for (const r of rows) {
      const out = await publishPost(g.admin, r.id, deps.publish ?? defaultPublishDeps)
      results.push({ id: r.id, ok: out.ok, code: out.ok ? null : out.code })
    }
    const fresh = await Promise.all(rows.map((r) => readProjectPost(g.admin, g.project.id, r.id).catch(() => null)))
    return json({ ok: true, outcome: results.every((x) => x.ok) ? 'published' : 'partial', results, posts: fresh.filter((x): x is MetaPostRow => !!x).map(sanitizePost) })
  } catch (e) { return storeFail(e) }
}

// ── DELETE /api/meta/posts?projectId=&groupId= (cancel what has not gone out) ──
export async function handleCancel(req: Request, deps: MetaRouteDeps): Promise<Response> {
  const u = new URL(req.url)
  const g = await gate(deps, u.searchParams.get('projectId'))
  if (g instanceof Response) return g
  const groupId = u.searchParams.get('groupId') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(groupId)) return err('not_found', 404)
  try { return (await cancelGroup(g.admin, g.project.id, groupId)) ? json({ ok: true }) : err('not_found', 404) } catch (e) { return storeFail(e) }
}

// ── Meta's callbacks: POST (form) with signed_request ─────────────────────
const CALLBACK_BASE = 'https://www.gotopseo.com'

async function signedUser(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  let secret: string
  try { secret = getMetaAppSecret() } catch { return { ok: false, res: json({ error: 'not_configured' }, 503) } }
  let raw: unknown = null
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) raw = (await req.formData()).get('signed_request')
    else raw = (await req.json() as { signed_request?: unknown }).signed_request
  } catch { /* falls through to refusal */ }
  const parsed = parseSignedRequest(raw, secret)
  return parsed.ok ? { ok: true, userId: parsed.userId } : { ok: false, res: json({ error: 'invalid_signature' }, 400) }
}

/** POST /api/meta/data-deletion — Meta's Data Deletion Request Callback. Answers {url, confirmation_code}. */
export async function handleDataDeletion(req: Request, deps: { admin: () => Admin }): Promise<Response> {
  const who = await signedUser(req)
  if (!who.ok) return who.res
  const admin = deps.admin()
  try {
    if (!(await metaTablesPresent(admin))) return json({ error: 'not_available' }, 503)
    await deleteFbUserData(admin, who.userId)
    const code = await recordDeletionRequest(admin, 'deletion', 'completed')
    return json({ url: `${CALLBACK_BASE}/en/data-deletion?code=${code}`, confirmation_code: code })
  } catch {
    console.error('[meta-deletion] failed')
    return json({ error: 'unexpected' }, 500)
  }
}

/** POST /api/meta/deauthorize — the person removed the app at Facebook: tokens and saved pages go at once. */
export async function handleDeauthorize(req: Request, deps: { admin: () => Admin }): Promise<Response> {
  const who = await signedUser(req)
  if (!who.ok) return who.res
  const admin = deps.admin()
  try {
    if (!(await metaTablesPresent(admin))) return json({ error: 'not_available' }, 503)
    await deauthorizeFbUser(admin, who.userId)
    await recordDeletionRequest(admin, 'deauthorize', 'completed')
    return json({ ok: true })
  } catch {
    console.error('[meta-deauthorize] failed')
    return json({ error: 'unexpected' }, 500)
  }
}
