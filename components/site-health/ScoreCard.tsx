'use client'

/**
 * The top of the screen: the site, its score on a ring, what the score means in
 * one line, the tally by severity, and — one click away — exactly how the score
 * is computed. Light surface, one accent (the ring's colour follows the band).
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import SiteAvatar from '@/components/ui/SiteAvatar'
import CountUp from '@/components/ui/CountUp'
import { cn } from '@/lib/utils'
import { scoreBand, type ScoreBand } from '@/lib/site-health/rules'
import type { Severity, SiteHealthReport } from '@/lib/site-health/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

type Copy = DashboardDictionary['siteHealth']

const BAND_TONE: Record<ScoreBand, string> = {
  excellent: 'text-ok',
  good: 'text-ok',
  fair: 'text-warn',
  poor: 'text-bad',
}
const SEVERITY_DOT: Record<Severity, string> = { urgent: 'bg-bad', important: 'bg-warn', minor: 'bg-info' }

/** The ring: a quiet track and the score's arc, drawn from the top, clockwise. */
function ScoreRing({ score, band, label, outOf }: { score: number; band: ScoreBand; label: string; outOf: string }) {
  const size = 148
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      className="relative grid size-[148px] shrink-0 place-items-center"
      dir="ltr"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-sunk" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={cn('score-arc', BAND_TONE[band])}
        />
      </svg>
      <div className="relative text-center">
        <p className="text-[2.75rem] font-semibold leading-none tracking-tight text-ink tabular-nums">
          <CountUp value={score}>{score}</CountUp>
        </p>
        <p className="mt-1.5 text-caption font-medium text-muted">{outOf}</p>
      </div>
    </div>
  )
}

export default function ScoreCard({
  report, copy, domain, siteIcon, checkedAt, fixableCount, live, action,
}: {
  report: SiteHealthReport
  copy: Copy
  domain: string
  siteIcon?: string | null
  checkedAt: string
  fixableCount: number
  /** The score with the applied fixes counted (scoreWithFixes); absent = the scan's own score. */
  live?: { score: number; fixedPages: number; base: number }
  /** "Check again", at the card's top end. */
  action?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const score = live ? live.score : report.score
  const gained = live ? live.score - live.base : 0
  const band = scoreBand(score)
  const tally: Record<Severity, number> = { urgent: 0, important: 0, minor: 0 }
  for (const f of report.findings) tally[f.severity]++

  return (
    <section
      aria-labelledby="site-health-score"
      data-site-health="score"
      className="rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 lg:p-8">
        <div className="self-center sm:self-auto">
          <ScoreRing score={score} band={band} label={copy.score.label} outOf={copy.score.outOf} />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <SiteAvatar domain={domain} icon={siteIcon} size="sm" />
              <p className="min-w-0 truncate text-copy font-medium text-body" dir="ltr">{domain}</p>
            </div>
            {action && <div className="hidden shrink-0 sm:block">{action}</div>}
          </div>
          <h2 id="site-health-score" className="mt-3 text-title font-semibold tracking-tight text-ink text-balance">
            {copy.score.band[band]}
          </h2>
          <p className="mt-1 text-copy text-muted">
            {copy.counts.findings(report.findings.length)}
            {fixableCount > 0 && <> · <span className="font-medium text-action">{copy.counts.fixable(fixableCount)}</span></>}
          </p>
          {live && live.fixedPages > 0 && (
            <p className="mt-2 inline-flex flex-wrap items-center justify-center gap-x-1.5 rounded-control bg-ok-soft px-2.5 py-1 text-caption font-medium text-ink" data-site-health-gain={gained}>
              {copy.score.afterFixes(gained, live.fixedPages)}
            </p>
          )}
          <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 sm:justify-start" aria-label={copy.score.label}>
            {(['urgent', 'important', 'minor'] as const).map((s) => (
              <li key={s} className="flex items-center gap-2 text-copy text-body">
                <span aria-hidden="true" className={cn('size-2 rounded-full', SEVERITY_DOT[s])} />
                <span className="font-semibold tabular-nums text-ink">{tally[s]}</span>
                <span className="text-muted">{copy.severity[s]}</span>
              </li>
            ))}
          </ul>
          {/* On a phone the action closes the card, full width, under what it acts on. */}
          {action && <div className="mt-6 sm:hidden [&>*]:w-full">{action}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-6 py-3.5 lg:px-8">
        <p className="text-caption text-muted">
          {checkedAt} · {copy.pagesChecked(report.pagesChecked)}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-health-how"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-control text-caption font-semibold text-action hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {copy.score.howTitle}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={cn('transition-transform duration-200 ease-snappy', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div id="site-health-how" className="border-t border-line bg-sunk/60 px-6 py-4 motion-safe:animate-pop-in lg:px-8">
          <p className="max-w-3xl text-copy text-body text-pretty">{copy.score.how}</p>
        </div>
      )}
      {report.partial && (
        <p className="border-t border-line px-6 py-3 text-caption text-muted lg:px-8">{copy.partial}</p>
      )}
    </section>
  )
}
