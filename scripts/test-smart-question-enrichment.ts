/**
 * Simulation: Smart Question Keyword Enrichment
 *
 * Run with: npx tsx scripts/test-smart-question-enrichment.ts
 *
 * Tests the enrichment helper across synthetic project contexts:
 * - Marketing agency (SEO/ads keywords)
 * - Fashion store (clothing keywords)
 * - Cleaning service (cleaning keywords)
 * - Sports store (equipment keywords)
 * - Construction/home improvement (English)
 * - Mixed noisy keywords
 *
 * Does NOT modify UI, database, or Smart Questions vNext.
 * Purely a simulation to test the isolated helper.
 */

import { generateSmartQuestionKeywordEnrichment } from '../lib/ai-visibility/smart-question-keyword-enrichment'
import { generatePromptSuggestions, type PromptSuggestion } from '../lib/ai-visibility/prompt-templates'
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

// ── Test runner ────────────────────────────────────────────────────────────
interface TestCase {
  name: string
  projectKeywords: string[]
  category: BusinessCategory
  language: 'he' | 'en'
  businessName: string
  expectMinCandidates?: number
  expectMaxCandidates?: number
  expectNoKeywords?: string[]  // keywords that should NOT appear in output
}

interface TestResult {
  name: string
  passed: boolean
  candidatesCount: number
  debugInfo: string
  rawDebug: any
}

let totalTests = 0
let passedTests = 0

async function runTest(testCase: TestCase): Promise<TestResult> {
  totalTests++
  console.log(`\n${C.bold}[TEST] ${testCase.name}${C.reset}`)
  console.log(`  Keywords: ${testCase.projectKeywords.join(', ')}`)
  console.log(`  Category: ${testCase.category} | Language: ${testCase.language}`)

  // Generate baseline Smart Questions (what exists)
  const existingSuggestions = generatePromptSuggestions({
    businessName: testCase.businessName,
    domain: null,
    language: testCase.language,
    keywords: testCase.projectKeywords,
    profile: null,
    limit: 8,
  })

  console.log(`  Baseline Smart Questions: ${existingSuggestions.length}`)

  // Generate enrichment
  const result = generateSmartQuestionKeywordEnrichment({
    projectKeywords: testCase.projectKeywords,
    language: testCase.language,
    projectCategory: testCase.category,
    businessName: testCase.businessName,
    existingSuggestions,
    savedQuestions: [], // assume nothing saved yet
    alreadyShownQuestions: [],
    limit: 3,
  })

  const { candidates, debug } = result

  console.log(`  ${C.cyan}Enrichment candidates: ${candidates.length}${C.reset}`)

  // Display candidates
  if (candidates.length === 0) {
    console.log(`  ${C.gray}(no enrichment candidates)${C.reset}`)
  } else {
    for (const c of candidates) {
      console.log(`    [${c.sourceType}/${c.topic || 'none'}] ${c.question}`)
      console.log(`      ├─ intent: ${c.intent}`)
      console.log(`      └─ source: ${c.sourceKeyword}`)
    }
  }

  // Display debug summary
  console.log(`  ${C.gray}Debug summary:${C.reset}`)
  console.log(
    `    Analyzed: ${debug.analyzedKeywordsCount} | Generable: ${debug.generableKeywordsCount}`,
  )
  console.log(
    `    Rejections: conf=${debug.rejectedByConfidence} mismatch=${debug.rejectedByMismatch} dup=${debug.rejectedByDuplicate} quality=${debug.rejectedByQuality}`,
  )
  console.log(`    Final: ${debug.finalCount}`)

  // Check expectations
  let passed = true
  const expectations: string[] = []

  if (testCase.expectMinCandidates !== undefined) {
    if (candidates.length < testCase.expectMinCandidates) {
      passed = false
      expectations.push(`Expected >= ${testCase.expectMinCandidates}, got ${candidates.length}`)
    }
  }

  if (testCase.expectMaxCandidates !== undefined) {
    if (candidates.length > testCase.expectMaxCandidates) {
      passed = false
      expectations.push(`Expected <= ${testCase.expectMaxCandidates}, got ${candidates.length}`)
    }
  }

  if (testCase.expectNoKeywords && testCase.expectNoKeywords.length > 0) {
    for (const forbidden of testCase.expectNoKeywords) {
      for (const c of candidates) {
        if (c.question.toLowerCase().includes(forbidden.toLowerCase())) {
          passed = false
          expectations.push(`Forbidden "${forbidden}" found in: "${c.question}"`)
        }
      }
    }
  }

  // Result
  const status = passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`
  console.log(`  ${status}`)
  if (!passed && expectations.length > 0) {
    for (const exp of expectations) {
      console.log(`    ${C.red}✗ ${exp}${C.reset}`)
    }
  }

  if (passed) passedTests++

  return {
    name: testCase.name,
    passed,
    candidatesCount: candidates.length,
    debugInfo: debug.details.join('\n'),
    rawDebug: debug,
  }
}

// ── Test suite ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}=== Smart Question Keyword Enrichment — Simulation ===${C.reset}\n`)

  const testCases: TestCase[] = [
    {
      name: 'Marketing Agency — SEO + Google Ads',
      projectKeywords: ['קידום אתרים אורגני', 'פרסום בגוגל', 'SEO services'],
      category: 'agency',
      language: 'he',
      businessName: 'Digital Agency Co.',
      expectMinCandidates: 1,
      expectMaxCandidates: 3,
    },

    {
      name: 'Marketing Agency — Instagram Ads',
      projectKeywords: ['פרסום באינסטגרם', 'קמפיין מדיה חברתית'],
      category: 'agency',
      language: 'he',
      businessName: 'Social Media Agency',
      expectMinCandidates: 0,
      expectMaxCandidates: 3,
    },

    {
      name: 'Fashion Store — Clothing keywords',
      projectKeywords: ['שמלות לנשים', 'נעלי נשים', 'אופנה כללית'],
      category: 'second_hand_fashion',
      language: 'he',
      businessName: 'Fashion Boutique',
      expectMinCandidates: 1,
      expectMaxCandidates: 3,
    },

    {
      name: 'Cleaning Company — Office cleaning',
      projectKeywords: ['ניקיון משרדים', 'ניקוי בניינים'],
      category: 'cleaning',
      language: 'he',
      businessName: 'Professional Cleaning',
      expectMinCandidates: 0,
      expectMaxCandidates: 3,
    },

    {
      name: 'Sports Store — Equipment keywords',
      projectKeywords: ['הליכון ביתי', 'אופניים', 'ציוד ספורט'],
      category: 'sports_store',
      language: 'he',
      businessName: 'Sports Equipment Store',
      expectMinCandidates: 1,
      expectMaxCandidates: 3,
    },

    {
      name: 'Construction — Home improvement',
      projectKeywords: ['kitchen remodeling', 'bathroom renovation', 'home improvement'],
      category: 'home_improvement_service',
      language: 'en',
      businessName: 'Remodeling Contractors',
      expectMinCandidates: 0,
      expectMaxCandidates: 3,
    },

    {
      name: 'Perfume Store — Fragrance products',
      projectKeywords: ['בושם לגבר', 'בשמים לנשים', 'קולוניה'],
      category: 'perfume',
      language: 'he',
      businessName: 'Perfume Boutique',
      expectMinCandidates: 0,
      expectMaxCandidates: 3,
    },

    {
      name: 'Mixed Noisy Keywords — Irrelevant + relevant',
      projectKeywords: ['איראן', 'SEO', 'weather', 'Google Ads', 'politics'],
      category: 'agency',
      language: 'he',
      businessName: 'Agency',
      expectMinCandidates: 0,
      expectMaxCandidates: 3,
      expectNoKeywords: ['איראן', 'weather', 'politics'],
    },

    {
      name: 'Empty Keywords — No input',
      projectKeywords: [],
      category: 'agency',
      language: 'he',
      businessName: 'Agency',
      expectMinCandidates: 0,
      expectMaxCandidates: 0,
    },
  ]

  const results: TestResult[] = []

  for (const testCase of testCases) {
    const result = await runTest(testCase)
    results.push(result)
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${'═'.repeat(70)}${C.reset}`)
  console.log(`\n${C.bold}SUMMARY${C.reset}`)
  console.log(`\nTests run: ${totalTests}`)
  console.log(`${C.green}Passed: ${passedTests}${C.reset}`)
  console.log(`${C.red}Failed: ${totalTests - passedTests}${C.reset}`)

  console.log(`\n${C.bold}Enrichment statistics:${C.reset}`)
  const totalCandidates = results.reduce((sum, r) => sum + r.candidatesCount, 0)
  const avgCandidates = (totalCandidates / results.length).toFixed(2)
  console.log(`  Total candidates across tests: ${totalCandidates}`)
  console.log(`  Average per test: ${avgCandidates}`)
  console.log(`  Range: 0–${Math.max(...results.map(r => r.candidatesCount))}`)

  console.log(`\n${C.bold}Test breakdown:${C.reset}`)
  for (const result of results) {
    const icon = result.passed ? C.green + '✓' : C.red + '✗'
    console.log(`  ${icon}${C.reset} ${result.name} (${result.candidatesCount} candidates)`)
  }

  // Exit code
  const success = passedTests === totalTests
  if (success) {
    console.log(`\n${C.green}✅ All tests passed.${C.reset}\n`)
    process.exit(0)
  } else {
    console.log(`\n${C.red}⚠️  Some tests failed.${C.reset}\n`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(C.red, err, C.reset)
  process.exit(1)
})
