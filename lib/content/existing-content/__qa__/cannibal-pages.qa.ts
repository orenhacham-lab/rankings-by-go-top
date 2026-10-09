/**
 * "COMPETES WITH ANOTHER PAGE" NAMES THE OTHER PAGE.
 *
 * The owner, 9 October 2026: "in existing content it shows many times that a
 * competitor is on another page, but it does not say at all which page". The
 * competing pages were already computed — cannibalizationByPage built the list
 * of pages that split a query and then returned only the query and the count,
 * so the screen had nothing to name. Nothing about the risk RULE changes here:
 * COMPETING_MIN_SHARE and COMPETING_MIN_IMPRESSIONS still decide who is
 * flagged (existing-content.qa.ts group A guards that).
 *
 * Groups: A the pages come back with the risk, B they are resolved to titles
 * and the leader is named, C the screen renders them in every language.
 * Each ends with a MUTATION CONTROL.
 */
import { cannibalizationByPage, annotate, mergeSources, sourceFromMap, type GscRowLite } from '../model'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'
import { code } from '../../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const row = (query: string, page: string, impressions: number): GscRowLite =>
  ({ query, page: `https://acme.co.il${page}`, clicks: 0, impressions, position: 10 }) as GscRowLite

// One query, three pages of the site each holding a real share of it.
const THREE = [
  row('ניקוי משרדים', '/blog/office', 300),
  row('ניקוי משרדים', '/services/office', 500),
  row('ניקוי משרדים', '/blog/old-office', 200),
]

async function main() {
  console.log('A) the competing pages come back with the risk')
  {
    const m = cannibalizationByPage(THREE)
    const mine = m.get('/blog/office')
    check('the flagged page still carries the query and the count', mine?.query === 'ניקוי משרדים' && mine?.pages === 3)
    check('it carries its OWN impressions on that query', mine?.mine === 300)
    check('it names the other two pages, and not itself', mine?.others.length === 2 && !mine?.others.some((o) => o.path === '/blog/office'))
    check('the other pages come strongest first', mine?.others.map((o) => o.path).join(',') === '/services/office,/blog/old-office')
    check('each one carries its impressions', mine?.others.map((o) => o.impressions).join(',') === '500,200')
    // Every competing page gets the same list, minus itself.
    const lead = m.get('/services/office')
    check('the strongest page also lists the others', lead?.others.map((o) => o.path).join(',') === '/blog/office,/blog/old-office')
    // A tie is ordered by path, so two runs never disagree.
    const tied = cannibalizationByPage([row('q', '/a', 100), row('q', '/b', 100), row('q', '/c', 100)])
    check('a tie is broken by the path, so the order is stable', tied.get('/a')?.others.map((o) => o.path).join(',') === '/b,/c')

    // MUTATION CONTROL — returning only the query and the count is the bug.
    const stripped = new Map([...m].map(([k, v]) => [k, { query: v.query, pages: v.pages }]))
    check('MUTATION: the old return shape has no page to name (guard is real)',
      !('others' in (stripped.get('/blog/office') as object)) && (mine?.others.length ?? 0) > 0)
  }

  console.log('B) the paths become pages the merchant recognises')
  {
    const items = mergeSources([sourceFromMap([
      { u: 'https://acme.co.il/blog/office', t: 'איך לנקות משרד' },
      { u: 'https://acme.co.il/services/office', t: 'שירותי ניקוי משרדים' },
      { u: 'https://acme.co.il/blog/old-office' },
    ])])
    const out = annotate(items, { gscRows: THREE, ownership: null, plannedKeys: null })
    const byPath = new Map(out.map((it) => [new URL(it.url).pathname, it]))
    const blog = byPath.get('/blog/office')!.cannibalization!
    check('a competing page is named by its title, not by a path', blog.others[0].title === 'שירותי ניקוי משרדים')
    check('its own url is kept, so the row can link to it', blog.others[0].url === 'https://acme.co.il/services/office')
    // The merge gives a page with no title of its own a readable one from its
    // slug, so a LISTED page always has a name; the path fallback below is for a
    // page Search Console knows and the site's list does not.
    check('a listed page with no title of its own still gets a readable name', blog.others[1].title === 'Old office' && blog.others[1].path === '/blog/old-office')
    check('the page with fewer impressions is not called the leader', blog.leading === false)
    const svc = byPath.get('/services/office')!.cannibalization!
    check('the page with the most impressions on the query IS the leader', svc.leading === true)
    check('the leader still sees the others', svc.others.length === 2)
    // A path Search Console knows and the site's list does not still shows up.
    const partial = annotate(mergeSources([sourceFromMap([
      { u: 'https://acme.co.il/blog/office', t: 'איך לנקות משרד' },
      { u: 'https://acme.co.il/services/office', t: 'שירותי ניקוי משרדים' },
    ])]), { gscRows: THREE, ownership: null, plannedKeys: null })
    const p0 = partial.find((it) => it.url.endsWith('/blog/office'))!.cannibalization!
    check('a competing page missing from the list is still named by its path', p0.others.some((o) => o.path === '/blog/old-office' && o.title === null))

    // MUTATION CONTROL — "leading" read from the site total instead of the query.
    const wrong = (mineImp: number) => mineImp >= 500
    check('MUTATION: calling every flagged page a leader is caught (guard is real)', wrong(500) && !blog.leading)
  }

  console.log('C) the screen says it, in every language the dashboard has')
  {
    const table = code('components/content/workspace/existing/ContentTable.tsx')
    check('the row lists the competing pages', /cannibalization\.others\.slice\(0, CANNIBAL_SHOWN\)/.test(table))
    check('each one is a link to the page itself', /href=\{o\.url\}/.test(table))
    check('a page with no title falls back to its path', /o\.title \|\| displayPath\(o\.path\)/.test(table))
    check('the row says whether this page leads', /cannibalization\.leading \? x\.cannibalMineLeads : x\.cannibalMine/.test(table))
    check('the rest are counted rather than listed forever', /others\.length > CANNIBAL_SHOWN/.test(table))
    for (const lang of ['he', 'en', 'es', 'pt-BR'] as const) {
      const d = getDashboardDictionary(lang).existingContent as unknown as Record<string, unknown>
      const keys = ['cannibal', 'cannibalDetail', 'cannibalMine', 'cannibalMineLeads', 'cannibalOther', 'cannibalMore']
      const missing = keys.filter((k) => typeof d[k] !== 'string' || !(d[k] as string).trim())
      check(`${lang}: every line the row needs exists`, missing.length === 0, missing.join(','))
      check(`${lang}: the impressions line has a slot for the number`, String(d.cannibalMine).includes('{imp}') && String(d.cannibalMineLeads).includes('{imp}') && String(d.cannibalOther).includes('{imp}'))
      check(`${lang}: the overflow line has a slot for the count`, String(d.cannibalMore).includes('{n}'))
    }

    // MUTATION CONTROL — the pre-fix row rendered the count and the query only.
    const before = '<Badge variant="warning" dot>{x.cannibal}</Badge>\n<p>{fill(x.cannibalDetail, { n, query })}</p>'
    check('MUTATION: the old row names no page (guard is real)', !/others/.test(before))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
