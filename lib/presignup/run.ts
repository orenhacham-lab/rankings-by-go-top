/**
 * Stage A of the seed scan for a visitor who has no account yet.
 *
 * The very executors a project's run uses (lib/seed-scan/steps.ts), in the
 * same order and with the same budgets, so a claimed research can later be
 * replayed into a project exactly as if the scan had run for it. What is
 * different is only where things go:
 *
 *   - there is no project and no database. The steps get a client that throws
 *     on any use, and a2/a4's writes (settings, competitors) are replaced by
 *     ones that keep everything in the snapshot and touch no table. What the
 *     project would have had filled — its country and language, which a4's
 *     searches run in — is filled on the in-memory project, by the same
 *     normalization (settings.ts projectValues);
 *   - each step's detail is kept in memory (`save` never fails), and handed
 *     back with the snapshot, for the ledger row a claim redeems;
 *   - spend is counted as it happens: every model call and every search goes
 *     through a counter, so the caller records what this run cost.
 *
 * The runner's own rule applies: when a1 fails, the later steps are skipped
 * with `site_unreadable`, and nothing is asked or searched.
 */
import { domainKey } from '@/lib/free-check'
import type { Locale } from '@/lib/i18n/locales'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { projectValues, type CompetitorInsertReport, type SeedProject, type SettingsReport } from '@/lib/seed-scan/settings'
import { STAGE_A_EXECUTORS, stageADeps, type StageADepsInput, type StageAWrites, type StepContext, type StepOutcome } from '@/lib/seed-scan/steps'
import { seedRunStatus } from '@/lib/seed-scan/store'
import { initialSummary } from '@/lib/seed-scan/summary'
import type { SeedErrorCode, SeedRunStatus, SeedScope, SeedSummary } from '@/lib/seed-scan/types'
import type { ResearchStep, ResearchStepView } from './types'

export const RESEARCH_STEPS: readonly ResearchStep[] = ['a1', 'a2', 'a3', 'a4']

/** Stands in for the project's id and owner: nothing is ever written under them. */
export const ANONYMOUS = 'anonymous'

/**
 * A database client that is not one. Any use throws, so a step that would
 * reach a table in an anonymous run fails loudly (the runner turns a throw
 * into that step's `internal_error`) instead of writing anywhere.
 */
export const NO_DATABASE = new Proxy(
  {},
  {
    get() {
      throw new Error('presignup_no_database')
    },
  },
) as ServiceRoleClient

const EMPTY_REPORT: SettingsReport = {
  profile: { written: [], keptUser: [], keptValue: [] },
  project: { written: [], keptUser: [], keptValue: [] },
  audiences: 'none',
}

/**
 * a2 and a4's writes for a run with no project: the in-memory project takes
 * what a first scan would have filled (only its empty fields, as settings.ts
 * rules), and nothing reaches a table.
 */
export const ANONYMOUS_WRITES: StageAWrites = {
  applyBusiness: async (_admin, _scope, input) => {
    const values = projectValues(input.business)
    const fill = (current: string | null, next: string | null) => (current && current.trim() ? current : next)
    const project: SeedProject = {
      ...input.project,
      business_name: fill(input.project.business_name, values.business_name),
      country: fill(input.project.country, values.country),
      language: fill(input.project.language, values.language),
      city: fill(input.project.city, values.city),
    }
    return { ok: true, report: EMPTY_REPORT, project }
  },
  addCompetitors: async (): Promise<CompetitorInsertReport> => ({ inserted: [], alreadyListed: [], overCap: [] }),
}

export type ResearchSpend = { modelCalls: number; searches: number }

export type AnonymousResearch = {
  status: SeedRunStatus
  errorCode: string | null
  summary: SeedSummary
  steps: ResearchStepView[]
  /** Each step's own detail as the executors left it: what a claim replays. */
  details: Record<ResearchStep, Record<string, unknown>>
  spend: ResearchSpend
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

export async function runAnonymousStageA(args: {
  url: URL
  locale: Locale
  deps?: StageADepsInput
  /** Called when a step starts and when it ends; a throw here is ignored. */
  onStep?: (step: ResearchStepView) => void
}): Promise<AnonymousResearch> {
  const spend: ResearchSpend = { modelCalls: 0, searches: 0 }
  const base = stageADeps(args.deps)
  const deps = {
    ...base,
    insight: ((...a: Parameters<typeof base.insight>) => {
      spend.modelCalls++
      return base.insight(...a)
    }) as typeof base.insight,
    search: ((...a: Parameters<typeof base.search>) => {
      spend.searches++
      return base.search(...a)
    }) as typeof base.search,
  }
  const siteKey = domainKey(args.url)
  const scope: SeedScope = { projectId: ANONYMOUS, userId: ANONYMOUS }
  let project: SeedProject = {
    id: ANONYMOUS,
    user_id: ANONYMOUS,
    target_domain: args.url.toString(),
    business_name: null,
    country: null,
    language: null,
    city: null,
  }
  let summary = initialSummary({ source: 'scan', domain: siteKey, url: args.url.toString(), locale: args.locale })
  const details: Partial<Record<ResearchStep, Record<string, unknown>>> = {}
  const steps: ResearchStepView[] = RESEARCH_STEPS.map((step) => ({ step, status: 'pending', errorCode: null, itemCount: null }))
  const tell = (view: ResearchStepView) => {
    const i = steps.findIndex((s) => s.step === view.step)
    steps[i] = view
    try {
      args.onStep?.({ ...view })
    } catch {
      /* the screen's trouble is not the run's */
    }
  }

  for (const step of RESEARCH_STEPS) {
    if (steps.find((s) => s.step === step)?.status !== 'pending') continue
    tell({ step, status: 'running', errorCode: null, itemCount: null })
    const ctx: StepContext = {
      admin: NO_DATABASE,
      scope,
      trigger: 'create',
      project,
      summary,
      details,
      deps,
      writes: ANONYMOUS_WRITES,
      save: async (detail) => {
        details[step] = detail
        return true
      },
    }
    let outcome: StepOutcome
    try {
      outcome = await STAGE_A_EXECUTORS[step](ctx)
    } catch (err) {
      console.error('[presignup] step threw', { step, error: errorName(err) })
      outcome = { kind: 'finished', status: 'failed', errorCode: 'internal_error', itemCount: null, detail: details[step] ?? {}, summary }
    }
    // `save` never refuses here, so no step aborts; read one as a failure all the same.
    if (outcome.kind === 'abort') {
      outcome = { kind: 'finished', status: 'failed', errorCode: 'internal_error', itemCount: null, detail: details[step] ?? {}, summary }
    }
    summary = outcome.summary
    if (outcome.project) project = outcome.project
    details[step] = outcome.detail
    tell({ step, status: outcome.status, errorCode: outcome.errorCode, itemCount: outcome.itemCount })

    // Nothing was read: the later steps have nothing to work from, and say so.
    if (step === 'a1' && outcome.status === 'failed') {
      const code: SeedErrorCode = 'site_unreadable'
      for (const later of RESEARCH_STEPS.slice(1)) tell({ step: later, status: 'skipped', errorCode: code, itemCount: null })
      break
    }
  }

  const verdict = seedRunStatus(
    'a',
    steps.map((s) => ({ step: s.step, status: s.status, error_code: s.errorCode })),
  )
  return {
    status: verdict.status,
    errorCode: verdict.errorCode,
    summary,
    steps,
    details: { a1: details.a1 ?? {}, a2: details.a2 ?? {}, a3: details.a3 ?? {}, a4: details.a4 ?? {} },
    spend,
  }
}
