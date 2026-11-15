/**
 * The "waiting for you" read is shared between the dashboard card and the
 * sidebar rail. It was already written to share one request and one answer —
 * and production still read GET /api/projects/[id]/waiting twice per load,
 * with GET /api/site-health/fixes behind it, well inside its 20s freshness
 * window (measured 2026-11-15: 1966ms and 5632ms).
 *
 * The cause is where the map lived: `const cache = new Map()` is per module
 * INSTANCE, and a 'use client' module imported from two route segments can be
 * emitted into two chunks. This suite holds the fix in place — the cache hangs
 * off globalThis, so every copy of the module reads one map.
 *
 * Source guard, with its own mutation control. The behaviour of the read
 * itself (freshness, inflight sharing, failure as "nothing waiting") is
 * lib/nudges/__qa__/waiting-nudges.qa.ts's subject and is not repeated here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
/** Comments are not code: the repo's suites match the source with them removed. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\nA) The waiting cache is shared across module copies')
{
  const src = strip(read('components/nudges/useWaiting.ts'))
  check('A1: no module-scope cache map', !/^const cache = new Map/m.test(src))
  check('A2: the map is taken from globalThis', /globalThis/.test(src) && /function cacheMap\(\)/.test(src))
  check('A3: the read goes through the accessor', /const cache = cacheMap\(\)/.test(src))
  check('A4-MUT: the A1 pattern DOES match the shape it forbids, so A1 is not vacuous',
    /^const cache = new Map/m.test('const cache = new Map<string, Entry>()'))
}

console.log('\nB) The same holds for the seeding-scan registry it mirrors')
{
  const src = strip(read('lib/client/seed-read.ts'))
  check('B1: no module-scope entries map', !/^const entries = new Map/m.test(src))
  check('B2: the map is taken from globalThis', /globalThis/.test(src) && /function registry\(\)/.test(src))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}
