/**
 * The exact request that creates a post on a Business Profile, built from a row
 * that has ALREADY passed validatePostInput on the server. Pure, so a guard can
 * pin the shape without a network.
 *
 *   POST https://mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/localPosts
 *   { languageCode, summary, topicType: 'STANDARD',
 *     callToAction?: { actionType, url? },      // no url for CALL
 *     media?: [{ mediaFormat: 'PHOTO', sourceUrl }] }
 *
 * localPosts lives only on the v4 API (never migrated to v1). Everything that
 * speaks to Google's post endpoint goes through here and lib/gbp/api.ts, so a
 * future migration is local.
 */
import type { GbpCtaType } from './validate'

export const GBP_V4_BASE = 'https://mybusiness.googleapis.com/v4'

/** "accounts/123" + "locations/456" → "accounts/123/locations/456". Refuses anything else. */
export function v4LocationParent(accountName: string, locationName: string): string {
  const acc = /^accounts\/([0-9A-Za-z_-]{1,64})$/.exec(accountName)
  const loc = /^(?:accounts\/[0-9A-Za-z_-]{1,64}\/)?locations\/([0-9A-Za-z_-]{1,64})$/.exec(locationName)
  if (!acc || !loc) throw new Error('invalid_location_name')
  return `accounts/${acc[1]}/locations/${loc[1]}`
}

export interface LocalPostSpec {
  accountName: string
  locationName: string
  summary: string
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  imageUrl: string | null
  languageCode: 'he' | 'en'
}

export interface LocalPostRequest {
  url: string
  method: 'POST'
  body: {
    languageCode: string
    summary: string
    topicType: 'STANDARD'
    callToAction?: { actionType: GbpCtaType; url?: string }
    media?: { mediaFormat: 'PHOTO'; sourceUrl: string }[]
  }
}

export function buildLocalPostRequest(spec: LocalPostSpec): LocalPostRequest {
  const parent = v4LocationParent(spec.accountName, spec.locationName)
  const body: LocalPostRequest['body'] = {
    languageCode: spec.languageCode,
    summary: spec.summary,
    topicType: 'STANDARD',
  }
  if (spec.ctaType) {
    body.callToAction = spec.ctaType === 'CALL'
      ? { actionType: 'CALL' }
      : { actionType: spec.ctaType, url: spec.ctaUrl ?? '' }
  }
  if (spec.imageUrl) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: spec.imageUrl }]
  return { url: `${GBP_V4_BASE}/${parent}/localPosts`, method: 'POST', body }
}
