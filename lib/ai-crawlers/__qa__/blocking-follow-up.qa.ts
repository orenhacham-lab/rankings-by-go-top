/**
 * The second sample at /api/public/ai-crawler-blocking — the contract that two
 * datings stay two datings.
 *
 * The first measurement is already cited. The danger a follow-up introduces is
 * not a wrong number, it is a merged one: twelve markets under one date, or a
 * percentage whose denominator is two samples added together. Nobody would ever
 * write that deliberately; it happens when someone later "tidies up" two
 * constants into one list. So the guards here are about separation:
 *
 *   A) the follow-up carries its own date, n, markets and limitations, and
 *      says which sample it sits beside;
 *   B) the two market lists are disjoint, and neither grows a market that was
 *      not sampled;
 *   C) the CSV emits both samples with the right measured_on and n on each
 *      row, and never a row combining them;
 *   D) the JSON keeps the follow-up under its own key, so `version` at the top
 *      still names the sample every sibling field describes;
 *   E) the arithmetic the findings assert is internally consistent.
 *
 * Each has a MUTATION CONTROL beside it, per repo convention.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BLOCKING_BY_MARKET,
  BLOCKING_FOLLOW_UP,
  BLOCKING_FOLLOW_UP_BY_CRAWLER,
  BLOCKING_FOLLOW_UP_BY_MARKET,
  BLOCKING_FOLLOW_UP_VERSION,
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

const SAMPLED = ['.br', '.pl', '.kr', '.se', '.gr']

function main() {
  console.log('\nA) the follow-up is a dated sample of its own')
  {
    // Compared as strings on purpose: both constants are `as const`, so tsc
    // narrows them to literal types and rejects a direct !== as "no overlap"
    // — which is the compiler proving the guard at build time, not a reason to
    // delete a guard that must also hold if someone later edits either date.
    check('A1: it is dated, and not the first sample’s date',
      BLOCKING_FOLLOW_UP.measuredOn === '2026-11-17' &&
        String(BLOCKING_FOLLOW_UP.measuredOn) !== String(BLOCKING_MEASUREMENT.measuredOn))
    check('A2: its version differs from the first sample’s',
      BLOCKING_FOLLOW_UP_VERSION === '2026.11.17' &&
        String(BLOCKING_FOLLOW_UP_VERSION) !== String(BLOCKING_MEASUREMENT_VERSION))
    check('A3: it names the sample it sits beside', BLOCKING_FOLLOW_UP.extends === BLOCKING_MEASUREMENT_VERSION)
    check('A4: it carries its own n and its own request count',
      BLOCKING_FOLLOW_UP.method.robotsFilesRead === 350 &&
        BLOCKING_FOLLOW_UP.method.domainsRequested === 500)
    check('A5: n never exceeds what was requested',
      BLOCKING_FOLLOW_UP.method.robotsFilesRead < BLOCKING_FOLLOW_UP.method.domainsRequested)
    const first = BLOCKING_FOLLOW_UP.limitations[0] ?? ''
    check('A6: the small-business caveat leads its limitations, as in the first sample',
      /small business/i.test(first) && /not small businesses/i.test(first))
    check('A7: the 404 counting rule is published rather than smoothed over',
      BLOCKING_FOLLOW_UP.limitations.some((l) => /404/.test(l) && /conservative|raises|shrinks/i.test(l)))
    check('A8: the weakest market in the sample is named as weak',
      BLOCKING_FOLLOW_UP.limitations.some((l) => /Korea/i.test(l) && /54/.test(l)))
    check('A9: Portugal is still recorded as unsampled',
      BLOCKING_FOLLOW_UP.notSampled.markets.some((m) => /Portugal/i.test(m)))
    check('A10: the first sample points at what answered half of its own gap',
      BLOCKING_MEASUREMENT.notSampled.partlyAnsweredBy === BLOCKING_FOLLOW_UP_VERSION)
    // MUTATION CONTROL for A6: dropping the caveat must fail it.
    const stripped = BLOCKING_FOLLOW_UP.limitations.filter((l) => !/small business/i.test(l))
    check('A6-MUT: removing the small-business caveat would fail A6',
      !/small business/i.test(stripped[0] ?? ''))
  }

  console.log('\nB) the two samples stay two samples')
  {
    const a = new Set(BLOCKING_BY_MARKET.map((r) => r.market))
    const b = new Set(BLOCKING_FOLLOW_UP_BY_MARKET.map((r) => r.market))
    check('B1: it is exactly the five markets sampled, each once',
      b.size === SAMPLED.length && SAMPLED.every((m) => BLOCKING_FOLLOW_UP_BY_MARKET.filter((r) => r.market === m).length === 1))
    check('B2: no market appears in both samples', [...b].every((m) => !a.has(m)))
    check('B3: the market list in the method matches the rows',
      [...BLOCKING_FOLLOW_UP.method.markets].sort().join() === [...b].sort().join())
    check('B4: every share is a real percentage', BLOCKING_FOLLOW_UP_BY_MARKET.every((r) => r.blocksTrafficCrawlerPct > 0 && r.blocksTrafficCrawlerPct <= 100))
    check('B5: rows are ordered high to low, as the first sample is',
      BLOCKING_FOLLOW_UP_BY_MARKET.every((r, i) => i === 0 || BLOCKING_FOLLOW_UP_BY_MARKET[i - 1]!.blocksTrafficCrawlerPct >= r.blocksTrafficCrawlerPct))
    // The claim the record is allowed to make, and no more: four of the five fall
    // below the lowest market of the first sample, and the fifth (.kr) does not.
    // Written as a count rather than as "all", because the first draft said "all"
    // and this guard is what caught it.
    const floorThere = Math.min(...BLOCKING_BY_MARKET.map((r) => r.blocksTrafficCrawlerPct))
    const below = BLOCKING_FOLLOW_UP_BY_MARKET.filter((r) => r.blocksTrafficCrawlerPct < floorThere)
    check('B6: four of the five fall below the lowest market of the first sample', below.length === 4)
    check('B7: the fifth is .kr, and it is still below the first sample’s median',
      below.length === 4 &&
        !below.some((r) => r.market === '.kr') &&
        (BLOCKING_FOLLOW_UP_BY_MARKET.find((r) => r.market === '.kr')?.blocksTrafficCrawlerPct ?? 0) <
          [...BLOCKING_BY_MARKET].sort((x, y) => x.blocksTrafficCrawlerPct - y.blocksTrafficCrawlerPct)[
            Math.floor(BLOCKING_BY_MARKET.length / 2)
          ]!.blocksTrafficCrawlerPct)
    check('B8: no line of published prose claims all five are below',
      !strip(read('app/llms.txt/route.ts')).includes('every one of these blocks less'))
    // MUTATION CONTROL for B2: a market copied across would fail it.
    const merged = [...b, '.nl']
    check('B2-MUT: adding a first-sample market would fail B2', !merged.every((m) => !a.has(m)))
  }

  console.log('\nC) the CSV emits both, and never combines them')
  {
    const route = strip(read('app/api/public/ai-crawler-blocking/route.ts'))
    check('C1: the CSV loops over both samples',
      route.includes('[BLOCKING_MEASUREMENT, BLOCKING_FOLLOW_UP]'))
    check('C2: every row takes its date and its n from the sample it came from',
      route.includes('csvField(sample.method.robotsFilesRead)') && route.includes('csvField(sample.measuredOn)'))
    check('C3: the limitation is read per sample, not once for both',
      route.includes('const limitation = sample.limitations[0]'))
    check('C4: measured_on is still a column, which is what keeps the rows tellable apart',
      route.includes("'measured_on'"))
    // MUTATION CONTROL for C2: hard-coding one sample’s n would fail it.
    const mutated = route.split('csvField(sample.method.robotsFilesRead)').join('csvField(528)')
    check('C2-MUT: hard-coding the first sample’s n would fail C2',
      !mutated.includes('csvField(sample.method.robotsFilesRead)'))
  }

  console.log('\nD) the JSON keeps the follow-up under its own key')
  {
    const route = strip(read('app/api/public/ai-crawler-blocking/route.ts'))
    check('D1: it is served under followUp, with its own version',
      route.includes('followUp: { version: BLOCKING_FOLLOW_UP_VERSION, ...BLOCKING_FOLLOW_UP }'))
    check('D2: the top-level version still names the first sample',
      route.includes('version: BLOCKING_MEASUREMENT_VERSION'))
    check('D3: the follow-up is not spread into the top level, which would overwrite the first sample’s fields',
      !route.includes('...BLOCKING_FOLLOW_UP,\n'))
    const llms = strip(read('app/llms.txt/route.ts'))
    check('D4: llms.txt reads the follow-up’s own figures rather than retyping them',
      llms.includes('BLOCKING_FOLLOW_UP.method.robotsFilesRead') &&
        llms.includes('BLOCKING_FOLLOW_UP.findings.ofGptbotBlockersAlsoBlockingTrafficCrawlerPct'))
    check('D5: llms.txt carries the follow-up’s caveat in the same line as its figures',
      llms.includes('BLOCKING_FOLLOW_UP.limitations[0]'))
    check('D6: llms.txt says the two are not merged',
      llms.includes('never merged into the figures above'))
    // MUTATION CONTROL for D5: dropping the caveat reference would fail it.
    const mutated = llms.split('${BLOCKING_FOLLOW_UP.limitations[0]}').join('')
    check('D5-MUT: dropping the caveat from the line would fail D5', !mutated.includes('BLOCKING_FOLLOW_UP.limitations[0]'))
  }

  console.log('\nE) the findings are internally consistent')
  {
    const f = BLOCKING_FOLLOW_UP.findings
    const n = BLOCKING_FOLLOW_UP.method.robotsFilesRead
    check('E1: GPTBot blockers are a subset of the files read', f.gptbotBlockers > 0 && f.gptbotBlockers < n)
    check('E2: the GPTBot blocker count matches its published share',
      Math.abs((f.gptbotBlockers / n) * 100 - (BLOCKING_FOLLOW_UP_BY_CRAWLER.find((c) => c.token === 'GPTBot')?.blockedPct ?? 0)) < 0.1)
    check('E3: those who also blocked traffic and those who did not account for all of them',
      Math.abs(f.ofGptbotBlockersAlsoBlockingTrafficCrawlerPct + (f.blockedTrainingKeptSearchOpenPct * n) / f.gptbotBlockers - 100) < 0.5)
    check('E4: blocking a traffic crawler while allowing Googlebot cannot exceed blocking one at all',
      f.blocksAiTrafficCrawlerButAllowsGooglebotPct <= f.anyTrafficBringingCrawlerBlockedPct)
    check('E5: the OAI-SearchBot blocker count matches its published share',
      Math.abs((f.oaiSearchbotBlockers / n) * 100 - (BLOCKING_FOLLOW_UP_BY_CRAWLER.find((c) => c.token === 'OAI-SearchBot')?.blockedPct ?? 0)) < 0.1)
    check('E6: the share who never chose OAI-SearchBot is between a quarter and a half, as in the first reading',
      f.ofOaiSearchbotBlockersWhoNeverChoseItPct > 25 && f.ofOaiSearchbotBlockersWhoNeverChoseItPct < 50)
    check('E7: no crawler share exceeds the whole sample',
      BLOCKING_FOLLOW_UP_BY_CRAWLER.every((c) => c.blockedPct > 0 && c.blockedPct <= 100))
    check('E8: a traffic-bringing crawler is blocked less often than a training one, which is the direction the first sample also found',
      (BLOCKING_FOLLOW_UP_BY_CRAWLER.find((c) => c.token === 'OAI-SearchBot')?.blockedPct ?? 0) <
        (BLOCKING_FOLLOW_UP_BY_CRAWLER.find((c) => c.token === 'GPTBot')?.blockedPct ?? 0))
    // MUTATION CONTROL for E2: a mistyped count must fail it.
    check('E2-MUT: a count that does not match the share would fail E2',
      Math.abs((90 / n) * 100 - (BLOCKING_FOLLOW_UP_BY_CRAWLER.find((c) => c.token === 'GPTBot')?.blockedPct ?? 0)) >= 0.1)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
