'use client'

/**
 * The sites worth getting a link from, one row per site.
 *
 * Each row says what the site is (category, and "competitor" / "local" when
 * they apply), the one strongest reason it is on the list, and where the owner
 * stands with it. Opening a row shows every reason, the rule that classified the
 * site, the pages that showed up, and the plain steps to get a link. Rows of
 * competitors carry the competitor badge and a note instead of outreach steps:
 * a competitor is never presented as a link target.
 */
import { useId, useMemo, useState } from 'react'
import { BookMarked, Check, ChevronDown, Landmark, ListOrdered, MapPin, Newspaper, Search, Sparkles } from 'lucide-react'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import { cn } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { Reveal } from '@/components/ui/motion'
import ExternalLink from './ExternalLink'
import { OUTREACH_STATUSES, type OutreachStatus } from './useOpportunityStatus'
import type { Opportunity } from '@/lib/site-links/model'
import type { OpportunityCategory } from '@/lib/site-links/classify'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']['opportunities']

const CATEGORY_ICON: Record<OpportunityCategory, typeof BookMarked> = {
  directory: BookMarked,
  listicle: ListOrdered,
  association: Landmark,
  media: Newspaper,
}

const FILTERS = ['all', 'directory', 'listicle', 'association', 'media'] as const
type Filter = (typeof FILTERS)[number]

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

export default function OpportunityList({ copy, items, statusOf, setStatus }: {
  copy: Copy
  items: Opportunity[]
  statusOf: (domain: string) => OutreachStatus
  setStatus: (domain: string, status: OutreachStatus) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, directory: 0, listicle: 0, association: 0, media: 0 }
    for (const o of items) c[o.category] += 1
    return c
  }, [items])
  const shown = filter === 'all' ? items : items.filter((o) => o.category === filter)

  return (
    <div className="space-y-4">
      <div role="group" aria-label={copy.filterLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {FILTERS.filter((f) => f === 'all' || counts[f] > 0).map((f) => {
          const on = filter === f
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f)}
              data-site-links-filter={f}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-caption font-semibold transition-colors duration-150',
                FOCUS,
                on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink',
              )}
            >
              <span>{f === 'all' ? copy.filterAll : copy.categories[f]}</span>
              <span className={cn('rounded-pill px-1.5 tabular-nums', on ? 'bg-surface/15' : 'bg-sunk text-muted')}>{counts[f]}</span>
            </button>
          )
        })}
      </div>

      <Reveal>
        <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {shown.map((o) => (
            <li key={o.domain} className="border-b border-line last:border-b-0">
              <OpportunityRow copy={copy} item={o} status={statusOf(o.domain)} onStatus={(s) => setStatus(o.domain, s)} />
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  )
}

/** The strongest single reason, for the row's second line. */
function headline(copy: Copy, o: Opportunity): { icon: typeof Search; text: string } {
  const best = [...o.searches].sort((a, b) => a.rank - b.rank)[0]
  if (best) return { icon: Search, text: copy.googleFor(best.query, best.rank) }
  if (o.questions[0]) return { icon: Sparkles, text: copy.aiFor(o.questions[0]) }
  return { icon: CATEGORY_ICON[o.category], text: copy.reasons[o.reason] }
}

function OpportunityRow({ copy, item: o, status, onStatus }: {
  copy: Copy
  item: Opportunity
  status: OutreachStatus
  onStatus: (s: OutreachStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const CategoryIcon = CATEGORY_ICON[o.category]
  const lead = headline(copy, o)
  const LeadIcon = lead.icon

  return (
    <div data-site-links-opportunity={o.domain} data-open={open ? 'true' : 'false'}>
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <SiteAvatar domain={o.domain} size="md" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span dir="ltr" className="min-w-0 truncate text-copy font-semibold text-ink">{o.domain}</span>
              <Badge variant="neutral" className="gap-1">
                <CategoryIcon size={12} aria-hidden="true" />
                {copy.categories[o.category]}
              </Badge>
              {o.isCompetitor && (
                <Badge variant="warning" className="gap-1">
                  <CompetitorIcon size={12} aria-hidden="true" />
                  {copy.competitor}
                </Badge>
              )}
              {o.isLocal && (
                <Badge variant="info" className="gap-1">
                  <MapPin size={12} aria-hidden="true" />
                  {copy.local}
                </Badge>
              )}
            </div>
            <p className="mt-1.5 flex min-w-0 items-start gap-1.5 text-caption text-muted">
              <LeadIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="line-clamp-2 text-pretty">{lead.text}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:shrink-0 lg:flex-nowrap">
          {!o.isCompetitor && <StatusControl copy={copy} domain={o.domain} value={status} onChange={onStatus} />}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            data-site-links-toggle=""
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-caption font-semibold text-action',
              'transition-colors duration-150 hover:bg-action-soft',
              FOCUS,
            )}
          >
            {open ? copy.hideSteps : copy.showSteps}
            <ChevronDown size={16} aria-hidden="true" className={cn('motion-safe:transition-transform motion-safe:duration-200', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Drops in with the app's pop-in (160ms); with reduced motion it simply appears. */}
      <div
        id={panelId}
        role="region"
        aria-label={copy.stepsTitle}
        hidden={!open}
        className="motion-safe:animate-pop-in"
      >
        <div className="border-t border-line bg-canvas/50 px-4 py-5 sm:px-5 sm:py-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10">
            <div className="min-w-0 space-y-5">
              <div>
                <h3 className="text-overline font-semibold text-muted ltr:uppercase ltr:tracking-wider">{copy.whyTitle}</h3>
                <ul className="mt-2.5 space-y-2">
                  {o.searches.map((s) => (
                    <li key={`g:${s.query}`} className="flex items-start gap-2 text-copy text-body">
                      <Search size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                      <span className="min-w-0 text-pretty">{copy.googleFor(s.query, s.rank)}</span>
                    </li>
                  ))}
                  {o.questions.map((q) => (
                    <li key={`q:${q}`} className="flex items-start gap-2 text-copy text-body">
                      <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                      <span className="min-w-0 text-pretty">{copy.aiFor(q)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption text-muted">
                  <span className="font-semibold text-body">{copy.classifiedAs}</span> {copy.reasons[o.reason]}
                </p>
              </div>
              {o.pages.length > 0 && (
                <div>
                  <h3 className="text-overline font-semibold text-muted ltr:uppercase ltr:tracking-wider">{copy.pagesTitle}</h3>
                  <ul className="mt-2.5 space-y-2">
                    {o.pages.map((p, i) => (
                      <li key={`${p.url ?? ''}:${i}`} className="min-w-0 text-copy">
                        <ExternalLink href={p.url} newTabLabel={copy.opensNewTab} className="max-w-full">
                          {p.title || o.domain}
                        </ExternalLink>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="min-w-0">
              {o.isCompetitor ? (
                <div className="flex gap-3 rounded-inset border border-warn/20 bg-warn-soft p-4 text-copy text-ink">
                  <CompetitorIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
                  <p className="text-pretty">{copy.competitorNote}</p>
                </div>
              ) : (
                <>
                  <h3 className="text-overline font-semibold text-muted ltr:uppercase ltr:tracking-wider">{copy.stepsTitle}</h3>
                  <ol className="mt-3 space-y-3" data-site-links-steps={o.category}>
                    {copy.steps[o.category].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-pill bg-action-soft text-caption font-semibold text-action tabular-nums">
                          {i + 1}
                        </span>
                        <span className="min-w-0 pt-0.5 text-copy text-body text-pretty">{step}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Three states as one segmented control (a radio group), not a native select. */
function StatusControl({ copy, domain, value, onChange }: {
  copy: Copy
  domain: string
  value: OutreachStatus
  onChange: (s: OutreachStatus) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`${copy.statusLabel}: ${domain}`}
      className="inline-flex h-9 items-center rounded-pill border border-line bg-sunk p-0.5"
    >
      {OUTREACH_STATUSES.map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            data-site-links-status={s}
            className={cn(
              'inline-flex h-full items-center gap-1 rounded-pill px-3 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150',
              FOCUS,
              on
                ? cn('bg-surface shadow-control', s === 'got_link' ? 'text-ok' : s === 'contacted' ? 'text-action' : 'text-ink')
                : 'text-muted hover:text-ink',
            )}
          >
            {on && s === 'got_link' && <Check size={14} aria-hidden="true" />}
            {copy.status[s]}
          </button>
        )
      })}
    </div>
  )
}
