/**
 * The automatic-fix scheduler: once a day (app/api/site-health/auto-fix/cron), the projects whose
 * owner turned automatic fixes on and that have not run for AUTO_RUN_EVERY_DAYS, oldest first, at
 * most MAX_PROJECTS_PER_RUN, one after another, each only with PROJECT_MIN_MS of the run left.
 *
 * Per project:
 *   - the owner signed in within AUTO_INACTIVE_DAYS (nobody is fixed for in their absence);
 *   - the project is CLAIMED (run_claimed_until, a conditional update): two runs at once never work
 *     on the same project, and a run that died lets go after CLAIM_MS;
 *   - lib/site-fix/api.ts autoFixProject does the work, as the grant's owner, with the IP recorded
 *     at switch-on; it proves the owner again, and writes nothing unless the site is WordPress with
 *     the Go Top plugin connected;
 *   - last_run_at is set when it finishes, whatever the outcome, so a failing site waits a week.
 *
 * The ONE place that lists grants across projects (./auto-store.ts listDueGrants). Nothing a site,
 * WordPress or the database said reaches a log line: counts and our own codes only.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { autoFixProject, type AutoFixDeps, type AutoOutcome } from './api'
import { AUTO_RUN_EVERY_DAYS, CLAIM_MS, MAX_PROJECTS_PER_RUN, PROJECT_MIN_MS, activeWithin } from './auto'
import { claimGrant, finishGrantRun, listDueGrants } from './auto-store'

type Admin = ReturnType<typeof createAdminClient>

export interface AutoRunOptions {
  deadlineAt: number
  /** The dependencies of one grant (lib/site-fix/route-deps.ts cronDeps): its owner and its recorded IP. */
  depsFor: (userId: string, ip: string | null) => AutoFixDeps
  /** The owner's last sign-in, or 'unreadable'. Default: auth.admin.getUserById. */
  lastSignInAt?: (admin: Admin, userId: string) => Promise<string | null | 'unreadable'>
  now?: () => number
  /** The run's id (the queue groups each project's automatic fixes of this run by it). */
  newRunId?: () => string
  /** The work for one project. Default: autoFixProject. */
  fixProject?: typeof autoFixProject
}

export interface AutoRunSummary {
  available: boolean
  due: number
  projects: number
  applied: number
  failed: number
  skipped: Record<string, number>
}

async function defaultLastSignInAt(admin: Admin, userId: string): Promise<string | null | 'unreadable'> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user) return 'unreadable'
    return (data.user.last_sign_in_at as string | null | undefined) ?? null
  } catch {
    return 'unreadable'
  }
}

export async function runAutoFixes(admin: Admin, opts: AutoRunOptions): Promise<AutoRunSummary> {
  const now = opts.now ?? Date.now
  const lastSignIn = opts.lastSignInAt ?? defaultLastSignInAt
  const fixProject = opts.fixProject ?? autoFixProject
  const summary: AutoRunSummary = { available: true, due: 0, projects: 0, applied: 0, failed: 0, skipped: {} }
  const skip = (why: string) => { summary.skipped[why] = (summary.skipped[why] ?? 0) + 1 }

  const listed = await listDueGrants(admin, new Date(now() - AUTO_RUN_EVERY_DAYS * 86_400_000).toISOString())
  if (!listed.available) return { ...summary, available: false }
  summary.due = listed.grants.length
  for (const grant of listed.grants) {
    if (summary.projects >= MAX_PROJECTS_PER_RUN) break
    if (opts.deadlineAt - now() < PROJECT_MIN_MS) { skip('no_time'); break }
    const login = await lastSignIn(admin, grant.user_id)
    if (login === 'unreadable') { skip('login_unreadable'); continue }
    if (!activeWithin(login, now())) { skip('inactive'); continue }
    const scope = { projectId: grant.project_id, userId: grant.user_id }
    const at = new Date(now())
    if (!(await claimGrant(admin, scope, grant.id, at.toISOString(), new Date(at.getTime() + CLAIM_MS).toISOString()))) { skip('claimed'); continue }
    summary.projects++
    let out: AutoOutcome
    try {
      out = await fixProject(grant.project_id, grant, {
        ...opts.depsFor(grant.user_id, grant.enabled_ip), deadlineAt: opts.deadlineAt, runId: opts.newRunId?.(),
      })
    } catch {
      out = { ok: false, reason: 'store_failed' }
    } finally {
      await finishGrantRun(admin, scope, grant.id, new Date(now()).toISOString()).catch(() => undefined)
    }
    if (out.ok) {
      summary.applied += out.applied
      summary.failed += out.failed
      if (out.stopped) skip(`stopped_${out.stopped}`)
    } else skip(out.reason)
  }
  return summary
}

/** A margin under maxDuration that the run never works into. */
export const AUTO_MARGIN_MS = 30_000

/**
 * ISOLATED. Runs `task` with its own deadline (what is left of the route's maxDuration, less
 * AUTO_MARGIN_MS), inside its own try/catch. Resolves whatever happens; never throws or rejects.
 */
export async function startIsolatedAutoFix(
  task: (deadlineAt: number) => Promise<unknown>,
  window: { startedAtMs: number; maxDurationMs: number; marginMs?: number; nowMs?: () => number },
): Promise<void> {
  try {
    const deadlineAt = window.startedAtMs + window.maxDurationMs - (window.marginMs ?? AUTO_MARGIN_MS)
    if ((window.nowMs ?? Date.now)() + PROJECT_MIN_MS > deadlineAt) return
    await task(deadlineAt)
  } catch {
    console.error('[site-fix-auto] run failed')
  }
}
