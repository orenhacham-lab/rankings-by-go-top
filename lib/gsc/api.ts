/**
 * Stage E1 — Google Search Console REST client (READ-ONLY). Native fetch only.
 * Uses ONLY: Sites.list and searchAnalytics.query. Never creates/deletes/modifies
 * properties. Raw responses are NEVER persisted by callers.
 */
import { GSC_API_PAGE_SIZE } from './config'
import type { GscMetricRow } from './summary'

const SITES_ENDPOINT = 'https://searchconsole.googleapis.com/webmasters/v3/sites'
const SA_QUERY = (siteUrl: string) => `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

export type GscApiErrorCode = 'reauth_required' | 'permission_error' | 'rate_limited' | 'not_found' | 'api_http_error' | 'network_error' | 'invalid_response'
export class GscApiError extends Error {
  code: GscApiErrorCode
  httpStatus: number
  constructor(code: GscApiErrorCode, httpStatus: number, message: string) { super(message); this.name = 'GscApiError'; this.code = code; this.httpStatus = httpStatus }
}

function classifyHttp(status: number): GscApiErrorCode {
  if (status === 401) return 'reauth_required'
  if (status === 403) return 'permission_error'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  return 'api_http_error'
}

async function authedFetch(url: string, accessToken: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new GscApiError('network_error', 0, 'Could not reach the Search Console API.')
  }
  let json: Record<string, unknown> = {}
  const text = await res.text()
  if (text) { try { json = JSON.parse(text) as Record<string, unknown> } catch { if (res.ok) throw new GscApiError('invalid_response', res.status, 'Malformed API response.') } }
  if (!res.ok) throw new GscApiError(classifyHttp(res.status), res.status, `Search Console API returned HTTP ${res.status}.`)
  return json
}

export interface GscSite { siteUrl: string; permissionLevel: string }

/** List Search Console properties. Returns ONLY siteUrl + permissionLevel. */
export async function listSites(accessToken: string): Promise<GscSite[]> {
  const json = await authedFetch(SITES_ENDPOINT, accessToken)
  const entries = Array.isArray(json.siteEntry) ? (json.siteEntry as Record<string, unknown>[]) : []
  return entries
    .map((e) => ({ siteUrl: String(e.siteUrl ?? ''), permissionLevel: String(e.permissionLevel ?? '') }))
    .filter((s) => s.siteUrl)
}

interface SaRow { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }

/** Detect the newest COMPLETE (final) date actually returned by the API within a lookback
 *  window. Returns null when GSC has no data for the property (→ clean empty snapshot). */
export async function probeLatestAvailableDate(accessToken: string, siteUrl: string, lookbackDays = 10): Promise<string | null> {
  const end = new Date(); end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - lookbackDays)
  const body = { startDate: iso(start), endDate: iso(end), dimensions: ['date'], rowLimit: 100, dataState: 'final' }
  const json = await authedFetch(SA_QUERY(siteUrl), accessToken, { method: 'POST', body: JSON.stringify(body) })
  const rows = Array.isArray(json.rows) ? (json.rows as SaRow[]) : []
  let latest: string | null = null
  for (const r of rows) { const d = r.keys?.[0]; if (d && (!latest || d > latest)) latest = d }
  return latest
}

export interface WindowFetchResult { rows: GscMetricRow[]; apiBatches: number; truncated: boolean }

/** Fetch query+page rows for [startDate, endDate] (inclusive), startRow-paginated up to a
 *  safety cap. Stops when a page returns fewer than the page size. Sets truncated when the
 *  cap is hit (never silently presents truncated data as complete). */
export async function fetchQueryPageWindow(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  opts: { maxRows: number; pageSize?: number },
): Promise<WindowFetchResult> {
  const pageSize = Math.min(opts.pageSize ?? GSC_API_PAGE_SIZE, GSC_API_PAGE_SIZE)
  const rows: GscMetricRow[] = []
  let startRow = 0, apiBatches = 0, truncated = false
  for (;;) {
    const body = { startDate, endDate, dimensions: ['query', 'page'], rowLimit: pageSize, startRow, dataState: 'final' }
    const json = await authedFetch(SA_QUERY(siteUrl), accessToken, { method: 'POST', body: JSON.stringify(body) })
    apiBatches++
    const batch = Array.isArray(json.rows) ? (json.rows as SaRow[]) : []
    for (const r of batch) {
      const keys = r.keys ?? []
      rows.push({ query: String(keys[0] ?? ''), page: String(keys[1] ?? ''), clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0) })
      if (rows.length >= opts.maxRows) { truncated = true; break }
    }
    if (truncated) break
    if (batch.length < pageSize) break // final short page → done
    startRow += pageSize
  }
  return { rows, apiBatches, truncated }
}

/** UTC yyyy-mm-dd. */
export function iso(d: Date): string { return d.toISOString().slice(0, 10) }
