/**
 * The free check's claim token, from /signup?claim= to an httpOnly cookie.
 *
 *   - the cookie: first-party, httpOnly, SameSite=Lax, path /, 24 hours;
 *     Secure over HTTPS; cleared with the same attributes;
 *   - the server action keeps only a value shaped exactly like a token the free
 *     check issues, answers nothing, logs nothing, and with the seeding scan off
 *     sets no cookie at all;
 *   - the sign-up page is the only place that reads ?claim=, hands it to the
 *     action and to nothing else, takes it out of the address, and never
 *     renders it; where sign-up leads afterwards is unchanged.
 *
 * The action runs for real with next/headers substituted; the page is rendered
 * for real (no effects) with next/navigation substituted.
 *
 * Run: npx tsx lib/onboarding/__qa__/signup-claim.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { randomBytes } from 'crypto'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { captureConsole, makeChecker } from '@/lib/seed-scan/__qa__/_fixtures'
import {
  claimCookieFromHeader,
  claimCookieOptions,
  clearedClaimCookie,
  readClaimToken,
  requestIsHttps,
  SEED_CLAIM_COOKIE,
  SEED_CLAIM_MAX_AGE_SECONDS,
} from '../claim-cookie'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const TOKEN = randomBytes(32).toString('hex')

// ── The substitutions: next/headers for the action, next/navigation for the page ──
type SetCall = { name: string; value: string; options: Record<string, unknown> }
const cookieSets: SetCall[] = []
let requestHeaders = new Headers({ 'x-forwarded-proto': 'https' })
let search = new URLSearchParams()
const Mod: any = require('module')
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'next/headers') {
    return {
      cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => cookieSets.push({ name, value, options }) }),
      headers: async () => requestHeaders,
    }
  }
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/signup'
      : k === 'useSearchParams' ? () => search
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

async function main() {
  console.log('\n1) The cookie')
  const secure = claimCookieOptions(true)
  check('first-party, httpOnly, SameSite=Lax, the whole site, 24 hours, Secure over HTTPS',
    JSON.stringify(secure) === JSON.stringify({ httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 86400 }) && SEED_CLAIM_MAX_AGE_SECONDS === 24 * 3600)
  check('…not Secure over plain HTTP (a local server), everything else the same', claimCookieOptions(false).secure === false && claimCookieOptions(false).httpOnly === true)
  check('cleared with the attributes it was set with', clearedClaimCookie(true) === `${SEED_CLAIM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
    && clearedClaimCookie(false) === `${SEED_CLAIM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
  check('only a token shaped exactly like the free check\'s is read: 64 lowercase hex',
    readClaimToken(TOKEN) === TOKEN && readClaimToken(TOKEN.toUpperCase()) === null && readClaimToken(TOKEN.slice(1)) === null
    && readClaimToken(`${TOKEN} `) === null && readClaimToken(`${TOKEN};Path=/`) === null && readClaimToken(123) === null && readClaimToken(undefined) === null)
  check('the cookie is found among others; a malformed one is "present, no token"',
    JSON.stringify(claimCookieFromHeader(`a=1; ${SEED_CLAIM_COOKIE}=${TOKEN}; b=2`)) === JSON.stringify({ present: true, token: TOKEN })
    && JSON.stringify(claimCookieFromHeader(`${SEED_CLAIM_COOKIE}=nope`)) === JSON.stringify({ present: true, token: null })
    && JSON.stringify(claimCookieFromHeader(`${SEED_CLAIM_COOKIE}=%E0%A4%A`)) === JSON.stringify({ present: true, token: null })
    && JSON.stringify(claimCookieFromHeader('a=1')) === JSON.stringify({ present: false, token: null })
    && JSON.stringify(claimCookieFromHeader(null)) === JSON.stringify({ present: false, token: null }))
  check('a cookie whose NAME merely contains ours is not ours', claimCookieFromHeader(`x${SEED_CLAIM_COOKIE}=${TOKEN}`).present === false)
  check('HTTPS is read from the forwarded scheme first, then the Origin, then the URL',
    requestIsHttps(new Headers({ 'x-forwarded-proto': 'https' }), 'http://x') && !requestIsHttps(new Headers({ 'x-forwarded-proto': 'http' }), 'https://x')
    && requestIsHttps(new Headers({ origin: 'https://app.example' })) && requestIsHttps(new Headers(), 'https://app.example/x') && !requestIsHttps(new Headers(), 'http://localhost:3000/'))

  console.log('\n2) The server action')
  const { keepSeedClaim } = require(join(ROOT, 'app/(auth)/signup/claim-action.ts'))
  const withFlag = async (flag: string | undefined, work: () => Promise<unknown>) => {
    const before = process.env.ENABLE_SEED_SCAN
    if (flag === undefined) delete process.env.ENABLE_SEED_SCAN
    else process.env.ENABLE_SEED_SCAN = flag
    try {
      return await work()
    } finally {
      if (before === undefined) delete process.env.ENABLE_SEED_SCAN
      else process.env.ENABLE_SEED_SCAN = before
    }
  }
  {
    cookieSets.length = 0
    requestHeaders = new Headers({ 'x-forwarded-proto': 'https' })
    const { value, output } = await captureConsole(() => withFlag('true', () => keepSeedClaim(TOKEN)))
    check('scan on, a well-formed token → kept in one cookie, with the cookie\'s attributes',
      cookieSets.length === 1 && cookieSets[0].name === SEED_CLAIM_COOKIE && cookieSets[0].value === TOKEN
      && JSON.stringify(cookieSets[0].options) === JSON.stringify(claimCookieOptions(true)), JSON.stringify(cookieSets))
    check('…the action answers nothing (the token is never echoed) and logs nothing', value === undefined && output === '')
  }
  {
    cookieSets.length = 0
    requestHeaders = new Headers({ 'x-forwarded-proto': 'http' })
    await withFlag('true', () => keepSeedClaim(TOKEN))
    check('over plain HTTP the cookie is not Secure (a browser would drop it)', cookieSets.length === 1 && cookieSets[0].options.secure === false)
  }
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    cookieSets.length = 0
    requestHeaders = new Headers({ 'x-forwarded-proto': 'https' })
    const value = await withFlag(flag, () => keepSeedClaim(TOKEN))
    check(`scan off (${JSON.stringify(flag)}) → no cookie at all: sign-up exactly as before`, cookieSets.length === 0 && value === undefined)
  }
  for (const [label, bad] of [
    ['too short', TOKEN.slice(2)],
    ['upper case', TOKEN.toUpperCase()],
    ['with a cookie attribute smuggled in', `${TOKEN}; Domain=evil.example`],
    ['with a line break', `${TOKEN}\r\nSet-Cookie: x=1`],
    ['an object', { toString: () => TOKEN }],
    ['a number', 42],
    ['nothing', undefined],
  ] as const) {
    cookieSets.length = 0
    const value = await withFlag('true', () => keepSeedClaim(bad))
    check(`a value that is not a token (${label}) → nothing kept, nothing answered`, cookieSets.length === 0 && value === undefined)
  }
  {
    const src = strip(read('app/(auth)/signup/claim-action.ts'))
    check("the action file is a server action module ('use server' first) exporting only keepSeedClaim",
      /^\s*'use server'/.test(src) && (src.match(/export (async )?function|export const/g) ?? []).length === 1 && /export async function keepSeedClaim\(value: unknown\): Promise<void>/.test(src))
    check('…it logs nothing and returns nothing', !/console\./.test(src) && !/return\s+[^\s;]/.test(src.replace(/return\s*\n/g, '')))
    check('…and checks the flag before anything else', src.indexOf('seedScanFlagOn(process.env)') > -1 && src.indexOf('seedScanFlagOn(process.env)') < src.indexOf('readClaimToken('))
  }

  console.log('\n3) The sign-up page')
  const page = strip(read('app/(auth)/signup/page.tsx'))
  check("it reads the token from ?claim= and hands it to the action, and nowhere else", /const claimParam = searchParams\.get\('claim'\)/.test(page)
    // Four mentions: read, the guard, the hand-over, the effect's dependency. A fifth would be a new use.
    && /keepSeedClaim\(claimParam\)/.test(page) && (page.match(/claimParam/g) ?? []).length === 4, String((page.match(/claimParam/g) ?? []).length))
  check('…then takes it out of the address, keeping every other parameter', /\.filter\(\(\[key\]\) => key !== 'claim'\)/.test(page) && /router\.replace\(rest \? `\$\{pathname\}\?\$\{rest\}` : pathname, \{ scroll: false \}\)/.test(page))
  check('…and never renders it', !/\{\s*claimParam\s*\}/.test(page) && page.slice(page.indexOf('return (')).indexOf('claimParam') === -1)
  check('where sign-up leads is unchanged: the dashboard, and the confirmation link\'s next=/dashboard',
    // (still the dashboard; since the language pass it carries the form's ?lang, see lib/i18n/auth-href.ts)
    /router\.replace\(withLocaleParam\('\/dashboard', lang\)\)/.test(page) &&/next=\$\{encodeURIComponent\('\/dashboard'\)\}/.test(page))
  {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (name === 'node_modules' || name === '.next' || name === '__qa__') continue
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(name) && /\.get\(\s*['"]claim['"]\s*\)/.test(strip(readFileSync(full, 'utf8')))) offenders.push(relative(ROOT, full))
      }
    }
    for (const top of ['app', 'components', 'lib']) walk(join(ROOT, top))
    check('the sign-up page is the only code that reads ?claim=', offenders.join(',') === 'app/(auth)/signup/page.tsx', offenders.join(', '))
  }
  {
    const { AuthLocaleProvider } = require(join(ROOT, 'components/auth/AuthLocaleProvider.tsx'))
    const SIGNUP = require(join(ROOT, 'app/(auth)/signup/page.tsx'))
    search = new URLSearchParams({ claim: TOKEN, lang: 'en' })
    const html = renderToStaticMarkup(createElement(AuthLocaleProvider as never, { locale: 'en', children: createElement(SIGNUP.default as never) } as never) as never)
    check('the page renders with ?claim= in the address, and the token is nowhere in it', html.length > 1000 && !html.includes(TOKEN))
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
