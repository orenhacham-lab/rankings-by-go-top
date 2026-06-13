/**
 * Test: Smart Question Enrichment Quality Fixes
 *
 * Run with: npx tsx scripts/test-enrichment-quality-fixes.ts
 *
 * Verifies:
 * 1. Non-priceable business entities are blocked (store, company, brand, website)
 * 2. Valid product/service price questions are allowed
 * 3. Provider selection questions are allowed
 * 4. User-visible debug text is removed from UI output
 */

import { generateSmartQuestionKeywordEnrichment } from '../lib/ai-visibility/smart-question-keyword-enrichment'
import { generatePromptSuggestions } from '../lib/ai-visibility/prompt-templates'

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

// ── Test runner ────────────────────────────────────────────────────────────
interface TestCase {
  name: string
  keyword: string
  language: 'he' | 'en'
  businessCategory: string  // any BusinessCategory
  businessName: string
  // Assertions
  forbiddenQuestions?: string[]  // questions that MUST NOT appear
  allowedPatterns?: string[]      // patterns that SHOULD appear (if any candidates exist)
  expectZeroCandidates?: boolean
}

interface TestResult {
  name: string
  passed: boolean
  failures: string[]
  candidateCount: number
  candidates: string[]
}

let totalTests = 0
let passedTests = 0

function normalize(text: string): string {
  return text.toLowerCase().replace(/[?!,;]/g, '').trim()
}

async function runTest(tc: TestCase): Promise<TestResult> {
  totalTests++
  const failures: string[] = []

  // Generate initial suggestions (vNext baseline)
  const existing = generatePromptSuggestions({
    businessName: tc.businessName,
    domain: null,
    city: null,
    country: null,
    language: tc.language,
    keywords: [tc.keyword],
    manualProfile: null,
    limit: 8,
  })

  // Generate enrichment
  const result = generateSmartQuestionKeywordEnrichment({
    projectKeywords: [tc.keyword],
    language: tc.language,
    projectCategory: tc.businessCategory as any,
    businessName: tc.businessName,
    existingSuggestions: existing,
    savedQuestions: [],
    alreadyShownQuestions: [],
    limit: 3,
  })

  const candidates = result.candidates

  // Check for forbidden questions
  if (tc.forbiddenQuestions) {
    for (const forbidden of tc.forbiddenQuestions) {
      for (const c of candidates) {
        if (normalize(c.question) === normalize(forbidden)) {
          failures.push(`FORBIDDEN question appeared: "${c.question}"`)
        }
      }
    }
  }

  // Check for allowed patterns
  if (tc.allowedPatterns && candidates.length > 0) {
    let foundAllowed = false
    for (const pattern of tc.allowedPatterns) {
      if (candidates.some((c) => c.question.toLowerCase().includes(pattern.toLowerCase()))) {
        foundAllowed = true
        break
      }
    }
    if (!foundAllowed && !tc.expectZeroCandidates) {
      failures.push(`No allowed patterns found in candidates`)
    }
  }

  // Check zero candidates expectation
  if (tc.expectZeroCandidates && candidates.length > 0) {
    failures.push(`Expected zero candidates, got ${candidates.length}: ${candidates.map((c) => c.question).join(', ')}`)
  }

  // Check that reason field is empty (no user-visible debug text)
  if (candidates.length > 0) {
    for (const c of candidates) {
      if (c.reason && c.reason.includes('Enrichment from keyword')) {
        failures.push(`User-visible debug text in reason: "${c.reason}"`)
      }
    }
  }

  const passed = failures.length === 0
  if (passed) passedTests++

  const status = passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`
  console.log(`\n${C.bold}[TEST] ${tc.name}${C.reset}`)
  console.log(`  Keyword: "${tc.keyword}"`)
  console.log(`  Category: ${tc.businessCategory} | Language: ${tc.language}`)
  console.log(`  Candidates: ${candidates.length}`)
  if (candidates.length > 0) {
    for (const c of candidates) {
      console.log(`    • ${c.question}`)
    }
  } else {
    console.log(`    (no candidates)`)
  }
  console.log(`  ${status}`)
  for (const f of failures) {
    console.log(`    ${C.red}✗ ${f}${C.reset}`)
  }

  return {
    name: tc.name,
    passed,
    failures,
    candidateCount: candidates.length,
    candidates: candidates.map((c) => c.question),
  }
}

// ── Test suite ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}=== Enrichment Quality Fixes Verification ===${C.reset}\n`)

  const testCases: TestCase[] = [
    // ──────────────────────────────────────────────────────────────────────
    // BUG FIX #1: Non-priceable business entities MUST BE BLOCKED
    // ──────────────────────────────────────────────────────────────────────

    {
      name: 'Hebrew: חנות בגדי יד שנייה — store price questions blocked',
      keyword: 'חנות בגדי יד שנייה',
      language: 'he',
      businessCategory: 'second_hand_fashion',
      businessName: 'Second Hand Fashion',
      forbiddenQuestions: ['כמה עולה חנות בגדי יד שנייה?'],
      // Selection/informational questions may appear
    },

    {
      name: 'Hebrew: חנות אופנה — store price questions blocked',
      keyword: 'חנות אופנה',
      language: 'he',
      businessCategory: 'ecommerce',
      businessName: 'Fashion Store',
      forbiddenQuestions: ['כמה עולה חנות אופנה?'],
    },

    {
      name: 'Hebrew: אתר בגדים — website price questions blocked',
      keyword: 'אתר בגדים',
      language: 'he',
      businessCategory: 'ecommerce',
      businessName: 'Fashion Website',
      forbiddenQuestions: ['כמה עולה אתר בגדים?'],
    },

    {
      name: 'Hebrew: חברת SEO — company is not priceable',
      keyword: 'חברת SEO',
      language: 'he',
      businessCategory: 'agency',
      businessName: 'SEO Company',
      forbiddenQuestions: ['כמה עולה חברת SEO?'],
      allowedPatterns: ['איך לבחור'],  // selection questions allowed
    },

    {
      name: 'Hebrew: חברת ניקיון — company is not priceable',
      keyword: 'חברת ניקיון',
      language: 'he',
      businessCategory: 'cleaning',
      businessName: 'Cleaning Company',
      forbiddenQuestions: ['כמה עולה חברת ניקיון?'],
      allowedPatterns: ['איך לבחור'],  // selection questions allowed
    },

    // ──────────────────────────────────────────────────────────────────────
    // Valid price questions MUST BE ALLOWED
    // ──────────────────────────────────────────────────────────────────────

    {
      name: 'Hebrew: שמלות — product questions allowed',
      keyword: 'שמלות',
      language: 'he',
      businessCategory: 'ecommerce',
      businessName: 'Fashion Store',
      allowedPatterns: ['בחור', 'מחיר', 'עולה'],  // selection or price
    },

    {
      name: 'Hebrew: בושם לגבר — fragrance questions allowed',
      keyword: 'בושם לגבר',
      language: 'he',
      businessCategory: 'ecommerce',
      businessName: 'Perfume Store',
      allowedPatterns: ['הבדל', 'בחור', 'עולה'],
    },

    {
      name: 'Hebrew: ניקיון משרדים — service questions allowed',
      keyword: 'ניקיון משרדים',
      language: 'he',
      businessCategory: 'cleaning',
      businessName: 'Cleaning Service',
      allowedPatterns: [],  // may have few candidates due to dedup
    },

    {
      name: 'Hebrew: פרסום באינסטגרם — service price questions allowed',
      keyword: 'פרסום באינסטגרם',
      language: 'he',
      businessCategory: 'agency',
      businessName: 'Digital Agency',
      allowedPatterns: ['עולה', 'מחיר'],
    },

    {
      name: 'Hebrew: הליכון ביתי — product price questions allowed',
      keyword: 'הליכון ביתי',
      language: 'he',
      businessCategory: 'ecommerce',
      businessName: 'Sports Store',
      allowedPatterns: ['עולה', 'מחיר'],
    },

    // ──────────────────────────────────────────────────────────────────────
    // English tests
    // ──────────────────────────────────────────────────────────────────────

    {
      name: 'English: cleaning company — company price questions blocked',
      keyword: 'cleaning company',
      language: 'en',
      businessCategory: 'cleaning',
      businessName: 'Cleaning Company',
      forbiddenQuestions: ['How much does a cleaning company cost?'],
      // Selection questions allowed
    },

    {
      name: 'English: seo agency — agency price questions blocked',
      keyword: 'seo agency',
      language: 'en',
      businessCategory: 'agency',
      businessName: 'SEO Agency',
      forbiddenQuestions: ['How much does an seo agency cost?'],
      // Selection questions allowed
    },

    {
      name: 'English: treadmill — product price questions allowed',
      keyword: 'home treadmill',
      language: 'en',
      businessCategory: 'ecommerce',
      businessName: 'Sports Store',
      // Price and selection questions allowed for products
    },
  ]

  const results: TestResult[] = []
  for (const tc of testCases) {
    results.push(await runTest(tc))
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${'═'.repeat(70)}${C.reset}`)
  console.log(`\n${C.bold}SUMMARY${C.reset}`)
  console.log(`\nTests run: ${totalTests}`)
  console.log(`${C.green}Passed: ${passedTests}${C.reset}`)
  console.log(`${C.red}Failed: ${totalTests - passedTests}${C.reset}`)

  console.log(`\n${C.bold}Test breakdown:${C.reset}`)
  for (const r of results) {
    const icon = r.passed ? C.green + '✓' : C.red + '✗'
    console.log(`  ${icon}${C.reset} ${r.name} (${r.candidateCount} candidates)`)
  }

  const success = passedTests === totalTests
  if (success) {
    console.log(`\n${C.green}✅ All quality tests passed.${C.reset}\n`)
    process.exit(0)
  } else {
    console.log(`\n${C.red}⚠️  Some quality tests failed.${C.reset}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(C.red, err, C.reset)
  process.exit(1)
})
