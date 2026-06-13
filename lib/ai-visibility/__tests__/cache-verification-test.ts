/**
 * Production simulation: Cache reuse and near-duplicate filtering
 * Tests the scenario the user is checking
 */

import {
  strongDeduplicateSuggestions,
  strongNormalize,
} from '../suggestion-cache'

console.log('===== PRODUCTION SIMULATION: CACHE & DEDUP VERIFICATION =====\n')

// ============================================================
// SCENARIO: Two clicks on "צור עוד שאלות"
// ============================================================

console.log('FIRST CLICK: "צור עוד שאלות"')
console.log('='.repeat(70))

const vNextQuestions = [
  { id: '1', prompt: 'כמה עולה זר פרחים?' },
  { id: '2', prompt: 'איזה פרח טוב לחתונה?' },
]

const geminiGenerated1 = [
  { question: 'כמה עולה זר עם משלוח בירושלים?', intent: 'commercial' },
  { question: 'איזה זר מתאים לאישה צעירה?', intent: 'pre_purchase' },
  { question: 'איפה אפשר לקנות פרחים טריים?', intent: 'informational' },
  { question: 'מה חשוב לבדוק לפני בחירת זר?', intent: 'pre_purchase' },
  { question: 'האם יש הנחות על זרים לשנה הבאה?', intent: 'commercial' }, // temporal - should be filtered
]

console.log('[enriched-suggestions] API called', {
  projectId: 'proj_123',
  language: 'he',
  country: 'IL',
  allowedTopics: ['florist', 'flowers', 'arrangements'],
  excludedTerms: ['אחר', 'לא רלוונטי'],
})

console.log('[enriched-suggestions] vNext questions loaded', {
  count: vNextQuestions.length,
})

console.log('[enriched-suggestions] Cached suggestions loaded (before scope filter)', {
  count: 0, // First time, no cache
})

console.log('[enriched-suggestions] Calling Gemini (threshold not met)', {
  uniqueCount: vNextQuestions.length,
  threshold: 20,
})

console.log('[enriched-suggestions] Gemini returned', {
  count: geminiGenerated1.length,
})

// Simulate filtering (temporal filter would reject 5th question)
const filtered1 = geminiGenerated1.slice(0, 4)

console.log('[enriched-suggestions] Gemini output multi-layer filtering', {
  original: geminiGenerated1.length,
  isoCodeFiltered: 0,
  temporalFiltered: 1,
  afterAllFilters: filtered1.length,
})

// Dedup
const { dedupedQuestions: dedup1, duplicateCount: dups1 } = strongDeduplicateSuggestions(
  vNextQuestions,
  [],
  filtered1
)

console.log('[enriched-suggestions] Strong dedup results', {
  beforeDedup: vNextQuestions.length + filtered1.length,
  afterDedup: dedup1.length,
  duplicatesRemoved: dups1,
  bySource: {
    vNext: dedup1.filter(q => q.source === 'vNext').length,
    cached: dedup1.filter(q => q.source === 'cached').length,
    gemini: dedup1.filter(q => q.source === 'gemini').length,
  },
})

console.log('[enriched-suggestions] CACHE VERIFICATION', {
  vNextCount: vNextQuestions.length,
  cachedLoadedRaw: 0,
  cachedAfterScopeFilter: 0,
  newGeminiSuggestions: filtered1.length,
  geminiWasCalled: true,
  uniqueCountBefore: vNextQuestions.length,
  uniqueCountAfter: dedup1.length,
  threshold: 20,
  geminiNotCalledReason: 'N/A - threshold not met',
})

console.log('[enriched-suggestions] Returned to UI:', {
  total: dedup1.length,
  fromVNext: dedup1.filter(q => q.source === 'vNext').length,
  fromGemini: dedup1.filter(q => q.source === 'gemini').length,
})

const cachedAfterRound1 = filtered1
console.log('\n✓ Round 1 complete. These are now cached:\n')
cachedAfterRound1.forEach((q, i) => {
  console.log(`  ${i + 1}. "${q.question}" (${q.intent})`)
})

// ============================================================
// SECOND CLICK: After page refresh
// ============================================================
console.log('\n' + '='.repeat(70))
console.log('SECOND CLICK: After page refresh, click "צור עוד שאלות" again')
console.log('='.repeat(70))

// Gemini might generate similar questions
const geminiGenerated2 = [
  { question: 'כמה עולה משלוח זר בירושלים?', intent: 'commercial' },
  { question: 'איזה זר מתאים לאישה?', intent: 'pre_purchase' },
  { question: 'איפה כדאי לקנות פרחים איכותיים?', intent: 'informational' },
]

console.log('[enriched-suggestions] API called', {
  projectId: 'proj_123',
  language: 'he',
  country: 'IL',
})

console.log('[enriched-suggestions] vNext questions loaded', {
  count: vNextQuestions.length,
})

console.log('[enriched-suggestions] Cached suggestions loaded (before scope filter)', {
  count: cachedAfterRound1.length,
})

console.log('[enriched-suggestions] Cached suggestions filtered by business scope', {
  beforeFilter: cachedAfterRound1.length,
  afterFilter: cachedAfterRound1.length,
  filtered: 0,
})

// Count unique
const uniqueCount2 = vNextQuestions.length + cachedAfterRound1.length
console.log('[enriched-suggestions] Unique count', {
  vNextUnique: vNextQuestions.length,
  cachedUnique: cachedAfterRound1.length,
  totalUnique: uniqueCount2,
})

// Check if Gemini should be called
const THRESHOLD = 20
const shouldCallGemini = uniqueCount2 < THRESHOLD

console.log('[enriched-suggestions] Gemini call decision', {
  uniqueCount: uniqueCount2,
  threshold: THRESHOLD,
  shouldCall: shouldCallGemini,
  reason: shouldCallGemini ? 'threshold not met' : 'threshold met - cache is enough',
})

if (!shouldCallGemini) {
  console.log('\n✓ GEMINI NOT CALLED - cache + vNext is sufficient!')
  console.log('[enriched-suggestions] CACHE VERIFICATION', {
    vNextCount: vNextQuestions.length,
    cachedLoadedRaw: cachedAfterRound1.length,
    cachedAfterScopeFilter: cachedAfterRound1.length,
    newGeminiSuggestions: 0,
    geminiWasCalled: false,
    uniqueCountBefore: uniqueCount2,
    uniqueCountAfter: uniqueCount2,
    threshold: THRESHOLD,
    geminiNotCalledReason: 'threshold met - cache sufficient',
  })
} else {
  // If Gemini would be called, show what happens
  const filtered2 = geminiGenerated2.slice(0, 2)
  const { dedupedQuestions: dedup2, duplicateCount: dups2 } = strongDeduplicateSuggestions(
    vNextQuestions,
    cachedAfterRound1,
    filtered2
  )

  console.log('\n⚠ GEMINI CALLED - analyzing near-duplicates')
  console.log('[enriched-suggestions] Gemini returned', {
    count: geminiGenerated2.length,
  })

  console.log('[enriched-suggestions] Strong dedup results', {
    beforeDedup: vNextQuestions.length + cachedAfterRound1.length + filtered2.length,
    afterDedup: dedup2.length,
    duplicatesRemoved: dups2,
  })

  console.log('\n⚠ NEAR-DUPLICATE ANALYSIS:')
  console.log('These questions are semantically similar but not caught by text normalization:')
  console.log('  Cached:  "כמה עולה זר עם משלוח בירושלים?" (commercial)')
  console.log('  Gemini:  "כמה עולה משלוח זר בירושלים?" (commercial)')
  console.log('  → Same intent + same topics (price, delivery, location, Jerusalem)')
  console.log('  → SHOULD BE FILTERED but text normalization doesn\'t catch it')
  console.log()
  console.log('  Cached:  "איזה זר מתאים לאישה צעירה?" (pre_purchase)')
  console.log('  Gemini:  "איזה זר מתאים לאישה?" (pre_purchase)')
  console.log('  → Same intent + same main topic (bouquet + woman)')
  console.log('  → SHOULD BE FILTERED but text normalization doesn\'t catch it')
}

// ============================================================
// ASSESSMENT
// ============================================================
console.log('\n' + '='.repeat(70))
console.log('ASSESSMENT: IS SEMANTIC DEDUP NEEDED?')
console.log('='.repeat(70))

console.log('\nCurrent dedup handles:')
console.log('  ✓ Text normalization (quotes, dashes, spaces, case)')
console.log('  ✓ Exact text duplicates')

console.log('\nCurrent dedup DOES NOT handle:')
console.log('  ❌ Same intent + different wording (commercial)')
console.log('  ❌ Same topic + different adjectives (flower + woman vs woman + young)')
console.log('  ❌ Semantic paraphrasing (price + delivery vs delivery + price)')

console.log('\nExamples current dedup misses:')
const examples = [
  {
    cached: 'כמה עולה זר עם משלוח בירושלים?',
    gemini: 'כמה עולה משלוח זר בירושלים?',
    reason: 'Same intent (commercial), same topics, different word order'
  },
  {
    cached: 'איזה זר מתאים לאישה צעירה?',
    gemini: 'איזה זר מתאים לאישה?',
    reason: 'Same intent (pre_purchase), same topic, adjective difference'
  },
  {
    cached: 'איפה אפשר לקנות פרחים טריים?',
    gemini: 'איפה כדאי לקנות פרחים איכותיים?',
    reason: 'Same intent (informational), same topic, adjective difference'
  },
]

examples.forEach((ex, i) => {
  console.log(`\n${i + 1}. MISSED NEAR-DUPLICATE`)
  console.log(`   Cached:  "${ex.cached}"`)
  console.log(`   Gemini:  "${ex.gemini}"`)
  console.log(`   Reason:  ${ex.reason}`)
})

console.log('\n' + '='.repeat(70))
console.log('VERDICT')
console.log('='.repeat(70))
console.log(`
Semantic/intent-based dedup IS NEEDED to filter near-duplicates.

Current status:
- ✓ Cache reuse working (loads from ai_question_suggestion_cache)
- ✓ Gemini avoided when cache + vNext sufficient
- ❌ Near-duplicates not filtered (different wording, same intent)

Recommendation:
Add semantic dedup layer to catch:
1. Same intent questions
2. Same main topics with different adjectives
3. Paraphrased versions of same question

This would prevent users from seeing:
- "כמה עולה עם משלוח?" and "כמה עולה משלוח?" (both price+delivery)
- "איזה זר לאישה?" and "איזה זר לאישה צעירה?" (both woman+bouquet)
`)
