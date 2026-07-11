/**
 * Production quality tests for:
 * 1. Country code leak prevention
 * 2. Temporal/promotion question filtering
 * 3. Dedup across refreshes
 */

import {
  getCountryDisplayName,
  containsISOCountryCodeLeak,
  isTimeOrPromotionSensitive,
  strongNormalize,
  strongDeduplicateSuggestions,
} from '../suggestion-cache'

console.log('===== PRODUCTION QUALITY TESTS =====\n')

// ============================================================
// TEST 1: Country Code Mapping
// ============================================================
console.log('TEST 1: Country Code Display Name Mapping')
console.log('-'.repeat(60))

const countryTests = [
  { code: 'IL', expected: 'ישראל' },
  { code: 'il', expected: 'ישראל' },
  { code: 'US', expected: 'United States' },
  { code: 'GB', expected: 'United Kingdom' },
  { code: 'UK', expected: 'United Kingdom' },
  { code: 'GR', expected: 'Greece' },
  { code: 'CY', expected: 'Cyprus' },
  { code: 'XX', expected: 'XX' }, // Unknown code returns as-is
]

countryTests.forEach(({ code, expected }) => {
  const result = getCountryDisplayName(code)
  const status = result === expected ? '✓ PASS' : '❌ FAIL'
  console.log(`${status}: "${code}" → "${result}" (expected: "${expected}")`)
})
console.log()

// ============================================================
// TEST 2: ISO Code Leak Detection
// ============================================================
console.log('TEST 2: ISO Country Code Leak Detection')
console.log('-'.repeat(60))

const isoLeakTests = [
  { question: 'מי מוכר מכשירי כושר למרפסת עם משלוח מהיר ל-IL?', shouldReject: true },
  { question: 'כמה עולה הליכון בחנות בתל אביב?', shouldReject: false },
  { question: 'איפה אפשר לקנות ל-US?', shouldReject: true },
  { question: 'מה עולה משלוח ל-GB?', shouldReject: true },
  { question: 'כמה עולה בישראל?', shouldReject: false },
  { question: 'Where can I buy in the US?', shouldReject: true },
  { question: 'Best products to buy in UK?', shouldReject: true },
  { question: 'Things to buy in England?', shouldReject: false },
]

isoLeakTests.forEach(({ question, shouldReject }) => {
  const hasLeak = containsISOCountryCodeLeak(question)
  const status = hasLeak === shouldReject ? '✓ PASS' : '❌ FAIL'
  const verb = shouldReject ? 'REJECT' : 'ACCEPT'
  const result = hasLeak ? 'REJECTED' : 'ACCEPTED'
  console.log(`${status}: ${verb} "${question}" → ${result}`)
})
console.log()

// ============================================================
// TEST 3: Temporal/Promotion Question Detection
// ============================================================
console.log('TEST 3: Temporal/Promotion Question Detection')
console.log('-'.repeat(60))

const temporalTests = [
  { question: 'האם יש הנחות על אופני כושר עד סוף החודש?', shouldReject: true },
  { question: 'כמה עולה אופני כושר בחנות?', shouldReject: false },
  { question: 'מה חשוב לבדוק לפני שקונים אופני כושר?', shouldReject: false },
  { question: 'יש מבצע על הליכונים השבוע?', shouldReject: true },
  { question: 'היום בלבד - הנחה על כל המכשירים!', shouldReject: true },
  { question: 'קופון ל-20% הנחה על הליכונים?', shouldReject: true },
  { question: 'בחודש זה - סייל על ציוד ספורט?', shouldReject: true },
  { question: 'האם אפשר לקבל ייעוץ לבחירת הליכון?', shouldReject: false },
  { question: 'Limited time offer - special sale today', shouldReject: true },
  { question: 'What is the best treadmill to buy?', shouldReject: false },
]

temporalTests.forEach(({ question, shouldReject }) => {
  const isTemporal = isTimeOrPromotionSensitive(question)
  const status = isTemporal === shouldReject ? '✓ PASS' : '❌ FAIL'
  const verb = shouldReject ? 'REJECT (temporal)' : 'ACCEPT'
  const result = isTemporal ? 'REJECTED (temporal)' : 'ACCEPTED'
  console.log(`${status}: ${verb} "${question}" → ${result}`)
})
console.log()

// ============================================================
// TEST 4: Dedup Across Refreshes
// ============================================================
console.log('TEST 4: Dedup Across Multiple Refreshes')
console.log('-'.repeat(60))

const vNextQuestions = [
  { question: 'איזה הליכון מומלץ ביותר?', prompt: 'איזה הליכון מומלץ ביותר?' },
  { question: 'כמה עולה הליכון ביתי?', prompt: 'כמה עולה הליכון ביתי?' },
]

// First refresh - Gemini returns these
const geminiRound1 = [
  { question: 'איזה הליכון הכי מומלץ לריצה למרחקים ארוכים?', intent: 'pre_purchase' },
  { question: 'איפה אפשר לקנות אליפטיקל טוב לבית עם אחריות?', intent: 'commercial' },
]

// Second refresh - same Gemini suggestions are cached and returned
const cachedRound2 = [
  { question: 'איזה הליכון הכי מומלץ לריצה למרחקים ארוכים?', intent: 'pre_purchase' },
  { question: 'איפה אפשר לקנות אליפטיקל טוב לבית עם אחריות?', intent: 'commercial' },
]

// Gemini might generate similar variants in round 2
const geminiRound2 = [
  { question: 'איזה הליכון מומלץ לריצה ארוכה בבית?', intent: 'pre_purchase' }, // Similar to round 1
  { question: 'איפה כדאי לקנות אליפטיקל איכותי לבית?', intent: 'commercial' }, // Similar to round 1
]

console.log('Round 1: vNext + new Gemini')
const { dedupedQuestions: round1 } = strongDeduplicateSuggestions(
  vNextQuestions,
  [],
  geminiRound1
)
console.log(`  vNext: ${vNextQuestions.length}`)
console.log(`  Gemini: ${geminiRound1.length}`)
console.log(`  Total after dedup: ${round1.length}`)
round1.forEach(q => console.log(`    - "${q.question}" (${q.source})`))
console.log()

console.log('Round 2: vNext + cached + new Gemini')
const { dedupedQuestions: round2, duplicateCount } = strongDeduplicateSuggestions(
  vNextQuestions,
  cachedRound2,
  geminiRound2
)
console.log(`  vNext: ${vNextQuestions.length}`)
console.log(`  Cached: ${cachedRound2.length}`)
console.log(`  Gemini: ${geminiRound2.length}`)
console.log(`  Duplicates removed: ${duplicateCount}`)
console.log(`  Total after dedup: ${round2.length}`)
round2.forEach(q => console.log(`    - "${q.question}" (${q.source})`))

if (round2.length === round1.length) {
  console.log('\n✓ PASS: No unnecessary duplication across refreshes')
} else {
  console.log(`\n⚠ INFO: Different result (${round1.length} vs ${round2.length})`)
}
console.log()

// ============================================================
// TEST 5: Normalization Consistency
// ============================================================
console.log('TEST 5: Strong Normalization Consistency')
console.log('-'.repeat(60))

const normTests = [
  { original: 'איזה הליכון הכי מומלץ לריצה?', variant: 'איזה הליכון מומלץ לריצה?' },
  { original: 'כמה עולה הליכון "ברנדי"?', variant: 'כמה עולה הליכון "ברנדי"?' },
  { original: 'איפה קונים הליכונים – ישראל?', variant: 'איפה קונים הליכונים - ישראל?' },
]

console.log('Testing if variants normalize to same value:')
normTests.forEach(({ original, variant }) => {
  const norm1 = strongNormalize(original)
  const norm2 = strongNormalize(variant)
  const match = norm1 === norm2
  const status = match ? '✓ MATCH' : '❌ DIFFER'
  console.log(`${status}:`)
  console.log(`  Original: "${original}" → "${norm1}"`)
  console.log(`  Variant:  "${variant}" → "${norm2}"`)
})
console.log()

console.log('===== ALL PRODUCTION TESTS COMPLETED =====')
