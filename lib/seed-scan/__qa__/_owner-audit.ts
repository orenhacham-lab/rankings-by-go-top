/**
 * The behavioural half of guard G1 (seed-source-guards.qa.ts): every query the
 * seeding scan's own code makes through the service-role client is recorded —
 * its table, its filters, its payload — and attributed to the lib/seed-scan
 * function that made it, read off the call stack when `.from()` is called.
 * Queries made by other modules the scan calls (the recommendation engine, the
 * content index) are recorded as such and judged by their own suites.
 *
 * A query of ours passes when it filters `user_id` by the run's owner, or
 * writes rows that all carry that owner. Two named exceptions, the same as
 * G1's: the head-only global count, and the cron's keys-only discovery of
 * stalled runs.
 */
import type { FakeAdmin } from '@/lib/__qa__/_fake-admin'

export type AuditedCall = { op: string; args: unknown[] }
export type AuditedQuery = { table: string; ours: boolean; file: string | null; fn: string | null; calls: AuditedCall[] }

const RECORDED = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'gt', 'lt', 'or', 'order', 'limit'] as const
const HELPERS = /(_fake-admin|_owner-audit|_fixtures)\.ts/
/**
 * Frames that only pass a query through: resume.ts's watchedFrom hands the
 * entitlement check (explainAccess, lib/subscription.ts) a client whose
 * answers it watches, so the query is the check's, judged by its own suites.
 */
const PASS_THROUGH: readonly (readonly [RegExp, string])[] = [[/lib\/seed-scan\/resume\.ts$/, 'watchedFrom']]

/** The first frame outside the fakes and the pass-throughs: its file (relative to the repo) and function. */
function callerOf(stack: string): { file: string; fn: string } | null {
  for (const line of stack.split('\n').slice(1)) {
    const m = /at (?:async )?(?:([\w$.<>]+) )?\(?(.*?\.(?:ts|js|mjs|cjs)):\d+:\d+\)?/.exec(line)
    if (!m) continue
    if (HELPERS.test(m[2])) continue
    const file = m[2].replace(/^.*?\/(lib|app)\//, '$1/')
    const fn = (m[1] ?? '').split('.').pop() ?? ''
    if (PASS_THROUGH.some(([f, name]) => f.test(file) && fn === name)) continue
    return { file, fn }
  }
  return null
}

export function auditOwners(fake: FakeAdmin) {
  const queries: AuditedQuery[] = []
  const inner = (fake as unknown as { from: (name: string) => unknown }).from.bind(fake)
  ;(fake as unknown as { from: (name: string) => unknown }).from = (name: string) => {
    const q = inner(name) as Record<string, (...args: unknown[]) => unknown>
    const caller = callerOf(new Error().stack ?? '')
    const ours = !!caller && /^lib\/seed-scan\/(?!__qa__)[\w-]+\.ts$/.test(caller.file)
    const entry: AuditedQuery = { table: name, ours, file: caller?.file ?? null, fn: caller?.fn ?? null, calls: [] }
    queries.push(entry)
    for (const op of RECORDED) {
      const original = q[op]
      if (typeof original !== 'function') continue
      q[op] = (...args: unknown[]) => {
        entry.calls.push({ op, args })
        return original.apply(q, args)
      }
    }
    return q
  }

  /**
   * Our queries that do not name the owner, described. `owners` is the run's
   * owner, or — for the cron, which works runs of several accounts — each of
   * them (a query must still name one of them, and write only that one's rows).
   */
  const offenders = (owners: string | string[]): string[] => {
    const allowed = new Set(Array.isArray(owners) ? owners : [owners])
    const out: string[] = []
    for (const q of queries) {
      if (!q.ours) continue
      const ops = q.calls.map((c) => c.op)
      const mutation = ops.some((o) => o === 'insert' || o === 'upsert' || o === 'update' || o === 'delete')
      const write = q.calls.find((c) => c.op === 'insert' || c.op === 'upsert')
      const named = q.calls.filter((c) => c.op === 'eq' && c.args[0] === 'user_id').map((c) => c.args[1])
      const filtered = named.length > 0 && named.every((u) => allowed.has(u as string))
      const rows = write ? (Array.isArray(write.args[0]) ? write.args[0] : [write.args[0]]) as Record<string, unknown>[] : []
      const writer = rows[0]?.user_id
      const written = !!write && rows.length > 0 && allowed.has(writer as string) && rows.every((r) => r && r.user_id === writer)
      const select = q.calls.find((c) => c.op === 'select')
      const stalledKeys = q.fn === 'listStalledSeedRuns' && !mutation && select?.args[0] === 'id, project_id, user_id, stage'
      const globalCount = q.fn === 'countAllSeedRunsSince' && !mutation && select?.args[0] === 'id' && (select.args[1] as { head?: boolean } | undefined)?.head === true
      if (filtered || written || stalledKeys || globalCount) continue
      out.push(`${q.file}:${q.fn} ${q.table} ${ops.join('.')}`)
    }
    return out
  }

  return { queries, offenders, ours: () => queries.filter((q) => q.ours) }
}
