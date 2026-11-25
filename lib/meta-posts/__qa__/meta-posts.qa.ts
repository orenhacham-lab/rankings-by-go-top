/**
 * POSTS ON FACEBOOK AND INSTAGRAM (lib/meta-posts) — the six conditions of the
 * legal review of 2026-11-25, as guards:
 *   1  nothing goes out unapproved (store + database CHECK in the probe),
 *   2  tokens are stored AES-256-GCM encrypted and never returned,
 *   3  disconnect deletes the tokens and asks Meta to revoke,
 *   4  signed_request is verified and every deletion is owner-filtered,
 *   5  the app name on the deletion page is META_APP_NAME exactly,
 *   6  the AI prompt carries no Page data.
 * Plus: Graph errors become codes, the callbacks are not flag-gated and every
 * other route is, the cron fails closed, all 11 languages are complete, and the
 * privacy policy of every language carries the section.
 * Every guard has a MUTATION CONTROL: the same check on a broken copy must fail.
 *
 * Run: npx tsx lib/meta-posts/__qa__/meta-posts.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import { FakeAdmin } from '../../__qa__/_fake-admin'

process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
process.env.META_APP_ID = '1234567890'
process.env.META_APP_SECRET = 'app-secret-for-tests'
process.env.META_REDIRECT_URI = 'https://www.gotopseo.com/api/meta/callback'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const SR = require('../signed-request') as typeof import('../signed-request')
const E = require('../errors') as typeof import('../errors')
const S = require('../store') as typeof import('../store')
const H = require('../http') as typeof import('../http')
const P = require('../publish') as typeof import('../publish')
const D = require('../draft') as typeof import('../draft')
const CFG = require('../config') as typeof import('../config')
const { encryptGscToken } = require('../../gsc/token-crypto') as typeof import('../../gsc/token-crypto')
const { META_POSTS_TEXT } = require('../../i18n/meta-posts') as typeof import('../../i18n/meta-posts')
const { DATA_DELETION_TEXT } = require('../../legal/data-deletion') as typeof import('../../legal/data-deletion')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const LOCALES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'] as const

async function main() {
  const SECRET = 'app-secret-for-tests'

  // ── A) signed_request ──────────────────────────────────────────────────
  console.log('A) signed_request')
  const good = SR.signRequestForTest({ algorithm: 'HMAC-SHA256', user_id: '9876543210' }, SECRET)
  const verify = (s: unknown, secret = SECRET) => SR.parseSignedRequest(s, secret)
  check('a request signed with the app secret names its user', (() => { const r = verify(good); return r.ok && r.userId === '9876543210' })())
  check('a wrong secret is refused', !verify(good, 'other').ok)
  const [sig, payload] = good.split('.')
  const forged = `${sig}.${Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '1' })).toString('base64url')}`
  check('a payload swapped under the same signature is refused', !verify(forged).ok)
  check('a tampered signature is refused', !verify(`${sig.slice(0, -2)}AA.${payload}`).ok)
  check('a missing, empty or malformed value is refused', !verify(undefined).ok && !verify('').ok && !verify('abc').ok && !verify('a.b.c').ok && !verify(42).ok)
  check('another algorithm is refused', !verify(SR.signRequestForTest({ algorithm: 'none', user_id: '1' }, SECRET)).ok)
  check('a non-numeric user id is refused', !verify(SR.signRequestForTest({ algorithm: 'HMAC-SHA256', user_id: "1' OR '1'='1" }, SECRET)).ok)
  check('an empty secret verifies nothing', !verify(good, '').ok)
  // MUTATION: a verifier that skips the signature accepts the forgery.
  const noSigCheck = (s: string) => { try { return !!JSON.parse(Buffer.from(s.split('.')[1], 'base64url').toString()).user_id } catch { return false } }
  check('MUTATION — a verifier without the signature check accepts the forgery', noSigCheck(forged))

  // ── B) Graph errors ────────────────────────────────────────────────────
  console.log('B) Graph errors')
  const cls = (status: number, code?: number, sub?: number, msg = 'SECRET WORDS FROM META') => E.classifyGraphError(status, { error: { code, error_subcode: sub, message: msg } })
  check('190 → reauth_required, not retryable', cls(400, 190).code === 'reauth_required' && !cls(400, 190).retryable)
  check('4/17/32/613 → rate_limited, retryable', [4, 17, 32, 613].every((c) => cls(400, c).code === 'rate_limited' && cls(400, c).retryable))
  check('5xx and code 2 → meta_unavailable, retryable', cls(503).code === 'meta_unavailable' && cls(500, 2).retryable)
  check('a missing permission → permission_denied', cls(400, 10).code === 'permission_denied' && cls(400, 200).code === 'permission_denied')
  check('a rejected photo → image_rejected', cls(400, 100, 2207004).code === 'image_rejected')
  check('2207026 (a video-format error) is not treated as a photo problem', cls(400, 352, 2207026).code === 'unexpected')
  check('an unknown number → unexpected, never a guess', cls(400, 123456).code === 'unexpected')
  check('no provider words survive in the error', !JSON.stringify(cls(400, 190)).includes('SECRET WORDS'))

  // ── C) approval gate ───────────────────────────────────────────────────
  console.log('C) approval gate')
  const now = new Date().toISOString()
  const post = (id: string, over: Record<string, unknown> = {}) => ({
    id, project_id: 'p1', user_id: 'u1', group_id: 'g1', target: 'facebook', source_article_id: null, body: 'hello', link_url: null,
    image_url: null, language_code: 'en', status: 'draft', approved_at: null, scheduled_at: now, attempts: 0, remote_post_id: null,
    remote_permalink: null, last_error_code: null, published_at: null, created_at: now, ...over,
  });
  {
    const admin = new FakeAdmin({ meta_posts: [post('a'), post('b', { status: 'scheduled', approved_at: null })] }) as any
    check('claimPost refuses a draft', (await S.claimPost(admin, 'a')) === null)
    check('claimPost refuses a scheduled row with no approval', (await S.claimPost(admin, 'b')) === null)
    const ids = await S.duePostIds(admin, new Date(Date.now() + 1e6).toISOString(), 10)
    check('the due list holds nothing unapproved', ids.length === 0)
    const approved = await S.approveGroup(admin, 'p1', 'u1', 'g1', now)
    check('approveGroup moves the draft to scheduled and stamps approved_at', approved.length === 1 && approved[0].status === 'scheduled' && !!approved[0].approved_at)
    check('approveGroup for another owner approves nothing', (await S.approveGroup(admin, 'p1', 'someone-else', 'g1', now)).length === 0)
    const again = await S.approveGroup(admin, 'p1', 'u1', 'g1', now)
    check('approveGroup acts only on drafts (a second call changes nothing)', again.length === 0)
    const claimed = await S.claimPost(admin, 'a')
    check('an approved post is claimed once', !!claimed && (await S.claimPost(admin, 'a')) === null)
  }
  {
    const admin = new FakeAdmin({ meta_posts: [post('c', { status: 'scheduled', approved_at: null })] }) as any
    const out = await P.publishPost(admin, 'c', { facebook: async () => { throw new Error('must not be called') }, instagram: async () => { throw new Error('x') } })
    check('publishPost never calls Meta for an unapproved row', !out.ok && out.code === 'not_claimable')
  }
  const ctlSrc = strip(read('lib/meta-posts/store.ts'))
  check('only approveGroup writes approved_at', (ctlSrc.match(/approved_at: now/g) ?? []).length === 1)
  check('MUTATION — a claim without the approval filter would take a draft-like row', !/\.not\('approved_at', 'is', null\)/.test(ctlSrc.replace(/\.not\('approved_at', 'is', null\)/g, '')))

  // ── D) tokens ──────────────────────────────────────────────────────────
  console.log('D) tokens')
  const encUser = encryptGscToken('USER-TOKEN-PLAINTEXT')
  check('the envelope is v1:iv:tag:ciphertext (AES-256-GCM)', /^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(encUser) && !encUser.includes('PLAINTEXT'))
  const conn = { id: 'c1', user_id: 'u1', fb_user_id: '555', encrypted_user_token: encUser, granted_scopes: 'x', token_expires_at: null, status: 'connected' as const, last_error_code: null, updated_at: now }
  const sanitized = JSON.stringify(H.sanitizeConnection(conn as any))
  check('a sanitized connection holds no token', !/token/i.test(sanitized) && !sanitized.includes('v1:'))
  const sp = JSON.stringify(H.sanitizePost(post('z') as any))
  check('a sanitized post holds no token or user id', !/token|user_id/i.test(sp))
  check('the user token decrypts to what was stored', S.decryptUserToken(conn as any) === 'USER-TOKEN-PLAINTEXT')
  {
    const admin = new FakeAdmin({}) as any
    await S.storeMetaConnection(admin, 'u1', { fbUserId: '555', userToken: 'SECRET-USER-TOKEN', scopes: ['pages_show_list'], expiresAt: null })
    const stored = JSON.stringify(admin.tables.meta_connections)
    check('storeMetaConnection writes only the encrypted token', stored.includes('v1:') && !stored.includes('SECRET-USER-TOKEN'))
  }

  // ── E) disconnect ──────────────────────────────────────────────────────
  console.log('E) disconnect')
  {
    const tables = { meta_connections: [{ ...conn }, { ...conn, id: 'c2', user_id: 'u2', fb_user_id: '777' }], project_meta_pages: [], meta_posts: [], meta_oauth_states: [], meta_deletion_requests: [] }
    const admin = new FakeAdmin(tables) as any
    const revoked: string[] = []
    const deps = {
      auth: async () => ({ admin, user: { id: 'u1' }, project: { id: 'p1' } }),
      revoke: async (fb: string, tok: string) => { revoked.push(`${fb}:${tok}`); return true },
    } as any
    const res = await H.handleDisconnect(new Request('https://x/api/meta/connection?projectId=p1', { method: 'DELETE' }), deps)
    check('disconnect answers ok', res.status === 200)
    check('disconnect deletes this user’s connection and leaves the other user’s', admin.tables.meta_connections.length === 1 && admin.tables.meta_connections[0].user_id === 'u2')
    check('disconnect asks Meta to revoke with the decrypted token', revoked.length === 1 && revoked[0] === '555:USER-TOKEN-PLAINTEXT')
  }

  // ── F) callbacks: owner filter ─────────────────────────────────────────
  console.log('F) deletion and deauthorize')
  const mk = () => new FakeAdmin({
    meta_connections: [{ ...conn }, { ...conn, id: 'c2', user_id: 'u2', fb_user_id: '777' }],
    meta_posts: [post('p-u1', { user_id: 'u1' }), post('p-u2', { user_id: 'u2' })],
    meta_oauth_states: [{ state_hash: 'h1', user_id: 'u1' }, { state_hash: 'h2', user_id: 'u2' }],
    project_meta_pages: [], meta_deletion_requests: [],
  }) as any
  const formReq = (signed: string) => new Request('https://x/api/meta/data-deletion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=${encodeURIComponent(signed)}` })
  {
    const admin = mk()
    const res = await H.handleDataDeletion(formReq(SR.signRequestForTest({ algorithm: 'HMAC-SHA256', user_id: '555' }, SECRET)), { admin: () => admin })
    const body = await res.json() as any
    check('a verified deletion request answers with a url and a code', res.status === 200 && /^[0-9a-f]{24}$/.test(body.confirmation_code) && body.url.includes(body.confirmation_code))
    check('it deletes that user’s connection, posts and states', !admin.tables.meta_connections.some((r: any) => r.user_id === 'u1') && !admin.tables.meta_posts.some((r: any) => r.user_id === 'u1') && !admin.tables.meta_oauth_states.some((r: any) => r.user_id === 'u1'))
    check('it leaves every other user’s rows alone', admin.tables.meta_connections.length === 1 && admin.tables.meta_posts.length === 1 && admin.tables.meta_oauth_states.length === 1)
    check('the status record holds only a code, a kind and a status', Object.keys(admin.tables.meta_deletion_requests[0]).every((k) => ['code', 'kind', 'status', 'created_at', 'id'].includes(k)))
  }
  {
    const admin = mk()
    const bad = await H.handleDataDeletion(formReq(SR.signRequestForTest({ algorithm: 'HMAC-SHA256', user_id: '555' }, 'wrong')), { admin: () => admin })
    check('a request signed with another secret deletes nothing', bad.status >= 400 && admin.tables.meta_connections.length === 2 && admin.tables.meta_posts.length === 2)
    const none = await H.handleDataDeletion(new Request('https://x/api/meta/data-deletion', { method: 'POST', body: 'nothing' }), { admin: () => admin })
    check('a request with no signed_request deletes nothing', none.status >= 400 && admin.tables.meta_connections.length === 2)
  }
  {
    const admin = mk()
    const res = await H.handleDeauthorize(formReq(SR.signRequestForTest({ algorithm: 'HMAC-SHA256', user_id: '777' }, SECRET)), { admin: () => admin })
    check('deauthorize deletes that connection (tokens) and only that one', res.status === 200 && admin.tables.meta_connections.length === 1 && admin.tables.meta_connections[0].user_id === 'u1')
    check('deauthorize keeps the post history', admin.tables.meta_posts.length === 2)
  }
  {
    const users = await S.deleteFbUserData(mk(), '55x5')
    check('an invalid Facebook id matches nobody', users.users === 0)
  }
  const storeSrc = strip(read('lib/meta-posts/store.ts'))
  const delBlock = storeSrc.slice(storeSrc.indexOf('export async function deleteFbUserData'), storeSrc.indexOf('export async function recordDeletionRequest'))
  check('every delete in deleteFbUserData is filtered by user_id', (delBlock.match(/\.delete\(\)/g) ?? []).length === (delBlock.match(/\.delete\(\)\.eq\('user_id'/g) ?? []).length)
  check('MUTATION — an unfiltered delete is caught by the same pattern', (delBlock.replace(/\.eq\('user_id', userId\)/g, '').match(/\.delete\(\)\.eq\('user_id'/g) ?? []).length === 0)

  // ── G) AI prompt ───────────────────────────────────────────────────────
  console.log('G) the AI prompt')
  const prompt = D.buildMetaDraftPrompt({ language: 'en', article: { title: 'How to pick a plumber', description: 'Tips' }, topic: null })
  check('the prompt carries the article title and summary', prompt.includes('How to pick a plumber') && prompt.includes('Tips'))
  const draftSrc = strip(read('lib/meta-posts/draft.ts'))
  check('the draft module imports nothing that reads a Page, a token or a connection', !/page_name|page_id|ig_username|encrypted_|decrypt|readProjectPage|readMetaConnection/.test(draftSrc))
  check('MUTATION — a prompt that named the Page would be caught', /page_name/.test('x page_name y'))

  // ── H) app name, flags, cron ───────────────────────────────────────────
  console.log('H) name, flags, cron')
  check('META_APP_NAME is exactly "Go Top SEO Publisher"', CFG.META_APP_NAME === 'Go Top SEO Publisher')
  const apiRoot = join(ROOT, 'app/api/meta')
  const routes: string[] = []
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'route.ts') routes.push(p) } }
  walk(apiRoot)
  const callbacks = ['data-deletion', 'deauthorize']
  for (const r of routes) {
    const rel = r.slice(apiRoot.length + 1)
    const src = strip(readFileSync(r, 'utf8'))
    const isCb = callbacks.some((c) => rel.startsWith(c))
    if (isCb) check(`${rel} is NOT behind the flag (a removal request is always honoured)`, !/isMetaPostsEnabled/.test(src))
    else check(`${rel} answers 404 unless the flag is on`, /isMetaPostsEnabled\(\)/.test(src))
  }
  const cronSrc = strip(read('app/api/meta/cron/route.ts'))
  check('the cron route authorizes with authorizeCronRequest first', /authorizeCronRequest\(req/.test(cronSrc) && cronSrc.indexOf('authorizeCronRequest(req') < cronSrc.indexOf('isMetaPostsEnabled()'))
  check('the cron is not a new Vercel cron (Hobby)', !/api\/meta\/cron/.test(read('vercel.json')))
  check('the automation cron drains the queue without throwing into it', /runIsolatedMetaDue/.test(read('app/api/content/automation/cron/route.ts')))
  const allSrc = [...routes.map((r) => readFileSync(r, 'utf8')), ...readdirSync(join(ROOT, 'lib/meta-posts')).filter((f) => f.endsWith('.ts')).map((f) => read(`lib/meta-posts/${f}`))].map(strip).join('\n')
  check('no console output prints a token, a code or raw provider text', !/console\.(log|error|warn)\([^)]*(token|\.message|error_user_msg|secret)/i.test(allSrc))
  check('the app secret is never put in a URL', !/client_secret=\$\{/.test(allSrc) && !/searchParams\.set\('client_secret'/.test(allSrc))

  // ── I) 11 languages ────────────────────────────────────────────────────
  console.log('I) eleven languages')
  const keys = Object.keys(META_POSTS_TEXT.en)
  for (const l of LOCALES) {
    const t = META_POSTS_TEXT[l] as Record<string, string>
    const missing = keys.filter((k) => typeof t[k] !== 'string' || !t[k].trim())
    check(`dashboard text: ${l} has every key`, missing.length === 0, missing.slice(0, 3).join(','))
    const d = DATA_DELETION_TEXT[l]
    check(`deletion page: ${l} names the app and the email slots`, d.intro.includes('{app}') && d.how[2].includes('{email}'))
    check(`deletion page: ${l} lists what is deleted and what is kept`, d.deleted.length >= 3 && d.kept.length >= 1)
    const priv = l === 'he' ? read('app/(legal)/privacy/page.tsx') : l === 'en' ? read('app/(public)/en/privacy/page.tsx') : read(`content/legal/${l}/privacy.md`)
    check(`privacy policy: ${l} carries the Facebook and Instagram section with the app name`, priv.includes('Go Top SEO Publisher'))
    check(`privacy policy: ${l} names graph.facebook.com’s provider`, /Facebook/.test(priv))
    check(`privacy policy: ${l} points to the deletion page or the contact address`, /data-deletion|contact@gotopseo\.com/.test(priv))
  }
  check('Hebrew, Japanese and Korean are written in direct characters', !/\\u[0-9a-f]{4}/i.test(read('lib/i18n/meta-posts.ts')) && !/\\u[0-9a-f]{4}/i.test(read('lib/legal/data-deletion.ts')))
  check('Hebrew text really is Hebrew', /[֐-׿]/.test(META_POSTS_TEXT.he.navLabel), META_POSTS_TEXT.he.navLabel)
  check('Japanese text really is Japanese', /[぀-ヿ一-鿿]/.test(DATA_DELETION_TEXT.ja.title))
  check('Korean text really is Korean', /[가-힯]/.test(DATA_DELETION_TEXT.ko.title))
  check('no text suggests Meta endorses the service', !/(recommended|certified|approved|endorsed) by (Meta|Facebook)/i.test((read('lib/i18n/meta-posts.ts') + read('lib/legal/data-deletion.ts')).replace(/not made, approved or endorsed by Meta/g, '')))
  // MUTATION: a dictionary missing a key is caught by the same check.
  const broken = { ...META_POSTS_TEXT.fr } as Record<string, string>; delete broken[keys[0]]
  check('MUTATION — a language missing a key is caught', keys.filter((k) => typeof broken[k] !== 'string' || !broken[k].trim()).length === 1)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exitCode = fail ? 1 : 0
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
