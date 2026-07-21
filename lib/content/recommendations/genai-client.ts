/**
 * Recommendation-only Gemini client on the MODERN @google/genai SDK.
 *
 * The legacy @google/generative-ai SDK cannot set thinkingConfig, so Gemini 2.5
 * Flash ran with dynamic thinking that consumed maxOutputTokens and returned an
 * empty JSON body (MAX_TOKENS) — zeroing generation across every project. This
 * client is used ONLY by the recommendation JSON path, which disables thinking
 * (thinkingBudget: 0) so the whole output budget is spent on the JSON answer.
 * Same GEMINI_API_KEY; lazily constructed; never logs the key.
 */

import { GoogleGenAI } from '@google/genai'

let client: GoogleGenAI | null = null
let initError: string | null = null

/** Test hook — drop the memoized client (e.g. after changing RECO_GENAI_BASE_URL). */
export function resetRecoGenAiClient(): void { client = null; initError = null }

export function getRecoGenAiClient(): GoogleGenAI | null {
  if (initError) return null
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) { initError = 'GEMINI_API_KEY not set'; return null }
    try {
      // Test/E2E seam: RECO_GENAI_BASE_URL points the SDK at a local fixture
      // server (offline QA / browser E2E). Unset in production — behavior is
      // byte-identical to a plain constructor when the variable is absent.
      const baseUrl = process.env.RECO_GENAI_BASE_URL
      client = new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) })
    } catch (err) {
      initError = `Failed to initialize @google/genai: ${err instanceof Error ? err.message : String(err)}`
      return null
    }
  }
  return client
}
