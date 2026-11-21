/**
 * The WordPress SEO-meta backfill's DRY RUN as a passenger on the hourly cron.
 *
 * WHY A DRY RUN AND ONLY A DRY RUN. 337 articles across 21 customer projects
 * were published to WordPress and never got an SEO title or meta description
 * (measured 21 Nov 2026: `seo_status` NULL, every one of them with a stored
 * meta title AND meta description, published 4 Jul to 4 Nov). 59 of them sit on
 * a project with the Go Top plugin connected and Yoast detected; the other 278
 * would be written through an application password. `lib/content/seo-backfill.ts`
 * has been able to fix all of them since it shipped and has evidently never
 * been run in apply mode.
 *
 * Before anything is written to 21 merchants' live sites, somebody has to know
 * what is actually on those pages — and that is not in our database. Only the
 * live page says whether a title is missing, is already ours, or is one the
 * merchant wrote and must be left alone. This pass finds that out and logs it.
 *
 * IT CANNOT WRITE. `apply` is not a parameter here: the call is hard-coded to
 * the dry run, which reads the live page and the database and makes no
 * WordPress call, no plugin call and no database write. A passenger that could
 * be flipped to apply by an environment variable is a passenger that will be.
 *
 * A RANDOM SAMPLE, not a walk. Keeping a cursor would need a table, and the
 * answer wanted here is a distribution, not a list: ten articles an hour,
 * drawn at random, converge on the shape of all 337 within a few passes and
 * cost ten page reads.
 *
 * Production only, because Preview shares the Production database. Isolated: its
 * own budget, its own try/catch, and it never throws.
 */
import type { ArticleReport, FieldState } from './seo-backfill'

/** How many articles one pass reads. Ten page fetches an hour. */
export const SEO_BACKFILL_SAMPLE = 10
/** What is left for the pass after the work above it, at most 45 seconds. */
export const SEO_BACKFILL_BUDGET_MS = 45_000

export interface SeoBackfillSample {
  /** How many articles are waiting in all, which is the number the sample describes. */
  waiting: number
  sampled: number
  /** Per field: how the live page classified it. */
  title: Record<FieldState, number>
  description: Record<FieldState, number>
  /** Articles the backfill would refuse, by reason. */
  skipped: Record<string, number>
  /**
   * The articles refused as `nothing_to_write`, read again: WHOSE words are on the
   * page. Measured 21 Nov 2026, the first pass refused all ten for that reason and
   * the log could not say why, because a refused report's field states were
   * discarded — so the question "are the 337 really missing their SEO meta, or only
   * unverified in our database?" had no answer in the line that was meant to answer
   * it. `ours` means apply would record `seo_status` and change nothing on the site;
   * `kept` means the merchant wrote it and we leave it alone either way.
   */
  nothingToWrite: {
    title: Record<FieldState, number>
    description: Record<FieldState, number>
    /** Both fields already OUR words: apply would write the database only. */
    verifyOnly: number
  }
  /** How many articles have at least one field the backfill would write. */
  wouldWrite: number
  byChannel: Record<string, number>
}

export type IsolatedSeoBackfillOutcome =
  | ({ status: 'ran' } & SeoBackfillSample)
  | { status: 'not_production' | 'no_time' | 'nothing_waiting' | 'error' }

const emptyStates = (): Record<FieldState, number> => ({ missing: 0, ours: 0, kept: 0, unknown: 0 })

/** Pure: the distribution a batch of reports describes. */
export function summarizeReports(reports: ArticleReport[], waiting: number): SeoBackfillSample {
  const out: SeoBackfillSample = {
    waiting, sampled: reports.length, title: emptyStates(), description: emptyStates(), skipped: {}, wouldWrite: 0, byChannel: {},
    nothingToWrite: { title: emptyStates(), description: emptyStates(), verifyOnly: 0 },
  }
  for (const r of reports) {
    out.byChannel[r.channel] = (out.byChannel[r.channel] ?? 0) + 1
    if (r.skip) {
      out.skipped[r.skip] = (out.skipped[r.skip] ?? 0) + 1
      // A page that was read and had both fields is the one refusal worth describing.
      if (r.skip === 'nothing_to_write') {
        out.nothingToWrite.title[r.head.title] += 1
        out.nothingToWrite.description[r.head.description] += 1
        if (r.head.title === 'ours' && r.head.description === 'ours') out.nothingToWrite.verifyOnly += 1
      }
      continue
    }
    out.title[r.head.title] += 1
    out.description[r.head.description] += 1
    if (r.title === 'would_write' || r.description === 'would_write') out.wouldWrite += 1
  }
  return out
}

/** Fisher-Yates on a copy, so the sample is a sample and not always the same ten rows. */
export function sample<T>(items: T[], n: number, random: () => number = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a.slice(0, n)
}

export async function runIsolatedSeoBackfillSample(
  run: (n: number, deadlineAt: number) => Promise<{ reports: ArticleReport[]; waiting: number }> = async (n, deadlineAt) => {
    const [{ createAdminClient }, mod] = await Promise.all([
      import('@/lib/supabase/admin'), import('./seo-backfill'),
    ])
    const admin = createAdminClient()
    const waiting = (await mod.loadBackfillCandidates(admin)).filter((a) => a.seoStatus === null)
    const reports: ArticleReport[] = []
    for (const a of sample(waiting, n)) {
      if (Date.now() >= deadlineAt) break
      // THE DRY RUN. `apply` is false and is not configurable from here.
      reports.push(...await mod.runBackfill(admin, { apply: false, articleId: a.id }))
    }
    return { reports, waiting: waiting.length }
  },
  opts: { env?: Record<string, string | undefined>; startedAtMs?: number; maxDurationMs?: number } = {},
): Promise<IsolatedSeoBackfillOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }

  const now = Date.now()
  const endOfRun = (opts.startedAtMs ?? now) + (opts.maxDurationMs ?? 0)
  const left = Math.min(SEO_BACKFILL_BUDGET_MS, endOfRun - now)
  // One live page fetch has its own timeout; under five seconds starts nothing.
  if (left < 5_000) return { status: 'no_time' }

  try {
    const { reports, waiting } = await run(SEO_BACKFILL_SAMPLE, now + left)
    if (!waiting) return { status: 'nothing_waiting' }
    const result = summarizeReports(reports, waiting)
    console.log('[seo-backfill-sample] dry run', result)
    return { status: 'ran', ...result }
  } catch (e) {
    console.error('[seo-backfill-sample] dry run failed', { message: e instanceof Error ? e.message : String(e) })
    return { status: 'error' }
  }
}
