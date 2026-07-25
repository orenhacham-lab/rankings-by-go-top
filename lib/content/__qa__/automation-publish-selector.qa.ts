/**
 * Area E — scheduled-publish selector/claim consistency + per-pool isolation.
 *
 * Proves the invariant whose violation caused the stuck-pool bug: the runner's
 * pickForPublish status filter MUST be a subset of publishPoolItem's atomic
 * claim filter. When it isn't, an item the picker selects but the claim rejects
 * (a publish-blocked quality_check_failed item, article_id present) is re-picked
 * on every run, next_publish_at never advances, and every READY item behind it
 * (later position) is starved forever.
 *
 * Also proves each pool iteration is wrapped in try/catch so one pool's
 * unexpected throw cannot abort the whole run and starve later pools.
 *
 * Source-contract (not behavioral): the runner is DB-coupled, so the durable
 * guarantee is the picker/claim filter equality, enforced directly on source.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
// Strip block + line comments so comment prose can never satisfy a regex.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// Pull the status-array literal out of a `.in('status', [ ... ])` call.
function inStatuses(src: string, afterIndex = 0): string[] | null {
  const m = src.slice(afterIndex).match(/\.in\(\s*'status'\s*,\s*\[([^\]]*)\]/)
  if (!m) return null
  return m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}
const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x))
const sameSet = (a: string[], b: string[]) => a.length === b.length && subset(a, b) && subset(b, a)

function main() {
  console.log('AREA E) publish picker/claim consistency + per-pool isolation')

  const runner = strip(read('../automation/runner.ts'))
  const wpPub = strip(read('../automation/publish-item.ts'))
  const shopPub = strip(read('../automation/publish-item-shopify.ts'))

  // 1 — pickForPublish selects exactly generated|failed (NOT quality_check_failed).
  const pickIdx = runner.indexOf('async function pickForPublish')
  check('pickForPublish is present', pickIdx >= 0)
  const pickStatuses = inStatuses(runner, pickIdx)
  check('pickForPublish selects exactly [generated, failed]', !!pickStatuses && sameSet(pickStatuses!, ['generated', 'failed']),
    pickStatuses ? pickStatuses.join('|') : 'not found')
  check('pickForPublish does NOT select quality_check_failed', !!pickStatuses && !pickStatuses!.includes('quality_check_failed'))

  // 2 — the atomic publish claim filter in BOTH backends.
  const wpClaimIdx = wpPub.indexOf("status: 'publishing'")
  const wpClaim = inStatuses(wpPub, wpClaimIdx)
  check('WordPress publish claim gated on [generated, failed]', !!wpClaim && sameSet(wpClaim!, ['generated', 'failed']),
    wpClaim ? wpClaim.join('|') : 'not found')
  const shopClaimIdx = shopPub.indexOf("status: 'publishing'")
  const shopClaim = inStatuses(shopPub, shopClaimIdx)
  check('Shopify publish claim gated on [generated, failed]', !!shopClaim && sameSet(shopClaim!, ['generated', 'failed']),
    shopClaim ? shopClaim.join('|') : 'not found')

  // 3 — THE invariant: everything the picker returns is claimable by both backends.
  check('INVARIANT: pickForPublish statuses ⊆ WordPress claim statuses',
    !!pickStatuses && !!wpClaim && subset(pickStatuses!, wpClaim!))
  check('INVARIANT: pickForPublish statuses ⊆ Shopify claim statuses',
    !!pickStatuses && !!shopClaim && subset(pickStatuses!, shopClaim!))

  // 4 — per-pool isolation: the pool loop body is wrapped in try/catch that
  //     records a failure and continues (never aborts the whole run).
  const loopIdx = runner.indexOf('for (const pool of poolRows)')
  check('pool loop is present', loopIdx >= 0)
  const afterLoop = runner.slice(loopIdx, loopIdx + 200)
  check('pool loop body opens a try block immediately', /for \(const pool of poolRows\)\s*\{\s*try\s*\{/.test(afterLoop))
  // The catch records a failure + keeps the run going (has a diagnostic + failures++).
  const loopBody = runner.slice(loopIdx)
  check('pool loop has a catch that increments summary.failures', /catch\s*\([^)]*\)\s*\{[\s\S]*?summary\.failures\+\+/.test(loopBody))
  check('pool-error path still pushes a diagnostic (visible, not swallowed)', /catch\s*\([^)]*\)\s*\{[\s\S]*?summary\.diagnostics\.push/.test(loopBody))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
