/**
 * The open dataset at /api/public/ai-crawlers — the contract that what we give
 * away is true, is attributable, and stays safe to leave unauthenticated.
 *
 * This is published under CC BY 4.0 for other people's sites and scripts to
 * consume. Three things therefore have to hold, and each is pinned here with a
 * MUTATION CONTROL beside it:
 *
 *   A) every row cites the operator's own documentation, with a date;
 *   B) the shape a consumer parses does not drift silently;
 *   C) the route stays free of anything that makes a public endpoint unsafe —
 *      no input read into a fetch, no store, no secret — and stays cacheable,
 *      which is what makes "no rate limit" the right call rather than an
 *      oversight.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AI_CRAWLER_CANDIDATES,
  AI_CRAWLER_DATASET,
  AI_CRAWLER_DATASET_LICENSE,
  AI_CRAWLER_DATASET_VERSION,
} from '../dataset'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source guards match on code, so comments are stripped first (repo convention). */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PURPOSES = ['train', 'answer', 'search', 'ads', 'preview', 'agent']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function main() {
  console.log('\nA) every row is sourced')
  {
    check('A1: the dataset is not empty', AI_CRAWLER_DATASET.length >= 20, `${AI_CRAWLER_DATASET.length} rows`)
    const undocumented = AI_CRAWLER_DATASET.filter((c) => !/^https:\/\//.test(c.docs))
    check('A2: every row links an operator page over https', undocumented.length === 0,
      undocumented.map((c) => c.token).join(', '))
    const undated = AI_CRAWLER_DATASET.filter((c) => !ISO_DATE.test(c.verified))
    check('A3: every row carries the date that page was read', undated.length === 0,
      undated.map((c) => c.token).join(', '))
    check('A4: no row claims a purpose outside the six', AI_CRAWLER_DATASET.every((c) => PURPOSES.includes(c.purpose)))
    check('A5: no duplicate token', new Set(AI_CRAWLER_DATASET.map((c) => c.token.toLowerCase())).size === AI_CRAWLER_DATASET.length)
    check('A6: a token with no operator page is a candidate, not a row',
      AI_CRAWLER_CANDIDATES.length > 0 &&
        AI_CRAWLER_CANDIDATES.every((c) => c.whyHere.length > 20) &&
        AI_CRAWLER_CANDIDATES.every((c) => !AI_CRAWLER_DATASET.some((d) => d.token.toLowerCase() === c.token.toLowerCase())))
    // The claims a reader of our page would otherwise get backwards.
    const extended = AI_CRAWLER_DATASET.filter((c) => c.token === 'Google-Extended' || c.token === 'Applebot-Extended')
    check('A7: the two control-only tokens are marked as crawling nothing',
      extended.length === 2 && extended.every((c) => c.crawls === false && (c.note ?? '').length > 0))
    check('A8: every agent whose operator documents it may ignore robots.txt says why',
      AI_CRAWLER_DATASET.filter((c) => !c.respectsRobots).length >= 3 &&
        AI_CRAWLER_DATASET.filter((c) => !c.respectsRobots).every((c) => (c.note ?? '').toLowerCase().includes('robots.txt')))

    // Added 11.11.2026, after two rows were read that day while the version
    // still said 2026.11.01 and both prose explanations still listed five
    // purposes. A consumer that caches on the version never refetched, and a
    // reader who met an `agent` row found no sentence telling them what it is.
    // Both are drift that no earlier guard here could see.
    const newestRead = AI_CRAWLER_DATASET.map((c) => c.verified).sort().at(-1) ?? ''
    check('A9: the version is the newest read date in the dataset, so a cache on it expires when a row changes',
      AI_CRAWLER_DATASET_VERSION === newestRead.replace(/-/g, '.'), `version ${AI_CRAWLER_DATASET_VERSION}, newest read ${newestRead}`)
    const routeNotes = read('app/api/public/ai-crawlers/route.ts')
    const openapiText = read('lib/ai-crawlers/openapi.ts')
    const used = [...new Set(AI_CRAWLER_DATASET.map((c) => c.purpose))]
    const unexplained = used.filter((p) => !routeNotes.includes(`\`${p}\``) || !openapiText.includes(`\`${p}\``))
    check('A10: every purpose a row uses is explained in the payload notes and in the OpenAPI description',
      unexplained.length === 0, unexplained.join(', '))

    // MUTATION CONTROLS: the same assertions against a deliberately broken row.
    const broken = [...AI_CRAWLER_DATASET, { ...AI_CRAWLER_DATASET[0], token: 'FakeBot', docs: 'see their blog', verified: 'last week' }]
    check('A2-MUT: a row sourced to a blog instead of the operator would fail A2',
      broken.some((c) => !/^https:\/\//.test(c.docs)))
    check('A3-MUT: a row with a prose date would fail A3', broken.some((c) => !ISO_DATE.test(c.verified)))
    const dupes = [...AI_CRAWLER_DATASET.map((c) => c.token), 'gptbot']
    check('A5-MUT: a case-variant duplicate would fail A5', new Set(dupes.map((t) => t.toLowerCase())).size !== dupes.length)
    check('A9-MUT: leaving the version behind a newer row would fail A9',
      '2026.11.01' !== newestRead.replace(/-/g, '.'))
    const noAgent = routeNotes.split('`agent`').join('`crawler`')
    check('A10-MUT: dropping a purpose from the notes would fail A10',
      used.some((p) => !noAgent.includes(`\`${p}\``)))
  }

  console.log('\nB) the shape a consumer parses')
  {
    const route = strip(read('app/api/public/ai-crawlers/route.ts'))
    check('B1: the payload names its version, licence and source',
      route.includes('version: AI_CRAWLER_DATASET_VERSION') &&
        route.includes('license: AI_CRAWLER_DATASET_LICENSE') &&
        route.includes("source: 'https://www.gotopseo.com/en/ai-crawlers'"))
    check('B2: candidates are their own field, never merged into crawlers',
      route.includes('crawlers: AI_CRAWLER_DATASET') && route.includes('candidates: AI_CRAWLER_CANDIDATES'))
    check('B3: the version is datestamped so a consumer can cache on it', /^\d{4}\.\d{2}\.\d{2}$/.test(AI_CRAWLER_DATASET_VERSION))
    check('B4: the licence is CC BY 4.0, with a URL and the attribution to give',
      AI_CRAWLER_DATASET_LICENSE.id === 'CC-BY-4.0' &&
        AI_CRAWLER_DATASET_LICENSE.url.startsWith('https://creativecommons.org/') &&
        AI_CRAWLER_DATASET_LICENSE.attribution.includes('gotopseo.com'))
    check('B5: CSV is offered for the people who want a spreadsheet',
      route.includes("format === 'csv'") && route.includes('text/csv'))
    check('B6: CSV quotes every field and doubles an inner quote (RFC 4180)',
      route.includes('replace(/"/g, \'""\')'))
    check('B7: a browser on someone else’s site can fetch it', route.includes("'access-control-allow-origin': '*'"))
    check('B8: preflight is answered', route.includes('export async function OPTIONS'))
  }

  console.log('\nC) safe and cheap to leave open')
  {
    const route = strip(read('app/api/public/ai-crawlers/route.ts'))
    check('C1: the route makes no outbound request', !route.includes('fetch('))
    check('C2: …reads no database', !/createClient|createAdminClient|supabase/i.test(route))
    check('C3: …stores nothing about the caller', !/clientIpFrom|hashClient|insert\(/.test(route))
    check('C4: …reads no secret', !/process\.env/.test(route))
    check('C5: …and the only input it reads is the format switch',
      (route.match(/searchParams/g) ?? []).length === 1 && !route.includes('request.json()'))
    check('C6: the answer is cacheable, which is why no rate limit is needed',
      route.includes("'cache-control': CACHE") && route.includes('s-maxage=86400') && !route.includes('takeToken'))
    check('C7: restricted jurisdictions are refused, as on every public surface',
      route.includes('restrictionForRequest(') && route.includes('logRestrictedAttempt('))
    // MUTATION CONTROL for C1/C6: the shapes that would make this route unsafe
    // or uncacheable are exactly the strings the guards look for.
    const mutated = route.split("'cache-control': CACHE").join("'cache-control': 'no-store'") + "\nawait fetch(input)\n"
    check('C1-MUT: adding a fetch would fail C1', mutated.includes('fetch('))
    check('C6-MUT: switching the answer to no-store would fail C6', !mutated.includes("'cache-control': CACHE"))

    // The dataset module must stay independent of the page's curated list, or
    // adding a row here would quietly cost seven strings of copy there.
    const dataset = strip(read('lib/ai-crawlers/dataset.ts'))
    check('C8: the dataset does not import the page’s curated table or its copy',
      !dataset.includes("from './agents'") && !dataset.includes("from './copy'"))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
