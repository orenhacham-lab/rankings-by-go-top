/**
 * "You vs. your competitors" on the same keywords, built from what the rank scan
 * recorded (lib/competitors/scan-positions.ts). Pure: no I/O, so the keywords
 * tab, the dashboard card and the QA suite all compute it the same way.
 *
 * ONE RESULT PAGE, NEVER TWO. A keyword's competitor positions are read only
 * from the rows written for the SAME check as the position the table shows for
 * the keyword: matched on (tracking_target_id, checked_at). A check from before
 * the competitors were added, or one whose rows were not recorded, says so
 * ("not recorded") instead of borrowing another day's page.
 *
 * AHEAD OF YOU means the competitor has a position (1-20) and the project either
 * has none in that check or a lower one (a larger number). A competitor outside
 * the top 20 is never counted as ahead: where it stands there is not known.
 */
import { normalizeCompetitorDomains, COMPETITOR_TOP_N } from '@/lib/scanner/competitor-positions'

/** A competitor the project tracks today, with its domain normalized like the scanner's. */
export interface TrackedCompetitor {
  name: string
  domain: string
}

/** The keyword's latest check, as the keywords table shows it. */
export interface OwnCheck {
  targetId: string
  engine: string
  checkedAt: string | null
  found: boolean
  position: number | null
}

/** A keyword_competitor_positions row, as read by the owner. */
export interface CompetitorPositionRow {
  tracking_target_id: string
  competitor_domain: string
  position: number | null
  url: string | null
  checked_at: string
}

export interface CompetitorEntry {
  domain: string
  name: string
  /** 1-20, or null when the competitor was not in the top 20 of that check. */
  position: number | null
  url: string | null
  /** Where it stands against the project in that check; 'unknown' outside the top 20. */
  relation: 'above' | 'below' | 'same' | 'unknown'
  aheadOfYou: boolean
}

export type KeywordCompetitorCell =
  /** Competitors are compared on Google organic results only (not Maps). */
  | { kind: 'not_organic' }
  /** The keyword has not been checked yet. */
  | { kind: 'not_checked' }
  /** The latest check recorded no competitor positions. */
  | { kind: 'not_recorded' }
  /** Recorded, and none of the competitors is in the top 20. */
  | { kind: 'none_in_top20'; entries: CompetitorEntry[] }
  /** The best-placed competitor of that check, and every competitor recorded in it. */
  | { kind: 'best'; best: CompetitorEntry; entries: CompetitorEntry[] }

export interface CompetitorStanding {
  domain: string
  name: string
  /** Keywords on which this competitor ranks above the project. */
  ahead: number
  /** Keywords whose latest check recorded this competitor: the "of N". */
  compared: number
}

export interface CompetitorComparison {
  cells: Record<string, KeywordCompetitorCell>
  /** One per tracked competitor: most keywords ahead of you first. */
  standings: CompetitorStanding[]
  /** Keywords whose latest check recorded at least one competitor. */
  comparedKeywords: number
}

/**
 * The competitors a comparison can use: active, with a domain, normalized exactly
 * as the scanner normalizes the project's own domain, one per domain.
 */
export function trackedCompetitorsFrom(
  rows: ReadonlyArray<{ name?: unknown; domain?: unknown; is_active?: unknown }> | null | undefined,
): TrackedCompetitor[] {
  const out: TrackedCompetitor[] = []
  for (const row of rows ?? []) {
    if (row?.is_active === false || typeof row?.domain !== 'string') continue
    const [domain] = normalizeCompetitorDomains([row.domain])
    if (!domain || out.some((c) => c.domain === domain)) continue
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : domain
    out.push({ name, domain })
  }
  return out
}

/** The ranking page as a link the screen may open: http(s) only, anything else is shown as text. */
function webLink(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url) ? url : null
}

/** True when both are the same instant, whatever the two strings' formats. */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const x = Date.parse(a)
  return Number.isFinite(x) && x === Date.parse(b)
}

function validPosition(position: unknown): number | null {
  return Number.isInteger(position) && (position as number) >= 1 && (position as number) <= COMPETITOR_TOP_N
    ? (position as number)
    : null
}

/** Where a competitor at `competitorPosition` stands against the project's own result of the same check. */
export function relationToYou(
  competitorPosition: number | null,
  own: { found: boolean; position: number | null },
): CompetitorEntry['relation'] {
  if (competitorPosition == null) return 'unknown'
  if (!own.found || own.position == null) return 'above'
  if (competitorPosition < own.position) return 'above'
  return competitorPosition > own.position ? 'below' : 'same'
}

/** A competitor at `competitorPosition` ranks above the project's own result of the same check. */
export function isAheadOfYou(
  competitorPosition: number | null,
  own: { found: boolean; position: number | null },
): boolean {
  return relationToYou(competitorPosition, own) === 'above'
}

export function buildCompetitorComparison(input: {
  competitors: readonly TrackedCompetitor[]
  checks: readonly OwnCheck[]
  rows: readonly CompetitorPositionRow[]
}): CompetitorComparison {
  const byDomain = new Map(input.competitors.map((c) => [c.domain, c]))
  const rowsByTarget = new Map<string, CompetitorPositionRow[]>()
  for (const row of input.rows) {
    if (!byDomain.has(row.competitor_domain)) continue
    const list = rowsByTarget.get(row.tracking_target_id)
    if (list) list.push(row)
    else rowsByTarget.set(row.tracking_target_id, [row])
  }

  const tally = new Map(input.competitors.map((c) => [c.domain, { ahead: 0, compared: 0 }]))
  const cells: Record<string, KeywordCompetitorCell> = {}
  let comparedKeywords = 0

  for (const check of input.checks) {
    if (check.engine !== 'google_search') { cells[check.targetId] = { kind: 'not_organic' }; continue }
    if (!check.checkedAt) { cells[check.targetId] = { kind: 'not_checked' }; continue }

    const own = { found: check.found, position: check.found ? check.position : null }
    const sameCheck = (rowsByTarget.get(check.targetId) ?? []).filter((r) => sameInstant(r.checked_at, check.checkedAt))
    const entries: CompetitorEntry[] = []
    for (const competitor of input.competitors) {
      const row = sameCheck.find((r) => r.competitor_domain === competitor.domain)
      if (!row) continue
      const position = validPosition(row.position)
      const relation = relationToYou(position, own)
      entries.push({
        domain: competitor.domain,
        name: competitor.name,
        position,
        url: position != null ? webLink(row.url) : null,
        relation,
        aheadOfYou: relation === 'above',
      })
    }
    if (entries.length === 0) { cells[check.targetId] = { kind: 'not_recorded' }; continue }

    comparedKeywords++
    for (const entry of entries) {
      const t = tally.get(entry.domain)!
      t.compared++
      if (entry.aheadOfYou) t.ahead++
    }
    const ranked = entries.filter((e) => e.position != null).sort((a, b) => (a.position as number) - (b.position as number))
    cells[check.targetId] = ranked.length > 0
      ? { kind: 'best', best: ranked[0], entries }
      : { kind: 'none_in_top20', entries }
  }

  const standings = input.competitors
    .map((c, order) => ({ order, standing: { domain: c.domain, name: c.name, ...tally.get(c.domain)! } }))
    .sort((a, b) => b.standing.ahead - a.standing.ahead || b.standing.compared - a.standing.compared || a.order - b.order)
    .map((x) => x.standing)

  return { cells, standings, comparedKeywords }
}
