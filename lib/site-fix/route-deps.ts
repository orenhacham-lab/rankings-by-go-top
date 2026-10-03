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
import { resolveAvailableRecommendationModel } from '@/lib/content/recommendations/model-availability'
import type { FixesDeps } from './api'
import { makeSiteFixGenerate } from './model'
import { liveReader, liveTextReader } from './preview'
import type { Generate } from './suggest'

/**
 * The model behind titles, descriptions and FAQ suggestions (./suggest.ts). Its answer is only a
 * candidate: every one is validated there (length, never the current text, FAQ grounded in the
 * page) and dropped when it fails. Which model, and the bounds on each call: ./model.ts. Without a
 * model client the suggestions fall back to the page's own words, or to "no automatic fix".
 */
export const siteFixGenerate: Generate = makeSiteFixGenerate({
  client: getRecoGenAiClient,
  resolve: resolveAvailableRecommendationModel,
  fallbackModel: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite',
  log: (line) => console.info(line),
})

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
