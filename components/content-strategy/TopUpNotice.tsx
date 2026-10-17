'use client'

/**
 * "New topics we prepared for you this month": the topics the monthly top-up added
 * to the plan (lib/content/automation/topic-topup.ts), where each came from, and that
 * none repeats a page the site already has. Shown only when there is one this month;
 * closing it is remembered for the project and the month (this browser only).
 * The topics themselves are on the board as any approved topic, where each can be
 * removed.
 */

import { useMemo, useState } from 'react'
import Notice from '@/components/ui/Notice'
import type { StrategyData } from '@/lib/content/strategy/board'
import { preparedThisMonth, topUpDismissKey } from '@/lib/content/strategy/topup-notice'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Dict = ReturnType<typeof getDashboardDictionary>

function readDismissed(key: string): boolean {
  try { return window.localStorage.getItem(key) === '1' } catch { return false }
}

export default function TopUpNotice({ data, projectId, dict }: { data: StrategyData | null; projectId: string | null; dict: Dict }) {
  const s = dict.contentStrategy.topup
  const now = useMemo(() => new Date(), [])
  const key = projectId ? topUpDismissKey(projectId, now) : null
  const [dismissed, setDismissed] = useState(() => (key && typeof window !== 'undefined' ? readDismissed(key) : false))
  const prepared = useMemo(() => {
    if (!data) return []
    const written = new Set(data.articles.map((a) => a.topicId).filter((id): id is string => !!id))
    return preparedThisMonth(data.topics, written, now)
  }, [data, now])

  if (!key || dismissed || prepared.length === 0) return null
  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(key, '1') } catch { /* remembered for this visit only */ }
  }
  const body = prepared.length === 1 ? s.bodyOne : s.body.replace('{count}', String(prepared.length))

  return (
    <Notice
      tone="ok"
      onDismiss={dismiss}
      items={prepared.map((p) => (
        <span key={p.id} className="text-ink">
          {p.title}
          <span className="ms-2 inline-flex items-center rounded-pill border border-line bg-surface px-2 py-0.5 text-caption text-muted">{s.origins[p.origin]}</span>
        </span>
      ))}
    >
      <p className="font-semibold text-ink">{s.title}</p>
      <p className="max-w-prose text-caption text-body">{body}</p>
    </Notice>
  )
}
