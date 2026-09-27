'use client'

/**
 * Widget 7, content opportunities: tracked keywords on Google's pages two and
 * three (positions 11-30), most searched first, each with why it is worth an
 * article and a "Create topic" button.
 *
 * The button adds a suggested topic through the content tab's own route
 * (POST /api/content/topics), which checks the session and the project's owner.
 * A topic costs nothing; writing the article is a separate, explicit step on the
 * topics screen, under the article allowance. Without the content module the
 * rows stay, and the button is not offered.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Lightbulb, Target } from 'lucide-react'
import type { PageTwoKeyword } from '@/lib/dashboard/rankings'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { strategyHref } from '@/lib/content/strategy/view'
import { formatCompact } from '@/components/gsc/format'
import { cn } from '@/lib/utils'
import { HeaderLink, LinkButton, linkButtonClass, Widget, WidgetEmpty } from './ui'

type Copy = DashboardDictionary['dashboardHome']
type CreateState = 'idle' | 'saving' | 'created' | 'failed'

export default function ContentOpportunities({ t, language, projectId, items, canCreateTopics }: {
  t: Copy
  language: 'he' | 'en'
  projectId: string
  items: PageTwoKeyword[]
  canCreateTopics: boolean
}) {
  const o = t.opportunities
  const [created, setCreated] = useState<Record<string, CreateState>>({})

  async function createTopic(item: PageTwoKeyword) {
    setCreated((s) => ({ ...s, [item.targetId]: 'saving' }))
    try {
      const res = await fetch('/api/content/topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, topic: item.keyword, primary_keyword: item.keyword, language }),
      })
      setCreated((s) => ({ ...s, [item.targetId]: res.ok ? 'created' : 'failed' }))
    } catch {
      setCreated((s) => ({ ...s, [item.targetId]: 'failed' }))
    }
  }

  return (
    <Widget id="opportunities" state={items.length ? 'ready' : 'empty'} title={o.title} subtitle={o.subtitle}
      icon={<Lightbulb size={16} strokeWidth={2} />}
      action={items.length && canCreateTopics ? <HeaderLink href={strategyHref('board')}>{t.actions.viewAll}</HeaderLink> : undefined}>
      {items.length === 0 ? (
        <WidgetEmpty
          icon={<Target size={18} strokeWidth={2} />}
          title={o.emptyTitle}
          body={o.empty}
          action={<LinkButton href="/keyword-research" variant="secondary" size="sm">{o.emptyCta}</LinkButton>}
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const state = created[item.targetId] ?? 'idle'
            return (
              <li key={item.targetId} data-opportunity={item.keyword} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-copy font-medium text-ink">
                    <Link href={`/keywords/${encodeURIComponent(item.targetId)}/history`} className="hover:underline">{item.keyword}</Link>
                    <span className="text-caption font-normal tabular-nums text-muted">#{item.position}</span>
                    {item.volume != null && item.volume > 0 && (
                      <span className="text-caption font-normal text-muted">{o.volume(formatCompact(item.volume, language))}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-caption text-muted">{o.why(item.position)}</p>
                  {state === 'failed' && <p role="alert" className="mt-1 text-caption text-bad">{o.failed}</p>}
                </div>
                {canCreateTopics && (
                  state === 'created' ? (
                    <Link href={strategyHref('board')} className="shrink-0 text-caption font-medium text-ok hover:underline">{o.created}</Link>
                  ) : (
                    <button type="button" disabled={state === 'saving'} onClick={() => void createTopic(item)}
                      className={cn(linkButtonClass('secondary', 'sm'), 'shrink-0 disabled:opacity-60')}>
                      {state === 'saving' ? o.creating : o.createTopic}
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Widget>
  )
}
