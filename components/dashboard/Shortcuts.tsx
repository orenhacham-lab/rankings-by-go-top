'use client'

/**
 * Widget 1, the shortcut row beside the screen's title: keyword research, the
 * publishing schedule and my articles. The two content screens are offered only
 * when the build has the content workspace; otherwise the keywords tab stands in.
 */
import Link from 'next/link'
import { CalendarClock, KeyRound, Lightbulb, Newspaper } from 'lucide-react'
import type { ReactNode } from 'react'
import { CONTENT_ROOT_PATH } from '@/lib/content/content-workspace-nav'
import { STRATEGY_ANCHORS, strategyHref } from '@/lib/content/strategy/view'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

/** Read as literal member expressions, which is what lets Next inline them. */
const FLAGS = {
  NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION,
}

export function contentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true'
}

/** The publishing schedule is the queue section of the content strategy tab's list view, when this build has automation; its topics otherwise. */
export function scheduleHref(): string {
  return strategyHref('list', FLAGS.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION === 'true' ? STRATEGY_ANCHORS.queue : STRATEGY_ANCHORS.topics)
}

export default function Shortcuts({ t }: { t: DashboardDictionary['dashboardHome'] }) {
  const s = t.shortcuts
  const items: { href: string; label: string; icon: ReactNode }[] = [
    { href: '/keyword-research', label: s.research, icon: <Lightbulb size={15} strokeWidth={2} /> },
    ...(contentEnabled()
      ? [
          { href: scheduleHref(), label: s.schedule, icon: <CalendarClock size={15} strokeWidth={2} /> },
          { href: CONTENT_ROOT_PATH, label: s.articles, icon: <Newspaper size={15} strokeWidth={2} /> },
        ]
      : [{ href: '/keywords', label: s.keywords, icon: <KeyRound size={15} strokeWidth={2} /> }]),
  ]
  return (
    <nav aria-label={t.shortcutsLabel} data-dashboard-widget="shortcuts">
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href}
              className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-caption font-medium text-body transition-colors hover:border-line-strong hover:bg-sunk">
              <span aria-hidden="true" className="text-muted">{i.icon}</span>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
