/**
 * ScrapeLLM provider adapter for AI Visibility
 * Server-side only; never exposes SCRAPELLM_API_KEY to client
 *
 * ASSUMPTIONS about ScrapeLLM API (to be validated in Phase 2-B testing):
 * - POST to ScrapeLLM endpoint with { engine, prompt, ... }
 * - Returns { answer_text, citations[], metadata... }
 * - Supports engines: chatgpt, perplexity, gemini, copilot, google_ai_overview, claude, grok
 */

import { AIProvider, AIProviderInput, AIProviderResult } from './types'
import { parseCitations, extractCitationsFromNested } from '../matching/citation-parser'
import { detectMention } from '../matching/mention-detector'
import { detectTargetCited } from '../matching/target-citation-detector'

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
    // List of engines we support (others will be marked "Not configured")
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

      // Extract the answer text from various possible field names
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
