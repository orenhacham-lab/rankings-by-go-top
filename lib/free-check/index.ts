/**
 * The scan engine's public surface.
 *
 * The free site check is not the only caller any more: a new project's first
 * scan seeds its settings, strategy and keywords from the same engine. This
 * barrel is the contract between them — import from `@/lib/free-check`, not
 * from the files underneath, so the internals can move without breaking a
 * caller. Nothing here is specific to the public marketing screen; the copy
 * and the gating live in `./copy` and `./findings` and are imported directly
 * by the screen that needs them.
 *
 * Everything below is safe to call from a server context only: the fetcher
 * needs DNS and the store needs the service-role client.
 */

// Admission — call before fetching anything a user named.
export { normalizeCheckUrl, assertPublicHost, domainKey } from './url-guard'
export type { UrlAdmission, UrlRejection, HostAdmission } from './url-guard'

// Fetching — the only outbound HTTP the engine performs.
export { fetchSiteHtml, fetchSiteText, MAX_BYTES, MAX_REDIRECTS, REQUEST_TIMEOUT_MS } from './site-fetch'
export type { FetchedPage, FetchedText, FetchResult, FetchFailure } from './site-fetch'

// Signals — everything measured off the page, including platform and contact.
export { extractSiteSignals, detectPlatform, readRobots, AI_BOTS, MAX_INTERNAL_LINK_URLS } from './html-signals'
export type { SiteSignals, RobotsVerdict } from './html-signals'

// Sitemaps — a seeding scan's starting set of real URLs.
export { discoverSitemapUrls, sitemapsFromRobots } from './sitemap'
export type { SitemapDiscovery, SitemapEntry } from './sitemap'

// Findings and the four AI-readiness checks.
export { buildFindings, buildGeoSignals, splitFindings } from './findings'

// Interpretation — one model call, with deterministic facts winning.
export { fetchBusinessInsight, PUBLIC_COMPETITORS } from './business-insight'
export type { BusinessInsight, InsightResult } from './business-insight'

// One whole check, end to end.
export { runFreeCheck } from './run'
export type { RunDeps, RunOutcome } from './run'

// The anonymous-scan → account handoff.
export { consumeClaimToken, issueClaimToken, isWellFormedClaimToken, hashClaimToken } from './claim'
export type { ClaimOutcome, ClaimedScan } from './claim'

export type {
  CommerceType,
  FreeCheckBusiness,
  FreeCheckErrorCode,
  FreeCheckFinding,
  FreeCheckResponse,
  FreeCheckResult,
  FindingSeverity,
  GeoSignal,
} from './types'
