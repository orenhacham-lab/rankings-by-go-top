/**
 * WHERE A SIGN-UP CAME FROM — the derivation, and the two promises around it.
 *
 * Section 1 holds the pure derivation (lib/attribution/source.ts) to its
 * shape: what counts as a channel, what is refused, and what is deliberately
 * dropped (a referrer's query string, a landing page's query string).
 *
 * Section 2 is a SOURCE GUARD on the promise that costs the most if it is
 * ever quietly broken: nothing in this path writes to the visitor's device.
 * The live privacy policy says so in four languages, and the referral
 * programme already had to remove exactly such a cookie, so a future
 * "small improvement" that sets one has to break this guard first.
 *
 * Section 3 is a source guard on the wiring: the sign-up page actually calls
 * the action, and the action refuses to label an account it was not given
 * proof of (a uuid, and an account created minutes ago).
 *
 * Each source guard carries its MUTATION CONTROL: the same check run against
 * a deliberately broken copy of the file, which must fail.
 *
 * The database side — one row per account, owner-only reads, service-role
 * writes, the CHECK on every column — is proved separately against a real
 * PostgreSQL in supabase/migrations/__qa__/signup-attribution.probe.sql.
 *
 * Run: npx tsx lib/attribution/__qa__/signup-attribution.qa.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanValue, externalReferrerHost, isOwnHost, landingPathOf, readSignupSource } from '../source'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Comments are stripped before matching: this file's own prose must not satisfy a guard. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// ── 1. The derivation ───────────────────────────────────────────────────────

function section1(): void {
  console.log('\n1. What counts as a channel')

  const tagged = readSignupSource({
    search: '?utm_source=community&utm_medium=social&utm_campaign=fb-smb',
    referrer: 'https://www.facebook.com/groups/123/posts/456/',
    path: '/signup',
  })
  check('a tagged link keeps source, medium and campaign',
    tagged?.source === 'community' && tagged?.medium === 'social' && tagged?.campaign === 'fb-smb', JSON.stringify(tagged))
  check('the referrer is kept as a HOST, never the full address — it can carry someone else\'s query',
    tagged?.referrerHost === 'www.facebook.com', JSON.stringify(tagged))

  const search = readSignupSource({ search: '', referrer: 'https://www.google.com/search?q=%D7%91%D7%93%D7%99%D7%A7%D7%AA+%D7%9E%D7%99%D7%A7%D7%95%D7%9E%D7%99%D7%9D', path: '/free-check' })
  check('an untagged arrival from a real site is attributed to that site',
    search?.source === 'www.google.com' && search?.medium === 'referral', JSON.stringify(search))
  check('the search terms in the referrer are dropped with the rest of its address',
    search?.referrerHost === 'www.google.com' && !JSON.stringify(search).includes('q='), JSON.stringify(search))

  check('the short `src` our own published links use is read as the source',
    readSignupSource({ search: 'src=wordpress-directory' })?.source === 'wordpress-directory')
  check('utm_source wins when a link carries both',
    readSignupSource({ search: 'src=a&utm_source=b' })?.source === 'b')

  check('a visitor who typed the address, with no tag and no referrer, produces no row at all',
    readSignupSource({ search: '', referrer: '', path: '/signup' }) === null)
  check('an internal hop is not a channel: a referrer of ours produces no row',
    readSignupSource({ search: '', referrer: 'https://www.gotopseo.com/pricing', path: '/signup' }) === null)
  check('our own hosts are known as ours',
    isOwnHost('gotopseo.com') && isOwnHost('www.gotopseo.com') && isOwnHost('localhost') && !isOwnHost('gotopseo.com.evil.test'))

  check('the landing page is kept as a path, without its query',
    readSignupSource({ search: 'utm_source=x&secret=keep-out', path: '/free-check?secret=keep-out' })?.landingPath === '/free-check')

  console.log('\n1b. What the column refuses, refused before it gets there')
  check('a value with markup loses it', cleanValue('<b>community</b>') === 'bcommunity/b')
  check('an empty value is nothing, which is NULL', cleanValue('   ') === null && cleanValue('') === null)
  check('a value over 200 characters is cut to 200', (cleanValue('a'.repeat(400)) ?? '').length === 200)
  check('a value that is not a string is nothing', cleanValue(42) === null && cleanValue(null) === null && cleanValue({}) === null)
  check('a referrer that is not an address is nothing', externalReferrerHost('not a url') === null && externalReferrerHost('') === null)
  check('a referrer that is not http(s) is nothing', externalReferrerHost('javascript:alert(1)') === null && externalReferrerHost('data:text/html,x') === null)
  check('a path that is only a fragment or empty is nothing', landingPathOf('') === null && landingPathOf(7) === null)
  check('a malformed query string does not throw', readSignupSource({ search: '%%%&&=' }) === null)
}

// ── 2. Nothing is stored on the visitor's device ────────────────────────────

/** Writing to the device, in every shape this path could take. */
const DEVICE_STORAGE = [
  { label: 'a cookie set from the attribution path', re: /cookies\(\)|document\.cookie|set-cookie/i },
  { label: 'localStorage', re: /localStorage/ },
  { label: 'sessionStorage', re: /sessionStorage/ },
  { label: 'IndexedDB', re: /indexedDB/i },
]

const ATTRIBUTION_FILES = ['lib/attribution/source.ts', 'app/(auth)/signup/source-action.ts']

function storesOnDevice(src: string): { label: string } | null {
  const body = withoutComments(src)
  return DEVICE_STORAGE.find(({ re }) => re.test(body)) ?? null
}

function section2(): void {
  console.log('\n2. Nothing is written to the visitor\'s device (ePrivacy art. 5(3); the privacy policy says so in four languages)')

  for (const rel of ATTRIBUTION_FILES) {
    const hit = storesOnDevice(read(rel))
    check(`${rel} writes nothing to the device`, hit === null, hit ? `found ${hit.label}` : undefined)
  }

  // MUTATION CONTROL: the same guard over a copy that does set a cookie.
  const mutated = read('lib/attribution/source.ts') + '\nexport function keep(v: string) { document.cookie = `gt_src=${v}` }\n'
  check('MUTATION CONTROL: the guard catches an attribution cookie added to the same file',
    storesOnDevice(mutated) !== null)
}

// ── 3. The wiring, and what the action refuses ──────────────────────────────

function section3(): void {
  console.log('\n3. The sign-up records it, and the action cannot be used to label somebody else')

  const page = withoutComments(read('app/(auth)/signup/page.tsx'))
  check('the sign-up page calls the action with the address and the referrer',
    /recordSignupSource\(\s*authData\.user\.id/.test(page) && /document\.referrer/.test(page) && /window\.location\.search/.test(page))
  check('it is recorded before the page forks on whether a session came back, so an account awaiting email confirmation is recorded too',
    page.indexOf('recordSignupSource(') > 0 && page.indexOf('recordSignupSource(') < page.indexOf('authData.session'))

  const action = withoutComments(read('app/(auth)/signup/source-action.ts'))
  check('the action is a server action', /^'use server'/m.test(read('app/(auth)/signup/source-action.ts')))
  check('it refuses anything that is not a uuid', /UUID\s*=\s*\/\^\[0-9a-f\]\{8\}/.test(action) && /UUID\.test\(userId\)/.test(action))
  check('it refuses an account that is not minutes old, so an old account cannot be labelled by a passer-by',
    /getUserById/.test(action) && /FRESH_ACCOUNT_MS/.test(action))
  check('it writes with the service role and only inserts', /createAdminClient\(\)/.test(action) && /\.insert\(/.test(action) && !/\.update\(|\.upsert\(|\.delete\(/.test(action))
  check('it answers nothing and cannot fail a sign-up', /Promise<void>/.test(action) && /catch\s*\{/.test(action))

  // MUTATION CONTROL: the same guards over a copy with the checks removed.
  const broken = withoutComments(read('app/(auth)/signup/source-action.ts').replace('UUID.test(userId)', 'true').replace('getUserById', 'noCheck'))
  check('MUTATION CONTROL: the guards catch the uuid check and the freshness check being removed',
    !(/UUID\.test\(userId\)/.test(broken)) && !(/getUserById/.test(broken)))
}

function main(): void {
  console.log('SIGN-UP ATTRIBUTION')
  section1()
  section2()
  section3()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
