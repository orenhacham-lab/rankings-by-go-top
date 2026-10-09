/**
 * The affiliate program's attribution rules, and the absence that is the point.
 *
 *   A) the code itself: what counts as one, and what is refused rather than repaired
 *   B) the link: reading `?ref=` off any public URL
 *   C) NO STORAGE: the code travels in the link and nothing is written anywhere
 *   D) carrying it: a landing page's signup button, and the `next` hop
 *   E) the gate: a code attaches to a NEW account only
 *   F) the partner's link: /r/<code>, and its closed list of destinations
 *   G) the wiring: the middleware, the signup form, the callback
 *
 * Every guard has a MUTATION CONTROL: the same check against a broken copy of the
 * rule, proving the check would fail if the rule were lost.
 *
 * WHY C EXISTS AT ALL. An earlier version of this file tested a `gt_ref` cookie,
 * its 90-day window and its flags. That cookie is not "strictly necessary" under
 * ePrivacy art. 5(3), so in the EU it needs consent and a named banner category,
 * and the consent record lives in localStorage where the middleware cannot read
 * it. It was never enabled in any environment and is now deleted — module, flag
 * and middleware write. The live agreement promises partners, in four languages,
 * that nothing is stored on the visitor's device, so these checks hold the
 * absence from both directions: no cookie is written, and no day count exists to
 * promise.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  NEW_ACCOUNT_WINDOW_MS, REFERRAL_CODE_MAX, REFERRAL_PARAM,
  attachableAtSignup, normalizeReferralCode, readReferralParam, splitReferralFromPath,
  withReferral, withinNewAccountWindow,
} from '../referral'
import { AFFILIATE_DESTINATIONS, affiliateDestination, affiliateLinkPath, affiliateLinkUrl, affiliateRedirectPath } from '../link'

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
    ['oren seo', 'oren!', 'ore/n', '-oren', '_oren', 'אורן', 'o<script>', ''].every((v) => normalizeReferralCode(v) === null))
  check('A5: a code longer than the limit is refused', normalizeReferralCode('a'.repeat(REFERRAL_CODE_MAX + 1)) === null
    && normalizeReferralCode('a'.repeat(REFERRAL_CODE_MAX)) === 'a'.repeat(REFERRAL_CODE_MAX))
  check('A6: a non-string is refused', [null, undefined, 42, {}, ['oren']].every((v) => normalizeReferralCode(v) === null))
  // The shape is also a CHECK constraint on affiliates.code; a code this function
  // accepts must be one the database can hold.
  const sql = read('supabase/migrations/20261009180000_affiliate_program.sql')
  check('A7: the shape here is the shape the database enforces',
    sql.includes("code ~ '^[a-z0-9][a-z0-9_-]{0,31}$'") && REFERRAL_CODE_MAX === 32)
}

console.log('\nB) the link')
{
  check('B1: `?ref=` is read off any public URL', readReferralParam('https://www.gotopseo.com/pricing?ref=oren') === 'oren')
  check('B2: …in any language tree', readReferralParam('https://www.gotopseo.com/es/features/keyword-research?ref=Ana') === 'ana')
  check('B3: a URL with no ref answers null', readReferralParam('https://www.gotopseo.com/pricing') === null)
  check('B4: a ref that is not a code answers null, not a broken code', readReferralParam('https://x.test/?ref=a%20b') === null)
  check('B5: the parameter is the one the public page documents', REFERRAL_PARAM === 'ref')
  check('B6: a relative URL works too', readReferralParam('/pricing?ref=oren') === 'oren')
  check('B7: rubbish never throws', readReferralParam('::::') === null)
}

console.log('\nC) nothing is stored')
{
  // The module must not even EXPORT a way to write a cookie: the agreement's
  // promise is the absence, so the absence is what is tested.
  const source = read('lib/affiliate/referral.ts')
  check('C1: the referral module names no cookie', !/gt_ref|Set-Cookie|set-cookie|Max-Age/i.test(strip(source)))
  check('C2: there is no tracking flag module left to turn a cookie back on',
    !existsSync(join(ROOT, 'lib/affiliate/tracking-flag.ts')))
  const proxy = strip(read('proxy.ts'))
  check('C3: the middleware writes nothing for a referral',
    !/referral/i.test(proxy) && !/REFERRAL/.test(proxy))
  check('C4: no module in the repo imports a referral cookie any more',
    !/referralCookieString|clearReferralCookieString|referralToPersist|REFERRAL_COOKIE/.test(
      ['lib/affiliate/referral.ts', 'proxy.ts', 'app/(auth)/signup/page.tsx', 'app/api/auth/callback/route.ts'].map(read).join('\n')))
  // And no window to promise: a window is a memory, and there is none.
  check('C5: no attribution window is exported', !/REFERRAL_WINDOW/.test(source))
  const terms = read('lib/affiliate/terms.ts')
  check('C6: the program terms hold no day count for attribution', !/windowDays|attributionWindow/.test(terms))
}

console.log('\nD) carrying the code')
{
  check('D1: a signup href gains the code', withReferral('/signup', 'oren') === '/signup?ref=oren')
  check('D2: an href that already has a query keeps it', withReferral('/en/signup?lang=en', 'oren') === '/en/signup?lang=en&ref=oren')
  check('D3: a hash survives', withReferral('/pricing#plans', 'oren') === '/pricing?ref=oren#plans')
  check('D4: no code means the href is untouched', withReferral('/signup', null) === '/signup' && withReferral('/signup', 'a b') === '/signup')
  check('D5: a rubbish code is not carried', withReferral('/signup', '  ') === '/signup')
  // The `next` hop: Google and the email-confirmation link keep nothing but this.
  check('D6: the callback reads the code off `next`…', splitReferralFromPath('/dashboard?ref=oren').code === 'oren')
  check('D7: …and takes it off before the redirect', splitReferralFromPath('/dashboard?ref=oren').path === '/dashboard')
  check('D8: other params on `next` are kept', splitReferralFromPath('/dashboard?lang=en&ref=oren').path === '/dashboard?lang=en')
  check('D9: a path with no code is returned unchanged', splitReferralFromPath('/dashboard').path === '/dashboard'
    && splitReferralFromPath('/dashboard').code === null)
}

console.log('\nE) the gate: new accounts only')
{
  check('E1: a code attaches to a new account', attachableAtSignup('oren', true) === 'oren')
  check('E2: …and NEVER to one that already exists', attachableAtSignup('oren', false) === null)
  check('E3: nothing to attach is null', attachableAtSignup(null, true) === null)
  check('E4: a rubbish code attaches nothing', attachableAtSignup('a b', true) === null)
  const now = Date.parse('2026-10-09T12:00:00Z')
  check('E5: an account created moments ago is new', withinNewAccountWindow('2026-10-09T11:59:00Z', now))
  check('E6: an account created before the window is not',
    !withinNewAccountWindow(new Date(now - NEW_ACCOUNT_WINDOW_MS - 1000).toISOString(), now))
  check('E7: a future creation time is not new either (a clock skew must not open the gate)',
    !withinNewAccountWindow('2026-10-09T12:05:00Z', now))
  check('E8: an unparseable creation time is not new', !withinNewAccountWindow('not a date', now) && !withinNewAccountWindow(null, now))
  // The same question the signup notice asks, so the two agree.
  check('E9: the window matches the signup notice\'s own window',
    read('lib/notifications/signup-email.ts').includes('SIGNUP_NOTIFICATION_WINDOW_MS = 30 * 60 * 1000')
    && NEW_ACCOUNT_WINDOW_MS === 30 * 60 * 1000)
}

console.log('\nF) the partner\'s link')
{
  check('F1: the link is /r/<code>', affiliateLinkPath('danaseo') === '/r/danaseo')
  check('F2: an absolute link has no double slash', affiliateLinkUrl('https://www.gotopseo.com/', 'danaseo') === 'https://www.gotopseo.com/r/danaseo')
  check('F3: a destination rides as a key, not a path', affiliateLinkPath('danaseo', 'pricing') === '/r/danaseo?to=pricing')
  check('F4: the redirect puts the code on the destination', affiliateRedirectPath('danaseo', 'signup') === '/signup?ref=danaseo')
  check('F5: no destination lands on the home page', affiliateRedirectPath('danaseo', null) === '/?ref=danaseo')
  // THE ONE THAT MATTERS: a published link's query is editable by anyone, so an
  // open `?to=` would be an open redirect on our own domain.
  const attacks = ['https://evil.test', '//evil.test', '/../../etc', 'javascript:alert(1)', '/dashboard', 'HOME']
  check('F6: an arbitrary `to` NEVER becomes a destination',
    attacks.every((attack) => affiliateDestination(attack) === '/'),
    JSON.stringify(attacks.map(affiliateDestination)))
  check('F7: …and never reaches the redirect either',
    attacks.every((attack) => affiliateRedirectPath('danaseo', attack) === '/?ref=danaseo'))
  check('F8: every destination is a path on this site',
    Object.values(AFFILIATE_DESTINATIONS).every((path) => path.startsWith('/') && !path.startsWith('//')))
  check('F9: every destination is a route that exists',
    Object.values(AFFILIATE_DESTINATIONS).every((path) =>
      path === '/' || existsSync(join(ROOT, 'app/(public)', path.slice(1), 'page.tsx')) || existsSync(join(ROOT, 'app/(auth)', path.slice(1), 'page.tsx'))))
}

console.log('\nG) the wiring')
{
  const route = strip(read('app/r/[code]/route.ts'))
  check('G1: the link route counts the click in the database, not by reading then writing',
    /rpc\('affiliate_count_click'/.test(route) && !/clicks \+ 1/.test(route))
  check('G2: the link route records nothing about the visitor',
    !/x-forwarded-for|user-agent|referer|clientIpFrom|cookies/i.test(route))
  check('G3: an unknown code still lands the visitor on a page of ours', /land\(affiliateDestination\(requested\)\)/.test(route))
  check('G4: a suspended partner\'s link still resolves', /\.in\('status', \['approved', 'suspended'\]\)/.test(route))

  const signup = strip(read('app/(auth)/signup/page.tsx'))
  check('G5: the signup form sends the code to the server once the account exists',
    /fetch\('\/api\/affiliate\/attach'/.test(signup) && /JSON\.stringify\(\{ code: referralCode \}\)/.test(signup))
  check('G6: the code rides Google\'s round trip on `next`', /nextPath=\{withReferral\('\/dashboard', referralCode\)\}/.test(signup))
  check('G7: …and the email-confirmation link too', /withReferral\('\/dashboard', referralCode\)\)\}&lang=/.test(signup))

  const callback = strip(read('app/api/auth/callback/route.ts'))
  check('G8: the callback credits the partner through the one shared function',
    /splitReferralFromPath\(next\)/.test(callback) && /attachReferral\(createAdminClient\(\)/.test(callback))
  check('G9: the attach route never reads a user id from the body',
    !/body.*userId|userId.*body/.test(strip(read('app/api/affiliate/attach/route.ts'))))
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
  check('MUT3: a gate that ignores "is this a new account" is caught by E2', alwaysAttach('oren') !== null)
  const openRedirect = (raw: string | null) => (raw && raw.startsWith('/') ? raw : '/')
  check('MUT4: a `to` that takes any path is caught by F6', openRedirect('/dashboard') !== '/')
  const keepsRef = (path: string) => ({ path, code: readReferralParam(path) })
  check('MUT5: a callback that leaves the code on the URL is caught by D7', keepsRef('/dashboard?ref=oren').path !== '/dashboard')
  const cookieWriter = () => 'gt_ref=oren; Path=/; Max-Age=7776000; HttpOnly'
  check('MUT6: a module that writes a referral cookie again is caught by C1', /gt_ref/.test(cookieWriter()))
  const noWindowCheck = (createdAt: string | null) => Boolean(createdAt)
  check('MUT7: a "new account" test that only checks the field exists is caught by E6',
    noWindowCheck('2020-01-01T00:00:00Z'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
