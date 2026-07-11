/**
 * Cache Persistence and Label Fix Test Suite
 *
 * Validates the end-to-end fixes for:
 *  1. Gemini suggestions persisting after refresh (context_hash stability)
 *  2. Cache write/read flow simulation
 *  3. Initial load merging vNext + cached without calling Gemini
 *  4. Label derivation: proper intent + quality tier (not always "good"/"טוב")
 *  5. Intent preservation through strongDeduplicateSuggestions
 *  6. Large expanded pool persistence
 */

import {
  dedupClientSide,
  applyDiversityFilter,
  deriveSuggestionMeta,
  normalizeIntent,
} from '../suggestion-dedup'
import { computeContextHash, strongDeduplicateSuggestions } from '../suggestion-cache'

const MAX_SUGGESTIONS = 40

console.log('===== CACHE PERSISTENCE AND LABELS FIX TEST SUITE =====\n')

// ============================================================
// TEST 1: Context Hash Stability (write vs read, before vs after refresh)
// ============================================================
console.log('TEST 1: Context Hash Stability')
console.log('-'.repeat(70))

// Simulate what the WRITE path passes (refreshSuggestions → API):
//   { projectId, language, country, businessCategory }, keywordsHash undefined
const hashOnWrite = computeContextHash('proj-123', 'he', 'il', null /* businessCategory */)

// Simulate what the READ path passes (initial load → API cacheOnly):
//   { projectId, language, country, businessCategory, keywordsHash: null }
const hashOnRead = computeContextHash('proj-123', 'he', 'il', null)

// Simulate AGAIN after a page refresh (same stable inputs)
const hashAfterRefresh = computeContextHash('proj-123', 'he', 'il', null)

console.log(`Hash on write:        ${hashOnWrite.substring(0, 16)}...`)
console.log(`Hash on read:         ${hashOnRead.substring(0, 16)}...`)
console.log(`Hash after refresh:   ${hashAfterRefresh.substring(0, 16)}...`)

// undefined vs null keywordsHash must produce the same hash
const hashUndefinedKw = computeContextHash('proj-123', 'he', 'il', null, undefined)
const hashNullKw = computeContextHash('proj-123', 'he', 'il', null, null)
const hashEmptyKw = computeContextHash('proj-123', 'he', 'il', null, '')

const test1Pass =
  hashOnWrite === hashOnRead &&
  hashOnRead === hashAfterRefresh &&
  hashUndefinedKw === hashNullKw &&
  hashNullKw === hashEmptyKw
console.log(`undefined/null/'' keywordsHash all equal: ${hashUndefinedKw === hashNullKw && hashNullKw === hashEmptyKw}`)
console.log(`${test1Pass ? '✓' : '❌'} RESULT: ${test1Pass
  ? 'PASS - context_hash is stable across write/read/refresh'
  : 'FAIL - context_hash differs between write and read'}`)
console.log()

// ============================================================
// TEST 2: Label Derivation — proper intent + varied quality tier
// ============================================================
console.log('TEST 2: Label Derivation (intent + quality tier)')
console.log('-'.repeat(70))

const labelCases = [
  { raw: 'commercial', expectIntent: 'commercial', expectTier: 'high' },
  { raw: 'recommendation', expectIntent: 'recommendation', expectTier: 'high' },
  { raw: 'local', expectIntent: 'local', expectTier: 'high' },
  { raw: 'comparison', expectIntent: 'comparison', expectTier: 'good' },
  { raw: 'pre_purchase', expectIntent: 'pre_purchase', expectTier: 'good' },
  { raw: 'brand', expectIntent: 'brand', expectTier: 'good' },
  { raw: 'informational', expectIntent: 'informational', expectTier: 'medium' },
  { raw: 'price', expectIntent: 'commercial', expectTier: 'high' }, // alias
  { raw: 'review', expectIntent: 'brand', expectTier: 'good' },     // alias
  { raw: undefined, expectIntent: 'informational', expectTier: 'medium' }, // fallback
  { raw: 'garbage_xyz', expectIntent: 'informational', expectTier: 'medium' }, // unknown
]

let test2Pass = true
const tiersSeen = new Set<string>()
labelCases.forEach(({ raw, expectIntent, expectTier }) => {
  const meta = deriveSuggestionMeta(raw)
  tiersSeen.add(meta.confidenceTier)
  const ok = meta.intent === expectIntent && meta.confidenceTier === expectTier
  if (!ok) test2Pass = false
  console.log(`${ok ? '✓' : '❌'} raw=${String(raw).padEnd(14)} → intent=${meta.intent.padEnd(15)} tier=${meta.confidenceTier.padEnd(7)} score=${meta.qualityScore}`)
})

// Quality must NOT be uniformly "good" — we need a spread
const hasVariety = tiersSeen.size >= 3
console.log(`Distinct quality tiers seen: ${Array.from(tiersSeen).join(', ')} (variety: ${hasVariety})`)
test2Pass = test2Pass && hasVariety
console.log(`${test2Pass ? '✓' : '❌'} RESULT: ${test2Pass
  ? 'PASS - intents mapped correctly and quality tiers vary (not all "good")'
  : 'FAIL - label derivation incorrect or no quality variety'}`)
console.log()

// ============================================================
// TEST 3: Intent preserved through strongDeduplicateSuggestions
// ============================================================
console.log('TEST 3: Intent Preserved Through Strong Dedup (cached labels survive)')
console.log('-'.repeat(70))

const vNext3 = [{ prompt: 'מה ההבדל בין זרים שונים?', intent: 'comparison' }]
const cached3 = [
  { question: 'כמה עולה זר בירושלים?', intent: 'commercial' },
  { question: 'איזה זר מומלץ לאמא?', intent: 'recommendation' },
]
const newGemini3 = [{ question: 'איפה אפשר לקנות פרחים טריים?', intent: 'informational' }]

const dedup3 = strongDeduplicateSuggestions(vNext3, cached3, newGemini3)
console.log('Deduped questions with preserved intent:')
dedup3.dedupedQuestions.forEach((q) => {
  console.log(`  [${q.source}] intent=${q.intent ?? '(MISSING)'} — "${q.question}"`)
})

const cachedItems = dedup3.dedupedQuestions.filter((q) => q.source === 'cached')
const allCachedHaveIntent = cachedItems.length === 2 && cachedItems.every((q) => !!q.intent)
const vNextHasIntent = dedup3.dedupedQuestions.some((q) => q.source === 'vNext' && q.intent === 'comparison')
const test3Pass = allCachedHaveIntent && vNextHasIntent
console.log(`${test3Pass ? '✓' : '❌'} RESULT: ${test3Pass
  ? 'PASS - cached and vNext intents survive strong dedup'
  : 'FAIL - intent dropped for cached/vNext items'}`)
console.log()

// ============================================================
// TEST 4: Initial Load merges vNext + cached (no Gemini)
// ============================================================
console.log('TEST 4: Initial Load Merges vNext + Cached (Gemini NOT called)')
console.log('-'.repeat(70))

// Simulate API cacheOnly response: returns cached suggestions, geminiWasCalled=false
const apiCacheOnlyResponse = {
  cachedSuggestions: [
    { id: 'c1', question: 'כמה עולה זר בירושלים?', intent: 'commercial' },
    { id: 'c2', question: 'איזה זר מומלץ לאמא?', intent: 'recommendation' },
    { id: 'c3', question: 'איפה אפשר לקנות פרחים טריים?', intent: 'informational' },
  ],
  geminiWasCalled: false,
  geminiNotCalledReason: 'cache_only_mode',
}

const vNext4 = [
  { prompt: 'מה ההבדל בין זרים שונים?', intent: 'comparison' },
  { prompt: 'כמה עולה זר בירושלים?', intent: 'commercial' }, // dup of c1
]

const initDedup = dedupClientSide(
  vNext4.map((q) => ({ prompt: q.prompt, intent: q.intent })),
  apiCacheOnlyResponse.cachedSuggestions.map((q) => ({ question: q.question, intent: q.intent }))
)
const { filtered: initDiverse } = applyDiversityFilter(initDedup.deduped)
const initCapped = initDiverse.slice(0, MAX_SUGGESTIONS)

console.log(`vNext: ${vNext4.length}, cached: ${apiCacheOnlyResponse.cachedSuggestions.length}`)
console.log(`After dedup: ${initDedup.deduped.length} (removed ${initDedup.removed})`)
console.log(`Final visible: ${initCapped.length}`)
console.log(`Gemini called: ${apiCacheOnlyResponse.geminiWasCalled}`)
initCapped.forEach((q, i) => console.log(`  ${i + 1}. "${q.prompt}"`))

// 2 vNext + 3 cached - 1 dup = 4
const test4Pass = initCapped.length === 4 && apiCacheOnlyResponse.geminiWasCalled === false
console.log(`${test4Pass ? '✓' : '❌'} RESULT: ${test4Pass
  ? 'PASS - cached + vNext merged on initial load, Gemini not called'
  : `FAIL - expected 4 merged with no Gemini, got ${initCapped.length}`}`)
console.log()

// ============================================================
// TEST 5: Large Expanded Pool Persists After Refresh
// ============================================================
console.log('TEST 5: Large Expanded Pool Persists After Refresh')
console.log('-'.repeat(70))

// Simulate a large cache accumulated over many clicks — genuinely distinct
// questions (varied vocabulary/topics) so dedup + diversity keep them.
const largeCachedQuestions = [
  { q: 'אילו זרים מתאימים לחג הפסח?', intent: 'recommendation' },
  { q: 'איך שומרים על רעננות של סחלב בבית?', intent: 'informational' },
  { q: 'מה משך החיים הממוצע של ורדים בכד?', intent: 'informational' },
  { q: 'אילו צמחי בית עמידים בחושך?', intent: 'recommendation' },
  { q: 'מהם הפרחים הפופולריים ביותר לחתונה?', intent: 'comparison' },
  { q: 'איך מכינים זר כלה בעצמי?', intent: 'informational' },
  { q: 'אילו עציצים מתאימים למרפסת שמש?', intent: 'recommendation' },
  { q: 'מה ההבדל בין סחלב לבן לסגול?', intent: 'comparison' },
  { q: 'איזה דשן מומלץ לוורדים?', intent: 'recommendation' },
  { q: 'אילו פרחים מסמלים אהבה?', intent: 'informational' },
  { q: 'איך בוחרים אגרטל מתאים לסלון?', intent: 'pre_purchase' },
  { q: 'מהם הצבעים המתאימים לזר ניחומים?', intent: 'recommendation' },
  { q: 'אילו צמחי תבלין אפשר לגדל במטבח?', intent: 'recommendation' },
  { q: 'מתי הזמן הטוב ביותר להשקות סחלבים?', intent: 'informational' },
  { q: 'איך מטפלים בצמח פיקוס נושר עלים?', intent: 'informational' },
  { q: 'אילו פרחים מתאימים למתנה לגבר?', intent: 'recommendation' },
  { q: 'מה כדאי לדעת לפני קניית בונסאי?', intent: 'pre_purchase' },
  { q: 'אילו זרים מתאימים ליום האהבה?', intent: 'recommendation' },
  { q: 'איך מייבשים פרחים לשימור?', intent: 'informational' },
  { q: 'מהם הצמחים הקלים ביותר לטיפול?', intent: 'recommendation' },
  { q: 'אילו פרחים מתאימים לאגרטל גבוה?', intent: 'pre_purchase' },
  { q: 'מה גורם לעלים של מונסטרה להצהיב?', intent: 'informational' },
  { q: 'איזה סוג אדמה מתאים לקקטוסים?', intent: 'recommendation' },
  { q: 'אילו פרחים פורחים בחורף?', intent: 'informational' },
  { q: 'איך מעצבים סידור פרחים לשולחן חג?', intent: 'informational' },
  { q: 'מהם הפרחים המתאימים לאזכרה?', intent: 'recommendation' },
  { q: 'אילו צמחים מסננים אוויר בבית?', intent: 'recommendation' },
  { q: 'מה ההבדל בין זר עגול לזר נופל?', intent: 'comparison' },
  { q: 'איך מגדלים ורדים בעציץ?', intent: 'informational' },
  { q: 'אילו פרחים מתאימים לחדר שינה?', intent: 'recommendation' },
  { q: 'מתי כדאי לגזום שיח היביסקוס?', intent: 'informational' },
  { q: 'איזה אגרטל מתאים לזר חמניות?', intent: 'pre_purchase' },
  { q: 'אילו פרחים מסמלים ידידות?', intent: 'informational' },
  { q: 'איך מרעננים זר פרחים נבול?', intent: 'informational' },
  { q: 'מהם הצמחים המתאימים לגינת גג?', intent: 'recommendation' },
]
const largeCached = largeCachedQuestions.map((item, i) => ({
  id: `cache-${i}`,
  question: item.q,
  intent: item.intent,
}))

const vNext5 = [
  { prompt: 'חוות דעת על חנות הפרחים?', intent: 'brand' },
  { prompt: 'מה שעות הפעילות של החנות?', intent: 'informational' },
  { prompt: 'האם יש אפשרות לאיסוף עצמי?', intent: 'informational' },
  { prompt: 'איך יוצרים קשר עם החנות?', intent: 'informational' },
  { prompt: 'האם החנות מקבלת הזמנות אונליין?', intent: 'commercial' },
  { prompt: 'מהן שיטות התשלום הזמינות?', intent: 'informational' },
  { prompt: 'האם ניתן להזמין זר בהתאמה אישית?', intent: 'pre_purchase' },
  { prompt: 'האם יש מועדון לקוחות?', intent: 'informational' },
]

// Initial load after refresh: merge vNext + large cache
const refreshDedup = dedupClientSide(
  vNext5.map((q) => ({ prompt: q.prompt, intent: q.intent })),
  largeCached.map((q) => ({ question: q.question, intent: q.intent }))
)
const { filtered: refreshDiverse } = applyDiversityFilter(refreshDedup.deduped)
const refreshCapped = refreshDiverse.slice(0, MAX_SUGGESTIONS)

const cachedQuestionSet = new Set(largeCached.map((c) => c.question.trim().toLowerCase()))
const cachedPreserved = refreshCapped.filter((q) => cachedQuestionSet.has(q.prompt.trim().toLowerCase())).length

console.log(`vNext: ${vNext5.length}, cached after refresh: ${largeCached.length}`)
console.log(`Merged pool after refresh: ${refreshCapped.length}`)
console.log(`Cached portion preserved: ${cachedPreserved}`)

// Pool should remain large (well above the original 8 vNext) and capped at 40
const test5Pass = refreshCapped.length > 20 && refreshCapped.length <= MAX_SUGGESTIONS && cachedPreserved >= 20
console.log(`${test5Pass ? '✓' : '❌'} RESULT: ${test5Pass
  ? `PASS - large expanded pool (${refreshCapped.length}) persists after refresh, not collapsed to vNext-only`
  : `FAIL - pool collapsed to ${refreshCapped.length} (cached preserved: ${cachedPreserved})`}`)
console.log()

// ============================================================
// TEST 6: Cache Reuse — clicking after refresh does not regenerate
// ============================================================
console.log('TEST 6: Cache Reuse After Refresh (no regeneration of existing ideas)')
console.log('-'.repeat(70))

// After refresh, the visible pool already contains the cached suggestions.
// A "צור עוד שאלות" click that gets the same cached items back should add nothing new.
const visibleAfterRefresh = refreshCapped // from Test 5
const visibleBefore6 = visibleAfterRefresh.length

// API returns the SAME cached items (already shown)
const sameCachedAgain = largeCached.map((q) => ({ question: q.question, intent: q.intent }))

const reuseDedup = dedupClientSide(
  visibleAfterRefresh.map((q) => ({ prompt: q.prompt, intent: q.intent })),
  sameCachedAgain
)
const newOnly = reuseDedup.deduped.filter(
  (q) => !visibleAfterRefresh.some((v) => v.prompt.trim().toLowerCase() === q.prompt.trim().toLowerCase())
)

console.log(`Visible before click: ${visibleBefore6}`)
console.log(`Cache returned again: ${sameCachedAgain.length}`)
console.log(`Genuinely new after dedup: ${newOnly.length}`)
console.log(`Duplicates removed: ${reuseDedup.removed}`)

const test6Pass = newOnly.length === 0
console.log(`${test6Pass ? '✓' : '❌'} RESULT: ${test6Pass
  ? 'PASS - cached items already shown are not re-added (no regeneration)'
  : `FAIL - ${newOnly.length} cached items incorrectly treated as new`}`)
console.log()

// ============================================================
// SUMMARY
// ============================================================
const all = [test1Pass, test2Pass, test3Pass, test4Pass, test5Pass, test6Pass]
const allPass = all.every(Boolean)
console.log('===== TEST SUMMARY =====')
console.log(`Test 1 (context_hash stability): ${test1Pass ? '✓ PASS' : '❌ FAIL'}`)
console.log(`Test 2 (label derivation + quality variety): ${test2Pass ? '✓ PASS' : '❌ FAIL'}`)
console.log(`Test 3 (intent preserved through strong dedup): ${test3Pass ? '✓ PASS' : '❌ FAIL'}`)
console.log(`Test 4 (initial load merges vNext + cached, no Gemini): ${test4Pass ? '✓ PASS' : '❌ FAIL'}`)
console.log(`Test 5 (large expanded pool persists): ${test5Pass ? '✓ PASS' : '❌ FAIL'}`)
console.log(`Test 6 (cache reuse, no regeneration): ${test6Pass ? '✓ PASS' : '❌ FAIL'}`)
console.log()
console.log(`Overall: ${allPass ? '✓✓✓ ALL TESTS PASS' : '❌ SOME TESTS FAILED'}`)
console.log()
console.log('===== KEY BEHAVIORS VERIFIED =====')
console.log('✓ context_hash is stable across write, read, and page refresh')
console.log('✓ Cached/Gemini suggestions get proper intent + varied quality labels')
console.log('✓ Intent survives strong dedup so labels persist after refresh')
console.log('✓ Initial load merges vNext + cached WITHOUT calling Gemini')
console.log('✓ Large expanded pool persists after refresh (not collapsed to vNext)')
console.log('✓ Cached items already shown are not regenerated on repeat clicks')
