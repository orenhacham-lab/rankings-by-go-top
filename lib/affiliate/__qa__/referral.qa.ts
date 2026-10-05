/**
 * The affiliate program's attribution rules.
 *
 *   A) the code itself: what counts as one, and what is refused rather than repaired
 *   B) the link: reading `?ref=` off any public URL
 *   C) the cookie: its window, its flags, and last-click-wins
 *   D) the gate: a code attaches to a NEW account only
 *   E) the wiring: the middleware remembers it on every public response
 *
 * Every guard has a MUTATION CONTROL: the same check against a broken copy of the
 * rule, proving the check would fail if the rule were lost.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  REFERRAL_COOKIE, REFERRAL_PARAM, REFERRAL_CODE_MAX, REFERRAL_WINDOW_DAYS, REFERRAL_WINDOW_SECONDS,
  attachableAtSignup, clearReferralCookieString, normalizeReferralCode, readReferralParam,
  referralCookieString, referralToPersist,
} from '../referral'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source guards match on code, so comments are stripped first (repo convention). */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('A) the code')
{
  check('A1: a plain code is kept', normalizeReferralCode('oren') === 'oren')
  check('A2: case and surrounding spaces are not meaningful (it gets typed by hand)',
    normalizeReferralCode('  OreN-SEO  ') === 'oren-seo')
  check('A3: digits, dashes and underscores are allowed', normalizeReferralCode('seo_pro-42') === 'seo_pro-42')
  check('A4: anything else is REFUSED, never half-cleaned into a code that matches nobody',
    ['oren seo', 'oren!', 'ore/n', '-oren', '_oren', 'אורן', 'o<script>', ''].every((v) => normalizeReferralCode(v) === null),
    JSON.stringify(['oren seo', 'oren!', 'ore/n', '-oren', '_oren', 'אורן'].map(normalizeReferralCode)))
  check('A5: a code longer than the limit is refused', normalizeReferralCode('a'.repeat(REFERRAL_CODE_MAX + 1)) === null
    && normalizeReferralCode('a'.repeat(REFERRAL_CODE_MAX)) === 'a'.repeat(REFERRAL_CODE_MAX))
  check('A6: a non-string is refused', [null, undefined, 42, {}, ['oren']].every((v) => normalizeReferralCode(v) === null))
}

console.log('\nB) the link')
{
  check('B1: `?ref=` is read off any public URL', readReferralParam('https://www.gotopseo.com/pricing?ref=oren') === 'oren')
  check('B2: …in any language tree', readReferralParam('https://www.gotopseo.com/es/features/keyword-research?ref=Ana') === 'ana')
  check('B3: a URL with no ref answers null', readReferralParam('https://www.gotopseo.com/pricing') === null)
  check('B4: a ref that is not a code answers null, not a broken code', readReferralParam('https://x.test/?ref=a%20b') === null)
  check('B5: the parameter is the one the public page documents', REFERRAL_PARAM === 'ref')
  check('B6: a relative URL works too (the middleware passes nextUrl)', readReferralParam('/pricing?ref=oren') === 'oren')
  check('B7: rubbish never throws', readReferralParam('::::') === null)
}

console.log('\nC) the cookie')
{
  const c = referralCookieString('oren', true)
  check('C1: it carries the code, at the site root', c.startsWith(`${REFERRAL_COOKIE}=oren`) && /(^|; )Path=\/(;|$)/.test(c))
  check('C2: the window is the 90 days the public page states',
    REFERRAL_WINDOW_DAYS === 90 && REFERRAL_WINDOW_SECONDS === 90 * 86400 && c.includes(`Max-Age=${REFERRAL_WINDOW_SECONDS}`))
  check('C3: HttpOnly — only our own signup handler ever needs it', c.includes('HttpOnly'))
  check('C4: SameSite=Lax, so arriving from the affiliate\'s own blog still counts', c.includes('SameSite=Lax'))
  check('C5: Secure over HTTPS, and not over plain HTTP (local development)',
    c.includes('Secure') && !referralCookieString('oren', false).includes('Secure'))
  check('C6: clearing it expires it immediately with the same flags',
    /Max-Age=0/.test(clearReferralCookieString(true)) && clearReferralCookieString(true).includes('HttpOnly'))
  // Last click wins: the published terms say so, so a later link must replace an earlier one.
  check('C7: a NEW code replaces the one already held', referralToPersist('ana', '/pricing?ref=oren') === 'oren')
  check('C8: the SAME code writes nothing (no cookie churn on every page)', referralToPersist('oren', '/pricing?ref=oren') === null)
  check('C9: a page with no ref leaves the cookie alone — the overwhelming majority of requests',
    referralToPersist('oren', '/pricing') === null && referralToPersist(null, '/pricing') === null)
  check('C10: a rubbish ref does not wipe a real one', referralToPersist('oren', '/pricing?ref=a%20b') === null)
}

console.log('\nD) the gate: a NEW account only')
{
  check('D1: a new account takes the code', attachableAtSignup('oren', true) === 'oren')
  check('D2: an account that already exists takes NOTHING, so nobody earns on a subscription they already pay for',
    attachableAtSignup('oren', false) === null)
  check('D3: no cookie, nothing to attach', attachableAtSignup(null, true) === null)
  check('D4: a rubbish cookie attaches nothing', attachableAtSignup('a b', true) === null)
}

console.log('\nE) the wiring')
{
  const proxy = strip(read('proxy.ts'))
  const remembers = (src: string) => /referralToPersist\(request\.cookies\.get\(REFERRAL_COOKIE\)\?\.value \?\? null, request\.nextUrl\)/.test(src)
    && /res\.headers\.append\('set-cookie', referralCookieString\(referralToSet, secure\)\)/.test(src)
  check('E1: the middleware reads `?ref=` on every page it sees and remembers it', remembers(proxy))
  check('E2: MUT a middleware that forgets it fails E1',
    !remembers(proxy.replace("res.headers.append('set-cookie', referralCookieString(referralToSet, secure))", '')))
  check('E3: it is written only when there is something to write', /if \(referralToSet\) \{/.test(proxy))
  // The program is attribution, never a payment: nothing here may decide a commission.
  const lib = strip(read('lib/affiliate/referral.ts'))
  check('E4: the rules are PURE — no network, no database, no environment',
    !/fetch\(|createClient|process\.env|supabase/i.test(lib))
  check('E5: MUT a rule file that reaches out fails E4', /fetch\(/.test(lib.replace('export const REFERRAL_PARAM', 'fetch(\'/x\')\nexport const REFERRAL_PARAM')))
}

// ── Mutation controls on the rules themselves ────────────────────────────────
console.log('\nMUTATION CONTROLS')
{
  // Each is the rule re-implemented WITHOUT its guard; the matching check must fail.
  const looseShape = (raw: string) => raw.trim().toLowerCase() || null
  check('MUT1: a normalizer that only trims and lowercases is caught by A4', looseShape('oren seo') !== null)
  const noLimit = (raw: string) => (/^[a-z0-9][a-z0-9_-]*$/.test(raw) ? raw : null)
  check('MUT2: a normalizer with no length limit is caught by A5', noLimit('a'.repeat(REFERRAL_CODE_MAX + 1)) !== null)
  const alwaysAttach = (code: string | null) => normalizeReferralCode(code)
  check('MUT3: a gate that ignores "is this a new account" is caught by D2', alwaysAttach('oren') !== null)
  const firstClick = (current: string | null, url: string) => (current ? null : readReferralParam(url))
  check('MUT4: first-click attribution is caught by C7', firstClick('ana', '/pricing?ref=oren') !== 'oren')
  const noSecure = (code: string) => `${REFERRAL_COOKIE}=${code}; Path=/; Max-Age=${REFERRAL_WINDOW_SECONDS}; SameSite=Lax`
  check('MUT5: a cookie without HttpOnly is caught by C3', !noSecure('oren').includes('HttpOnly'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
