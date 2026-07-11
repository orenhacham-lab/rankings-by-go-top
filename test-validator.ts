/**
 * Test script to verify isInvalidHebrewPhrase validator catches bad patterns
 */

import { generatePromptSuggestions, type ManualAIProfile } from './lib/ai-visibility/prompt-templates'

function normalizeForCompare(p: string): string {
  return p.toLowerCase().replace(/[?!.,;:'"״׳`\-–—]/g, '').replace(/\s+/g, ' ').trim()
}

console.log('\n=== VALIDATOR TEST ===\n')

// Test that the generator REJECTS double-lamed verbs
console.log('TEST: Double-lamed verbs should be rejected\n')

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
  limit: 12,
})

console.log(`Generated ${fitnessSuggestions.length} suggestions:`)
fitnessSuggestions.forEach((s, i) => {
  console.log(`${i + 1}. ${s.prompt}`)
})

// Check for double-lamed verbs
const doubleLamedVerbs = ['ללקנות', 'ללהזמין', 'ללבחור', 'ללמצוא', 'ללקבל', 'ללרכוש', 'ללהשוות', 'ללבדוק', 'ללשאול', 'ללחפש']
const hasBadPatterns = fitnessSuggestions.some(s => {
  const p = s.prompt.toLowerCase()
  return doubleLamedVerbs.some(verb => p.includes(verb))
})

if (hasBadPatterns) {
  console.log('\n❌ FAILED: Found double-lamed verbs in suggestions')
  fitnessSuggestions.forEach(s => {
    const p = s.prompt.toLowerCase()
    const bad = doubleLamedVerbs.filter(v => p.includes(v))
    if (bad.length > 0) {
      console.log(`  - "${s.prompt}" contains: ${bad.join(', ')}`)
    }
  })
} else {
  console.log('\n✓ PASSED: No double-lamed verbs found\n')
}

// Test secondary categories with proper resolution
console.log('\nTEST: Secondary categories should be resolved to proper objects\n')

const secondHandProfile: ManualAIProfile = {
  mode: 'manual',
  primaryCategory: 'חנות בגדי יד שנייה לנשים',
  secondaryCategories: ['וינטג׳', 'מותגים', 'שמלות ערב'],
  excludedTopics: [],
}

const secondHandSuggestions = generatePromptSuggestions({
  businessName: 'VintageShop',
  domain: 'vintage.co.il',
  city: 'תל אביב',
  country: 'IL',
  language: 'he',
  keywords: [],
  manualProfile: secondHandProfile,
  diversify: false,  // Use deterministic order for testing
  limit: 12,
})

console.log(`Generated ${secondHandSuggestions.length} suggestions:`)
secondHandSuggestions.forEach((s, i) => {
  console.log(`${i + 1}. ${s.prompt}`)
})

// Check that secondary categories are resolved
const hasResolvedObjects = secondHandSuggestions.some(s => {
  const p = s.prompt.toLowerCase()
  return p.includes('פריטי וינטג׳') || p.includes('בגדי מותגים יד שנייה') || p.includes('שמלות ערב יד שנייה')
})

const hasUnresolvedSecondaries = secondHandSuggestions.some(s => {
  const p = s.prompt.toLowerCase()
  // Check if raw secondary appears in context where it shouldn't (not as part of a resolved object)
  return (
    (p.includes('וינטג׳') && !p.includes('פריטי וינטג׳')) ||
    (p.includes('מותגים') && !p.includes('בגדי מותגים')) ||
    (p.includes('שמלות ערב') && !p.includes('שמלות ערב יד שנייה'))
  )
})

if (hasResolvedObjects) {
  console.log('\n✓ PASSED: Secondary categories are properly resolved to objects\n')
} else {
  console.log('\n❌ FAILED: Secondary categories not properly resolved\n')
}

if (hasUnresolvedSecondaries) {
  console.log('⚠ WARNING: Found unresolved secondary categories in some questions')
  secondHandSuggestions.forEach(s => {
    const p = s.prompt.toLowerCase()
    const issues = []
    if (p.includes('וינטג׳') && !p.includes('פריטי וינטג׳')) {
      issues.push('raw וינטג׳ without resolution')
    }
    if (issues.length > 0) {
      console.log(`  - "${s.prompt}" has: ${issues.join(', ')}`)
    }
  })
}

console.log('\n=== VALIDATOR TEST COMPLETE ===\n')
