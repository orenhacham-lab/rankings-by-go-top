/**
 * Phase 2.5 — isolated test for the full generation pipeline:
 *   analyzeSelectedKeywordSignals  →  generateKeywordResearchQuestions
 *
 * Run:  npx tsx scripts/test-keyword-question-generator.ts
 *
 * No UI, no API calls, no network.
 */

import { analyzeSelectedKeywordSignals } from '../lib/ai-visibility/keyword-analysis'
import {
  generateKeywordResearchQuestions,
  summarizeGeneration,
  type GeneratedKRQuestion,
} from '../lib/ai-visibility/keyword-research-question-generator'
import type { BusinessCategory } from '../lib/ai-visibility/prompt-templates'

// ── Terminal colour helpers ──────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  gray:  '\x1b[90m',
  bold:  '\x1b[1m',
  cyan:  '\x1b[36m',
  yellow:'\x1b[33m',
}

let pass = 0; let fail = 0

// ── Test runner ──────────────────────────────────────────────────────────────

interface Expectation {
  minCount?: number          // at least N questions
  maxCount?: number          // at most N questions (0 = none)
  containsAll?: string[]     // all of these strings must appear in some question
  containsNone?: string[]    // none of these strings may appear in any question
  questionsShouldBe?: number // exactly N questions
}

function runCase(
  name: string,
  keywords: string[],
  projectCategory: BusinessCategory | null,
  language: 'he' | 'en',
  expectations: Expectation,
): void {
  const analyses = analyzeSelectedKeywordSignals({
    selectedKeywords: keywords,
    projectCategory: projectCategory ?? undefined,
    language,
  })

  const questions = generateKeywordResearchQuestions(analyses, language)

  // Collect question texts for matching
  const questionTexts = questions.map(q => q.question)
  const questionJoined = questionTexts.join('\n').toLowerCase()

  // Check expectations
  const errors: string[] = []

  if (expectations.maxCount !== undefined && questions.length > expectations.maxCount) {
    errors.push(`Expected max ${expectations.maxCount} questions, got ${questions.length}`)
  }
  if (expectations.minCount !== undefined && questions.length < expectations.minCount) {
    errors.push(`Expected min ${expectations.minCount} questions, got ${questions.length}`)
  }
  if (expectations.questionsShouldBe !== undefined && questions.length !== expectations.questionsShouldBe) {
    errors.push(`Expected exactly ${expectations.questionsShouldBe} questions, got ${questions.length}`)
  }

  for (const fragment of (expectations.containsAll ?? [])) {
    if (!questionJoined.includes(fragment.toLowerCase())) {
      errors.push(`Missing expected fragment: "${fragment}"`)
    }
  }

  for (const forbidden of (expectations.containsNone ?? [])) {
    const matches = questionTexts.filter(q => q.toLowerCase().includes(forbidden.toLowerCase()))
    if (matches.length > 0) {
      errors.push(`Forbidden fragment "${forbidden}" found in: ${matches.map(q => `"${q}"`).join(', ')}`)
    }
  }

  // Print result
  const ok = errors.length === 0
  if (ok) {
    pass++
    console.log(`${C.green}✅ PASS${C.reset}  ${C.bold}${name}${C.reset}`)
  } else {
    fail++
    console.log(`${C.red}❌ FAIL${C.reset}  ${C.bold}${name}${C.reset}`)
    for (const e of errors) console.log(`     ${C.red}✗ ${e}${C.reset}`)
  }

  // Always show generated questions for visibility
  if (questions.length === 0) {
    console.log(`     ${C.gray}(no questions generated)${C.reset}`)
  } else {
    for (const q of questions) {
      const topicTag = q.topic ? `[${q.topic}]` : ''
      const typeTag  = `[${q.type}]`
      console.log(`     ${C.cyan}${typeTag}${topicTag}${C.reset} ${q.question}`)
    }
  }
  console.log()
}

// ── Test suite ───────────────────────────────────────────────────────────────

console.log(`\n${C.bold}=== Phase 2.5 — Question Generator Tests ===${C.reset}\n`)

// ── Test 1: Go Top + קידום אתרים אורגני
runCase(
  'Test 1 — Go Top + קידום אתרים אורגני → SEO service questions',
  ['קידום אתרים אורגני'],
  'agency',
  'he',
  {
    minCount: 3,
    // Must include SEO-related questions
    containsAll: ['SEO'],
    // Must not use לקנות for services
    containsNone: ['לקנות', 'לרכוש', 'מוצר'],
  },
)

// ── Test 2: Go Top + פרסום באינסטגרם
runCase(
  'Test 2 — Go Top + פרסום באינסטגרם → Instagram paid questions, NO Google Ads',
  ['פרסום באינסטגרם'],
  'agency',
  'he',
  {
    minCount: 2,
    containsAll: ['אינסטגרם'],
    containsNone: ['Google Ads', 'גוגל אדס', 'adwords'],
  },
)

// ── Test 3: Go Top + קידום ממומן
runCase(
  'Test 3 — Go Top + קידום ממומן → generic paid ads, NOT Google-only',
  ['קידום ממומן'],
  'agency',
  'he',
  {
    minCount: 2,
    containsNone: ['Google Ads', 'גוגל אדס', 'פרסום בגוגל', 'adwords'],
  },
)

// ── Test 4: Go Top + פרסום בגוגל
runCase(
  'Test 4 — Go Top + פרסום בגוגל → Google Ads questions',
  ['פרסום בגוגל'],
  'agency',
  'he',
  {
    minCount: 2,
    containsAll: ['גוגל'],
  },
)

// ── Test 5: Sports store + הליכון ביתי — natural Hebrew, no "לבית" redundancy
runCase(
  'Test 5 — Sports store + הליכון ביתי → product/sports questions, natural Hebrew',
  ['הליכון ביתי'],
  'sports_store',
  'he',
  {
    minCount: 2,
    // Must NOT produce "הליכון ביתי לבית" (was a known bug)
    containsNone: ['הליכון ביתי לבית', 'מתאים'],
  },
)

// ── Test 6: Fashion + שמלות — no gender agreement error
runCase(
  'Test 6 — Fashion ecommerce + שמלות → fashion questions, NO "שמלות מתאים"',
  ['שמלות'],
  'second_hand_fashion',
  'he',
  {
    minCount: 2,
    // These specific wrong forms must never appear
    containsNone: ['שמלות מתאים', 'שמלות מתאימות מתאים', 'שמלות איכותיים'],
  },
)

// ── Test 7: Fashion + נעלי נשים — no adjective agreement error
runCase(
  'Test 7 — Fashion ecommerce + נעלי נשים → no adjective errors',
  ['נעלי נשים'],
  'second_hand_fashion',
  'he',
  {
    minCount: 2,
    containsNone: ['נעלי נשים מתאים', 'נעלי נשים מתאימות', 'נעלי נשים איכותי'],
  },
)

// ── Test 8: English construction + kitchen remodeling
runCase(
  'Test 8 — English construction + kitchen remodeling → English service questions',
  ['kitchen remodeling'],
  'home_improvement_service',
  'en',
  {
    minCount: 2,
    // English seeds should fire
    containsAll: ['renovation', 'contractor', 'How'],
  },
)

// ── Test 9: Irrelevant keyword
runCase(
  'Test 9 — איראן → 0 questions',
  ['איראן'],
  'agency',
  'he',
  {
    questionsShouldBe: 0,
  },
)

// ── Test 10: Cleaning company + קידום אתרים — mismatch
runCase(
  'Test 10 — Cleaning company + קידום אתרים אורגני → 0 questions (mismatch)',
  ['קידום אתרים אורגני'],
  'cleaning',
  'he',
  {
    questionsShouldBe: 0,
    // No cleaning questions should appear as fallback
    containsNone: ['ניקיון', 'חברת ניקיון'],
  },
)

// ── Bonus: multiple keywords in one batch
console.log(`${C.bold}── Bonus: Multi-keyword batch ──${C.reset}\n`)
runCase(
  'Bonus A — Go Top + both פרסום בגוגל + פרסום באינסטגרם → questions for both',
  ['פרסום בגוגל', 'פרסום באינסטגרם'],
  'agency',
  'he',
  {
    minCount: 4,
  },
)

runCase(
  'Bonus B — Fashion + נעלי נשים + שמלות → deduplicated fashion questions',
  ['נעלי נשים', 'שמלות'],
  'second_hand_fashion',
  'he',
  {
    minCount: 3,
    containsNone: ['מתאים', 'מתאימות', 'איכותיים', 'איכותי'],
  },
)

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail
const pct   = Math.round(100 * pass / total)
const icon  = fail === 0 ? `${C.green}✅` : `${C.red}⚠️`
console.log('─'.repeat(60))
console.log(`\n${icon}  Results: ${pass}/${total} passed (${pct}%)${C.reset}`)
if (fail > 0) {
  console.log(`${C.red}   ${fail} test(s) failed.${C.reset}`)
  process.exit(1)
} else {
  console.log(`${C.green}   All tests passed.${C.reset}`)
}
console.log()
