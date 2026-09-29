/** What /api/gbp/status returns, as the client reads it (lib/gbp/http.ts handleStatus). */
import type { GbpCtaType } from '@/lib/gbp/validate'

export interface GbpPostView {
  id: string
  summary: string
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  imageUrl: string | null
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
  scheduledAt: string
  publishedAt: string | null
  googleState: 'LIVE' | 'PROCESSING' | 'REJECTED' | 'UNKNOWN' | null
  searchUrl: string | null
  errorCode: string | null
  createdAt: string
  sourceArticleId: string | null
}

export interface GbpArticleOption { id: string; title: string; url: string | null; imageUrl: string | null }

export type GbpStatus =
  | { ok: true; state: 'shopify' }
  | { ok: true; state: 'unavailable' }
  | {
      ok: true
      state: 'ready'
      configured: boolean
      connection: { status: 'connected' | 'reauth_required' | 'revoked'; errorCode: string | null; updatedAt: string } | null
      location: { title: string; address: string | null; mapsUri: string | null; websiteUri: string | null; locationName: string } | null
      posts: GbpPostView[]
      siteUrl: string | null
      businessName: string | null
      articles: GbpArticleOption[]
    }

export type GbpReadyStatus = Extract<GbpStatus, { state: 'ready' }>

/** The one status a merchant reads for a post: Google's review outcome wins over our transport state. */
export type PostBadgeKey = 'scheduled' | 'publishing' | 'live' | 'review' | 'rejected' | 'failed' | 'cancelled'
export function postBadgeKey(p: Pick<GbpPostView, 'status' | 'googleState'>): PostBadgeKey {
  if (p.status === 'published') {
    if (p.googleState === 'LIVE') return 'live'
    if (p.googleState === 'REJECTED') return 'rejected'
    return 'review'
  }
  return p.status
}
