/**
 * "Continue with Google" through the site's own Google client
 * (lib/auth/google-direct.ts, app/api/auth/google/route.ts, the custom branch
 * of app/api/auth/callback/route.ts).
 *
 * WHY. supabase.auth.signInWithOAuth makes Google's consent screen say "to
 * continue to pmzicbtulloeynsosseh.supabase.co". The April custom flow
 * (247cdda) showed gotopseo.com but signed people in with a guessable password
 * and never checked `state`; ed96710 removed it. This flow is the secure one:
 * state + PKCE S256 + nonce, a signed single-use cookie, and Supabase's
 * signInWithIdToken. Every guard below has a mutation control.
 *
 * Run: npx tsx lib/auth/__qa__/google-direct.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { webcrypto } from 'crypto'
import {
  GOOGLE_FLOW_COOKIE, GOOGLE_TOKEN_URL, completeGoogleSignIn, googleAuthorizeUrl, googleDirectConfig, googleFlowCookieOptions,
  hashedNonce, matchGoogleState, newGoogleFlow, openGoogleFlow, pkceChallenge, sealGoogleFlow, type GoogleFlow,
} from '../google-direct'
import { googleDirectConfigured, googleSignInFailureUrl, googleStartPath } from '../google-signin'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const CONFIG = { clientId: 'client-123.apps.googleusercontent.com', clientSecret: 'qa-secret-value' }
const OTHER = { clientId: CONFIG.clientId, clientSecret: 'another-secret' }

/** Supabase's own documented recipe: SHA-256 of the nonce, hexadecimal (WebCrypto, independent of the module). */
async function supabaseDocNonceHash(nonce: string): Promise<string> {
  const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function s256(verifier: string): Promise<string> {
  const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return Buffer.from(buf).toString('base64url')
}

async function main() {
  console.log('\nA) configuration and the Supabase fallback')
  {
    const configured = (fn: typeof googleDirectConfig) => fn({ NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 's' }) !== null
      && fn({ NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: 'id' }) === null && fn({ GOOGLE_OAUTH_CLIENT_SECRET: 's' }) === null
      && fn({ NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: ' ', GOOGLE_OAUTH_CLIENT_SECRET: 's' }) === null && fn({}) === null
    check('A1: the custom flow runs only with BOTH the client id and the secret', configured(googleDirectConfig))
    check('MUTATION CONTROL: a config that ignores the secret is caught', !configured((env) => (env?.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ? CONFIG : null)))
    check('A2: the button sees the custom client only when its id is set', googleDirectConfigured('id') && !googleDirectConfigured(undefined) && !googleDirectConfigured(''))
    const button = strip(read('components/auth/GoogleSignInButton.tsx'))
    const fallback = (src: string) => /if \(googleDirectConfigured\(\)\) \{\s*window\.location\.assign\(googleStartPath\(nextPath, lang\)\)\s*return\s*\}/.test(src)
      && /signInWithOAuth\(\{\s*provider: 'google',\s*options: \{ redirectTo: googleRedirectTo\(window\.location\.origin, nextPath, lang\) \}/.test(src)
      && src.indexOf('if (!googleSignInVisible') < src.indexOf('googleDirectConfigured()')
    check('A3: the button goes to the start route when configured, and keeps signInWithOAuth otherwise, after the same visibility check', fallback(button))
    check('MUTATION CONTROL: a button that always takes the custom route is caught', !fallback(button.replace('if (googleDirectConfigured()) {', 'if (true) {')))
    check('MUTATION CONTROL: a button that dropped the Supabase flow is caught', !fallback(button.replace(/signInWithOAuth/g, 'signInWithIdToken')))
    check('A4: the start path is same-origin and carries a sanitized next',
      googleStartPath('//evil.example', 'he') === '/api/auth/google?next=%2Fdashboard&lang=he' && googleStartPath('/projects/7', 'en') === '/api/auth/google?next=%2Fprojects%2F7&lang=en')
  }

  console.log('\nB) the authorization request: PKCE S256, hashed nonce, nothing else in the URL')
  {
    const flow = newGoogleFlow('/projects/7?tab=a', 'en')
    const url = new URL(googleAuthorizeUrl(CONFIG, flow, 'https://www.gotopseo.com'))
    const p = url.searchParams
    check('B1: Google\'s authorization endpoint, code flow, openid email profile, select_account',
      url.origin + url.pathname === 'https://accounts.google.com/o/oauth2/v2/auth' && p.get('response_type') === 'code'
      && p.get('scope') === 'openid email profile' && p.get('prompt') === 'select_account' && p.get('client_id') === CONFIG.clientId)
    check('B2: redirect_uri is the request origin\'s registered callback', p.get('redirect_uri') === 'https://www.gotopseo.com/api/auth/callback')
    const pkceOk = async (challenge: (v: string) => string) => {
      const u = new URL(googleAuthorizeUrl(CONFIG, flow, 'https://x.example'))
      return u.searchParams.get('code_challenge_method') === 'S256' && challenge(flow.verifier) === await s256(flow.verifier)
        && u.searchParams.get('code_challenge') === await s256(flow.verifier) && !u.toString().includes(flow.verifier)
    }
    check('B3: PKCE S256 (BASE64URL(SHA-256(verifier))), the verifier never leaves the server', await pkceOk(pkceChallenge) && flow.verifier.length >= 43)
    check('MUTATION CONTROL: a "plain" challenge is caught', !(await pkceOk((v) => v)))
    const nonceOk = async (hash: (n: string) => string) => hash(flow.nonce) === await supabaseDocNonceHash(flow.nonce) && hash(flow.nonce) !== flow.nonce
    check('B4: Google gets SHA-256(nonce) in hex — Supabase\'s documented rule', await nonceOk(hashedNonce) && p.get('nonce') === await supabaseDocNonceHash(flow.nonce))
    check('MUTATION CONTROL: sending the raw nonce to Google is caught', !(await nonceOk((n) => n)))
    check('B5: the raw nonce, next and lang are not in Google\'s URL', !url.toString().includes(flow.nonce) && !p.has('next') && !p.has('lang') && !url.toString().includes('projects'))
    check('B6: state, verifier and nonce are fresh 256-bit values', [flow.state, flow.verifier, flow.nonce].every((v) => /^[A-Za-z0-9_-]{43}$/.test(v))
      && new Set([flow.state, newGoogleFlow(null, null).state]).size === 2)
  }

  console.log('\nC) the flow cookie: signed, short-lived, httpOnly, single-use, state compared in constant time')
  {
    const flow = newGoogleFlow('/dashboard', 'he')
    const sealed = sealGoogleFlow(CONFIG, flow)
    check('C1: a sealed flow opens back to itself', JSON.stringify(openGoogleFlow(CONFIG, sealed)) === JSON.stringify(flow))
    const [payload, sig] = sealed.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), state: 'A'.repeat(43) })).toString('base64url')
    check('C2: a forged payload, another key, an expired or a malformed cookie is refused',
      openGoogleFlow(CONFIG, `${forgedPayload}.${sig}`) === null && openGoogleFlow(OTHER, sealed) === null
      && openGoogleFlow(CONFIG, sealed, Date.now() + 11 * 60 * 1000) === null && openGoogleFlow(CONFIG, 'x') === null && openGoogleFlow(CONFIG, undefined) === null)
    const stateGuard = (match: typeof matchGoogleState) => match(CONFIG, sealed, flow.state)?.state === flow.state
      && match(CONFIG, sealed, 'B'.repeat(43)) === null && match(CONFIG, sealed, null) === null && match(CONFIG, sealed, '') === null
      && match(CONFIG, undefined, flow.state) === null && match(OTHER, sealed, flow.state) === null
    check('C3: state missing, mismatched, or without its cookie → refused; a match → the flow', stateGuard(matchGoogleState))
    check('MUTATION CONTROL: a matcher that ignores the state is caught', !stateGuard((c, v) => openGoogleFlow(c, v)))
    const lib = strip(read('lib/auth/google-direct.ts'))
    const constTime = (src: string) => /timingSafeEqual\(/.test(src) && /safeEqual\(flow\.state, state\)/.test(src) && !/flow\.state\s*===\s*state/.test(src)
    check('C4: the state and the cookie MAC are compared in constant time', constTime(lib) && /safeEqual\(value\.slice\(dot \+ 1\), mac\(config, payload\)\)/.test(lib))
    check('MUTATION CONTROL: a plain === state compare is caught', !constTime(lib.replace('safeEqual(flow.state, state)', 'flow.state === state')))
    const flags = (o: ReturnType<typeof googleFlowCookieOptions>) => o.httpOnly === true && o.secure === true && o.sameSite === 'lax' && o.path === '/api/auth' && o.maxAge === 600
    check('C5: cookie flags — httpOnly, Secure, SameSite=Lax, Path=/api/auth, 10 minutes', flags(googleFlowCookieOptions()))
    check('MUTATION CONTROL: a site-wide or script-readable cookie is caught', !flags({ ...googleFlowCookieOptions(), path: '/' } as any) && !flags({ ...googleFlowCookieOptions(), httpOnly: false } as any))
    check('C6: a cookie whose `next` is external opens as /dashboard', (() => {
      const evil: GoogleFlow = { ...flow, next: '//evil.example' }
      return openGoogleFlow(CONFIG, sealGoogleFlow(CONFIG, evil))?.next === '/dashboard' && newGoogleFlow('https://evil.example', 'he').next === '/dashboard'
    })())
  }

  console.log('\nD) the real start route')
  {
    const { NextRequest } = require('next/server')
    const { GET } = require(join(ROOT, 'app/api/auth/google/route.ts'))
    const saved = { id: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET }
    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID; delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const off = await GET(new NextRequest('https://www.gotopseo.com/api/auth/google?next=%2Fdashboard&lang=he'))
    check('D1: unconfigured → back to /login?error=google, no cookie', off.headers.get('location') === 'https://www.gotopseo.com/login?error=google&lang=he' && off.headers.getSetCookie().length === 0)
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = CONFIG.clientId; process.env.GOOGLE_OAUTH_CLIENT_SECRET = CONFIG.clientSecret
    const on = await GET(new NextRequest('https://www.gotopseo.com/api/auth/google?next=%2F%2Fevil.example&lang=en'))
    const loc = new URL(on.headers.get('location') ?? 'about:blank')
    const setCookie = on.headers.getSetCookie().join('\n')
    check('D2: configured → Google, with this origin\'s callback', loc.host === 'accounts.google.com' && loc.searchParams.get('redirect_uri') === 'https://www.gotopseo.com/api/auth/callback')
    check('D3: Set-Cookie carries HttpOnly; Secure; SameSite=lax; Path=/api/auth; Max-Age=600',
      setCookie.startsWith(`${GOOGLE_FLOW_COOKIE}=`) && /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=lax/i.test(setCookie) && /Path=\/api\/auth/.test(setCookie) && /Max-Age=600/.test(setCookie))
    const cookieValue = setCookie.slice(GOOGLE_FLOW_COOKIE.length + 1).split(';')[0]
    const opened = openGoogleFlow(CONFIG, decodeURIComponent(cookieValue))
    check('D4: the cookie holds the state Google got, an external next became /dashboard, and the language', opened?.state === loc.searchParams.get('state') && opened?.next === '/dashboard' && opened?.lang === 'en')
    check('D5: no-store', on.headers.get('cache-control') === 'no-store')
    const shop = await GET(new NextRequest('https://www.gotopseo.com/api/auth/google?next=%2Fshopify%2Fapp&lang=he'))
    check('D6: a Shopify destination never starts the flow', /\/login\?error=google/.test(shop.headers.get('location') ?? '') && shop.headers.getSetCookie().length === 0)

    console.log('\nE) the real callback: only a matching state takes the custom branch')
    const CB = require(join(ROOT, 'app/api/auth/callback/route.ts'))
    const cbReq = (qs: string, cookie?: string) => new NextRequest(`https://www.gotopseo.com/api/auth/callback?${qs}`, cookie ? { headers: { cookie: `${GOOGLE_FLOW_COOKIE}=${cookie}` } } : undefined)
    const errors: string[] = []
    const origErr = console.error
    console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')) }
    try {
      const sealed = decodeURIComponent(cookieValue)
      const mism = await CB.GET(cbReq(`state=${'C'.repeat(43)}&code=attacker-code`, sealed))
      check('E1: a mismatched state → /login?error=google, and the cookie is cleared', mism.headers.get('location') === 'https://www.gotopseo.com/login?error=google'
        && new RegExp(`${GOOGLE_FLOW_COOKIE}=;.*Max-Age=0`).test(mism.headers.getSetCookie().join('\n')), mism.headers.getSetCookie().join(' '))
      const forged = await CB.GET(cbReq(`state=${opened?.state}&code=x`, sealGoogleFlow(OTHER, opened as GoogleFlow)))
      check('E2: a cookie signed with another key → refused', /\/login\?error=google/.test(forged.headers.get('location') ?? ''))
      const denied = await CB.GET(cbReq(`state=${opened?.state}&error=access_denied`, sealed))
      check('E3: Google\'s access_denied → the generic line, in the cookie\'s language', denied.headers.get('location') === 'https://www.gotopseo.com/en/login?error=google')
      const noCookie = await CB.GET(cbReq('state=custom-google_abc&next=%2F%2Fevil.example&lang=he'))
      check('E4: a state without the cookie never takes the custom branch (the old path answers, as before)', noCookie.headers.get('location') === 'https://www.gotopseo.com/login?error=oauth&lang=he')
      const noState = await CB.GET(cbReq('next=%2Fdashboard&lang=en', sealed))
      check('E5: the cookie without a state (an email link in the same browser) keeps the old path', noState.headers.get('location') === 'https://www.gotopseo.com/en/login?error=oauth')
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
      const unset = await CB.GET(cbReq(`state=${opened?.state}&code=x`, sealed))
      check('E6: secret unset → refused, never half-run', /\/login\?error=google/.test(unset.headers.get('location') ?? ''))
      check('E7: the log names reason codes only (no state, cookie, code or secret)', errors.length >= 3 && errors.every((e) => /^\[google-signin\] refused: [a-z_:0-9]+$/.test(e))
        && !errors.some((e) => e.includes(sealed) || e.includes('attacker-code') || e.includes(CONFIG.clientSecret)), errors.join(' | '))
    } finally {
      console.error = origErr
      if (saved.id === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID; else process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = saved.id
      if (saved.secret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET; else process.env.GOOGLE_OAUTH_CLIENT_SECRET = saved.secret
    }
    const cb = strip(read('app/api/auth/callback/route.ts'))
    const gate = (src: string) => /const state = searchParams\.get\('state'\)\s*const flowCookie = request\.cookies\.get\(GOOGLE_FLOW_COOKIE\)\?\.value\s*if \(state && flowCookie\) return googleDirectCallback\(request, state, flowCookie\)/.test(src)
      && /if \(!flow\) return fail\('state_mismatch'\)/.test(src)
    check('E8: the callback source gates the branch on state AND cookie, and refuses a non-match', gate(cb))
    check('MUTATION CONTROL: a branch taken on any state (the April bug) is caught', !gate(cb.replace('if (state && flowCookie)', 'if (state)')))
    const samePath = (src: string) => /return signedIn\(supabase, result\.user, \{ cookieStore, next: flow\.next, lang: flow\.lang, origin \}\)/.test(src)
      && /if \(!error\) return signedIn\(supabase, data\?\.user \?\? null, \{ cookieStore, next, lang: searchParams\.get\('lang'\), origin \}\)/.test(src)
    check('E9: both doors end in the same signedIn() (default client, claim, language)', samePath(cb))
    check('MUTATION CONTROL: a Google branch that redirects straight to next is caught', !samePath(cb.replace('return signedIn(supabase, result.user,', 'return NextResponse.redirect(new URL(flow.next, origin)) || signedIn(supabase, result.user,')))
  }

  console.log('\nF) code → Google token endpoint → Supabase signInWithIdToken (stubbed fetch, fake Supabase)')
  {
    const flow = newGoogleFlow('/dashboard', 'he')
    const calls: { url: string; body: URLSearchParams }[] = []
    const googleOk: typeof fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: new URLSearchParams(String(init?.body)) })
      return new Response(JSON.stringify({ id_token: 'header.payload.sig', access_token: 'ya29.qa' }), { status: 200 })
    }) as any
    const signins: any[] = []
    const fakeSupabase = (result: any) => ({ auth: { signInWithIdToken: async (c: any) => { signins.push(c); return result } } }) as any
    const ok = await completeGoogleSignIn({ config: CONFIG, flow, code: 'auth-code', origin: 'https://www.gotopseo.com',
      supabase: fakeSupabase({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null }) }, googleOk)
    const b = calls[0]?.body
    check('F1: the exchange is a server-side POST with the secret, the verifier and the same redirect_uri',
      calls[0]?.url === GOOGLE_TOKEN_URL && b?.get('grant_type') === 'authorization_code' && b?.get('code') === 'auth-code' && b?.get('client_secret') === CONFIG.clientSecret
      && b?.get('code_verifier') === flow.verifier && b?.get('redirect_uri') === 'https://www.gotopseo.com/api/auth/callback')
    const nonceRule = (c: any) => c?.provider === 'google' && c?.token === 'header.payload.sig' && c?.nonce === flow.nonce && c?.nonce !== hashedNonce(flow.nonce)
    check('F2: Supabase gets the id_token and the RAW nonce (Google got its hash)', ok.ok && nonceRule(signins[0]) && signins[0].access_token === 'ya29.qa')
    check('MUTATION CONTROL: passing the hashed nonce to Supabase is caught', !nonceRule({ ...signins[0], nonce: hashedNonce(flow.nonce) }))
    const googleErr: typeof fetch = (async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request <raw provider text>' }), { status: 400 })) as any
    const bad = await completeGoogleSignIn({ config: CONFIG, flow, code: 'c', origin: 'https://x.example', supabase: fakeSupabase({}) }, googleErr)
    check('F3: a Google error is a reason code, never Google\'s text', !bad.ok && bad.reason === 'token:400:invalid_grant')
    const supaErr = await completeGoogleSignIn({ config: CONFIG, flow, code: 'c', origin: 'https://x.example',
      supabase: fakeSupabase({ data: { user: null, session: null }, error: { status: 400, code: 'bad_jwt', message: 'Unacceptable audience in id_token: [client-123]' } }) }, googleOk)
    check('F4: a Supabase error is a reason code, never its message', !supaErr.ok && supaErr.reason === 'supabase:400:bad_jwt')
    const noId: typeof fetch = (async () => new Response(JSON.stringify({ access_token: 'x' }), { status: 200 })) as any
    const missing = await completeGoogleSignIn({ config: CONFIG, flow, code: 'c', origin: 'https://x.example', supabase: fakeSupabase({}) }, noId)
    check('F5: no id_token → refused before Supabase is called', !missing.ok && missing.reason === 'token:no_id_token')
  }

  console.log('\nG) no password, no admin API, no raw errors shown')
  {
    const files = ['lib/auth/google-direct.ts', 'app/api/auth/google/route.ts', 'components/auth/GoogleSignInButton.tsx', 'lib/auth/google-signin.ts']
    const banned = /password|admin\.createUser|auth\.admin|createAdminClient|updateUser|google_\$\{|`google_|'google_/i
    const clean = (src: string) => !banned.test(src)
    check('G1: the Google flow files name no password, no admin API, no service role, no google_ password', files.every((f) => clean(strip(read(f)))), files.filter((f) => !clean(strip(read(f)))).join(', '))
    check('MUTATION CONTROL: the April password bridge is caught', !clean("await supabase.auth.signInWithPassword({ email, password: `google_${id}` })"))
    const cb = strip(read('app/api/auth/callback/route.ts'))
    const branch = cb.slice(cb.indexOf('async function googleDirectCallback'))
    const cbClean = (src: string) => !/signInWithPassword|password:|auth\.admin|admin\.createUser|createUser\(|updateUser|google_\$\{|createAdminClient/.test(src) && /completeGoogleSignIn\(/.test(src)
    check('G2: the callback\'s Google branch has none of them either (the default client keeps its existing helper)', branch.length > 100 && cbClean(branch))
    check('MUTATION CONTROL: a branch that creates the user with the admin API is caught', !cbClean(branch + '\nawait createAdminClient().auth.admin.createUser({ email })'))
    check('G3: a failure lands on the sign-in form with only error=google, per language',
      googleSignInFailureUrl('https://a.example', 'he') === 'https://a.example/login?error=google&lang=he' && googleSignInFailureUrl('https://a.example', 'en') === 'https://a.example/en/login?error=google'
      && googleSignInFailureUrl('https://a.example', null) === 'https://a.example/login?error=google')
    const login = strip(read('app/(auth)/login/page.tsx'))
    const shown = (src: string) => /errorParam === 'google' \? googleSignInCopy\(lang\)\.returnFailed : errorParam \? t\.err\.linkInvalid : ''/.test(src)
    check('G4: the login form shows one fixed localized line for error=google (never a param\'s text)', shown(login))
    check('MUTATION CONTROL: echoing the error param is caught', !shown(login.replace("errorParam === 'google' ? googleSignInCopy(lang).returnFailed", "errorParam === 'google' ? errorParam")))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
export {}
