/**
 * The /api/gbp/* handlers, with their collaborators injected so a guard can run
 * them against FakeAdmin and a fake Google. The route files are one line each.
 *
 * Every handler:
 *   - is reached only when GBP_POSTS_ENABLED is 'true' (the route checks first);
 *   - proves the caller owns the project (authContentProject) before touching data;
 *   - refuses a Shopify project (the live Shopify app is never changed by this);
 *   - answers `not_available` while the tables are not applied;
 *   - returns stable codes, never a provider's or database's words.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { ContentAuthResult } from '@/lib/content/api-auth'
import { isGscTokenCryptoConfigured } from '@/lib/gsc/token-crypto'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/featured-image'
import { isGbpOAuthConfigured } from './config'
import { GbpApiError, type GbpErrorCode } from './errors'
import { buildGbpAuthUrl, createPkcePair, exchangeGbpCode, grantIncludesGbpScope, revokeGbpToken } from './oauth'
import { listAllLocations, type GbpLocation } from './api'
import { validatePostInput, GBP_CTA_TYPES } from './validate'
import { preparePostImage, GBP_SOURCE_TYPES, GBP_SOURCE_MAX_BYTES, type CropBox } from './image'
import { draftPost, type Generate } from './draft'
import { publishPost, accessTokenFor, defaultPublishDeps, type PublishDeps } from './publish'
import {
  gbpTablesPresent, GbpStoreError, createGbpOAuthState, consumeGbpOAuthState, readGbpConnection, storeGbpConnection,
  deleteGbpConnection, decryptRefreshToken, readProjectLocation, saveProjectLocation, listProjectPosts, insertPost,
  readProjectPost, cancelPost, type GbpPostRow, type GbpConnectionRow,
} from './store'

type Admin = ReturnType<typeof createAdminClient>
type Authed = Exclude<ContentAuthResult, { error: string }>

export interface GbpRouteDeps {
  auth: (projectId: string | null) => Promise<ContentAuthResult>
  isShopifyProject: (admin: Admin, userId: string, projectId: string) => Promise<boolean>
  fetchLocations?: (accessToken: string) => Promise<GbpLocation[]>
  exchange?: (code: string, verifier: string) => Promise<{ accessToken: string; refreshToken?: string; scope: string }>
  generate?: Generate
  publish?: PublishDeps
  authUrl?: (state: string, challenge: string) => string
}

const json = (body: unknown, status = 200) => Response.json(body, { status })
const err = (code: GbpErrorCode | 'invalid_request' | 'forbidden' | 'unauthorized' | 'not_found', status: number, extra: Record<string, unknown> = {}) =>
  json({ ok: false, error: code, ...extra }, status)

/** Auth + Shopify + schema gate shared by every project-scoped handler. */
async function gate(deps: GbpRouteDeps, projectId: string | null): Promise<Authed | Response> {
  const auth = await deps.auth(projectId)
  if ('error' in auth) {
    const code = auth.status === 401 ? 'unauthorized' : auth.status === 403 ? 'forbidden' : auth.status === 404 ? 'not_found' : 'invalid_request'
    return err(code, auth.status)
  }
  if (await deps.isShopifyProject(auth.admin, auth.user.id, auth.project.id)) return err('not_available', 409, { reason: 'shopify' })
  try {
    if (!(await gbpTablesPresent(auth.admin))) return err('not_available', 409, { reason: 'schema' })
  } catch {
    return err('unexpected', 500)
  }
  return auth
}

const storeFail = (e: unknown) => (e instanceof GbpStoreError && e.code === 'missing' ? err('not_available', 409, { reason: 'schema' }) : err('unexpected', 500))

export function sanitizePost(p: GbpPostRow) {
  return {
    id: p.id, summary: p.summary, ctaType: p.cta_type, ctaUrl: p.cta_url, imageUrl: p.image_url,
    status: p.status, scheduledAt: p.scheduled_at, publishedAt: p.published_at, googleState: p.google_state,
    searchUrl: p.google_search_url, errorCode: p.last_error_code, createdAt: p.created_at, sourceArticleId: p.source_article_id,
  }
}
export function sanitizeGbpConnection(c: GbpConnectionRow | null) {
  if (!c) return null
  return { status: c.status, errorCode: c.last_error_code, updatedAt: c.updated_at }
}

const articleUrl = (a: Record<string, unknown>): string | null => {
  for (const k of ['wp_post_url', 'shopify_article_url', 'site_post_url']) {
    const v = a[k]
    if (typeof v === 'string' && /^https:\/\//.test(v)) return v
  }
  return null
}

// ── GET /api/gbp/status?projectId= ─────────────────────────────────────────
export async function handleStatus(req: Request, deps: GbpRouteDeps): Promise<Response> {
  const projectId = new URL(req.url).searchParams.get('projectId')
  const auth = await deps.auth(projectId)
  if ('error' in auth) return err(auth.status === 401 ? 'unauthorized' : auth.status === 403 ? 'forbidden' : 'not_found', auth.status)
  if (await deps.isShopifyProject(auth.admin, auth.user.id, auth.project.id)) return json({ ok: true, state: 'shopify' })
  try {
    if (!(await gbpTablesPresent(auth.admin))) return json({ ok: true, state: 'unavailable' })
  } catch { return err('unexpected', 500) }
  try {
    const [connection, location, posts] = await Promise.all([
      readGbpConnection(auth.admin, auth.user.id),
      readProjectLocation(auth.admin, auth.project.id),
      listProjectPosts(auth.admin, auth.project.id),
    ])
    const { data: project } = await auth.admin.from('projects').select('target_domain, business_name').eq('id', auth.project.id).maybeSingle()
    const { data: arts } = await auth.admin.from('generated_articles')
      .select('id, title, status, featured_image_url, wp_post_url, shopify_article_url, site_post_url')
      .eq('project_id', auth.project.id).in('status', ['published', 'ready', 'scheduled']).order('created_at', { ascending: false }).limit(30)
    const p = (project ?? {}) as { target_domain?: string | null; business_name?: string | null }
    return json({
      ok: true,
      state: 'ready',
      configured: isGbpOAuthConfigured() && isGscTokenCryptoConfigured(),
      connection: sanitizeGbpConnection(connection),
      // A location saved under a connection that is not this user's is ignored (never shown, never used).
      location: location && connection?.id && location.connection_id === connection.id
        ? { title: location.location_title, address: location.location_address, mapsUri: location.maps_uri, websiteUri: location.website_uri, locationName: location.location_name }
        : null,
      posts: posts.map(sanitizePost),
      siteUrl: p.target_domain ? (/^https?:\/\//.test(p.target_domain) ? p.target_domain : `https://${p.target_domain}`) : null,
      businessName: p.business_name ?? null,
      articles: ((arts ?? []) as Record<string, unknown>[]).map((a) => ({
        id: String(a.id), title: String(a.title ?? ''), url: articleUrl(a),
        imageUrl: typeof a.featured_image_url === 'string' && /^https:\/\//.test(a.featured_image_url) ? a.featured_image_url : null,
      })),
      ctaTypes: GBP_CTA_TYPES,
    })
  } catch (e) { return storeFail(e) }
}

// ── POST /api/gbp/connect {projectId} ──────────────────────────────────────
export async function handleConnect(req: Request, deps: GbpRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  if (!isGbpOAuthConfigured() || !isGscTokenCryptoConfigured()) return err('not_available', 503, { reason: 'not_configured' })
  const pkce = createPkcePair()
  try {
    const state = await createGbpOAuthState(g.admin, { userId: g.user.id, projectId: g.project.id, codeVerifier: pkce.verifier })
    return json({ ok: true, authUrl: (deps.authUrl ?? buildGbpAuthUrl)(state, pkce.challenge) })
  } catch (e) { return storeFail(e) }
}

// ── GET /api/gbp/callback?code&state ───────────────────────────────────────
/**
 * The only GET that writes, and only after consuming its one-time state. The
 * return address is fixed (/maps-posts?projectId=<from the state>) with a
 * result code; nothing from the query decides where the browser goes.
 */
export async function handleCallback(req: Request, deps: GbpRouteDeps & { sessionUserId: () => Promise<string | null>; admin: () => Admin }): Promise<Response> {
  const url = new URL(req.url)
  const back = (projectId: string | null, result: string) => {
    const to = new URL(projectId ? '/maps-posts' : '/projects', url.origin)
    if (projectId) to.searchParams.set('projectId', projectId)
    to.searchParams.set('gbp', result)
    return Response.redirect(to.toString(), 303)
  }
  const userId = await deps.sessionUserId()
  if (!userId) return back(null, 'unauthenticated')
  const admin = deps.admin()
  const consumed = await consumeGbpOAuthState(admin, { rawState: url.searchParams.get('state') ?? '', userId }).catch(() => null)
  if (!consumed) return back(null, 'invalid_state')
  const pid = consumed.projectId
  if (url.searchParams.get('error')) return back(pid, url.searchParams.get('error') === 'access_denied' ? 'access_denied' : 'oauth_error')
  const code = url.searchParams.get('code')
  if (!code) return back(pid, 'oauth_error')
  let tokens
  try {
    tokens = await (deps.exchange ?? ((c: string, v: string) => exchangeGbpCode(c, v)))(code, consumed.codeVerifier)
  } catch (e) {
    return back(pid, e instanceof GbpApiError && e.code === 'google_unavailable' ? 'google_unavailable' : 'oauth_error')
  }
  // The consent screen lets a person untick the permission; without it there is nothing to store.
  if (!grantIncludesGbpScope(tokens.scope)) return back(pid, 'scope_missing')
  try {
    await storeGbpConnection(admin, userId, { refreshToken: tokens.refreshToken, scope: tokens.scope })
  } catch {
    return back(pid, 'store_failed')
  }
  return back(pid, 'connected')
}

// ── GET /api/gbp/locations?projectId= ──────────────────────────────────────
async function merchantLocations(g: Authed, deps: GbpRouteDeps): Promise<{ ok: true; conn: GbpConnectionRow; list: GbpLocation[] } | { ok: false; res: Response }> {
  let conn: GbpConnectionRow | null
  try { conn = await readGbpConnection(g.admin, g.user.id) } catch (e) { return { ok: false, res: storeFail(e) } }
  const token = await accessTokenFor(g.admin, conn, deps.publish ?? defaultPublishDeps)
  if (!token.ok) return { ok: false, res: err(token.code, 409) }
  try {
    const list = await (deps.fetchLocations ?? ((t: string) => listAllLocations(t)))(token.accessToken)
    return { ok: true, conn: conn as GbpConnectionRow, list }
  } catch (e) {
    return { ok: false, res: err(e instanceof GbpApiError ? e.code : 'unexpected', 502) }
  }
}

export async function handleListLocations(req: Request, deps: GbpRouteDeps): Promise<Response> {
  const g = await gate(deps, new URL(req.url).searchParams.get('projectId'))
  if (g instanceof Response) return g
  const r = await merchantLocations(g, deps)
  if (!r.ok) return r.res
  return json({ ok: true, locations: r.list.map((l) => ({ accountName: l.accountName, locationName: l.locationName, title: l.title, address: l.address, websiteUri: l.websiteUri })) })
}

// ── POST /api/gbp/locations {projectId, accountName, locationName} ─────────
export async function handleSelectLocation(req: Request, deps: GbpRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  const r = await merchantLocations(g, deps)
  if (!r.ok) return r.res
  // Only a location Google lists for THIS merchant; the title and links come from Google, not the request.
  const pick = r.list.find((l) => l.accountName === body.accountName && l.locationName === body.locationName)
  if (!pick) return err('location_not_found', 404)
  try {
    await saveProjectLocation(g.admin, {
      project_id: g.project.id, user_id: g.user.id, connection_id: r.conn.id,
      account_name: pick.accountName, location_name: pick.locationName, location_title: pick.title || pick.locationName,
      location_address: pick.address, website_uri: pick.websiteUri, maps_uri: pick.mapsUri,
    })
  } catch (e) { return storeFail(e) }
  return json({ ok: true })
}

// ── DELETE /api/gbp/connection?projectId= ──────────────────────────────────
export async function handleDisconnect(req: Request, deps: GbpRouteDeps & { revoke?: (token: string) => Promise<boolean> }): Promise<Response> {
  const g = await gate(deps, new URL(req.url).searchParams.get('projectId'))
  if (g instanceof Response) return g
  try {
    const conn = await readGbpConnection(g.admin, g.user.id)
    if (conn) {
      const refresh = decryptRefreshToken(conn)
      if (refresh) await (deps.revoke ?? revokeGbpToken)(refresh)
      await deleteGbpConnection(g.admin, g.user.id)
    }
  } catch (e) { return storeFail(e) }
  return json({ ok: true })
}

// ── POST /api/gbp/draft {projectId, articleId? | topic?} ───────────────────
export async function handleDraft(req: Request, deps: GbpRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  const language = body.language === 'en' ? 'en' : 'he'
  let article: { title: string; description: string | null; url: string | null } | null = null
  if (typeof body.articleId === 'string' && body.articleId) {
    const { data } = await g.admin.from('generated_articles')
      .select('title, meta_description, excerpt, wp_post_url, shopify_article_url, site_post_url')
      .eq('id', body.articleId).eq('project_id', g.project.id).maybeSingle()
    if (!data) return err('not_found', 404)
    const a = data as Record<string, unknown>
    article = {
      title: String(a.title ?? '').slice(0, 300),
      description: (typeof a.meta_description === 'string' ? a.meta_description : typeof a.excerpt === 'string' ? a.excerpt : null)?.slice(0, 600) ?? null,
      url: articleUrl(a),
    }
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 300) : ''
  if (!article && !topic) return err('invalid_request', 400)
  let businessName: string | null = null
  try {
    const loc = await readProjectLocation(g.admin, g.project.id)
    businessName = loc?.location_title ?? null
  } catch { /* the draft works without it */ }
  if (!businessName) {
    const { data } = await g.admin.from('projects').select('business_name, name').eq('id', g.project.id).maybeSingle()
    const p = (data ?? {}) as { business_name?: string | null; name?: string | null }
    businessName = p.business_name || p.name || null
  }
  const out = await draftPost({ businessName, language, article, topic: article ? null : topic }, deps.generate)
  if (!out.ok) return err('draft_unavailable', 502)
  return json({ ok: true, summary: out.summary, articleUrl: article?.url ?? null })
}

// ── POST /api/gbp/image (multipart: projectId, file, crop) ─────────────────
export async function handleImage(req: Request, deps: GbpRouteDeps & { newId?: () => string }): Promise<Response> {
  let form: FormData
  try { form = await req.formData() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof form.get('projectId') === 'string' ? String(form.get('projectId')) : null)
  if (g instanceof Response) return g
  const file = form.get('file')
  if (!(file instanceof Blob)) return err('image_invalid', 400)
  if (!(GBP_SOURCE_TYPES as readonly string[]).includes(file.type) || file.size > GBP_SOURCE_MAX_BYTES) return err('image_invalid', 400)
  let crop: Partial<CropBox> | null = null
  try { crop = JSON.parse(String(form.get('crop') ?? 'null')) as Partial<CropBox> | null } catch { crop = null }
  const prepared = await preparePostImage(Buffer.from(await file.arrayBuffer()), crop)
  if (!prepared.ok) return err(prepared.code, 400)
  const id = (deps.newId ?? (() => crypto.randomUUID()))()
  const path = `${g.project.id}/gbp/${id}.jpg`
  const up = await g.admin.storage.from(CONTENT_IMAGE_BUCKET).upload(path, prepared.bytes, { contentType: 'image/jpeg', upsert: false })
  if (up.error) return err('image_upload_failed', 500)
  const { data: pub } = g.admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(path)
  return json({ ok: true, imagePath: path, imageUrl: pub.publicUrl, width: prepared.width, height: prepared.height })
}

// ── POST /api/gbp/posts ────────────────────────────────────────────────────
export async function handleCreatePost(req: Request, deps: GbpRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g

  const { data: project } = await g.admin.from('projects').select('target_domain').eq('id', g.project.id).maybeSingle()
  const checked = validatePostInput({
    summary: typeof body.summary === 'string' ? body.summary : '',
    ctaType: typeof body.ctaType === 'string' ? body.ctaType : null,
    ctaUrl: typeof body.ctaUrl === 'string' ? body.ctaUrl : null,
    siteUrl: (project as { target_domain?: string | null } | null)?.target_domain ?? null,
    allowOtherSite: body.allowOtherSite === true,
    scheduledAt: typeof body.scheduledAt === 'string' && body.scheduledAt ? body.scheduledAt : null,
  })
  if (!checked.ok) return json({ ok: false, error: 'invalid_post', fields: checked.errors }, 400)

  // The image must be one we prepared for THIS project; its public URL is rebuilt from the path, never taken from the request.
  let imagePath: string | null = null
  let imageUrl: string | null = null
  if (typeof body.imagePath === 'string' && body.imagePath) {
    if (!new RegExp(`^${g.project.id}/gbp/[0-9a-f-]{36}\\.jpg$`).test(body.imagePath)) return err('image_invalid', 400)
    imagePath = body.imagePath
    imageUrl = g.admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl
    if (!/^https:\/\//.test(imageUrl)) return err('image_invalid', 400)
  }

  let sourceArticleId: string | null = null
  if (typeof body.sourceArticleId === 'string' && body.sourceArticleId) {
    const { data } = await g.admin.from('generated_articles').select('id').eq('id', body.sourceArticleId).eq('project_id', g.project.id).maybeSingle()
    sourceArticleId = data ? String((data as { id: string }).id) : null
  }

  let location
  try { location = await readProjectLocation(g.admin, g.project.id) } catch (e) { return storeFail(e) }
  if (!location) return err('no_location', 409)

  let row: GbpPostRow
  try {
    row = await insertPost(g.admin, {
      project_id: g.project.id, user_id: g.user.id, source_article_id: sourceArticleId,
      summary: checked.value.summary, cta_type: checked.value.ctaType, cta_url: checked.value.ctaUrl,
      image_url: imageUrl, image_path: imagePath, language_code: body.language === 'en' ? 'en' : 'he',
      scheduled_at: checked.value.scheduledAt ?? new Date().toISOString(),
    })
  } catch (e) { return storeFail(e) }

  if (checked.value.scheduledAt) return json({ ok: true, post: sanitizePost(row), outcome: 'scheduled' })
  const out = await publishPost(g.admin, row.id, deps.publish ?? defaultPublishDeps)
  const fresh = await readProjectPost(g.admin, g.project.id, row.id).catch(() => null)
  return json({ ok: true, post: sanitizePost(fresh ?? row), outcome: out.ok ? 'published' : out.willRetry ? 'retrying' : 'failed', errorCode: out.ok ? null : out.code })
}

// ── DELETE /api/gbp/posts/[id]?projectId= (cancel a scheduled post) ───────
export async function handleCancelPost(req: Request, postId: string, deps: GbpRouteDeps): Promise<Response> {
  const g = await gate(deps, new URL(req.url).searchParams.get('projectId'))
  if (g instanceof Response) return g
  if (!/^[0-9a-f-]{36}$/.test(postId)) return err('not_found', 404)
  try {
    const ok = await cancelPost(g.admin, g.project.id, postId)
    return ok ? json({ ok: true }) : err('not_found', 404)
  } catch (e) { return storeFail(e) }
}

