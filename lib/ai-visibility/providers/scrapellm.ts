/**
 * ScrapeLLM provider adapter for AI Visibility
 * Server-side only; never exposes SCRAPELLM_API_KEY to client
 *
 * Real API docs (verified):
 *   Base URL: https://api.scrapellm.com
 *   Endpoint: GET /scrapers/{scraper}?prompt=...&country=...&timeout=...
 *   Auth header: X-API-Key: ${SCRAPELLM_API_KEY}
 *   Response timeout: up to 300 seconds
 *
 * Supported engines (real scraper names):
 *   chatgpt, perplexity, gemini, copilot, grok, google_ai_mode
 *   (claude is NOT supported by ScrapeLLM)
 *   (google_ai_overview is aliased to google_ai_mode)
 *
 * Country limitations:
 *   JP and TW are not supported on: grok, gemini, copilot, google_ai_mode
 */

import { AIProvider, AIProviderInput, AIProviderResult, AICitation } from './types'
import { parseScrapeLLMCitations } from '../matching/citation-parser'
import { detectMention } from '../matching/mention-detector'
import { detectTargetCited } from '../matching/target-citation-detector'

const SCRAPELLM_BASE_URL = 'https://api.scrapellm.com'
const SCRAPELLM_TIMEOUT_MS = 60_000 // 60s — within Vercel/Next.js limits, avoids user-perceived stuck state

// Maps our internal engine IDs to ScrapeLLM scraper path segments
const ENGINE_TO_SCRAPER: Record<string, string> = {
  chatgpt: 'chatgpt',
  perplexity: 'perplexity',
  gemini: 'gemini',
  copilot: 'copilot',
  grok: 'grok',
  google_ai_mode: 'google_ai_mode',
  google_ai_overview: 'google_ai_mode', // alias: AI Overview → AI Mode
}

// Countries unsupported per engine (uppercase ISO codes)
const UNSUPPORTED_COUNTRIES_BY_ENGINE: Record<string, Set<string>> = {
  grok: new Set(['JP', 'TW']),
  gemini: new Set(['JP', 'TW']),
  copilot: new Set(['JP', 'TW']),
  google_ai_mode: new Set(['JP', 'TW']),
}

const SUPPORTED_ENGINES = new Set(Object.keys(ENGINE_TO_SCRAPER))

export interface ScrapeLLMRawResponse {
  scraper?: string
  status?: string
  job_id?: string
  prompt?: string
  country?: string
  result?: string
  result_markdown?: string
  url?: string
  created_at?: string
  credits_used?: number
  elapsed_ms?: number
  cached?: boolean
  cached_at?: string
  // engine-specific citation fields:
  links?: Array<{ text?: string; url: string }> | string[]
  sources?: Array<{ title?: string; url: string; snippet?: string }>
  citations?: Array<{
    title?: string
    url: string
    snippet?: string
    website_name?: string
    favicon?: string
    highlights?: string[]
  }>
  web_sources?: Array<{ title?: string; url: string; preview?: string }>
  x_results?: Array<{ title?: string; url: string; preview?: string }>
  search_results?: Array<{ title?: string; url: string; snippet?: string; website_name?: string }>
  error?: string
  message?: string
}

export class ScrapeLLMProvider implements AIProvider {
  readonly id = 'scrapellm'

  private apiKey: string

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SCRAPELLM_API_KEY is required but not set')
    }
    this.apiKey = apiKey
  }

  supportsEngine(engine: string): boolean {
    return SUPPORTED_ENGINES.has(engine.toLowerCase())
  }

  /**
   * Validate engine + country combination. Returns null if valid, error string otherwise.
   */
  private validateEngineCountry(engine: string, country: string | undefined): string | null {
    const scraper = ENGINE_TO_SCRAPER[engine.toLowerCase()]
    if (!scraper) {
      return `Engine "${engine}" is not supported by ScrapeLLM`
    }

    if (country) {
      const upperCountry = country.toUpperCase()
      const blocked = UNSUPPORTED_COUNTRIES_BY_ENGINE[scraper]
      if (blocked && blocked.has(upperCountry)) {
        return `Country "${upperCountry}" is not supported by ScrapeLLM for engine "${engine}"`
      }
    }

    return null
  }

  async run(input: AIProviderInput): Promise<AIProviderResult> {
    // Validate engine + country
    const validationError = this.validateEngineCountry(input.engine, input.country)
    if (validationError) {
      return this.errorResult(input.engine, validationError)
    }

    try {
      return await this.runWithTimeout(input, input.timeout ?? SCRAPELLM_TIMEOUT_MS)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return this.errorResult(input.engine, errorMessage)
    }
  }

  private errorResult(engine: string, errorMessage: string): AIProviderResult {
    return {
      provider: this.id,
      engine,
      responseText: '',
      rawResponse: null,
      citations: [],
      mentionedInText: false,
      targetCitedInSources: false,
      citationCount: 0,
      sourceCount: 0,
      error: errorMessage,
    }
  }

  private async runWithTimeout(input: AIProviderInput, timeoutMs: number): Promise<AIProviderResult> {
    const scraper = ENGINE_TO_SCRAPER[input.engine.toLowerCase()]
    const url = this.buildRequestUrl(scraper, input)

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`ScrapeLLM API error (HTTP ${response.status}): ${errorText.substring(0, 300)}`)
      }

      const rawResponse = (await response.json()) as ScrapeLLMRawResponse

      // Check for provider-level error in response body
      if (rawResponse.error) {
        throw new Error(`ScrapeLLM error: ${rawResponse.error}`)
      }

      // Prefer result_markdown when available; fall back to result
      const answerText = rawResponse.result_markdown || rawResponse.result || ''
      if (!answerText) {
        throw new Error('ScrapeLLM returned no result text')
      }

      // Parse citations using engine-specific normalizer
      const citations: AICitation[] = parseScrapeLLMCitations(input.engine, rawResponse)

      // Detect target signals (independent)
      const mentionResult = detectMention(answerText, input.targetBrandName || null, input.targetDomain || null)
      const citationResult = detectTargetCited(citations, input.targetDomain || null)

      return {
        provider: this.id,
        engine: input.engine,
        responseText: answerText,
        responseSummary: answerText.length > 300 ? `${answerText.substring(0, 300)}...` : answerText,
        rawResponse,
        citations,
        mentionedInText: mentionResult.mentioned,
        mentionedPositions: mentionResult.positions.length > 0 ? mentionResult.positions : undefined,
        targetCitedInSources: citationResult.targetCited,
        citationCount: citations.length,
        sourceCount: citations.length,
        creditsUsed: typeof rawResponse.credits_used === 'number' ? rawResponse.credits_used : undefined,
      }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  private buildRequestUrl(scraper: string, input: AIProviderInput): string {
    const params = new URLSearchParams()
    params.set('prompt', input.prompt)
    if (input.country) params.set('country', input.country.toUpperCase())
    // Use a slightly shorter server-side timeout so we have local buffer
    const serverTimeoutSec = Math.floor((input.timeout ?? SCRAPELLM_TIMEOUT_MS) / 1000)
    if (serverTimeoutSec > 0) params.set('timeout', String(serverTimeoutSec))

    return `${SCRAPELLM_BASE_URL}/scrapers/${scraper}?${params.toString()}`
  }
}

/**
 * Create a ScrapeLLM provider instance
 * Throws if SCRAPELLM_API_KEY is not set
 */
export function createScrapeLLMProvider(): ScrapeLLMProvider {
  const apiKey = process.env.SCRAPELLM_API_KEY

  if (!apiKey) {
    throw new Error('SCRAPELLM_API_KEY environment variable is not set')
  }

  return new ScrapeLLMProvider(apiKey)
}
