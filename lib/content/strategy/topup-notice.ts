/**
 * "New topics we prepared for you this month": which topics the strategy tab's notice
 * lists (components/content-strategy/TopUpNotice.tsx). PURE.
 *
 * A topic is listed when the monthly top-up prepared it (StrategyTopic.autoPrepared,
 * from lib/content/automation/topic-topup.ts) in the viewer's current calendar month
 * and it has no article yet, newest first. Where it came from is the source of the
 * plan's idea it was made from, in three words the merchant knows.
 */
import type { StrategyTopic } from './board'

export type TopUpOrigin = 'scan' | 'research' | 'keywords' | 'plan'

export function topUpOrigin(source: string | null | undefined): TopUpOrigin {
  if (source === 'site_scan' || source === 'hybrid') return 'scan'
  if (source === 'keyword_research_url') return 'research'
  if (source === 'keyword') return 'keywords'
  return 'plan'
}

export interface PreparedTopic { id: string; title: string; origin: TopUpOrigin; at: string }

export function preparedThisMonth(
  topics: readonly StrategyTopic[],
  writtenTopicIds: ReadonlySet<string>,
  now: Date,
): PreparedTopic[] {
  const y = now.getFullYear(), m = now.getMonth()
  const out: PreparedTopic[] = []
  for (const t of topics) {
    const p = t.autoPrepared
    if (!p) continue
    const at = new Date(p.at)
    if (Number.isNaN(at.getTime()) || at.getFullYear() !== y || at.getMonth() !== m) continue
    if (t.status === 'used' || t.status === 'rejected' || writtenTopicIds.has(t.id)) continue
    out.push({ id: t.id, title: t.title, origin: topUpOrigin(p.source), at: p.at })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/** The key the notice's "close" is remembered under: one per project and month. */
export function topUpDismissKey(projectId: string, now: Date): string {
  return `gotop:topup-notice:${projectId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
