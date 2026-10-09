/**
 * The first article gets internal links — offline, pure + source guards.
 *
 * The owner reported internal links appearing "sometimes". The dominant cause
 * was not the selector: link targets come only from `site_page_map`, and that
 * table was filled by exactly one thing — a human opening the Existing Content
 * screen. The first article is written inline the moment the owner approves the
 * strategy, long before anyone opens that screen, so it came out with no links
 * at all, and the step's logging suppressed the very reason (`no_map`).
 *
 * This covers the three parts of the fix: the freshness decision, the ordering
 * (map, then article) on the first-approval path, and the two candidate/logging
 * corrections. Each group ends with a MUTATION CONTROL.
 */
import { isFreshEnough, ENSURE_MAP_FRESH_MS } from '../ensure-site-map'
import { autoLinkCandidates } from '../../auto-internal-links/select'
import { code } from '../../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const NOW = Date.parse('2026-10-09T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const row = (o: Record<string, unknown>) => ({ status: 'completed', finished_at: ago(3600_000), urls_found: 12, ...o })

async function main() {
  console.log('A) when a stored mapping is good enough to link against')
  {
    check('a fresh completed mapping with pages is good enough', isFreshEnough(row({}), NOW))
    check('a partial mapping with pages is good enough', isFreshEnough(row({ status: 'partial' }), NOW))
    // A failed run keeps the previous run's entries, which the link step uses.
    check('a failed mapping that still has pages is good enough', isFreshEnough(row({ status: 'failed' }), NOW))
    check('a RUNNING mapping is never good enough (nothing finished yet)', !isFreshEnough(row({ status: 'running' }), NOW))
    check('a mapping with zero pages is not good enough', !isFreshEnough(row({ urls_found: 0 }), NOW))
    check('a mapping with no page count is not good enough', !isFreshEnough(row({ urls_found: null }), NOW))
    check('no mapping at all is not good enough', !isFreshEnough(null, NOW) && !isFreshEnough(undefined, NOW))
    check('a mapping with no finish time is not good enough', !isFreshEnough(row({ finished_at: null }), NOW))
    check('a mapping with an unparseable finish time is not good enough', !isFreshEnough(row({ finished_at: 'not-a-date' }), NOW))
    check('just inside the freshness window is good enough', isFreshEnough(row({ finished_at: ago(ENSURE_MAP_FRESH_MS - 60_000) }), NOW))
    check('just outside the freshness window is NOT good enough', !isFreshEnough(row({ finished_at: ago(ENSURE_MAP_FRESH_MS + 60_000) }), NOW))

    // MUTATION CONTROL — status alone, the pre-fix style of decision.
    const statusOnly = (r: { status?: string | null }) => r.status === 'completed' || r.status === 'partial'
    check('MUTATION: deciding on status alone accepts a mapping with zero pages (guard is real)', statusOnly(row({ urls_found: 0 })) && !isFreshEnough(row({ urls_found: 0 }), NOW))
  }

  console.log('B) the mapping runs BEFORE the first article, and cannot cost the article')
  {
    const src = code('lib/content/strategy/schedule-http.ts')
    check('the first-approval path can prepare links', /prepareLinks\?:/.test(src))
    check('prepareLinks is AWAITED', /await deps\.prepareLinks\(/.test(src))
    const later = src.slice(src.indexOf('deps.later(async'))
    const prepAt = later.indexOf('prepareLinks')
    const writeAt = later.indexOf('deps.writeFirst')
    check('the mapping is ordered before the article, not after', prepAt >= 0 && writeAt >= 0 && prepAt < writeAt, `prepare@${prepAt} write@${writeAt}`)
    // The article must survive a mapping failure: its own try/catch, and the
    // prepare call is not inside the writeFirst try.
    check('a mapping failure is caught on its own, so the article is still written', /prepareLinks\([\s\S]{0,200}?\} catch[\s\S]{0,400}?\}\s*\n\s*\}\s*\n\s*try \{\s*\n\s*await deps\.writeFirst/.test(later))
    check('both still run after the answer is sent (inside later)', /deps\.later\(async/.test(src))

    const route = code('app/api/content/strategy/schedule/route.ts')
    check('the route wires the real mapping in', /prepareLinks: \(admin, scope\) => ensureSiteMapForProject\(/.test(route))
    check('the route reuses the real crawl, with no second mapping implementation', /liveWalk/.test(route) && /liveWordPress/.test(route))

    // MUTATION CONTROL — the pre-fix ordering had no prepare step at all.
    check('MUTATION: a later() body with only writeFirst has no mapping before it (guard is real)',
      !/prepareLinks/.test('deps.later(async () => { try { await deps.writeFirst(auth.admin, firstItemId) } catch (e) {} })'))
  }

  console.log('C) an http-only site yields candidates instead of nothing')
  {
    const entries = [
      { u: 'http://shop.example.co.il/guide/how-to-choose', t: 'How to choose a cleaner' },
      { u: 'http://shop.example.co.il/guide/office-tips', t: 'Office cleaning tips' },
    ]
    const article = { title: 'Something else entirely', slug: 'other' }
    const asHttps = autoLinkCandidates(entries, { host: 'shop.example.co.il' }, article)
    const asHttp = autoLinkCandidates(entries, { host: 'shop.example.co.il', allowHttp: true }, article)
    check('without allowHttp an http site yields ZERO candidates (the old behaviour)', asHttps.length === 0)
    check('with allowHttp the same pages become candidates', asHttp.length === 2, `${asHttp.length}`)
    // An https site must not start accepting http pages: that is a downgrade.
    const mixed = [{ u: 'https://shop.example.co.il/guide/a', t: 'Page A' }, { u: 'http://shop.example.co.il/guide/b', t: 'Page B' }]
    const httpsOnly = autoLinkCandidates(mixed, { host: 'shop.example.co.il' }, article)
    check('an https site still refuses http pages (no silent downgrade)', httpsOnly.length === 1 && httpsOnly[0].url.startsWith('https://'))
    check('allowHttp defaults to off, so https projects are unchanged', autoLinkCandidates(mixed, { host: 'shop.example.co.il' }, article).length === 1)

    const step = code('lib/content/auto-internal-links/step.ts')
    check('allowHttp is derived from the MAPPED site, never hard-coded on', /allowHttp: \/\^http:\\\/\\\/\/i\.test\(row\.site_url/.test(step))
  }

  console.log('D) the two common zero-link reasons are no longer silent')
  {
    const step = code('lib/content/auto-internal-links/step.ts')
    check('only the kill switch is suppressed in the log', /result\.reason !== 'disabled'/.test(step))
    check("'no_map' is no longer in a suppression list", !/\['disabled', 'no_map', 'none_relevant'\]/.test(step))
    check("'none_relevant' is no longer suppressed", !/includes\(result\.reason\)/.test(step))

    // MUTATION CONTROL — the pre-fix filter hid exactly the two common reasons.
    const old = (reason: string) => !['disabled', 'no_map', 'none_relevant'].includes(reason)
    check('MUTATION: the old filter logged neither no_map nor none_relevant (guard is real)', !old('no_map') && !old('none_relevant') && old('stale_map'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
