/**
 * Provider abstraction layer for AI Visibility
 * All providers must implement the AIProvider interface
 */

export interface AIProviderConfig {
  apiKey: string
  timeout?: number
  baseUrl?: string
}

export interface AICitation {
  url: string
  domain: string
  title?: string
  snippet?: string
  position?: number
}

export interface AIProviderResult {
  provider: string
  engine: string
  responseText: string
  responseSummary?: string
  rawResponse: unknown
  citations: AICitation[]
  mentionedInText: boolean
  mentionedPositions?: number[]
  targetCitedInSources: boolean
  citationCount: number
  sourceCount: number
  creditsUsed?: number
  error?: string
}

export interface AIProviderInput {
  engine: string
  prompt: string
  targetDomain?: string | null
  targetBrandName?: string | null
  country?: string
  language?: string
  timeout?: number
}

export interface AIProvider {
  id: string
  supportsEngine(engine: string): boolean
  run(input: AIProviderInput): Promise<AIProviderResult>
}
