/**
 * ScrapeLLM provider adapter for AI Visibility
 * Server-side only; never exposes SCRAPELLM_API_KEY to client
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️  UNVERIFIED — DO NOT USE IN PRODUCTION YET ⚠️                       ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║ The ScrapeLLM API was NOT successfully verified during Phase 2-B:    ║
 * ║   - scrapellm.com returns HTTP 403 (gated or non-existent)           ║
 * ║   - docs.scrapellm.com does not resolve (ECONNREFUSED)               ║
 * ║   - No public documentation found via web search                     ║
 * ║   - No SCRAPELLM_API_KEY available locally to test                   ║
 * ║                                                                      ║
 * ║ EVERYTHING BELOW IS A PLACEHOLDER MARKED WITH "TODO(verify)":        ║
 * ║   - Base URL (currently a guess)                                     ║
 * ║   - Endpoint path (currently a guess)                                ║
 * ║   - Auth header format (Bearer; common but not confirmed)            ║
 * ║   - Request body shape (engine + prompt; not confirmed)              ║
 * ║   - Response field names (multiple fallbacks tried)                  ║
 * ║   - Engine ID strings (chatgpt, perplexity, etc.; not confirmed)     ║
 * ║                                                                      ║
 * ║ BEFORE PROCEEDING TO PHASE 2-C:                                      ║
 * ║   1. User must provide the real ScrapeLLM API docs OR API key        ║
 * ║   2. Test script must be run successfully against the real API       ║
 * ║   3. All TODO(verify) comments must be resolved                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { AIProvider, AIProviderInput, AIProviderResult } from './types'
import { parseCitations, extractCitationsFromNested } from '../matching/citation-parser'
import { detectMention } from '../matching/mention-detector'
import { detectTargetCited } from '../matching/target-citation-detector'

// TODO(verify): Real base URL + endpoint path is not yet known
const SCRAPELLM_API_URL = 'https://api.scrapellm.com/v1/ai'
const SCRAPELLM_TIMEOUT_MS = 45_000

export interface ScrapeLLMResponse {
  engine?: string
  answer_text?: string
  answer?: string
  response?: string
  text?: string
  citations?: unknown[]
  sources?: unknown[]
  references?: unknown[]
  metadata?: Record<string, unknown>
  usage?: {
    credits?: number
    cost?: number
  }
  error?: string
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
    // TODO(verify): Confirm exact engine ID strings used by ScrapeLLM.
    // These names are GUESSES until real API docs are available.
    const supported = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'google_ai_overview', 'claude', 'grok']
    return supported.includes(engine.toLowerCase())
  }

  async run(input: AIProviderInput): Promise<AIProviderResult> {
    try {
      return await this.runWithTimeout(input, input.timeout ?? SCRAPELLM_TIMEOUT_MS)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      return {
        provider: this.id,
        engine: input.engine,
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
  }

  private async runWithTimeout(input: AIProviderInput, timeoutMs: number): Promise<AIProviderResult> {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

    try {
      // TODO(verify): Confirm real auth header format (Bearer is a guess).
      // TODO(verify): Confirm real request body shape (field names may differ:
      //   could be { model, query, q, ... } instead of { engine, prompt }).
      const response = await fetch(SCRAPELLM_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          engine: input.engine,
          prompt: input.prompt,
          country: input.country,
          language: input.language,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`ScrapeLLM API error: ${errorText}`)
      }

      const rawResponse = (await response.json()) as ScrapeLLMResponse

      // TODO(verify): Confirm real response shape. Currently tries multiple
      // common field names as fallbacks; only one will actually match the real API.
      const answerText = rawResponse.answer_text || rawResponse.answer || rawResponse.response || rawResponse.text || ''

      if (!answerText) {
        throw new Error('ScrapeLLM returned no answer text')
      }

      // Parse citations from nested structure
      const citationsList = extractCitationsFromNested(rawResponse)
      const citations = parseCitations(citationsList)

      // Detect if target is mentioned in the text
      const mentionResult = detectMention(answerText, input.targetBrandName || null, input.targetDomain || null)

      // Detect if target is cited in sources
      const citationResult = detectTargetCited(citations, input.targetDomain || null)

      // Extract credits used if available
      const creditsUsed = rawResponse.usage?.credits ?? undefined

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
        creditsUsed,
      }
    } finally {
      clearTimeout(timeoutHandle)
    }
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
