/**
 * Shopify embedded linking — FIRST-PARTY HANDOFF QA.
 *
 * Production regression this covers, end to end:
 *
 *   GET  /api/shopify/app-home        → 200
 *   POST /api/shopify/embedded-install → 200
 *   GET  /shopify/link                → 200 "Linking session expired"
 *
 * The install worked; the browser just never had the cookie. /api/shopify/
 * embedded-install is called by fetch() from inside the Shopify Admin iframe,
 * which is a THIRD-PARTY context for gotopseo.com, and it tried to establish
 * `shopify_pending_link` (SameSite=Lax) on that response — modern Chrome
 * rejects exactly that. A second, quieter fault made the same page possible
 * even when the cookie WAS accepted: createPendingInstall discarded both
 * Supabase results, so a rejected delete or insert still returned a token and
 * the route still answered 200 for a row that was never written.
 *
 * The fix moves the cookie to a first-party top-level POST
 * (/api/shopify/link/resume) and makes persistence fail closed. What is proven
 * here: the behaviour of the resume route and of createPendingInstall against a
 * fake Supabase (real signature verification, real expiry/consumption
 * semantics, real error injection), plus source contracts for the two halves
 * that only a browser can execute — the embedded response's cookie behaviour
 * and the client's form submission.
 *
 * SCOPE NOTE, stated explicitly: the source-contract sections below assert what
 * the code does, NOT what a browser does with it. They do not prove Chrome's
 * cookie behaviour in an iframe; that is the documented reason for the design,
 * verified in production, not something this file can execute.
 *
 * Run: npx tsx lib/shopify/__qa__/first-party-link-handoff.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  createPendingInstall, PendingInstallPersistenceError,
  signPendingLinkCookieValue, verifyPendingLinkCookieValue,
  loadValidPendingInstall, consumePendingInstall,
  PENDING_LINK_COOKIE, PENDING_LINK_TTL_MS, PENDING_LINK_RESUME_PATH,
} from '../pending-link'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const APP_URL = 'https://www.example-test.com'
const SECRET = 'test-public-client-secret'
process.env.SHOPIFY_APP_URL = APP_URL
process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'test-public-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = SECRET
process.env.SHOPIFY_CLIENT_ID = 'test-legacy-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-legacy-client-secret'
process.env.ENABLE_CONTENT = 'true'
// Synthetic Supabase credentials: the resume route calls the REAL
// createAdminClient(), so a real supabase-js client is constructed and its
// PostgREST request is served by the stub below. Nothing here reaches a
// network — `restStub` throws on any URL that is not the one query this route
// is allowed to make, which is itself part of what is being asserted.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa-stub.supabase.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-service-role-key'

const SHOP = 'first-party-test.myshopify.com'
const pendingFields = () => ({
  shop_domain: SHOP,
  shop_gid: 'gid://shopify/Shop/1',
  access_token_encrypted: 'ciphertext',
  install_origin: 'shopify_app_store' as const,
  refresh_token_encrypted: 'refresh-ciphertext',
  access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  refresh_token_expires_at: null,
  oauth_app_edition: 'public' as const,
  api_version: '2026-07',
  granted_scopes: ['read_products', 'write_content'],
  storefront_domain: null,
})

/**
 * The pending_installs table the route's REAL Supabase client will see. The
 * FakeAdmin below writes into this very array, so rows created through
 * createPendingInstall are exactly the rows the route reads back.
 */
const rows: Record<string, unknown>[] = []
const fakeAdmin = new FakeAdmin({ shopify_pending_installs: rows })
/** Every PostgREST URL the route caused, so the query itself can be asserted. */
const restCalls: string[] = []

/**
 * A minimal PostgREST emulator for the ONE query this route may issue:
 * shopify_pending_installs filtered by token, unconsumed, as a single object.
 * Any other request is a failure, not a silent pass.
 */
function installRestStub(): () => void {
  const real = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    const u = new URL(raw)
    if (!u.pathname.startsWith('/rest/v1/shopify_pending_installs')) throw new Error(`unexpected request: ${raw}`)
    restCalls.push(`${u.pathname}${u.search}`)
    const tokenParam = u.searchParams.get('token') ?? ''
    const token = tokenParam.startsWith('eq.') ? tokenParam.slice(3) : null
    let matched = rows.filter((r) => r.token === token)
    if (u.searchParams.get('consumed_at') === 'is.null') matched = matched.filter((r) => r.consumed_at == null)
    if (matched.length === 0) {
      return new Response(
        JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }),
        { status: 406, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify(matched[0]), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return () => { globalThis.fetch = real }
}

/** A urlencoded POST to the resume route, exactly as the client's form sends it. */
function resumeRequest(fields: Record<string, string>, init: { contentType?: string | null; rawBody?: string } = {}) {
  const headers: Record<string, string> = {}
  const ct = 'contentType' in init ? init.contentType : 'application/x-www-form-urlencoded'
  if (ct) headers['content-type'] = ct
  return new Request(`${APP_URL}${PENDING_LINK_RESUME_PATH}`, {
    method: 'POST',
    headers,
    body: init.rawBody ?? new URLSearchParams(fields).toString(),
  })
}

/** The Set-Cookie value the response would send for the pending-link cookie, or null. */
function pendingCookieHeader(res: Response): string | null {
  const all = typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [res.headers.get('set-cookie') ?? '']
  return all.find((c) => c && c.startsWith(`${PENDING_LINK_COOKIE}=`)) ?? null
}

async function main() {
  console.log('Shopify embedded linking — first-party handoff\n')

  const { POST: resumePOST } = await import('../../../app/api/shopify/link/resume/route')
  const installRoute = strip(read('app/api/shopify/embedded-install/route.ts'))
  const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
  const resumeSrc = strip(read('app/api/shopify/link/resume/route.ts'))
  const pendingLib = strip(read('lib/shopify/pending-link.ts'))
  const restoreFetch = installRestStub()

  // ────────────────────────────────────────────────────────────────────────
  console.log('1) The embedded-install response no longer depends on a cookie the iframe may reject')
  {
    check('1a: it sets NO cookie at all on that response',
      !/res\.cookies\.set/.test(installRoute) && !/PENDING_LINK_COOKIE/.test(installRoute))
    check('1b: PENDING_LINK_COOKIE / PENDING_LINK_TTL_MS are no longer even imported there',
      !/PENDING_LINK_COOKIE/.test(installRoute) && !/PENDING_LINK_TTL_MS/.test(installRoute))
    check('1c: the success response carries the FIXED server-chosen resume path',
      /resumePath: PENDING_LINK_RESUME_PATH/.test(installRoute))
    check('1d: and the signed opaque handoff, produced by the existing signer',
      /handoff: signPendingLinkCookieValue\(pendingToken, config\.clientSecret\)/.test(installRoute))
    check('1e: REGRESSION CONTRACT — no source line expects this fetch response to establish the cookie',
      !new RegExp(`${PENDING_LINK_COOKIE}`).test(installRoute) && !/sameSite/.test(installRoute))
    check('1f: the resume path constant is exactly the first-party endpoint',
      PENDING_LINK_RESUME_PATH === '/api/shopify/link/resume')
    check('1g: SCOPE — this section asserts source behaviour only; it does not execute a browser',
      true)
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n2) The handoff never travels in a GET URL, a query string, a fragment or browser storage')
  {
    check('2a: embedded-install never puts the handoff on a redirect or URL',
      !/redirect\(/.test(installRoute) && !/handoff=/.test(installRoute))
    check('2b: the resume route is POST-only — there is no GET handler to leak it into a URL',
      /export async function POST\(/.test(resumeSrc) && !/export async function GET\(/.test(resumeSrc))
    check('2c: the resume route reads it from the BODY, never from searchParams',
      /new URLSearchParams\(body\)\.get\('handoff'\)/.test(resumeSrc) && !/searchParams/.test(resumeSrc))
    check('2d: the client never places it in a URL, query or fragment',
      !/handoff=/.test(client) && !/location\.href[^\n]*handoff/.test(client))
    check('2e: the client never persists it in localStorage or sessionStorage',
      !/localStorage|sessionStorage|document\.cookie/.test(client))
    check('2f: the redirect target is built from a fixed path constant, not from input',
      /const LINK_PAGE_PATH = '\/shopify\/link'/.test(resumeSrc)
      && /new URL\(LINK_PAGE_PATH, `\$\{config\.appUrl\}\/`\)/.test(resumeSrc))
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n3) The embedded client submits it as a top-level form POST')
  {
    check('3a: it no longer uses window.top.location.href for the handoff',
      !/navigateTopLevel\([^)]*handoff/.test(client) && !/navigateTopLevel\(`\$\{data\?\.appUrl \?\? ''\}\$\{json\.next\}`\)/.test(client))
    check('3b: it builds a form with method POST', /form\.method = 'POST'/.test(client))
    check('3c: the form breaks out of the iframe with target _top', /form\.target = '_top'/.test(client))
    check('3d: the action is the app origin + the server-provided fixed resume path',
      /form\.action = `\$\{appUrl\}\$\{resumePath\}`/.test(client))
    check('3e: the single hidden field is named exactly "handoff"',
      /field\.type = 'hidden'/.test(client) && /field\.name = 'handoff'/.test(client))
    check('3f: the form is appended, submitted and removed',
      /document\.body\.appendChild\(form\)/.test(client) && /form\.submit\(\)/.test(client) && /form\.remove\(\)/.test(client))
    check('3g: it validates resumePath is EXACTLY /api/shopify/link/resume before submitting',
      /const LINK_RESUME_PATH = '\/api\/shopify\/link\/resume'/.test(client)
      && /json\.resumePath === LINK_RESUME_PATH && json\.handoff/.test(client))
    check('3h: and it posts its OWN constant, so a tampered path can never be used as the action',
      /submitLinkHandoffTopLevel\(data\?\.appUrl \?\? '', LINK_RESUME_PATH, json\.handoff\)/.test(client))
    check('3i: the existing alreadyConnected behaviour is unchanged',
      /if \(json\.alreadyConnected\) \{ setInstallBusy\(false\); retry\(\); return \}/.test(client)
      && /alreadyConnected: true, next: null/.test(installRoute))
    check('3j: top-level navigation is PRESERVED for billing and dashboard destinations',
      /function navigateTopLevel\(url: string\)/.test(client)
      && /if \(json\.redirectUrl\) navigateTopLevel\(json\.redirectUrl\)/.test(client)
      && /navigateTopLevel\(data\.dashboardUrl!\)/.test(client))
    check('3k: SCOPE — a source contract on the form; it does not prove a browser accepts the cookie',
      true)
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n4) Resume — a VALID handoff sets the first-party cookie and 303s to /shopify/link')
  {
    const token = await createPendingInstall(fakeAdmin as never, pendingFields())
    const handoff = signPendingLinkCookieValue(token, SECRET)
    const res = await resumePOST(resumeRequest({ handoff }))

    check('4a: it returns 303 (a POST result must not be re-POSTed on follow)', res.status === 303)
    check('4b: to the fixed internal link page, with nothing appended',
      res.headers.get('location') === `${APP_URL}/shopify/link`)
    const cookie = pendingCookieHeader(res)
    check('4c: it sets the pending-link cookie', cookie !== null)
    check('4d: to the ALREADY-VERIFIED signed handoff value',
      !!cookie && cookie.startsWith(`${PENDING_LINK_COOKIE}=${encodeURIComponent(handoff)}`))
    check('4e: httpOnly — script in any context can never read it', !!cookie && /HttpOnly/i.test(cookie))
    check('4f: SameSite=Lax — NOT weakened to None', !!cookie && /SameSite=Lax/i.test(cookie) && !/SameSite=None/i.test(cookie!))
    check('4g: Path=/ so /shopify/link and /api/shopify/link/complete both see it', !!cookie && /Path=\//.test(cookie))
    check('4h: Max-Age equals PENDING_LINK_TTL_MS, so cookie and row expire together',
      !!cookie && new RegExp(`Max-Age=${PENDING_LINK_TTL_MS / 1000}\\b`, 'i').test(cookie))
    check('4i: the cookie it wrote verifies back to the same pending token',
      verifyPendingLinkCookieValue(handoff, SECRET) === token)
    check('4j: and that token still loads the pending row (resume consumes nothing)',
      (await loadValidPendingInstall(fakeAdmin as never, token))?.shop_domain === SHOP)
    check('4k: the row was looked up by token AND unconsumed — the DB, not the signature, is the authority',
      restCalls.some((c) => c.includes(`token=eq.${token}`) && c.includes('consumed_at=is.null')))
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n5) Resume — every invalid handoff is refused WITHOUT setting a cookie')
  {
    const liveToken = await createPendingInstall(fakeAdmin as never, pendingFields())
    const live = signPendingLinkCookieValue(liveToken, SECRET)

    const cases: { name: string; req: Request }[] = []

    // missing
    cases.push({ name: '5a: MISSING — no handoff field at all', req: resumeRequest({}) })
    cases.push({ name: '5b: EMPTY — the field is present but blank', req: resumeRequest({ handoff: '' }) })
    // malformed
    cases.push({ name: '5c: MALFORMED — no signature separator', req: resumeRequest({ handoff: liveToken }) })
    cases.push({ name: '5d: MALFORMED — junk', req: resumeRequest({ handoff: 'not-a-handoff' }) })
    // tampered
    cases.push({ name: '5e: TAMPERED — right token, forged signature', req: resumeRequest({ handoff: `${liveToken}.${'0'.repeat(64)}` }) })
    cases.push({
      name: '5f: TAMPERED — valid signature from a DIFFERENT secret',
      req: resumeRequest({ handoff: signPendingLinkCookieValue(liveToken, 'some-other-secret') }),
    })
    // over-length
    cases.push({ name: '5g: OVERSIZED — handoff beyond the input cap', req: resumeRequest({ handoff: `${liveToken}.${'a'.repeat(4000)}` }) })
    cases.push({ name: '5h: OVERSIZED — body beyond the input cap', req: resumeRequest({}, { rawBody: `handoff=${'b'.repeat(9000)}` }) })
    // wrong content type
    cases.push({ name: '5i: WRONG CONTENT TYPE — a JSON body is not accepted', req: resumeRequest({}, { contentType: 'application/json', rawBody: JSON.stringify({ handoff: live }) }) })
    cases.push({ name: '5j: NO CONTENT TYPE at all', req: resumeRequest({}, { contentType: null, rawBody: `handoff=${live}` }) })

    for (const c of cases) {
      const res = await resumePOST(c.req)
      check(`${c.name} → 303 to /shopify/link, no cookie`,
        res.status === 303 && res.headers.get('location') === `${APP_URL}/shopify/link` && pendingCookieHeader(res) === null)
    }

    // nonexistent row — perfectly signed for a token that was never stored
    {
      const orphan = signPendingLinkCookieValue('f'.repeat(64), SECRET)
      const res = await resumePOST(resumeRequest({ handoff: orphan }))
      check('5k: NONEXISTENT — a validly signed token with no row is refused, no cookie',
        res.status === 303 && pendingCookieHeader(res) === null)
    }

    // consumed
    {
      const t = await createPendingInstall(fakeAdmin as never, pendingFields())
      const h = signPendingLinkCookieValue(t, SECRET)
      check('5l: pre-condition — it is valid before consumption', pendingCookieHeader(await resumePOST(resumeRequest({ handoff: h }))) !== null)
      await consumePendingInstall(fakeAdmin as never, t)
      const res = await resumePOST(resumeRequest({ handoff: h }))
      check('5m: CONSUMED — a completed link cannot be resumed again, no cookie',
        res.status === 303 && pendingCookieHeader(res) === null)
    }

    // expired
    {
      const t = await createPendingInstall(fakeAdmin as never, pendingFields())
      const row = rows.find((r) => r.token === t)!
      row.expires_at = new Date(Date.now() - 1000).toISOString()
      const res = await resumePOST(resumeRequest({ handoff: signPendingLinkCookieValue(t, SECRET) }))
      check('5n: EXPIRED — past its 30-minute TTL, no cookie',
        res.status === 303 && pendingCookieHeader(res) === null)
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n6) Resume — no open redirect, and repeated/concurrent use creates no second linking session')
  {
    const t = await createPendingInstall(fakeAdmin as never, pendingFields())
    const h = signPendingLinkCookieValue(t, SECRET)

    for (const attempt of [
      { name: 'a next= parameter on the URL', url: `${APP_URL}${PENDING_LINK_RESUME_PATH}?next=https://evil.example.com` },
      { name: 'a redirect_uri parameter', url: `${APP_URL}${PENDING_LINK_RESUME_PATH}?redirect_uri=https://evil.example.com` },
      { name: 'an absolute return path', url: `${APP_URL}${PENDING_LINK_RESUME_PATH}?return=//evil.example.com` },
    ]) {
      const res = await resumePOST(new Request(attempt.url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ handoff: h, next: 'https://evil.example.com', redirect_uri: 'https://evil.example.com' }).toString(),
      }))
      check(`6: NO OPEN REDIRECT — ${attempt.name} is ignored`,
        res.headers.get('location') === `${APP_URL}/shopify/link`)
    }

    // Two resumes of the same handoff (the merchant double-submits, or two
    // tabs race): both land on the same single-use row. Consumption is atomic
    // and happens at /api/shopify/link/complete, so only one can ever complete.
    const [r1, r2] = await Promise.all([
      resumePOST(resumeRequest({ handoff: h })),
      resumePOST(resumeRequest({ handoff: h })),
    ])
    check('6d: two concurrent resumes both succeed but reference the SAME row',
      pendingCookieHeader(r1) !== null && pendingCookieHeader(r2) !== null
      && verifyPendingLinkCookieValue(h, SECRET) === t)
    const [c1, c2] = await Promise.all([
      consumePendingInstall(fakeAdmin as never, t),
      consumePendingInstall(fakeAdmin as never, t),
    ])
    check('6e: and exactly ONE of them can consume it — never two linking sessions',
      [c1, c2].filter(Boolean).length === 1)
    check('6f: the pending row stays random, single-use and 30-minute TTL',
      /crypto\.randomBytes\(32\)\.toString\('hex'\)/.test(pendingLib)
      && PENDING_LINK_TTL_MS === 30 * 60_000
      && /\.is\('consumed_at', null\)/.test(pendingLib))
  }

  restoreFetch()

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n7) createPendingInstall FAILS CLOSED on a pending-install database error')
  {
    // DELETE rejected
    {
      const admin = new FakeAdmin({ shopify_pending_installs: [] }, { shopify_pending_installs: { delete: () => ({ code: '42501', message: 'permission denied' }) } })
      let err: unknown = null
      try { await createPendingInstall(admin as never, pendingFields()) } catch (e) { err = e }
      check('7a: a rejected DELETE throws PendingInstallPersistenceError', err instanceof PendingInstallPersistenceError)
      check('7b: it names the step, not the database message', (err as PendingInstallPersistenceError).op === 'delete')
      check('7c: and NO row was written', (admin as unknown as { tables: Record<string, unknown[]> }).tables.shopify_pending_installs.length === 0)
    }
    // INSERT rejected
    {
      const admin = new FakeAdmin({ shopify_pending_installs: [] }, { shopify_pending_installs: { insert: () => ({ code: '23505' }) } })
      let err: unknown = null
      try { await createPendingInstall(admin as never, pendingFields()) } catch (e) { err = e }
      check('7d: a rejected INSERT throws PendingInstallPersistenceError', err instanceof PendingInstallPersistenceError)
      check('7e: it names the step', (err as PendingInstallPersistenceError).op === 'insert')
      check('7f: and NO row exists to hand a token out for', (admin as unknown as { tables: Record<string, unknown[]> }).tables.shopify_pending_installs.length === 0)
    }
    check('7g: the error message is a stable, non-sensitive code',
      new PendingInstallPersistenceError('insert').message === 'pending_install_persistence_failed')
    check('7h: the Supabase error OBJECT is never captured — only the fact of failure',
      /const \{ error: deleteError \}/.test(pendingLib) && /const \{ error: insertError \}/.test(pendingLib)
      && !/deleteError\.message|insertError\.message|JSON\.stringify\(.*Error/.test(pendingLib))
    check('7i: PRESERVED — replacement semantics and the existing TTL',
      /\.delete\(\)\.eq\('shop_domain', fields\.shop_domain\)/.test(pendingLib)
      && /expires_at: new Date\(Date\.now\(\) \+ PENDING_LINK_TTL_MS\)\.toISOString\(\)/.test(pendingLib))
    check('7j: the happy path still returns the token', typeof await createPendingInstall(new FakeAdmin({ shopify_pending_installs: [] }) as never, pendingFields()) === 'string')
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n8) A persistence failure returns non-2xx and NO handoff')
  {
    check('8a: the route catches PendingInstallPersistenceError explicitly',
      /catch \(err\) \{[\s\S]{0,400}err instanceof PendingInstallPersistenceError/.test(installRoute))
    check('8b: it answers with the stable non-sensitive code',
      /'pending_install_persistence_failed'/.test(installRoute))
    const { EMBEDDED_INSTALL_ERROR_STATUS } = await import('../../../app/api/shopify/embedded-install/route')
    const status = (EMBEDDED_INSTALL_ERROR_STATUS as Record<string, number>).pending_install_persistence_failed
    check('8c: with a NON-2xx status', typeof status === 'number' && (status < 200 || status >= 300))
    check('8d: 503 — the write can be retried, it is not the merchant’s fault', status === 503)
    const persistIdx = installRoute.indexOf("'pending_install_persistence_failed'")
    const handoffIdx = installRoute.indexOf('handoff: signPendingLinkCookieValue')
    check('8e: the failure returns BEFORE any handoff is produced',
      persistIdx !== -1 && handoffIdx !== -1 && persistIdx < handoffIdx)
    check('8f: no cookie is set on that path either — the route sets none at all',
      !/cookies\.set/.test(installRoute))
    const persistCatch = installRoute.slice(persistIdx - 600, persistIdx + 400)
    check('8g: only our own step name reaches the log, never a database error object',
      /op: err\.op/.test(persistCatch)
      && !/err\.message|deleteError|insertError|supabaseError/.test(persistCatch))
    check('8h: an unexpected error is re-thrown, never swallowed into a 200',
      /throw err/.test(installRoute))
    check('8i: the OAuth callback caller fails closed on the same error',
      /err instanceof PendingInstallPersistenceError\) return fail\('pending_install_persistence_failed'\)/
        .test(strip(read('app/api/shopify/oauth/callback/route.ts'))))
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n9) Nothing sensitive is logged, returned or stored anywhere on this path')
  {
    const logCalls = [...resumeSrc.matchAll(/console\.\w+\([^\n]*/g)].map((m) => m[0])
    check('9a: the resume route logs NOTHING at all', logCalls.length === 0)
    check('9b: it never echoes the handoff, the token or the cookie into a response body',
      !/NextResponse\.json\([^\n]*handoff/.test(resumeSrc) && !/json\(\{ *token/.test(resumeSrc))
    const installLogs = [...installRoute.matchAll(/console\.\w+\([^\n]*/g)].map((m) => m[0])
    check('9c: no embedded-install log line mentions the handoff, a token or a secret',
      installLogs.every((l) => !/handoff|pendingToken|clientSecret|sessionToken|accessToken|Bearer|cookie/i.test(l)))
    check('9d: no Shopify access token, refresh token, session token or Partner credential is touched here',
      !/accessToken|access_token|refresh_token|sessionToken|Bearer|Partner/i.test(resumeSrc))
    check('9d2: the client secret is used ONLY as the HMAC verification key — never logged or returned',
      (resumeSrc.match(/clientSecret/g) || []).length === 1
      && /verifyPendingLinkCookieValue\(handoff, config\.clientSecret\)/.test(resumeSrc))
    check('9e: the client never logs the handoff', !/console\.\w+\([^\n]*handoff/.test(client))
    check('9f: the handoff is not a credential — it carries only a pending-row reference',
      /signPendingLinkCookieValue\(token: string, secret: string\)/.test(pendingLib)
      && /createHmac\('sha256', secret\)\.update\(token\)/.test(pendingLib))
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n10) PRESERVED — the guards this change must not weaken')
  {
    check('10a: embedded-install still requires a verified App Bridge session token',
      /const verified = verifyShopifySessionToken\(token\)/.test(installRoute)
      && /if \(!verified\.ok\) return fail\(401, 'invalid_session_token'\)/.test(installRoute))
    check('10b: the shop is still the VERIFIED one, never a query or body value',
      /const shopDomain = verified\.shopDomain/.test(installRoute)
      && !/searchParams/.test(installRoute) && !/request\.json\(\)/.test(installRoute))
    check('10c: credential verification and shop identity still gate persistence',
      installRoute.indexOf("return fail(502, 'token_verification_failed'") < installRoute.indexOf('createPendingInstall(admin, {')
      && installRoute.indexOf("'shop_identity_unverified'") < installRoute.indexOf('createPendingInstall(admin, {'))
    check('10d: HMAC canonicalization is still untouched (cbd889f remains unmerged)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(strip(read('lib/shopify/oauth.ts'))))
    check('10e: /shopify/link still identifies the pending install ONLY by the signed cookie',
      /PENDING_LINK_COOKIE/.test(strip(read('app/shopify/link/page.tsx')))
      && !/searchParams/.test(strip(read('app/shopify/link/page.tsx'))))
    check('10f: resume CONSUMES NOTHING — completion is still the only consumer',
      !/consumePendingInstall|consumed_at:/.test(resumeSrc)
      && /pendingToken: token/.test(strip(read('app/api/shopify/link/complete/route.ts'))))
    check('10f2: and that consume is still the atomic conditional UPDATE inside the link RPC',
      /SET consumed_at = v_now\s*\n\s*WHERE p\.token = p_pending_token\s*\n\s*AND p\.consumed_at IS NULL/
        .test(read('supabase/migrations/20260901020000_shopify_atomic_billing_transitions.sql')))
    check('10g: the resume route is gated by the content-module flag like every sibling',
      /if \(!isContentModuleEnabled\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/.test(resumeSrc))
    check('10h: the OAuth callback path (a top-level redirect, already first-party) still sets the cookie itself',
      /res\.cookies\.set\(PENDING_LINK_COOKIE/.test(strip(read('app/api/shopify/oauth/callback/route.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
