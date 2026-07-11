/**
 * Test: Keyword Research Mismatch Gate Softening
 *
 * Run with: npx tsx scripts/test-keyword-research-mismatch-gate.ts
 *
 * Verifies that the mismatch gate is conservative and only blocks clear conflicts.
 * Keywords like "מזרני יוגה" should be allowed for sports stores.
 */

import { analyzeSelectedKeywordSignals } from '../lib/ai-visibility/keyword-analysis'
import type { BusinessCategory } from '../lib/ai-visibility/prompt-templates'

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

// ── Test suite ─────────────────────────────────────────────────────────────
interface TestCase {
  name: string
  keywords: string[]
  projectCategory: BusinessCategory
  language: 'he' | 'en'
  expectShouldGenerate: boolean
  expectMismatch: boolean
  reason: string
}

const testCases: TestCase[] = [
  // ══════════════════════════════════════════════════════════════════════
  // CRITICAL: Sports store + yoga products should ALLOW (no mismatch)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Sports store + מזרני יוגה (critical issue)',
    keywords: ['מזרני יוגה'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Yoga mats are relevant to sports/fitness stores',
  },
  {
    name: 'Sports store + מזרן יוגה',
    keywords: ['מזרן יוגה'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Yoga mat (singular) is relevant to sports stores',
  },
  {
    name: 'Sports store + ציוד יוגה',
    keywords: ['ציוד יוגה'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Yoga equipment is relevant to sports stores',
  },
  {
    name: 'Sports store + אביזרי יוגה',
    keywords: ['אביזרי יוגה'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Yoga accessories are relevant to sports stores',
  },
  {
    name: 'Sports store + ציוד פילאטיס',
    keywords: ['ציוד פילאטיס'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Pilates equipment is relevant to sports stores',
  },
  {
    name: 'Sports store + משקולות',
    keywords: ['משקולות'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Weights are relevant to sports/fitness stores',
  },
  {
    name: 'Sports store + הליכון ביתי',
    keywords: ['הליכון ביתי'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Home treadmill is relevant to sports stores',
  },
  {
    name: 'Sports store + אופני כושר',
    keywords: ['אופני כושר'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Stationary bikes are relevant to sports stores',
  },
  {
    name: 'Sports store + ציוד ספורט',
    keywords: ['ציוד ספורט'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Sports equipment is obviously relevant',
  },
  {
    name: 'Sports store + ציוד כושר',
    keywords: ['ציוד כושר'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Fitness equipment is relevant',
  },

  // ══════════════════════════════════════════════════════════════════════
  // CLEAR CONFLICTS: Should still block (mismatch)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Sports store + בושם לגבר (clear conflict)',
    keywords: ['בושם לגבר'],
    projectCategory: 'sports_store',
    language: 'he',
    expectShouldGenerate: false,
    expectMismatch: true,
    reason: 'Perfume (retail_beauty) conflicts with sports (retail_sports)',
  },
  {
    name: 'Cleaning company + מזרני יוגה (clear conflict)',
    keywords: ['מזרני יוגה'],
    projectCategory: 'cleaning',
    language: 'he',
    expectShouldGenerate: false,
    expectMismatch: true,
    reason: 'Yoga mats (retail) conflict with cleaning services',
  },

  // ══════════════════════════════════════════════════════════════════════
  // ECOMMERCE: Generic/permissive
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Generic ecommerce + מזרני יוגה',
    keywords: ['מזרני יוגה'],
    projectCategory: 'ecommerce',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Generic ecommerce is permissive',
  },

  // ══════════════════════════════════════════════════════════════════════
  // EXISTING GOOD CASES (from user's list)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Go Top agency + פרסום באינסטגרם',
    keywords: ['פרסום באינסטגרם'],
    projectCategory: 'agency',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Instagram advertising is relevant to agencies',
  },
  {
    name: 'Go Top agency + קידום ממומן',
    keywords: ['קידום ממומן'],
    projectCategory: 'agency',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Paid promotion is relevant to agencies',
  },
  {
    name: 'Fashion store + בגדים לאישה',
    keywords: ['בגדים לאישה'],
    projectCategory: 'second_hand_fashion',
    language: 'he',
    expectShouldGenerate: true,
    expectMismatch: false,
    reason: 'Womens clothing is relevant to fashion stores',
  },
]

// ── Test runner ────────────────────────────────────────────────────────────
let totalTests = 0
let passedTests = 0
const failures: string[] = []

function runTest(tc: TestCase) {
  totalTests++

  const analyses = analyzeSelectedKeywordSignals({
    selectedKeywords: tc.keywords,
    projectCategory: tc.projectCategory,
    language: tc.language,
  })

  // Check expectations
  const analysis = analyses[0]
  const actualShouldGenerate = analysis.shouldGenerate
  const actualMismatch = analysis.relevance === 'mismatch'

  const passedGenerate = actualShouldGenerate === tc.expectShouldGenerate
  const passedMismatch = actualMismatch === tc.expectMismatch
  const passed = passedGenerate && passedMismatch

  if (passed) passedTests++

  const status = passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`

  console.log(`\n${C.bold}[TEST]${C.reset} ${tc.name}`)
  console.log(`  Keywords: ${tc.keywords.join(', ')}`)
  console.log(`  Category: ${tc.projectCategory} | Language: ${tc.language}`)
  console.log(`  Type: ${analysis.keywordType} | Confidence: ${analysis.confidence} | Relevance: ${analysis.relevance}`)
  console.log(`  Should Generate: ${actualShouldGenerate} (expected ${tc.expectShouldGenerate})`)
  console.log(`  Mismatch: ${actualMismatch} (expected ${tc.expectMismatch})`)
  console.log(`  Reason: ${tc.reason}`)
  console.log(`  ${status}`)

  if (!passed) {
    const problems: string[] = []
    if (!passedGenerate) {
      problems.push(`shouldGenerate: expected ${tc.expectShouldGenerate}, got ${actualShouldGenerate}`)
    }
    if (!passedMismatch) {
      problems.push(`mismatch: expected ${tc.expectMismatch}, got ${actualMismatch}`)
    }
    failures.push(`${tc.name}: ${problems.join('; ')}`)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}=== Keyword Research Mismatch Gate Test ===${C.reset}\n`)

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
    console.log(`\n${C.green}✅ All mismatch gate tests passed!${C.reset}`)
    console.log(`\n${C.cyan}Key validations:${C.reset}`)
    console.log(`  • Sports store allows "מזרני יוגה" (yoga mats) ✓`)
    console.log(`  • Sports store allows "ציוד יוגה" (yoga equipment) ✓`)
    console.log(`  • Sports store allows "משקולות" (weights) ✓`)
    console.log(`  • Sports store allows "הליכון ביתי" (treadmill) ✓`)
    console.log(`  • Sports store blocks "בושם לגבר" (perfume) ✓`)
    console.log(`  • Cleaning company blocks yoga products ✓`)
    console.log(`  • Generic ecommerce allows all products ✓`)
    console.log(``)
    process.exit(0)
  } else {
    console.log(`\n${C.red}⚠️  Some mismatch gate tests failed.${C.reset}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(C.red, err, C.reset)
  process.exit(1)
})
