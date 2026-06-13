/**
 * Test: Display-Level Price Question Safety Filter
 *
 * Run with: npx tsx scripts/test-display-level-filter.ts
 *
 * Verifies that the display-level safety filter correctly blocks
 * invalid price questions (asking for price of stores, companies, brands, websites)
 * while allowing valid price questions about products/services and
 * provider-selection questions.
 */

import { isInvalidPriceQuestion } from '../lib/ai-visibility/smart-question-keyword-enrichment'

// ── Terminal colors ────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

// ── Test cases ─────────────────────────────────────────────────────────────
interface TestCase {
  question: string
  language: 'he' | 'en'
  shouldBeBlocked: boolean
  reason: string
}

const testCases: TestCase[] = [
  // ──────────────────────────────────────────────────────────────────────
  // INVALID: Price questions about non-priceable entities (MUST BE BLOCKED)
  // ──────────────────────────────────────────────────────────────────────
  {
    question: 'כמה עולה חנות בגדי יד שנייה?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Store is not priceable — critical production issue',
  },
  {
    question: 'כמה עולה חנות אופנה?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Store is not priceable',
  },
  {
    question: 'כמה עולה חברת SEO?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Company is not priceable',
  },
  {
    question: 'כמה עולה חברת ניקיון?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Company is not priceable',
  },
  {
    question: 'כמה עולה אתר בגדים?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Website is not priceable',
  },
  {
    question: 'כמה עולה עסק קטן?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Business is not priceable',
  },
  {
    question: 'כמה עולה מותג בגדים?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Brand is not priceable',
  },
  {
    question: 'כמה עולה קטגוריה?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Category is not priceable',
  },
  {
    question: 'כמה עולה משרד?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Office is not priceable',
  },
  {
    question: 'כמה עולה ספק?',
    language: 'he',
    shouldBeBlocked: true,
    reason: 'Supplier is not priceable',
  },

  // English invalid cases
  {
    question: 'How much does a clothing store cost?',
    language: 'en',
    shouldBeBlocked: true,
    reason: 'Store is not priceable',
  },
  {
    question: 'How much does an SEO company cost?',
    language: 'en',
    shouldBeBlocked: true,
    reason: 'Company is not priceable',
  },
  {
    question: 'How much does a website cost?',
    language: 'en',
    shouldBeBlocked: true,
    reason: 'Website is not priceable',
  },
  {
    question: 'How much does a cleaning company cost?',
    language: 'en',
    shouldBeBlocked: true,
    reason: 'Company is not priceable',
  },
  {
    question: 'How much is a brand?',
    language: 'en',
    shouldBeBlocked: true,
    reason: 'Brand is not priceable',
  },

  // ──────────────────────────────────────────────────────────────────────
  // VALID: Price questions about priceable products/services (MUST PASS)
  // ──────────────────────────────────────────────────────────────────────
  {
    question: 'כמה עולה בושם לגבר?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Fragrance is a priceable product',
  },
  {
    question: 'כמה עולה שמלה?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Dress is a priceable product',
  },
  {
    question: 'כמה עולה ניקיון משרדים?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Office cleaning is a priceable service',
  },
  {
    question: 'כמה עולה פרסום באינסטגרם?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Instagram advertising is a priceable service',
  },
  {
    question: 'כמה עולה הליכון ביתי?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Home treadmill is a priceable product',
  },
  {
    question: 'כמה עולה ספר?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Book is a priceable product',
  },

  // English valid cases
  {
    question: 'How much does a treadmill cost?',
    language: 'en',
    shouldBeBlocked: false,
    reason: 'Treadmill is a priceable product',
  },
  {
    question: 'How much does office cleaning cost?',
    language: 'en',
    shouldBeBlocked: false,
    reason: 'Office cleaning is a priceable service',
  },
  {
    question: 'How much is a fragrance?',
    language: 'en',
    shouldBeBlocked: false,
    reason: 'Fragrance is a priceable product',
  },

  // ──────────────────────────────────────────────────────────────────────
  // VALID: Provider-selection questions (MUST PASS — NOT price questions)
  // ──────────────────────────────────────────────────────────────────────
  {
    question: 'איך לבחור חברת SEO?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Provider selection (not a price question)',
  },
  {
    question: 'איך לבחור חברת ניקיון?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Provider selection (not a price question)',
  },
  {
    question: 'איזה ספק מומלץ לפרסום באינסטגרם?',
    language: 'he',
    shouldBeBlocked: false,
    reason: 'Provider selection (not a price question)',
  },
]

// ── Test runner ────────────────────────────────────────────────────────────
let totalTests = 0
let passedTests = 0
const failures: string[] = []

function runTest(tc: TestCase) {
  totalTests++
  const result = isInvalidPriceQuestion(tc.question, tc.language)
  const passed = result === tc.shouldBeBlocked

  const expectText = tc.shouldBeBlocked ? 'BLOCK' : 'ALLOW'
  const resultText = result ? 'BLOCKED' : 'ALLOWED'
  const status = passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`

  console.log(`\n${C.bold}[TEST ${totalTests}]${C.reset} ${tc.language.toUpperCase()}`)
  console.log(`  Question: "${tc.question}"`)
  console.log(`  Expected: ${expectText} | Got: ${resultText}`)
  console.log(`  Reason: ${tc.reason}`)
  console.log(`  ${status}`)

  if (passed) {
    passedTests++
  } else {
    failures.push(
      `Test ${totalTests}: Expected ${expectText} but got ${resultText}\n    Question: "${tc.question}"`
    )
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}=== Display-Level Price Question Safety Filter Test ===${C.reset}\n`)

  for (const tc of testCases) {
    runTest(tc)
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${'═'.repeat(70)}${C.reset}`)
  console.log(`\n${C.bold}SUMMARY${C.reset}`)
  console.log(`\nTests run: ${totalTests}`)
  console.log(`${C.green}Passed: ${passedTests}${C.reset}`)
  console.log(`${C.red}Failed: ${totalTests - passedTests}${C.reset}`)

  if (failures.length > 0) {
    console.log(`\n${C.bold}Failures:${C.reset}`)
    for (const f of failures) {
      console.log(`  ${C.red}✗${C.reset} ${f}`)
    }
  }

  const success = passedTests === totalTests
  if (success) {
    console.log(`\n${C.green}✅ All display-level filter tests passed!${C.reset}\n`)
    console.log(`${C.cyan}Key validations:${C.reset}`)
    console.log(`  • Invalid price question blocked: "כמה עולה חנות בגדי יד שנייה?"`)
    console.log(`  • Valid product price allowed: "כמה עולה בושם לגבר?"`)
    console.log(`  • Valid service price allowed: "כמה עולה ניקיון משרדים?"`)
    console.log(`  • Valid service price allowed: "כמה עולה פרסום באינסטגרם?"`)
    console.log(`  • Provider selection allowed: "איך לבחור חברת SEO?"`)
    console.log(``)
    process.exit(0)
  } else {
    console.log(`\n${C.red}⚠️  Some display-level filter tests failed.${C.reset}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(C.red, err, C.reset)
  process.exit(1)
})
