/**
 * The Business Profile calls we make, and nothing else:
 *   - accounts the merchant can manage   (Account Management API v1)
 *   - the business locations in each     (Business Information API v1)
 *   - create one post, read its state    (v4 localPosts)
 * Every non-2xx answer becomes a GbpApiError code (lib/gbp/errors.ts); the
 * provider's message never leaves this file. Server-only.
 */
import { classifyGoogleError, GbpApiError } from './errors'
import { buildLocalPostRequest, GBP_V4_BASE, type LocalPostSpec } from './request'
import type { FetchLike } from './oauth'

const ACCOUNTS_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const INFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const LOCATION_READ_MASK = 'name,title,storefrontAddress,websiteUri,metadata'
const MAX_ACCOUNTS = 20
const MAX_LOCATIONS = 100

async function call(fetchImpl: FetchLike, accessToken: string, url: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new GbpApiError('google_unavailable', true)
  }
  let json: unknown = null
  try { json = await res.json() } catch { json = null }
  if (!res.ok) throw classifyGoogleError(res.status, json)
  return json
}

export interface GbpAccount { name: string; accountName: string; type: string }
export interface GbpLocation {
  /** "accounts/1/locations/2" style parent for posting is built from these two. */
  accountName: string
  locationName: string
  title: string
  address: string | null
  websiteUri: string | null
  mapsUri: string | null
}

export async function listAccounts(accessToken: string, fetchImpl: FetchLike = fetch): Promise<GbpAccount[]> {
  const out: GbpAccount[] = []
  let pageToken = ''
  do {
    const url = `${ACCOUNTS_BASE}/accounts?pageSize=20${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const json = await call(fetchImpl, accessToken, url) as { accounts?: { name?: string; accountName?: string; type?: string }[]; nextPageToken?: string }
    for (const a of json?.accounts ?? []) {
      if (typeof a.name === 'string' && /^accounts\/[0-9A-Za-z_-]+$/.test(a.name)) {
        out.push({ name: a.name, accountName: typeof a.accountName === 'string' ? a.accountName : '', type: typeof a.type === 'string' ? a.type : '' })
      }
    }
    pageToken = typeof json?.nextPageToken === 'string' ? json.nextPageToken : ''
  } while (pageToken && out.length < MAX_ACCOUNTS)
  return out.slice(0, MAX_ACCOUNTS)
}

function formatAddress(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null
  const lines = Array.isArray((a as { addressLines?: unknown }).addressLines) ? (a as { addressLines: unknown[] }).addressLines.filter((l): l is string => typeof l === 'string') : []
  const locality = (a as { locality?: unknown }).locality
  const parts = [...lines, typeof locality === 'string' ? locality : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export async function listLocations(accessToken: string, accountName: string, fetchImpl: FetchLike = fetch): Promise<GbpLocation[]> {
  if (!/^accounts\/[0-9A-Za-z_-]+$/.test(accountName)) throw new GbpApiError('location_not_found')
  const out: GbpLocation[] = []
  let pageToken = ''
  do {
    const url = `${INFO_BASE}/${accountName}/locations?pageSize=100&readMask=${encodeURIComponent(LOCATION_READ_MASK)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const json = await call(fetchImpl, accessToken, url) as { locations?: Record<string, unknown>[]; nextPageToken?: string }
    for (const l of json?.locations ?? []) {
      const name = typeof l.name === 'string' ? l.name : ''
      if (!/^locations\/[0-9A-Za-z_-]+$/.test(name)) continue
      const meta = (l.metadata && typeof l.metadata === 'object' ? l.metadata : {}) as { mapsUri?: unknown }
      out.push({
        accountName,
        locationName: name,
        title: typeof l.title === 'string' ? l.title : '',
        address: formatAddress(l.storefrontAddress),
        websiteUri: typeof l.websiteUri === 'string' ? l.websiteUri : null,
        mapsUri: typeof meta.mapsUri === 'string' && /^https:\/\//.test(meta.mapsUri) ? meta.mapsUri : null,
      })
    }
    pageToken = typeof json?.nextPageToken === 'string' ? json.nextPageToken : ''
  } while (pageToken && out.length < MAX_LOCATIONS)
  return out.slice(0, MAX_LOCATIONS)
}

/** Every location across the merchant's accounts, de-duplicated (a location can sit in a group and a personal account). */
export async function listAllLocations(accessToken: string, fetchImpl: FetchLike = fetch): Promise<GbpLocation[]> {
  const accounts = await listAccounts(accessToken, fetchImpl)
  const seen = new Set<string>()
  const out: GbpLocation[] = []
  for (const a of accounts) {
    let locs: GbpLocation[]
    try { locs = await listLocations(accessToken, a.name, fetchImpl) } catch (e) {
      // One account the merchant cannot read must not hide the others; an
      // approval or auth problem is the same for every account, so it surfaces.
      if (e instanceof GbpApiError && (e.code === 'permission_denied' || e.code === 'location_not_found')) continue
      throw e
    }
    for (const l of locs) {
      if (seen.has(l.locationName)) continue
      seen.add(l.locationName)
      out.push(l)
    }
  }
  return out
}

export type GbpPostState = 'LIVE' | 'PROCESSING' | 'REJECTED' | 'UNKNOWN'
export interface CreatedLocalPost { name: string; state: GbpPostState; searchUrl: string | null }

function readPost(json: unknown): CreatedLocalPost {
  const p = (json && typeof json === 'object' ? json : {}) as { name?: unknown; state?: unknown; searchUrl?: unknown }
  const name = typeof p.name === 'string' && /^accounts\/[^/]+\/locations\/[^/]+\/localPosts\/[^/]+$/.test(p.name) ? p.name : ''
  if (!name) throw new GbpApiError('unexpected')
  const state = p.state === 'LIVE' || p.state === 'PROCESSING' || p.state === 'REJECTED' ? p.state : 'UNKNOWN'
  const searchUrl = typeof p.searchUrl === 'string' && /^https:\/\//.test(p.searchUrl) ? p.searchUrl : null
  return { name, state, searchUrl }
}

export async function createLocalPost(accessToken: string, spec: LocalPostSpec, fetchImpl: FetchLike = fetch): Promise<CreatedLocalPost> {
  const req = buildLocalPostRequest(spec)
  const json = await call(fetchImpl, accessToken, req.url, { method: req.method, body: JSON.stringify(req.body) })
  return readPost(json)
}

export async function getLocalPost(accessToken: string, postName: string, fetchImpl: FetchLike = fetch): Promise<CreatedLocalPost> {
  if (!/^accounts\/[0-9A-Za-z_-]+\/locations\/[0-9A-Za-z_-]+\/localPosts\/[0-9A-Za-z_-]+$/.test(postName)) throw new GbpApiError('unexpected')
  return readPost(await call(fetchImpl, accessToken, `${GBP_V4_BASE}/${postName}`))
}
