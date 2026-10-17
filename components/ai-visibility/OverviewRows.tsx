'use client'

/**
 * Rows 1, 2 and 4 of the AI-visibility tab (plan section 5):
 *
 *   OverviewStatusBar   which engines were checked, the last check, the next
 *   OverviewOpeningCard the dark "does AI recommend you?" card: the score, the
 *                       mentions and citations, the change since the check before
 *   RecentActivity      the latest checks and what came of each
 *
 * All three draw the same AiOverview (overview-model.ts), built from the runs
 * the tool itself loaded, so they read nothing of their own and cannot disagree
 * with the tool underneath them. `overview` is null while those runs load and
 * 'error' when they could not be read; each row keeps its height in every state.
 */
import { useState } from 'react'
import NextLink from 'next/link'
import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, CheckCircle2, CircleDashed, Info, Loader2, Quote, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button, { buttonClasses } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Locale } from '@/lib/i18n/locales'
import { ENGINE_META } from './EngineIcon'
import { OVERVIEW_ENGINES, type AiOverview, type RecentOutcome } from './overview-model'
import Switch from '@/components/ui/Switch'
import { MONTHLY_CORE_ENGINES, MONTHLY_SUBSTITUTE_ENGINE } from '@/lib/ai-visibility/monthly-check/config'
import type { MonthlyStatus } from '@/lib/ai-visibility/monthly-check/runner'

/** What GET /api/ai-visibility/monthly answered; null while it loads or when it could not be read. */
export type MonthlyView = MonthlyStatus | null
type MonthlyShown = Extract<MonthlyStatus, { limit: number }>
type MonthlyAdmin = Extract<MonthlyStatus, { state: 'admin' }>
const shownMonthly = (m: MonthlyView): MonthlyShown | null => (m && 'limit' in m ? m : null)
const adminMonthly = (m: MonthlyView): MonthlyAdmin | null => (m && m.state === 'admin' ? m : null)

/** The date of the next automatic check, when there is one to name. */
export function monthlyNextDate(m: MonthlyView): string | null {
  const s = shownMonthly(m)
  return s && s.state !== 'off' && s.state !== 'no_questions' ? s.nextAt : null
}

type Copy = ReturnType<typeof getDashboardDictionary>['aiVisibilityOverview']
export type OverviewData = AiOverview | null | 'error'

export function formatWhen(iso: string | null, language: Locale, dateOnly = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric', month: 'short', ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(d)
}

function useCopy() {
  const { language, uiLocale } = useDashboardLanguage()
  return { c: getDashboardDictionary(uiLocale).aiVisibilityOverview, language }
}

// ── Row 1 ────────────────────────────────────────────────────────────────────

export function OverviewStatusBar({ overview, questionsPending, monthly = null }: { overview: OverviewData; questionsPending: boolean; monthly?: MonthlyView }) {
  const { c, language } = useCopy()
  const data = overview && overview !== 'error' ? overview : null
  const checked = new Set(data?.enginesChecked ?? [])
  const mentioned = new Set(data?.enginesMentioned ?? [])
  const running = !!data?.running

  return (
    <section
      aria-label={c.statusLabel}
      data-ai-status-bar={overview === null ? 'loading' : overview === 'error' ? 'error' : 'ready'}
      className="rounded-card border border-line bg-surface px-4 py-3 sm:px-5"
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:flex md:flex-wrap md:items-center md:gap-x-8">
        <div className="col-span-2 min-w-0 md:col-span-1">
          <dt className="text-caption text-muted">{c.enginesChecked}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-1.5">
            {OVERVIEW_ENGINES.map((engine) => {
              const meta = ENGINE_META[engine]
              const on = checked.has(engine)
              // The ✓ means "mentioned you", never merely "checked".
              const named = on && mentioned.has(engine)
              const label = `${meta?.name ?? engine}: ${named ? c.engineMentioned : on ? c.engineNotMentioned : c.engineNotChecked}`
              return (
                <span
                  key={engine}
                  title={label}
                  data-engine-state={named ? 'mentioned' : on ? 'not_mentioned' : 'not_checked'}
                  className={cn(
                    'relative inline-flex h-7 w-7 items-center justify-center rounded-pill border transition-colors',
                    on ? 'border-line bg-surface' : 'border-dashed border-line bg-sunk opacity-50 grayscale',
                  )}
                >
                  {meta && <meta.Icon size={15} />}
                  {named && (
                    <CheckCircle2 size={11} strokeWidth={2.5} aria-hidden="true" className="absolute -bottom-0.5 -end-0.5 rounded-pill bg-surface text-ok" />
                  )}
                  <span className="sr-only">{label}</span>
                </span>
              )
            })}
            <span className="ms-1 text-caption tabular-nums text-muted">
              {data ? c.enginesCount(data.enginesChecked.length, OVERVIEW_ENGINES.length) : ' '}
            </span>
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-caption text-muted">{c.lastCheck}</dt>
          <dd className="mt-1 text-copy font-medium text-ink">
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-info">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {c.checkRunning}
              </span>
            ) : data ? (
              data.lastCheckAt ? formatWhen(data.lastCheckAt, language) : c.lastCheckNever
            ) : (
              <span className="inline-block h-4 w-24 rounded-control bg-sunk align-middle" aria-hidden="true" />
            )}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-caption text-muted">{c.nextCheck}</dt>
          {/* The hint rides on `title` and the screen-reader text: a positioned
              tooltip this close to the edge would widen the page on a phone. */}
          <dd className="mt-1 flex items-center gap-1.5 text-copy font-medium text-ink" title={c.nextCheckManualHint} data-ai-next-check={monthlyNextDate(monthly) ? 'auto' : 'manual'}>
            {monthlyNextDate(monthly) ? formatWhen(monthlyNextDate(monthly), language, true) : adminMonthly(monthly) ? c.autoAdminNext : c.nextCheckManual}
            <Info size={14} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">{c.nextCheckManualHint}</span>
          </dd>
        </div>

        {questionsPending && (
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-caption text-info md:ms-auto">
            <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden="true" />
            <span>{c.questionsPendingNote}</span>
          </div>
        )}
      </dl>
    </section>
  )
}

// ── Row 2 ────────────────────────────────────────────────────────────────────

export function OverviewOpeningCard({
  overview,
  questionsPending,
  questionsSuggested,
  questionsCount = null,
  allowanceOut = false,
  onChooseQuestions,
  monthly = null,
  monthlyRunning = false,
  monthlyError = null,
  onRunMonthlyNow,
  onToggleMonthly,
}: {
  overview: OverviewData
  questionsPending: boolean
  questionsSuggested: number | null
  /** Questions the project tracks (the tool's own list); null until it has loaded. */
  questionsCount?: number | null
  /**
   * The AI-check allowance is read and nothing is left (see the allowance route,
   * which reports the same rule the dispatcher enforces). A "run more checks"
   * step would then lead to engine buttons that can only refuse, so the step
   * becomes the way to more checks: the billing page. It only opens that page.
   */
  allowanceOut?: boolean
  onChooseQuestions: () => void
  /** The automatic monthly check (UX review B): its meter, next date, a skipped month, the setting. */
  monthly?: MonthlyView
  monthlyRunning?: boolean
  /** Our own sentence when "run now" or the setting failed. */
  monthlyError?: string | null
  onRunMonthlyNow?: () => void
  onToggleMonthly?: (next: boolean) => void
}) {
  const { c, language } = useCopy()
  const data = overview && overview !== 'error' ? overview : null
  const state = overview === null ? 'loading' : overview === 'error' ? 'error' : data && data.score !== null ? 'ready' : 'empty'

  return (
    <section
      aria-labelledby="ai-opening-title"
      data-ai-opening={state}
      className="relative overflow-hidden rounded-card bg-contrast text-contrast-ink shadow-card"
    >
      {/* One quiet accent: a soft glow behind the score, never a gradient on the text. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 end-[-6rem] h-64 w-64 rounded-pill bg-action/30 blur-3xl" />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10 lg:p-8">
        <div className="min-w-0">
          <h2 id="ai-opening-title" className="text-title font-semibold tracking-tight">{c.heroTitle}</h2>
          <p className="mt-1 max-w-[52ch] text-copy text-contrast-ink/70">{c.heroSubtitle}</p>

          {state === 'ready' && data && (
            <div className="mt-6 flex items-end gap-5">
              <p className="leading-none" dir="ltr">
                <span className="text-[3.5rem] font-semibold leading-none tracking-tight">{data.score}</span>
                <span className="ms-1 text-section font-medium text-contrast-ink/60">/100</span>
              </p>
              <div className="min-w-0 flex-1 pb-1.5">
                <p className="text-caption font-medium text-contrast-ink/80">{c.scoreLabel}</p>
                <div
                  role="meter"
                  aria-label={c.scoreLabel}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={data.score ?? 0}
                  className="mt-1.5 h-1.5 w-full max-w-[16rem] overflow-hidden rounded-pill bg-contrast-ink/15"
                  dir="ltr"
                >
                  <div className="h-full rounded-pill bg-contrast-ink transition-[width] duration-500" style={{ width: `${data.score}%` }} />
                </div>
                <p className="mt-1.5 text-caption text-contrast-ink/60">{c.scoreHelp}</p>
              </div>
            </div>
          )}

          {state === 'ready' && data && <NextStep c={c} data={data} onRunMore={onChooseQuestions} allowanceOut={allowanceOut} nextAutoDate={monthlyNextDate(monthly) ? formatWhen(monthlyNextDate(monthly), language, true) : null} />}

          {/* The next step depends on whether the project tracks questions, which the
              tool reports once its list loaded: until then the step's shape, not the
              "pick a question" step shown for a second to a project that has eight. */}
          {state === 'empty' && questionsCount === null && !questionsPending && (
            <div className="mt-6 max-w-[56ch]" aria-busy="true" data-ai-empty-step="loading">
              <p className="text-section font-semibold">{c.emptyTitle}</p>
              <Skeleton tone="contrast" className="mt-2 h-4 w-full" />
              <Skeleton tone="contrast" className="mt-2 h-4 w-2/3" />
              <Skeleton tone="contrast" className="mt-4 h-10 w-40" />
            </div>
          )}
          {state === 'empty' && (questionsCount !== null || questionsPending) && (
            <div className="mt-6 max-w-[56ch]">
              <p className="text-section font-semibold">{c.emptyTitle}</p>
              <p className="mt-1 text-copy text-contrast-ink/75" data-ai-empty-step={questionsCount ? 'check' : 'questions'}>
                {questionsCount
                  ? c.emptyBodyHasQuestions(questionsCount)
                  : questionsPending ? c.emptyBodyPending : questionsSuggested ? c.emptyBodyQuestions(questionsSuggested) : c.emptyBody}
              </p>
              {allowanceOut && questionsCount ? (
                <NextLink href="/billing" data-ai-upgrade-cta="" className={buttonClasses({ size: 'md', className: 'mt-4' })}>
                  {c.upgradeForChecks}
                </NextLink>
              ) : (
                <Button size="md" className="mt-4" onClick={onChooseQuestions} data-ai-choose-questions="">
                  {questionsCount ? c.runFirstCheck : c.chooseQuestions}
                </Button>
              )}
            </div>
          )}

          {state === 'loading' && (
            <div className="mt-6 flex items-end gap-5" aria-busy="true">
              <span className="sr-only">{c.loadingChecks}</span>
              <div aria-hidden="true" className="h-14 w-24 rounded-control bg-contrast-ink/10" />
              <div aria-hidden="true" className="mb-2 h-2 w-40 rounded-pill bg-contrast-ink/10" />
            </div>
          )}

          {state === 'error' && <p className="mt-6 text-copy text-contrast-ink/75">{c.loadFailed}</p>}

          <AutoCheckPanel c={c} language={language} monthly={monthly} running={monthlyRunning} error={monthlyError}
            onRunNow={onRunMonthlyNow} onToggle={onToggleMonthly} />
        </div>

        {/* The figures only once there is something to count: before the first
            check the card is the invitation, not three dashes. */}
        {state === 'loading' && (
          <div aria-hidden="true" className="grid grid-cols-3 gap-3 self-end sm:gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-[4.5rem] rounded-control bg-contrast-ink/[0.06]" />)}
          </div>
        )}
        {/* Before the first check the other side says what a check will measure,
            in the same three terms the figures use once there are answers. */}
        {state === 'empty' && (
          <div data-ai-opening-explainer="" className="min-w-0 self-end">
            <p className="text-caption font-medium text-contrast-ink/60">{c.emptyWhatYouGet}</p>
            <dl className="mt-2 grid gap-2">
              {([[c.scoreLabel, c.scoreHelp], [c.mentionsLabel, c.mentionsHelp], [c.citationsLabel, c.citationsHelp]] as const).map(([label, help], i) => (
                // A <dl> group holds only its <dt> and <dd> (axe: definition-list), so the
                // number sits inside the term and the help is indented to line up with it.
                <div key={label} className="min-w-0 rounded-control border border-contrast-ink/10 bg-contrast-ink/[0.04] px-3 py-2.5">
                  <dt className="flex items-start gap-3 text-caption font-semibold">
                    <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-contrast-ink/10 text-caption font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0">{label}</span>
                  </dt>
                  <dd className="ps-8 text-caption text-contrast-ink/65">{help}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {state === 'ready' && (
        <div className="flex min-w-0 flex-col justify-end gap-4">
        {/* A line needs three checks to say anything; before that, say how many are missing. */}
        {data && data.trend.length >= TREND_MIN_POINTS && <ScoreTrend points={data.trend} c={c} language={language} />}
        {data && data.trend.length > 0 && data.trend.length < TREND_MIN_POINTS && (
          <p data-ai-trend-pending={TREND_MIN_POINTS - data.trend.length} className="text-caption text-contrast-ink/60">
            <span className="font-medium text-contrast-ink/80">{c.trendLabel}</span>
            <span aria-hidden="true"> · </span>
            {c.trendPending(TREND_MIN_POINTS - data.trend.length)}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Figure label={c.mentionsLabel} help={c.mentionsHelp} value={data && data.score !== null ? data.mentions : null} note={data && data.score !== null ? c.ofAnswers(data.answers) : null} />
          <Figure label={c.citationsLabel} help={c.citationsHelp} value={data && data.score !== null ? data.citations : null} note={data && data.score !== null ? c.ofAnswers(data.answers) : null} />
          <ChangeFigure c={c} data={data} language={language} />
        </dl>
        </div>
        )}
      </div>
    </section>
  )
}

/**
 * One plain sentence under the score: what to do now. A partial picture (not
 * every engine checked) comes first, then "not mentioned yet", then "keep
 * checking". The figures beside it stay what they were.
 */
export function nextStepKind(data: Pick<AiOverview, 'enginesChecked' | 'mentions'>): 'partial' | 'no_mentions' | 'keep_going' {
  // Partial means the MAIN engines (the monthly check's, Perplexity standing in
  // for one) are not all checked; the other engines are optional, one check each.
  if (mainEnginesChecked(data.enginesChecked) < MONTHLY_CORE_ENGINES.length) return 'partial'
  if (data.mentions === 0) return 'no_mentions'
  return 'keep_going'
}

/** `nextAutoDate`: when the next automatic check runs, or null when there is none (it is off, or no question is tracked). */
function NextStep({ c, data, onRunMore, allowanceOut, nextAutoDate = null }: { c: Copy; data: AiOverview; onRunMore: () => void; allowanceOut: boolean; nextAutoDate?: string | null }) {
  const kind = nextStepKind(data)
  const text = kind === 'partial'
    ? c.nextStepPartial(mainEnginesChecked(data.enginesChecked), MONTHLY_CORE_ENGINES.length)
    : kind === 'no_mentions' ? c.nextStepNoMentions : nextAutoDate ? c.nextStepKeepGoingAuto(nextAutoDate) : c.nextStepKeepGoing
  return (
    <div data-ai-next-step={kind} className="mt-5 max-w-[56ch] rounded-control border border-contrast-ink/10 bg-contrast-ink/[0.05] px-3.5 py-3">
      <p className="text-caption font-semibold text-contrast-ink/80">{c.nextStepLabel}</p>
      <p className="mt-0.5 text-copy text-contrast-ink/80">{text}</p>
      {kind === 'partial' && (allowanceOut ? (
        <>
          <p className="mt-2 text-caption text-contrast-ink/70" data-ai-allowance-used-up="">{c.checksUsedUp}</p>
          <NextLink href="/billing" data-ai-upgrade-cta="" className={buttonClasses({ size: 'sm', variant: 'secondary', className: 'mt-3' })}>
            {c.upgradeForChecks}
          </NextLink>
        </>
      ) : (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onRunMore} data-ai-run-more="">{c.runMoreChecks}</Button>
      ))}
    </div>
  )
}

/** How many of the main engines are checked (Perplexity counts in place of a missing one). */
export function mainEnginesChecked(engines: readonly string[]): number {
  const core = MONTHLY_CORE_ENGINES.filter((e) => engines.includes(e)).length
  const standIn = engines.includes(MONTHLY_SUBSTITUTE_ENGINE) ? 1 : 0
  return Math.min(MONTHLY_CORE_ENGINES.length, core + standIn)
}

/**
 * THE AUTOMATIC MONTHLY CHECK, inside the hero (UX review B): this period's
 * meter (used of X, how many by the automatic check, left), the next date and
 * engines, a skipped month with "run now", and the project's on/off setting.
 * Nothing when the plan has no automatic check (trial, admin) or it could not
 * be read: the rest of the card stands without it.
 */
function AutoCheckPanel({ c, language, monthly, running, error, onRunNow, onToggle }: {
  c: Copy; language: Locale; monthly: MonthlyView; running: boolean; error: string | null
  onRunNow?: () => void; onToggle?: (next: boolean) => void
}) {
  const adminView = adminMonthly(monthly)
  if (adminView) return <AdminAutoPanel c={c} view={adminView} />
  const m = shownMonthly(monthly)
  if (!m) return null
  const names = m.engines.map((e) => c.autoEngineNames[e] ?? e).join(', ')
  const date = (iso: string | null) => formatWhen(iso, language, true)
  const pct = (n: number) => (m.limit > 0 ? Math.min(100, Math.max(0, (n / m.limit) * 100)) : 0)
  const labelId = 'ai-auto-check-label'
  return (
    <div data-ai-auto-check={m.state} className="mt-6 max-w-[56ch] rounded-control border border-contrast-ink/10 bg-contrast-ink/[0.05] px-3.5 py-3">
      {m.state !== 'off' && (m.questions ?? []).length > 0 && (
        <div className="mb-3 border-b border-contrast-ink/10 pb-3">
          <p className="flex items-center gap-1.5 text-copy font-semibold text-contrast-ink"><CalendarClock aria-hidden size={15} />{c.autoTitle}</p>
          <AutoQuestions c={c} questions={m.questions ?? []} engines={names} />
        </div>
      )}
      <p className="text-caption font-semibold text-contrast-ink/80">{c.autoMeterLabel}</p>
      <p className="mt-0.5 text-copy tabular-nums text-contrast-ink" data-ai-auto-meter="">{c.autoMeter(m.used, m.limit, m.autoUsed, m.left)}</p>
      {/* Used by the automatic check, then by manual checks, of X. */}
      <div aria-hidden="true" className="mt-2 flex h-1.5 w-full max-w-[20rem] overflow-hidden rounded-pill bg-contrast-ink/15" dir="ltr">
        <div className="h-full bg-contrast-ink/60" style={{ width: `${pct(m.autoUsed)}%` }} />
        <div className="h-full bg-contrast-ink" style={{ width: `${pct(Math.max(0, m.used - m.autoUsed))}%` }} />
      </div>
      {(m.state === 'scheduled' || m.state === 'done') && m.nextAt && (
        <p className="mt-2 text-caption text-contrast-ink/75" data-ai-auto-next="">{c.autoNext(date(m.nextAt), names)}</p>
      )}
      {m.state === 'allowance_low' && <p className="mt-2 text-caption text-contrast-ink/75">{c.autoAllowanceLow(date(m.nextAt))}</p>}
      {m.state === 'no_questions' && <p className="mt-2 text-caption text-contrast-ink/75">{c.autoNoQuestions}</p>}
      {m.state === 'off' && <p className="mt-2 text-caption text-contrast-ink/75" data-ai-auto-off="">{c.autoOff}</p>}
      {m.state === 'skipped' && (
        <div className="mt-2" data-ai-auto-skipped={m.skippedBecause ?? 'missed'}>
          <p className="text-caption text-contrast-ink/80">
            {m.skippedBecause === 'inactive' ? c.autoSkippedInactive(m.checks) : c.autoSkippedMissed(m.checks)}
          </p>
          {onRunNow && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={onRunNow} disabled={running} data-ai-auto-run-now="">
              {running && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {running ? c.autoRunning : c.autoRunNow}
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-caption text-contrast-ink/80">{error}</p>}
      {onToggle && (
        <div className="mt-3 flex items-start justify-between gap-4 border-t border-contrast-ink/10 pt-3">
          <span className="min-w-0">
            <span id={labelId} className="block text-caption font-semibold text-contrast-ink">{c.autoSettingLabel}</span>
            <span className="mt-0.5 block text-caption text-contrast-ink/65">{c.autoSettingBody(m.limit)}</span>
          </span>
          <Switch checked={m.state !== 'off'} onChange={onToggle} aria-labelledby={labelId} disabled={running} data-ai-auto-toggle="" className="mt-0.5" />
        </div>
      )}
    </div>
  )
}

/** Which questions the automatic check takes, on which engines; manual checks are the extra. */
function AutoQuestions({ c, questions, engines }: { c: Copy; questions: ReadonlyArray<{ id: string; prompt: string }>; engines: string }) {
  return (
    <>
      <p className="mt-2 text-caption text-contrast-ink/75">{c.autoQuestionsLabel(questions.length)}</p>
      <ul className="mt-1.5 space-y-1" data-ai-auto-questions={questions.length}>
        {questions.map((q) => (
          <li key={q.id} className="flex items-start gap-2 text-copy text-contrast-ink">
            <Check aria-hidden size={14} strokeWidth={2.5} className="mt-1 shrink-0 text-contrast-ink/70" />
            <span className="min-w-0 line-clamp-2">{q.prompt}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-caption text-contrast-ink/65" dir="auto">{engines}</p>
      <p className="mt-2 text-caption text-contrast-ink/65">{c.autoManualExtra}</p>
    </>
  )
}

/** An administrator's account: what a customer's automatic check covers here (it does not run in this account). */
function AdminAutoPanel({ c, view }: { c: Copy; view: MonthlyAdmin }) {
  const names = view.engines.map((e) => c.autoEngineNames[e] ?? e).join(', ')
  return (
    <div data-ai-auto-check="admin" className="mt-6 max-w-[56ch] rounded-control border border-contrast-ink/10 bg-contrast-ink/[0.05] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-copy font-semibold text-contrast-ink"><CalendarClock aria-hidden size={15} />{c.autoTitle}</p>
      <p className="mt-1 text-caption text-contrast-ink/80">{c.autoAdminBody(names, view.startAfterDays)}</p>
      {view.questions.length > 0 ? <AutoQuestions c={c} questions={view.questions} engines={names} /> : <p className="mt-2 text-caption text-contrast-ink/75">{c.autoNoQuestions}</p>}
      {view.range.max > 0 && <p className="mt-2 text-caption text-contrast-ink/65">{c.autoAdminPlans(view.range.min, view.range.max)}</p>}
    </div>
  )
}

/** Fewer checks than this draw a flat, meaningless line, so the chart waits for the third. */
export const TREND_MIN_POINTS = 3

/**
 * The score after each check, on a fixed 0-100 scale (it is a share, so the
 * axis never zooms into noise). A 2px line over a faint area, a dot per check,
 * and one hover target per check, wider than its dot, that names the score and
 * the date. Time runs left to right in both languages, like the numbers.
 */
function ScoreTrend({ points, c, language }: { points: AiOverview['trend']; c: Copy; language: Locale }) {
  const [active, setActive] = useState<number | null>(null)
  const n = points.length
  const x = (i: number) => (n === 1 ? 50 : 4 + (i / (n - 1)) * 92)
  const y = (s: number) => 8 + (1 - s / 100) * 84
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.score).toFixed(2)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(2)},92 L${x(0).toFixed(2)},92 Z`
  const shown = active ?? n - 1
  const tip = points[shown]
  return (
    <figure className="min-w-0" data-ai-trend={n}>
      <figcaption className="flex items-baseline justify-between gap-3 text-caption">
        <span className="font-medium text-contrast-ink/80">{c.trendLabel}</span>
        <span className="text-contrast-ink/50">{c.trendNote(n)}</span>
      </figcaption>
      <div className="relative mt-2 h-20" dir="ltr" onMouseLeave={() => setActive(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <line x1="0" x2="100" y1={y(50)} y2={y(50)} className="stroke-contrast-ink/10" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1="92" y2="92" className="stroke-contrast-ink/20" vectorEffect="non-scaling-stroke" />
          <path d={area} className="fill-contrast-ink/[0.07]" />
          <path d={line} fill="none" className="stroke-contrast-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-pill ring-2 ring-contrast transition-transform',
              i === shown ? 'scale-150 bg-contrast-ink' : 'bg-contrast-ink/70',
            )}
            style={{ left: `${x(i)}%`, top: `${y(p.score)}%` }}
          />
        ))}
        {/* One hit target per check, the full height and its share of the width. */}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => (
            <button
              key={i}
              type="button"
              className="h-full flex-1 cursor-default focus-visible:outline-none"
              aria-label={c.trendPoint(p.score, formatWhen(p.at, language))}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </div>
        {tip && (
          <div
            role="status"
            className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-control bg-contrast-ink px-2 py-1 text-caption font-medium text-contrast shadow-pop"
            style={{ left: `${Math.min(84, Math.max(16, x(shown)))}%` }}
            hidden={active === null}
          >
            <span className="tabular-nums">{tip.score}</span>
            <span className="ms-1.5 font-normal opacity-70">{formatWhen(tip.at, language)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}

function Figure({ label, help, value, note }: { label: string; help: string; value: number | null; note: string | null }) {
  return (
    <div className="min-w-0 rounded-control border border-contrast-ink/10 bg-contrast-ink/[0.04] p-3" title={help}>
      <dt className="truncate text-caption text-contrast-ink/70">{label}</dt>
      <dd className="mt-1">
        <span className="block text-section font-semibold sm:text-title leading-tight">{value ?? '–'}</span>
        <span className="block truncate text-caption text-contrast-ink/60">{note ?? help}</span>
      </dd>
    </div>
  )
}

/** "−5 נק׳" / "+3 pts": the signed number as an isolated LTR run, the unit after it in the page's own direction. */
export function ChangePoints({ text }: { text: string }) {
  const [num, ...unit] = text.split(' ')
  return <span className="whitespace-nowrap tabular-nums" data-ai-change-points=""><bdi dir="ltr">{num}</bdi>{unit.length > 0 ? ` ${unit.join(' ')}` : ''}</span>
}

function ChangeFigure({ c, data, language }: { c: Copy; data: AiOverview | null; language: Locale }) {
  const change = data?.change ?? null
  const dir = !change ? null : change.points > 0 ? 'up' : change.points < 0 ? 'down' : 'flat'
  const Icon = dir === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <div className="col-span-2 min-w-0 rounded-control border border-contrast-ink/10 bg-contrast-ink/[0.04] p-3 sm:col-span-1" title={c.changeLabel} data-ai-change={dir ?? 'none'}>
      <dt className="truncate text-caption text-contrast-ink/70">{c.changeLabel}</dt>
      <dd className="mt-1">
        {change && (dir === 'up' || dir === 'down') ? (
          <>
            {/* The direction on the soft ok/bad pair: the tokens stay readable on the navy band. */}
            <span
              // Joined by hand: tailwind-merge would drop text-section next to a text colour.
              className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-section font-semibold leading-tight ${
                dir === 'up' ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'
              }`}
            >
              <Icon size={16} strokeWidth={2.5} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
              {/* The number is its own left-to-right run, so the sign stays before the digits in Hebrew ("−5", not "5−"). */}
              <ChangePoints text={c.changePoints(change.points)} />
              <span className="sr-only">{dir === 'up' ? c.changeUp : c.changeDown}</span>
            </span>
            <span className="mt-1 block truncate text-caption text-contrast-ink/60">
              {change.since ? c.changeSince(formatWhen(change.since, language, true)) : ''}
            </span>
          </>
        ) : change && dir === 'flat' ? (
          // No change is said in words; a "0" with a dash reads like a missing value.
          <>
            <span className="block text-section font-semibold leading-tight">{c.changeFlat}</span>
            <span className="block truncate text-caption text-contrast-ink/60">
              {change.since ? c.changeSince(formatWhen(change.since, language, true)) : ''}
            </span>
          </>
        ) : (
          <>
            <span className="block text-section font-semibold sm:text-title leading-tight">–</span>
            <span className="block truncate text-caption text-contrast-ink/60">{c.changeNone}</span>
          </>
        )}
      </dd>
    </div>
  )
}

// ── Row 4 ────────────────────────────────────────────────────────────────────

const OUTCOME_STYLE: Record<RecentOutcome, { Icon: typeof CheckCircle2; className: string }> = {
  cited: { Icon: Quote, className: 'bg-ok-soft text-ok' },
  mentioned: { Icon: CheckCircle2, className: 'bg-ok-soft text-ok' },
  not_mentioned: { Icon: CircleDashed, className: 'bg-sunk text-muted' },
  failed: { Icon: XCircle, className: 'bg-warn-soft text-warn' },
  running: { Icon: Loader2, className: 'bg-info-soft text-info' },
}

export function RecentActivity({ overview }: { overview: OverviewData }) {
  const { c, language } = useCopy()
  const data = overview && overview !== 'error' ? overview : null
  // Tab walk: before the first check the opening card already says nothing
  // was checked yet, so an empty "recent activity" card only repeated it.
  if (data && data.recent.length === 0) return null
  return (
    <section
      aria-labelledby="ai-activity-title"
      data-ai-activity={overview === null ? 'loading' : overview === 'error' ? 'error' : data && data.recent.length > 0 ? 'ready' : 'empty'}
      className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <h2 id="ai-activity-title" className="text-section font-semibold text-ink">{c.activityTitle}</h2>
      <p className="mt-0.5 text-caption text-muted">{c.activitySubtitle}</p>

      {overview === null && (
        <ul className="mt-4 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} aria-hidden="true" className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-pill bg-sunk" />
              <div className="h-4 flex-1 rounded-control bg-sunk" />
            </li>
          ))}
        </ul>
      )}
      {overview === 'error' && <p className="mt-4 text-copy text-muted">{c.loadFailed}</p>}
      {data && data.recent.length > 0 && (
        <ol className="mt-3 divide-y divide-line">
          {data.recent.map((item) => {
            const meta = item.engine ? ENGINE_META[item.engine] : undefined
            const style = OUTCOME_STYLE[item.outcome]
            return (
              <li key={item.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border border-line bg-surface" title={meta?.name}>
                  {meta ? <meta.Icon size={16} /> : <CircleDashed size={16} className="text-muted" aria-hidden="true" />}
                  <span className="sr-only">{meta?.name ?? ''}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="line-clamp-2 text-copy text-ink rtl:text-right ltr:text-left">{item.question ?? c.activityQuestionMissing}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                    <span className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-medium', style.className)}>
                      <style.Icon size={12} aria-hidden="true" className={item.outcome === 'running' ? 'animate-spin' : undefined} />
                      {c.outcome[item.outcome]}
                    </span>
                    <span>{meta?.name}</span>
                    {item.automatic && (
                      <span data-ai-run-automatic="" className="inline-flex items-center rounded-pill border border-line px-2 py-0.5 font-medium text-body">{c.autoTag}</span>
                    )}
                    {item.at && <span aria-hidden="true">·</span>}
                    {item.at && <time dateTime={item.at}>{formatWhen(item.at, language)}</time>}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
