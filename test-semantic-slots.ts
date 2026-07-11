/**
 * Test script to verify semantic slot-based question generation.
 * Tests that questions use proper purchaseObjects instead of business type names.
 */

import { generatePromptSuggestions, type ManualAIProfile } from './lib/ai-visibility/prompt-templates'

function normalizeForCompare(p: string): string {
  return p.toLowerCase().replace(/[?!.,;:'"״׳`\-–—]/g, '').replace(/\s+/g, ' ').trim()
}

console.log('\n=== SEMANTIC SLOT TEST ===\n')

// Test 1: Sports/Fitness Store
console.log('TEST 1: Sports/Fitness Store (חנות מוצרי כושר)\n')

const fitnessProfile: ManualAIProfile = {
  mode: 'manual',
  primaryCategory: 'חנות מוצרי כושר',
  secondaryCategories: [],
  excludedTopics: [],
}

const fitnessSuggestions = generatePromptSuggestions({
  businessName: 'FitPro',
  domain: 'fitpro.co.il',
  city: null,
  country: 'IL',
  language: 'he',
  keywords: [],
  manualProfile: fitnessProfile,
  diversify: true,
  limit: 6,
})

console.log('Generated suggestions:')
fitnessSuggestions.forEach((s, i) => {
  console.log(`${i + 1}. ${s.prompt}`)
})

// Check for bad patterns
const badPatterns = fitnessSuggestions.filter(s => {
  const p = s.prompt.toLowerCase()
  return (
    p.includes('קונים חנות') ||
    p.includes('לקנות חנות') ||
    p.includes('כמה עולה חנות') ||
    p.includes('מוצרים כושר') // Should be מוצרי כושר
  )
})

if (badPatterns.length > 0) {
  console.log(`\n❌ FAILED: Found ${badPatterns.length} grammatically incorrect questions:`)
  badPatterns.forEach(s => console.log(`  - ${s.prompt}`))
} else {
  console.log('\n✓ PASSED: No bad patterns found\n')
}

// Test 2: Flower Shop
console.log('\nTEST 2: Flower Shop (חנות פרחים)\n')

const flowerProfile: ManualAIProfile = {
  mode: 'manual',
  primaryCategory: 'חנות פרחים',
  secondaryCategories: [],
  excludedTopics: [],
}

const flowerSuggestions = generatePromptSuggestions({
  businessName: 'Blooms',
  domain: 'blooms.co.il',
  city: null,
  country: 'IL',
  language: 'he',
  keywords: [],
  manualProfile: flowerProfile,
  diversify: true,
  limit: 6,
})

console.log('Generated suggestions:')
flowerSuggestions.forEach((s, i) => {
  console.log(`${i + 1}. ${s.prompt}`)
})

const flowerBadPatterns = flowerSuggestions.filter(s => {
  const p = s.prompt.toLowerCase()
  return (
    p.includes('קונים חנות') ||
    p.includes('לקנות חנות') ||
    p.includes('כמה עולה חנות')
  )
})

if (flowerBadPatterns.length > 0) {
  console.log(`\n❌ FAILED: Found ${flowerBadPatterns.length} bad patterns`)
} else {
  console.log('\n✓ PASSED: No bad patterns found\n')
}

// Test 3: Perfume Shop
console.log('\nTEST 3: Perfume Shop (חנות בשמים)\n')

const perfumeProfile: ManualAIProfile = {
  mode: 'manual',
  primaryCategory: 'חנות בשמים',
  secondaryCategories: [],
  excludedTopics: [],
}

const perfumeSuggestions = generatePromptSuggestions({
  businessName: 'Fragrance Co',
  domain: 'fragrance.co.il',
  city: null,
  country: 'IL',
  language: 'he',
  keywords: [],
  manualProfile: perfumeProfile,
  diversify: true,
  limit: 6,
})

console.log('Generated suggestions:')
perfumeSuggestions.forEach((s, i) => {
  console.log(`${i + 1}. ${s.prompt}`)
})

const perfumeBadPatterns = perfumeSuggestions.filter(s => {
  const p = s.prompt.toLowerCase()
  return (
    p.includes('קונים חנות') ||
    p.includes('לקנות חנות') ||
    p.includes('כמה עולה חנות')
  )
})

if (perfumeBadPatterns.length > 0) {
  console.log(`\n❌ FAILED: Found ${perfumeBadPatterns.length} bad patterns`)
} else {
  console.log('\n✓ PASSED: No bad patterns found\n')
}

// Test 4: Second-hand Fashion with Secondary Categories
console.log('\nTEST 4: Second-hand Fashion with Secondary Categories\n')

const secondHandProfile: ManualAIProfile = {
  mode: 'manual',
  primaryCategory: 'חנות בגדי יד שנייה לנשים',
  secondaryCategories: ['וינטג׳', 'מותגים', 'שמלות ערב'],
  excludedTopics: [],
}

const secondHandSuggestions = generatePromptSuggestions({
  businessName: 'ששקה',
  domain: 'shashka.co.il',
  city: 'תל אביב',
  country: 'IL',
  language: 'he',
  keywords: [],
  manualProfile: secondHandProfile,
  diversify: true,
  limit: 6,
})

console.log('Generated suggestions:')
secondHandSuggestions.forEach((s, i) => {
  console.log(`${i + 1}. ${s.prompt}`)
})

const secondHandBadPatterns = secondHandSuggestions.filter(s => {
  const p = s.prompt.toLowerCase()
  return (
    p.includes('קונים חנות') ||
    p.includes('לקנות חנות') ||
    p.includes('כמה עולה חנות')
  )
})

if (secondHandBadPatterns.length > 0) {
  console.log(`\n❌ FAILED: Found ${secondHandBadPatterns.length} bad patterns`)
} else {
  console.log('\n✓ PASSED: No bad patterns found\n')
}

console.log('\n=== SEMANTIC SLOT TEST COMPLETE ===\n')
