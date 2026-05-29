/**
 * Manual tests for business scope validation
 * Run with: npx ts-node lib/ai-visibility/__tests__/business-scope-manual-tests.ts
 */

import {
  extractBusinessScope,
  containsExcludedBusinessTerm,
  isWithinBusinessScope,
  filterSuggestionsByBusinessScope,
} from '../suggestion-cache'

console.log('===== BUSINESS SCOPE VALIDATION TESTS =====\n')

// Test 1: Extract business scope
console.log('TEST 1: Extract Business Scope')
console.log('-'.repeat(50))

const floristProject = {
  business_name: 'הפרחים של ארז',
  ai_business_profile: {
    mode: 'manual',
    primaryCategory: 'florist',
    secondaryCategories: ['flower_gifts', 'plants', 'arrangements'],
    excludedTopics: ['נעליים', 'נעלי', 'ספורט', 'כדורגל'],
  },
}

const floristScope = extractBusinessScope(floristProject)
console.log('Florist Project Business Scope:')
console.log('  Allowed Topics:', floristScope.allowedTopics)
console.log('  Excluded Terms:', floristScope.excludedTerms)
console.log('  Category:', floristScope.businessCategory)
console.log('✓ PASS\n')

// Test 2: Detect excluded terms
console.log('TEST 2: Detect Excluded Business Terms')
console.log('-'.repeat(50))

const testQuestions = [
  'כמה עולה זר פרחים בירושלים?',
  'אילו נעלי ריצה מומלצות לקיץ?',
  'האם אפשר לקנות נעליים?',
  'איזה זר מתאים לחתונה?',
  'מי ממליץ על חנות ספורט בעיר?',
]

const excludedTerms = floristScope.excludedTerms
console.log(`Excluded terms: ${excludedTerms.join(', ')}\n`)

testQuestions.forEach(q => {
  const hasExcluded = containsExcludedBusinessTerm(q, excludedTerms)
  const status = hasExcluded ? '❌ REJECTED' : '✓ ACCEPTED'
  console.log(`${status}: "${q}"`)
})
console.log()

// Test 3: Check scope relevance
console.log('TEST 3: Check Question Scope Relevance')
console.log('-'.repeat(50))

const scopeTests = [
  'כמה עולה זר פרחים בירושלים?',
  'איזה זר מתאים ליום הולדת?',
  'איפה אפשר לקנות פרחים טריים?',
  'כמה עולה?', // Generic
  'איזה כדורגל הטוב ביותר?',
  'מה הניסוח הטוב ביותר לנעליים?',
]

console.log(`Allowed topics: ${floristScope.allowedTopics.join(', ')}\n`)

scopeTests.forEach(q => {
  const withinScope = isWithinBusinessScope(q, floristScope)
  const status = withinScope ? '✓ ACCEPTED' : '❌ REJECTED'
  console.log(`${status}: "${q}"`)
})
console.log()

// Test 4: Filter suggestions by business scope
console.log('TEST 4: Filter Suggestions by Business Scope')
console.log('-'.repeat(50))

const geminiSuggestions = [
  { question: 'כמה עולה משלוח פרחים בירושלים?', intent: 'commercial', source: 'gemini' },
  { question: 'אילו נעלי ריצה לנשים מומלצים לקיץ?', intent: 'commercial', source: 'gemini' },
  { question: 'איזה זר מתאים ליום הולדת רומנטי?', intent: 'pre_purchase', source: 'gemini' },
  { question: 'כמה עולה משלוח פרחים להרצליה?', intent: 'commercial', source: 'gemini' },
  { question: 'מי ממליץ על חנות ספורט בפתח תקווה?', intent: 'informational', source: 'gemini' },
  { question: 'איפה אפשר לקנות פרחים טריים?', intent: 'informational', source: 'gemini' },
]

const filteredLogs: Array<{ question: string; reason: string }> = []
const filtered = filterSuggestionsByBusinessScope(geminiSuggestions, floristScope, (q, reason) => {
  filteredLogs.push({ question: q, reason })
})

console.log(`Original: ${geminiSuggestions.length} suggestions`)
console.log(`Filtered: ${filtered.length} accepted\n`)

console.log('Accepted suggestions:')
filtered.forEach(s => {
  console.log(`  ✓ "${s.question}"`)
})

if (filteredLogs.length > 0) {
  console.log('\nRejected suggestions:')
  filteredLogs.forEach(({ question, reason }) => {
    console.log(`  ❌ "${question}"`)
    console.log(`     Reason: ${reason}`)
  })
}
console.log()

// Test 5: Verify no regressions with allowed locations
console.log('TEST 5: Location Validation Not Affected')
console.log('-'.repeat(50))

import { extractAllowedLocations, containsDisallowedLocation } from '../suggestion-cache'

const jerusalemProject = {
  city: 'ירושלים',
  business_name: 'חנות כللית בירושלים',
}

const allowedLocations = extractAllowedLocations(jerusalemProject)
console.log(`Allowed locations: ${allowedLocations.join(', ') || '(none)'}\n`)

const locationQuestions = [
  'כמה עולה משלוח בירושלים?',
  'כמה עולה משלוח להרצליה?',
  'איפה אפשר לקנות בעמק רפאים?',
]

locationQuestions.forEach(q => {
  const hasDisallowed = containsDisallowedLocation(q, allowedLocations)
  const status = hasDisallowed ? '❌ REJECTED (disallowed location)' : '✓ ACCEPTED'
  console.log(`${status}: "${q}"`)
})
console.log()

console.log('===== ALL TESTS COMPLETED =====')
