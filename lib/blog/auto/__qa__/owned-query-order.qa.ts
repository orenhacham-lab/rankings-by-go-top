/**
 * THE QUEUE PREFERS A QUERY WE DO NOT ALREADY OWN — AND NEVER DROPS ONE.
 *
 * The fixtures are the real owned queries from the 21 Nov 2026 reading of our
 * own property: "בדיקת מיקומים בגוגל" (8 of our pages, 1,377 impressions),
 * "תוכנה לבדיקת מיקומים" (an article of ours at position 8.3) and
 * "בדיקת מיקום בגוגל" (a feature page at 19.6).
 *
 * The guard that matters most is B1, THE QUANTITY GUARD: the set of keywords
 * the research can produce is identical with the penalty and without it. The
 * blog publishes every day in all 11 languages and a check that can empty the
 * queue is not allowed to exist.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import {
  OWNED_OVERLAP, OWNED_QUERY_PENALTY, keywordDifficulty, ownedQueryPenalty, selectKeywords,
} from '../keyword-plan'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; return }
  failed++
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

const idea = (keyword: string, avgMonthlySearches: number, competitionIndex = 30): KeywordIdeaResult => ({
  keyword,
  avgMonthlySearches,
  competition: 'LOW',
  competitionIndex,
  lowTopOfPageBid: null,
  highTopOfPageBid: null,
  currency: 'ILS',
})

/** The queries our own pages hold, as measured. */
const OWNED = ['בדיקת מיקומים בגוגל', 'תוכנה לבדיקת מיקומים', 'בדיקת מיקום בגוגל']

// ── A. the penalty itself ───────────────────────────────────────────────────

function groupA() {
  check('A1 the same query is the same territory', ownedQueryPenalty('בדיקת מיקומים בגוגל', OWNED) === OWNED_QUERY_PENALTY)
  check('A2 so is a wording of it', ownedQueryPenalty('בדיקת מיקומים בגוגל בחינם', OWNED) === OWNED_QUERY_PENALTY,
    String(ownedQueryPenalty('בדיקת מיקומים בגוגל בחינם', OWNED)))
  check('A3 a different subject is untouched', ownedQueryPenalty('מחקר מילות מפתח', OWNED) === 0)
  check('A4 nothing owned, nothing applied', ownedQueryPenalty('בדיקת מיקומים בגוגל', []) === 0)
  check('A5 an absent list is not an error', ownedQueryPenalty('בדיקת מיקומים בגוגל', undefined) === 0)
  check('A6 an empty keyword is not matched against anything', ownedQueryPenalty('', OWNED) === 0)
  check('A7 the threshold is looser than "the same article"', OWNED_OVERLAP < 0.8, String(OWNED_OVERLAP))
  check('A8 the penalty is large enough to reorder a queue', OWNED_QUERY_PENALTY >= 10, String(OWNED_QUERY_PENALTY))
  // An owned keyword and a free one of the same shape — same word count, same
  // competition, same volume — score identically, because `keywordDifficulty`
  // cannot see the owned list at all. That is what keeps `planRowDifficulty`,
  // which shares it, from reordering rows that were queued before the reading.
  check('A9 the penalty is NOT inside keywordDifficulty, so queued rows are not reordered',
    keywordDifficulty(idea('בדיקת מיקומים בגוגל', 300), 'he') === keywordDifficulty(idea('מחקר מילות מפתח', 300), 'he'),
    `${keywordDifficulty(idea('בדיקת מיקומים בגוגל', 300), 'he')} vs ${keywordDifficulty(idea('מחקר מילות מפתח', 300), 'he')}`)
}

// ── B. the quantity guard, and the ordering ─────────────────────────────────

const ideas = [
  idea('בדיקת מיקומים בגוגל', 2400),
  idea('תוכנה לבדיקת מיקומים', 880),
  idea('דוח מיקומים חודשי לקוח', 170),
  idea('מעקב מיקומים בוויז', 140),
]

function groupB() {
  const without = selectKeywords({ locale: 'he', ideas, taken: [], limit: 10 })
  const with_ = selectKeywords({ locale: 'he', ideas, taken: [], limit: 10, owned: OWNED })

  // THE QUANTITY GUARD.
  check('B1 THE QUANTITY GUARD: exactly as many keywords survive', with_.length === without.length,
    `${with_.length} vs ${without.length}`)
  check('B2 and they are the same keywords',
    [...with_.map((k) => k.keyword)].sort().join('|') === [...without.map((k) => k.keyword)].sort().join('|'))
  check('B3 an owned query is still in the queue', with_.some((k) => k.keyword === 'בדיקת מיקומים בגוגל'))

  // THE ORDERING.
  check('B4 a query we do not own comes first', with_[0] && !OWNED.includes(with_[0].keyword), with_[0]?.keyword)
  const place = (list: { keyword: string }[], k: string) => list.findIndex((x) => x.keyword === k)
  // "בדיקת מיקומים בגוגל" is last in the baseline order already — 2,400
  // searches a month earns it the head-term penalty — so the keyword that
  // shows the move is the other owned one, second without the penalty.
  check('B5 the owned query moved back', place(with_, 'תוכנה לבדיקת מיקומים') > place(without, 'תוכנה לבדיקת מיקומים'),
    `${place(with_, 'תוכנה לבדיקת מיקומים')} vs ${place(without, 'תוכנה לבדיקת מיקומים')}`)
  check('B6 both owned queries are behind both free ones',
    with_.slice(0, 2).every((k) => !OWNED.includes(k.keyword)) && with_.slice(2).every((k) => OWNED.includes(k.keyword)),
    with_.map((k) => k.keyword).join(' | '))

  // A QUEUE OF NOTHING BUT OWNED QUERIES STILL PRODUCES ARTICLES.
  const allOwned = selectKeywords({
    locale: 'he',
    ideas: [idea('בדיקת מיקומים בגוגל', 2400), idea('תוכנה לבדיקת מיקומים', 880), idea('בדיקת מיקום בגוגל', 500)],
    taken: [], limit: 10, owned: OWNED,
  })
  check('B7 a research response that is ALL owned queries still fills the queue', allOwned.length === 3, String(allOwned.length))

  // The limit is still the limit, and the volume floor still the floor.
  check('B8 the limit is respected', selectKeywords({ locale: 'he', ideas, taken: [], limit: 2, owned: OWNED }).length === 2)
  check('B9 a keyword already taken is still blocked, penalty or not',
    !selectKeywords({ locale: 'he', ideas, taken: ['בדיקת מיקומים בגוגל'], limit: 10, owned: OWNED })
      .some((k) => k.keyword === 'בדיקת מיקומים בגוגל'))
}

// ── C. source guards on the runner ──────────────────────────────────────────

function groupC() {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const runner = strip(readFileSync(join(process.cwd(), 'lib/blog/auto/runner.ts'), 'utf8'))
  check('C1 the reading cannot stop the top-up: it is inside a try/catch that returns []',
    /async function readOwnedQueries[\s\S]*?catch\s*{\s*return \[\]\s*}/.test(runner))
  check('C2 the owned list reaches selectKeywords', /selectKeywords\(\{[^}]*owned\b/.test(runner))
  check('C3 and nothing in the top-up throws on it', !/await readOwnedQueries\(admin\)\s*\n\s*if \(!owned/.test(runner))
  const plan = strip(readFileSync(join(process.cwd(), 'lib/blog/auto/keyword-plan.ts'), 'utf8'))
  check('C4 the penalty never rejects a candidate',
    !/ownedQueryPenalty\([^)]*\)[^\n]*continue/.test(plan) && !/owned[^\n]*\)\)\s*continue/.test(plan))
}

// ── D. mutation controls ────────────────────────────────────────────────────

function groupD() {
  // 1. If the penalty were a filter, B1 would fail. Show what a filter does.
  const filtered = ideas.filter((i) => !ownedQueryPenalty(i.keyword ?? '', OWNED))
  check('D1 CONTROL: a filter WOULD have shrunk the queue', filtered.length < ideas.length, `${filtered.length} of ${ideas.length}`)

  // 2. If the penalty were zero the order would not change at all.
  const unchanged = selectKeywords({ locale: 'he', ideas, taken: [], limit: 10, owned: [] })
  const changed = selectKeywords({ locale: 'he', ideas, taken: [], limit: 10, owned: OWNED })
  check('D2 CONTROL: with no owned queries the order is untouched, with them it is not',
    unchanged.map((k) => k.keyword).join('|') !== changed.map((k) => k.keyword).join('|'))

  // 3. If the threshold were 1.0, only an exact string would match and the
  //    wording in A2 would slip through.
  check('D3 CONTROL: the threshold catches a wording, not only an exact string',
    ownedQueryPenalty('בדיקת מיקומים בגוגל בחינם', OWNED) > 0 && ownedQueryPenalty('בדיקת מיקומים בגוגל', ['משהו אחר לגמרי']) === 0)

  // 4. The penalty must not be so small that one extra word in the keyword
  //    cancels it — the tail bonus is 10 a word.
  check('D4 CONTROL: one extra word does not cancel the penalty', OWNED_QUERY_PENALTY > 10, String(OWNED_QUERY_PENALTY))
}

groupA()
groupB()
groupC()
groupD()
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1

export {}
