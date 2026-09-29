/**
 * The site health API, framework-free so its whole contract runs under test. The
 * routes (app/api/site-health/scan/route.ts, app/api/site-health/fix/route.ts)
 * only wire the real dependencies in.
 *
 * ORDER OF CHECKS. proxy.ts does not cover /api/*, so this does it all:
 *   1. signed in                                          401 unauthorized
 *   2. a well-formed request                              400 invalid_request
 *   3. the project is theirs: read with the service role  404 not_found
 *      AND filtered by id and owner (never by id alone)
 *   4. fix only: the WordPress connection is theirs       409 no_connection
 *      (filtered by project AND owner) and decrypts
 *   5. fix only: the address is on THIS project's site    400 off_site
 *   6. apply only: `approved: true`, sent by the preview's 400 approval_required
 *      approve button, and the value the preview read
 *
 * Every refusal is { ok: false, code } with a stable code the screen turns into
 * words. Nothing WordPress, a site or the database said is ever part of an answer
 * or a log line.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { domainKey, extractSiteSignals, fetchSiteHtml, normalizeCheckUrl } from '@/lib/free-check'
import { hostPinnedFetch } from '@/lib/seed-scan/site-access'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { buildFindings, scoreOf } from './rules'
import { scanSite, defaultScanDeps, PAGE_MS, type ScanDeps } from './scan'
import { loadProjectSources, SourcesReadError } from './sources'
import type { FindingKind, FixField, ScanStreamLine, SiteHealthErrorCode, SiteHealthReport } from './types'
import { queueAvailable } from '@/lib/site-fix/store'
import { applyFix, previewFix, type ApplyRequest, type ApplyResult, type Preview, type WpFixDeps } from './wordpress-fix'

type Admin = ReturnType<typeof createAdminClient>

export const HTTP_STATUS: Partial<Record<SiteHealthErrorCode, number>> = {
  unauthorized: 401, not_found: 404, invalid_request: 400, off_site: 400, approval_required: 400, value_invalid: 400,
  no_connection: 409, changed_since_preview: 409, use_fix_queue: 409, scan_failed: 500,
}
export const statusFor = (code: SiteHealthErrorCode) => HTTP_STATUS[code] ?? 422

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Scan ─────────────────────────────────────────────────────────────────────

export interface ScanApiDeps {
  userId: string | null
  admin: Admin
  scan?: ScanDeps
  now?: () => Date
}

/**
 * Runs the scan and reports through `emit`: progress lines, then one report line
 * (or one error line). Returns the HTTP status to answer with.
 */
export async function handleScan(body: unknown, deps: ScanApiDeps, emit: (line: ScanStreamLine) => void): Promise<number> {
  const err = (code: SiteHealthErrorCode) => { emit({ type: 'error', code }); return statusFor(code) }
  if (!deps.userId) return err('unauthorized')
  const projectId = (body as { projectId?: unknown } | null)?.projectId
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return err('invalid_request')

  let sources
  try {
    sources = await loadProjectSources(deps.admin, { projectId, userId: deps.userId })
  } catch (e) {
    if (e instanceof SourcesReadError) console.error('[site-health] sources read failed')
    return err('scan_failed')
  }
  if (!sources) return err('not_found')

  const outcome = await scanSite(
    { siteUrl: sources.siteUrl, candidates: sources.candidates, orphanPages: sources.orphanPages },
    deps.scan ?? defaultScanDeps(),
    (p) => emit({ type: 'progress', ...p }),
  ).catch(() => null)
  if (!outcome) return err('scan_failed')
  if (!outcome.ok) return err(outcome.code)

  const ctx = { platform: sources.platform, connections: sources.connections }
  const findings = buildFindings(outcome.site, outcome.pages, ctx)
  const read = outcome.pages.filter((p) => p.ok).length
  const report: SiteHealthReport = {
    siteUrl: outcome.site.siteUrl,
    scannedAt: (deps.now ?? (() => new Date()))().toISOString(),
    platform: sources.platform,
    connections: sources.connections,
    pagesChecked: read,
    partial: read < outcome.planned,
    score: scoreOf(findings),
    findings,
  }
  emit({ type: 'report', report })
  return 200
}

// ── Fix ──────────────────────────────────────────────────────────────────────

export interface FixApiDeps {
  userId: string | null
  admin: Admin
  decrypt: (encrypted: string) => string
  wp: WpFixDeps
}

export type FixAnswer = { status: number; body: Preview | ApplyResult | { ok: false; code: SiteHealthErrorCode } }

const FIELDS: readonly FixField[] = ['title', 'description', 'alt', 'link']
const KINDS: readonly FindingKind[] = [
  'title_missing', 'title_long', 'title_short', 'title_duplicate', 'description_missing', 'description_length',
  'description_duplicate', 'images_alt', 'orphan_page',
]

/** The site's key (host without www) of an address, or null when it is not an http(s) address. */
function siteKeyOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  const withScheme = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
  const u = normalizeCheckUrl(withScheme)
  return u.ok ? domainKey(u.url) : null
}

/** The project's WordPress credentials — filtered by project AND owner, decrypted server-side. */
export async function loadOwnWordPress(admin: Admin, scope: { projectId: string; userId: string }, decrypt: (s: string) => string):
  Promise<{ creds: WordPressCredentials } | null> {
  const { data, error } = await admin
    .from('wordpress_connections')
    .select('site_url, wp_username, wp_application_password_encrypted, connection_status')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { site_url: string; wp_username: string; wp_application_password_encrypted: string; connection_status: string | null }
  if (row.connection_status === 'failed') return null
  try {
    return { creds: { siteUrl: row.site_url, username: row.wp_username, applicationPassword: decrypt(row.wp_application_password_encrypted) } }
  } catch {
    console.error('[site-health] wordpress credentials unreadable')
    return null
  }
}

export async function handleFix(body: unknown, deps: FixApiDeps): Promise<FixAnswer> {
  const refuse = (code: SiteHealthErrorCode): FixAnswer => ({ status: statusFor(code), body: { ok: false, code } })
  if (!deps.userId) return refuse('unauthorized')
  const b = (body ?? {}) as Record<string, unknown>
  const projectId = b.projectId
  const action = b.action
  const field = b.field as FixField
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return refuse('invalid_request')
  if (action !== 'preview' && action !== 'apply') return refuse('invalid_request')
  if (!FIELDS.includes(field) || typeof b.url !== 'string') return refuse('invalid_request')

  const { data: project, error } = await deps.admin
    .from('projects')
    .select('id, target_domain, business_name, name')
    .eq('id', projectId)
    .eq('user_id', deps.userId)
    .maybeSingle()
  if (error) return refuse('scan_failed')
  if (!project) return refuse('not_found')
  const p = project as { target_domain?: string | null; business_name?: string | null; name?: string | null }

  const wp = await loadOwnWordPress(deps.admin, { projectId, userId: deps.userId }, deps.decrypt)
  if (!wp) return refuse('no_connection')

  // Only this project's own site: its address, or the WordPress site it connected.
  const allowed = new Set([siteKeyOf(p.target_domain), siteKeyOf(wp.creds.siteUrl)].filter(Boolean))
  const onSite = (u: unknown) => { const k = siteKeyOf(u); return !!k && allowed.has(k) }
  if (!onSite(b.url)) return refuse('off_site')
  const url = String(b.url)

  if (action === 'preview') {
    const kind = b.kind as FindingKind
    if (!KINDS.includes(kind)) return refuse('invalid_request')
    const preview = await previewFix(wp.creds, {
      field, url, kind, siteName: (p.business_name || p.name || '').trim() || null,
      keyword: typeof b.keyword === 'string' ? b.keyword.slice(0, 120) : undefined,
    }, deps.wp)
    return { status: preview.ok ? 200 : statusFor(preview.code), body: preview }
  }

  // APPLY: only the preview's approve button sends approved: true, and only with
  // the value the preview read.
  if (b.approved !== true) return refuse('approval_required')
  if (typeof b.expected !== 'string') return refuse('approval_required')
  // Once the fix queue exists, a write only happens through it: recorded (who, when, IP, before
  // and after) and undoable. This older path stays for previews and for accounts without it.
  if (await queueAvailable(deps.admin, { projectId, userId: deps.userId })) return refuse('use_fix_queue')
  let req: ApplyRequest
  if (field === 'alt') {
    if (!Array.isArray(b.images)) return refuse('invalid_request')
    req = { field, url, expected: b.expected, images: (b.images as { src?: unknown; after?: unknown }[]).map((i) => ({ src: String(i?.src ?? ''), after: String(i?.after ?? '') })) }
  } else if (field === 'link') {
    if (!onSite(b.sourceUrl) || typeof b.anchor !== 'string') return refuse('off_site')
    req = { field, url, expected: b.expected, sourceUrl: String(b.sourceUrl), anchor: b.anchor, mode: b.mode === 'remove' ? 'remove' : 'add' }
  } else {
    if (b.via !== 'seo_plugin' && b.via !== 'wp_title') return refuse('invalid_request')
    if (typeof b.after !== 'string') return refuse('value_invalid')
    req = { field, url, expected: b.expected, via: b.via, after: b.after }
  }
  const result = await applyFix(wp.creds, req, deps.wp)
  return { status: result.ok ? 200 : statusFor(result.code), body: result }
}

/**
 * The live page as a visitor gets it, through the scan's pinned, capped fetch.
 * handleFix calls the fix engine only with addresses it has checked are on the
 * project's own site; the pin keeps every redirect hop on that host.
 */
export function liveReader(base: typeof fetch = fetch): WpFixDeps['readLivePage'] {
  return async (raw) => {
    const u = normalizeCheckUrl(raw)
    if (!u.ok) return null
    const clock = new AbortController()
    const timer = setTimeout(() => clock.abort(), PAGE_MS)
    try {
      const fetchImpl = hostPinnedFetch({ siteKey: domainKey(u.url), base, deadline: clock.signal, trace: [], offHost: { hit: false } })
      const got = await fetchSiteHtml(u.url, { fetchImpl })
      if (!got.ok) return null
      const s = extractSiteSignals(got.html, got.url, { robotsTxt: null, llmsTxt: false })
      return { title: s.title, description: s.metaDescription, h1: s.h1[0] ?? null }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
