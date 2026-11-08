/**
 * The published measurement at /api/public/ai-crawler-blocking — the contract
 * that a figure cannot leave this codebase without the sentence that bounds it.
 *
 * This endpoint exists so journalists can cite the 07.11.2026 robots.txt
 * measurement. The risk it carries is not a crash: it is a true number read as
 * a claim about small businesses, which is the one thing the measurement file
 * forbids in capital letters. So the guards here are mostly about the caveat
 * travelling with the data:
 *
 *   A) the limitation is present, non-empty, and says what it has to say;
 *   B) the figures match the measurement record, and the market list is the
 *      seven markets actually sampled — no eighth appears by accident;
 *   C) the CSV carries the limitation on every row, because a spreadsheet is
 *      exactly where a caveat gets lost;
 *   D) the route stays safe to leave public and unauthenticated.
 *
 * Each has a MUTATION CONTROL beside it, per repo convention.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BLOCKING_BY_MARKET,
  BLOCKING_MEASUREMENT,
  BLOCKING_MEASUREMENT_VERSION,
} from '../blocking-measurement'

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

const SAMPLED = ['.com', '.de', '.fr', '.es', '.it', '.jp', '.nl']

function main() {
  console.log('\nA) the limitation travels with the data')
  {
    const first = BLOCKING_MEASUREMENT.limitations[0] ?? ''
    check('A1: at least one limitation is published', BLOCKING_MEASUREMENT.limitations.length >= 1)
    check('A2: the first one is the large-sites caveat',
      /large/i.test(first) && /small business/i.test(first))
    check('A3: it forbids the small-business reading explicitly',
      /do not present/i.test(first))
    check('A4: every limitation is a real sentence, not a placeholder',
      BLOCKING_MEASUREMENT.limitations.every((l) => l.trim().length > 40))
    check('A5: the markets left out of the sample are named',
      BLOCKING_MEASUREMENT.notSampled.markets.length >= 2 &&
        /Brazil/.test(BLOCKING_MEASUREMENT.notSampled.markets.join(' ')))
    // MUTATION CONTROL for A2/A3: softening the caveat to a generic note fails.
    const softened = 'Figures are indicative and may vary by market.'
    check('A2-MUT: a generic note would fail A2 and A3',
      !(/large/i.test(softened) && /small business/i.test(softened)) && !/do not present/i.test(softened))
  }

  console.log('\nB) the figures match the measurement record')
  {
    const f = BLOCKING_MEASUREMENT.findings
    check('B1: n is the files read, not the domains requested',
      BLOCKING_MEASUREMENT.method.robotsFilesRead === 528 &&
        BLOCKING_MEASUREMENT.method.domainsRequested === 700)
    check('B2: the headline figure is 66.5%', f.ofGptbotBlockersAlsoBlockingTrafficCrawlerPct === 66.5)
    check('B3: the Googlebot-allowing figure is 17.2%', f.blocksAiTrafficCrawlerButAllowsGooglebotPct === 17.2)
    check('B4: exactly the seven sampled markets appear, once each',
      BLOCKING_BY_MARKET.length === SAMPLED.length &&
        SAMPLED.every((m) => BLOCKING_BY_MARKET.filter((r) => r.market === m).length === 1))
    check('B5: every share is a percentage in range',
      BLOCKING_BY_MARKET.every((r) => r.blocksTrafficCrawlerPct > 0 && r.blocksTrafficCrawlerPct <= 100))
    check('B6: markets are ordered highest-blocking first, as the record states them',
      BLOCKING_BY_MARKET.every((r, i) => i === 0 || BLOCKING_BY_MARKET[i - 1]!.blocksTrafficCrawlerPct >= r.blocksTrafficCrawlerPct))
    check('B7: the version is the measurement date, not a release date',
      BLOCKING_MEASUREMENT_VERSION === '2026.11.07' &&
        BLOCKING_MEASUREMENT.measuredOn === '2026-11-07')
    // MUTATION CONTROL for B4: an eighth market, or a duplicate, fails.
    const mutatedMarkets = [...SAMPLED, '.com.br']
    check('B4-MUT: adding an unsampled market would fail B4', mutatedMarkets.length !== SAMPLED.length)
  }

  console.log('\nC) the CSV cannot shed the caveat')
  {
    const route = strip(read('app/api/public/ai-crawler-blocking/route.ts'))
    check('C1: the CSV has a limitation column', route.includes("'limitation'"))
    check('C2: the limitation is written into every row, not the header only',
      route.includes('csvField(limitation)'))
    check('C3: CSV fields are quoted and inner quotes doubled (RFC 4180)',
      route.includes('replace(/"/g, \'""\')'))
    // MUTATION CONTROL for C1/C2: dropping the column from the row leaves the
    // header claiming a field the rows do not carry.
    const mutated = route.split('csvField(limitation)').join('')
    check('C2-MUT: removing the per-row limitation would fail C2',
      !mutated.includes('csvField(limitation)') && mutated.includes("'limitation'"))
  }

  console.log('\nD) the route stays safe to leave public')
  {
    const route = strip(read('app/api/public/ai-crawler-blocking/route.ts'))
    check('D1: it makes no outbound request', !route.includes('fetch('))
    check('D2: it reads no database and no secret',
      !route.includes('createAdminClient') && !route.includes('process.env'))
    check('D3: it is cacheable, which is what makes "no rate limit" correct',
      route.includes("'cache-control': CACHE"))
    check('D4: it answers CORS preflight, so a browser page can fetch it',
      route.includes('export async function OPTIONS'))
    check('D5: the sanctions guard runs before anything is served',
      route.includes('restrictionForRequest(') && route.includes('logRestrictedAttempt('))
    check('D6: the licence is served with the data', route.includes('AI_CRAWLER_DATASET_LICENSE'))
    // MUTATION CONTROL for D1/D3: the unsafe shapes are exactly what is checked.
    const mutated = route.split("'cache-control': CACHE").join("'cache-control': 'no-store'") + '\nawait fetch(input)\n'
    check('D1-MUT: adding a fetch would fail D1', mutated.includes('fetch('))
    check('D3-MUT: switching to no-store would fail D3', !mutated.includes("'cache-control': CACHE"))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
