/**
 * THE RESEARCH TAB'S RULES — every pure helper behind what the keyword research
 * tab shows once the seeding scan feeds it (lib/keyword-research/*).
 *
 *  K) one keyword, one key: case, spacing and Unicode form do not make another;
 *  M) the scan's cached rows merged into one list (dedupe, origins, competitors,
 *     newest metrics, one market, volume order, truncation, sanitising);
 *  P) click prices and the overview's totals;
 *  E) easy wins: who qualifies, the score, a deterministic ranking, the facts of
 *     the "why" sentence and the sentence itself in both languages;
 *  Q) what counts as a question;
 *  C) the chips: one rule per chip, counts that match what a chip shows, the
 *     "suggested" order;
 *  R) the table's rows (hand-run research inherits the scan's origins; tracked by
 *     key; Search Console's keywords as rows of their own);
 *  D) the model the page renders (whose research, totals, wins);
 *  S) the scan's state (the two answers read defensively, the view, the light poll
 *     that stops by itself);
 *  F) money and dates in the screen's language.
 *
 * Mutation controls: lib/keyword-research/__qa__/mutation-controls.mjs breaks the
 * real files one at a time and shows the matching check fails, then restores them
 * byte for byte.
 *
 * Run: npx tsx lib/keyword-research/__qa__/keyword-research-helpers.qa.ts
 */
import type { SeedResearchRow } from '@/lib/seed-scan/research'
import type { KeywordFigures } from '@/lib/gsc/tab-metrics'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import {
  averageClickPrice, clickPrice, keywordKey, mergeSeedResearch, researchTotals,
  type Competition, type KeywordIdea, type ScanKeyword, type TrackedKeyword,
} from '@/lib/keyword-research/scan-research'
import { EASY_WIN_MIN_VOLUME, easyWin, rankEasyWins, WEIGHTS, type EasyWin } from '@/lib/keyword-research/easy-wins'
import { chipCounts, chipMatches, isQuestion, RESEARCH_CHIPS, rowsForChip, type ChipRow, type ResearchChip } from '@/lib/keyword-research/chips'
import { researchRows } from '@/lib/keyword-research/rows'
import { researchModel } from '@/lib/keyword-research/model'
import {
  emptyReason, pollDelayMs, progressSteps, readResearchAnswer, readSeedAnswer, researchChanged, researchRunning, scanView,
  type ScanRun,
} from '@/lib/keyword-research/scan-state'
import { formatMoney, formatResearchDate } from '@/lib/keyword-research/format'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const show = (v: unknown) => JSON.stringify(v)

// ── Fixtures ────────────────────────────────────────────────────────────────
function idea(keyword: string, volume: number | null, competition: Competition | null, low: number | null = null, high: number | null = null, currency = 'ILS', index: number | null = null): KeywordIdea {
  return { keyword, avgMonthlySearches: volume, competition, competitionIndex: index, lowTopOfPageBid: low, highTopOfPageBid: high, currency }
}
function seedRow(origin: SeedResearchRow['origin'], value: string, fetchedAt: string, keywords: unknown[], market: [string, string] = ['IL', 'he']): SeedResearchRow {
  return { origin, value, country: market[0], language: market[1], fetchedAt, keywords: keywords as SeedResearchRow['keywords'] }
}
function scanKw(k: KeywordIdea, origins: ScanKeyword['origins'], relevant = true, competitors: string[] = []): ScanKeyword {
  return { ...k, origins, competitors, relevant }
}
function chipRow(k: KeywordIdea, extra: Partial<ChipRow>): ChipRow {
  return { ...k, origins: [], relevant: null, tracked: false, google: false, ...extra }
}
/** A deterministic shuffle (mulberry32), so a failure reproduces. */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function main() {
  console.log('Keyword research: the rules behind the tab (lib/keyword-research)')

  // ── K) keys ──────────────────────────────────────────────────────────────
  console.log('\nK) one keyword, one key')
  check('K1: case, spacing and Unicode form do not make a different keyword',
    keywordKey('  נעלי   ריצה ') === keywordKey('נעלי ריצה')
    && keywordKey('Running  Shoes') === keywordKey('running shoes')
    && keywordKey('café shoes') === keywordKey('café shoes')
    && keywordKey('נעלי ריצה') !== keywordKey('נעלי ריצה לנשים'))

  // ── M) merging the scan's rows ───────────────────────────────────────────
  console.log('\nM) the scan\'s cached rows, merged into one list')
  {
    const rows = [
      seedRow('competitor', 'rival-b.co.il', '2026-09-20T08:03:00Z', [idea('נעלי ריצה', 12000, 'HIGH', 2, 7), idea('נעלי שטח', 700, 'LOW', 1, 3)]),
      seedRow('site', 'runshop.co.il', '2026-09-20T08:02:00Z', [idea('Nike Pegasus', 900, 'MEDIUM', 1, 2)]),
      seedRow('competitor', 'rival-a.co.il', '2026-09-20T08:04:00Z', [idea('נעלי  ריצה', 12100, null, null, 7.5), idea('נעלי שטח', 720, 'LOW')]),
      seedRow('seed_keywords', 'נעלי ריצה|נעלי שטח', '2026-09-20T08:01:00Z', [idea('נעלי ריצה', 11000, 'MEDIUM', 1.5, 6, 'ILS', 52)]),
      seedRow('home_page', 'https://runshop.co.il/', '2026-09-20T08:00:00Z', [idea('nike pegasus', 880, 'LOW', 0.5, 1.5)]),
    ]
    const merged = mergeSeedResearch(rows)
    const byKey = new Map(merged.keywords.map((k) => [keywordKey(k.keyword), k]))
    const shoes = byKey.get('נעלי ריצה')
    check('M1: one entry per keyword, every seed that found it, listed in one fixed order',
      merged.keywords.length === 3
      && same(shoes?.origins, ['seed_keywords', 'competitor'])
      && same(byKey.get('nike pegasus')?.origins, ['home_page', 'site'])
      && same(mergeSeedResearch([...rows].reverse()).keywords.map((k) => k.origins), merged.keywords.map((k) => k.origins)),
      show(merged.keywords.map((k) => [k.keyword, k.origins])))
    check('M2: competitor domains come from the competitor rows only, sorted',
      same(shoes?.competitors, ['rival-a.co.il', 'rival-b.co.il']) && same(byKey.get('נעלי שטח')?.competitors, ['rival-a.co.il', 'rival-b.co.il'])
      && same(byKey.get('nike pegasus')?.competitors, []),
      show(merged.keywords.map((k) => [k.keyword, k.competitors])))
    // The newest row (rival-a, 08:04) wins; the fields it lacks come from the next newest that has them.
    check('M3: the newest row\'s metrics win; a field it lacks is taken from an older row',
      shoes?.keyword === 'נעלי ריצה' && shoes.avgMonthlySearches === 12100 && shoes.highTopOfPageBid === 7.5
      && shoes.competition === 'HIGH' && shoes.lowTopOfPageBid === 2 && shoes.competitionIndex === 52,
      show(shoes))
    const mixed = mergeSeedResearch([
      seedRow('site', 'runshop.co.il', '2026-09-21T09:00:00Z', [idea('running shoes', 5000, 'LOW')], ['US', 'en']),
      seedRow('site', 'runshop.co.il', '2026-09-20T09:00:00Z', [idea('נעלי ריצה', 9000, 'LOW')], ['IL', 'he']),
      seedRow('competitor', 'rival.com', '2026-09-19T09:00:00Z', [idea('trail shoes', 800, 'LOW')], ['US', 'en']),
    ])
    check('M4: the newest row\'s market is the research\'s market; rows of another market are left out',
      same(mixed.market, { country: 'US', language: 'en' }) && mixed.fetchedAt === '2026-09-21T09:00:00Z'
      && same(mixed.keywords.map((k) => k.keyword), ['running shoes', 'trail shoes']),
      show(mixed))
    const many = mergeSeedResearch([seedRow('site', 's', '2026-09-20T00:00:00Z', [
      idea('b kw', 50, 'LOW'), idea('a kw', 50, 'LOW'), idea('no volume', null, 'LOW'), idea('top kw', 900, 'LOW'), idea('mid kw', 300, 'LOW'),
    ])], 3)
    const all = mergeSeedResearch([seedRow('site', 's', '2026-09-20T00:00:00Z', [
      idea('b kw', 50, 'LOW'), idea('a kw', 50, 'LOW'), idea('no volume', null, 'LOW'), idea('top kw', 900, 'LOW'), idea('mid kw', 300, 'LOW'),
    ])])
    check('M5: most searched first, no figure last, ties by keyword; past the limit the most searched are kept and it says so',
      same(all.keywords.map((k) => k.keyword), ['top kw', 'mid kw', 'a kw', 'b kw', 'no volume']) && all.truncated === false
      && same(many.keywords.map((k) => k.keyword), ['top kw', 'mid kw', 'a kw']) && many.truncated === true,
      show([all.keywords.map((k) => k.keyword), many.keywords.map((k) => k.keyword), many.truncated]))
    const dirty = mergeSeedResearch([seedRow('site', 's', '2026-09-20T00:00:00Z', [
      { keyword: '   ' }, { keyword: 42 }, null, 'text',
      { keyword: '  running   shoes ', avgMonthlySearches: -5, competition: 'VERY_HIGH', competitionIndex: Number.NaN, lowTopOfPageBid: '1', highTopOfPageBid: 2, currency: 7 },
    ])])
    const k0 = dirty.keywords[0]
    check('M6: what came out of the jsonb column is re-validated: junk dropped, bad figures null; no rows, no market',
      dirty.keywords.length === 1 && k0.keyword === 'running shoes' && k0.avgMonthlySearches === null && k0.competition === null
      && k0.competitionIndex === null && k0.lowTopOfPageBid === null && k0.highTopOfPageBid === 2 && k0.currency === ''
      && same(mergeSeedResearch([]), { market: null, fetchedAt: null, keywords: [], truncated: false }),
      show(dirty.keywords))
  }

  // ── P) prices and totals ─────────────────────────────────────────────────
  console.log('\nP) click prices and the overview\'s totals')
  check('P1: a click price is the middle of Google\'s range, or the one end it gave; zero is no price',
    clickPrice({ lowTopOfPageBid: 1, highTopOfPageBid: 3 }) === 2 && clickPrice({ lowTopOfPageBid: null, highTopOfPageBid: 3 }) === 3
    && clickPrice({ lowTopOfPageBid: 1.5, highTopOfPageBid: 0 }) === 1.5 && clickPrice({ lowTopOfPageBid: 0, highTopOfPageBid: null }) === null)
  {
    const avg = averageClickPrice([idea('a', 10, 'LOW', 1, 3), idea('b', 10, 'LOW', 2, 3), idea('c', 10, 'LOW', null, 4.1), idea('d', 10, 'LOW', 9, 9, 'USD'), idea('e', 10, 'LOW')])
    const tie = averageClickPrice([idea('a', 10, 'LOW', 2, 2, 'USD'), idea('b', 10, 'LOW', 4, 4, 'EUR')])
    check('P2: the average click price is in the currency most keywords use, to the cent; a tie is broken by the currency code; none without prices',
      same(avg, { value: 2.87, currency: 'ILS', count: 3 }) && same(tie, { value: 4, currency: 'EUR', count: 1 })
      && averageClickPrice([idea('a', 10, 'LOW')]) === null,
      show([avg, tie]))
    const totals = researchTotals([
      { ...idea('a', 1000, 'LOW', 1, 3), competitors: ['x.com', 'y.com'] },
      { ...idea('b', null, 'LOW'), competitors: ['y.com'] },
      { ...idea('c', 250, 'HIGH', 2, 2) },
    ])
    check('P3: the totals: keywords, the sum of monthly searches, the average click price, distinct competitors',
      same(totals, { keywords: 3, monthlySearches: 1250, averageCpc: { value: 2, currency: 'ILS', count: 2 }, competitors: 2 }), show(totals))
  }

  // ── E) easy wins ─────────────────────────────────────────────────────────
  console.log('\nE) easy wins')
  {
    const avg2 = { value: 2, currency: 'ILS', count: 10 }
    const win = (k: KeywordIdea, a = avg2 as typeof avg2 | null) => easyWin(k, a)
    check('E1: an easy win has 30+ searches a month and competition that is not high (Google\'s index when it gave no level)',
      EASY_WIN_MIN_VOLUME === 30
      && win(idea('a', 29, 'LOW')) === null && win(idea('a', 30, 'LOW')) !== null && win(idea('a', null, 'LOW')) === null
      && win(idea('a', 5000, 'HIGH')) === null
      && win(idea('a', 500, null, null, null, 'ILS', 33))?.competition === 'low'
      && win(idea('a', 500, null, null, null, 'ILS', 66))?.competition === 'medium'
      && win(idea('a', 500, null, null, null, 'ILS', 67)) === null
      && win(idea('a', 500, null))?.competition === 'unknown')
    // score = round(100 × (0.45·competition + 0.35·volume + 0.2·price)), worked by hand:
    //  1000/mo, low, ₪2 against ₪2:   0.45 + 0.35·0.75 + 0.2·0.5            = 0.8125 → 81
    //  200/mo, unknown, no price:     0.45·0.6 + 0.35·(log10 200)/4 + 0.2·0.25 = 0.5213 → 52
    //  30/mo, low, a USD price:       0.45 + 0.35·(log10 30)/4 + 0.2·0.25       = 0.6292 → 63
    //  20000/mo, medium, ₪3.30:       0.45·0.5 + 0.35·1 + 0.2·0.825             = 0.74   → 74
    const scores = [
      win(idea('a', 1000, 'LOW', 1, 3))?.score,
      win(idea('b', 200, null))?.score,
      win(idea('c', 30, 'LOW', 1, 1, 'USD'))?.score,
      win(idea('d', 20000, 'MEDIUM', 3.3, 3.3))?.score,
    ]
    const formula = (k: KeywordIdea, level: number) => {
      const price = clickPrice(k)
      const p = price !== null && k.currency === avg2.currency ? Math.min(1, price / avg2.value / 2) : 0.25
      return Math.round(100 * (WEIGHTS.competition * level + WEIGHTS.volume * Math.min(1, Math.log10(k.avgMonthlySearches as number) / 4) + WEIGHTS.cpc * p))
    }
    const grid: [KeywordIdea, number][] = []
    for (const v of [30, 75, 480, 2400, 9900, 60500]) for (const [c, l] of [['LOW', 1], ['MEDIUM', 0.5], [null, 0.6]] as const) for (const [lo, hi] of [[null, null], [0.4, 1.1], [3.3, 9.7]] as const) grid.push([idea(`k${v}`, v, c, lo, hi), l])
    const off = grid.filter(([k, l]) => win(k)?.score !== formula(k, l))
    check('E2: the score weighs competition 45%, volume 35% (log scale), click price 20% against the average — worked examples and the whole grid',
      same(scores, [81, 52, 63, 74]) && same(WEIGHTS, { competition: 0.45, volume: 0.35, cpc: 0.2 }) && off.length === 0,
      `${show(scores)} off:${off.length}`)
    const pool = [
      idea('זול ונפוץ', 4000, 'LOW', 1, 2), idea('b tie', 500, 'LOW', 1, 3), idea('a tie', 500, 'LOW', 1, 3),
      idea('same score more volume', 505, 'LOW', 1, 3), idea('medium', 3000, 'MEDIUM', 2, 6), idea('unknown', 900, null),
      idea('contested', 90000, 'HIGH', 5, 9), idea('tiny', 12, 'LOW'), idea('Z upper', 500, 'LOW', 1, 3),
    ]
    const average = averageClickPrice(pool)
    const order = rankEasyWins(pool, average).map((w) => w.row.keyword)
    const stable = Array.from({ length: 30 }, (_, i) => rankEasyWins(shuffled(pool, i + 1), average).map((w) => w.row.keyword)).every((o) => same(o, order))
    const iTie = order.indexOf('a tie'), iB = order.indexOf('b tie'), iZ = order.indexOf('Z upper'), iMore = order.indexOf('same score more volume')
    check('E3: the ranking is deterministic: best score first, then more searches, then the keyword (the same in any input order)',
      stable && !order.includes('contested') && !order.includes('tiny') && iMore < iTie && iTie < iB && iB < iZ
      && rankEasyWins(pool, average).every((w, i, a) => i === 0 || a[i - 1].win.score >= w.win.score),
      show(order))
    const facts = (k: KeywordIdea) => { const w = win(k) as EasyWin; return [w.cpc, w.currency, w.cpcAboveAverage] }
    check('E4: each win carries the facts of its sentence: the price in the average\'s currency, "above average" from 1.25×',
      same(facts(idea('a', 100, 'LOW', 2.5, 2.5)), [2.5, 'ILS', true]) && same(facts(idea('a', 100, 'LOW', 2.4, 2.4)), [2.4, 'ILS', false])
      && same(facts(idea('a', 100, 'LOW', 9, 9, 'USD')), [null, null, false]) && same(facts(idea('a', 100, 'LOW')), [null, null, false])
      && same([win(idea('a', 100, 'LOW', 2, 2), null)?.cpc, win(idea('a', 100, 'LOW', 2, 2), null)?.cpcAboveAverage], [null, false]))
    const he = getDashboardDictionary('he').keywordResearchScan.easyWins.why
    const en = getDashboardDictionary('en').keywordResearchScan.easyWins.why
    const sentences = [
      he({ volume: '1,200', competition: 'low', cpc: null, cpcHigh: false }),
      he({ volume: '1,200', competition: 'medium', cpc: '‏2.40 ₪', cpcHigh: false }),
      he({ volume: '90', competition: 'unknown', cpc: '‏5.10 ₪', cpcHigh: true }),
      en({ volume: '1,200', competition: 'low', cpc: null, cpcHigh: false }),
      en({ volume: '1,200', competition: 'medium', cpc: '$2.40', cpcHigh: false }),
      en({ volume: '90', competition: 'unknown', cpc: '$5.10', cpcHigh: true }),
    ]
    check('E5: one "why" sentence from the three facts, in Hebrew and in English',
      same(sentences, [
        '1,200 חיפושים בחודש ותחרות נמוכה.',
        '1,200 חיפושים בחודש ותחרות בינונית, ומחיר קליק ‏2.40 ₪.',
        '90 חיפושים בחודש, ומחיר קליק גבוה (‏5.10 ₪) מעיד על כוונת קנייה.',
        '1,200 searches a month and low competition.',
        '1,200 searches a month and medium competition, at $2.40 a click.',
        '90 searches a month, and a high click price ($5.10) signals buying intent.',
      ]),
      show(sentences))
  }

  // ── Q) questions ─────────────────────────────────────────────────────────
  console.log('\nQ) what counts as a question')
  {
    const yes = ['איך לבחור נעלי ריצה', 'מה ההבדל בין נעלי ריצה', 'כמה עולות נעלי ריצה', 'האם נעלי ריצה טובות להליכה', 'ואיך מנקים נעלי ריצה',
      'נעלי ריצה לשטח?', 'best running shoes؟', 'how to choose running shoes', "what's the best trail shoe", 'Is running good for knees', '"איזה" נעל לקנות']
    const no = ['נעלי ריצה', 'מי ורדים', 'מי פנים לעור יבש', 'running shoes', 'whatsapp shoes', 'howard shoes', 'ומשהו נוסף', '']
    const wrongYes = yes.filter((k) => !isQuestion(k)), wrongNo = no.filter((k) => isQuestion(k))
    check('Q1: a question word first (Hebrew, English, with Hebrew\'s joined "and") or a question mark; "מי" alone is "water of", not "who"',
      wrongYes.length === 0 && wrongNo.length === 0, show({ wrongYes, wrongNo }))
  }

  // ── C) chips ─────────────────────────────────────────────────────────────
  console.log('\nC) the chips')
  const avgIls = { value: 2, currency: 'ILS', count: 5 }
  const CHIP_ROWS: ChipRow[] = [
    chipRow(idea('נעלי ריצה', 12100, 'HIGH', 2, 7), { origins: ['seed_keywords', 'competitor'], relevant: true, tracked: true, google: true }),
    chipRow(idea('נעלי ריצה לנשים', 2900, 'MEDIUM', 1.2, 4.8), { origins: ['home_page'], relevant: true }),
    chipRow(idea('איך לבחור נעלי ריצה', 320, 'LOW', 0.6, 2.2), { origins: ['site'], relevant: true }),
    chipRow(idea('נעלי שטח', 720, null, null, null, 'ILS', 20), { origins: ['competitor'], relevant: true }),
    chipRow(idea('run shop', 1500, 'LOW', 1, 2), { origins: ['site'], relevant: false }),
    chipRow(idea('גרבי ריצה', 40, null), { origins: ['seed_keywords'], relevant: true }),
    chipRow(idea('נעלי ריצה במבצע', 50, 'LOW', 1, 1), { origins: [], relevant: null, tracked: true, google: true }),
    chipRow(idea('running shoes sale', null, 'MEDIUM'), { origins: [], relevant: null }),
    chipRow(idea('נעלי ריצה מקצועיות', 20000, 'HIGH', 3, 9), { origins: ['site'], relevant: true }),
    chipRow(idea('שרוכים לנעלי ריצה', 10, 'LOW', 0.2, 0.5), { origins: ['competitor'], relevant: true }),
  ]
  {
    const expected: Record<ResearchChip, string[]> = {
      all: CHIP_ROWS.map((r) => r.keyword),
      research: ['נעלי ריצה', 'נעלי ריצה לנשים', 'איך לבחור נעלי ריצה', 'run shop', 'גרבי ריצה', 'נעלי ריצה מקצועיות'],
      competitors: ['נעלי ריצה', 'נעלי שטח', 'שרוכים לנעלי ריצה'],
      google: ['נעלי ריצה', 'נעלי ריצה במבצע'],
      high_volume: ['נעלי ריצה', 'נעלי ריצה לנשים', 'run shop', 'נעלי ריצה מקצועיות'],
      low_competition: ['איך לבחור נעלי ריצה', 'נעלי שטח', 'run shop', 'נעלי ריצה במבצע', 'שרוכים לנעלי ריצה'],
      questions: ['איך לבחור נעלי ריצה'],
      suggested: ['נעלי ריצה לנשים', 'איך לבחור נעלי ריצה', 'נעלי שטח', 'גרבי ריצה', 'נעלי ריצה מקצועיות', 'שרוכים לנעלי ריצה'],
      tracked: ['נעלי ריצה', 'נעלי ריצה במבצע'],
    }
    const wrong = RESEARCH_CHIPS.filter((chip) => !same(CHIP_ROWS.filter((r) => chipMatches(chip, r)).map((r) => r.keyword), expected[chip]))
    check('C1: each chip\'s rule (research = the site\'s seeds, home page, domain; competitors; Google; 1,000+; low; questions; suggested = found, relevant, not tracked; tracked)',
      wrong.length === 0 && RESEARCH_CHIPS.length === 9,
      wrong.map((c) => `${c}: ${show(CHIP_ROWS.filter((r) => chipMatches(c, r)).map((r) => r.keyword))}`).join(' | '))
    const counts = chipCounts(CHIP_ROWS)
    const mismatch = RESEARCH_CHIPS.filter((chip) => counts[chip] !== rowsForChip(CHIP_ROWS, chip, avgIls).length)
    check('C2: every chip\'s count is the number of rows it shows',
      mismatch.length === 0 && counts.all === CHIP_ROWS.length && same(Object.keys(counts), [...RESEARCH_CHIPS]), show(counts))
    // Scores against ₪2 (worked by hand): נעלי שטח 75, איך לבחור 74, לנשים 68, גרבי ריצה 46; then
    // the two that are not easy wins (contested, too few searches), most searched first.
    const suggested = rowsForChip(CHIP_ROWS, 'suggested', avgIls).map((r) => r.keyword)
    check('C3: "suggested" lists the easy wins best first, then the rest most searched first; other chips keep the table\'s order',
      same(suggested, ['נעלי שטח', 'איך לבחור נעלי ריצה', 'נעלי ריצה לנשים', 'גרבי ריצה', 'נעלי ריצה מקצועיות', 'שרוכים לנעלי ריצה'])
      && same(rowsForChip(CHIP_ROWS, 'research', avgIls).map((r) => r.keyword), expected.research)
      && same(rowsForChip(CHIP_ROWS, 'low_competition', avgIls).map((r) => r.keyword), expected.low_competition),
      show(suggested))
  }

  // ── R) rows ──────────────────────────────────────────────────────────────
  console.log('\nR) the table\'s rows')
  const SCAN: ScanKeyword[] = [
    scanKw(idea('נעלי ריצה', 12100, 'HIGH', 2, 7), ['seed_keywords', 'competitor'], true, ['rival.co.il']),
    scanKw(idea('נעלי ריצה לנשים', 2900, 'MEDIUM', 1.2, 4.8), ['home_page'], true),
    scanKw(idea('run shop', 1500, 'LOW', 1, 2), ['site'], false),
  ]
  const TRACKED: TrackedKeyword[] = [
    { id: 't1', keyword: 'נעלי  ריצה', metrics: idea('נעלי ריצה', 12100, 'HIGH', 2, 7) },
    { id: 't2', keyword: 'נעלי ריצה במבצע', metrics: idea('נעלי ריצה במבצע', 50, 'LOW', 1, 1) },
    { id: 't3', keyword: 'מדריך מידות', metrics: null },
  ]
  const GOOGLE: Record<string, KeywordFigures> = { t1: { clicks: 40, impressions: 1800 } as KeywordFigures, t2: { clicks: 3, impressions: 210 } as KeywordFigures }
  {
    const manual = researchRows({
      keywords: [idea('נעלי ריצה לנשים', 3000, 'MEDIUM'), idea('NEW keyword', 90, 'LOW'), idea('נעלי ריצה לנשים ', 1, 'LOW')],
      scan: SCAN, tracked: TRACKED, google: GOOGLE, withGoogleOnly: false,
    })
    check('R1: a hand-run keyword the scan also found keeps the scan\'s origins and relevance; one it did not find has none; one row per keyword',
      manual.length === 2 && same(manual[0].origins, ['home_page']) && manual[0].relevant === true && manual[0].avgMonthlySearches === 3000
      && same(manual[1].origins, []) && manual[1].relevant === null && same(manual[1].competitors, []),
      show(manual.map((r) => [r.keyword, r.origins, r.relevant])))
    const scanRows = researchRows({ keywords: SCAN, scan: SCAN, tracked: TRACKED, google: GOOGLE, withGoogleOnly: true })
    const shoes = scanRows.find((r) => r.keyword === 'נעלי ריצה')
    check('R2: tracked is recognised by key (spacing, case), with its id; Google\'s figures come by that id',
      shoes?.tracked === true && shoes.trackedId === 't1' && shoes.google === true && same(shoes.gsc, GOOGLE.t1)
      && scanRows.find((r) => r.keyword === 'run shop')?.tracked === false && scanRows.find((r) => r.keyword === 'run shop')?.gsc === null,
      show(shoes))
    const extra = scanRows.filter((r) => !SCAN.some((k) => k.keyword === r.keyword))
    const noGoogle = researchRows({ keywords: SCAN, scan: SCAN, tracked: TRACKED, google: null, withGoogleOnly: true })
    check('R3: on the scan\'s list, tracked keywords Google reports for are rows of their own (never suggested); none without figures or on a hand-run list',
      extra.length === 1 && extra[0].keyword === 'נעלי ריצה במבצע' && extra[0].google && extra[0].tracked && same(extra[0].origins, [])
      && extra[0].relevant === null && extra[0].avgMonthlySearches === 50 && !chipMatches('suggested', extra[0])
      && noGoogle.length === SCAN.length && manual.every((r) => r.keyword !== 'נעלי ריצה במבצע'),
      show(extra.map((r) => r.keyword)))
  }

  // ── D) the model ─────────────────────────────────────────────────────────
  console.log('\nD) the model the page renders')
  {
    const scanModel = researchModel({ scanKeywords: SCAN, tracked: TRACKED, manual: null, google: GOOGLE, chip: 'all' })
    const manualModel = researchModel({ scanKeywords: SCAN, tracked: TRACKED, manual: [idea('x y', 100, 'LOW')], google: GOOGLE, chip: 'all' })
    const nothing = researchModel({ scanKeywords: [], tracked: TRACKED, manual: null, google: GOOGLE, chip: 'all' })
    const emptyManual = researchModel({ scanKeywords: SCAN, tracked: [], manual: [], google: null, chip: 'all' })
    check('D1: whose research is on screen: a hand-run one with results, else the scan\'s, else none',
      scanModel.mode === 'scan' && manualModel.mode === 'manual' && manualModel.rows.length === 1 && nothing.mode === null && nothing.rows.length === 0
      && emptyManual.mode === 'scan',
      show([scanModel.mode, manualModel.mode, nothing.mode, emptyManual.mode]))
    const suggestedModel = researchModel({ scanKeywords: SCAN, tracked: TRACKED, manual: null, google: GOOGLE, chip: 'suggested' })
    check('D2: the overview counts the research\'s own keywords (not the rows Google added); wins skip what the filter rejects; the chip picks the rows',
      scanModel.rows.length === 4 && scanModel.totals.keywords === 3 && scanModel.totals.monthlySearches === 16500 && scanModel.totals.competitors === 1
      && !scanModel.wins.some((w) => w.row.keyword === 'run shop') && scanModel.wins.some((w) => w.row.keyword === 'נעלי ריצה לנשים')
      && same(suggestedModel.chipRows.map((r) => r.keyword), ['נעלי ריצה לנשים']) && scanModel.byKey.get(keywordKey('נעלי  ריצה'))?.trackedId === 't1',
      show({ totals: scanModel.totals, wins: scanModel.wins.map((w) => w.row.keyword), chip: suggestedModel.chipRows.map((r) => r.keyword) }))
  }

  // ── S) the scan's state ──────────────────────────────────────────────────
  console.log('\nS) the scan\'s state')
  const NOW = new Date('2026-09-27T12:00:00Z')
  const run = (over: Partial<ScanRun> & { steps?: ScanRun['steps'] } = {}): ScanRun => ({
    id: 'run-1', stage: 'b', status: 'running', stalled: false, startedAt: '2026-09-27T11:55:00Z',
    steps: [{ step: 'b1', status: 'done', errorCode: null }, { step: 'b2', status: 'running', errorCode: null }, { step: 'b3', status: 'pending', errorCode: null }],
    seedKeywords: ['נעלי ריצה'], domain: 'runshop.co.il', storefrontLocked: false, ...over,
  })
  const step = (b1: string, b2: string, b3: string, b2Error: string | null = null) => [
    { step: 'b1', status: b1, errorCode: null }, { step: 'b2', status: b2, errorCode: b2Error }, { step: 'b3', status: b3, errorCode: null },
  ] as ScanRun['steps']
  {
    const body = {
      ok: true,
      run: {
        id: 'run-9', stage: 'b', status: 'running', stalled: false, startedAt: '2026-09-27T11:00:00Z',
        steps: [{ step: 'b1', status: 'done', errorCode: null }, { step: 'b2', status: 'exploded' }, { step: 'b3', status: 'failed', errorCode: 'serper_http_500' }, 'junk'],
        summary: { domain: 'runshop.co.il', storefrontLocked: true, seedKeywords: [' נעלי ריצה ', 7, '', 'a', 'b', 'c', 'd', 'e'] },
      },
    }
    const read = readSeedAnswer(200, body)
    const r = read.kind === 'run' ? read.run : null
    check('S1: the run\'s answer is read defensively: anything but a readable 200 run is "none"; seeds trimmed, at most 5; unknown steps dropped',
      [readSeedAnswer(404, { error: 'Not found' }), readSeedAnswer(500, body), readSeedAnswer(200, { ok: false }), readSeedAnswer(200, { ok: true, run: { ...body.run, id: '' } }),
        readSeedAnswer(200, { ok: true, run: { ...body.run, stage: 'c' } }), readSeedAnswer(200, { ok: true, run: { ...body.run, status: 'weird' } }), readSeedAnswer(0, null)]
        .every((a) => a.kind === 'none')
      && !!r && r.id === 'run-9' && same(r.seedKeywords, ['נעלי ריצה', 'a', 'b', 'c', 'd']) && r.storefrontLocked && r.domain === 'runshop.co.il'
      && same(r.steps.map((s) => [s.step, s.status, s.errorCode]), [['b1', 'done', null], ['b3', 'failed', 'serper_http_500']]),
      show(read))
    const research = { ok: true, market: { country: 'IL', language: 'he' }, fetchedAt: '2026-09-27T11:30:00Z', keywords: SCAN, truncated: 'yes', tracked: [] }
    const ok = readResearchAnswer(200, research)
    const withSources = readResearchAnswer(200, { ...research, sources: { scan: 'yes', manualAt: '2026-08-18T09:00:00Z' } })
    const badDate = readResearchAnswer(200, { ...research, sources: { scan: true, manualAt: 'soon' } })
    check('S2: the research answer is data or an error (401, 404, 500, a malformed body), never provider text; its sources are read strictly (a date that is not one is none)',
      ok.kind === 'ok' && ok.research.keywords.length === 3 && ok.research.truncated === false && ok.research.sources === undefined
      && withSources.kind === 'ok' && same(withSources.research.sources, { scan: false, manualAt: '2026-08-18T09:00:00Z' })
      && badDate.kind === 'ok' && same(badDate.research.sources, { scan: true, manualAt: null })
      && [readResearchAnswer(500, { ok: false, code: 'internal' }), readResearchAnswer(404, research), readResearchAnswer(200, { ok: true, keywords: 'x', tracked: [] }), readResearchAnswer(0, null)]
        .every((a) => a.kind === 'error'))
    const okAnswer = { kind: 'ok' as const, research: { market: null, fetchedAt: null, keywords: SCAN, truncated: false, tracked: TRACKED } }
    const emptyAnswer = { kind: 'ok' as const, research: { market: null, fetchedAt: null, keywords: [], truncated: false, tracked: TRACKED } }
    const seeded = scanView({ kind: 'run', run: run() }, okAnswer, NOW)
    const views = [
      scanView(null, null, NOW).kind,
      scanView({ kind: 'none' }, emptyAnswer, NOW).kind,
      scanView({ kind: 'run', run: run({ status: 'done', steps: step('done', 'done', 'done') }) }, null, NOW).kind,
      scanView({ kind: 'run', run: run() }, null, NOW).kind,
      scanView({ kind: 'run', run: run() }, emptyAnswer, NOW).kind,
      seeded.kind,
    ]
    const reason = (r: ScanRun, a: Parameters<typeof scanView>[1]) => { const v = scanView({ kind: 'run', run: r }, a, NOW); return v.kind === 'empty' ? v.reason : v.kind }
    check('S3: the view: loading, unseeded, pending, running, seeded (still running or not), and empty with our own reason',
      same(views, ['loading', 'unseeded', 'pending', 'running', 'running', 'seeded'])
      && seeded.kind === 'seeded' && seeded.running && same(seeded.tracked, TRACKED)
      && (scanView({ kind: 'run', run: run({ status: 'done', steps: step('done', 'done', 'done') }) }, okAnswer, NOW) as { running?: boolean }).running === false
      && reason(run({ status: 'done', steps: step('done', 'done', 'done') }), emptyAnswer) === 'nothing_found'
      && reason(run({ status: 'partial', steps: step('done', 'done', 'failed') }), emptyAnswer) === 'nothing_found'
      && reason(run({ status: 'done', steps: step('done', 'done', 'done') }), { kind: 'error' }) === 'unreadable'
      && reason(run({ status: 'done', steps: step('done', 'skipped', 'skipped', 'market_unsupported') }), emptyAnswer) === 'market_unsupported'
      && reason(run({ status: 'failed', stage: 'a', steps: [] }), emptyAnswer) === 'not_run',
      show(views))
    // No scan: the project's own research opens the same screen; with none, the screen's empty start. Never today's form.
    const own = scanView({ kind: 'none' }, okAnswer, NOW)
    const noScan = [scanView({ kind: 'none' }, null, NOW), own, scanView({ kind: 'none' }, emptyAnswer, NOW), scanView({ kind: 'none' }, { kind: 'error' }, NOW)]
    check('S3b: with no scan, the view waits for the research (loading), shows the project\'s own research as the research (seeded, not running, no steps, no seeds), or the empty start (unseeded, with the tracked keywords); never "none" for a project',
      same(noScan.map((v) => v.kind), ['loading', 'seeded', 'unseeded', 'unseeded'])
      && own.kind === 'seeded' && own.running === false && own.steps.length === 0 && own.seedKeywords.length === 0 && own.domain === null && same(own.research.keywords, SCAN)
      && noScan[2].kind === 'unseeded' && same(noScan[2].tracked, TRACKED) && noScan[3].kind === 'unseeded' && same(noScan[3].tracked, []),
      show(noScan.map((v) => v.kind)))
    const hour = 60 * 60 * 1000
    check('S4: the research is still running until b2 and b3 are over, the run ends, or a stalled run is a day old',
      researchRunning(run(), NOW) && researchRunning(run({ stage: 'a', steps: [] }), NOW)
      && !researchRunning(run({ steps: step('done', 'done', 'failed') }), NOW) && !researchRunning(run({ steps: step('done', 'skipped', 'done') }), NOW)
      && researchRunning(run({ steps: step('done', 'done', 'running') }), NOW)
      && !researchRunning(run({ status: 'partial' }), NOW) && !researchRunning(run({ status: 'failed' }), NOW)
      && researchRunning(run({ stalled: true, startedAt: new Date(NOW.getTime() - 23 * hour).toISOString() }), NOW)
      && !researchRunning(run({ stalled: true, startedAt: new Date(NOW.getTime() - 25 * hour).toISOString() }), NOW)
      && !researchRunning(run({ stalled: true, startedAt: null }), NOW))
    const delays = Array.from({ length: 8 }, (_, i) => pollDelayMs(i))
    check('S5: the poll is light: 8s, then 1.5× each time, never more than 30s',
      same(delays, [8000, 12000, 18000, 27000, 30000, 30000, 30000, 30000]) && pollDelayMs(-3) === 8000
      && Array.from({ length: 200 }, (_, i) => pollDelayMs(i)).every((d) => d >= 8000 && d <= 30000),
      show(delays))
    check('S6: the research is read again only when b2 or b3 has just finished, the run ended, or it is another run',
      researchChanged(null, run(), NOW) && researchChanged(run(), run({ id: 'run-2' }), NOW)
      && researchChanged(run(), run({ steps: step('done', 'done', 'running') }), NOW)
      && !researchChanged(run(), run(), NOW) && !researchChanged(run({ steps: step('done', 'done', 'running') }), run({ steps: step('done', 'done', 'running') }), NOW)
      && researchChanged(run({ steps: step('done', 'done', 'running') }), run({ steps: step('done', 'done', 'done') }), NOW)
      && researchChanged(run(), run({ status: 'failed' }), NOW))
    check('S7: the three steps on screen, and why a finished run left nothing (a locked storefront wins)',
      same(progressSteps(run()).map((s) => s.state), ['done', 'running', 'pending'])
      && same(progressSteps(run({ stage: 'a', steps: [] })).map((s) => s.state), ['pending', 'pending', 'pending'])
      && same(progressSteps(run({ steps: step('done', 'failed', 'skipped') })).map((s) => s.state), ['done', 'done', 'done'])
      && emptyReason(run({ storefrontLocked: true, steps: step('done', 'done', 'done', 'market_unsupported') })) === 'storefront_locked'
      && emptyReason(run({ steps: step('done', 'failed', 'skipped', 'storefront_locked') })) === 'storefront_locked'
      && emptyReason(run({ steps: step('done', 'running', 'pending') })) === 'not_run')
  }

  // ── F) format ────────────────────────────────────────────────────────────
  console.log('\nF) money and dates in the screen\'s language')
  {
    const heMoney = formatMoney(4.8, 'ILS', 'he'), enMoney = formatMoney(4.8, 'USD', 'en'), bare = formatMoney(4.8, 'X1', 'en'), none = formatMoney(4.8, '', 'en')
    const enDate = formatResearchDate('2026-09-20T23:30:00Z', 'en'), heDate = formatResearchDate('2026-09-20T23:30:00Z', 'he')
    check('F1: a price in its currency (a bare figure when the currency is unknown), a date by its UTC day',
      heMoney.includes('₪') && heMoney.includes('4.80') && enMoney === '$4.80' && bare === '4.80' && none === '4.80'
      && enDate === 'Sep 20, 2026' && !!heDate && heDate.includes('20') && heDate.includes('2026') && /[֐-׿]/.test(heDate)
      && formatResearchDate('not a date', 'en') === null && formatResearchDate(null, 'he') === null,
      show([heMoney, enMoney, bare, enDate, heDate]))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
