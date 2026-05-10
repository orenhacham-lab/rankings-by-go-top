/**
 * AI Visibility dispatcher
 * Routes scan requests to the appropriate provider
 *
 * Currently only ScrapeLLM is supported.
 * Additional providers can be added by creating new provider implementations.
 */

import { AIProvider, AIProviderInput, AIProviderResult } from './providers/types'
import { createScrapeLLMProvider } from './providers/scrapellm'

let providerCache: AIProvider | null = null

/**
 * Get or create the default provider (ScrapeLLM)
 * Caches the provider instance
 */
function getProvider(): AIProvider {
  if (!providerCache) {
    providerCache = createScrapeLLMProvider()
  }
  return providerCache
}

/**
 * Run an AI Visibility scan
 * @param input - scan input with engine, prompt, and optional target info
 * @returns normalized result from the provider
 */
export async function runAIVisibilityScan(input: AIProviderInput): Promise<AIProviderResult> {
  const provider = getProvider()

  // Validate engine is supported
  if (!provider.supportsEngine(input.engine)) {
    return {
      provider: provider.id,
      engine: input.engine,
      responseText: '',
      rawResponse: null,
      citations: [],
      mentionedInText: false,
      targetCitedInSources: false,
      citationCount: 0,
      sourceCount: 0,
      error: `Engine "${input.engine}" is not configured or supported by ${provider.id}`,
    }
  }

  // Run the scan
  return provider.run(input)
}

/**
 * Check if a provider is available
 * Useful for checking if SCRAPELLM_API_KEY is set before running scans
 */
export function isProviderAvailable(): boolean {
  try {
    getProvider()
    return true
  } catch {
    return false
  }
}

/**
 * Get list of supported engines for the current ScrapeLLM provider.
 * Note: claude is NOT supported by ScrapeLLM. google_ai_overview is an alias for google_ai_mode.
 */
export function getSupportedEngines(): string[] {
  return ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode']
}
