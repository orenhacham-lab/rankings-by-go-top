/**
 * robots.txt for step b1 (and a1's read of it): what one read comes to, and
 * matching its rules in linear time whatever the file holds.
 *
 * What must hold:
 *   STATES     a 2xx read whole is rules; a 4xx but 429 is "no file", allow
 *              all; a 5xx, a 429, no answer or a 2xx not read whole is
 *              unreadable (RFC 9309, 2.3.1). A rules text has LF line ends.
 *   MATCHING   the RFC's `*` and `$`, longest rule wins, Allow wins a tie;
 *              the same verdicts as the regular expression it replaced, on
 *              thousands of random rules and paths.
 *   CAPS       a rule over MAX_RULE_CHARS or MAX_RULE_WILDCARDS: an Allow is
 *              dropped, a Disallow keeps out at least what it would whole.
 *   TIME       a hostile file costs milliseconds: many `*` against a long
 *              path (the old RegExp took 34.7 s on 10 of them and a 40-char
 *              path), lines built to make a pattern backtrack, and the free
 *              check's own readers of the same text.
 *
 * Each timing check first runs a small SENTINEL: when that is already slow the
 * big case is skipped (it would only hang the suite) and the check fails.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-robots.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { readRobots, sitemapsFromRobots } from '@/lib/free-check'
import { MAX_RULE_CHARS, MAX_RULE_WILDCARDS, parseRobots, robotsAllows, robotsAnswer, ROBOTS_TEXT_LIMIT } from '../crawl'
import { makeChecker } from './_fixtures'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const LIMIT_MS = 50

const allows = (txt: string, path: string) => robotsAllows(parseRobots(txt), new URL(`https://shop.example${path}`))
const star = (...rules: string[]) => `User-agent: *\n${rules.join('\n')}\n`

/** The fastest of `runs` timings of `fn`, in milliseconds (one slow run on a busy machine is noise). */
function fastest(fn: () => void, runs = 3): number {
  let best = Infinity
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    fn()
    best = Math.min(best, performance.now() - t)
  }
  return best
}

/** Time `big` only when `sentinel` is already fast; a slow sentinel fails the check without running `big`. */
function timed(name: string, sentinel: () => void, big: () => void) {
  const s = fastest(sentinel, 1)
  if (s >= LIMIT_MS) return check(name, false, `sentinel took ${s.toFixed(0)} ms; the full case was not run`)
  const t = fastest(big)
  check(`${name} (${t.toFixed(1)} ms)`, t < LIMIT_MS, `${t.toFixed(0)} ms`)
}

/** The matcher this file replaced, as a reference: the rule compiled to a RegExp (dotAll: `*` is any run of characters). */
function referenceMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}${anchored ? '$' : ''}`, 's').test(path)
}

function referenceAllows(rules: { allow: boolean; pattern: string }[], path: string): boolean {
  let best: { allow: boolean; pattern: string } | null = null
  for (const rule of rules) {
    if (!referenceMatches(rule.pattern, path)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)) best = rule
  }
  return best ? best.allow : true
}

/** A small deterministic generator (mulberry32), so a failure reproduces. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function main() {
  console.log('STATES) what one read of robots.txt comes to')
  {
    const ok = (status: number, text = 'User-agent: *\nDisallow: /a\n') => ({ status, text })
    check('a 200 read whole: its rules', JSON.stringify(robotsAnswer(ok(200), true)) === JSON.stringify({ state: 'rules', text: 'User-agent: *\nDisallow: /a\n' }))
    check('a 200 with no rules at all is still "rules" (allow all), not unreadable', robotsAnswer(ok(200, ''), true).state === 'rules')
    check('a 200 not read to the end (a deadline, a broken stream): unreadable', robotsAnswer(ok(200), false).state === 'unreadable')
    check('a 200 as long as the part the engine keeps (it may be the start of a longer file): unreadable',
      robotsAnswer(ok(200, 'a'.repeat(ROBOTS_TEXT_LIMIT)), true).state === 'unreadable' && robotsAnswer(ok(200, 'a'.repeat(ROBOTS_TEXT_LIMIT - 1)), true).state === 'rules')
    check('404, 410, 401 and 403: no file, allow all', [404, 410, 401, 403].every((s) => robotsAnswer(ok(s), true).state === 'absent'))
    check('429: unreadable (the site asked us to wait, not told us there are no rules)', robotsAnswer(ok(429), true).state === 'unreadable')
    check('500, 502, 503: unreadable', [500, 502, 503].every((s) => robotsAnswer(ok(s), true).state === 'unreadable'))
    check('no answer (a timeout, a network error, a refused redirect): unreadable', robotsAnswer(null, true).state === 'unreadable')
    const mixed = robotsAnswer(ok(200, 'User-agent: *\r\nDisallow: /a\rDisallow: /b\u2028Disallow: /c\u2029Disallow: /d\n'), true)
    check('a rules text has LF line ends only (CRLF, CR, U+2028 and U+2029 become LF)',
      mixed.state === 'rules' && mixed.text === 'User-agent: *\nDisallow: /a\nDisallow: /b\nDisallow: /c\nDisallow: /d\n', JSON.stringify(mixed))
    const engine = readFileSync(join(ROOT, 'lib/free-check/site-fetch.ts'), 'utf8')
    check(`the engine still keeps the first ${ROBOTS_TEXT_LIMIT} characters of a text (ROBOTS_TEXT_LIMIT mirrors it)`,
      engine.includes(`text: text.slice(0, ${ROBOTS_TEXT_LIMIT.toLocaleString('en-US').replace(/,/g, '_')})`))
  }

  console.log('\nMATCHING) RFC 9309 patterns')
  {
    const cases: [string, string, boolean][] = [
      [star('Disallow: /private'), '/private/x', false],
      [star('Disallow: /private'), '/privately', false],
      [star('Disallow: /private'), '/public', true],
      [star('Disallow: /*.pdf$'), '/files/a.pdf', false],
      [star('Disallow: /*.pdf$'), '/files/a.pdf?x=1', true],
      [star('Disallow: /*.pdf'), '/files/a.pdf?x=1', false],
      [star('Disallow: /a*b*c'), '/a-x-b-y-c-z', false],
      [star('Disallow: /a*b*c'), '/a-x-c-y-b', true],
      [star('Disallow: /a*b$'), '/ab-b', false],
      [star('Disallow: /a*b$'), '/ab-bc', true],
      [star('Disallow: /*$'), '/anything', false],
      [star('Disallow: /$'), '/', false],
      [star('Disallow: /$'), '/x', true],
      [star('Disallow: /shop', 'Allow: /shop/public'), '/shop/public/x', true],
      [star('Disallow: /shop', 'Allow: /shop/public'), '/shop/private', false],
      [star('Allow: /page', 'Disallow: /page'), '/page', true],
      [star('Disallow: /**/x'), '/a/b/x', false],
      [star('Disallow:'), '/anything', true],
      [star('Disallow: /%E2%9C%93'), '/\u2713/x', false],
      ['User-agent: gotopfreecheck\nDisallow: /ours\n', '/ours', false],
      ['User-agent: otherbot\nDisallow: /\n', '/x', true],
      ['User-Agent : *\nDISALLOW : /caps # comment\n', '/caps', false],
      ['User-agent: *\rDisallow: /cr\r', '/cr', false],
      [star('Disallow: /'), '/robots.txt', true],
    ]
    const wrong = cases.filter(([txt, path, want]) => allows(txt, path) !== want).map(([txt, path]) => `${JSON.stringify(txt)} ${path}`)
    check(`${cases.length} worked examples`, wrong.length === 0, wrong.join(' ; '))

    const next = rng(9309)
    const pick = (alphabet: string, max: number) => Array.from({ length: 1 + Math.floor(next() * max) }, () => alphabet[Math.floor(next() * alphabet.length)]).join('')
    let compared = 0
    const differ: string[] = []
    for (let i = 0; i < 4000; i++) {
      const rules = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
        allow: next() < 0.4,
        pattern: `/${pick('ab/*', 7)}${next() < 0.3 ? '$' : ''}`,
      }))
      const txt = star(...rules.map((r) => `${r.allow ? 'Allow' : 'Disallow'}: ${r.pattern}`))
      for (let j = 0; j < 4; j++) {
        const path = `/${pick('ab/', 9)}`
        compared++
        if (allows(txt, path) !== referenceAllows(rules, path)) differ.push(`${JSON.stringify(rules)} ${path}`)
      }
    }
    check(`the same verdict as the RegExp it replaced on ${compared} random rules and paths`, differ.length === 0, differ.slice(0, 3).join(' ; '))
  }

  console.log('\nCAPS) a rule too long or too wild is not matched as written')
  {
    const wild = `/${'x*'.repeat(MAX_RULE_WILDCARDS + 1)}`
    check('an Allow over the wildcard cap is dropped: the Disallow under it governs', !allows(star('Disallow: /x', `Allow: ${wild}`), `/${'x'.repeat(40)}`))
    const long = `/${'y'.repeat(MAX_RULE_CHARS + 10)}`
    check('an Allow over the length cap is dropped too', !allows(star('Disallow: /y', `Allow: ${long}`), long))
    check('an Allow at both caps is kept',
      allows(star('Disallow: /x', `Allow: /${'x*'.repeat(MAX_RULE_WILDCARDS)}`), `/${'x'.repeat(40)}`) &&
      allows(star('Disallow: /y', `Allow: /${'y'.repeat(MAX_RULE_CHARS - 1)}`), `/${'y'.repeat(MAX_RULE_CHARS + 5)}`))
    // A capped Disallow must keep out every path the whole rule would.
    const next = rng(512)
    const leaks: string[] = []
    for (let i = 0; i < 300; i++) {
      const n = MAX_RULE_WILDCARDS + 1 + Math.floor(next() * 20)
      const pattern = `/${Array.from({ length: n }, () => (next() < 0.5 ? 'a' : 'b')).join('*')}${next() < 0.5 ? '$' : ''}`
      const path = `/${Array.from({ length: n + Math.floor(next() * 10) }, () => (next() < 0.5 ? 'a' : 'b')).join('')}`
      if (referenceMatches(pattern, path) && allows(star(`Disallow: ${pattern}`), path)) leaks.push(`${pattern} ${path}`)
    }
    check('a Disallow over the wildcard cap keeps out every path the whole rule would (300 random rules)', leaks.length === 0, leaks.slice(0, 2).join(' ; '))
    check('a Disallow over the length cap keeps out what its beginning names', !allows(star(`Disallow: ${long}`), `${long}/x`) && !allows(star(`Disallow: ${long}`), `/${'y'.repeat(MAX_RULE_CHARS)}`))
    check('a capped Disallow keeps its length as written against an Allow', !allows(star(`Disallow: ${long}`, `Allow: /${'y'.repeat(MAX_RULE_CHARS - 1)}`), long))
  }

  console.log(`\nTIME) a hostile file costs well under ${LIMIT_MS} ms`)
  {
    const reviewer = parseRobots(star('Disallow: /*a*a*a*a*a*a*a*a*a*a*b'))
    timed(
      'the review\'s case: ten `*` against a 40-character path',
      () => robotsAllows(reviewer, new URL(`https://shop.example/${'a'.repeat(28)}`)),
      () => robotsAllows(reviewer, new URL(`https://shop.example/${'a'.repeat(39)}`)),
    )
    const atCap = (n: number) =>
      parseRobots(
        [
          'User-agent: *',
          ...Array.from({ length: n }, (_, i) => `Disallow: /${`*${'a'.repeat(28)}`.repeat(MAX_RULE_WILDCARDS)}${i}b`),
          'User-agent: gotopfreecheck',
          ...Array.from({ length: n }, (_, i) => `Allow: /${'*a'.repeat(MAX_RULE_WILDCARDS)}${i}$`),
        ].join('\n'),
      )
    const small = atCap(2)
    const big = atCap(200)
    timed(
      '400 rules at both caps against a 2000-character path',
      () => robotsAllows(small, new URL(`https://shop.example/${'a'.repeat(30)}`)),
      () => robotsAllows(big, new URL(`https://shop.example/${'a'.repeat(2000)}`)),
    )
    const overCap = parseRobots(star(`Disallow: /${'*a'.repeat(5000)}b`))
    timed(
      'one Disallow of 5000 `*` against a 2000-character path',
      () => robotsAllows(overCap, new URL(`https://shop.example/${'a'.repeat(30)}`)),
      () => robotsAllows(overCap, new URL(`https://shop.example/${'a'.repeat(2000)}`)),
    )
    // Lines built to make a line-level pattern backtrack: a run of `#`, or of
    // spaces then letters, before a line separator the split does not cut on.
    const hashes = (n: number) => `User-agent: *\n${'#'.repeat(n)}\u2028Disallow: /x\n`
    const padded = (n: number) => `User-agent: *\nDisallow:${' '.repeat(n)}${'a'.repeat(n)}\u2028x\n`
    timed('parsing ~100 000 `#` before a U+2028', () => parseRobots(hashes(15_000)), () => parseRobots(hashes(ROBOTS_TEXT_LIMIT - 40)))
    timed('parsing a value of ~50 000 spaces then letters before a U+2028', () => parseRobots(padded(8_000)), () => parseRobots(padded(49_000)))
    // The free check's own readers get the text robotsAnswer gives (a1 hands
    // it to the engine): with LF line ends, their patterns stay linear.
    const engineRead = (n: number) => {
      const answer = robotsAnswer({ status: 200, text: `User-agent: *\n${'#'.repeat(n)}\u2028Sitemap: /s.xml\r${'#'.repeat(n)}\rDisallow: /\n` }, true)
      const text = answer.state === 'rules' ? answer.text : ''
      readRobots(text)
      sitemapsFromRobots(text)
    }
    timed("the free check's readRobots and sitemapsFromRobots on a rules text of ~100 000 `#`", () => engineRead(15_000), () => engineRead(ROBOTS_TEXT_LIMIT / 2 - 40))
  }

  finish()
}

main()
export {}
