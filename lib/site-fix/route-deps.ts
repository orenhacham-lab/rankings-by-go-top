/**
 * The real dependencies the auto-fix routes wire into lib/site-fix/api.ts. Server-side only.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, encryptCredential } from '@/lib/security/credentials-crypto'
import { clientIpFrom } from '@/lib/free-check/store'
import {
  detectSeoCapabilities, findItemByUrl, getItemForEdit, getMedia, searchItems, searchMedia, setMediaAlt, updateItemFields, writeVerifiedSeoMeta,
} from '@/lib/wordpress/client'
import { handleScan, linkStatusReader, liveReader as siteHealthLiveReader } from '@/lib/site-health/api'
import type { SiteHealthReport } from '@/lib/site-health/types'
import { getRecoGenAiClient } from '@/lib/content/recommendations/genai-client'
import { resolveAvailableRecommendationModel } from '@/lib/content/recommendations/model-availability'
import type { AutoFixDeps, FixesDeps } from './api'
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
  return baseDeps(userId, ip === 'unknown' ? null : ip.slice(0, 64))
}

/**
 * The scheduler's dependencies for one grant (lib/site-fix/auto-run.ts): the same as routeDeps,
 * but there is no request. The IP is the one recorded when the owner turned the switch on
 * (site_fix_auto_grants.enabled_ip), never a header. The scan runs as the grant's owner, and only
 * its report is kept; Shopify is never wired (automatic fixes are WordPress plugin only).
 */
export function cronDeps(userId: string, ip: string | null): AutoFixDeps {
  const deps = baseDeps(userId, ip ? ip.slice(0, 64) : null)
  return {
    ...deps,
    scanReport: async (scope) => {
      let report: SiteHealthReport | null = null
      await handleScan({ projectId: scope.projectId }, { userId: scope.userId, admin: deps.admin }, (line) => {
        if (line.type === 'report') report = line.report
      })
      return report
    },
    checkLink: linkStatusReader(),
  }
}

function baseDeps(userId: string | null, ip: string | null): FixesDeps {
  return {
    userId,
    ip,
    admin: createAdminClient(),
    decrypt: decryptCredential,
    encrypt: encryptCredential,
    wp: {
      findItemByUrl, getItemForEdit, updateItemFields, searchItems, detectSeoCapabilities, writeVerifiedSeoMeta,
      readLivePage: siteHealthLiveReader(),
      media: { searchMedia, getMedia, setMediaAlt },
    },
    readLive: liveReader(),
    readText: liveTextReader(),
    generate: siteFixGenerate,
  }
}
