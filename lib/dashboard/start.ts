/**
 * The dashboard of a project that has nothing to show yet, and which widgets a
 * dashboard shows at all.
 *
 * A NEW project (no keyword checked yet, no article) used to open on about a
 * dozen cards, each empty, dashed and offering its own button, plus skeleton
 * lines that never filled. It now opens on ONE card, "Start here": three steps,
 * each one's state read from what is really stored (the site's scan, the
 * publishing connection, the first article), and each one linking to the
 * screen that does it. A widget appears when it has something to show.
 *
 * Pure: no React, no I/O (lib/shell/__qa__/shell-motion.qa.ts).
 */

export type StartStepKey = 'scan' | 'keywords' | 'connect' | 'article'
export type StartStepState = 'done' | 'running' | 'open'
export interface StartStep { key: StartStepKey; state: StartStepState }

export interface StartInput {
  /**
   * The site's scan (lib/project-mapping/state.ts): null while unknown, 'off' when
   * the scan cannot be offered to this account (then the first step is choosing
   * keywords by hand instead).
   */
  scan: 'done' | 'running' | 'open' | 'off' | null
  /** Active keywords. */
  tracked: number
  /** A publishing platform is connected; null when unknown (the facts failed to load). */
  platform: boolean | null
  /** Articles of the project; null when the content module is off. */
  articles: number | null
}

/**
 * The steps, in order. The first is the scan (or, without one, choosing
 * keywords); then connecting the site and the first article, which both need
 * the content module; without it, choosing keywords follows the scan.
 */
export function startSteps(input: StartInput): StartStep[] {
  const keywords: StartStep = { key: 'keywords', state: input.tracked > 0 ? 'done' : 'open' }
  const first: StartStep = input.scan === 'off' || input.scan === null
    ? keywords
    : { key: 'scan', state: input.scan }
  if (input.articles === null) return first.key === 'scan' ? [first, keywords] : [first]
  return [
    first,
    { key: 'connect', state: input.platform ? 'done' : 'open' },
    { key: 'article', state: input.articles > 0 ? 'done' : 'open' },
  ]
}

/** The one step the card's main button is for: the first that is not done. */
export function nextStartStep(steps: readonly StartStep[]): StartStep | null {
  return steps.find((s) => s.state === 'open') ?? null
}

/**
 * Whether the dashboard opens on "Start here": nothing to show yet (no keyword
 * has been checked, no article exists) and a step still open. Once a keyword has
 * a position or an article exists, the dashboard shows its figures, and the
 * setup checklist beside them carries whatever is left.
 */
export function isStartMode(input: { checked: number; articles: number | null; steps: readonly StartStep[] }): boolean {
  if (input.checked > 0 || (input.articles ?? 0) > 0) return false
  return input.steps.some((s) => s.state !== 'done')
}

/** Done steps out of all, for the card's progress line. */
export function startProgress(steps: readonly StartStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.state === 'done').length, total: steps.length }
}

// ── Which widgets are shown ──────────────────────────────────────────────────

/**
 * What a widget has: its data, nothing (yet), a failed read, or a read still in
 * flight. Every read on the dashboard is bounded (15 seconds at most), so
 * 'loading' always ends as one of the other three.
 */
export type WidgetData = 'data' | 'empty' | 'error' | 'loading'

/**
 * A widget is shown when it has something to show: its data, or a failed read
 * with its retry (hiding a failure would read as "nothing here", which is not
 * known). An empty widget is not shown, and neither is one still loading: it
 * appears, with its entrance, when its data arrives, instead of a skeleton that
 * might turn into nothing.
 */
export function showWidget(data: WidgetData): boolean {
  return data === 'data' || data === 'error'
}

/** A dashboard route section → what its widget has. `hasData` decides on a ready section. */
export function sectionData<T>(section: { state: 'ready'; data: T } | { state: 'error' } | { state: 'disabled' } | null, hasData: (data: T) => boolean): WidgetData {
  if (!section) return 'loading'
  if (section.state === 'error') return 'error'
  if (section.state === 'disabled') return 'empty'
  return hasData(section.data) ? 'data' : 'empty'
}
