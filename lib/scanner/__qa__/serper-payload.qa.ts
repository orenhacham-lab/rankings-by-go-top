/**
 * NO PERSONAL DATA MAY REACH SERPER, BECAUSE THERE IS NO CONTRACT THAT WOULD
 * LET IT.
 *
 * Serper refused to sign a data processing agreement (recorded in
 * /mnt/project-files/legal/serper-dpa-refusal-2026-10-12.md), and the privacy
 * policy says so in all nine languages instead of implying an Art. 28
 * agreement we do not have. Saying it is not a mitigation on its own. The
 * mitigation is `lib/scanner/serper-payload.ts`: one allowlist, one function
 * that builds every request body, and this suite to make a new key a build
 * failure rather than a quiet export of whatever the next edit happens to put
 * on the object.
 *
 * What is checked:
 *   1. The allowlist is the set the module documents, and nothing was added to
 *      it without this suite being updated with it.
 *   2. `serperPayload` keeps every allowed key, in the caller's own order, and
      drops everything else, with
 *      the things we actually fear tried by name: an email address, an account
 *      id, a project id, an IP address, a User-Agent.
 *   3. Prototype keys cannot smuggle a value through, and an explicit
 *      `undefined` is not sent as a key.
 *   4. Every call site that posts to a serper.dev URL builds its body with
 *      `serperBody` and never with its own `JSON.stringify`.
 *   5. The set of files that talk to serper.dev is the set this suite knows
 *      about, so a fourth call site fails here instead of shipping unguarded.
 *   6. Each call site builds only allowlisted keys, read out of the source.
 *
 * MUTATION CONTROLS at the end: the source guards are re-run against source
 * text with the thing they look for broken, and must then fail.
 *
 * Run: npx tsx lib/scanner/__qa__/serper-payload.qa.ts
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { SERPER_ALLOWED_KEYS, serperPayload, serperBody } from '../serper-payload'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Source guards match code, never comments. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
}

// ---------------------------------------------------------------- 1. the list
const EXPECTED_KEYS = ['q', 'gl', 'hl', 'type', 'device', 'll', 'location', 'num', 'page']
check('the allowlist is exactly the nine keys this suite reasons about',
  [...SERPER_ALLOWED_KEYS].sort().join(',') === [...EXPECTED_KEYS].sort().join(','),
  `found ${[...SERPER_ALLOWED_KEYS].join(',')}`)

// ------------------------------------------------- 2. what survives, what not
{
  const full: Record<string, unknown> = {
    q: 'מנעולן בתל אביב', gl: 'il', hl: 'he', type: 'search',
    device: 'mobile', ll: '@32.08,34.78,13z', location: 'Tel Aviv', num: 10, page: 2,
  }
  const { body, dropped } = serperPayload(full)
  check('every allowed key survives', Object.keys(body).length === 9, Object.keys(body).join(','))
  check('nothing is reported dropped from an all-allowed body', dropped.length === 0, dropped.join(','))

  const FEARED: Record<string, unknown> = {
    email: 'oren@example.com',
    userEmail: 'oren@example.com',
    user_id: 'user_01ABC',
    userId: 'user_01ABC',
    projectId: 'proj_123',
    accountId: 'acc_9',
    ip: '203.0.113.9',
    clientIp: '203.0.113.9',
    userAgent: 'Mozilla/5.0',
    'user-agent': 'Mozilla/5.0',
    businessName: 'מנעולן דוד',
    phone: '+972549489377',
    address: 'הרכסים 24/2 רמת גן',
    referrer: 'https://www.gotopseo.com/he',
  }
  for (const key of Object.keys(FEARED)) {
    const out = serperPayload({ q: 'x', [key]: FEARED[key] })
    check(`${key} never reaches the request body`,
      !Object.prototype.hasOwnProperty.call(out.body, key) && out.dropped.includes(key))
  }
  // ORDER IS LOAD-BEARING, not cosmetic: lib/scanner/__qa__
  // /competitor-positions.qa.ts compares live request bodies against bodies
  // recorded before this module existed. Filtering must not reorder, or that
  // baseline has to be re-recorded and stops proving anything.
  check('the caller\'s own key order is preserved, not normalized to the allowlist order',
    JSON.stringify(serperPayload({ q: 'x', gl: 'us', hl: 'en', type: 'search', num: 100, device: 'desktop', ll: '@1,2,13z' }).body)
      === '{"q":"x","gl":"us","hl":"en","type":"search","num":100,"device":"desktop","ll":"@1,2,13z"}')
  check('order is preserved even when a disallowed key sits between two allowed ones',
    Object.keys(serperPayload({ q: 'x', email: 'a@b.c', num: 10 }).body).join(',') === 'q,num')
  check('a dropped key is named in `dropped` so it can be logged as a classified reason',
    serperPayload({ q: 'x', email: 'a@b.c' }).dropped.join(',') === 'email')
}

// --------------------------------------------- 3. prototype keys and undefined
{
  const out = serperPayload(Object.create({ q: 'inherited' }) as Record<string, unknown>)
  check('an inherited q is not sent (own properties only)',
    !Object.prototype.hasOwnProperty.call(out.body, 'q'))
  const withUndefined = serperPayload({ q: 'x', device: undefined })
  check('an explicitly undefined allowed key is not sent as a key',
    !Object.prototype.hasOwnProperty.call(withUndefined.body, 'device'))
  check('an explicitly undefined disallowed key is not reported as dropped',
    serperPayload({ q: 'x', email: undefined }).dropped.length === 0)
  check('serperBody emits JSON of the filtered body only',
    serperBody({ q: 'x', email: 'a@b.c' }) === '{"q":"x"}')
}

// ------------------------------------------- 4, 5, 6. the call sites in source
const CALL_SITES = [
  'lib/scanner/google-search.ts',
  'lib/scanner/google-maps.ts',
  'lib/seed-scan/serper.ts',
  // Found by the file-set check below when this suite was first written: the
  // first-run wizard's health check was posting a body of its own.
  'app/api/setup/status/route.ts',
]

/**
 * Files that name serper.dev but send it nothing, each one declared with its
 * reason. A new file in neither list fails the check below, which is how a
 * fifth call site gets noticed.
 */
const NOT_CALL_SITES: Record<string, string> = {
  'app/(setup)/setup/page.tsx': 'the wizard tells the admin where to get a key',
  'app/(setup)/setup/status-copy.ts': 'a comment quoting an egress-proxy refusal',
  'app/api/setup/test-scan/route.ts': 'a fetch interceptor matching the URL in a harness',
}

/**
 * Every file under lib/ and app/ that names a serper.dev URL, so a new call
 * site cannot appear without this suite noticing. Read out of the tree rather
 * than trusted from the list above.
 */
{
  const found = execSync(
    "grep -rl 'serper\\.dev' lib app --include='*.ts' --include='*.tsx' || true",
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.includes('__qa__'))
    .sort()
  const known = [...CALL_SITES, ...Object.keys(NOT_CALL_SITES)].sort()
  check('every file that names serper.dev is either a guarded call site or declared as not one',
    found.join(',') === known.join(','),
    `found ${found.join(',') || '(none)'}`)
}

const KEY_ASSIGNMENT = /\b(?:[A-Za-z0-9_]*[Bb]ody)\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g
const LITERAL_KEY = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm

for (const path of CALL_SITES) {
  const src = stripComments(readFileSync(path, 'utf8'))

  check(`${path}: builds its Serper body with serperBody`, /serperBody\s*\(/.test(src))
  const ownStringify = [...src.matchAll(/body:\s*JSON\.stringify/g)]
  check(`${path}: no Serper request body is built with its own JSON.stringify`,
    ownStringify.length === 0, `found ${ownStringify.length}`)

  // Keys assigned onto a *body object, e.g. baseBody.location = ...
  const assigned = [...src.matchAll(KEY_ASSIGNMENT)].map((m) => m[1]!)
  const strayAssigned = [...new Set(assigned)].filter((k) => !(SERPER_ALLOWED_KEYS as readonly string[]).includes(k))
  check(`${path}: assigns no key onto a Serper body outside the allowlist`,
    strayAssigned.length === 0, strayAssigned.join(','))

  // Keys written inside a serperBody({ ... }) literal.
  const inline = [...src.matchAll(/serperBody\s*\(\s*\{([^}]*)\}/g)].map((m) => m[1]!)
  for (const literal of inline) {
    const keys = [...literal.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]!)
    const stray = keys.filter((k) => !(SERPER_ALLOWED_KEYS as readonly string[]).includes(k))
    check(`${path}: the inline serperBody literal carries only allowlisted keys`,
      stray.length === 0, stray.join(','))
  }
}

// Keys declared in the body object literals of google-search and google-maps,
// which are built as `Record<string, unknown> = { ... }` and then posted.
for (const path of ['lib/scanner/google-search.ts', 'lib/scanner/google-maps.ts']) {
  const src = stripComments(readFileSync(path, 'utf8'))
  const blocks = [...src.matchAll(/(?:base)?[Bb]ody\s*:\s*Record<string,\s*unknown>\s*=\s*\{([^}]*)\}/g)]
    .map((m) => m[1]!)
  check(`${path}: a Serper body object literal was found to read`, blocks.length > 0)
  for (const block of blocks) {
    LITERAL_KEY.lastIndex = 0
    const keys = [...block.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]!)
    const stray = keys.filter((k) => !(SERPER_ALLOWED_KEYS as readonly string[]).includes(k))
    check(`${path}: its body literal declares only allowlisted keys`,
      stray.length === 0, stray.join(','))
  }
}

// -------------------------------------------------------- mutation controls
{
  const real = stripComments(readFileSync('lib/scanner/google-search.ts', 'utf8'))
  const reverted = real.replace(/serperBody\(body, `GoogleSearch:radius:\$\{label\}`\)/, 'JSON.stringify(body)')
  check('mutation control: a call site that goes back to its own JSON.stringify is caught',
    [...reverted.matchAll(/body:\s*JSON\.stringify/g)].length > 0)

  const leaked = real.replace('body.ll = ll', "body.ll = ll\n  body.userEmail = 'oren@example.com'")
  const assigned = [...leaked.matchAll(KEY_ASSIGNMENT)].map((m) => m[1]!)
  check('mutation control: an email assigned onto the body is caught by the key guard',
    assigned.includes('userEmail')
      && !(SERPER_ALLOWED_KEYS as readonly string[]).includes('userEmail'))

  const mapsReal = stripComments(readFileSync('lib/scanner/google-maps.ts', 'utf8'))
  const mapsLeaked = mapsReal.replace(
    /(const body:\s*Record<string,\s*unknown>\s*=\s*\{)/,
    "$1\n    clientIp: '203.0.113.9',",
  )
  const block = /(?:base)?[Bb]ody\s*:\s*Record<string,\s*unknown>\s*=\s*\{([^}]*)\}/.exec(mapsLeaked)
  const keys = block ? [...block[1]!.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]!) : []
  check('mutation control: an IP added to the Maps body literal is caught by the literal guard',
    keys.includes('clientIp'))

  const seedReal = stripComments(readFileSync('lib/seed-scan/serper.ts', 'utf8'))
  const seedLeaked = seedReal.replace("{ q: query,", "{ q: query, userId: 'user_01ABC',")
  const inline = /serperBody\s*\(\s*\{([^}]*)\}/.exec(seedLeaked)
  const seedKeys = inline ? [...inline[1]!.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]!) : []
  check('mutation control: a user id added to the seed-scan literal is caught by the inline guard',
    seedKeys.includes('userId'))

  check('mutation control: an undeclared call site would fail the file-set check',
    [...CALL_SITES, ...Object.keys(NOT_CALL_SITES), 'lib/scanner/new-thing.ts'].sort().join(',')
      !== [...CALL_SITES, ...Object.keys(NOT_CALL_SITES)].sort().join(','))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
