/**
 * POSTS ON GOOGLE MAPS (lib/gbp) — the rules a post must meet, the exact request
 * Google receives, the OAuth flow (state + PKCE), and the handlers end to end
 * against FakeAdmin and a fake Google.
 *
 *   A) validation: 1,500 characters (code points), phone numbers, the six button
 *      types, the URL rules (https, same site by default, CALL takes none), schedule;
 *   B) the localPosts request shape (path, body keys, CALL without url, no media
 *      key without a photo, names that are not Google's refused);
 *   C) OAuth: only business.manage, S256 PKCE (challenge recomputed independently),
 *      the verifier sent at exchange, a one-time state bound to the user;
 *   D) Google errors become codes; no provider text survives;
 *   E) the handlers: owner-only, Shopify hidden, schema missing = unavailable,
 *      validation on the server, the image must be this project's, the stored
 *      token is encrypted, the callback redirects only to a fixed path;
 *   F) publishing: claimed once, retried only on rate limit/outage (≤3), a
 *      location on someone else's connection is never used;
 *   G) the photo is 1200×900 JPEG inside Google's 10 KB – 5 MB, the crop the
 *      screen shows is the crop the server cuts;
 *   H) every route is behind GBP_POSTS_ENABLED; the cron is behind CRON_SECRET;
 *      client components import no server module; he/en parity; no confirm()/alert().
 * Every guard has a MUTATION CONTROL: the same check on a broken copy must fail.
 *
 * Run: npx tsx lib/gbp/__qa__/gbp-posts.qa.ts
 */
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs'
import { join, relative, dirname } from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { FakeAdmin } from '../../__qa__/_fake-admin'

process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
process.env.GOOGLE_GSC_CLIENT_ID = 'client-id.apps.googleusercontent.com'
process.env.GOOGLE_GSC_CLIENT_SECRET = 'client-secret'
process.env.GOOGLE_GBP_REDIRECT_URI = 'https://www.gotopseo.com/api/gbp/callback'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const V = require('../validate') as typeof import('../validate')
const R = require('../request') as typeof import('../request')
const O = require('../oauth') as typeof import('../oauth')
const E = require('../errors') as typeof import('../errors')
const H = require('../http') as typeof import('../http')
const P = require('../publish') as typeof import('../publish')
const S = require('../store') as typeof import('../store')
const I = require('../image') as typeof import('../image')
const D = require('../draft') as typeof import('../draft')
const C = require('../../../components/maps-posts/crop') as typeof import('../../../components/maps-posts/crop')
const { dashboardHe } = require('../../i18n/dashboard/he')
const { dashboardEn } = require('../../i18n/dashboard/en')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const MUTANTS: string[] = []
process.on('exit', () => { for (const f of MUTANTS) { try { unlinkSync(f) } catch { /* gone */ } } })
/**
 * Load a mutated copy of a module. The copy sits NEXT TO the original (so its
 * relative and '@/' imports resolve the same way) under a throwaway name, and is
 * deleted when the suite exits.
 */
function mutant<T>(rel: string, from: string | RegExp, to: string): T {
  const src = read(rel)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${rel}`)
  const file = join(ROOT, dirname(rel), `.mut-${crypto.randomUUID()}.ts`)
  writeFileSync(file, out)
  MUTANTS.push(file)
  return require(file) as T
}

// ── A) validation ────────────────────────────────────────────────────────────
type Validate = typeof V.validatePostInput
const SITE = 'https://www.dana-bakery.co.il'
function validationFailures(validate: Validate): string[] {
  const bad: string[] = []
  const errs = (i: Partial<Parameters<Validate>[0]>) => { const r = validate({ summary: 'לחם טרי', siteUrl: SITE, ...i } as any); return r.ok ? [] : r.errors as string[] }
  const expect = (label: string, i: Partial<Parameters<Validate>[0]>, want: string | null) => {
    const got = errs(i)
    if (want === null ? got.length !== 0 : !got.includes(want)) bad.push(`${label}: got [${got.join(',')}]`)
  }
  expect('1500 Hebrew letters pass', { summary: 'א'.repeat(1500) }, null)
  expect('1501 letters fail', { summary: 'א'.repeat(1501) }, 'summary_too_long')
  expect('1,000 emoji (2,000 UTF-16 units) count as 1,000 and pass', { summary: '🥐'.repeat(1000) }, null)
  expect('1501 emoji fail', { summary: '🥐'.repeat(1501) }, 'summary_too_long')
  expect('whitespace only is empty', { summary: '   \n ' }, 'summary_empty')
  expect('an Israeli mobile is a phone', { summary: 'התקשרו 050-1234567' }, 'summary_has_phone')
  expect('+972 number is a phone', { summary: 'call +972 3 555 1234 now' }, 'summary_has_phone')
  expect('tel: link is a phone', { summary: 'tel:0501234567' }, 'summary_has_phone')
  expect('a date is not a phone', { summary: 'המבצע עד 29-09-2026 או 05.10.2026' }, null)
  expect('a price and a year are not a phone', { summary: 'רק 1,500 ₪ בשנת 2026, 120 מקומות' }, null)
  for (const t of ['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP']) expect(`${t} with own https URL passes`, { ctaType: t, ctaUrl: `${SITE}/menu` }, null)
  expect('CALL without URL passes', { ctaType: 'CALL' }, null)
  expect('CALL with URL fails', { ctaType: 'CALL', ctaUrl: `${SITE}/` }, 'cta_url_not_allowed')
  expect('deprecated GET_OFFER fails', { ctaType: 'GET_OFFER', ctaUrl: `${SITE}/` }, 'cta_type_invalid')
  expect('unknown type fails', { ctaType: 'DONATE', ctaUrl: `${SITE}/` }, 'cta_type_invalid')
  expect('URL without a type fails', { ctaUrl: `${SITE}/` }, 'cta_type_invalid')
  expect('BOOK without URL fails', { ctaType: 'BOOK' }, 'cta_url_required')
  expect('http URL fails', { ctaType: 'BOOK', ctaUrl: 'http://www.dana-bakery.co.il/' }, 'cta_url_not_https')
  expect('javascript: URL fails', { ctaType: 'BOOK', ctaUrl: 'javascript:alert(1)' }, 'cta_url_invalid')
  expect('credentials in URL fail', { ctaType: 'BOOK', ctaUrl: 'https://user:pw@dana-bakery.co.il/' }, 'cta_url_invalid')
  expect('another site fails by default', { ctaType: 'BOOK', ctaUrl: 'https://evil.example.com/' }, 'cta_url_other_site')
  expect('a look-alike host fails', { ctaType: 'BOOK', ctaUrl: 'https://dana-bakery.co.il.evil.com/' }, 'cta_url_other_site')
  expect('the bare domain of the site passes', { ctaType: 'SHOP', ctaUrl: 'https://dana-bakery.co.il/shop' }, null)
  expect('a subdomain of the site passes', { ctaType: 'SHOP', ctaUrl: 'https://shop.dana-bakery.co.il/' }, null)
  expect('another site passes when explicitly allowed', { ctaType: 'BOOK', ctaUrl: 'https://calendly.com/dana', allowOtherSite: true }, null)
  expect('no site known + no opt-in fails', { ctaType: 'BOOK', ctaUrl: 'https://calendly.com/dana', siteUrl: null }, 'cta_url_other_site')
  const now = new Date('2026-09-29T10:00:00Z')
  expect('schedule in the past fails', { scheduledAt: '2026-09-29T09:00:00Z', now }, 'schedule_in_past')
  expect('schedule in 2 minutes fails', { scheduledAt: '2026-09-29T10:02:00Z', now }, 'schedule_in_past')
  expect('schedule tomorrow passes', { scheduledAt: '2026-09-30T10:00:00Z', now }, null)
  expect('schedule in two years fails', { scheduledAt: '2028-09-30T10:00:00Z', now }, 'schedule_too_far')
  expect('garbage schedule fails', { scheduledAt: 'soon', now }, 'schedule_invalid')
  return bad
}
{
  console.log('A) validation')
  const bad = validationFailures(V.validatePostInput)
  check('every length / phone / button / URL / schedule rule holds', bad.length === 0, bad.join(' | '))
  const ok = V.validatePostInput({ summary: '  שלום  ', ctaType: 'LEARN_MORE', ctaUrl: `${SITE}/a b`.replace(' ', '%20'), siteUrl: SITE })
  check('the value is trimmed and the URL normalized', ok.ok && ok.value.summary === 'שלום' && ok.value.ctaUrl === `${SITE}/a%20b`)
  check('clampPostText never exceeds 1,500 and never splits an emoji', (() => {
    const c = V.clampPostText('🥐'.repeat(1600)); return V.countPostChars(c) <= 1500 && !/\uD83E$/.test(c)
  })())
  // Mutation controls: each broken validator must be caught by the same table.
  const M = 'lib/gbp/validate.ts'
  const mut = (from: string | RegExp, to: string) => validationFailures(mutant<typeof V>(M, from, to).validatePostInput).length > 0
  check('MUTATION: limit raised to 1501 is caught', mut('GBP_SUMMARY_MAX = 1500', 'GBP_SUMMARY_MAX = 1501'))
  check('MUTATION: counting UTF-16 units instead of characters is caught', mut('return Array.from(text.trim()).length', 'return text.trim().length'))
  check('MUTATION: phone check removed is caught', mut("if (chars > 0 && containsPhoneNumber(summary)) errors.push('summary_has_phone')", ''))
  check('MUTATION: http allowed is caught', mut("parsed.protocol !== 'https:'", "!/^https?:$/.test(parsed.protocol)"))
  check('MUTATION: other sites allowed by default is caught', mut('!input.allowOtherSite && !isSameSite', 'false && !isSameSite'))
  check('MUTATION: suffix match without the dot (look-alike hosts) is caught', mut('host.endsWith(`.${site}`)', 'host.endsWith(site) || host.includes(site)'))
  check('MUTATION: CALL accepting a URL is caught', mut("if (rawUrl) errors.push('cta_url_not_allowed')", ''))
  check('MUTATION: GET_OFFER re-added is caught', mut("'SIGN_UP', 'CALL'] as const", "'SIGN_UP', 'CALL', 'GET_OFFER'] as const"))
}

// ── B) request shape ─────────────────────────────────────────────────────────
function requestFailures(build: typeof R.buildLocalPostRequest): string[] {
  const bad: string[] = []
  const base = { accountName: 'accounts/111', locationName: 'locations/222', summary: 'לחם טרי', languageCode: 'he' as const }
  const full = build({ ...base, ctaType: 'LEARN_MORE', ctaUrl: 'https://dana.co.il/', imageUrl: 'https://x.supabase.co/storage/v1/object/public/b/p.jpg' })
  const want = {
    languageCode: 'he', summary: 'לחם טרי', topicType: 'STANDARD',
    callToAction: { actionType: 'LEARN_MORE', url: 'https://dana.co.il/' },
    media: [{ mediaFormat: 'PHOTO', sourceUrl: 'https://x.supabase.co/storage/v1/object/public/b/p.jpg' }],
  }
  if (full.url !== 'https://mybusiness.googleapis.com/v4/accounts/111/locations/222/localPosts') bad.push(`url ${full.url}`)
  if (full.method !== 'POST') bad.push('method')
  if (JSON.stringify(full.body) !== JSON.stringify(want)) bad.push(`body ${JSON.stringify(full.body)}`)
  const call = build({ ...base, ctaType: 'CALL', ctaUrl: null, imageUrl: null })
  if (JSON.stringify(call.body.callToAction) !== JSON.stringify({ actionType: 'CALL' })) bad.push(`CALL ${JSON.stringify(call.body.callToAction)}`)
  if ('media' in call.body) bad.push('media key without a photo')
  const bare = build({ ...base, ctaType: null, ctaUrl: null, imageUrl: null })
  if ('callToAction' in bare.body) bad.push('callToAction without a button')
  for (const [a, l] of [['accounts/1/../2', 'locations/2'], ['accounts/1', 'locations/2?x=1'], ['https://evil/accounts/1', 'locations/2']]) {
    try { build({ ...base, accountName: a, locationName: l, ctaType: null, ctaUrl: null, imageUrl: null }); bad.push(`accepted ${a} ${l}`) } catch { /* refused */ }
  }
  return bad
}
{
  console.log('B) localPosts request shape')
  const bad = requestFailures(R.buildLocalPostRequest)
  check('path, method and body are exactly what Google documents', bad.length === 0, bad.join(' | '))
  const M = 'lib/gbp/request.ts'
  const mut = (from: string, to: string) => requestFailures(mutant<typeof R>(M, from, to).buildLocalPostRequest).length > 0
  check('MUTATION: CALL sent with a url is caught', mut("? { actionType: 'CALL' }", "? { actionType: 'CALL', url: '' }"))
  check('MUTATION: a different topic type is caught', mut("topicType: 'STANDARD',\n  }", "topicType: 'EVENT' as 'STANDARD',\n  }"))
  check('MUTATION: a permissive location pattern is caught', mut('{1,64})$/.exec(accountName)', '.+)$/.exec(accountName)'))
  check('MUTATION: an empty media array without a photo is caught', mut("if (spec.imageUrl) body.media =", "body.media = spec.imageUrl ? [] : []; if (spec.imageUrl) body.media ="))
}

// ── C) OAuth + PKCE ──────────────────────────────────────────────────────────
async function oauthChecks() {
  console.log('C) OAuth, PKCE, one-time state')
  const { verifier, challenge } = O.createPkcePair()
  const independent = crypto.createHash('sha256').update(verifier).digest('base64url')
  check('PKCE verifier is 43+ url-safe chars and the S256 challenge matches an independent computation', /^[A-Za-z0-9_-]{43,128}$/.test(verifier) && challenge === independent)
  const url = new URL(O.buildGbpAuthUrl('s'.repeat(64), challenge))
  check('consent asks ONLY for business.manage', url.searchParams.get('scope') === 'https://www.googleapis.com/auth/business.manage')
  check('consent carries S256 challenge, offline access, state and the fixed redirect',
    url.searchParams.get('code_challenge_method') === 'S256' && url.searchParams.get('code_challenge') === challenge
    && url.searchParams.get('access_type') === 'offline' && url.searchParams.get('state') === 's'.repeat(64)
    && url.searchParams.get('redirect_uri') === 'https://www.gotopseo.com/api/gbp/callback' && url.origin === 'https://accounts.google.com')
  const scopeOk = (u: URL) => u.searchParams.get('scope') === 'https://www.googleapis.com/auth/business.manage'
  check('MUTATION: adding the Search Console scope is caught', !scopeOk(new URL(url.toString().replace('business.manage', 'business.manage+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fwebmasters.readonly'))))

  let sent: URLSearchParams | null = null
  const fakeFetch = async (_u: string, init?: RequestInit) => { sent = new URLSearchParams(String(init?.body)); return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', scope: 'https://www.googleapis.com/auth/business.manage' }), { status: 200 }) }
  await O.exchangeGbpCode('the-code', verifier, fakeFetch as any)
  check('the code exchange sends the PKCE verifier', (sent as URLSearchParams | null)?.get('code_verifier') === verifier && (sent as URLSearchParams | null)?.get('grant_type') === 'authorization_code')
  const deny = async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked. <secret detail>' }), { status: 400 })
  try { await O.refreshGbpAccessToken('rt', deny as any); check('invalid_grant throws', false) } catch (e) {
    check('invalid_grant becomes reauth_required with no provider text', e instanceof E.GbpApiError && e.code === 'reauth_required' && !String((e as Error).message).includes('expired'))
  }
  check('a grant without business.manage is detected', !O.grantIncludesGbpScope('openid https://www.googleapis.com/auth/webmasters.readonly') && O.grantIncludesGbpScope('openid https://www.googleapis.com/auth/business.manage'))

  const admin = new FakeAdmin() as any
  const raw = await S.createGbpOAuthState(admin, { userId: 'u1', projectId: 'p1', codeVerifier: verifier })
  const row = admin.tables.gbp_oauth_states[0]
  check('state stored as sha256 only, verifier stored encrypted', row.state_hash !== raw && /^[0-9a-f]{64}$/.test(row.state_hash) && !JSON.stringify(row).includes(verifier) && /^v1:/.test(row.code_verifier_encrypted))
  check('another user cannot consume the state', (await S.consumeGbpOAuthState(admin, { rawState: raw, userId: 'u2' })) === null)
  const first = await S.consumeGbpOAuthState(admin, { rawState: raw, userId: 'u1' })
  check('the owner consumes it once and gets the verifier back', first?.projectId === 'p1' && first?.codeVerifier === verifier)
  check('a second consume (replay) fails', (await S.consumeGbpOAuthState(admin, { rawState: raw, userId: 'u1' })) === null)
  admin.tables.gbp_oauth_states.push({ ...row, state_hash: crypto.createHash('sha256').update('e'.repeat(64)).digest('hex'), consumed_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })
  check('an expired state fails', (await S.consumeGbpOAuthState(admin, { rawState: 'e'.repeat(64), userId: 'u1' })) === null)
}

// ── D) error mapping ─────────────────────────────────────────────────────────
function errorFailures(classify: typeof E.classifyGoogleError): string[] {
  const bad: string[] = []
  const leak = 'Request contains an invalid argument. <html>internal trace</html>'
  const cases: [number, unknown, string][] = [
    [401, { error: { status: 'UNAUTHENTICATED', message: leak } }, 'reauth_required'],
    [429, { error: { status: 'RESOURCE_EXHAUSTED', message: leak, details: [{ reason: 'RATE_LIMIT_EXCEEDED', metadata: { quota_limit_value: '0' } }] } }, 'api_not_approved'],
    [403, { error: { status: 'PERMISSION_DENIED', message: leak, details: [{ reason: 'SERVICE_DISABLED' }] } }, 'api_not_approved'],
    [429, { error: { status: 'RESOURCE_EXHAUSTED', message: leak } }, 'rate_limited'],
    [403, { error: { status: 'PERMISSION_DENIED', message: leak } }, 'permission_denied'],
    [404, { error: { status: 'NOT_FOUND', message: leak } }, 'location_not_found'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: leak } }, 'invalid_post'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: leak, details: [{ reason: 'INVALID_MEDIA_URL' }] } }, 'image_rejected'],
    [503, { error: { message: leak } }, 'google_unavailable'],
    [418, 'teapot', 'unexpected'],
  ]
  for (const [s, j, want] of cases) {
    const e = classify(s, j)
    if (e.code !== want) bad.push(`${s} → ${e.code}, want ${want}`)
    if (e.message !== e.code || JSON.stringify(e).includes('invalid argument')) bad.push(`${s} leaks provider text`)
    if (!(E.GBP_ERROR_CODES as readonly string[]).includes(e.code)) bad.push(`${e.code} not a known code`)
  }
  return bad
}
{
  console.log('D) Google errors → codes')
  const bad = errorFailures(E.classifyGoogleError)
  check('every Google answer maps to a stable code, and no message is kept', bad.length === 0, bad.join(' | '))
  const wrapped: typeof E.classifyGoogleError = (s, j) => { const e = E.classifyGoogleError(s, j); e.message = String((j as any)?.error?.message ?? e.code); return e }
  check('MUTATION: an error carrying Google’s message is caught', errorFailures(wrapped).length > 0)
  const noQuota = mutant<typeof E>('lib/gbp/errors.ts', "if (limit === '0') reasons.push('QUOTA_ZERO')", '')
  check('MUTATION: "API not approved yet" (quota 0) shown as a rate limit is caught', errorFailures(noQuota.classifyGoogleError).length > 0)
}

// ── E) handlers ──────────────────────────────────────────────────────────────
const OWNER = 'user-owner', OTHER = 'user-other'
const PROJECT = '11111111-1111-4111-8111-111111111111'
function world(opts: { missing?: boolean } = {}) {
  const hooks = opts.missing ? Object.fromEntries(S.GBP_TABLES.map((t) => [t, { select: () => ({ code: '42P01', message: 'relation does not exist' }) }])) : {}
  const admin: any = new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER, target_domain: 'dana-bakery.co.il', business_name: 'המאפייה של דנה', name: 'דנה' }],
    generated_articles: [{ id: 'art-1', project_id: PROJECT, title: 'לחם מחמצת', status: 'published', wp_post_url: 'https://dana-bakery.co.il/sourdough', meta_description: 'איך אופים', featured_image_url: null }],
    gbp_connections: [], gbp_oauth_states: [], project_gbp_locations: [], gbp_posts: [],
  }, hooks as any)
  admin.storage = { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/content-article-images/${p}` } }), upload: async () => ({ error: null }) }) }
  return admin
}
function deps(admin: any, over: Partial<import('../http').GbpRouteDeps> = {}, as = OWNER): import('../http').GbpRouteDeps {
  return {
    auth: async (pid) => (!pid ? { error: 'x', status: 400 } : pid !== PROJECT ? { error: 'x', status: 404 } : as !== OWNER ? { error: 'x', status: 403 } : { user: { id: as }, admin, project: { id: PROJECT, user_id: OWNER } }) as any,
    isShopifyProject: async () => false,
    ...over,
  }
}
const post = (body: unknown) => new Request('https://app.test/api/gbp/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
/** FakeAdmin's upsert does not fill `id` DEFAULT gen_random_uuid(); do it as Postgres would. */
function ids(admin: any) { for (const c of admin.tables.gbp_connections) c.id ??= crypto.randomUUID() }
async function connectOwner(admin: any) {
  await S.storeGbpConnection(admin, OWNER, { refreshToken: '1//refresh-plain', scope: 'https://www.googleapis.com/auth/business.manage' })
  ids(admin)
  const conn = admin.tables.gbp_connections[0]
  await S.saveProjectLocation(admin, { project_id: PROJECT, user_id: OWNER, connection_id: conn.id, account_name: 'accounts/111', location_name: 'locations/222', location_title: 'המאפייה של דנה' })
  return conn
}

async function handlerChecks() {
  console.log('E) handlers')
  {
    const admin = world()
    const r = await H.handleStatus(new Request(`https://app.test/api/gbp/status?projectId=${PROJECT}`), deps(admin, {}, OTHER))
    check('another user gets 403 and no data', r.status === 403 && !(await r.text()).includes('דנה'))
    const s = await H.handleStatus(new Request(`https://app.test/api/gbp/status?projectId=${PROJECT}`), deps(admin, { isShopifyProject: async () => true }))
    check('a Shopify project sees state "shopify" (feature hidden)', (await s.json()).state === 'shopify')
    const m = await H.handleStatus(new Request(`https://app.test/api/gbp/status?projectId=${PROJECT}`), deps(world({ missing: true })))
    check('tables not applied → state "unavailable", not an error', m.status === 200 && (await m.json()).state === 'unavailable')
    const c = await H.handleConnect(post({ projectId: PROJECT }), deps(world({ missing: true })))
    check('connect while tables are missing → not_available', c.status === 409 && (await c.json()).error === 'not_available')
    const sh = await H.handleCreatePost(post({ projectId: PROJECT, summary: 'x' }), deps(admin, { isShopifyProject: async () => true }))
    check('a Shopify project cannot create a post', sh.status === 409)
  }
  {
    // Callback: fixed redirect, scope check, encrypted storage.
    const admin = world()
    const raw = await S.createGbpOAuthState(admin, { userId: OWNER, projectId: PROJECT, codeVerifier: 'v'.repeat(43) })
    let usedVerifier = ''
    const cb = (q: string, scope = 'https://www.googleapis.com/auth/business.manage') => H.handleCallback(new Request(`https://app.test/api/gbp/callback?${q}`), {
      ...deps(admin), sessionUserId: async () => OWNER, admin: () => admin,
      exchange: async (_c: string, v: string) => { usedVerifier = v; return { accessToken: 'at', refreshToken: '1//refresh-plain', scope } },
    } as any)
    const evil = await cb(`state=${raw}&code=c&next=https://evil.example.com`)
    const loc = new URL(evil.headers.get('location') ?? '')
    check('callback redirects only to /maps-posts on our origin with the state’s project', loc.origin === 'https://app.test' && loc.pathname === '/maps-posts' && loc.searchParams.get('projectId') === PROJECT && loc.searchParams.get('gbp') === 'connected')
    check('callback exchanged with the stored PKCE verifier', usedVerifier === 'v'.repeat(43))
    const stored = admin.tables.gbp_connections[0]
    check('the refresh token is stored encrypted, never in plaintext', !!stored && /^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(stored.encrypted_refresh_token) && !JSON.stringify(admin.tables).includes('refresh-plain'))
    const replay = await cb(`state=${raw}&code=c`)
    check('replaying the state is refused', new URL(replay.headers.get('location') ?? '').searchParams.get('gbp') === 'invalid_state')
    const raw2 = await S.createGbpOAuthState(admin, { userId: OWNER, projectId: PROJECT, codeVerifier: 'w'.repeat(43) })
    admin.tables.gbp_connections.length = 0
    const noScope = await cb(`state=${raw2}&code=c`, 'openid email')
    check('a grant without business.manage stores nothing', new URL(noScope.headers.get('location') ?? '').searchParams.get('gbp') === 'scope_missing' && admin.tables.gbp_connections.length === 0)
  }
  {
    // Create + publish.
    const admin = world()
    await connectOwner(admin)
    let spec: any = null
    const pub: import('../publish').PublishDeps = { refresh: async () => ({ accessToken: 'at' }), create: async (_a, s) => { spec = s; return { name: 'accounts/111/locations/222/localPosts/abc', state: 'PROCESSING', searchUrl: 'https://local.google.com/place?id=1' } } }
    const bad = await H.handleCreatePost(post({ projectId: PROJECT, summary: 'א'.repeat(1501), ctaType: 'BOOK', ctaUrl: 'http://x.com' }), deps(admin, { publish: pub }))
    const badBody = await bad.json()
    check('the server refuses what the composer would (length, http) with field codes', bad.status === 400 && badBody.fields.includes('summary_too_long') && badBody.fields.includes('cta_url_not_https') && spec === null)
    const foreignImg = await H.handleCreatePost(post({ projectId: PROJECT, summary: 'לחם', imagePath: '22222222-2222-4222-8222-222222222222/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg' }), deps(admin, { publish: pub }))
    check('an image path of another project is refused', foreignImg.status === 400 && (await foreignImg.json()).error === 'image_invalid')
    const good = await H.handleCreatePost(post({ projectId: PROJECT, summary: ' לחם טרי כל בוקר ', ctaType: 'LEARN_MORE', ctaUrl: 'https://dana-bakery.co.il/sourdough', imagePath: `${PROJECT}/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`, imageUrl: 'https://evil.example.com/x.jpg', sourceArticleId: 'art-1' }), deps(admin, { publish: pub }))
    const gb = await good.json()
    check('publishing now sends exactly the validated post to Google', good.status === 200 && gb.outcome === 'published' && spec?.summary === 'לחם טרי כל בוקר' && spec?.ctaType === 'LEARN_MORE' && spec?.accountName === 'accounts/111' && spec?.locationName === 'locations/222')
    check('the image URL is rebuilt from our storage path (the request’s URL is ignored)', spec?.imageUrl === `https://x.supabase.co/storage/v1/object/public/content-article-images/${PROJECT}/gbp/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`)
    const row = admin.tables.gbp_posts[0]
    check('the row is published with Google’s id and review state', row.status === 'published' && row.google_post_name === 'accounts/111/locations/222/localPosts/abc' && row.google_state === 'PROCESSING' && row.source_article_id === 'art-1')
    check('the post shown to the browser has no internal path or user id', !('image_path' in gb.post) && !('user_id' in gb.post))
  }
  {
    // A location that hangs off ANOTHER user's connection is never used.
    const admin = world()
    await S.storeGbpConnection(admin, OTHER, { refreshToken: 'other-refresh', scope: 'https://www.googleapis.com/auth/business.manage' })
    ids(admin)
    const otherConn = admin.tables.gbp_connections[0]
    await S.storeGbpConnection(admin, OWNER, { refreshToken: 'owner-refresh', scope: 'https://www.googleapis.com/auth/business.manage' })
    ids(admin)
    admin.tables.project_gbp_locations.push({ project_id: PROJECT, user_id: OWNER, connection_id: otherConn.id, account_name: 'accounts/9', location_name: 'locations/9', location_title: 'x' })
    let called = false
    const r = await H.handleCreatePost(post({ projectId: PROJECT, summary: 'לחם' }), deps(admin, { publish: { refresh: async () => ({ accessToken: 'at' }), create: async () => { called = true; return { name: 'accounts/9/locations/9/localPosts/1', state: 'LIVE', searchUrl: null } } } }))
    const b = await r.json()
    check('a location on someone else’s connection is never published to', !called && b.outcome === 'failed' && b.errorCode === 'not_connected')
    const st = await (await H.handleStatus(new Request(`https://app.test/api/gbp/status?projectId=${PROJECT}`), deps(admin))).json()
    check('…and the status screen does not show it', st.location === null)
  }
  {
    // Location choice comes from Google's list, never from the request.
    const admin = world()
    await S.storeGbpConnection(admin, OWNER, { refreshToken: 'r', scope: 'https://www.googleapis.com/auth/business.manage' })
    ids(admin)
    const d = deps(admin, { publish: { refresh: async () => ({ accessToken: 'at' }), create: async () => { throw new Error('no') } }, fetchLocations: async () => [{ accountName: 'accounts/1', locationName: 'locations/2', title: 'המאפייה של דנה', address: 'הרצל 1', websiteUri: null, mapsUri: 'https://maps.google.com/?cid=2' }] })
    const forged = await H.handleSelectLocation(post({ projectId: PROJECT, accountName: 'accounts/1', locationName: 'locations/999', title: 'forged' }), d)
    check('a location not in the merchant’s Google list is refused', forged.status === 404 && admin.tables.project_gbp_locations.length === 0)
    const okSel = await H.handleSelectLocation(post({ projectId: PROJECT, accountName: 'accounts/1', locationName: 'locations/2', title: 'forged title' }), d)
    check('a listed location is saved with Google’s title, not the request’s', okSel.status === 200 && admin.tables.project_gbp_locations[0]?.location_title === 'המאפייה של דנה')
  }
  {
    // AI draft: cleaned, clamped, no phone, never published by itself.
    const admin = world()
    let prompt = ''
    const r = await H.handleDraft(post({ projectId: PROJECT, articleId: 'art-1' }), deps(admin, { generate: async (p) => { prompt = p; return JSON.stringify({ summary: `**לחם מחמצת** טרי.\nהתקשרו 050-1234567\n${'א'.repeat(2000)}\nhttps://evil.example.com` }) } }))
    const b = await r.json()
    check('the draft is clamped to 1,500, has no phone, no URL, no markdown', r.status === 200 && V.countPostChars(b.summary) <= 1500 && !V.containsPhoneNumber(b.summary) && !b.summary.includes('http') && !b.summary.includes('**'))
    check('the draft prompt is built from the article and the business, and nothing was posted', prompt.includes('לחם מחמצת') && prompt.includes('המאפייה של דנה') && admin.tables.gbp_posts.length === 0)
    const foreign = await H.handleDraft(post({ projectId: PROJECT, articleId: 'art-of-someone-else' }), deps(admin, { generate: async () => 'x' }))
    check('a draft from an article outside the project is refused', foreign.status === 404)
    const down = await H.handleDraft(post({ projectId: PROJECT, topic: 'מבצע' }), deps(admin, { generate: async () => { throw new Error('Gemini 500 raw') } }))
    const db = await down.json()
    check('a provider failure is draft_unavailable, never its text', down.status === 502 && db.error === 'draft_unavailable' && !JSON.stringify(db).includes('Gemini'))
    check('MUTATION: a cleaner that keeps phone lines is caught', V.containsPhoneNumber(mutant<typeof D>('lib/gbp/draft.ts', /if \(containsPhoneNumber\(text\)\)[^\n]*\n/, '\n').cleanDraft('טקסט\nהתקשרו 050-1234567')) === true
      && !V.containsPhoneNumber(D.cleanDraft('טקסט\nהתקשרו 050-1234567')))
  }
}

// ── F) publishing ────────────────────────────────────────────────────────────
async function publishChecks() {
  console.log('F) publishing: claim once, bounded retry')
  const admin = world()
  const conn = await connectOwner(admin)
  const mk = (id: string) => admin.tables.gbp_posts.push({ id, project_id: PROJECT, user_id: OWNER, summary: 'לחם', cta_type: null, cta_url: null, image_url: null, language_code: 'he', status: 'scheduled', scheduled_at: '2026-01-01T00:00:00.000Z', attempts: 0 })
  mk('p1')
  let creates = 0
  const slow: import('../publish').PublishDeps = { refresh: async () => ({ accessToken: 'at' }), create: async () => { creates++; await new Promise((r) => setTimeout(r, 5)); return { name: 'accounts/111/locations/222/localPosts/1', state: 'LIVE', searchUrl: null } } }
  const [a, b] = await Promise.all([P.publishPost(admin, 'p1', slow), P.publishPost(admin, 'p1', slow)])
  check('two runners (button + cron) publish a post exactly once', creates === 1 && [a, b].filter((x) => x.ok).length === 1 && [a, b].some((x) => !x.ok && x.code === 'not_claimable'))

  mk('p2')
  const limited: import('../publish').PublishDeps = { refresh: async () => ({ accessToken: 'at' }), create: async () => { throw new E.GbpApiError('rate_limited', true) }, now: () => new Date('2026-09-29T10:00:00Z') }
  const r1 = await P.publishPost(admin, 'p2', limited)
  const row = () => admin.tables.gbp_posts.find((p: any) => p.id === 'p2')
  check('a rate limit re-schedules 15 minutes later with the code kept', !r1.ok && r1.willRetry && row().status === 'scheduled' && row().scheduled_at === '2026-09-29T10:15:00.000Z' && row().last_error_code === 'rate_limited')
  await P.publishPost(admin, 'p2', limited); const r3 = await P.publishPost(admin, 'p2', limited)
  check('after 3 attempts it stops and says why', !r3.ok && !r3.willRetry && row().status === 'failed' && row().attempts === 3)

  mk('p3')
  const invalid: import('../publish').PublishDeps = { refresh: async () => ({ accessToken: 'at' }), create: async () => { throw new E.GbpApiError('invalid_post') } }
  const r4 = await P.publishPost(admin, 'p3', invalid)
  check('a rejected request is not retried', !r4.ok && !r4.willRetry && admin.tables.gbp_posts.find((p: any) => p.id === 'p3').status === 'failed')

  mk('p4')
  const revoked: import('../publish').PublishDeps = { refresh: async () => { throw new E.GbpApiError('reauth_required') }, create: async () => { throw new Error('unreachable') } }
  await P.publishPost(admin, 'p4', revoked)
  check('a revoked grant marks the connection for reconnect', admin.tables.gbp_connections.find((c: any) => c.id === conn.id).status === 'reauth_required')

  // MUTATION: the same three rate-limited attempts against a publisher whose bound is 30 must NOT stop.
  const Pm = mutant<typeof P>('lib/gbp/publish.ts', 'export const GBP_MAX_ATTEMPTS = 3', 'export const GBP_MAX_ATTEMPTS = 30')
  admin.tables.gbp_connections.find((c: any) => c.id === conn.id).status = 'connected'
  mk('p5')
  for (let i = 0; i < 3; i++) { const r = admin.tables.gbp_posts.find((p: any) => p.id === 'p5'); r.scheduled_at = '2026-01-01T00:00:00.000Z'; await Pm.publishPost(admin, 'p5', limited) }
  check('MUTATION: an unbounded retry count is caught', admin.tables.gbp_posts.find((p: any) => p.id === 'p5').status !== 'failed')
}

// ── G) the photo ─────────────────────────────────────────────────────────────
async function imageChecks() {
  console.log('G) the photo')
  const photo = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c0a080' } })
    .composite([{ input: Buffer.from('<svg width="2400" height="1600"><circle cx="600" cy="500" r="300" fill="#204060"/><rect x="1500" y="900" width="500" height="400" fill="#e0e0e0"/></svg>') }])
    .png().toBuffer()
  const out = await I.preparePostImage(photo, { x: 0.1, y: 0.1, w: 0.5 })
  const meta = out.ok ? await sharp(out.bytes).metadata() : null
  check('any photo becomes a 1200×900 JPEG', !!meta && meta.width === 1200 && meta.height === 900 && meta.format === 'jpeg')
  check('…inside Google’s 10 KB – 5 MB window', out.ok && out.bytes.length >= 10 * 1024 && out.bytes.length <= 5 * 1024 * 1024)
  const exif = await sharp(photo).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } }).toBuffer()
  const outExif = await I.preparePostImage(exif, null)
  check('EXIF metadata is dropped', outExif.ok && !outExif.bytes.toString('latin1').includes('secret-gps-owner'))
  const tiny = await I.preparePostImage(photo, { x: 0, y: 0, w: 0.1 })
  check('a crop narrower than 480 px is refused', !tiny.ok && tiny.code === 'image_too_small')
  const junk = await I.preparePostImage(Buffer.from('not an image at all'), null)
  check('a non-image is refused', !junk.ok && junk.code === 'image_invalid')

  // The crop the screen shows = the crop the server cuts.
  const agree = (box: typeof C.cropBox) => {
    for (const [w, h] of [[2400, 1600], [1000, 2000], [1600, 1200]]) for (const c of [{ zoom: 1, px: 0.5, py: 0.5 }, { zoom: 2, px: 0, py: 1 }, { zoom: 2.7, px: 0.3, py: 0.8 }]) {
      const b = box(w, h, c)
      const s = I.resolveCrop(w, h, { x: b.x, y: b.y, w: b.w })
      if (Math.abs(s.left - b.xPx) > 1.5 || Math.abs(s.top - b.yPx) > 1.5 || Math.abs(s.width - b.wPx) > 1.5 || Math.abs(s.width / s.height - 4 / 3) > 0.01) return false
    }
    return true
  }
  check('the preview crop and the server crop agree (4:3, same box)', agree(C.cropBox))
  const brokenBox = mutant<typeof C>('components/maps-posts/crop.ts', 'const hPx = (wPx * 3) / 4', 'const hPx = (wPx * 9) / 16')
  check('MUTATION: a 16:9 preview is caught', !agree(brokenBox.cropBox))
}

// ── H) source guards ─────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, n)
    if (n === '__qa__') continue
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out); else if (/\.tsx?$/.test(n)) out.push(relative(ROOT, join(ROOT, rel)))
  }
  return out
}
function sourceChecks() {
  console.log('H) flags, secrets, language')
  const routes = walk('app/api/gbp').filter((f) => f.endsWith('route.ts'))
  const gated = (src: string) => {
    const s = strip(src)
    const handlers = [...s.matchAll(/export (?:async function (GET|POST|PUT|PATCH|DELETE)\b[\s\S]*?\n\}|const (GET|POST) = run)/g)]
    if (handlers.length === 0) return false
    if (/const (GET|POST) = run/.test(s)) return /async function run[\s\S]*?authorizeCronRequest\([\s\S]*?isGbpPostsEnabled\(\)/.test(s)
    return handlers.every((h) => /^[^{]*\{\s*if \(!isGbpPostsEnabled\(\)\) return Response\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/.test(h[0].slice(h[0].indexOf('{', h[0].indexOf(')')))) || /\{\s*if \(!isGbpPostsEnabled\(\)\) return/.test(h[0]))
  }
  const offenders = routes.filter((f) => !gated(read(f)))
  check(`all ${routes.length} /api/gbp routes answer 404 unless GBP_POSTS_ENABLED (cron: CRON_SECRET first)`, routes.length >= 9 && offenders.length === 0, offenders.join(', '))
  check('MUTATION: a route without the flag check is caught', !gated(read('app/api/gbp/draft/route.ts').replace("if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })", '')))
  check('MUTATION: a cron without CRON_SECRET is caught', !gated(read('app/api/gbp/cron/route.ts').replace(/const denied = authorizeCronRequest\(req, 'gbp-cron'\)\n\s*if \(denied\) return denied/, '')))
  const page = strip(read('app/(dashboard)/maps-posts/page.tsx'))
  check('the page is a 404 without the server flag', /if \(!isGbpPostsEnabled\(\)\) notFound\(\)/.test(page))
  check('the flag is off by default (exactly "true")', /process\.env\.GBP_POSTS_ENABLED === 'true'/.test(strip(read('lib/gbp/config.ts'))))
  const side = strip(read('components/layout/Sidebar.tsx'))
  check('the sidebar entry exists only behind NEXT_PUBLIC_GBP_POSTS_ENABLED', /mapsPostsNavItems[\s\S]*?NEXT_PUBLIC_GBP_POSTS_ENABLED === 'true'[\s\S]*?\/maps-posts/.test(side) && (side.match(/\/maps-posts/g) ?? []).length === 1)

  const client = walk('components/maps-posts')
  const serverImport = (src: string) => /from '@\/lib\/gbp\/(store|http|api|oauth|image|draft|publish|config|route-deps|errors)'|from '@\/lib\/supabase\/admin'|token-crypto/.test(strip(src))
  const leaking = client.filter((f) => serverImport(read(f)))
  check('client components import no server module (tokens, admin client, sharp)', leaking.length === 0, leaking.join(', '))
  check('MUTATION: a client import of the store is caught', serverImport(`${read('components/maps-posts/PostsList.tsx')}\nimport { readGbpConnection } from '@/lib/gbp/store'`))
  const rawErr = (src: string) => /window\.confirm|\balert\(|body\.message|\.error_description|err(or)?\.message\b/.test(strip(src))
  const raws = client.filter((f) => rawErr(read(f)))
  check('no confirm()/alert(), no raw server or provider message on screen', raws.length === 0, raws.join(', '))
  check('MUTATION: showing body.message is caught', rawErr('setError(body.message)'))
  const gbpLib = walk('lib/gbp').map(read).join('\n')
  check('no provider text is logged or stored (no console.* with a response body in lib/gbp)', !/console\.(log|error|warn)\([^)]*(json|body|message|text)/.test(strip(gbpLib)))

  const keys = (o: unknown, p = ''): string[] => typeof o === 'object' && o !== null && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}.${k}`)) : [p]
  const he = keys(dashboardHe.mapsPosts).sort(), en = keys(dashboardEn.mapsPosts).sort()
  check('mapsPosts has the same keys in Hebrew and English', JSON.stringify(he) === JSON.stringify(en), he.filter((k) => !en.includes(k)).concat(en.filter((k) => !he.includes(k))).join(', '))
  check('every error code and every validation code has a sentence in both languages',
    E.GBP_ERROR_CODES.every((c) => typeof dashboardHe.mapsPosts.errors[c] === 'string' && typeof dashboardEn.mapsPosts.errors[c] === 'string')
    && ['summary_empty', 'summary_too_long', 'summary_has_phone', 'cta_type_invalid', 'cta_url_required', 'cta_url_not_allowed', 'cta_url_invalid', 'cta_url_not_https', 'cta_url_other_site', 'cta_url_too_long', 'schedule_invalid', 'schedule_in_past', 'schedule_too_far'].every((c) => typeof dashboardHe.mapsPosts.fields[c] === 'string' && typeof dashboardEn.mapsPosts.fields[c] === 'string'))
  check('every button type has a label', V.GBP_CTA_TYPES.every((t) => dashboardHe.mapsPosts.composer.ctaTypes[t] && dashboardEn.mapsPosts.composer.ctaTypes[t]))
  check('Hebrew copy is Hebrew (no untranslated English sentence)', !keys(dashboardHe.mapsPosts).some((k) => {
    const v = k.split('.').slice(1).reduce((o: any, x) => o?.[x], dashboardHe.mapsPosts)
    return typeof v === 'string' && /^[A-Za-z][A-Za-z ,.'-]{12,}$/.test(v)
  }))
  const raw = client.map(read).join('\n')
  check('no raw slate/blue Tailwind colours in the new screen', !/\b(bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/.test(raw))
  check('MUTATION: a raw colour is caught', /\b(bg|text)-(slate|blue)-\d{2,3}\b/.test(`${raw} text-blue-600`))
}

async function main() {
  await oauthChecks()
  await handlerChecks()
  await publishChecks()
  await imageChecks()
  sourceChecks()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1) })

export {}
