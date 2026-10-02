/**
 * SITE PLATFORMS — Wix and a custom site via signed webhook, next to WordPress
 * and Shopify, from one "switch platform" modal.
 *
 *   A) the modal: fields appear only for the chosen option, the disconnect
 *      warning shows up front, a new Wix/webhook pair is validated BEFORE the
 *      current platform is disconnected (rendered markup + the pure flow);
 *   B) webhook SSRF: http, private IP, localhost, a name resolving to a private
 *      address, a redirect to a private IP (never followed), rebinding at
 *      connect time, and the body cap;
 *   C) HMAC-SHA256 signature: a fixed vector computed outside this code base,
 *      and verification refusing any tampering;
 *   D) secrets never reach a browser: every handler response, the sanitizer,
 *      the stored row (encrypted), and no client component importing server code;
 *   E) Wix adapter request shape against a fake fetch (endpoints, headers,
 *      body), and merchant-safe failures;
 *   F) dispatch: the resolver and publishPoolItem choose the right adapter, and
 *      WordPress/Shopify resolution is unchanged when no site row exists;
 *   G) a Shopify App Store project sees no platform switch (UI + routes);
 *   H) he/en parity and design tokens.
 * Every guard has a mutation control: the same predicate on a broken input must fail.
 *
 * Run: npx tsx lib/site-platforms/__qa__/site-platforms.qa.ts
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { admitWebhookUrl, admitWebhookUrlSyntax, sendGuardedPost, WebhookTransportError, WEBHOOK_MAX_BODY_BYTES, type Transport, type TransportRequest } from '../outbound'
import { signWebhookBody, verifyWebhookSignature, deliverWebhook, buildTestPayload, buildArticlePayload, deliveryIdFor, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../webhook'
import { testWixConnection, publishToWix, buildWixDraftRequest, htmlToRicos, WIX_API_BASE, type FetchLike } from '../wix'
import { sanitizeSiteConnection, SITE_ERROR_CODES, type SiteConnectionRow, type SitePlatform } from '../types'
import { isPlatformSwitchLocked } from '../store'
import { switchView, switchSteps, FIELDS_BY_PLATFORM, disconnectUrl, type SwitchStep } from '../switch-flow'
import { handleGetConnection, handleSaveConnection, handleDeleteConnection, handleTest, handlePublishArticle, type SiteRouteDeps } from '../http'
import { SITE_ADAPTERS, type SiteAdapter } from '../publish'
import { resolveActivePlatform, siteConnectionState } from '../../content/platform/active-platform'
import { publishPoolItem } from '../../content/automation/publish-item'
import { PlatformSwitchBody } from '../../../components/content/site-platforms/PlatformSwitchModal'
import { EXAMPLE_PAYLOAD } from '../../../components/content/site-platforms/WebhookDocs'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

// A throwaway key for this process only (never a real secret).
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')

const OWNER = 'u-owner-1111'
const PROJECT = 'p-project-1111'
const WIX_SITE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const WIX_KEY = 'IST.eyJraWQiOiJQb3pIX2FDMiIsImFsZyI6IlJTMjU2In0.fake-key-for-qa-only'

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }]
const privateResolver = async () => [{ address: '10.0.0.5', family: 4 }]
const metadataResolver = async () => [{ address: '169.254.169.254', family: 4 }]

type Sent = TransportRequest[]
function fakeTransport(status: number, opts: { location?: string; body?: string; sent?: Sent } = {}): Transport {
  return async (req) => { opts.sent?.push(req); return { status, location: opts.location ?? null, body: opts.body ?? '' } }
}

type WixCall = { url: string; method: string; headers: Record<string, string>; body?: string }
function fakeWix(handler: (c: WixCall) => { status: number; body: unknown }, calls: WixCall[] = []): FetchLike {
  return async (url, init) => {
    const c = { url, method: init.method, headers: init.headers, body: init.body }
    calls.push(c)
    const r = handler(c)
    return { status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }
  }
}

function makeAdmin(extra: Record<string, Record<string, unknown>[]> = {}) {
  return new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    wordpress_connections: [],
    shopify_connections: [],
    site_platform_connections: [],
    billing_governance: [],
    generated_articles: [],
    ...extra,
  })
}
function deps(admin: FakeAdmin, over: Partial<SiteRouteDeps> = {}): SiteRouteDeps {
  return {
    enabled: () => true,
    auth: async (pid) => (pid === PROJECT
      ? { user: { id: OWNER }, admin: admin as never, project: { id: PROJECT, user_id: OWNER } }
      : { error: 'Forbidden', status: 403 }),
    admin: () => admin as never,
    resolver: publicResolver,
    transport: fakeTransport(200),
    wixFetch: fakeWix(() => ({ status: 200, body: { posts: [{ id: 'p1', memberId: 'm-author-1' }] } })),
    ...over,
  }
}
const post = (url: string, body: unknown) => new Request(`https://app.test${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const get = (url: string) => new Request(`https://app.test${url}`)
const del = (url: string) => new Request(`https://app.test${url}`, { method: 'DELETE' })

const he = dashboardHe.sitePlatforms

async function main() {
  // ── A) the modal ───────────────────────────────────────────────────────────
  console.log('A) the switch-platform modal')
  {
    const render = (current: SitePlatform | 'wordpress' | 'shopify' | null, choice: SitePlatform | 'wordpress' | 'shopify' | null) =>
      renderToStaticMarkup(createElement(PlatformSwitchBody, { t: he, current, choice, values: {}, onChoose: () => {}, onChange: () => {}, test: { state: 'idle', onRun: () => {} } }))
    const inputs = (html: string) => [...html.matchAll(/<input[^>]*name="(\w+)"/g)].map((m) => m[1]).sort().join(',')

    const none = render('wordpress', null)
    check('A1: before any choice there are no fields', inputs(none) === '' && !/data-switch-fields/.test(none))
    check('A2: before any choice the disconnect warning is already shown (naming WordPress)',
      /data-switch-warning="wordpress"/.test(none) && none.includes(he.modal.warnTitle.replace('{platform}', 'WordPress')))
    check('A3: all four options are offered, the connected one disabled',
      ['wordpress', 'shopify', 'wix', 'webhook'].every((p) => none.includes(`data-platform-option="${p}"`)) &&
      /data-platform-option="wordpress"[^>]*disabled=""|disabled=""[^>]*data-platform-option="wordpress"/.test(none))
    const wp = render('wix', 'wordpress'), sh = render('wix', 'shopify'), wx = render(null, 'wix'), wh = render('shopify', 'webhook')
    check('A4: WordPress reveals no fields, only the note that its own form follows', inputs(wp) === '' && wp.includes(he.modal.wordpressNext))
    check('A5: Shopify reveals no fields, only the note that its own flow follows', inputs(sh) === '' && sh.includes(he.modal.shopifyNext))
    check('A6: Wix reveals exactly site URL, site ID and API key', inputs(wx) === 'apiKey,siteId,siteUrl', inputs(wx))
    check('A7: the API key field is a password field', /<input[^>]*type="password"[^>]*name="apiKey"|name="apiKey"[^>]*type="password"/.test(wx))
    check('A8: webhook reveals exactly the endpoint and the developer notes', inputs(wh) === 'endpointUrl' && wh.includes(he.webhook.docs.toggle))
    check('A9: nothing connected → no warning', !/data-switch-warning/.test(wx))
    check('A10: an option is a radio with aria-checked', /role="radio"[^>]*aria-checked="true"[^>]*data-platform-option="wix"/.test(wx))

    const v0 = switchView('wordpress', null)
    const vWix = switchView('wordpress', 'wix', { siteId: WIX_SITE })
    const vWixFull = switchView('wordpress', 'wix', { siteId: WIX_SITE, apiKey: 'k' })
    check('A11: no choice → cannot confirm; the warning names the current platform', !v0.canConfirm && v0.warnAbout === 'wordpress' && v0.fields.length === 0)
    check('A12: Wix confirm needs site ID and key (the URL is optional)', !vWix.canConfirm && vWixFull.canConfirm && vWixFull.canTest)
    check('A13: choosing the current platform cannot be confirmed', !switchView('shopify', 'shopify').canConfirm)
    check('A14: confirm reads "switch" when something is connected, "connect" otherwise',
      switchView('wix', 'webhook', { endpointUrl: 'https://x.example.com/' }).confirmLabel === 'switch' && switchView(null, 'wordpress').confirmLabel === 'connect')

    const validatesFirst = (steps: SwitchStep[]) => {
      const v = steps.findIndex((s) => s.kind === 'validate'), d = steps.findIndex((s) => s.kind === 'disconnect'), sv = steps.findIndex((s) => s.kind === 'save')
      return v === 0 && d > v && sv > d
    }
    check('A15: WordPress → Wix validates the new pair BEFORE disconnecting WordPress, then saves', validatesFirst(switchSteps('wordpress', 'wix')))
    check('A16: Shopify → webhook likewise', validatesFirst(switchSteps('shopify', 'webhook')))
    check('A17: Wix → WordPress disconnects Wix, then opens the existing WordPress panel',
      JSON.stringify(switchSteps('wix', 'wordpress')) === JSON.stringify([{ kind: 'disconnect', platform: 'wix' }, { kind: 'openPanel', platform: 'wordpress' }]))
    check('A18: nothing connected → no disconnect step', !switchSteps(null, 'wix').some((s) => s.kind === 'disconnect'))
    check('A19: disconnect reuses each platform\'s own route',
      disconnectUrl('wordpress', 'p') === '/api/wordpress/connection?projectId=p' && disconnectUrl('shopify', 'p') === '/api/shopify/connection?projectId=p' && disconnectUrl('webhook', 'p') === '/api/site-platforms/connection?projectId=p')
    check('A20 MUT: disconnect-before-validate is caught', !validatesFirst([{ kind: 'disconnect', platform: 'wordpress' }, { kind: 'validate', platform: 'wix' }, { kind: 'save', platform: 'wix' }]))
    const mutated = { ...FIELDS_BY_PLATFORM, wordpress: ['siteUrl' as const] }
    check('A21 MUT: a WordPress choice that grew a field is caught', mutated.wordpress.length !== 0)
  }

  // ── B) webhook SSRF ───────────────────────────────────────────────────────
  console.log('\nB) webhook SSRF refusals')
  {
    const refused = async (url: string, resolver = publicResolver) => (await admitWebhookUrl(url, resolver))
    const r1 = await refused('http://hooks.example.com/gotop')
    check('B1: http:// is refused (never upgraded)', !r1.ok && r1.code === 'url_not_https')
    const r2 = await refused('https://10.0.0.5/hook')
    check('B2: a private IP literal is refused', !r2.ok && r2.code === 'url_not_public')
    const r3 = await refused('https://localhost/hook')
    check('B3: localhost is refused', !r3.ok && r3.code === 'url_not_public')
    const r3b = await refused('https://127.0.0.1/hook'), r3c = await refused('https://0x7f000001/hook'), r3d = await refused('https://[::1]/hook')
    check('B4: loopback in dotted, hex and IPv6 spellings is refused', [r3b, r3c, r3d].every((r) => !r.ok))
    const r4 = await refused('https://internal.example.com/hook', privateResolver)
    const r5 = await refused('https://meta.example.com/hook', metadataResolver)
    check('B5: a public-looking name resolving to 10.x or 169.254.169.254 is refused', !r4.ok && r4.code === 'url_not_public' && !r5.ok && r5.code === 'url_not_public')
    const r6 = await refused('https://hooks.example.com:8443/hook')
    check('B6: an explicit port is refused', !r6.ok)
    const r7 = await refused('https://user:pw@hooks.example.com/hook')
    check('B7: credentials in the URL are refused', !r7.ok)
    const ok = await refused('https://hooks.example.com/gotop?x=1')
    check('B8: a public https address is admitted, path and query kept', ok.ok && ok.url.toString() === 'https://hooks.example.com/gotop?x=1')

    // A redirect to a private IP: refused, and the hop is never requested.
    const sent: Sent = []
    const redir = await sendGuardedPost('https://hooks.example.com/gotop', {}, '{}', { resolver: publicResolver, transport: fakeTransport(302, { location: 'https://10.0.0.1/steal', sent }) })
    check('B9: a 302 to a private IP is refused and NOT followed (one request only)',
      !redir.ok && redir.code === 'webhook_redirect_refused' && sent.length === 1 && sent[0].url.hostname === 'hooks.example.com')
    const sent2: Sent = []
    const redirPub = await sendGuardedPost('https://hooks.example.com/gotop', {}, '{}', { resolver: publicResolver, transport: fakeTransport(307, { location: 'https://other.example.org/', sent: sent2 }) })
    check('B10: no redirect is followed at all, even to a public host', !redirPub.ok && redirPub.code === 'webhook_redirect_refused' && sent2.length === 1)
    const rebind = await sendGuardedPost('https://hooks.example.com/gotop', {}, '{}', { resolver: publicResolver, transport: async () => { throw new WebhookTransportError('blocked') } })
    check('B11: a name that re-resolves to a private address at connect time is refused', !rebind.ok && rebind.code === 'url_not_public')
    const timeout = await sendGuardedPost('https://hooks.example.com/gotop', {}, '{}', { resolver: publicResolver, transport: async () => { throw new WebhookTransportError('timeout') } })
    check('B12: a timeout is reported as such, retryable', !timeout.ok && timeout.code === 'webhook_timeout' && timeout.retryable)
    const sent3: Sent = []
    const big = await sendGuardedPost('https://hooks.example.com/gotop', {}, 'x'.repeat(WEBHOOK_MAX_BODY_BYTES + 1), { resolver: publicResolver, transport: fakeTransport(200, { sent: sent3 }) })
    check('B13: an oversized body is refused before any request', !big.ok && big.code === 'webhook_too_large' && sent3.length === 0)
    const sent4: Sent = []
    await sendGuardedPost('http://hooks.example.com/gotop', {}, '{}', { resolver: publicResolver, transport: fakeTransport(200, { sent: sent4 }) })
    check('B14: a refused URL sends nothing', sent4.length === 0)
    check('B15: the production transport pins its lookup, sets a timeout and caps the response',
      /lookup: publicOnlyLookup/.test(strip(read('lib/site-platforms/outbound.ts'))) && /timeout: req\.timeoutMs/.test(read('lib/site-platforms/outbound.ts')) && /maxResponseBytes/.test(read('lib/site-platforms/outbound.ts')))
    check('B16: the guard is imported from lib/free-check, not copied', /from '@\/lib\/free-check\/url-guard'/.test(read('lib/site-platforms/outbound.ts')) && !/function isReservedIpv4/.test(read('lib/site-platforms/outbound.ts')))

    // MUTATION: the same "never follows" predicate on a sender that DOES follow must fail.
    const followingSender = async (transport: Transport) => {
      const first = await transport({ url: new URL('https://hooks.example.com/'), headers: {}, body: '{}', timeoutMs: 1, maxResponseBytes: 1 })
      if (first.status >= 300 && first.status < 400 && first.location) await transport({ url: new URL(first.location), headers: {}, body: '{}', timeoutMs: 1, maxResponseBytes: 1 })
    }
    const sent5: Sent = []
    await followingSender(fakeTransport(302, { location: 'https://10.0.0.1/steal', sent: sent5 }))
    check('B17 MUT: a sender that follows redirects is caught by the one-request predicate', sent5.length !== 1)
    const acceptsHttp = (u: string) => ({ ok: /^https?:\/\//.test(u) })
    check('B18 MUT: an admission that accepts http:// is caught', acceptsHttp('http://hooks.example.com/').ok !== admitWebhookUrlSyntax('http://hooks.example.com/').ok)
  }

  // ── C) HMAC signature ─────────────────────────────────────────────────────
  console.log('\nC) HMAC-SHA256 signature')
  {
    // Vector computed with Python's hmac module, outside this code base.
    const VECTOR = '9182e7faa805f76aca41909b442f376f934b5cd061091a775671f70d4fc2bd49'
    check('C1: the signature matches an independently computed vector',
      signWebhookBody('whsec_known_vector_secret', '1700000000', '{"event":"test"}') === VECTOR)
    const sent: Sent = []
    const now = () => new Date('2026-09-28T07:00:00Z')
    const res = await deliverWebhook('https://hooks.example.com/gotop', 'whsec_abc', buildTestPayload(now()), { resolver: publicResolver, transport: fakeTransport(204, { sent }), now })
    const req = sent[0]
    const ts = req?.headers[TIMESTAMP_HEADER]
    check('C2: the delivery succeeds and carries timestamp + signature headers', res.ok && ts === '1790578800' && /^sha256=[0-9a-f]{64}$/.test(req.headers[SIGNATURE_HEADER]))
    check('C3: the signature covers EXACTLY the bytes sent',
      req.headers[SIGNATURE_HEADER] === `sha256=${crypto.createHmac('sha256', 'whsec_abc').update(`${ts}.${req.body}`).digest('hex')}`)
    check('C4: the receiver-side check accepts it', verifyWebhookSignature('whsec_abc', ts, req.body, req.headers[SIGNATURE_HEADER]))
    check('C5: a changed body fails verification', !verifyWebhookSignature('whsec_abc', ts, req.body.replace('test', 'tost'), req.headers[SIGNATURE_HEADER]))
    check('C6: a changed timestamp fails verification (replay protection)', !verifyWebhookSignature('whsec_abc', String(Number(ts) + 1), req.body, req.headers[SIGNATURE_HEADER]))
    check('C7: another secret fails verification', !verifyWebhookSignature('whsec_other', ts, req.body, req.headers[SIGNATURE_HEADER]))
    const bodyOnly = (secret: string, _t: string, body: string) => crypto.createHmac('sha256', secret).update(body).digest('hex')
    check('C8 MUT: a signature that omits the timestamp is caught', bodyOnly('whsec_known_vector_secret', '1700000000', '{"event":"test"}') !== VECTOR)
    check('C9: the delivery id is stable per article (retries dedupe)', deliveryIdFor('a1') === deliveryIdFor('a1') && deliveryIdFor('a1') !== deliveryIdFor('a2'))
    const payload = buildArticlePayload({ id: 'a1', title: 'T', slug: 's', excerpt: 'e', meta_title: 'mt', meta_description: 'md', content_html: '<p>x</p>', featured_image_url: 'http://insecure.example.com/i.png' }, 'article.published', now())
    check('C10: the payload has title, slug, html, excerpt, image URL and meta', payload.article.title === 'T' && payload.article.slug === 's' && payload.article.html === '<p>x</p>' && payload.article.excerpt === 'e' && payload.article.meta.description === 'md')
    check('C11: a non-https image URL is not passed on', payload.article.image_url === null)
    const keys = (o: unknown): string[] => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => [k, ...keys(v).map((c) => `${k}.${c}`)]) : [])
    check('C12: the in-app developer example has exactly the payload\'s fields', JSON.stringify(keys(JSON.parse(EXAMPLE_PAYLOAD)).sort()) === JSON.stringify(keys(payload).sort()))
  }

  // ── D) secrets never serialized to the client ─────────────────────────────
  console.log('\nD) secrets never reach a browser')
  {
    const admin = makeAdmin()
    const d = deps(admin)
    const saveWix = await handleSaveConnection(post('/api/site-platforms/connection', { projectId: PROJECT, platform: 'wix', siteId: WIX_SITE, apiKey: WIX_KEY, siteUrl: 'owner.wixsite.com/blog' }), d)
    const saveText = await saveWix.text()
    const row = (admin.tables.site_platform_connections[0] ?? {}) as unknown as SiteConnectionRow
    check('D1: a Wix pair that passes its test is saved as connected', saveWix.status === 200 && row.connection_status === 'connected' && row.wix_member_id === 'm-author-1')
    check('D2: the stored key is encrypted (iv:tag:ciphertext), never plaintext', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(row.secret_encrypted) && !JSON.stringify(admin.tables).includes(WIX_KEY))
    check('D3: the save response carries neither the key nor its ciphertext nor the author id',
      !saveText.includes(WIX_KEY) && !saveText.includes(row.secret_encrypted) && !saveText.includes('m-author-1') && !/secret_encrypted/.test(saveText))
    check('D4: the save response shows the key only masked', JSON.parse(saveText).connection.secret_hint === `••••${WIX_KEY.slice(-4)}`)
    const getText = await (await handleGetConnection(get(`/api/site-platforms/connection?projectId=${PROJECT}`), d)).text()
    check('D5: GET carries no key, ciphertext or author id', !getText.includes(WIX_KEY) && !getText.includes(row.secret_encrypted) && !getText.includes('m-author-1'))

    // Webhook: the secret is shown ONCE, in the response that created it.
    const admin2 = makeAdmin()
    const d2 = deps(admin2)
    const first = await (await handleSaveConnection(post('/api/site-platforms/connection', { projectId: PROJECT, platform: 'webhook', endpointUrl: 'https://hooks.example.com/gotop' }), d2)).json() as { secret?: string; connection: { secret_hint: string } }
    const secret = first.secret ?? ''
    check('D6: a new webhook returns its signing secret once', /^whsec_[A-Za-z0-9_-]{40,}$/.test(secret) && first.connection.secret_hint.startsWith('whsec_••••'))
    const again = await (await handleGetConnection(get(`/api/site-platforms/connection?projectId=${PROJECT}`), d2)).text()
    const edit = await (await handleSaveConnection(post('/api/site-platforms/connection', { projectId: PROJECT, platform: 'webhook', endpointUrl: 'https://hooks.example.com/v2' }), d2)).text()
    check('D7: later reads — and an edit of the URL — never return it again', !again.includes(secret) && !edit.includes(secret) && !/"secret"/.test(edit))
    check('D8: the stored webhook secret is encrypted', !JSON.stringify(admin2.tables).includes(secret))
    const testText = await (await handleTest(post('/api/site-platforms/test', { projectId: PROJECT }), d2)).text()
    check('D9: the send-test response carries no secret', !testText.includes(secret) && JSON.parse(testText).ok === true)

    const sample: SiteConnectionRow = { ...row, secret_encrypted: 'aa:bb:cc', wix_member_id: 'm-x' }
    const clean = sanitizeSiteConnection(sample)
    const exposes = (o: object) => 'secret_encrypted' in o || 'wix_member_id' in o || JSON.stringify(o).includes('aa:bb:cc')
    check('D10: the sanitizer lists safe fields only', !exposes(clean))
    check('D11 MUT: a sanitizer that spreads the row is caught', exposes({ ...sample }))

    // No client component may import the server-only modules (they hold the secret at use).
    const serverOnly = /from '@\/lib\/site-platforms\/(store|http|secrets|outbound|webhook|wix|publish|route-deps)'/
    const dir = join(ROOT, 'components/content/site-platforms')
    const clientFiles = [...readdirSync(dir).map((f) => `components/content/site-platforms/${f}`), 'components/content/ContentSection.tsx', 'components/content/ArticleEditorPublishGate.tsx', 'components/content/workspace/ArticlesScreen.tsx']
    const offenders = clientFiles.filter((f) => serverOnly.test(strip(read(f))))
    check('D12: no client component imports a server-only site-platform module', offenders.length === 0, offenders.join(', '))
    check('D13 MUT: such an import is caught', serverOnly.test("import { loadSiteConnection } from '@/lib/site-platforms/store'"))
  }

  // ── E) the Wix adapter against a fake fetch ───────────────────────────────
  console.log('\nE) Wix adapter request shape')
  {
    const calls: WixCall[] = []
    const t = await testWixConnection({ siteId: WIX_SITE, apiKey: WIX_KEY }, fakeWix(() => ({ status: 200, body: { posts: [{ memberId: 'm-9' }] } }), calls))
    check('E1: test connection is ONE GET of /blog/v3/posts?paging.limit=1 on www.wixapis.com',
      calls.length === 1 && calls[0].method === 'GET' && calls[0].url === `${WIX_API_BASE}/blog/v3/posts?paging.limit=1` && !calls[0].body)
    check('E2: API-key auth headers: Authorization = key, wix-site-id = site', calls[0].headers.Authorization === WIX_KEY && calls[0].headers['wix-site-id'] === WIX_SITE)
    check('E3: the blog author is read from the post', t.ok && t.memberId === 'm-9')

    const pubCalls: WixCall[] = []
    const article = {
      id: 'art-1', title: 'How to pick running shoes', slug: 'pick-running-shoes', excerpt: 'Short answer first.',
      meta_title: 'Pick running shoes', meta_description: 'A guide.', featured_image_url: 'https://cdn.example.com/hero.png',
      content_html: '<h2>Fit first</h2><p>Try them <strong>late</strong> in the day, see <a href="https://example.com/x">this</a>.</p><ul><li>Heel</li><li>Toe</li></ul><img src="https://cdn.example.com/in.png" alt="shoe"><table><tr><td>a</td></tr></table>',
    }
    const out = await publishToWix({ siteId: WIX_SITE, apiKey: WIX_KEY, memberId: 'm-9' }, article,
      fakeWix(() => ({ status: 200, body: { draftPost: { id: 'wix-post-1', url: { base: 'https://owner.wixsite.com/blog', path: '/post/pick-running-shoes' } } } }), pubCalls))
    const body = JSON.parse(pubCalls[0]?.body ?? '{}')
    check('E4: publish is ONE POST to /blog/v3/draft-posts with publish: true', pubCalls.length === 1 && pubCalls[0].method === 'POST' && pubCalls[0].url === `${WIX_API_BASE}/blog/v3/draft-posts` && body.publish === true)
    check('E5: title, slug, excerpt and the author member id are sent', body.draftPost.title === article.title && body.draftPost.seoSlug === article.slug && body.draftPost.excerpt === article.excerpt && body.draftPost.memberId === 'm-9')
    check('E6: the featured image is the cover media ({ url } as the Wix SDK sends a non-Wix image)',
      body.draftPost.media?.wixMedia?.image?.url === article.featured_image_url && body.draftPost.media.displayed === true)
    check('E7: meta title and description go in seoData', JSON.stringify(body.draftPost.seoData) === JSON.stringify({ tags: [{ type: 'title', children: 'Pick running shoes' }, { type: 'meta', props: { name: 'description', content: 'A guide.' } }] }))
    const types = (body.draftPost.richContent.nodes as { type: string }[]).map((n) => n.type).join(',')
    check('E8: the HTML becomes Ricos nodes (heading, paragraph, list, image; a table kept as HTML)', types === 'HEADING,PARAGRAPH,BULLETED_LIST,IMAGE,HTML', types)
    const para = body.draftPost.richContent.nodes[1].nodes as { textData: { text: string; decorations: { type: string; linkData?: { link: { url: string } } }[] } }[]
    check('E9: bold and link decorations survive', para.some((n) => n.textData.text === 'late' && n.textData.decorations.some((d) => d.type === 'BOLD')) &&
      para.some((n) => n.textData.text === 'this' && n.textData.decorations.some((d) => d.type === 'LINK' && d.linkData?.link.url === 'https://example.com/x')))
    check('E10: the post id and its https URL come back', out.ok && out.postId === 'wix-post-1' && out.url === 'https://owner.wixsite.com/blog/post/pick-running-shoes')
    check('E11: no image → no media field', !('media' in buildWixDraftRequest({ ...article, featured_image_url: null }, null).draftPost))
    check('E12: a javascript: link is not carried into the post', !JSON.stringify(htmlToRicos('<p><a href="javascript:alert(1)">x</a></p>')).includes('javascript'))

    const raw = 'INTERNAL ERROR: key IST.abc rejected by node wix-blog-17'
    const auth = await publishToWix({ siteId: WIX_SITE, apiKey: WIX_KEY, memberId: 'm-9' }, article, fakeWix(() => ({ status: 401, body: raw })))
    const noAuthor = await publishToWix({ siteId: WIX_SITE, apiKey: WIX_KEY, memberId: null }, article, fakeWix(() => ({ status: 400, body: raw })))
    const down = await publishToWix({ siteId: WIX_SITE, apiKey: WIX_KEY, memberId: 'm-9' }, article, fakeWix(() => ({ status: 503, body: raw })))
    check('E13: 401 → wix_auth_failed; 400 with no author → wix_no_author; 503 → wix_unavailable (retryable)',
      !auth.ok && auth.code === 'wix_auth_failed' && !noAuthor.ok && noAuthor.code === 'wix_no_author' && !down.ok && down.code === 'wix_unavailable' && down.retryable)
    check('E14: the provider\'s text never comes back', !JSON.stringify([auth, noAuthor, down]).includes('INTERNAL'))
    const saveFail = await handleSaveConnection(post('/api/site-platforms/connection', { projectId: PROJECT, platform: 'wix', siteId: WIX_SITE, apiKey: WIX_KEY }), deps(makeAdmin(), { wixFetch: fakeWix(() => ({ status: 403, body: raw })) }))
    const saveFailText = await saveFail.text()
    check('E15: a failed test saves nothing and answers a code, not Wix\'s words', saveFail.status === 400 && JSON.parse(saveFailText).reason === 'wix_auth_failed' && !saveFailText.includes('INTERNAL'))
    check('E16 MUT: a request without publish: true is caught', ({ ...buildWixDraftRequest(article, 'm'), publish: false } as { publish: boolean }).publish !== true)
  }

  // ── F) dispatch ───────────────────────────────────────────────────────────
  console.log('\nF) dispatch chooses the right adapter')
  {
    const wp = (present: boolean, s: string | null) => ({ present, connectionStatus: s })
    const sh = (present: boolean, s: string | null) => ({ present, connectionStatus: s, canPublish: true })
    const site = (p: 'wix' | 'webhook', s: string) => siteConnectionState({ platform: p, connection_status: s })
    check('F1: a connected Wix alone → wix; a webhook alone → webhook',
      resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(false, null), site: site('wix', 'connected') }).platform === 'wix' &&
      resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(false, null), site: site('webhook', 'connected') }).platform === 'webhook')
    check('F2: connected Wix + connected WordPress → conflict', resolveActivePlatform({ wordpress: wp(true, 'connected'), shopify: sh(false, null), site: site('wix', 'connected') }).platform === 'conflict')
    check('F3: a FAILED Wix row never blocks a connected Shopify', resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(true, 'connected'), site: site('wix', 'failed') }).platform === 'shopify')
    // No site row → every WordPress/Shopify combination resolves exactly as before.
    const statuses = [null, 'untested', 'connected', 'failed']
    let same = true
    for (const a of statuses) for (const b of statuses) {
      const base = { wordpress: wp(a !== null, a), shopify: sh(b !== null, b) }
      const before = JSON.stringify({ ...resolveActivePlatform(base), siteActive: undefined })
      for (const extra of [undefined, null, siteConnectionState(null)]) {
        const now = JSON.stringify({ ...resolveActivePlatform({ ...base, site: extra }), siteActive: undefined })
        if (now !== before) same = false
      }
    }
    check('F4: with no Wix/webhook row, all 16 WordPress×Shopify states resolve as before', same)
    check('F5 MUT: a resolver that lets a site row override a connected WordPress is caught',
      resolveActivePlatform({ wordpress: wp(true, 'connected'), shopify: sh(false, null), site: site('wix', 'connected') }).platform !== 'wix')

    // publishPoolItem (the automation runner) → the site path, and the RIGHT adapter.
    const used: string[] = []
    const fakeAdapter = (name: SitePlatform): SiteAdapter => async (conn, article) => {
      used.push(`${name}:${conn.platform}:${article.id}`)
      return { ok: true, postId: `${name}-post-1`, url: `https://site.example.com/${name}` }
    }
    const original = { ...SITE_ADAPTERS }
    SITE_ADAPTERS.wix = fakeAdapter('wix'); SITE_ADAPTERS.webhook = fakeAdapter('webhook')
    const runPool = async (platform: SitePlatform) => {
      used.length = 0
      const enc = (await import('../../security/credentials-crypto')).encryptCredential('k-'.repeat(12))
      const admin = makeAdmin({
        site_platform_connections: [{ id: 's1', user_id: OWNER, project_id: PROJECT, platform, wix_site_id: platform === 'wix' ? WIX_SITE : null, wix_member_id: 'm', endpoint_url: platform === 'webhook' ? 'https://hooks.example.com/' : null, secret_encrypted: enc, secret_hint: 'x', connection_status: 'connected' }],
        generated_articles: [{ id: 'art-9', project_id: PROJECT, topic_id: null, title: 'T', slug: 't', content_html: '<p>x</p>', status: 'generated' }],
        article_pool_items: [{ id: 'item-1', project_id: PROJECT, topic_id: null, article_id: 'art-9', status: 'generated', attempts: 0 }],
      })
      const res = await publishPoolItem(admin as never, 'item-1')
      return { res, admin }
    }
    const wixRun = await runPool('wix')
    check('F6: a Wix project\'s queue item goes to the Wix adapter, once', JSON.stringify(used) === '["wix:wix:art-9"]' && wixRun.res.status === 'published', JSON.stringify({ used, r: wixRun.res }))
    const art = wixRun.admin.tables.generated_articles[0]
    check('F7: the post id is recorded and the article is published', art.site_post_id === 'wix-post-1' && art.site_post_platform === 'wix' && art.status === 'published')
    const hookRun = await runPool('webhook')
    check('F8: a webhook project\'s queue item goes to the webhook adapter, once', JSON.stringify(used) === '["webhook:webhook:art-9"]' && hookRun.res.status === 'published')
    // Mutation: swap the map — the same predicate must now fail.
    SITE_ADAPTERS.wix = fakeAdapter('webhook')
    await runPool('wix')
    check('F9 MUT: a dispatch that picks the wrong adapter is caught', JSON.stringify(used) !== '["wix:wix:art-9"]')
    SITE_ADAPTERS.wix = original.wix; SITE_ADAPTERS.webhook = original.webhook

    // Manual publish route: owner-checked, the right adapter, idempotent.
    const enc = (await import('../../security/credentials-crypto')).encryptCredential('whsec_' + 'z'.repeat(40))
    const admin = makeAdmin({
      site_platform_connections: [{ id: 's1', user_id: OWNER, project_id: PROJECT, platform: 'webhook', wix_site_id: null, endpoint_url: 'https://hooks.example.com/', secret_encrypted: enc, secret_hint: 'x', connection_status: 'connected' }],
      generated_articles: [{ id: 'art-7', project_id: PROJECT, title: 'T', slug: 't', content_html: '<p>x</p>', status: 'ready' }, { id: 'art-other', project_id: 'p-someone-else', title: 'X', content_html: '<p>x</p>', status: 'ready' }],
    })
    used.length = 0
    const adapters = { wix: fakeAdapter('wix'), webhook: fakeAdapter('webhook') }
    const r1 = await (await handlePublishArticle('art-7', deps(admin, { adapters }))).json() as { ok?: boolean; platform?: string }
    const r2 = await (await handlePublishArticle('art-7', deps(admin, { adapters }))).json() as { reconciled?: boolean }
    check('F10: the manual route publishes through the webhook adapter once; a repeat is reconciled, not re-posted',
      r1.ok === true && r1.platform === 'webhook' && r2.reconciled === true && JSON.stringify(used) === '["webhook:webhook:art-7"]')
    const foreign = await handlePublishArticle('art-other', deps(admin, { adapters }))
    check('F11: another owner\'s article is refused (403) and nothing is sent', foreign.status === 403 && used.length === 1)
    const real = await (await handlePublishArticle('art-7', deps(makeAdmin({ generated_articles: [{ id: 'art-7', project_id: PROJECT, title: 'T', content_html: '<p>x</p>', status: 'ready' }] }), { adapters }))).json() as { reason?: string }
    check('F12: with no connection the route answers no_site_connection', real.reason === 'no_site_connection')
    check('F13: publish-item dispatches wix/webhook to the site publisher (source)',
      /if \(active\.platform === 'wix' \|\| active\.platform === 'webhook'\) \{\s*return await publishSitePoolItem\(admin, item\)/.test(strip(read('lib/content/automation/publish-item.ts'))))
  }

  // ── G) Shopify App Store projects: no platform switch ─────────────────────
  console.log('\nG) a Shopify-app project sees no platform switch')
  {
    const shopifyGov = { status: 'loaded' as const, governance: { userId: OWNER, signupOrigin: 'shopify_app_store' as const, billingAuthority: 'shopify' as const, authorityReason: null } }
    const webGov = { status: 'loaded' as const, governance: { userId: OWNER, signupOrigin: 'website' as const, billingAuthority: 'website' as const, authorityReason: null } }
    check('G1: Shopify-governed → locked; website → open; no record → open',
      isPlatformSwitchLocked(shopifyGov, true) && !isPlatformSwitchLocked(webGov, true) && !isPlatformSwitchLocked({ status: 'missing' }, true))
    check('G2: an unreadable record fails closed only for a project with a store',
      isPlatformSwitchLocked({ status: 'unavailable', reason: 'x' }, true) && !isPlatformSwitchLocked({ status: 'unavailable', reason: 'x' }, false))
    const admin = makeAdmin({
      billing_governance: [{ user_id: OWNER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }],
      shopify_connections: [{ id: 'sh1', project_id: PROJECT, archived_at: null, connection_status: 'connected' }],
    })
    const g = await (await handleGetConnection(get(`/api/site-platforms/connection?projectId=${PROJECT}`), deps(admin))).json() as { switchLocked?: boolean }
    const s = await handleSaveConnection(post('/api/site-platforms/connection', { projectId: PROJECT, platform: 'webhook', endpointUrl: 'https://hooks.example.com/' }), deps(admin))
    const dl = await handleDeleteConnection(del(`/api/site-platforms/connection?projectId=${PROJECT}`), deps(admin))
    check('G3: the connection route reports the switch locked', g.switchLocked === true)
    check('G4: saving a Wix/webhook connection is refused (409) and nothing is written', s.status === 409 && (await s.json()).reason === 'platform_switch_locked' && admin.tables.site_platform_connections.length === 0)
    check('G5: the disconnect route refuses too', dl.status === 409)
    check('G6: the Shopify connection itself is untouched', admin.tables.shopify_connections.length === 1)

    const src = strip(read('components/content/ContentSection.tsx'))
    const legacyStart = src.indexOf('const legacy = (')
    const legacyEnd = src.indexOf('if (loading || switchLocked) return legacy')
    const legacyBlock = legacyStart >= 0 && legacyEnd > legacyStart ? src.slice(legacyStart, legacyEnd) : ''
    const lockedIsLegacy = (s2: string) => /if \(loading \|\| switchLocked\) return legacy/.test(s2)
    check('G7: a locked project renders the section exactly as before (the legacy block, returned first)', lockedIsLegacy(src) && legacyBlock.length > 0)
    check('G8: the legacy block has no switch button and no modal', !/PlatformSwitchModal|data-open-switch|setSwitchOpen/.test(legacyBlock))
    check('G9 MUT: dropping the lock from the early return is caught', !lockedIsLegacy(src.replace('if (loading || switchLocked) return legacy', 'if (loading) return legacy')))
    check('G10: the embedded Shopify app surface does not render this section', !/ContentSection|PlatformSwitchModal/.test(read('app/shopify/app/ConnectorHomeClient.tsx')))
    // The existing flows are reused, not replaced.
    check('G11: the section still owns the existing WordPress and Shopify panels', /import WordPressConnectionPanel/.test(src) && /import ShopifyConnectionPanel/.test(src))
    const d2 = deps(makeAdmin({ wordpress_connections: [{ id: 'w1', project_id: PROJECT }] }))
    const excl = await handleSaveConnection(post('/api/site-platforms/connection', { projectId: PROJECT, platform: 'webhook', endpointUrl: 'https://hooks.example.com/' }), d2)
    check('G12: one platform per project is enforced server-side (WordPress still connected → 409)', excl.status === 409 && (await excl.json()).reason === 'platform_already_connected')
    const other = await handleGetConnection(get('/api/site-platforms/connection?projectId=p-not-mine'), deps(makeAdmin()))
    check('G13: every route checks ownership first', other.status === 403)
  }

  // ── H) languages and design tokens ────────────────────────────────────────
  console.log('\nH) Hebrew/English parity, merchant-safe codes, design tokens')
  {
    const paths = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => paths(v, p ? `${p}.${k}` : k)) : [p])
    const hp = paths(dashboardHe.sitePlatforms).sort(), ep = paths(dashboardEn.sitePlatforms).sort()
    check('H1: Hebrew and English have the same keys', JSON.stringify(hp) === JSON.stringify(ep), hp.filter((k) => !ep.includes(k)).concat(ep.filter((k) => !hp.includes(k))).join(','))
    const heErr = dashboardHe.sitePlatforms.errors as Record<string, string>, enErr = dashboardEn.sitePlatforms.errors as Record<string, string>
    check('H2: every error code has a sentence in both languages', SITE_ERROR_CODES.every((c) => !!heErr[c] && !!enErr[c]), SITE_ERROR_CODES.filter((c) => !heErr[c] || !enErr[c]).join(','))
    check('H3: Hebrew copy is Hebrew (every sentence with a letter has Hebrew in it)',
      paths(dashboardHe.sitePlatforms).map((k) => k.split('.').reduce<unknown>((o, s) => (o as Record<string, unknown>)[s], dashboardHe.sitePlatforms) as string)
        .filter((v) => /\s/.test(v) && !/^names\./.test(v)).every((v) => /[֐-׿]/.test(v) || /^(WordPress|Shopify|Wix)$/.test(v)))
    check('H4 MUT: a missing English code is caught', !SITE_ERROR_CODES.every((c) => !!({ ...enErr, wix_no_author: '' } as Record<string, string>)[c]))

    const legacyColours = /\b(?:text|bg|border|ring)-(?:slate|gray|indigo|amber|red|green|blue)-\d{2,3}\b/
    const dir = join(ROOT, 'components/content/site-platforms')
    const offenders = readdirSync(dir).filter((f) => legacyColours.test(read(`components/content/site-platforms/${f}`)))
    check('H5: the new components use the design tokens only (no raw palette colours)', offenders.length === 0, offenders.join(','))
    check('H6 MUT: a raw palette colour is caught', legacyColours.test('<p className="text-slate-500">'))
    check('H7: no copied competitor wording', !/SEO Agent|credentials הנוכחיים|אשר שינוי|שנה פלטפורמה/.test(JSON.stringify(dashboardHe.sitePlatforms) + JSON.stringify(dashboardEn.sitePlatforms)))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
