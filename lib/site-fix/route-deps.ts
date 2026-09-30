/**
 * The real dependencies the auto-fix routes wire into lib/site-fix/api.ts. Server-side only.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, encryptCredential } from '@/lib/security/credentials-crypto'
import { clientIpFrom } from '@/lib/free-check/store'
import {
  detectSeoCapabilities, findItemByUrl, getItemForEdit, searchItems, updateItemFields, writeVerifiedSeoMeta,
} from '@/lib/wordpress/client'
import { liveReader as siteHealthLiveReader } from '@/lib/site-health/api'
import { getRecoGenAiClient } from '@/lib/content/recommendations/genai-client'
import { RECOMMENDATION_MODEL_PRIMARY } from '@/lib/content/recommendations/model'
import { resolveModelConfig } from '@/lib/content/recommendations/model-config'
import type { FixesDeps } from './api'
import { liveReader, liveTextReader } from './preview'
import type { Generate } from './suggest'

/**
 * The model behind titles, descriptions and FAQ suggestions (./suggest.ts). Its answer is only a
 * candidate: every one is validated there (length, never the current text, FAQ grounded in the
 * page) and dropped when it fails. Without a model client the suggestions fall back to the page's
 * own words, or to "no automatic fix".
 */
export const siteFixGenerate: Generate = async (prompt) => {
  const client = getRecoGenAiClient()
  if (!client) throw new Error('suggest_unavailable')
  const mc = resolveModelConfig(RECOMMENDATION_MODEL_PRIMARY, 2048)
  const resp = await client.models.generateContent({
    model: RECOMMENDATION_MODEL_PRIMARY,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.4,
      maxOutputTokens: mc.maxOutputTokens,
      thinkingConfig: { thinkingBudget: mc.thinkingBudget },
      abortSignal: AbortSignal.timeout(25_000),
    },
  })
  return typeof resp.text === 'string' ? resp.text : ''
}

export function routeDeps(userId: string | null, headers: Headers): FixesDeps {
  const ip = clientIpFrom(headers)
  return {
    userId,
    ip: ip === 'unknown' ? null : ip.slice(0, 64),
    admin: createAdminClient(),
    decrypt: decryptCredential,
    encrypt: encryptCredential,
    wp: {
      findItemByUrl, getItemForEdit, updateItemFields, searchItems, detectSeoCapabilities, writeVerifiedSeoMeta,
      readLivePage: siteHealthLiveReader(),
    },
    readLive: liveReader(),
    readText: liveTextReader(),
    generate: siteFixGenerate,
  }
}
