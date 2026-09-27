'use client'

/**
 * One stored monthly report. PRESENTATIONAL: the stored snapshot in, markup out.
 * No fetch, no clock, so the QA suite renders it (filled and empty) as it is.
 *
 *   the month        ink card: the month, how it was made, one sentence, four figures
 *   what climbed     | what slipped
 *   what went live   | AI visibility, Search Console
 *   the plan         for the month after
 *
 * Every section that has nothing to show says why, and what fills it.
 */
import { useState, type ReactNode } from 'react'
import {
  ArrowRight, Bot, CalendarClock, Check, Copy, FileText, LineChart, Search, Sparkles, TrendingDown, TrendingUp,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n/locales'
import type { KeywordMove, MonthlyReportData } from '@/lib/reports/monthly/types'
import { LinkButton, StatusPill, WidgetEmpty } from '@/components/dashboard/ui'
import { SETTINGS_GSC_ANCHOR } from '@/lib/content/content-hub-setup'
import { strategyHref } from '@/lib/content/strategy/view'
import { cn } from '@/lib/utils'
import { count, dayMonth, decimal, monthName, monthlyCopy, monthOnly, type MonthlyCopy } from './copy'
import { headline, plainTextSummary } from './summary'


export interface MonthlyReportViewProps {
  data: MonthlyReportData
  generatedAt: string
  generatedBy: 'cron' | 'owner'
  language: Locale
  projectLabel: string
}

function Section({ id, title, subtitle, icon, children, className }: {
  id: string
  title: string
  subtitle?: string
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section data-monthly-section={id} aria-labelledby={`monthly-${id}-title`}
      className={cn('min-w-0 rounded-card border border-line bg-surface shadow-card', className)}>
      <header className="flex items-start gap-3 px-5 pt-5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-action-soft text-action ring-1 ring-action/10">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 id={`monthly-${id}-title`} className="text-section font-bold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-caption text-muted">{subtitle}</p>}
        </div>
      </header>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  )
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
      <span className="text-caption font-medium text-contrast-ink/75">{label}</span>
      <span className={cn('mt-1 text-metric font-semibold tabular-nums',
        tone === 'up' && 'text-[#86efac]', tone === 'down' && 'text-[#fca5a5]')}>{value}</span>
      {note && <span className="mt-1 text-caption text-contrast-ink/70">{note}</span>}
    </div>
  )
}

function MoveRow({ move, t, direction }: { move: KeywordMove; t: MonthlyCopy; direction: 'up' | 'down' }) {
  const pos = (p: number | null) => (p === null ? t.outside : String(p))
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <bdi className="truncate text-copy font-medium text-ink">{move.keyword}</bdi>
        {move.engine === 'google_maps' && <StatusPill tone="neutral">{t.mapsTag}</StatusPill>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-caption tabular-nums text-muted">
        <span>{pos(move.from)}</span>
        <ArrowRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
        <span className="font-semibold text-ink">{pos(move.to)}</span>
        <StatusPill tone={direction === 'up' ? 'ok' : 'bad'}>
          {direction === 'up' ? '▲' : '▼'} {Math.abs(move.change)}
        </StatusPill>
      </span>
    </li>
  )
}

function Moves({ data, t, l, direction }: { data: MonthlyReportData; t: MonthlyCopy; l: Locale; direction: 'up' | 'down' }) {
  const r = data.rankings
  const moves = direction === 'up' ? r.improved : r.dropped
  const total = direction === 'up' ? r.improvedCount : r.droppedCount
  const icon = direction === 'up' ? <TrendingUp size={16} strokeWidth={2} /> : <TrendingDown size={16} strokeWidth={2} />
  let body: ReactNode
  if (r.state === 'no_keywords') {
    body = <WidgetEmpty icon={<Search size={16} />} body={t.noKeywords} action={<LinkButton href="/keyword-research" size="sm" variant="secondary">{t.noKeywordsAction}</LinkButton>} />
  } else if (r.state === 'no_checks') {
    body = <WidgetEmpty icon={<CalendarClock size={16} />} body={t.noChecks} action={<LinkButton href="/keywords" size="sm" variant="secondary">{t.noChecksAction}</LinkButton>} />
  } else if (moves.length === 0) {
    const compared = r.improvedCount + r.droppedCount + r.steadyCount
    const text = compared === 0 ? t.singleCheck : direction === 'up' ? t.noneImproved(count(r.steadyCount, l)) : t.noneDropped
    body = <WidgetEmpty icon={icon} body={text} />
  } else {
    body = (
      <>
        <ul className="divide-y divide-line">
          {moves.map((m) => <MoveRow key={`${m.keyword}-${m.engine}`} move={m} t={t} direction={direction} />)}
        </ul>
        {total > moves.length && <p className="pt-2 text-caption text-muted">{t.more(String(total - moves.length))}</p>}
      </>
    )
  }
  return (
    <Section id={direction === 'up' ? 'improved' : 'dropped'} title={direction === 'up' ? t.improvedTitle : t.droppedTitle}
      subtitle={r.state === 'ready' ? t.movesSub : undefined} icon={icon}>
      {body}
    </Section>
  )
}

export default function MonthlyReportView({ data, generatedAt, generatedBy, language: l, projectLabel }: MonthlyReportViewProps) {
  const t = monthlyCopy(l)
  const r = data.rankings
  const [copied, setCopied] = useState(false)
  const month = monthName(data.month, l)
  const gscReady = data.gsc.state === 'ready' && data.gsc.current
  const firstPageDelta = r.firstPageStart !== null ? r.firstPageEnd - r.firstPageStart : 0
  const empty = r.state !== 'ready' && data.articles.published === 0 && data.ai.state !== 'ready' && !gscReady

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(plainTextSummary(data, projectLabel, l))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* the clipboard is not available: nothing to undo */ }
  }

  return (
    <article data-monthly-report={data.month} data-empty-month={empty ? 'true' : 'false'} className="animate-pop-in space-y-5">
      <div className="relative isolate overflow-hidden rounded-card bg-contrast p-5 text-contrast-ink shadow-pop sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_16rem_at_85%_-20%,rgb(99_130_246/0.35),transparent_70%)] rtl:bg-[radial-gradient(36rem_16rem_at_15%_-20%,rgb(99_130_246/0.35),transparent_70%)]" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption font-medium text-contrast-ink/70">
              {generatedBy === 'owner' ? t.generatedOwner(dayMonth(generatedAt, l)) : t.generatedAuto(dayMonth(generatedAt, l))}
            </p>
            <h3 className="mt-1 text-title font-bold">{month}</h3>
            <p data-headline="" className="mt-2 max-w-2xl text-[0.9375rem] leading-6 text-contrast-ink/85">{headline(data, l)}</p>
            {data.coversFrom && <p className="mt-2 text-caption text-contrast-ink/70">{t.coversFrom(dayMonth(data.coversFrom, l))}</p>}
          </div>
          <button type="button" onClick={copySummary}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control bg-white/10 px-3 text-caption font-semibold text-contrast-ink ring-1 ring-white/15 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span aria-live="polite">{copied ? t.copied : t.copy}</span>
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label={t.tiles.firstPage}
            value={r.state === 'ready' ? count(r.firstPageEnd, l) : '—'}
            tone={firstPageDelta > 0 ? 'up' : firstPageDelta < 0 ? 'down' : undefined}
            note={r.state !== 'ready' ? t.tiles.noChecks : r.firstPageStart !== null ? t.tiles.wasAtStart(count(r.firstPageStart, l)) : t.tiles.firstPageSource} />
          <Figure label={t.tiles.improved}
            value={r.state === 'ready' ? count(r.improvedCount, l) : '—'}
            tone={r.improvedCount > 0 ? 'up' : undefined}
            note={r.state === 'ready' ? t.tiles.improvedSource(count(r.steadyCount, l)) : t.tiles.noChecks} />
          <Figure label={t.tiles.published} value={count(data.articles.published, l)} note={t.tiles.publishedSource} />
          <Figure label={t.tiles.clicks}
            value={gscReady ? count(data.gsc.current!.clicks, l) : '—'}
            note={gscReady ? t.tiles.clicksSource(dayMonth(data.gsc.current!.startDate, l), dayMonth(data.gsc.current!.endDate, l)) : t.tiles.clicksMissing} />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Moves data={data} t={t} l={l} direction="up" />
        <Moves data={data} t={t} l={l} direction="down" />
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        <Section id="published" title={t.publishedTitle} icon={<FileText size={16} strokeWidth={2} />}>
          {data.articles.items.length === 0 ? (
            <WidgetEmpty icon={<FileText size={16} />} body={t.publishedNone(monthOnly(data.month, l))}
              action={<LinkButton href={strategyHref('board')} size="sm" variant="secondary">{t.publishedAction}</LinkButton>} />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {data.articles.items.map((a, i) => (
                  <li key={`${a.publishedAt}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      {a.url
                        ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-copy font-medium text-ink hover:text-action hover:underline"><bdi>{a.title}</bdi></a>
                        : <bdi className="line-clamp-2 text-copy font-medium text-ink">{a.title}</bdi>}
                      <span className="mt-0.5 block text-caption text-muted">{dayMonth(a.publishedAt, l)}</span>
                    </span>
                    <StatusPill tone="info">{t.channel[a.channel]}</StatusPill>
                  </li>
                ))}
              </ul>
              {data.articles.published > data.articles.items.length && (
                <p className="pt-2 text-caption text-muted">{t.more(String(data.articles.published - data.articles.items.length))}</p>
              )}
            </>
          )}
        </Section>

        <div className="grid gap-5">
          <Section id="ai" title={t.aiTitle} icon={<Bot size={16} strokeWidth={2} />}>
            {data.ai.state !== 'ready' ? (
              <WidgetEmpty icon={<Bot size={16} />} body={t.aiNone}
                action={<LinkButton href="/ai-visibility" size="sm" variant="secondary">{t.aiAction}</LinkButton>} />
            ) : (
              <dl className="grid grid-cols-3 gap-3">
                {[
                  [t.aiAnswers, count(data.ai.answers, l)],
                  [t.aiMentions, `${count(data.ai.mentions, l)}${data.ai.mentionRate !== null ? ` · ${decimal(data.ai.mentionRate, l)}%` : ''}`],
                  [t.aiCitations, count(data.ai.citations, l)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl bg-sunk px-3 py-2.5">
                    <dt className="text-caption text-muted">{label}</dt>
                    <dd className="mt-0.5 text-section font-semibold tabular-nums text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <Section id="gsc" title={t.gscTitle} icon={<LineChart size={16} strokeWidth={2} />}
            subtitle={gscReady ? t.gscWindow(dayMonth(data.gsc.current!.startDate, l), dayMonth(data.gsc.current!.endDate, l)) : undefined}>
            {data.gsc.state === 'not_connected' ? (
              <WidgetEmpty icon={<LineChart size={16} />} body={t.gscNotConnected}
                action={<LinkButton href={`/settings#${SETTINGS_GSC_ANCHOR}`} size="sm" variant="secondary">{t.gscConnect}</LinkButton>} />
            ) : !gscReady ? (
              <WidgetEmpty icon={<LineChart size={16} />} body={t.gscNoData} />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  {([
                    [t.gscClicks, data.gsc.current!.clicks, data.gsc.previous?.clicks],
                    [t.gscImpressions, data.gsc.current!.impressions, data.gsc.previous?.impressions],
                  ] as const).map(([label, value, before]) => (
                    <div key={label} className="min-w-0 rounded-xl bg-sunk px-3 py-2.5">
                      <dt className="text-caption text-muted">{label}</dt>
                      <dd className="mt-0.5 flex flex-wrap items-baseline gap-2">
                        <span className="text-section font-semibold tabular-nums text-ink">{count(value, l)}</span>
                        {typeof before === 'number' && before !== value && (
                          <StatusPill tone={value > before ? 'ok' : 'bad'}>{value > before ? '▲' : '▼'} {count(Math.abs(value - before), l)}</StatusPill>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {data.gsc.previous && (
                  <p className="mt-2 text-caption text-muted">{t.gscVsPrevious(dayMonth(data.gsc.previous.startDate, l), dayMonth(data.gsc.previous.endDate, l))}</p>
                )}
              </>
            )}
          </Section>
        </div>
      </div>

      <Section id="plan" title={t.planTitle(monthOnly(data.plan.month, l))} subtitle={t.planSub} icon={<Sparkles size={16} strokeWidth={2} />}>
        {data.plan.state === 'empty' ? (
          <WidgetEmpty icon={<Sparkles size={16} />} body={t.planEmpty}
            action={<LinkButton href={strategyHref('board')} size="sm" variant="secondary">{t.publishedAction}</LinkButton>} />
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            <PlanList title={t.planScheduled} items={data.plan.scheduled.map((p) => ({ title: p.title, note: p.at ? dayMonth(p.at, l) : null }))}
              extra={[
                data.plan.queuedCount ? t.planQueued(count(data.plan.queuedCount, l)) : null,
                data.plan.readyCount ? t.planReady(count(data.plan.readyCount, l)) : null,
              ]} />
            <PlanList title={t.planApproved} items={data.plan.approvedTopics.map((p) => ({ title: p.title, note: null }))}
              extra={[data.plan.approvedCount > data.plan.approvedTopics.length ? t.more(String(data.plan.approvedCount - data.plan.approvedTopics.length)) : null]} />
            <PlanList title={t.planIdeas} items={data.plan.ideas.map((p) => ({ title: p.title, note: null }))}
              extra={[data.plan.ideasCount > data.plan.ideas.length ? t.more(String(data.plan.ideasCount - data.plan.ideas.length)) : null]} />
          </div>
        )}
      </Section>
    </article>
  )
}

function PlanList({ title, items, extra }: { title: string; items: { title: string; note: string | null }[]; extra: (string | null)[] }) {
  const lines = extra.filter((x): x is string => !!x)
  return (
    <div className="min-w-0">
      <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {items.length === 0 && lines.length === 0 ? (
        <p className="mt-2 text-copy text-muted">—</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 text-copy">
              <bdi className="min-w-0 truncate text-ink">{it.title}</bdi>
              {it.note && <span className="shrink-0 text-caption tabular-nums text-muted">{it.note}</span>}
            </li>
          ))}
          {lines.map((line) => <li key={line} className="text-caption text-muted">{line}</li>)}
        </ul>
      )}
    </div>
  )
}
