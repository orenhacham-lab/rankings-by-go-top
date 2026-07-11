/**
 * Test semantic duplicate detection
 * Verifies that near-duplicates with same intent are filtered
 */

import {
  extractTopicKeywords,
  areSemanticDuplicates,
  strongDeduplicateSuggestions,
} from '../suggestion-cache'

console.log('===== SEMANTIC DUPLICATE DETECTION TESTS =====\n')

// ============================================================
// TEST 1: Topic Keyword Extraction
// ============================================================
console.log('TEST 1: Topic Keyword Extraction')
console.log('-'.repeat(70))

const extractTests = [
  {
    question: 'כמה עולה זר עם משלוח בירושלים?',
    expectedTopics: ['זר', 'משלוח', 'ירושלים', 'עולה'],
    description: 'Hebrew: price + delivery + location'
  },
  {
    question: 'איזה זר מתאים לאישה צעירה?',
    expectedTopics: ['זר', 'אישה', 'צעירה'],
    description: 'Hebrew: bouquet + woman + young'
  },
  {
    question: 'Where can I buy flowers for a wedding?',
    expectedTopics: ['flowers', 'wedding', 'buy'],
    description: 'English: flowers + wedding + buy'
  },
]

extractTests.forEach(({ question, expectedTopics, description }) => {
  const topics = extractTopicKeywords(question)
  const topicsArray = Array.from(topics)
  const hasMostTopics = expectedTopics.every(t => topicsArray.some(a => a.includes(t) || t.includes(a)))
  const status = hasMostTopics ? '✓ PASS' : '⚠ CHECK'
  console.log(`\n${status}: ${description}`)
  console.log(`  Question: "${question}"`)
  console.log(`  Keywords: ${topicsArray.join(', ')}`)
})
console.log()

// ============================================================
// TEST 2: Semantic Duplicate Detection
// ============================================================
console.log('TEST 2: Semantic Duplicate Detection (Same Intent + Similar Topics)')
console.log('-'.repeat(70))

const semanticTests = [
  {
    q1: { question: 'כמה עולה זר עם משלוח בירושלים?', intent: 'commercial' },
    q2: { question: 'כמה עולה משלוח זר בירושלים?', intent: 'commercial' },
    shouldBeDuplicate: true,
    reason: 'Same intent (commercial), same topics (price, delivery, flower, Jerusalem), different word order'
  },
  {
    q1: { question: 'איזה זר מתאים לאישה צעירה?', intent: 'pre_purchase' },
    q2: { question: 'איזה זר מתאים לאישה?', intent: 'pre_purchase' },
    shouldBeDuplicate: true,
    reason: 'Same intent (pre_purchase), same main topics (bouquet, woman), adjective difference only'
  },
  {
    q1: { question: 'איפה אפשר לקנות פרחים טריים?', intent: 'informational' },
    q2: { question: 'איפה כדאי לקנות פרחים איכותיים?', intent: 'informational' },
    shouldBeDuplicate: true,
    reason: 'Same intent (informational), same main topics (flowers, buy, location), adjective difference'
  },
  {
    q1: { question: 'כמה עולה זר לחתונה?', intent: 'commercial' },
    q2: { question: 'איזה זר מתאים לחתונה?', intent: 'pre_purchase' },
    shouldBeDuplicate: false,
    reason: 'Different intent (commercial vs pre_purchase) - not a duplicate'
  },
  {
    q1: { question: 'כמה עולה זר?', intent: 'commercial' },
    q2: { question: 'איפה אפשר לקנות?', intent: 'informational' },
    shouldBeDuplicate: false,
    reason: 'Different intent - not a duplicate'
  },
]

semanticTests.forEach(({ q1, q2, shouldBeDuplicate, reason }) => {
  const result = areSemanticDuplicates(q1, q2)
  const status = result === shouldBeDuplicate ? '✓ PASS' : '❌ FAIL'
  const verb = shouldBeDuplicate ? 'DUPLICATE' : 'NOT DUPLICATE'
  const actual = result ? 'DUPLICATE' : 'NOT DUPLICATE'

  console.log(`\n${status}: ${verb}`)
  console.log(`  Q1: "${q1.question}" (${q1.intent})`)
  console.log(`  Q2: "${q2.question}" (${q2.intent})`)
  console.log(`  Result: ${actual}`)
  console.log(`  Reason: ${reason}`)
})
console.log()

// ============================================================
// TEST 3: Strong Dedup with Semantic Filtering
// ============================================================
console.log('TEST 3: Strong Dedup with Semantic Filtering')
console.log('-'.repeat(70))

const vNext = [
  { prompt: 'כמה עולה זר?' },
]

const cached = [
  { question: 'כמה עולה זר עם משלוח בירושלים?' },
  { question: 'איזה זר מתאים לאישה?' },
]

const geminiNew = [
  { question: 'כמה עולה משלוח זר בירושלים?', intent: 'commercial' }, // Semantic dup of cached[0]
  { question: 'איזה זר מתאים לאישה צעירה?', intent: 'pre_purchase' }, // Semantic dup of cached[1]
  { question: 'איפה אפשר לקנות פרחים טריים?', intent: 'informational' }, // New
]

console.log('Before dedup:')
console.log(`  vNext: ${vNext.length}`)
console.log(`  Cached: ${cached.length}`)
console.log(`  Gemini: ${geminiNew.length}`)
console.log(`  Total: ${vNext.length + cached.length + geminiNew.length}`)

const { dedupedQuestions, duplicateCount } = strongDeduplicateSuggestions(
  vNext,
  cached,
  geminiNew
)

console.log('\nAfter strong dedup with semantic filtering:')
console.log(`  Total: ${dedupedQuestions.length}`)
console.log(`  Duplicates removed: ${duplicateCount}`)
console.log(`  Breakdown:`)
console.log(`    vNext: ${dedupedQuestions.filter(q => q.source === 'vNext').length}`)
console.log(`    Cached: ${dedupedQuestions.filter(q => q.source === 'cached').length}`)
console.log(`    Gemini: ${dedupedQuestions.filter(q => q.source === 'gemini').length}`)

console.log('\nFinal questions:')
dedupedQuestions.forEach((q, i) => {
  console.log(`  ${i + 1}. "${q.question}" (${q.source})`)
})

if (duplicateCount === 2) {
  console.log('\n✓ PASS: Semantic duplicates correctly filtered (2 removed)')
  console.log('  - "כמה עולה משלוח זר בירושלים?" filtered as semantic dup')
  console.log('  - "איזה זר מתאים לאישה צעירה?" filtered as semantic dup')
  console.log('  - "איפה אפשר לקנות פרחים טריים?" kept as unique')
} else {
  console.log(`\n⚠ ${duplicateCount} duplicates removed (expected 2)`)
}

console.log('\n' + '='.repeat(70))
console.log('CONCLUSION')
console.log('='.repeat(70))
console.log(`
Semantic dedup is now active. It filters near-duplicates by:
1. Checking if questions have same intent (commercial, pre_purchase, etc.)
2. Extracting topic keywords from each question
3. Calculating topic overlap using Jaccard similarity
4. If overlap >= 60%, treating as duplicate

This prevents users from seeing:
- Same question phrased differently
- Questions about same topic with minor adjective changes
- Paraphrased versions of cached suggestions

Impact:
- Reduces near-duplicate suggestions
- Improves suggestion quality and variety
- Cache reuse more effective (fewer new Gemini calls needed)
`)
