/**
 * The full-site mapping: one run, in the background, for one project.
 *
 * ORDER (the task's, and the order of trust in a list of URLs):
 *   1. the site's sitemaps (sitemap-walk.ts): the whole site, filed by type;
 *   2. the platform, where one is connected, through the code paths that exist
 *      already: WordPress's lists of posts and pages, through the GO TOP SEO
 *      Bridge plugin >= 3.1.0 when it is connected (its signed /content route)
 *      or the WordPress REST API with the stored application password, and the
 *      store's public lists (lib/content/wordpress-read-source.ts, read-only).
 *      Shopify is NOT called here: its entities come from the
 *      existing sync (shopify_entities) and are merged when the screen reads,
 *      so no new scope or request is added to the Shopify app;
 *   3. Search Console's pages are merged when the screen reads, from the
 *      latest sync already stored.
 *
 * BOUNDS. One run at a time per project (a lease, site-map-store.ts), a
 * minimum interval between runs, a work window (WORK_MS) inside the route's
 * maxDuration, MAP_LIMITS on documents, depth, URLs and concurrency, and
 * robots.txt as the site states it. Progress is written as it goes, so the
 * screen shows it; the previous result stays visible until the new one lands.
 *
 * Nothing here is shown to the merchant as text: outcomes are stable codes.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { domainKey, fetchSiteHtml, fetchSiteText, normalizeCheckUrl } from '@/lib/free-check'
import { hostPinnedFetch } from '@/lib/seed-scan/site-access'
import { loadWordPressCredentials } from '@/lib/content/api-auth'
import { credsReadSource, pluginReadSource, type WordPressReadSource } from '@/lib/content/wordpress-read-source'
import { loadPluginFor } from '@/lib/site-fix/plugin-capabilities'
import type { PluginPost } from '@/lib/site-fix/plugin-client'
import { countTabs, mergeSources, pageKey, sourceFromMap, type SiteMapEntry } from './model'
import { MAP_LIMITS, walkSitemaps, type DocFetch, type RobotsFetch, type WalkResult } from './sitemap-walk'
import { finishSiteMap, progressSiteMap } from './site-map-store'

type Admin = ReturnType<typeof createAdminClient>

/** The whole run, sitemaps and platform, stops starting work after this. */
export const WORK_MS = 90_000
/** Progress is written at most this often. */
const PROGRESS_EVERY_MS = 1_500
/** WordPress REST: 50 per request, at most this many requests per list. */
const WP_PER_PAGE = 50
const WP_MAX_REQUESTS = 40

/** The project's own site, as an admitted https origin; null when it has none. */
export async function projectSiteOrigin(admin: Admin, scope: { projectId: string; userId: string }): Promise<URL | null> {
  const { data, error } = await admin
    .from('projects')
    .select('target_domain')
    .eq('id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error || !data) return null
  const raw = String((data as { target_domain?: string | null }).target_domain ?? '').trim()
  if (!raw) return null
  const admitted = normalizeCheckUrl(raw)
  if (!admitted.ok) return null
  return new URL(`${admitted.url.protocol}//${admitted.url.host}/`)
}

export interface RunDeps {
  now: () => number
  walk: (origin: URL, onProgress: (p: { docsRead: number; docsSeen: number; found: number }) => Promise<void>, budgetMs: number) => Promise<WalkResult>
  /** The connected platform's own lists; [] when none is connected or it cannot be read. */
  platform: (deadlineAt: number) => Promise<SiteMapEntry[]>
}

/** The live network: every request pinned to the project's host, through the free check's capped fetchers. */
export function liveWalk(origin: URL, onProgress: (p: { docsRead: number; docsSeen: number; found: number }) => Promise<void>, budgetMs: number): Promise<WalkResult> {
  const siteKey = domainKey(origin)
  const deadline = AbortSignal.timeout(budgetMs + 15_000)
  const fetchRobots: RobotsFetch = async (url) => {
    const body = { complete: false }
    const fetchImpl = hostPinnedFetch({ siteKey, base: fetch, deadline, trace: [], offHost: { hit: false }, body })
    const res = await fetchSiteText(url, { fetchImpl })
    return { read: res.ok ? { status: res.status, text: res.text } : null, complete: body.complete }
  }
  const fetchDoc: DocFetch = async (url, allow) => {
    const fetchImpl = hostPinnedFetch({ siteKey, base: fetch, deadline, trace: [], offHost: { hit: false }, allow })
    const res = await fetchSiteHtml(url, { fetchImpl })
    return res.ok ? { ok: true, text: res.html } : { ok: false }
  }
  return walkSitemaps(origin, { fetchDoc, fetchRobots, now: Date.now, onProgress }, { ...MAP_LIMITS, BUDGET_MS: budgetMs })
}

/** WordPress's source: the plugin >= 3.1.0 (project AND owner), else the application password; null when neither. */
async function wordPressSource(admin: Admin, projectId: string, ownerId: string | undefined, load: typeof loadPluginFor, post?: PluginPost): Promise<WordPressReadSource | null> {
  const plugin = await load(admin, projectId, 'content', ownerId !== undefined ? { ownerId } : {}).catch(() => null)
  if (plugin) return pluginReadSource(plugin.link, post)
  const wp = await loadWordPressCredentials(admin, projectId).catch(() => null)
  if (!wp || 'error' in wp || wp.connection.connection_status === 'failed') return null
  return credsReadSource(wp.creds)
}

/** WordPress's own lists, read-only, through the existing client (or the plugin's read routes). */
export function liveWordPress(admin: Admin, projectId: string, now: () => number, ownerId?: string, load: typeof loadPluginFor = loadPluginFor, post?: PluginPost) {
  return async (deadlineAt: number): Promise<SiteMapEntry[]> => {
    const src = await wordPressSource(admin, projectId, ownerId, load, post)
    if (!src) return []
    const out: SiteMapEntry[] = []
    for (const [list, type] of [[src.getPosts, 'post'], [src.getPages, 'page']] as const) {
      for (let page = 1; page <= WP_MAX_REQUESTS && now() < deadlineAt; page++) {
        const items = await list({ perPage: WP_PER_PAGE, page }).catch(() => null)
        if (!items) break
        for (const it of items) if (it.link) out.push({ u: it.link, p: type, t: it.title || null, m: it.modified ?? null })
        if (items.length < WP_PER_PAGE) break
      }
    }
    if (now() < deadlineAt) {
      const store = await src.discoverStoreEntities().catch(() => null)
      for (const e of store?.products ?? []) out.push({ u: e.link, p: 'product', t: e.name })
      for (const e of store?.categories ?? []) out.push({ u: e.link, p: 'product_cat', t: e.name })
    }
    return out
  }
}

/**
 * The sitemap's entries and the platform's, one per page: the platform's type
 * and title win, the sitemap's date stays when the platform has none. Capped at
 * MAP_LIMITS.MAX_URLS; `capped` says whether anything was dropped.
 */
export function combineEntries(sitemap: readonly SiteMapEntry[], platform: readonly SiteMapEntry[], max = MAP_LIMITS.MAX_URLS): { entries: SiteMapEntry[]; capped: boolean } {
  const byKey = new Map<string, SiteMapEntry>()
  let capped = false
  for (const e of sitemap) {
    const k = pageKey(e.u)
    if (!k || byKey.has(k)) continue
    if (byKey.size >= max) { capped = true; break }
    byKey.set(k, e)
  }
  for (const e of platform) {
    const k = pageKey(e.u)
    if (!k) continue
    const cur = byKey.get(k)
    if (cur) { byKey.set(k, { ...cur, p: e.p ?? cur.p, t: e.t ?? cur.t, m: e.m ?? cur.m }); continue }
    if (byKey.size >= max) { capped = true; continue }
    byKey.set(k, e)
  }
  return { entries: [...byKey.values()], capped }
}

/**
 * Run the mapping. The caller has claimed the row (claimSiteMap) and verified
 * the owner. Never throws: a failure is written as status 'failed' with a code.
 */
export async function runSiteMap(
  admin: Admin,
  scope: { projectId: string; userId: string },
  origin: URL,
  deps: RunDeps,
): Promise<{ status: 'completed' | 'partial' | 'failed'; found: number }> {
  const startedAt = deps.now()
  const deadlineAt = startedAt + WORK_MS
  let lastWrite = 0
  const progress = async (phase: string, p: { docsRead: number; docsSeen: number; found: number }, force = false) => {
    const t = deps.now()
    if (!force && t - lastWrite < PROGRESS_EVERY_MS) return
    lastWrite = t
    await progressSiteMap(admin, scope, { phase, ...p, now: t })
  }
  try {
    await progress('sitemaps', { docsRead: 0, docsSeen: 0, found: 0 }, true)
    const walk = await deps.walk(origin, (p) => progress('sitemaps', p), Math.max(5_000, Math.min(MAP_LIMITS.BUDGET_MS, deadlineAt - deps.now() - 10_000)))
    await progress('platform', { docsRead: walk.docsRead, docsSeen: walk.docsSeen, found: walk.entries.length }, true)
    const platform = deps.now() < deadlineAt ? await deps.platform(deadlineAt).catch(() => [] as SiteMapEntry[]) : []
    const { entries, capped } = combineEntries(walk.entries, platform)
    const counts = countTabs(mergeSources([sourceFromMap(entries)]))
    const anyCap = capped || walk.capped
    const status = walk.robots === 'unreadable' && platform.length === 0 ? 'failed'
      : anyCap || walk.timedOut ? 'partial' : 'completed'
    const stopReason = walk.robots === 'unreadable' ? 'robots_unreadable'
      : anyCap ? 'cap' : walk.timedOut ? 'time' : walk.docsRead === 0 && platform.length === 0 ? 'no_sitemap' : null
    await finishSiteMap(admin, scope, {
      status,
      // A run that read nothing keeps what an earlier run found.
      entries: status === 'failed' ? null : entries,
      counts: status === 'failed' ? null : counts,
      capped: anyCap, stopReason, docsRead: walk.docsRead, docsSeen: walk.docsSeen, now: deps.now(),
    })
    return { status, found: entries.length }
  } catch {
    await finishSiteMap(admin, scope, { status: 'failed', entries: null, counts: null, capped: false, stopReason: 'error', docsRead: 0, docsSeen: 0, now: deps.now() })
    return { status: 'failed', found: 0 }
  }
}
