/**
 * Where a project stands with its mapping (the seeding scan's stage A, the
 * scan that reads the site, understands the business, measures what holds it
 * back and finds its competitors), derived from what is already stored: the
 * project's latest project_seed_runs row as GET /api/projects/[id]/seed
 * answers it. No migration and no new column: an older project simply has no
 * run.
 *
 *   none     no run at all: a project older than the scan, or one created
 *            while the scan was off. Every screen is the new one anyway; the
 *            mapping only ENRICHES it, it never decides which design is shown.
 *   running  stage A is working now (or its worker is gone and the cron still
 *            has it to resume).
 *   done     stage A finished. Whatever stage B is doing belongs to the
 *            research summary, not to the mapping.
 *   failed   stage A could not read the site, or it stalled for longer than
 *            the cron resumes a run.
 *
 * `available` is whether the mapping can be offered at all: the seed route
 * answers only when the scan is on for this user (ENABLE_SEED_SCAN=true, or an
 * administrator) — the same gate as the settings screen's scan band — and 404
 * otherwise. Unavailable means no banner, no "run the mapping" button and no
 * placeholder that promises one; the screens stay new all the same.
 *
 * Pure: no React, no I/O.
 */

export type MappingState = 'none' | 'running' | 'done' | 'failed'

/** Stage A's four steps, in the order the progress bar shows them. */
export const MAPPING_STEPS = ['a1', 'a2', 'a3', 'a4'] as const
export type MappingStep = (typeof MAPPING_STEPS)[number]
export type MappingStepState = 'pending' | 'running' | 'done'

export type Mapping =
  /** The seed route did not answer yet. */
  | { available: null; state: null }
  /** The scan is off for this user, or the route could not be read: nothing is offered. */
  | { available: false; state: null }
  | {
      available: true
      state: MappingState
      /** Stage A's steps, for the progress bar; every step pending when there is no run. */
      steps: { step: MappingStep; state: MappingStepState }[]
      /** Stage B is going (or waiting for the cron): the research summary's own state. */
      stageB: 'none' | 'running' | 'done' | 'failed'
      /** When the site was read, once it was. */
      scannedAt: string | null
    }

export const MAPPING_LOADING: Mapping = { available: null, state: null }
export const MAPPING_OFF: Mapping = { available: false, state: null }

/** The cron resumes a stalled run for a day (lib/seed-scan/store.ts MAX_RESUME_AGE_MS); after that it is over. */
export const MAPPING_GIVE_UP_MS = 24 * 60 * 60 * 1000

const TERMINAL = ['done', 'skipped', 'failed']
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function stepsOf(run: Record<string, unknown> | null): { step: MappingStep; state: MappingStepState }[] {
  const raw = run && Array.isArray(run.steps) ? run.steps.filter(isRecord) : []
  return MAPPING_STEPS.map((step) => {
    const s = raw.find((x) => x.step === step)
    const status = typeof s?.status === 'string' ? s.status : 'pending'
    return { step, state: status === 'running' ? 'running' : TERMINAL.includes(status) ? 'done' : 'pending' }
  })
}

/**
 * The mapping, from the seed route's answer: `status` is the HTTP status (0 for
 * no answer), `body` its JSON. A 200 without a run is `none`; anything but a
 * 200 is "not available", so a failed read never offers what might be refused.
 */
export function mappingFrom(status: number, body: unknown, now: Date): Mapping {
  if (status !== 200 || !isRecord(body) || body.ok !== true) return MAPPING_OFF
  const run = isRecord(body.run) ? body.run : null
  const summary = run && isRecord(run.summary) ? run.summary : null
  const scannedAt = summary && typeof summary.scannedAt === 'string' ? summary.scannedAt : null
  if (!run) return { available: true, state: 'none', steps: stepsOf(null), stageB: 'none', scannedAt: null }

  const stage = run.stage === 'b' ? 'b' : 'a'
  const runStatus = typeof run.status === 'string' ? run.status : 'failed'
  const started = Date.parse(typeof run.startedAt === 'string' ? run.startedAt : '')
  const gaveUp = run.stalled === true && (!Number.isFinite(started) || now.getTime() - started > MAPPING_GIVE_UP_MS)
  const steps = stepsOf(run)

  let state: MappingState
  let stageB: 'none' | 'running' | 'done' | 'failed' = 'none'
  if (stage === 'a') {
    if (runStatus === 'running') state = gaveUp ? 'failed' : 'running'
    else if (runStatus === 'failed') state = 'failed'
    else state = 'done'
  } else {
    // Stage B keeps stage A's rows: the mapping itself is done.
    state = 'done'
    stageB = runStatus === 'running' ? (gaveUp ? 'failed' : 'running') : runStatus === 'failed' ? 'failed' : 'done'
  }
  return { available: true, state, steps, stageB, scannedAt }
}

/** Worth asking the route again: the mapping is still working. */
export function mappingRunning(m: Mapping): boolean {
  return m.available === true && m.state === 'running'
}

/**
 * The banner offers the mapping: it can be offered, and there is none yet (or
 * the last one failed). A finished mapping needs no invitation.
 */
export function mappingInvites(m: Mapping): boolean {
  return m.available === true && (m.state === 'none' || m.state === 'failed')
}

// ── "Later" ─────────────────────────────────────────────────────────────────

/** "Later" hides the banner for a week. */
export const MAPPING_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

export function snoozeKey(projectId: string): string {
  return `mapping-banner-snoozed:${projectId}`
}

/** Whether a stored "later" (epoch ms as text) still hides the banner. Unreadable is not snoozed. */
export function snoozed(stored: string | null, now: Date): boolean {
  if (!stored) return false
  const at = Number(stored)
  return Number.isFinite(at) && at > 0 && now.getTime() - at < MAPPING_SNOOZE_MS && at <= now.getTime() + 60_000
}
