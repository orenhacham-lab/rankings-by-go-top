/**
 * Stage E2C — grouped hide/handled decision QA. Proves a single decision applies to EVERY related
 * opportunity, truthful counts (updated / alreadyMatching / failed), created_topic-lock is never
 * overwritten (reported failed), idempotent retries, batch undo, and that ONLY hide decisions are
 * written (never created_topic, never article_topics). Uses the in-memory FakeAdmin.
 */
import { upsertHideDecisionsBatch, deleteHideDecisionsBatch } from '../../opportunities/decisions'
import type { Opportunity } from '../../opportunities/types'
import { FakeAdmin, type ErrorHooks } from '../../__qa__/_fake-admin'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
type Rows = Record<string, Record<string, unknown>[]>
function mkAdmin(rows: Rows, hooks?: Record<string, ErrorHooks>): { admin: Admin; tables: Rows } {
  const fake = new FakeAdmin(rows, hooks)
  return { admin: fake as unknown as Admin, tables: fake.tables as Rows }
}

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function opp(id: string): Opportunity {
  return {
    id, primaryQuery: 'q ' + id, relatedQueries: [], page: 'https://x.co/' + id, pageType: 'article', queryIntent: 'informational',
    clicks: 1, impressions: 100, ctr: 0.01, averagePosition: 8, distinctPageCount: 1, opportunityType: 'improve_existing_page',
    signals: [], opportunityScore: 50, scoreComponents: { demandStrength: 0.5, positionOpportunity: 1, ctrGap: 0, contentMatchConfidence: 0, distinctPageSignal: 0 },
    reasons: [], existingContentMatch: null, windowDays: 90, syncRunId: 'run-90', dateStart: null, dateEnd: null,
  }
}
const TABLE = 'gsc_opportunity_decisions'
const base = (params: { userId: string; projectId: string; windowDays: 90; syncRunId: string; decision: 'already_covered' | 'irrelevant'; opportunities: Opportunity[] }) => params

async function main() {
  console.log('GSC Stage E2C — grouped hide/handled decisions')

  // Applies to EVERY related opportunity in one operation.
  {
    const { admin, tables } = mkAdmin({ [TABLE]: [] })
    const r = await upsertHideDecisionsBatch(admin, base({ userId: 'u', projectId: 'p', windowDays: 90, syncRunId: 'run-90', decision: 'irrelevant', opportunities: [opp('o1'), opp('o2'), opp('o3')] }))
    check('all 3 opportunities updated in one op', r.updated === 3 && r.alreadyMatching === 0 && r.failed === 0)
    check('3 decision rows written (irrelevant), none created_topic', tables[TABLE].length === 3 && tables[TABLE].every((x) => x.decision === 'irrelevant' && x.created_topic_id === null))
  }

  // Idempotent retry → alreadyMatching.
  {
    const { admin, tables } = mkAdmin({ [TABLE]: [] })
    const p = base({ userId: 'u', projectId: 'p', windowDays: 90, syncRunId: 'run-90', decision: 'already_covered', opportunities: [opp('o1'), opp('o2')] })
    await upsertHideDecisionsBatch(admin, p)
    const r2 = await upsertHideDecisionsBatch(admin, p)
    check('retry is idempotent → alreadyMatching, no new rows', r2.updated === 0 && r2.alreadyMatching === 2 && r2.failed === 0 && tables[TABLE].length === 2)
  }

  // Mixed: one new, one already-matching, one locked by created_topic (failed, never overwritten).
  {
    const { admin, tables } = mkAdmin({ [TABLE]: [
      { project_id: 'p', opportunity_id: 'o2', decision: 'irrelevant', created_topic_id: null },
      { project_id: 'p', opportunity_id: 'o3', decision: 'created_topic', created_topic_id: 't1' },
    ] })
    const r = await upsertHideDecisionsBatch(admin, base({ userId: 'u', projectId: 'p', windowDays: 90, syncRunId: 'run-90', decision: 'irrelevant', opportunities: [opp('o1'), opp('o2'), opp('o3')] }))
    check('mixed: 1 updated, 1 alreadyMatching, 1 failed (locked)', r.updated === 1 && r.alreadyMatching === 1 && r.failed === 1 && r.failedOpportunityIds.join(',') === 'o3')
    check('created_topic lock never overwritten', tables[TABLE].find((x) => x.opportunity_id === 'o3')?.decision === 'created_topic')
  }

  // Failure is truthful (no silent success): a DB error on upsert → all failed.
  {
    const { admin, tables } = mkAdmin({ [TABLE]: [] }, { [TABLE]: { upsert: () => ({ message: 'db down' }) } })
    const r = await upsertHideDecisionsBatch(admin, base({ userId: 'u', projectId: 'p', windowDays: 90, syncRunId: 'run-90', decision: 'irrelevant', opportunities: [opp('o1'), opp('o2')] }))
    check('write failure → all failed, nothing persisted', r.updated === 0 && r.failed === 2 && tables[TABLE].length === 0)
  }

  // Empty set is a no-op.
  {
    const { admin } = mkAdmin({ [TABLE]: [] })
    const r = await upsertHideDecisionsBatch(admin, base({ userId: 'u', projectId: 'p', windowDays: 90, syncRunId: 'run-90', decision: 'irrelevant', opportunities: [] }))
    check('empty set → no-op', r.updated === 0 && r.alreadyMatching === 0 && r.failed === 0)
  }

  // Batch undo deletes only hide decisions, never created_topic.
  {
    const { admin, tables } = mkAdmin({ [TABLE]: [
      { project_id: 'p', opportunity_id: 'o1', decision: 'irrelevant', created_topic_id: null },
      { project_id: 'p', opportunity_id: 'o2', decision: 'already_covered', created_topic_id: null },
      { project_id: 'p', opportunity_id: 'o3', decision: 'created_topic', created_topic_id: 't1' },
    ] })
    const r = await deleteHideDecisionsBatch(admin, 'p', ['o1', 'o2', 'o3'])
    check('undo deletes both hide decisions, leaves created_topic', r.deleted === 2 && tables[TABLE].length === 1 && tables[TABLE][0].opportunity_id === 'o3')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
