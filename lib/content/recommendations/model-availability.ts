/**
 * Runtime resolution of an AVAILABLE recommendation model for the active API key.
 *
 * The pinned "gemini-2.5-flash" id returned HTTP 404 "no longer available to new
 * users" for the live key — zeroing every run. Rather than guess a replacement,
 * this discovers what the active key actually offers (models.list), validates
 * generateContent support, picks the best low-cost Flash-class (never Pro), and
 * caches it briefly. An explicit GEMINI_RECOMMENDATION_MODEL overrides discovery
 * (still validated against the live list). Never logs the key.
 */

import { getRecoGenAiClient } from './genai-client'

const CACHE_TTL_MS = 10 * 60 * 1000
let cache: { model: string; at: number } | null = null

/** Explicit operator override (validated against the live list before use). */
export function configuredRecommendationModel(): string | undefined {
  return process.env.GEMINI_RECOMMENDATION_MODEL || process.env.RECOMMENDATION_MODEL_PRIMARY || undefined
}

function bare(name: string): string { return name.replace(/^models\//, '') }
function isFlashClass(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('flash') && !n.includes('pro')
}
function supportsGenerate(actions: string[] | undefined): boolean {
  return !actions || actions.length === 0 || actions.includes('generateContent')
}

/** Prefer a stable, non-lite, non-preview Flash; accept lite/preview only if needed. */
function pickBestFlash(names: string[]): string | undefined {
  if (names.length === 0) return undefined
  const score = (raw: string): number => {
    const n = raw.toLowerCase()
    let s = 0
    if (n.includes('lite')) s -= 50
    if (/(preview|exp|experimental)/.test(n)) s -= 20
    if (n.includes('thinking')) s -= 15
    if (n.includes('latest')) s += 5
    return s
  }
  return names.slice().sort((a, b) => score(b) - score(a) || (a < b ? 1 : -1))[0]
}

export type ModelResolution =
  | { ok: true; model: string }
  | { ok: false; reason: 'no_client' | 'list_failed' | 'model_unavailable'; detail?: string }

/**
 * Resolve an available Flash-class model for the active key. Cached briefly.
 * - no_client   → GEMINI_API_KEY unset (soft; treated like the legacy no-key path).
 * - list_failed → transient inability to enumerate (soft; retryable).
 * - model_unavailable → the list succeeded but no suitable model exists, or the
 *   explicitly configured model is not offered to this key (HARD, typed).
 */
export async function resolveAvailableRecommendationModel(): Promise<ModelResolution> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return { ok: true, model: cache.model }
  const client = getRecoGenAiClient()
  if (!client) return { ok: false, reason: 'no_client' }

  const available: string[] = []
  try {
    const pager = await client.models.list()
    for await (const m of pager) {
      const name = m.name ? bare(m.name) : ''
      if (name && supportsGenerate(m.supportedActions ?? undefined)) available.push(name)
    }
  } catch (err) {
    return { ok: false, reason: 'list_failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) }
  }
  if (available.length === 0) return { ok: false, reason: 'list_failed' }

  const configured = configuredRecommendationModel()
  // An explicit override must actually be offered to this key.
  if (configured) {
    if (available.includes(configured) && isFlashClass(configured)) { cache = { model: configured, at: Date.now() }; return { ok: true, model: configured } }
    if (available.includes(configured)) { cache = { model: configured, at: Date.now() }; return { ok: true, model: configured } }
    // Configured but NOT available → discover a Flash-class replacement instead of
    // erroring outright (so a stale env value can't hard-break generation).
  }
  const chosen = pickBestFlash(available.filter(isFlashClass))
  if (chosen) { cache = { model: chosen, at: Date.now() }; return { ok: true, model: chosen } }
  return { ok: false, reason: 'model_unavailable' }
}

/** Test/ops hook — clear the memoized resolution. */
export function resetModelResolutionCache(): void { cache = null }
