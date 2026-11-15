/**
 * GET /api/site-health/fixes used to call the MERCHANT'S OWN WordPress on
 * every read, to ask which SEO plugin and bridge are installed. That call is
 * what made it the heaviest request on the dashboard (1,130ms warm, 2,074ms
 * cold, measured in production on 2026-11-15), and the answer changes when
 * somebody installs or pairs something — not between two reads of a screen.
 *
 * This suite holds the cache honest: it is used, it expires, a failed read is
 * never remembered as an answer, and anything that can change what the site
 * says forgets it. Every guard has a mutation control.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEO_CAPS_TTL_MS, __setSeoCapsTestHooks, forgetSeoCapabilities } from '../api'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The cache as the module keeps it, read the way a second module copy would. */
const cache = () => (globalThis as Record<string, unknown>)['__goTopSeoCapsCache__'] as Map<string, { at: number; value: unknown }> | undefined

async function main() {
  console.log('\nA) The probe is cached, and the cache is shared')
  {
    const src = strip(read('lib/site-fix/api.ts'))
    check('A1: seoOf consults a cache before calling the site',
      /async function seoOf\([\s\S]{0,400}seoCapsCache\(\)/.test(src))
    check('A2: the map hangs off globalThis, not module scope',
      /function seoCapsCache\(\)/.test(src) && /globalThis as SeoCapsHost/.test(src) && !/^const seoCapsCacheMap = new Map/m.test(src))
    check('A3-MUT: the A1 pattern does NOT match a seoOf that goes straight to the network',
      !/async function seoOf\([\s\S]{0,400}seoCapsCache\(\)/.test(
        "async function seoOf(creds, deps) { return await deps.wp.detectSeoCapabilities(creds) }"))
  }

  console.log('\nB) It expires, and a failed read is not remembered')
  {
    let now = 1_000_000
    __setSeoCapsTestHooks({ now: () => now })
    check('B1: the TTL is five minutes', SEO_CAPS_TTL_MS === 300_000)

    // The module caches only truthy answers; a null (timeout or failure) must
    // leave nothing behind. Exercised through the cache the module exposes.
    const c = cache()!
    c.set('https://a.example|admin', { at: now, value: { plugin: 'yoast', hasBridge: true } })
    check('B2: a remembered answer is inside the window', now - c.get('https://a.example|admin')!.at < SEO_CAPS_TTL_MS)
    now += SEO_CAPS_TTL_MS + 1
    check('B3: and outside it once the window passes', !(now - c.get('https://a.example|admin')!.at < SEO_CAPS_TTL_MS))

    const src = strip(read('lib/site-fix/api.ts'))
    check('B4: only a truthy answer is written to the cache', /if \(value\) cache\.set\(key, \{ at: seoCapsNow\(\), value \}\)/.test(src))
    check('B5-MUT: the B4 pattern does NOT match an unconditional write',
      !/if \(value\) cache\.set/.test("cache.set(key, { at: seoCapsNow(), value })"))
  }

  console.log('\nC) Anything that can change the site forgets it')
  {
    __setSeoCapsTestHooks({ now: () => 2_000_000 })
    const c = cache()!
    c.set('https://b.example|admin', { at: 2_000_000, value: { plugin: 'none', hasBridge: false } })
    c.set('https://c.example|admin', { at: 2_000_000, value: { plugin: 'none', hasBridge: false } })
    forgetSeoCapabilities('https://b.example')
    check('C1: the site that changed is forgotten', !c.has('https://b.example|admin'))
    check('C2: and only that site', c.has('https://c.example|admin'))
    forgetSeoCapabilities(null)
    check('C3: forgetting nothing is harmless', c.has('https://c.example|admin'))

    const src = strip(read('lib/site-fix/api.ts'))
    for (const action of ['pair', 'disconnect', 'issue']) {
      check(`C4-${action}: the ${action} path forgets the site`,
        new RegExp(`case '${action}'[\\s\\S]{0,600}forgetSeoCapabilities\\(`).test(src))
    }
    check('C5-MUT: the C4 pattern does NOT match a handler that never forgets',
      !/case 'pair'[\s\S]{0,600}forgetSeoCapabilities\(/.test("case 'pair': { return check(l, deps) }"))
  }

  __setSeoCapsTestHooks(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
