'use client'

/**
 * "Who you are up against": one card per competitor, next to the site's own card, so
 * the owner sees at a glance who reaches how much of the demand, how much of it they
 * share, what only the competitor reaches (its best such keywords), and, when the
 * project tracks it, on how many tracked keywords it ranks ahead.
 *
 * Every figure comes from landscape.ts (the research and the scan's own findings); a
 * fact the data does not hold is simply not shown.
 */
import { useState } from 'react'
import { ArrowUpRight, Check, Radar } from 'lucide-react'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import SiteAvatar from '@/components/ui/SiteAvatar'
import type { CompetitorInsight, CompetitorLandscape } from './landscape'

/** Cards shown before "show all". */
export const RIVALS_SHOWN = 5

function Bar({ share, className }: { share: number; className: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-pill bg-sunk" aria-hidden="true">
      <span
        className={cn('block h-full rounded-pill transition-[width] duration-700 ease-snappy motion-reduce:transition-none', className)}
        style={{ width: `${Math.max(share > 0 ? 3 : 0, Math.round(share * 100))}%` }}
      />
    </span>
  )
}

function RivalCard({ c, max, index }: { c: CompetitorInsight; max: number; index: number }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).researchInsights.rivals
  const n = (v: number) => formatCount(v, language)
  const sharedPct = c.found > 0 ? (c.shared / c.found) * 100 : 0
  return (
    <li
      data-rival={c.domain}
      className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card motion-safe:animate-pop-in [animation-fill-mode:backwards]"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        <SiteAvatar domain={c.domain} tentative={!c.validated && !c.tracked} />
        <div className="min-w-0 flex-1">
          <p dir="ltr" className="truncate text-start text-copy font-semibold text-ink rtl:text-end">{c.domain}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {c.validated ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-ok-soft px-2 py-0.5 text-overline font-semibold text-ok">
                <Check size={11} strokeWidth={3} aria-hidden="true" />{t.seenIn(n(Math.max(1, c.seenIn)))}
              </span>
            ) : !c.tracked ? (
              <span className="rounded-pill bg-sunk px-2 py-0.5 text-overline font-medium text-muted">{t.suggested}</span>
            ) : null}
            {c.tracked && <span className="rounded-pill bg-info-soft px-2 py-0.5 text-overline font-semibold text-info">{t.tracked}</span>}
          </div>
        </div>
        <a
          href={`https://${c.domain}`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={t.visit(c.domain)}
          className="grid size-8 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          <ArrowUpRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        </a>
      </div>

      {c.found > 0 ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-overline text-muted">{t.found}</dt>
              <dd className="text-metric font-semibold leading-none text-ink tabular-nums">{n(c.found)}</dd>
            </div>
            <div>
              <dt className="text-overline text-muted">{t.searches}</dt>
              <dd className="text-metric font-semibold leading-none text-ink tabular-nums">{n(c.searches)}</dd>
            </div>
          </dl>
          <div className="mt-2"><Bar share={max > 0 ? c.searches / max : 0} className="bg-action/60" /></div>
        </>
      ) : (
        // Honest empty (no 0 / 0 and an empty bar): the research holds none of its keywords.
        <p data-rival-no-overlap="" className="mt-4 text-caption text-muted">{t.noOverlap}</p>
      )}

      {c.found > 0 && (
        <div className="mt-4">
          <span role="img" aria-label={t.overlapLabel(n(c.shared), n(c.gaps))} className="flex h-2 w-full overflow-hidden rounded-pill bg-sunk">
            <span className="h-full bg-action" style={{ width: `${sharedPct}%` }} />
            <span className="h-full bg-warn/70" style={{ width: `${100 - sharedPct}%` }} />
          </span>
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-caption text-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-pill bg-action" />{t.shared(n(c.shared))}</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-pill bg-warn/70" />{t.theirs(n(c.gaps))}</span>
          </p>
        </div>
      )}

      {c.standing ? (
        <p data-rival-standing="" className={cn('mt-3 rounded-inset border-s-[3px] bg-sunk/60 px-2.5 py-1.5 text-caption font-semibold text-ink', c.standing.ahead > 0 ? 'border-s-bad' : 'border-s-ok')}>
          {c.standing.ahead > 0 ? t.ahead(n(c.standing.ahead), n(c.standing.compared)) : t.notAhead(n(c.standing.compared))}
        </p>
      ) : c.tracked ? (
        <p className="mt-3 text-caption text-muted">{t.notCompared}</p>
      ) : null}

      {c.found > 0 && (
        <div className="mt-auto pt-4">
          <p className="text-overline font-semibold text-muted">{t.gapsTitle}</p>
          {c.topGaps.length === 0 ? (
            <p className="mt-1 text-caption text-muted">{t.noGaps}</p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {c.topGaps.map((g) => (
                <li key={g.keyword} className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-warn/20 bg-warn-soft px-2 py-0.5 text-caption text-warn">
                  <span className="truncate">{g.keyword}</span>
                  {g.volume !== null && <span className="shrink-0 font-semibold tabular-nums">{n(g.volume)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

export default function LandscapeRivals({ id, landscape, domain, siteIcon, gapSearches }: {
  id: string
  landscape: CompetitorLandscape
  /** The project's site. */
  domain: string | null
  siteIcon: string | null
  /** The demand only competitors reach, each keyword once. */
  gapSearches: number
}) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).researchInsights
  const t = dict.rivals
  const n = (v: number) => formatCount(v, language)
  const [all, setAll] = useState(false)
  const list = all ? landscape.competitors : landscape.competitors.slice(0, RIVALS_SHOWN)
  const hidden = landscape.competitors.length - list.length

  return (
    <section id={id} data-landscape-rivals="" className="mb-6 scroll-mt-20">
      <Card padding={false}>
        <header className="flex items-start gap-3.5 border-b border-line px-4 py-5 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action" aria-hidden="true">
            <CompetitorIcon size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-section font-semibold text-ink">{t.title}</h2>
            <p className="mt-1 max-w-3xl text-copy text-muted text-pretty">{t.subtitle}</p>
            {landscape.competitors.length > 0 && (
              <p className="mt-2 text-caption font-semibold text-body tabular-nums">{t.summary(n(landscape.competitors.length), n(gapSearches))}</p>
            )}
          </div>
        </header>
        {landscape.competitors.length === 0 ? (
          <p className="px-4 py-6 text-copy text-muted sm:px-6">{t.empty}</p>
        ) : (
          <div className="p-4 sm:p-6">
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {/* The site itself, the yardstick every competitor card is read against. */}
              {domain && (
                <li data-rival-own="" className="flex min-w-0 flex-col rounded-card border border-line border-s-[3px] border-s-action bg-surface p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <SiteAvatar domain={domain} icon={siteIcon} />
                    <div className="min-w-0">
                      <p dir="ltr" className="truncate text-start text-copy font-semibold text-ink rtl:text-end">{domain}</p>
                      <p className="mt-1 inline-flex rounded-pill bg-action px-2 py-0.5 text-overline font-semibold text-action-ink">{dict.yourSite}</p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-overline text-muted">{t.found}</dt>
                      <dd className="text-metric font-semibold leading-none text-ink tabular-nums">{n(landscape.own.found)}</dd>
                    </div>
                    <div>
                      <dt className="text-overline text-muted">{t.searches}</dt>
                      <dd className="text-metric font-semibold leading-none text-ink tabular-nums">{n(landscape.own.searches)}</dd>
                    </div>
                  </dl>
                  <div className="mt-2"><Bar share={landscape.maxSearches > 0 ? landscape.own.searches / landscape.maxSearches : 0} className="bg-action" /></div>
                  <p className="mt-auto flex items-center gap-1.5 pt-4 text-caption text-body">
                    <Radar size={13} aria-hidden="true" className="shrink-0 text-action" />
                    {t.youLine(n(landscape.own.found))}
                  </p>
                </li>
              )}
              {list.map((c, i) => <RivalCard key={c.domain} c={c} max={landscape.maxSearches} index={i + 1} />)}
            </ul>
            {(hidden > 0 || all) && landscape.competitors.length > RIVALS_SHOWN && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setAll((v) => !v)}
                  className="inline-flex h-9 items-center rounded-control border border-line bg-surface px-4 text-copy font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                >
                  {all ? getDashboardDictionary(language).contentStrategy.showLess : getDashboardDictionary(language).contentStrategy.showMore.replace('{n}', n(hidden))}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}
