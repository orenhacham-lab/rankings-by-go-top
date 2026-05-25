/**
 * Test file for semantic generator v2.
 * Compares v1 (template-based) vs v2 (semantic) for 20 real keywords.
 *
 * Usage: npx ts-node lib/ai-visibility/test-v2-generator.ts
 * Or import and run in a test environment.
 */

import { generatePromptSuggestions, type BusinessCategory } from './prompt-templates'

interface TestCase {
  keyword: string
  businessName: string
  category: BusinessCategory
  city?: string
}

const TEST_CASES: TestCase[] = [
  // SEO/Marketing Agency
  { keyword: 'קידום אתרים', businessName: 'Go Top', category: 'agency' },
  { keyword: 'קידום אתרים בחינם', businessName: 'Go Top', category: 'agency' },

  // Sports Store
  { keyword: 'הליכון', businessName: 'חנות ספורט', category: 'sports_store' },
  { keyword: 'משקולות', businessName: 'חנות ספורט', category: 'sports_store', city: 'תל אביב' },
  { keyword: 'ציוד כושר', businessName: 'חנות ספורט', category: 'sports_store' },

  // Florist
  { keyword: 'זר פרחים', businessName: 'חנות פרחים', category: 'florist', city: 'ירושלים' },
  { keyword: 'משלוח פרחים ביום', businessName: 'חנות פרחים', category: 'florist', city: 'תל אביב' },

  // Perfume Store
  { keyword: 'בושם', businessName: 'חנות בשמים', category: 'perfume' },
  { keyword: 'בושם לנשים', businessName: 'חנות בשמים', category: 'perfume' },
  { keyword: 'או דה פרפיום', businessName: 'חנות בשמים', category: 'perfume' },

  // Cleaning Service
  { keyword: 'ניקיון דירה', businessName: 'חברת ניקיון', category: 'cleaning', city: 'תל אביב' },
  { keyword: 'ניקיון משרדים', businessName: 'חברת ניקיון', category: 'cleaning' },

  // Legal Service
  { keyword: 'עורך דין', businessName: 'משרד עורכי דין', category: 'legal' },
  { keyword: 'ייעוץ משפטי', businessName: 'משרד עורכי דין', category: 'legal' },

  // Fitness
  { keyword: 'חדר כושר', businessName: 'ג\'ים', category: 'fitness', city: 'תל אביב' },
  { keyword: 'אימון אישי', businessName: 'ג\'ים', category: 'fitness' },

  // Restaurant
  { keyword: 'מסעדה', businessName: 'מסעדה XXX', category: 'restaurant', city: 'תל אביב' },
  { keyword: 'מאכלים בריאים', businessName: 'מסעדה XXX', category: 'restaurant' },

  // Product Brand (e.g., luxury brand)
  { keyword: 'שנילי אופנה יד שנייה', businessName: 'חנות בגדים', category: 'second_hand_fashion' },
]

export function testGeneratorV2() {
  console.log('='.repeat(80))
  console.log('SEMANTIC GENERATOR V2 TEST REPORT')
  console.log('='.repeat(80))
  console.log()

  let totalQuestions = 0
  let totalTests = TEST_CASES.length

  for (const testCase of TEST_CASES) {
    console.log(`\n[TEST] Keyword: "${testCase.keyword}"`)
    console.log(`       Business: ${testCase.businessName} | Category: ${testCase.category}`)
    if (testCase.city) console.log(`       City: ${testCase.city}`)
    console.log('-'.repeat(80))

    const suggestions = generatePromptSuggestions({
      businessName: testCase.businessName,
      domain: 'example.com',
      city: testCase.city || null,
      language: 'he',
      keywords: [testCase.keyword],
      limit: 12,
    })

    // Filter to only show questions that came from keyword-based generation
    // (look for v2 marker in reason or check confidence tier patterns)
    const keywordBasedQuestions = suggestions.filter(
      (s) => s.reason?.includes('v2') || s.reason?.includes('Semantic')
    )

    if (keywordBasedQuestions.length === 0) {
      console.log(`⚠️  No v2 questions found. Total suggestions: ${suggestions.length}`)
    } else {
      console.log(`✓ v2 Questions: ${keywordBasedQuestions.length}`)
    }

    // Show all suggestions
    for (let i = 0; i < Math.min(suggestions.length, 6); i++) {
      const s = suggestions[i]
      const marker = keywordBasedQuestions.includes(s) ? '[v2]' : '[bank]'
      console.log(
        `  ${i + 1}. ${marker} ${s.prompt} (${s.confidenceTier} | ${s.intent})`
      )
    }

    totalQuestions += suggestions.length
  }

  console.log()
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total test cases: ${totalTests}`)
  console.log(`Total suggestions generated: ${totalQuestions}`)
  console.log(`Average per keyword: ${(totalQuestions / totalTests).toFixed(1)}`)
  console.log()
  console.log('✓ Test completed. Check for:')
  console.log('  - Questions that sound natural in Hebrew')
  console.log('  - No template-like patterns (e.g., "או חלופות אחרות")')
  console.log('  - Appropriate intent types (recommendation for services, price for products)')
  console.log('  - Reasonable quantity (4-6 questions per keyword, not 12+)')
  console.log()
}

// If running directly
if (require.main === module) {
  testGeneratorV2()
}
