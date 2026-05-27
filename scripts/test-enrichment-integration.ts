/**
 * Integration simulation: Smart Question Keyword Enrichment — Feature Flag
 *
 * Run with: npx tsx scripts/test-enrichment-integration.ts
 *
 * Simulates the refreshSuggestions() logic (without React) for both:
 *   - Feature flag = false  → behavior identical to today
 *   - Feature flag = true   → enrichment used only when vNext is thin
 *
 * Tests cover:
 *   1. Flag OFF:  no enrichment code affects output (any context)
 *   2. Rich vNext (flag ON): enrichment NOT added
 *   3. Thin vNext — Instagram (flag ON): enrichment fills gaps
 *   4. Cleaning (flag ON): no redundant enrichment against rich vNext
 *   5. Empty keywords (flag ON): no enrichment
 *   6. Saved questions dedup (flag ON): enrichment dedupes against saved
 *   7. Already shown questions dedup (flag ON): enrichment avoids re-shown
 *
 * Does NOT modify UI, database, or Smart Questions vNext.
 */

import { generatePromptSuggestions, type PromptSuggestion } from '../lib/ai-visibility/prompt-templates'
import { generateSmartQuestionKeywordEnrichment } from '../lib/ai-visibility/smart-question-keyword-enrichment'

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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalize text for dedup — must match AIVisibilitySection logic */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
}

/**
 * Simulate the full refreshSuggestions() logic.
 * @param useEnrichmentFlag Whether the feature flag is on.
 * @returns the final trulyNew array (what would be passed to setSuggestedQuestions).
 */
function simulateRefresh({
  useEnrichmentFlag,
  projectKeywords,
  projectLanguage,
  projectBrandName,
  currentlyShown,
  allSavedPrompts,
  excludedKeys,
  diversityThreshold = 4,
}: {
  useEnrichmentFlag: boolean
  projectKeywords: string[]
  projectLanguage: string
  projectBrandName: string | null
  currentlyShown: PromptSuggestion[]
  allSavedPrompts: string[]
  excludedKeys: Set<string>
  diversityThreshold?: number
}): {
  trulyNew: PromptSuggestion[]
  enrichmentCalled: boolean
  enrichmentCount: number
  noNewSuggestionsFound: boolean
} {
  // Build exclusion ledger (mirrors AIVisibilitySection)
  const currentlyShownTexts = currentlyShown.map((q) => q.prompt)
  const exclude = [
    ...currentlyShownTexts,
    ...allSavedPrompts,
    ...Array.from(excludedKeys),
  ]

  // vNext refresh
  const refreshed = generatePromptSuggestions({
    businessName: projectBrandName,
    domain: null,
    city: null,
    country: null,
    language: projectLanguage,
    keywords: projectKeywords,
    manualProfile: null,
    shuffle: true,
    diversify: true,
    limit: 40,
    excludePrompts: exclude,
    previousSet: currentlyShownTexts,
  })

  // Client-side dedup
  const seenKeys = new Set<string>(exclude.map(normalize))
  let trulyNew = refreshed.filter((q) => !seenKeys.has(normalize(q.prompt)))

  let enrichmentCalled = false
  let enrichmentCount = 0

  // Enrichment block (mirrors AIVisibilitySection, parameterized by flag)
  if (
    useEnrichmentFlag &&
    projectKeywords.length > 0 &&
    trulyNew.length < diversityThreshold
  ) {
    enrichmentCalled = true
    const lang: 'he' | 'en' = projectLanguage === 'he' ? 'he' : 'en'

    const enrichmentResult = generateSmartQuestionKeywordEnrichment({
      projectKeywords,
      language: lang,
      businessName: projectBrandName ?? undefined,
      existingSuggestions: [...refreshed, ...currentlyShown],
      savedQuestions: allSavedPrompts,
      alreadyShownQuestions: exclude,
    })

    const enriched = enrichmentResult.candidates
      .filter((c) => !seenKeys.has(normalize(c.question)))
      .map((c): PromptSuggestion => ({
        id: `enrichment-${Math.random().toString(36).slice(2, 8)}`,
        prompt: c.question,
        intent: c.intent,
        intentLabel: c.intentLabel,
        category: 'generic',
        language: projectLanguage ?? 'he',
        qualityScore: c.confidence === 'high' ? 88 : c.confidence === 'medium' ? 72 : 55,
        confidenceTier:
          c.confidence === 'high' ? 'good'
          : c.confidence === 'medium' ? 'medium'
          : 'opportunity',
        reason: c.reason,
        chips: [],
        valueReason: '',
      }))

    enrichmentCount = enriched.length
    trulyNew = [...trulyNew, ...enriched]
  }

  const noNewSuggestionsFound = trulyNew.length === 0 || trulyNew.length < diversityThreshold

  return { trulyNew, enrichmentCalled, enrichmentCount, noNewSuggestionsFound }
}

// ── Test runner ────────────────────────────────────────────────────────────

interface TestCase {
  name: string
  useEnrichmentFlag: boolean
  projectKeywords: string[]
  projectLanguage: string
  projectBrandName: string | null
  currentlyShown?: PromptSuggestion[]
  allSavedPrompts?: string[]
  excludedKeys?: Set<string>
  // Assertions
  expectEnrichmentCalled?: boolean
  expectEnrichmentCount?: { min: number; max: number }
  expectMinTotal?: number
  expectMaxTotal?: number
  expectNoDuplicatesIn?: string[]  // prompts that must NOT appear in trulyNew
  expectNoOverlapWith?: string[]   // already-shown prompts (should not re-appear)
}

interface TestResult {
  name: string
  passed: boolean
  failures: string[]
  totalCandidates: number
  enrichmentCalled: boolean
  enrichmentCount: number
}

let totalTests = 0
let passedTests = 0

function runTest(tc: TestCase): TestResult {
  totalTests++
  const failures: string[] = []

  const {
    trulyNew,
    enrichmentCalled,
    enrichmentCount,
    noNewSuggestionsFound,
  } = simulateRefresh({
    useEnrichmentFlag: tc.useEnrichmentFlag,
    projectKeywords: tc.projectKeywords,
    projectLanguage: tc.projectLanguage,
    projectBrandName: tc.projectBrandName,
    currentlyShown: tc.currentlyShown ?? [],
    allSavedPrompts: tc.allSavedPrompts ?? [],
    excludedKeys: tc.excludedKeys ?? new Set(),
  })

  // Assertions
  if (tc.expectEnrichmentCalled !== undefined && enrichmentCalled !== tc.expectEnrichmentCalled) {
    failures.push(`enrichmentCalled: expected ${tc.expectEnrichmentCalled}, got ${enrichmentCalled}`)
  }

  if (tc.expectEnrichmentCount !== undefined) {
    if (enrichmentCount < tc.expectEnrichmentCount.min || enrichmentCount > tc.expectEnrichmentCount.max) {
      failures.push(`enrichmentCount: expected ${tc.expectEnrichmentCount.min}–${tc.expectEnrichmentCount.max}, got ${enrichmentCount}`)
    }
  }

  if (tc.expectMinTotal !== undefined && trulyNew.length < tc.expectMinTotal) {
    failures.push(`total: expected >= ${tc.expectMinTotal}, got ${trulyNew.length}`)
  }

  if (tc.expectMaxTotal !== undefined && trulyNew.length > tc.expectMaxTotal) {
    failures.push(`total: expected <= ${tc.expectMaxTotal}, got ${trulyNew.length}`)
  }

  if (tc.expectNoDuplicatesIn) {
    for (const forbidden of tc.expectNoDuplicatesIn) {
      for (const q of trulyNew) {
        if (normalize(q.prompt) === normalize(forbidden)) {
          failures.push(`forbidden exact match: "${q.prompt}"`)
        }
      }
    }
  }

  if (tc.expectNoOverlapWith) {
    const shownNorm = new Set(tc.expectNoOverlapWith.map(normalize))
    for (const q of trulyNew) {
      if (shownNorm.has(normalize(q.prompt))) {
        failures.push(`already-shown question re-appeared: "${q.prompt}"`)
      }
    }
  }

  const passed = failures.length === 0
  if (passed) passedTests++

  const flag = tc.useEnrichmentFlag ? `${C.cyan}flag=ON${C.reset}` : `${C.gray}flag=OFF${C.reset}`
  const status = passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`

  console.log(`\n${C.bold}[TEST] ${tc.name}${C.reset} (${flag})`)
  console.log(`  Keywords: ${tc.projectKeywords.join(', ') || '(none)'}`)
  console.log(`  vNew+enriched: ${trulyNew.length} | enrichmentCalled: ${enrichmentCalled} | enrichmentAdded: ${enrichmentCount}`)
  for (const q of trulyNew) {
    const source = q.id.startsWith('enrichment-') ? `${C.cyan}[ENRICHMENT]${C.reset}` : `${C.gray}[vNext]${C.reset}`
    console.log(`    ${source} ${q.prompt}`)
  }
  console.log(`  ${status}`)
  for (const f of failures) {
    console.log(`    ${C.red}✗ ${f}${C.reset}`)
  }

  return { name: tc.name, passed, failures, totalCandidates: trulyNew.length, enrichmentCalled, enrichmentCount }
}

// ── Get a baseline set of vNext suggestions (for "already shown") ──────────
function getInitialSuggestions(keywords: string[], language: string, businessName: string | null): PromptSuggestion[] {
  return generatePromptSuggestions({
    businessName,
    domain: null,
    city: null,
    country: null,
    language,
    keywords,
    manualProfile: null,
    shuffle: false,
    limit: 8,
  })
}

// ── Test suite ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}=== Enrichment Integration — Feature Flag Simulation ===${C.reset}\n`)

  // Pre-generate some baseline suggestions for reuse in tests
  const agencyKeywords = ['קידום אתרים', 'SEO', 'פרסום בגוגל']
  const instagramKeywords = ['פרסום באינסטגרם', 'קמפיין מדיה חברתית']
  const cleaningKeywords = ['ניקיון משרדים', 'ניקוי בניינים']

  const agencyBaseline = getInitialSuggestions(agencyKeywords, 'he', 'Agency Co')
  const instagramBaseline = getInitialSuggestions(instagramKeywords, 'he', 'Social Agency')
  const cleaningBaseline = getInitialSuggestions(cleaningKeywords, 'he', 'Cleaning Co')

  // Test cases
  const testCases: TestCase[] = [
    // ──────────────────────────────────────────────────────────────────────
    // Test 1: Flag OFF — enrichment must NEVER be called
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag OFF — enrichment is never called (any context)',
      useEnrichmentFlag: false,
      projectKeywords: instagramKeywords,
      projectLanguage: 'he',
      projectBrandName: 'Social Agency',
      currentlyShown: instagramBaseline.slice(0, 1),
      expectEnrichmentCalled: false,
      expectEnrichmentCount: { min: 0, max: 0 },
    },

    // ──────────────────────────────────────────────────────────────────────
    // Test 2: Flag ON + rich vNext (>= DIVERSITY_THRESHOLD) → no enrichment
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag ON — rich vNext → enrichment NOT added',
      useEnrichmentFlag: true,
      projectKeywords: agencyKeywords,
      projectLanguage: 'he',
      projectBrandName: 'Agency Co',
      currentlyShown: [],           // nothing shown yet → vNext can return many
      expectEnrichmentCalled: false, // vNext >= 4 → no need for enrichment
      expectEnrichmentCount: { min: 0, max: 0 },
    },

    // ──────────────────────────────────────────────────────────────────────
    // Test 3: Flag ON + thin vNext (Instagram, pool partially exhausted)
    //         → enrichment fills gaps
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag ON — thin vNext (Instagram) → enrichment fills gaps',
      useEnrichmentFlag: true,
      projectKeywords: instagramKeywords,
      projectLanguage: 'he',
      projectBrandName: 'Social Agency',
      // Simulate all prior 8 vNext having been shown
      currentlyShown: instagramBaseline,
      excludedKeys: new Set(instagramBaseline.map((q) => normalize(q.prompt))),
      expectEnrichmentCalled: true,
      expectEnrichmentCount: { min: 1, max: 2 },  // helper adds up to 2 on thin baseline
    },

    // ──────────────────────────────────────────────────────────────────────
    // Test 4: Flag ON + Cleaning context — vNext covers cleaning well
    //         → enrichment should not add redundant cleaning questions
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag ON — Cleaning context → no redundant enrichment',
      useEnrichmentFlag: true,
      projectKeywords: cleaningKeywords,
      projectLanguage: 'he',
      projectBrandName: 'Cleaning Co',
      currentlyShown: [],
      expectEnrichmentCount: { min: 0, max: 0 }, // all cleaning candidates deduped by entity
    },

    // ──────────────────────────────────────────────────────────────────────
    // Test 5: Flag ON + empty keywords → no enrichment
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag ON — empty keywords → no enrichment',
      useEnrichmentFlag: true,
      projectKeywords: [],
      projectLanguage: 'he',
      projectBrandName: 'Agency',
      currentlyShown: [],
      expectEnrichmentCalled: false,
      expectEnrichmentCount: { min: 0, max: 0 },
    },

    // ──────────────────────────────────────────────────────────────────────
    // Test 6: Flag ON + saved questions dedup
    //         Enrichment must not add questions already saved by the user
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag ON — enrichment dedupes against saved questions',
      useEnrichmentFlag: true,
      projectKeywords: instagramKeywords,
      projectLanguage: 'he',
      projectBrandName: 'Social Agency',
      currentlyShown: instagramBaseline,
      excludedKeys: new Set(instagramBaseline.map((q) => normalize(q.prompt))),
      // Simulate "כמה עולה פרסום באינסטגרם?" already saved
      allSavedPrompts: ['כמה עולה פרסום באינסטגרם?'],
      expectNoDuplicatesIn: ['כמה עולה פרסום באינסטגרם?'],
    },

    // ──────────────────────────────────────────────────────────────────────
    // Test 7: Flag ON + already-shown dedup
    //         Enrichment must not re-show questions already presented
    // ──────────────────────────────────────────────────────────────────────
    {
      name: 'Flag ON — enrichment does not re-show already-shown questions',
      useEnrichmentFlag: true,
      projectKeywords: instagramKeywords,
      projectLanguage: 'he',
      projectBrandName: 'Social Agency',
      currentlyShown: instagramBaseline,
      excludedKeys: new Set(instagramBaseline.map((q) => normalize(q.prompt))),
      // Simulate "איך לבחור חברה לניהול קמפיינים באינסטגרם?" already shown
      expectNoOverlapWith: instagramBaseline.map((q) => q.prompt),
    },
  ]

  const results: TestResult[] = []
  for (const tc of testCases) {
    results.push(runTest(tc))
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
    const enr = r.enrichmentCalled ? ` | enrichment: +${r.enrichmentCount}` : ''
    console.log(`  ${icon}${C.reset} ${r.name} (total: ${r.totalCandidates}${enr})`)
  }

  const success = passedTests === totalTests
  if (success) {
    console.log(`\n${C.green}✅ All tests passed.${C.reset}\n`)
    process.exit(0)
  } else {
    console.log(`\n${C.red}⚠️  Some tests failed.${C.reset}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(C.red, err, C.reset)
  process.exit(1)
})
