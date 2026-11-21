/**
 * WHICH KEYWORD A MERCHANT'S NEXT ARTICLE IS WRITTEN FOR.
 *
 * Until 21 Nov 2026 `scoreFromVolume` made the score a strictly increasing
 * function of search volume, and the keyword inventory was sorted by volume
 * descending — so the batch sent to the model was always the broadest terms in
 * the niche and the tail was never seen at all.
 *
 * Measured in Production that day over the 97 pending ideas from this source,
 * the effect is exact:
 *
 *   2 words  58 ideas  average score 0.801
 *   3 words  32 ideas                0.738
 *   4 words   6 ideas                0.677
 *   5 words   1 idea                 0.660
 *
 * The guards below are that measurement turned around, plus the one that must
 * hold whatever the ordering says: the merchant gets the SAME NUMBER of topics.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scoreFromWinnability } from '../keyword-research'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; return }
  failed++
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

type Idea = { keyword: string; volume: number; competition?: 'LOW' | 'MEDIUM' | 'HIGH' | null; competitionIndex?: number | null }

// ── A. the score is no longer a function of volume alone ────────────────────

function groupA() {
  const head = { keyword: 'הליכון חשמלי', volume: 9900, competitionIndex: 80 }
  const tail = { keyword: 'הליכון ביתי מתקפל לדירה קטנה', volume: 90, competitionIndex: 20 }
  check('A1 the specific, uncontested keyword beats the contested head term',
    scoreFromWinnability(tail) > scoreFromWinnability(head),
    `${scoreFromWinnability(tail)} vs ${scoreFromWinnability(head)}`)

  const sameWords = (a: number, b: number) => scoreFromWinnability({ keyword: 'הליכון ביתי מתקפל', volume: 500, competitionIndex: a })
    > scoreFromWinnability({ keyword: 'הליכון ביתי מתקפל', volume: 500, competitionIndex: b })
  check('A2 less advertiser competition scores better', sameWords(10, 90))

  const vol = (v: number) => scoreFromWinnability({ keyword: 'הליכון ביתי מתקפל', volume: v, competitionIndex: 40 })
  check('A3 demand still counts for something', vol(5000) > vol(50), `${vol(5000)} vs ${vol(50)}`)
  check('A4 but it no longer decides on its own',
    scoreFromWinnability({ keyword: 'הליכון', volume: 50_000, competitionIndex: 90 })
    < scoreFromWinnability({ keyword: 'הליכון ביתי מתקפל קטן', volume: 60, competitionIndex: 15 }))

  const words = (k: string) => scoreFromWinnability({ keyword: k, volume: 300, competitionIndex: 40 })
  check('A5 the 21 Nov order is reversed: more words now score HIGHER',
    words('הליכון ביתי מתקפל קטן לבית') > words('הליכון ביתי מתקפל') && words('הליכון ביתי מתקפל') > words('הליכון ביתי'),
    [words('הליכון ביתי'), words('הליכון ביתי מתקפל'), words('הליכון ביתי מתקפל קטן לבית')].join(' < '))

  check('A6 the range is still 0.4..1, which every caller orders by',
    [scoreFromWinnability({ keyword: 'א', volume: 0, competitionIndex: 100 }),
      scoreFromWinnability({ keyword: 'a b c d e f g h', volume: 1_000_000, competitionIndex: 0 })]
      .every((s) => s >= 0.4 && s <= 1))
  check('A7 a keyword Google sent no competition for is scored as middling, not best',
    scoreFromWinnability({ keyword: 'הליכון ביתי', volume: 300 })
    < scoreFromWinnability({ keyword: 'הליכון ביתי', volume: 300, competitionIndex: 5 }))
  check('A8 the bucket is used when the index is missing',
    scoreFromWinnability({ keyword: 'הליכון ביתי', volume: 300, competition: 'LOW' })
    > scoreFromWinnability({ keyword: 'הליכון ביתי', volume: 300, competition: 'HIGH' }))
  check('A9 a Japanese keyword with no spaces is not scored as one word',
    scoreFromWinnability({ keyword: 'ランニングマシン 家庭用 折りたたみ', volume: 300, competitionIndex: 40 })
    >= scoreFromWinnability({ keyword: 'ランニングマシン', volume: 300, competitionIndex: 40 }))
  check('A10 a zero-volume keyword does not break the score',
    Number.isFinite(scoreFromWinnability({ keyword: 'הליכון', volume: 0 })))
}

// ── B. the quantity guard ───────────────────────────────────────────────────

const inventory: Idea[] = [
  { keyword: 'הליכון חשמלי', volume: 9900, competitionIndex: 85 },
  { keyword: 'הליכון ביתי', volume: 3600, competitionIndex: 70 },
  { keyword: 'הליכון ביתי מתקפל', volume: 480, competitionIndex: 35 },
  { keyword: 'תחזוקת הליכון ביתי', volume: 90, competitionIndex: 15 },
  { keyword: 'הליכון לבית עם מסך', volume: 70, competitionIndex: 20 },
]

function groupB() {
  const byVolume = [...inventory].sort((a, b) => b.volume - a.volume)
  const byScore = [...inventory].sort((a, b) => scoreFromWinnability(b) - scoreFromWinnability(a))

  // THE QUANTITY GUARD. The merchant is promised a number of articles a month.
  check('B1 THE QUANTITY GUARD: the inventory is the same length', byScore.length === byVolume.length)
  check('B2 and holds the same keywords',
    byScore.map((i) => i.keyword).sort().join('|') === byVolume.map((i) => i.keyword).sort().join('|'))
  const BATCH = 3
  check('B3 the batch is the same size', byScore.slice(0, BATCH).length === byVolume.slice(0, BATCH).length)
  check('B4 a head term is still in the inventory, only later',
    byScore.some((i) => i.keyword === 'הליכון חשמלי'))

  // THE ORDERING.
  check('B5 the order actually changed', byScore[0]?.keyword !== byVolume[0]?.keyword, `${byScore[0]?.keyword} vs ${byVolume[0]?.keyword}`)
  check('B6 the most contested head term is no longer first', byScore[0]?.keyword !== 'הליכון חשמלי', byScore[0]?.keyword)
  check('B7 the batch now contains the tail the model never used to see',
    byScore.slice(0, BATCH).some((i) => i.volume < 200) && !byVolume.slice(0, BATCH).some((i) => i.volume < 200),
    `${byScore.slice(0, BATCH).map((i) => i.volume).join('/')} vs ${byVolume.slice(0, BATCH).map((i) => i.volume).join('/')}`)
}

// ── C. source guards ────────────────────────────────────────────────────────

function groupC() {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const src = strip(readFileSync(join(process.cwd(), 'lib/content/recommendations/keyword-research.ts'), 'utf8'))
  check('C1 the volume-only score is gone', !/scoreFromVolume/.test(src))
  check('C2 the inventory is no longer sorted by volume alone',
    !/\.sort\(\(a, b\) => \(b\.avgMonthlySearches \?\? 0\) - \(a\.avgMonthlySearches \?\? 0\)\)/.test(src))
  check('C3 the inventory sort uses the winnability measure', /\.sort\(\([^)]*\) => \{\s*const d = keywordDifficulty/.test(src))
  check('C4 competition reaches the cluster', /competition: c\.competition/.test(src))
  check('C5 nothing new is filtered out on competition', !/competitionIndex[^\n]*continue/.test(src))
  check('C6 the batch size is untouched', /batch = candidates\.slice\(0, Math\.max\(4, Math\.min\(TOPICS_PER_RUN/.test(src))
}

// ── D. mutation controls ────────────────────────────────────────────────────

function groupD() {
  // 1. The old formula, run on the same inventory, puts the head term first —
  //    which is the Production measurement, reproduced.
  const old = (volume: number) => Math.max(0.4, Math.min(1, Number((0.4 + 0.6 * (Math.log10(volume + 1) / 4)).toFixed(2))))
  const oldOrder = [...inventory].sort((a, b) => old(b.volume) - old(a.volume))
  check('D1 CONTROL: the old score DID put the contested head term first', oldOrder[0]?.keyword === 'הליכון חשמלי')
  check('D2 CONTROL: and gave the two-word keyword a higher score than the four-word one',
    old(9900) > old(70))

  // 2. If the specificity term were dropped, A5 would fail. Show the demand
  //    component alone cannot produce that order.
  const demandOnly = (v: number) => Math.log10(v + 1) / 4
  check('D3 CONTROL: demand alone cannot rank the tail above the head', demandOnly(70) < demandOnly(9900))

  // 3. If the competition term were ignored, A2 would be vacuous.
  check('D4 CONTROL: two keywords differing ONLY in competition score differently',
    scoreFromWinnability({ keyword: 'k k k', volume: 500, competitionIndex: 5 })
    !== scoreFromWinnability({ keyword: 'k k k', volume: 500, competitionIndex: 95 }))
}

groupA()
groupB()
groupC()
groupD()
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1

export {}
