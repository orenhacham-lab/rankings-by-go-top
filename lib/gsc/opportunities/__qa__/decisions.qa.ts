/**
 * Stage E2B — controlled decisions QA (offline, no network/DB). Covers the 40 mandated cases:
 * flags, route gating, ownership/anti-spoofing, server recompute, idempotent upsert + UNIQUE,
 * decision persistence, created-topic validation + lock + undo protection, undo, open/decided/
 * all filtering + counts, E2A-unchanged, UI action exposure, partial-success, and static
 * isolation/no-write/migration guards. Functional checks run the real service against an
 * in-memory admin fake; contract checks assert the route/UI wiring statically.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { recomputeOpportunities, upsertDecision, deleteDecision, validateCreatedTopic, annotate, loadDecisionsMap, DecisionError, type DecisionRow } from '../decisions'
import { isGscActionsEnabled, isGscReadOnlyEnabled } from '../../config'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import type { Opportunity } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function expectError(fn: () => Promise<unknown>): Promise<DecisionError | null> {
  try { await fn(); return null } catch (e) { return e instanceof DecisionError ? e : null }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Seed a FakeAdmin with a succeeded run + one metric row (→ one supporting_content opportunity). */
function seedAdmin(extra: Record<string, Record<string, unknown>[]> = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    gsc_sync_runs: [{ id: 'run-1', project_id: 'p', window_days: 28, status: 'succeeded', started_at: '2026-07-10T00:00:00Z', start_date: '2026-06-13', end_date: '2026-07-10' }],
    gsc_query_page_metrics: [{ sync_run_id: 'run-1', project_id: 'p', query: 'how to choose running shoes', page: 'https://x.co/blog/guide', clicks: 1, impressions: 400, ctr: 0.0025, position: 8 }],
    article_topics: [],
    gsc_opportunity_decisions: [],
    ...extra,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: new FakeAdmin(tables) as any, tables }
}

async function main() {
  console.log('GSC Stage E2B — controlled decisions')

  // ── (1) flags default false ────────────────────────────────────────────────
  delete process.env.GSC_READ_ONLY_ENABLED; delete process.env.GSC_ACTIONS_ENABLED
  check('(1) read-only flag defaults false', isGscReadOnlyEnabled() === false)
  check('(1) actions flag defaults false', isGscActionsEnabled() === false)
  process.env.GSC_ACTIONS_ENABLED = 'true' // without read-only it must still be false
  check('(1) actions require the read-only prerequisite', isGscActionsEnabled() === false)
  process.env.GSC_READ_ONLY_ENABLED = 'true'
  check('(1) actions enabled only when BOTH flags on', isGscActionsEnabled() === true)

  // ── (5)(6) server recompute + spoofed id ───────────────────────────────────
  const { admin } = seedAdmin()
  const recomputed = await recomputeOpportunities(admin, 'p', 28)
  check('(5) opportunities are recomputed server-side from the latest run', recomputed.state === 'ok' && recomputed.opportunities.length === 1)
  const opp = recomputed.state === 'ok' ? recomputed.opportunities[0] : (null as unknown as Opportunity)
  check('(5) recomputed opportunity is supporting_content_candidate', opp.opportunityType === 'supporting_content_candidate')
  check('(6) an unknown/spoofed opportunity id is not found', recomputed.state === 'ok' && recomputed.opportunities.find((o) => o.id === 'opp_deadbeefdeadbeef') === undefined)

  // ── (10)(11)(8)(9) persistence + idempotency + UNIQUE ──────────────────────
  {
    const { admin, tables } = seedAdmin()
    const rc = await recomputeOpportunities(admin, 'p', 28); const o = (rc as { opportunities: Opportunity[] }).opportunities[0]
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'irrelevant', createdTopicId: null })
    check('(10) irrelevant decision persisted', (tables.gsc_opportunity_decisions[0] as unknown as DecisionRow).decision === 'irrelevant')
    check('(7) snapshot is server-derived (query/page from the engine)', (tables.gsc_opportunity_decisions[0] as unknown as DecisionRow).primary_query === o.primaryQuery && (tables.gsc_opportunity_decisions[0] as unknown as DecisionRow).page_url === o.page)
    // Idempotent: same request again → still one row (UNIQUE project+opportunity).
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'irrelevant', createdTopicId: null })
    check('(8)(9) repeated identical request is idempotent (one row)', tables.gsc_opportunity_decisions.length === 1)
    // already_covered persists (overwrites irrelevant — allowed, not locked).
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'already_covered', createdTopicId: null })
    check('(11) already_covered decision persisted', (tables.gsc_opportunity_decisions[0] as unknown as DecisionRow).decision === 'already_covered' && tables.gsc_opportunity_decisions.length === 1)
  }

  // ── (12)(13)(14)(15) created_topic persistence + validation ─────────────────
  {
    const { admin, tables } = seedAdmin({ article_topics: [{ id: 'topic-1', project_id: 'p', user_id: 'u' }] })
    const rc = await recomputeOpportunities(admin, 'p', 28); const o = (rc as { opportunities: Opportunity[] }).opportunities[0]
    await validateCreatedTopic(admin, 'p', 'u', 'topic-1') // ok
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' })
    const row = tables.gsc_opportunity_decisions[0] as unknown as DecisionRow
    check('(12) created_topic decision persisted with topic id', row.decision === 'created_topic' && row.created_topic_id === 'topic-1')
    // (14) cross-project topic rejected.
    const { admin: a2 } = seedAdmin({ article_topics: [{ id: 'topic-x', project_id: 'other', user_id: 'u' }] })
    const e14 = await expectError(() => validateCreatedTopic(a2, 'p', 'u', 'topic-x'))
    check('(14) created topic from another project is rejected', e14?.code === 'invalid_created_topic' && e14?.status === 403)
    // (15) topic owned by another user rejected.
    const { admin: a3 } = seedAdmin({ article_topics: [{ id: 'topic-y', project_id: 'p', user_id: 'other' }] })
    const e15 = await expectError(() => validateCreatedTopic(a3, 'p', 'u', 'topic-y'))
    check('(15) created topic owned by another user is rejected', e15?.code === 'invalid_created_topic')
    // spoofed/unknown topic id rejected.
    const e14b = await expectError(() => validateCreatedTopic(admin, 'p', 'u', 'topic-nope'))
    check('(6b) spoofed topic id is rejected', e14b?.code === 'invalid_created_topic' && e14b?.status === 404)
  }

  // ── (16)(17)(18)(19) lock + undo protection ─────────────────────────────────
  {
    const { admin, tables } = seedAdmin({ article_topics: [{ id: 'topic-1', project_id: 'p', user_id: 'u' }] })
    const rc = await recomputeOpportunities(admin, 'p', 28); const o = (rc as { opportunities: Opportunity[] }).opportunities[0]
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' })
    // (16) created_topic cannot be overwritten by irrelevant/already_covered.
    const e16 = await expectError(() => upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'irrelevant', createdTopicId: null }))
    check('(16) created_topic decision cannot be overwritten', e16?.code === 'decision_locked_by_created_topic' && e16?.status === 409)
    check('(16) the created_topic row is unchanged after the blocked overwrite', (tables.gsc_opportunity_decisions[0] as unknown as DecisionRow).decision === 'created_topic')
    // (17) created_topic cannot be undone here.
    const e17 = await expectError(() => deleteDecision(admin, 'p', o.id))
    check('(17) created_topic decision cannot be undone here', e17?.code === 'created_topic_decision_cannot_be_undone_here' && e17?.status === 409)
    check('(19) undo never deletes the article_topics row', tables.article_topics.length === 1 && tables.gsc_opportunity_decisions.length === 1)
  }
  {
    const { admin, tables } = seedAdmin()
    const rc = await recomputeOpportunities(admin, 'p', 28); const o = (rc as { opportunities: Opportunity[] }).opportunities[0]
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'already_covered', createdTopicId: null })
    const r = await deleteDecision(admin, 'p', o.id)
    check('(18) already_covered/irrelevant can be undone', r.deleted === true && tables.gsc_opportunity_decisions.length === 0)
    const again = await deleteDecision(admin, 'p', o.id)
    check('(18b) undo is idempotent when no row exists', again.deleted === false)
  }

  // ── (20)(21) open/decided/all filtering + counts ────────────────────────────
  {
    const opps = [
      { id: 'a', opportunityType: 'x', signals: [] } as unknown as Opportunity,
      { id: 'b', opportunityType: 'x', signals: [] } as unknown as Opportunity,
      { id: 'c', opportunityType: 'x', signals: [] } as unknown as Opportunity,
    ]
    const decisions = new Map<string, DecisionRow>([
      ['a', { decision: 'irrelevant' } as unknown as DecisionRow],
      ['b', { decision: 'created_topic' } as unknown as DecisionRow],
    ])
    const { annotated, counts } = annotate(opps, decisions)
    check('(20) open filter → undecided only', annotated.filter((o) => o.decision === null).map((o) => o.id).join(',') === 'c')
    check('(20) decided filter → decided only', annotated.filter((o) => o.decision !== null).map((o) => o.id).join(',') === 'a,b')
    check('(21) decision counts are correct', counts.open === 1 && counts.decided === 2 && counts.irrelevant === 1 && counts.created_topic === 1 && counts.already_covered === 0)
  }

  // ── (22) Stage E2A output unchanged by decisions (engine is independent) ─────
  {
    const { admin } = seedAdmin()
    const a = await recomputeOpportunities(admin, 'p', 28)
    // Add a decision, recompute again — opportunity ids/score/type are identical.
    const o = (a as { opportunities: Opportunity[] }).opportunities[0]
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'irrelevant', createdTopicId: null })
    const b = await recomputeOpportunities(admin, 'p', 28)
    const oa = (a as { opportunities: Opportunity[] }).opportunities[0], ob = (b as { opportunities: Opportunity[] }).opportunities[0]
    check('(22) decisions never change E2A id/score/type', oa.id === ob.id && oa.opportunityScore === ob.opportunityScore && oa.opportunityType === ob.opportunityType)
  }

  // ── loadDecisionsMap fail-closed ────────────────────────────────────────────
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = new FakeAdmin({ gsc_opportunity_decisions: [] }, { gsc_opportunity_decisions: { select: () => ({ message: 'db down' }) } }) as any
    const e = await expectError(() => loadDecisionsMap(admin, 'p'))
    check('decisions read failure fails closed (typed error)', e?.code === 'decisions_read_failed')
  }

  // ── STATIC CONTRACT GUARDS (route + UI + migration) ─────────────────────────
  const route = read('app/api/gsc/opportunities/decision/route.ts')
  check('(2) decision route 404 when the actions flag is off', /!isGscReadOnlyEnabled\(\) \|\| !isGscActionsEnabled\(\)[\s\S]{0,80}status: 404/.test(route))
  check('(3) decision route is owner-only (authContentProject)', /authContentProject\(/.test(route))
  check('(5b) route recomputes + matches by stable id', /recomputeOpportunities\(/.test(route) && /\.find\(\(o\) => o\.id === opportunityId\)/.test(route))
  check('(7) route never trusts client query/page/type/snapshot', !/body\.(query|page|opportunityType|score|signals|snapshot|syncRun)/.test(route))
  check('(13) createdTopicId required for created_topic', /decision === 'created_topic'[\s\S]{0,160}created_topic_id_required/.test(route))
  check('(14b) created topic validated for same project + user', /validateCreatedTopic\(auth\.admin, auth\.project\.id, auth\.user\.id/.test(route))
  check('(39) decision route writes only via the decisions service (no ad-hoc table writes)', !/\.from\('(article_topics|projects|gsc_[a-z_]+)'\)[\s\S]{0,40}\.(insert|update|upsert|delete)/.test(route))

  const decisions = read('lib/gsc/opportunities/decisions.ts')
  check('(39) decisions service writes ONLY gsc_opportunity_decisions', (decisions.match(/\.(insert|update|upsert|delete)\(/g) || []).length > 0 && !/from\('article_topics'\)[\s\S]{0,60}\.(insert|update|upsert|delete)/.test(decisions))
  check('(19b) deleteDecision never touches article_topics', /export async function deleteDecision[\s\S]*?\n}/.test(decisions) && !/deleteDecision[\s\S]*?article_topics/.test(decisions))
  check('(38) no recommendation-engine import in decisions service', !decisions.split('\n').filter((l) => /\bfrom ['"]/.test(l)).some((l) => /recommendation/i.test(l)))
  check('(31)(32)(33) decisions service has no AI/model/generate/queue/publish calls', !/gemini|generateArticle|@google\/genai|publish|enqueue|queuePool/i.test(decisions))

  const ui = read('components/content/GscOpportunities.tsx')
  check('(23) supporting_content_candidate exposes Create topic', /canCreateTopic = o\.opportunityType === 'supporting_content_candidate'/.test(ui) && /canCreateTopic &&[\s\S]{0,80}actionCreateTopic/.test(ui))
  check('(24) other types do NOT expose Create topic', /\{canCreateTopic && <Button[\s\S]{0,120}handleCreateTopic/.test(ui))
  check('(25) modal receives primary query', /prefill=\{\{ topic: actingOpp\.primaryQuery, primaryKeyword: actingOpp\.primaryQuery/.test(ui))
  check('(26) modal receives related queries as secondary keywords', /secondaryKeywords: actingOpp\.relatedQueries/.test(ui))
  check('(27) reuses the existing ArticleBriefModal in create mode', /<ArticleBriefModal[\s\S]{0,200}editing=\{null\}[\s\S]{0,80}prefill=/.test(ui))
  check('(28) clicking Create topic does NOT create anything (only opens the modal)', /function handleCreateTopic\([\s\S]{0,120}setBriefOpen\(true\)\s*\n\s*\}/.test(ui) && !/function handleCreateTopic\([\s\S]{0,200}fetch\(/.test(ui))
  check('(29) topic creation goes through the existing modal (no direct topics POST in this UI)', !/fetch\('\/api\/content\/topics'/.test(ui))
  check('(34) partial success is truthful (topic created, decision failed → retry state)', /setPartialRetry\(\{ opportunityId: opp\.id, createdTopicId \}\)[\s\S]{0,80}partialSuccess/.test(ui))
  check('(35) retry writes only the decision (never re-creates the topic)', /function handleRetryDecision\([\s\S]{0,240}postDecision\(partialRetry\.opportunityId, 'created_topic', partialRetry\.createdTopicId\)/.test(ui) && !/handleRetryDecision[\s\S]{0,240}ArticleBriefModal/.test(ui))
  check('(36) loading state prevents double writes', /if \(busyId\) return/.test(ui))
  check('(37) actions live in the ok state only (invalid states show no actions)', ui.indexOf("state === 'not_connected'") < ui.indexOf('ACTIONS_ENABLED &&') )
  check('(16b) UI branches actions by decided vs open (create/decide only when open)', /\{o\.decision \? \([\s\S]{0,600}\) : \([\s\S]{0,400}canCreateTopic && <Button size="sm" onClick=\{\(\) => handleCreateTopic/.test(ui))

  // (30) manual topic path unchanged — source still forced to 'manual' server-side.
  const topicsRoute = read('app/api/content/topics/route.ts')
  check('(30) topic source remains manual (existing route unchanged)', /source: 'manual'/.test(topicsRoute))

  // (40) migration: RLS + required constraints/indexes.
  const mig = read('supabase/migrations/20260813_add_gsc_opportunity_decisions.sql')
  check('(40) migration enables RLS', /ENABLE ROW LEVEL SECURITY/.test(mig))
  check('(40) UNIQUE (project_id, opportunity_id)', /UNIQUE \(project_id, opportunity_id\)/.test(mig))
  check('(40) decision + window CHECK constraints', /decision IN \('already_covered', 'irrelevant', 'created_topic'\)/.test(mig) && /window_days IN \(28, 90\)/.test(mig))
  check('(40) required indexes present', /project_id, decision, updated_at DESC/.test(mig) && /created_topic_id\) WHERE created_topic_id IS NOT NULL/.test(mig))
  check('(40) RLS requires user_id = auth.uid() AND project ownership (not UUID secrecy)', /user_id = auth\.uid\(\)\s*\n\s*AND project_id IN \(SELECT id FROM public\.projects WHERE user_id = auth\.uid\(\)\)/.test(mig))
  check('(40) created_topic_id FK to article_topics ON DELETE SET NULL', /created_topic_id[\s\S]{0,80}REFERENCES public\.article_topics\(id\) ON DELETE SET NULL/.test(mig))

  // ── FIX 3/2 — created_topic linkage + DB-guarantee error mapping ────────────
  {
    // (12) identical created_topic retry is idempotent (one row).
    const { admin, tables } = seedAdmin({ article_topics: [{ id: 'topic-1', project_id: 'p', user_id: 'u' }] })
    const rc = await recomputeOpportunities(admin, 'p', 28); const o = (rc as { opportunities: Opportunity[] }).opportunities[0]
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' })
    await upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' })
    check('(12) identical created_topic retry is idempotent (one row)', tables.gsc_opportunity_decisions.length === 1)
    // (13) the same created_topic_id cannot be linked to a second opportunity.
    tables.gsc_opportunity_decisions.push({ project_id: 'p', opportunity_id: 'other-opp', decision: 'created_topic', created_topic_id: 'topic-1' })
    const e13 = await expectError(() => upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: { ...o, id: 'opp_second' } as Opportunity, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' }))
    check('(13) one created_topic_id cannot link to two opportunities', e13?.code === 'created_topic_already_linked' && e13?.status === 409)
  }
  {
    // (14) DB unique violation (23505) maps to created_topic_already_linked.
    const tables = { gsc_opportunity_decisions: [], article_topics: [{ id: 'topic-1', project_id: 'p', user_id: 'u' }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = new FakeAdmin(tables, { gsc_opportunity_decisions: { upsert: () => ({ code: '23505' }) } }) as any
    const o = { id: 'opp_x', primaryQuery: 'q', relatedQueries: [], page: 'https://x/1', pageType: 'article', queryIntent: 'informational', opportunityType: 'supporting_content_candidate', signals: [], opportunityScore: 10, clicks: 0, impressions: 1, ctr: 0, averagePosition: 8, distinctPageCount: 1, windowDays: 28, syncRunId: 'run-1' } as unknown as Opportunity
    const e14 = await expectError(() => upsertDecision(admin, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' }))
    check('(14) DB unique violation maps to created_topic_already_linked', e14?.code === 'created_topic_already_linked' && e14?.status === 409)
    // (9)(10)(11) DB trigger message maps to decision_locked_by_created_topic (concurrent-safe).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin2 = new FakeAdmin({ gsc_opportunity_decisions: [], article_topics: [{ id: 'topic-1', project_id: 'p', user_id: 'u' }] }, { gsc_opportunity_decisions: { upsert: () => ({ message: 'decision_locked_by_created_topic' }) } }) as any
    const e9 = await expectError(() => upsertDecision(admin2, { userId: 'u', projectId: 'p', opportunity: o, windowDays: 28, syncRunId: 'run-1', decision: 'created_topic', createdTopicId: 'topic-1' }))
    check('(9)(10)(11) DB trigger message maps to decision_locked_by_created_topic', e9?.code === 'decision_locked_by_created_topic' && e9?.status === 409)
  }

  // ── FIX 4 (route) + FIX 1/2/5 (static contracts) ────────────────────────────
  {
    const route = read('app/api/gsc/opportunities/decision/route.ts')
    check('(15) route rejects created_topic for a non-supporting type', /opportunity\.opportunityType !== 'supporting_content_candidate'[\s\S]{0,120}created_topic_not_allowed_for_opportunity_type/.test(route))
    check('(16) route still allows created_topic (eligibility checked, not removed)', /decision === 'created_topic'[\s\S]{0,500}validateCreatedTopic/.test(route))

    const modal = read('components/content/ArticleBriefModal.tsx')
    check('(1) normal modal still exposes the suggestion flow', /\{!editing && !gscMode && \(/.test(modal) && /handleSuggest/.test(modal))
    check('(2) gsc_reviewed_topic mode exposes NO suggest button', /!editing && !gscMode/.test(modal))
    check('(3) gsc mode performs NO topic-suggestions request', /function handleSuggest\(\)\s*\{\s*\n\s*if \(gscMode\) return/.test(modal))
    check('(4) gsc mode submits exactly one manual topic', /gscMode \? \(manualTopic\.trim\(\) \? \[manualTopic\.trim\(\)\] : \[\]\)/.test(modal))
    check('(5) gsc mode locks the project select', /disabled=\{gscMode\}/.test(modal))
    check('(6) GSC flow still POSTs the existing /api/content/topics', /fetch\('\/api\/content\/topics'/.test(modal))
    check('(8) gsc mode never calls Gemini (suggest guarded)', /if \(gscMode\) return/.test(modal))
    const ui = read('components/content/GscOpportunities.tsx')
    check('GscOpportunities opens the modal in gsc_reviewed_topic mode', /mode="gsc_reviewed_topic"/.test(ui))

    const mig = read('supabase/migrations/20260813_add_gsc_opportunity_decisions.sql')
    check('(9-11) migration has the atomic created_topic lock trigger', /CREATE TRIGGER trg_gsc_opp_decisions_lock/.test(mig) && /OLD\.decision = 'created_topic'/.test(mig) && /NEW\.created_topic_id IS DISTINCT FROM OLD\.created_topic_id/.test(mig))
    check('(FIX3) migration has the UNIQUE partial created_topic_id index', /CREATE UNIQUE INDEX IF NOT EXISTS uq_gsc_opp_decisions_created_topic[\s\S]{0,120}WHERE created_topic_id IS NOT NULL/.test(mig))
    check('(17) migration CHECK enforces decision/created_topic_id consistency', /ck_gsc_opp_decisions_topic_consistency CHECK[\s\S]{0,200}created_topic' AND created_topic_id IS NOT NULL[\s\S]{0,160}IN \('already_covered', 'irrelevant'\) AND created_topic_id IS NULL/.test(mig))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
