/**
 * The link network's ONE hook into article generation
 * (lib/content/article-generation.ts calls runLinkNetworkStep once, after the
 * draft is saved). Best-effort: it never throws and never fails generation; one
 * log line says what happened. The live dependencies are wired here: the
 * existing JSON model helper (the app's Gemini client and key, no new provider)
 * and the system resolver for the "same server address" rule.
 */
import { resolve4 } from 'node:dns/promises'
import { generateRecommendationJSON } from '@/lib/content/recommendations/model'
import { placeNetworkLink, type PlaceDeps, type PlaceInput, type PlaceResult } from './place'
import type { NetworkDb } from './store'

const DNS_TIMEOUT_MS = 1500

async function resolveWithTimeout(host: string): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      resolve4(host),
      new Promise<string[]>((res) => { timer = setTimeout(() => res([]), DNS_TIMEOUT_MS) }),
    ])
  } catch {
    return []
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function liveLinkNetworkDeps(): PlaceDeps {
  return {
    ask: async (prompt, schema) => {
      const r = await generateRecommendationJSON(prompt, { temperature: 0.2, maxOutputTokens: 600, noFallback: true, responseSchema: schema },
        undefined, { source: 'link_network', callPurpose: 'placement', requestedIdeaCount: 1 })
      return r.ok ? r.text : null
    },
    resolve: resolveWithTimeout,
    now: () => new Date(),
    env: process.env,
  }
}

export async function runLinkNetworkStep(db: NetworkDb, input: PlaceInput, deps: PlaceDeps = liveLinkNetworkDeps()): Promise<PlaceResult> {
  try {
    const result = await placeNetworkLink(db, input, deps)
    // Quiet when there is nothing to do; one line when it acted or skipped for a reason worth seeing.
    if (result.outcome === 'placed' || !['unavailable', 'not_member', 'disabled'].includes(result.reason)) {
      console.log('[link-network] placement', { articleId: input.articleId, ...result })
    }
    return result
  } catch (err) {
    console.warn('[link-network] placement skipped', { articleId: input.articleId, error: err instanceof Error ? err.name : 'unknown' })
    return { outcome: 'skipped', reason: 'error' }
  }
}
