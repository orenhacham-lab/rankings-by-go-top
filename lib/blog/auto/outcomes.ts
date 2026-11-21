/**
 * WHAT HAPPENED TO AN ARTICLE AFTER IT WAS PUBLISHED, AND WHAT TO DO ABOUT IT.
 *
 * The blog writes one article per language per day and then never looks at it:
 * measured 21 Nov 2026, 4 of the 221 published articles had ever been updated,
 * and nothing in the system reads Search Console for our own property although
 * the same data is synced for 28 customer projects. 221 articles, 26,170
 * impressions, ONE click.
 *
 * This module is the part that reads the outcome. It is deliberately pure — GSC
 * rows and plan rows in, a verdict per article out — because a learning loop
 * that cannot be exercised without the live API is a loop nobody can trust.
 *
 * THE VERDICTS ARE RULES, NOT A MODEL. "The generator learns to write better"
 * is not a mechanism; it is a wish. What a daily pipeline can actually learn
 * from is four measurable facts about a published page:
 *
 *   improve      it already sits at position 5-25 on a query with real
 *                demand. The article that is nearly there is worth more than
 *                a new one, and a new one would cannibalise it.
 *   retarget     it earns its impressions on a query it was NOT written for.
 *                That query belongs in the article as a heading and in the
 *                plan as a secondary keyword.
 *   drop_family  it has impressions and sits past position 40. At this site's
 *                authority that keyword family is not winnable, and writing
 *                its neighbours is spending a day to repeat the result.
 *   demote_seed  60 days and no impressions at all. Nobody is searching this,
 *                whatever Keyword Planner said.
 *
 * Read on 21 Nov 2026 over the 28-day window, which is the measurement that
 * sets the thresholds below: 24 query-page pairs at positions 1-4 earn 50
 * impressions between them, 39 pairs at 5-10 earn 107, and 18,408 impressions
 * sit at position 41 or worse. So the thresholds are low on purpose — demand
 * at the top of this niche's tail is small, and a floor set for a big site
 * would call the whole blog "no data".
 */
import { keywordOverlap, keywordTokens } from '@/lib/blog/auto/keyword-plan'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'

/** One query-page pair as Search Console reports it. */
export interface OutcomeRow {
  query: string
  page: string
  impressions: number
  clicks: number
  /** The average position over the window, so a low-impression row is noise. */
  position: number
}

export interface ArticleOutcomeInput {
  locale: BlogAutoLocale
  slug: string
  /** The keyword the article was written for, from its blog_plan row. */
  plannedKeyword: string | null
  publishedAt: string | null
  /** The pairs for THIS page only. */
  rows: OutcomeRow[]
}

export type OutcomeVerdict = 'improve' | 'retarget' | 'drop_family' | 'demote_seed' | 'waiting' | 'holding'

export interface ArticleOutcome {
  locale: BlogAutoLocale
  slug: string
  impressions: number
  clicks: number
  /** The best (lowest) average position on any query with real impressions. */
  bestPosition: number | null
  /** The query this page actually earns on, which is often not the planned one. */
  earningQuery: string | null
  verdict: OutcomeVerdict
  /** Why, in the words a report would print. */
  reason: string
  /** For `improve` and `retarget`: the pair the action is about. */
  target: OutcomeRow | null
}

// ── the thresholds, each one set from the 21 Nov 2026 reading ───────────────

/** The band where a page is close enough that improving it can earn a click. */
export const IMPROVE_MIN_POSITION = 5
export const IMPROVE_MAX_POSITION = 25
/** Below this, an average position is one or two impressions of noise. */
export const IMPROVE_MIN_IMPRESSIONS = 10

/** Overlap at or below this means the earning query is a different subject. */
export const RETARGET_MAX_OVERLAP = 0.5
export const RETARGET_MIN_IMPRESSIONS = 20

/** Past this position, with this many impressions, the family is not winnable. */
export const UNWINNABLE_POSITION = 40
export const UNWINNABLE_IMPRESSIONS = 200

/** How long an article is given before silence counts as an answer. */
export const SETTLE_DAYS = 60

const dayMs = 24 * 60 * 60 * 1000

/** The rows that carry enough impressions for their position to mean anything. */
const solid = (rows: OutcomeRow[]): OutcomeRow[] => rows.filter((r) => r.impressions >= IMPROVE_MIN_IMPRESSIONS)

const byImpressions = (rows: OutcomeRow[]): OutcomeRow[] => [...rows].sort((a, b) => b.impressions - a.impressions)

/**
 * The verdict for one article. Pure, and the order of the rules is the order
 * of their value: a page that can be pushed onto page one is worth more than
 * knowing that a keyword family is hopeless.
 */
export function articleOutcome(input: ArticleOutcomeInput, now: number = Date.now()): ArticleOutcome {
  const rows = input.rows.filter((r) => r && r.query && Number.isFinite(r.position))
  const impressions = rows.reduce((n, r) => n + (r.impressions || 0), 0)
  const clicks = rows.reduce((n, r) => n + (r.clicks || 0), 0)
  const meaningful = solid(rows)
  const bestPosition = meaningful.length ? Math.min(...meaningful.map((r) => r.position)) : null
  const top = byImpressions(rows)[0] ?? null
  const earningQuery = top?.query ?? null
  const ageDays = input.publishedAt ? (now - Date.parse(input.publishedAt)) / dayMs : null

  const base = {
    locale: input.locale,
    slug: input.slug,
    impressions,
    clicks,
    bestPosition,
    earningQuery,
  }

  // 1. Nearly there, on a query somebody actually searches.
  const near = byImpressions(meaningful.filter((r) =>
    r.position >= IMPROVE_MIN_POSITION && r.position <= IMPROVE_MAX_POSITION))[0]
  if (near) {
    return {
      ...base,
      verdict: 'improve',
      reason: `position ${near.position.toFixed(1)} on "${near.query}" with ${near.impressions} impressions — improve this article, do not write another`,
      target: near,
    }
  }

  // 2. Earning on something it was not written for.
  // `keywordTokens` drops words of one letter, so a keyword that is all
  // single letters or punctuation leaves nothing to compare and `keywordOverlap`
  // answers 0 — which would read as "a completely different subject" and
  // retarget the article onto the query it already has. Both sides must say
  // something before the comparison means anything.
  const comparable = !!input.plannedKeyword
    && keywordTokens(input.plannedKeyword).length > 0
    && keywordTokens(top?.query ?? '').length > 0
  if (top && comparable && top.impressions >= RETARGET_MIN_IMPRESSIONS && input.plannedKeyword
    && keywordOverlap(top.query, input.plannedKeyword) <= RETARGET_MAX_OVERLAP) {
    return {
      ...base,
      verdict: 'retarget',
      reason: `written for "${input.plannedKeyword}" and earning on "${top.query}" (${top.impressions} impressions) — add that query as a heading and a secondary keyword`,
      target: top,
    }
  }

  // 3. Impressions, and nowhere near the first page.
  if (impressions >= UNWINNABLE_IMPRESSIONS && (bestPosition === null || bestPosition > UNWINNABLE_POSITION)) {
    return {
      ...base,
      verdict: 'drop_family',
      reason: `${impressions} impressions and no query better than position ${bestPosition === null ? '40+' : bestPosition.toFixed(0)} — stop planning this keyword family`,
      target: null,
    }
  }

  // 4. Long enough, and nobody searched it.
  if (impressions === 0 && ageDays !== null && ageDays >= SETTLE_DAYS) {
    return {
      ...base,
      verdict: 'demote_seed',
      reason: `${Math.round(ageDays)} days published and no impressions at all — demote the seed that produced it`,
      target: null,
    }
  }

  if (ageDays !== null && ageDays < SETTLE_DAYS) {
    return { ...base, verdict: 'waiting', reason: `published ${Math.round(ageDays)} days ago — too early to judge`, target: null }
  }

  return { ...base, verdict: 'holding', reason: 'nothing to act on', target: null }
}

/**
 * Every article's verdict, most actionable first — the week's table.
 *
 * Sorted by the impressions of the pair the action is about, so the row at the
 * top is the single change with the most demand behind it, not the article
 * that happens to be newest.
 */
export function outcomeTable(inputs: ArticleOutcomeInput[], now: number = Date.now()): ArticleOutcome[] {
  const order: Record<OutcomeVerdict, number> = {
    improve: 0, retarget: 1, drop_family: 2, demote_seed: 3, waiting: 4, holding: 5,
  }
  return inputs
    .map((input) => articleOutcome(input, now))
    .sort((a, b) => {
      const byVerdict = order[a.verdict] - order[b.verdict]
      if (byVerdict !== 0) return byVerdict
      const ia = a.target?.impressions ?? a.impressions
      const ib = b.target?.impressions ?? b.impressions
      return ib - ia
    })
}

/** How many articles fall under each verdict — the line a weekly report opens with. */
export function outcomeSummary(outcomes: ArticleOutcome[]): Record<OutcomeVerdict, number> {
  const counts: Record<OutcomeVerdict, number> = {
    improve: 0, retarget: 0, drop_family: 0, demote_seed: 0, waiting: 0, holding: 0,
  }
  for (const o of outcomes) counts[o.verdict] += 1
  return counts
}

/**
 * Group the GSC rows by the article they belong to.
 *
 * A page URL carries the language prefix and the slug, and nothing else is
 * needed: `https://www.gotopseo.com/ja/articles/foo` is the slug `foo` in `ja`.
 * A query string or a trailing slash does not make it a different page.
 */
export function slugOfArticleUrl(page: string): string | null {
  const match = /\/articles\/([^/?#]+)/.exec(page || '')
  const slug = match?.[1]?.replace(/\/$/, '')
  return slug ? decodeURIComponent(slug) : null
}

export function rowsBySlug(rows: OutcomeRow[]): Map<string, OutcomeRow[]> {
  const bySlug = new Map<string, OutcomeRow[]>()
  for (const row of rows) {
    const slug = slugOfArticleUrl(row.page)
    if (!slug) continue
    const list = bySlug.get(slug)
    if (list) list.push(row)
    else bySlug.set(slug, [row])
  }
  return bySlug
}
