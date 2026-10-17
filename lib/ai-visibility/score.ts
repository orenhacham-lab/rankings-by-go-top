/**
 * THE AI visibility score, one definition for every screen that shows it.
 *
 * The owner saw four different numbers for one question: the AI tab counted
 * every answer ever received, the dashboard counted only the newest single
 * check (one question on one engine, so always 0 or 100), the engine cards
 * counted all answers per engine, and the competitor comparison counted the
 * latest answer per question and engine. Now every one of them counts the same
 * thing:
 *
 *   THE CURRENT PICTURE. For each question on each engine, only its LATEST
 *   successful answer counts (an archived answer never counts). The denominator
 *   is the question x engine pairs actually checked, never engines that were
 *   not; the score is the share of those answers that mentioned the business,
 *   0-100, and null before the first answer.
 *
 * So checking the same question twice replaces its answer instead of adding
 * one, and an engine nobody ran is "not checked", not a zero.
 *
 * Pure functions over rows the callers already read; nothing here reads,
 * writes or spends.
 */

export type ScoredAnswer = {
  /** The answer's own id, used as the question when the answer has none (legacy rows). */
  id?: string | null
  promptId: string | null
  engine: string
  /** When the answer was received; the newest one per question x engine counts. */
  at: string | null
  status: string | null
  excluded?: boolean
  mentioned: boolean
  cited: boolean
}

export type VisibilityScore = {
  /** Question x engine pairs with a counted answer. */
  answers: number
  mentions: number
  citations: number
  /** 0-100, or null before the first answer. */
  score: number | null
  /** Engines with at least one counted answer. */
  engines: string[]
}

/**
 * The engines the score counts: the ones the tool can check today. Answers from
 * retired engines (google_ai_overview) stay in the history but never in a score.
 */
export const SCORED_ENGINES = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode'] as const

export const isScoredEngine = (engine: string | null | undefined): boolean =>
  (SCORED_ENGINES as readonly string[]).includes(engine ?? '')

const time = (at: string | null) => Date.parse(at ?? '') || 0

/** The answers that count: successful, not archived, on a scored engine, the latest per question x engine (newest first). */
export function latestAnswers<T extends ScoredAnswer>(answers: readonly T[]): T[] {
  const counted = answers.filter((a) => a.status === 'success' && a.excluded !== true && isScoredEngine(a.engine))
  // Stable: of two answers with the same time, the one listed first wins.
  const ordered = counted.map((a, i) => ({ a, i })).sort((x, y) => time(y.a.at) - time(x.a.at) || x.i - y.i).map((x) => x.a)
  const seen = new Set<string>()
  const out: T[] = []
  for (const a of ordered) {
    const key = `${a.promptId || `answer:${a.id ?? out.length}`}\u0000${a.engine}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

export function visibilityScore(answers: readonly ScoredAnswer[]): VisibilityScore {
  const latest = latestAnswers(answers)
  const mentions = latest.filter((a) => a.mentioned).length
  const citations = latest.filter((a) => a.cited).length
  return {
    answers: latest.length,
    mentions,
    citations,
    score: latest.length > 0 ? Math.round((mentions / latest.length) * 100) : null,
    engines: [...new Set(latest.map((a) => a.engine))],
  }
}

/** Per engine, the same count: answers checked on it and how many mentioned the business. */
export function engineScores(answers: readonly ScoredAnswer[]): Map<string, { answers: number; mentions: number; citations: number; rate: number }> {
  const out = new Map<string, { answers: number; mentions: number; citations: number; rate: number }>()
  for (const a of latestAnswers(answers)) {
    const e = out.get(a.engine) ?? { answers: 0, mentions: 0, citations: 0, rate: 0 }
    e.answers++
    if (a.mentioned) e.mentions++
    if (a.cited) e.citations++
    e.rate = Math.round((e.mentions / e.answers) * 100)
    out.set(a.engine, e)
  }
  return out
}
