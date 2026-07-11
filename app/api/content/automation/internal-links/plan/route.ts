/**
 * Content automation — GET /api/content/automation/internal-links/plan
 *
 * CACHE-BACKED internal-link planning DRY RUN (Phase 2B). Reads ONLY the cached
 * wordpress_content_index (never triggers a live scan) and, per topic, shows the
 * links the planner WOULD choose from ELIGIBLE targets — with full diagnostics.
 *
 * Writes NOTHING: no article_topics, article_pool_items, generated_articles,
 * brief_notes, anchors_json, or planned links. Pure evaluation tool.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership. Query params:
 *   - projectId (required)
 *   - scope = 'queue' (default) | 'approved' | 'all'
 *   - topicIds = comma-separated (overrides scope)
 *   - limit = max topics (default 25, max 100)
 *   - allowCaution = '1' to include caution targets (higher bar; default off)
 *   - strict = '1' to refuse a stale / version-stale / missing cache
 *   - format=html | pretty=1
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, reassembleReport, isStale, isVersionStale, SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { resolveTopicsForPlanning, type PlanningScope } from '@/lib/content/internal-link-planning-topics'
import {
  planFromCachedTargets,
  CACHE_PLANNER_RELEVANCE_MIN,
  CACHE_PLANNER_SELF_SIMILARITY_MAX,
  CACHE_PLANNER_MIN_CONFIDENCE,
  CACHE_PLANNER_CAUTION_MIN_CONFIDENCE,
  CACHE_PLANNER_MAX_LINKS,
  type CacheTopicPlan,
} from '@/lib/content/internal-link-planner-cache'
import { resolveMoneyTargetFromPlan } from '@/lib/content/money-target-resolver'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const scope = (url.searchParams.get('scope') || 'queue') as PlanningScope
  const topicIds = (url.searchParams.get('topicIds') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 100)
  const allowCaution = url.searchParams.get('allowCaution') === '1'
  const strict = url.searchParams.get('strict') === '1'
  const format = url.searchParams.get('format')
  const pretty = url.searchParams.get('pretty') === '1'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth

  // ── Cache-only: read the stored index (NEVER a live scan) ──
  const row = await getCachedIndex(admin, project.id)
  if (!row) {
    return Response.json({ ok: false, cacheState: 'missing', warning: 'no_cache_refresh_first', hint: 'POST …/index/refresh first' }, { status: 409 })
  }
  const stale = isStale(row)
  const versionStale = isVersionStale(row)
  const warnings: string[] = []
  let cacheState = 'ok'
  if (row.scan_status === 'running') { cacheState = 'running'; warnings.push('refresh_in_progress') }
  if (row.scan_status === 'failed') { cacheState = 'failed_last_refresh'; warnings.push('last_refresh_failed') }
  if (versionStale) { cacheState = 'version_stale'; warnings.push('cache_version_stale') }
  if (stale) { cacheState = 'stale'; warnings.push('cache_stale') }

  if (strict && (stale || versionStale)) {
    return Response.json({ ok: false, cacheState, warnings, hint: 'refresh the index (force=true) or drop strict=1' }, { status: 409 })
  }

  const report = reassembleReport(row)
  const targets = (report.targets ?? []) as ScannedTarget[]
  const hosts = report.hosts ?? []

  const { topics, resolvedScope } = await resolveTopicsForPlanning(admin, project.id, { scope, topicIds, limit })
  // Phase 3F.3.6 — resolve each topic's MONEY TARGET (best commercial destination)
  // so the drawer can show it first, above supporting links.
  const plans = topics.map((t) => {
    const plan = planFromCachedTargets(t, targets, hosts, { allowCaution })
    const money = resolveMoneyTargetFromPlan(plan)
    return { ...plan, moneyTargetUrl: money.moneyTarget?.targetUrl ?? null, moneyTargetMatchType: money.matchType }
  })

  const eligibleTargetCount = targets.filter((t) => t.eligibility === 'yes').length
  const ineligibleTargetsSkipped = targets.filter((t) => t.eligibility === 'no').length
  const cautionTargetsExcluded = allowCaution ? 0 : targets.filter((t) => t.eligibility === 'caution').length

  const payload = {
    dryRun: true,
    projectId: project.id,
    cacheState,
    scannerVersion: row.scanner_version,
    currentScannerVersion: SCAN_INDEX_VERSION,
    stale,
    versionStale,
    scanCompletedAt: row.scan_completed_at,
    expiresAt: row.expires_at,
    warnings,
    config: {
      relevanceMin: CACHE_PLANNER_RELEVANCE_MIN,
      selfSimilarityMax: CACHE_PLANNER_SELF_SIMILARITY_MAX,
      minConfidence: CACHE_PLANNER_MIN_CONFIDENCE,
      cautionMinConfidence: CACHE_PLANNER_CAUTION_MIN_CONFIDENCE,
      maxLinksPerTopic: CACHE_PLANNER_MAX_LINKS,
      allowCaution,
    },
    scope: resolvedScope,
    totalCachedTargets: targets.length,
    eligibleTargetCount,
    ineligibleTargetsSkipped,
    cautionTargetsExcluded,
    topicsPlanned: topics.length,
    topicsWithLinks: plans.filter((p) => p.selected.length > 0).length,
    topics: plans,
  }

  if (format === 'html') {
    return new Response(renderPlanHtml(payload), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  if (pretty) {
    return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
  return Response.json(payload)
}

// ── Minimal, safe HTML debug view (all dynamic values escaped) ──
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

interface PlanHtmlView {
  cacheState: string; scannerVersion: string | null; currentScannerVersion: string
  scanCompletedAt: string | null; warnings: string[]
  eligibleTargetCount: number; ineligibleTargetsSkipped: number; cautionTargetsExcluded: number
  totalCachedTargets: number; topicsPlanned: number; topicsWithLinks: number
  config: Record<string, unknown>; topics: CacheTopicPlan[]
}

function renderPlanHtml(p: PlanHtmlView): string {
  const linkRow = (l: CacheTopicPlan['selected'][number], cls: string) => `
    <tr class="${cls}">
      <td><b>${esc(l.anchorText || '—')}</b><br><small>${esc(l.anchorSource || '')}</small></td>
      <td><a href="${esc(l.targetUrl)}" target="_blank" rel="noopener">${esc(l.targetTitle || l.targetUrl)}</a><br><small>${esc(l.targetUrl)}</small></td>
      <td><small>${esc(l.targetPriority)} · ${esc(l.eligibility)}</small></td>
      <td>rel ${esc(l.relevance)}<br>prio ${esc(l.priorityBonus)}<br><b>conf ${esc(l.confidence)}</b></td>
      <td>${l.selected ? esc(l.reason) : `<span class="bad">${esc(l.rejectedReasons.join('; '))}</span>`}</td>
    </tr>`
  const topicBlocks = p.topics.map((t) => `
    <h3>${esc(t.topicTitle)} <small>(${esc(t.primaryKeyword || '—')})</small></h3>
    <p>${esc(t.summary)}</p>
    ${t.selected.length ? `<table><tr><th>anchor</th><th>target</th><th>priority/elig</th><th>score</th><th>reason</th></tr>${t.selected.map((l) => linkRow(l, 'ok')).join('')}</table>` : '<p class="note">no links selected</p>'}
    <details><summary>rejected candidates (${esc(t.rejected.length)})</summary>
      <table><tr><th>anchor</th><th>target</th><th>priority/elig</th><th>score</th><th>why not</th></tr>${t.rejected.slice(0, 30).map((l) => linkRow(l, '')).join('')}</table>
    </details>`).join('')
  return `<!doctype html><meta charset="utf-8"><title>Internal-link plan (cached, dry-run)</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:start;vertical-align:top;font-size:12px}th{background:#f5f5f5}
small{color:#777}.note{color:#a15c00}.bad{color:#8a6d00}tr.ok{background:#e9f7ee}.k{display:inline-block;margin:2px 10px 2px 0}
.warn{padding:6px 10px;border-radius:6px;background:${p.warnings.length ? '#fff3cd' : '#e7f5ea'}}</style>
<h2>Internal-link plan — cache-backed dry-run (read-only)</h2>
<p class="warn"><b>cacheState:</b> ${esc(p.cacheState)} · scanned ${esc(p.scanCompletedAt || '—')} · version ${esc(p.scannerVersion)} (current ${esc(p.currentScannerVersion)})${p.warnings.length ? ` · <b>warnings:</b> ${esc(p.warnings.join(', '))}` : ''}</p>
<p>
  <span class="k"><b>cached targets:</b> ${esc(p.totalCachedTargets)}</span>
  <span class="k"><b>eligible:</b> ${esc(p.eligibleTargetCount)}</span>
  <span class="k"><b>ineligible skipped:</b> ${esc(p.ineligibleTargetsSkipped)}</span>
  <span class="k"><b>caution excluded:</b> ${esc(p.cautionTargetsExcluded)}</span>
  <span class="k"><b>topics planned:</b> ${esc(p.topicsPlanned)}</span>
  <span class="k"><b>topics with links:</b> ${esc(p.topicsWithLinks)}</span>
  <span class="k"><b>allowCaution:</b> ${esc(p.config.allowCaution)}</span>
</p>
${topicBlocks || '<p class="note">no topics resolved for this scope</p>'}`
}
