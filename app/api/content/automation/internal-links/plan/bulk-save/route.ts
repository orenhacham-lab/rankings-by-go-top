/**
 * Content automation — POST /api/content/automation/internal-links/plan/bulk-save
 *
 * Phase 2F.1. Saves reviewed internal-link PLANS for MULTIPLE topics in one
 * request (used right after topic creation to persist the suggested plans), with
 * an optional server-side approve of the just-saved links. Re-runs the Phase 2B
 * planner server-side per topic and persists ONLY its selected links — client
 * link payloads are NEVER trusted. Zero-link topics save an auditable empty batch.
 *
 * Writes ONLY article_internal_link_plan_batches/_links (via savePlanBatch +
 * approveBatchLinks). Does NOT touch article content_html / internal_links_json,
 * generation, publishing, WordPress, cron, queue, or insert/apply/rollback.
 * 'approved' here is review-status only — it inserts NOTHING into any article.
 *
 * Why a bulk endpoint (vs. looping existing /plan/save + /plan/link on the
 * client): one owner+flag-gated request instead of N saves + M approvals, and
 * approval runs server-side against the just-saved batch id — the client never
 * holds or replays link ids. Returns per-topic results.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, topicIds: string[], approve?: boolean, allowCaution?: boolean, force?: boolean }
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, reassembleReport, isStale, isVersionStale } from '@/lib/content/wordpress-content-index'
import { evaluateBulkSaveGate, type CacheSnapshotIdentity } from '@/lib/content/internal-link-save-gate'
import { planFromCachedTargets, promoteManualCandidates, selectClientLinks, CACHE_PLANNER_VERSION, type DroppedSelection } from '@/lib/content/internal-link-planner-cache'
import { savePlanBatch, approveBatchLinks, type PlanSubject } from '@/lib/content/internal-link-plan-store'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

export const dynamic = 'force-dynamic'

interface TopicRow { id: string; topic: string; primary_keyword: string | null; secondary_keywords: string[] | null }

interface TopicResult { topicId: string; ok: boolean; batchId?: string; linkCount: number; approvedCount: number; unapprovedCount?: number; approvalWarning?: boolean; manualApplied?: number; staleAtCreation?: boolean; reason?: string; droppedLinks?: DroppedSelection[] }

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; topicIds?: unknown; approve?: unknown; allowCaution?: unknown; force?: unknown; manualCandidates?: unknown; selectedLinks?: unknown; reviewedSnapshot?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const approve = body.approve === true
  const allowCaution = body.allowCaution === true
  const force = body.force === true
  // The identity of the cached snapshot the user REVIEWED in the dry-run (from the GET
  // response's scannerVersion + scanCompletedAt). When supplied, a matching-but-now-stale
  // cache is saveable; a changed cache is refused (never silently rebound to a new scan).
  const rs = body.reviewedSnapshot as { scannerVersion?: unknown; scanCompletedAt?: unknown } | undefined
  const reviewedSnapshot: CacheSnapshotIdentity | null = rs && typeof rs === 'object'
    ? { scannerVersion: typeof rs.scannerVersion === 'string' ? rs.scannerVersion : null, scanCompletedAt: typeof rs.scanCompletedAt === 'string' ? rs.scanCompletedAt : null }
    : null
  const topicIds = Array.isArray(body.topicIds)
    ? Array.from(new Set(body.topicIds.filter((x): x is string => typeof x === 'string' && x.length > 0))).slice(0, 50)
    : []
  // Phase 2I — optional manually-selected reviewable candidates, RE-VALIDATED
  // server-side (never trusted). Grouped by topic; capped defensively.
  const manualByTopic = new Map<string, { targetUrl: string; anchorText: string }[]>()
  if (Array.isArray(body.manualCandidates)) {
    for (const raw of body.manualCandidates.slice(0, 200)) {
      const m = raw as { topicId?: unknown; targetUrl?: unknown; anchorText?: unknown }
      if (typeof m?.topicId === 'string' && typeof m.targetUrl === 'string' && typeof m.anchorText === 'string') {
        const arr = manualByTopic.get(m.topicId) ?? []
        arr.push({ targetUrl: m.targetUrl, anchorText: m.anchorText })
        manualByTopic.set(m.topicId, arr)
      }
    }
  }
  // Phase 3B.2 — EXACT selection: when present, save ONLY these checked links per
  // topic (recommended AND manual), re-validated server-side. Its presence
  // switches those topics to exact mode; an empty per-topic list ⇒ zero-link plan.
  const exactMode = Array.isArray(body.selectedLinks)
  const selectedByTopic = new Map<string, { targetUrl: string; anchorText: string }[]>()
  if (exactMode) {
    for (const raw of (body.selectedLinks as unknown[]).slice(0, 400)) {
      const m = raw as { topicId?: unknown; targetUrl?: unknown; anchorText?: unknown }
      if (typeof m?.topicId === 'string' && typeof m.targetUrl === 'string' && typeof m.anchorText === 'string') {
        const arr = selectedByTopic.get(m.topicId) ?? []
        arr.push({ targetUrl: m.targetUrl, anchorText: m.anchorText })
        selectedByTopic.set(m.topicId, arr)
      }
    }
  }

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project, user } = auth
  if (!topicIds.length) return Response.json({ error: 'no_topic_ids' }, { status: 400 })

  // Cache-only: read the stored index (NEVER a live scan).
  const row = await getCachedIndex(admin, project.id)
  const gate = evaluateBulkSaveGate({
    present: !!row,
    stale: row ? isStale(row) : false,
    versionStale: row ? isVersionStale(row) : false,
    scanStatus: row?.scan_status ?? null,
    current: { scannerVersion: row?.scanner_version ?? null, scanCompletedAt: row?.scan_completed_at ?? null },
    reviewed: reviewedSnapshot,
    force,
  })
  const { cacheState, warnings, staleAtCreation } = gate
  if (!row || gate.outcome === 'missing_cache') {
    return Response.json({ ok: false, cacheState: 'missing', warning: 'no_cache_refresh_first' }, { status: 409 })
  }
  if (gate.outcome === 'cache_changed_replan_required') {
    // The cached index changed after the user reviewed the plan — never save/approve/enqueue
    // the stale review. The client must refresh and re-review.
    return Response.json({ ok: false, reason: 'cache_changed_replan_required', cacheState, warnings, hint: 'the site index changed after review — refresh and review the links again' }, { status: 409 })
  }
  if (gate.outcome === 'stale_blocked') {
    return Response.json({ ok: false, cacheState, warnings, hint: 'refresh the index or send the reviewed snapshot identity to save the reviewed plan' }, { status: 409 })
  }

  const report = reassembleReport(row)
  const targets = (report.targets ?? []) as ScannedTarget[]
  const hosts = report.hosts ?? []

  // Load all requested topics (owner-scoped) in one query.
  const { data: topicData } = await admin
    .from('article_topics')
    .select('id, topic, primary_keyword, secondary_keywords')
    .eq('project_id', project.id)
    .in('id', topicIds)
  const byId = new Map(((topicData ?? []) as TopicRow[]).map((t) => [t.id, t]))

  const results: TopicResult[] = []
  let topicsSaved = 0
  let linksSaved = 0
  let linksApproved = 0

  for (const id of topicIds) {
    const topicRow = byId.get(id)
    if (!topicRow) { results.push({ topicId: id, ok: false, linkCount: 0, approvedCount: 0, reason: 'topic_not_found' }); continue }

    const basePlan = planFromCachedTargets(
      { id: topicRow.id, title: topicRow.topic, primaryKeyword: topicRow.primary_keyword, secondaryKeywords: Array.isArray(topicRow.secondary_keywords) ? topicRow.secondary_keywords : [] },
      targets, hosts, { allowCaution },
    )
    // Exact mode → save ONLY the client-checked links (recommended + manual),
    // re-validated; else legacy: all recommended + promoted manual overrides.
    let plan = basePlan
    let manualApplied = 0
    // Phase 3G.5 — user-checked links that could NOT be saved, with reasons.
    // Returned per topic so the review panel can warn instead of dropping silently.
    let droppedLinks: DroppedSelection[] = []
    if (exactMode) {
      const sel = selectClientLinks(basePlan, selectedByTopic.get(id) ?? [])
      plan = sel.plan
      droppedLinks = sel.dropped
    } else {
      const promoted = promoteManualCandidates(basePlan, manualByTopic.get(id) ?? [])
      plan = promoted.plan
      manualApplied = promoted.promoted
    }
    const subject: PlanSubject = { subjectType: 'topic', topicId: id, articlePoolItemId: null, generatedArticleId: null }
    const batchId = await savePlanBatch(admin, {
      projectId: project.id, userId: user.id, subject,
      topicTitle: topicRow.topic, primaryKeyword: topicRow.primary_keyword, plan,
      plannerVersion: CACHE_PLANNER_VERSION, cacheScannerVersion: row.scanner_version,
      cacheScanCompletedAt: row.scan_completed_at, cacheState, allowCaution, strict: false, staleAtCreation, warnings,
    })
    if (!batchId) { results.push({ topicId: id, ok: false, linkCount: plan.selected.length, approvedCount: 0, reason: 'save_failed', droppedLinks }); continue }

    // Phase 3G.7 — approval-count VERIFICATION: when approval was requested, the
    // response reports exactly how many rows were approved; a shortfall is flagged
    // (approvalWarning) and logged — never silently accepted.
    let approvedCount = 0
    if (approve && plan.selected.length > 0) approvedCount = await approveBatchLinks(admin, project.id, batchId)
    const unapprovedCount = approve ? plan.selected.length - approvedCount : 0
    const approvalWarning = approve && unapprovedCount > 0
    if (approvalWarning) console.warn('[ilp-bulk-save] approval incomplete', { topicId: id, batchId, saved: plan.selected.length, approved: approvedCount })

    topicsSaved++
    linksSaved += plan.selected.length
    linksApproved += approvedCount
    results.push({ topicId: id, ok: true, batchId, linkCount: plan.selected.length, approvedCount, unapprovedCount, approvalWarning, manualApplied, staleAtCreation, droppedLinks })
  }

  return Response.json({
    ok: true,
    cacheState,
    warnings,
    results,
    totals: { topicsRequested: topicIds.length, topicsSaved, linksSaved, linksApproved },
  })
}
