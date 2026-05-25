/**
 * Test file for semantic generator v2.
 * Runs v2 on real test cases and prints a structured report.
 *
 * Usage: npx tsx lib/ai-visibility/test-v2-generator.ts
 */

import {
  generateHumanLikeSmartQuestionsDebug,
  validateHumanSearchQuery,
  type GeneratorContext,
} from './semantic-generator-v2'
import type { BusinessCategory } from './prompt-templates'

interface TestCase {
  keyword: string
  businessName: string
  category: BusinessCategory
  city?: string
  groupLabel: string
}

const TEST_CASES: TestCase[] = [
  // 1. Sports Store
  { keyword: 'הליכון ביתי', businessName: 'חנות ספורט', category: 'sports_store', groupLabel: 'חנות ספורט' },
  { keyword: 'אופני כושר', businessName: 'חנות ספורט', category: 'sports_store', groupLabel: 'חנות ספורט' },
  { keyword: 'משקולות יד', businessName: 'חנות ספורט', category: 'sports_store', groupLabel: 'חנות ספורט' },
  { keyword: 'ציוד כושר ביתי', businessName: 'חנות ספורט', category: 'sports_store', groupLabel: 'חנות ספורט' },

  // 2. SEO Agency
  { keyword: 'קידום אתרים ברמת גן', businessName: 'Go Top', category: 'agency', city: 'רמת גן', groupLabel: 'סוכנות SEO' },
  { keyword: 'קידום אתרים לרופאים', businessName: 'Go Top', category: 'agency', groupLabel: 'סוכנות SEO' },
  { keyword: 'קידום אתר שופיפיי', businessName: 'Go Top', category: 'agency', groupLabel: 'סוכנות SEO' },
  { keyword: 'פרסום ממומן בגוגל', businessName: 'Go Top', category: 'agency', groupLabel: 'סוכנות SEO' },
  { keyword: 'קמפיין לידים בפייסבוק', businessName: 'Go Top', category: 'agency', groupLabel: 'סוכנות SEO' },
  { keyword: 'Go Top', businessName: 'Go Top', category: 'agency', groupLabel: 'סוכנות SEO' },

  // 3. Gifts / Florist
  { keyword: 'משלוח פרחים בירושלים', businessName: 'חנות פרחים', category: 'florist', city: 'ירושלים', groupLabel: 'מתנות/פרחים' },
  { keyword: 'מתנה ליולדת', businessName: 'חנות פרחים', category: 'florist', groupLabel: 'מתנות/פרחים' },
  { keyword: 'זר ורדים', businessName: 'חנות פרחים', category: 'florist', groupLabel: 'מתנות/פרחים' },
  { keyword: 'משלוח מתנה ליום הולדת', businessName: 'חנות פרחים', category: 'florist', groupLabel: 'מתנות/פרחים' },
]

function runTests() {
  const output: string[] = []
  output.push('='.repeat(100))
  output.push('SEMANTIC GENERATOR V2 — REAL TEST RESULTS')
  output.push('='.repeat(100))

  let currentGroup = ''
  let totalGenerated = 0
  let totalRejected = 0
  let totalKeywords = 0

  for (const tc of TEST_CASES) {
    if (tc.groupLabel !== currentGroup) {
      currentGroup = tc.groupLabel
      output.push('')
      output.push('▼'.repeat(100))
      output.push(`GROUP: ${currentGroup}`)
      output.push('▼'.repeat(100))
    }

    output.push('')
    output.push(`[KEYWORD] "${tc.keyword}"`)
    output.push(`  Business: ${tc.businessName} | Category: ${tc.category}${tc.city ? ` | City: ${tc.city}` : ''}`)
    output.push('  ' + '-'.repeat(96))

    const ctx: GeneratorContext = {
      keyword: tc.keyword,
      businessName: tc.businessName,
      city: tc.city || null,
      businessCategory: tc.category,
      language: 'he',
    }

    const result = generateHumanLikeSmartQuestionsDebug(ctx)

    output.push(`  Entity type: ${result.entityProfile.entityType}`)
    output.push(`  Generated: ${result.questions.length} | Rejected: ${result.rejected.length}`)

    if (result.questions.length === 0) {
      output.push('  ⚠️  NO REALISTIC QUESTIONS GENERATED (this is OK if entity is too vague)')
    } else {
      output.push('  ✓ Generated questions:')
      for (const q of result.questions) {
        output.push(`    • "${q.prompt}"`)
        output.push(`      intent=${q.intent} | score=${q.score.toFixed(0)} | behavior=${q.debug?.behavior} | validation_score=${q.validation.score}`)
      }
    }

    if (result.rejected.length > 0) {
      output.push('  ✗ Rejected questions:')
      for (const r of result.rejected) {
        output.push(`    • "${r.prompt}"`)
        output.push(`      reasons: ${r.reasons.join(', ')}`)
      }
    }

    totalGenerated += result.questions.length
    totalRejected += result.rejected.length
    totalKeywords += 1
  }

  output.push('')
  output.push('='.repeat(100))
  output.push('SUMMARY')
  output.push('='.repeat(100))
  output.push(`Total keywords tested: ${totalKeywords}`)
  output.push(`Total questions generated: ${totalGenerated}`)
  output.push(`Total questions rejected: ${totalRejected}`)
  output.push(`Avg generated per keyword: ${(totalGenerated / totalKeywords).toFixed(2)}`)
  output.push(`Rejection rate: ${((totalRejected / (totalGenerated + totalRejected)) * 100).toFixed(1)}%`)

  // ===========================================
  // Validator regression tests (banned phrasings)
  // ===========================================
  output.push('')
  output.push('='.repeat(100))
  output.push('VALIDATOR REGRESSION TESTS — Banned Hebrew phrasings')
  output.push('='.repeat(100))

  const validatorTests = [
    { input: 'מה דעות על הליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'איזה דעות על הליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'מה הדעה על הליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'מה היכולות של הליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'מה חלופות טובות להליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'מי מומלץ עבור הליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'איך לבחור ספק להליכון?', keyword: 'הליכון', expectInvalid: true },
    { input: 'מה עדיף הליכון או חלופות אחרות?', keyword: 'הליכון', expectInvalid: true },
    // These should PASS
    { input: 'חוות דעת על הליכון', keyword: 'הליכון', expectInvalid: false },
    { input: 'כמה עולה הליכון?', keyword: 'הליכון', expectInvalid: false },
    { input: 'איזה ספק מומלץ לקידום אתרים?', keyword: 'קידום אתרים', expectInvalid: false },
  ]

  let passed = 0
  let failed = 0
  for (const test of validatorTests) {
    const result = validateHumanSearchQuery(test.input, test.keyword, 'he')
    const isCorrect = result.isValid !== test.expectInvalid
    const marker = isCorrect ? '✓' : '✗'
    output.push(
      `  ${marker} "${test.input}" → ${result.isValid ? 'VALID' : 'REJECTED'} ${test.expectInvalid ? '(expected REJECTED)' : '(expected VALID)'} ${result.reasons.length > 0 ? `[${result.reasons.join(', ')}]` : ''}`
    )
    if (isCorrect) passed += 1
    else failed += 1
  }

  output.push('')
  output.push(`Validator tests: ${passed} passed, ${failed} failed (of ${validatorTests.length})`)

  console.log(output.join('\n'))
}

runTests()
