/**
 * Local test script for AI Visibility provider (real ScrapeLLM API)
 * Tests the ScrapeLLM adapter with one engine: Perplexity
 *
 * Usage:
 *   export SCRAPELLM_API_KEY=<your_key>
 *   npx tsx scripts/test-ai-visibility.ts
 *
 * This script does NOT write to the database.
 * It does NOT print the API key.
 * It does NOT print the full raw response.
 */

import { runAIVisibilityScan } from '../lib/ai-visibility'

const TEST_PROMPT = 'Best SEO agency in Israel?'
const TEST_COUNTRY = 'IL'
const TEST_ENGINE = 'perplexity'
const TEST_TIMEOUT_MS = 300_000

// Optional: set these to test mention/citation detection
const TEST_TARGET_DOMAIN = process.env.TEST_TARGET_DOMAIN || null
const TEST_TARGET_BRAND = process.env.TEST_TARGET_BRAND || null

async function main() {
  console.log('AI Visibility Provider Test (ScrapeLLM real API)')
  console.log('='.repeat(60))

  if (!process.env.SCRAPELLM_API_KEY) {
    console.error('SCRAPELLM_API_KEY is not set in env.')
    console.log('Run: export SCRAPELLM_API_KEY=<your_key>')
    process.exit(1)
  }

  console.log(`Engine: ${TEST_ENGINE}`)
  console.log(`Prompt: "${TEST_PROMPT}"`)
  console.log(`Country: ${TEST_COUNTRY}`)
  console.log(`Timeout: ${TEST_TIMEOUT_MS / 1000}s`)
  if (TEST_TARGET_DOMAIN) console.log(`Target domain: ${TEST_TARGET_DOMAIN}`)
  if (TEST_TARGET_BRAND) console.log(`Target brand: ${TEST_TARGET_BRAND}`)
  console.log('-'.repeat(60))
  console.log('Running...')

  const start = Date.now()
  const result = await runAIVisibilityScan({
    engine: TEST_ENGINE,
    prompt: TEST_PROMPT,
    country: TEST_COUNTRY,
    targetDomain: TEST_TARGET_DOMAIN,
    targetBrandName: TEST_TARGET_BRAND,
    timeout: TEST_TIMEOUT_MS,
  })
  const elapsedMs = Date.now() - start

  if (result.error) {
    console.error('-'.repeat(60))
    console.error('Scan failed:', result.error)
    process.exit(1)
  }

  console.log('-'.repeat(60))
  console.log('Normalized output:')
  console.log(`  engine:                ${result.engine}`)
  console.log(`  responseText length:   ${result.responseText.length}`)
  console.log(`  citationCount:        ${result.citationCount}`)
  console.log(`  targetCitedInSources:  ${result.targetCitedInSources}`)
  console.log(`  mentionedInText:       ${result.mentionedInText}`)
  console.log(`  creditsUsed:           ${result.creditsUsed ?? '(not provided)'}`)
  console.log(`  elapsedMs (local):     ${elapsedMs}`)

  console.log('\nFirst 3 citation domains:')
  result.citations.slice(0, 3).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.domain}`)
  })

  console.log('\nTest passed.')
}

main().catch((err) => {
  console.error('Unhandled error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
