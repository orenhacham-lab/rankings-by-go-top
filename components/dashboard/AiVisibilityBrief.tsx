'use client'

/**
 * Widget 8, AI visibility in brief: the score of the latest check (the share of
 * AI answers that mentioned the business), its mentions and citations, and the
 * change against the check before. Opening the dashboard runs no AI check; the
 * figures are the ones already stored. With AI visibility off on the server the
 * widget is not rendered.
 */
import { Sparkles } from 'lucide-react'
import type { AiData, Section } from '@/lib/dashboard/overview'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { relativeTime } from '@/lib/dashboard/activity'
import { formatCount } from '@/components/gsc/format'
import { cn } from '@/lib/utils'
import { HeaderLink, LinkButton, Widget, WidgetEmpty, WidgetError, WidgetLoading } from './ui'

export default function AiVisibilityBrief({ t, language, section, retry, now }: {
  t: DashboardDictionary['dashboardHome']
  language: 'he' | 'en'
  section: Section<AiData> | null
  retry: () => void
  now: Date
}) {
  const a = t.ai
  const empty = section?.state === 'ready' && section.data.score === null
  const state = !section ? 'loading' : empty ? 'empty' : section.state
  return (
    <Widget id="ai" state={state} title={a.title} subtitle={a.subtitle} icon={<Sparkles size={16} strokeWidth={2} />}
      action={section?.state === 'ready' && !empty ? <HeaderLink href="/ai-visibility">{t.actions.viewAll}</HeaderLink> : undefined}>
      {!section && <WidgetLoading lines={2} label={a.title} />}
      {section?.state === 'error' && <WidgetError message={t.loadError} retryLabel={t.actions.retry} onRetry={retry} />}
      {empty && (
        <WidgetEmpty icon={<Sparkles size={18} strokeWidth={2} />} title={a.emptyTitle} body={a.empty}
          action={<LinkButton href="/ai-visibility" variant="secondary" size="sm">{a.emptyCta}</LinkButton>} />
      )}
      {section?.state === 'ready' && section.data.score !== null && (
        <div>
          <div className="flex items-end justify-between gap-4">
            <p className="flex items-baseline gap-1">
              <span className="text-title font-semibold tabular-nums text-ink">{section.data.score}</span>
              <span className="text-caption text-muted">/100 · {a.score}</span>
            </p>
            {section.data.change !== null && (
              <span className={cn('text-caption font-medium tabular-nums',
                section.data.change > 0 ? 'text-ok' : section.data.change < 0 ? 'text-bad' : 'text-muted')}>
                {a.change(section.data.change)}
              </span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {([['mentions', section.data.mentions], ['citations', section.data.citations]] as const).map(([k, v]) => (
              <div key={k} className="rounded-control bg-sunk/70 px-3 py-2">
                <dt className="text-caption text-muted">{a[k]}</dt>
                <dd className="text-section font-semibold tabular-nums text-ink">{formatCount(v, language)}</dd>
              </div>
            ))}
          </dl>
          {section.data.lastCheckAt && (
            <p className="mt-2 text-caption text-muted">{a.lastCheck(relativeTime(section.data.lastCheckAt, now, language))}</p>
          )}
        </div>
      )}
    </Widget>
  )
}
