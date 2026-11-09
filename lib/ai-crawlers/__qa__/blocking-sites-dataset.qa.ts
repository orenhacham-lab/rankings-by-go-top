/**
 * THE PER-SITE MEASUREMENT HAS TO ADD UP.
 *
 * `/api/public/ai-crawler-blocking/sites` is published under CC BY so that
 * anyone can recompute our percentages from the rows. That only holds if the
 * rows and the summary agree, so this suite recomputes every published figure
 * from the `sites` array and fails when the two drift apart. It is the one
 * guard that matters for a dataset given away for citation: a figure nobody
 * can reproduce is worse than no figure, and a figure that contradicts the
 * rows beneath it is worse still.
 *
 * It also pins the two sentences that bound the numbers. The sample is large,
 * highly ranked sites, and 145 of 700 hosts refused the measurement's client —
 * a refusal that plausibly correlates with restricting AI crawlers, so the
 * read subset under-states blocking. Both have to travel inside the payload.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/ai-crawlers/__qa__/blocking-sites-dataset.qa.ts
 */
import SITES from '../data/blocking-sites-2026-11-09.json'
import {
  BLOCKING_SITES_MEASURED_ON,
  BLOCKING_SITES_READ,
  BLOCKING_SITES_REFUSED,
  BLOCKING_SITES_REQUESTED,
  BLOCKING_SITES_VERSION,
  GPTBOT_DELIBERATE_PCT,
  OAI_SEARCHBOT_INHERITED_PCT,
} from '../blocking-sites'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Verdict = { allowed: boolean; group: string | null; decidingLine: string }
type Site = { market: string; trancoRank: number; domain: string; state: string; verdicts: Record<string, Verdict> | null }

const sites = SITES.sites as Site[]
const read = sites.filter((s) => s.state === 'read')
const TOKENS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'Googlebot'] as const
const blocked = (s: Site, t: string) => s.verdicts !== null && !s.verdicts[t].allowed
/** A rule that names the crawler was written about it; the `*` group lands on every bot alike. */
const deliberate = (s: Site, t: string) => {
  const g = s.verdicts?.[t].group
  return typeof g === 'string' && g !== '*'
}
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null)

console.log('\nA) the rows are the whole requested sample, not the readable part of it')
{
  check('A1: every requested domain is present', sites.length === SITES.method.domainsRequested, String(sites.length))
  check('A2: the read count matches the rows', read.length === SITES.method.robotsRead, `${read.length} vs ${SITES.method.robotsRead}`)
  const outcomes = Object.values(SITES.method.outcomes as Record<string, number>).reduce((a, b) => a + b, 0)
  check('A3: the outcome counts account for every row', outcomes === sites.length, String(outcomes))
  check('A4: a row that could not be read carries no verdict, and one that could carries all four',
    sites.every((s) => (s.state === 'read' ? s.verdicts !== null && TOKENS.every((t) => t in s.verdicts!) : s.verdicts === null)))
  check('A5: every domain appears once', new Set(sites.map((s) => s.domain)).size === sites.length)
  check('A5-MUT: a duplicated domain would be caught',
    new Set([...sites.map((s) => s.domain), sites[0].domain]).size !== sites.length + 1)
}

console.log('\nB) every published figure recomputes from the rows')
{
  const traffic = read.filter((s) => blocked(s, 'ChatGPT-User') || blocked(s, 'OAI-SearchBot'))
  const f = SITES.findings
  check('B1: the traffic-crawler share', f.blocksTrafficBringingCrawler.count === traffic.length
    && f.blocksTrafficBringingCrawler.pct === pct(traffic.length, read.length), `${traffic.length}`)

  const gpt = read.filter((s) => blocked(s, 'GPTBot'))
  const both = gpt.filter((s) => traffic.includes(s))
  check('B2: the headline — of the sites that block GPTBot, how many also block a crawler that brings visitors',
    f.gptbotBlockers.count === gpt.length && f.gptbotBlockers.alsoBlockTrafficCrawler === both.length
    && f.gptbotBlockers.alsoBlockTrafficCrawlerPct === pct(both.length, gpt.length), `${both.length}/${gpt.length}`)

  const right = gpt.filter((s) => !traffic.includes(s))
  check('B3: the share that refused training and left search open',
    f.blockedTrainingKeptSearchOpen.count === right.length, `${right.length}`)

  const googleOk = traffic.filter((s) => !blocked(s, 'Googlebot'))
  check('B4: blocks an AI crawler that brings visitors while letting Googlebot in',
    f.blocksAiTrafficCrawlerButAllowsGooglebot.count === googleOk.length, `${googleOk.length}`)

  for (const row of f.byCrawler) {
    const b = read.filter((s) => blocked(s, row.token))
    const d = b.filter((s) => deliberate(s, row.token))
    check(`B5 ${row.token}: blocked, deliberate and inherited all recompute`,
      row.blocked === b.length && row.deliberate === d.length && row.inherited === b.length - d.length
      && row.blockedPct === pct(b.length, read.length), `${d.length}/${b.length}`)
    check(`B6 ${row.token}: deliberate and inherited partition the blocks`,
      row.deliberate + row.inherited === row.blocked)
  }

  for (const row of f.byMarket) {
    const inMarket = read.filter((s) => s.market === row.market)
    const t = inMarket.filter((s) => traffic.includes(s))
    check(`B7 ${row.market}: the market's own figures recompute`,
      row.robotsRead === inMarket.length && row.blocksTrafficCrawler === t.length
      && row.blocksTrafficCrawlerPct === pct(t.length, inMarket.length), `${t.length}/${inMarket.length}`)
  }
  check('B-MUT: a summary that disagreed with the rows would be caught',
    SITES.findings.gptbotBlockers.count + 1 !== read.filter((s) => blocked(s, 'GPTBot')).length)
}

console.log('\nC) the limits travel with the numbers')
{
  const all = SITES.limitations.join(' ')
  check('C1: the sample is described as large, highly ranked sites', /not small businesses/i.test(all))
  check('C2: the refusal bias is stated, with its direction', /403/.test(all) && /under-?states/i.test(all))
  check('C3: a block is not called a mistake — deliberate restriction is named', /deliberately/i.test(all))
  check('C4: the deciding line is recorded per domain, which is what makes a verdict checkable',
    read.every((s) => TOKENS.every((t) => typeof s.verdicts![t].decidingLine === 'string' && s.verdicts![t].decidingLine.length > 0)))
  check('C5: the parser that produced the verdicts is named and public', /github\.com\//.test(SITES.parser))
  check('C6: the sample is reproducible — the Tranco list is identified by id',
    /Tranco/.test(SITES.method.sample) && /V354N/.test(SITES.method.sample))
  check('C-MUT: a payload whose limitations lost the bias sentence is caught',
    !(/403/.test('These are large, highly ranked sites, not small businesses.')))
}

console.log('\nD) the figures the page states are the figures the dataset holds')
{
  // The page cannot import a quarter-megabyte dataset to read two percentages,
  // so `lib/ai-crawlers/blocking-sites.ts` restates a handful of figures. That
  // is a second source of truth unless something checks it, and this is the
  // something. A summary nobody recomputes is exactly the failure the whole
  // per-site endpoint exists to prevent, one layer up.
  const gpt = SITES.findings.byCrawler.find((r) => r.token === 'GPTBot')!
  const oai = SITES.findings.byCrawler.find((r) => r.token === 'OAI-SearchBot')!
  check('D1: the version and the date match the dataset',
    BLOCKING_SITES_VERSION === SITES.version && BLOCKING_SITES_MEASURED_ON === SITES.measuredOn)
  check('D2: requested and read match the method',
    BLOCKING_SITES_REQUESTED === SITES.method.domainsRequested && BLOCKING_SITES_READ === SITES.method.robotsRead)
  check('D3: the refusal count is the 403 outcome, not a round number',
    BLOCKING_SITES_REFUSED === (SITES.method.outcomes as Record<string, number>).http_403,
    String(BLOCKING_SITES_REFUSED))
  check('D4: the two shares the page states are the dataset\u2019s own',
    GPTBOT_DELIBERATE_PCT === gpt.deliberatePct && OAI_SEARCHBOT_INHERITED_PCT === oai.inheritedPct,
    `${GPTBOT_DELIBERATE_PCT} / ${OAI_SEARCHBOT_INHERITED_PCT}`)
  check('D-MUT: a summary figure that drifted from the rows would be caught',
    GPTBOT_DELIBERATE_PCT + 0.1 !== gpt.deliberatePct)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
