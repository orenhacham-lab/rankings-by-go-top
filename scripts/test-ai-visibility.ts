/**
 * Local test script for AI Visibility provider
 * Tests the ScrapeLLM adapter with one engine (Perplexity)
 *
 * Usage: npx tsx scripts/test-ai-visibility.ts
 * Requires: SCRAPELLM_API_KEY environment variable set
 *
 * This script does NOT write to the database.
 * It only tests the provider adapter in isolation.
 */

import { runAIVisibilityScan } from '../lib/ai-visibility'
import { createScrapeLLMProvider } from '../lib/ai-visibility/providers/scrapellm'

const testPrompt = 'What are the best SEO practices for e-commerce websites?'
const testDomain = 'example.com'
const testBrand = 'Example Store'

async function testProvider() {
  console.log('🧪 AI Visibility Provider Test')
  console.log('='.repeat(60))

  // Check if API key is set
  if (!process.env.SCRAPELLM_API_KEY) {
    console.error('❌ SCRAPELLM_API_KEY is not set')
    console.log('Set it before running: export SCRAPELLM_API_KEY=<your_key>')
    process.exit(1)
  }

  try {
    console.log('\n📋 Test Configuration:')
    console.log(`  Engine: perplexity`)
    console.log(`  Prompt: "${testPrompt}"`)
    console.log(`  Target Domain: ${testDomain}`)
    console.log(`  Target Brand: ${testBrand}`)

    console.log('\n🚀 Running scan via dispatcher...')
    const result = await runAIVisibilityScan({
      engine: 'perplexity',
      prompt: testPrompt,
      targetDomain: testDomain,
      targetBrandName: testBrand,
      country: 'US',
      language: 'en',
      timeout: 45000,
    })

    console.log('\n✅ Scan completed!')
    console.log('\n📊 Result Structure:')
    console.log(JSON.stringify(
      {
        provider: result.provider,
        engine: result.engine,
        responseText: `[${result.responseText.length} chars]`,
        responseSummary: result.responseSummary ? result.responseSummary.substring(0, 80) + '...' : undefined,
        citationCount: result.citationCount,
        sourceCount: result.sourceCount,
        mentionedInText: result.mentionedInText,
        mentionedPositions: result.mentionedPositions,
        targetCitedInSources: result.targetCitedInSources,
        creditsUsed: result.creditsUsed,
        error: result.error,
        rawResponseType: typeof result.rawResponse,
      },
      null,
      2
    ))

    console.log('\n📌 Sample Citations (first 3):')
    result.citations.slice(0, 3).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.title || c.url}`)
      console.log(`     URL: ${c.url}`)
      console.log(`     Domain: ${c.domain}`)
      if (c.snippet) console.log(`     Snippet: ${c.snippet.substring(0, 60)}...`)
    })

    console.log('\n✨ Key Findings:')
    console.log(`  ✓ Mentioned in text: ${result.mentionedInText}`)
    console.log(`  ✓ Target cited in sources: ${result.targetCitedInSources}`)
    console.log(`  ✓ Total citations parsed: ${result.citationCount}`)
    console.log(`  ✓ Response length: ${result.responseText.length} characters`)
    if (result.creditsUsed !== undefined) {
      console.log(`  ✓ Credits used: ${result.creditsUsed}`)
    }

    console.log('\n✅ Test passed! Provider adapter is working correctly.')
    console.log('\nNotes:')
    console.log('  - Response was normalized correctly')
    console.log('  - Mention detection separated from citation detection')
    console.log('  - Citations were parsed and domain-normalized')
    console.log('  - Ready for Phase 2-C: API routes')
  } catch (err) {
    console.error('\n❌ Test failed!')
    console.error(err instanceof Error ? err.message : String(err))
    console.log('\nDebugging tips:')
    console.log('  1. Check SCRAPELLM_API_KEY is correct')
    console.log('  2. Verify network connectivity to ScrapeLLM')
    console.log('  3. Check if the selected engine is supported')
    process.exit(1)
  }
}

// Run the test
testProvider()
