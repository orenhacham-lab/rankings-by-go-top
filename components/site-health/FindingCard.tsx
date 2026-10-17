'use client'

/**
 * One finding: how serious it is (a word, not only a colour), what it is, what
 * it costs the merchant, the pages it was found on, and what to do — "fix it for
 * me" on each page we can really fix, and the step-by-step card for everything
 * else (always one click away, also where a fix is offered).
 */
import { useId, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Clock, ListChecks } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { pathOf } from '@/lib/site-health/rules'
import { rowGuidance } from '@/lib/site-health/row-note'
import type { Finding, FindingPage, Severity, SitePlatform } from '@/lib/site-health/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { FixRowState } from '@/lib/site-fix/job-match'
import { fixKey } from './useSiteHealthScan'

type Copy = DashboardDictionary['siteHealth']
export type FixMode = 'fix' | 'install' | 'update' | 'copy' | null

const SEVERITY_BADGE: Record<Severity, 'danger' | 'warning' | 'info'> = { urgent: 'danger', important: 'warning', minor: 'info' }
/** Pages shown before "and N more". */
const FIRST_PAGES = 3

function pageLabel(copy: Copy, page: FindingPage): string {
  return page.kind === 'home' || page.path === '/' ? copy.home : page.path
}

function measureOf(copy: Copy, f: Finding, page: FindingPage): string | null {
  switch (f.id) {
    case 'title_long':
    case 'title_short':
    case 'description_length':
      return page.measure !== null ? copy.chars(page.measure) : null
    case 'images_alt': {
      if (page.measure === null) return null
      // After the site's own check: what a fix reaches, and apart from it what is in the theme.
      const theme = page.themeMissing ?? 0
      return theme > 0 && page.measure > 0 ? `${copy.imagesMissing(page.measure)} · ${copy.imagesInTheme(theme)}` : copy.imagesMissing(page.measure)
    }
    case 'h1_multiple':
      return page.measure !== null ? copy.headings(page.measure) : null
    case 'title_duplicate':
    case 'description_duplicate':
      return page.measure !== null ? copy.sameAs(page.measure) : null
    case 'robots_blocks_ai':
      return page.value
    default:
      return null
  }
}

export function GuideSteps({ steps, title, id }: { steps: readonly string[]; title: string; id?: string }) {
  return (
    <div id={id} className="rounded-inset border border-line bg-sunk/60 p-4 sm:p-5" data-site-health="guide">
      <p className="flex items-center gap-2 text-caption font-semibold text-ink">
        <ListChecks size={16} strokeWidth={2} aria-hidden="true" className="text-action" />
        {title}
      </p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-copy text-body">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-caption font-semibold text-action ring-1 ring-line">
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5 text-pretty">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function FindingCard({
  finding, copy, platform, storeConnected = false, fixed, onFix, themeFix = null, fixModeFor, jobStateFor, onInstall,
}: {
  finding: Finding
  copy: Copy
  platform: SitePlatform
  /** The store is connected (its products and collections come from the store's own list). */
  storeConnected?: boolean
  fixed: ReadonlySet<string>
  onFix: (finding: Finding, page: FindingPage) => void
  /** The theme's repeated images are Media Library items without alt text: one fix for the site, on this page. */
  themeFix?: FindingPage | null
  /**
   * With the fix queue live: whether this page can be fixed now, needs the plugin first, needs a newer
   * plugin (`update`), gets a text to copy and place by hand (`copy`, llms.txt), or none of these.
   */
  fixModeFor?: ((finding: Finding, page: FindingPage) => FixMode) | null
  /** With the fix queue live: whether an approved fix already covers this page (the server's queue decides). */
  jobStateFor?: ((finding: Finding, page: FindingPage) => FixRowState) | null
  onInstall?: () => void
}) {
  const [stepsOpen, setStepsOpen] = useState(false)
  const [allPages, setAllPages] = useState(false)
  const stepsId = useId()
  const text = copy.findings[finding.id]
  const steps = copy.guides[finding.guide][platform]
  const isLinks = finding.id === 'broken_links'
  const themeAlt = finding.themeAlt && finding.themeAlt.pages > 0 ? finding.themeAlt : null
  const count = isLinks ? copy.links(finding.total) : copy.pages(finding.total + (themeAlt?.pages ?? 0))
  const shown = allPages ? finding.pages : finding.pages.slice(0, FIRST_PAGES)
  const hiddenInList = finding.pages.length - shown.length
  const beyondList = finding.total - finding.pages.length
  const siteWide = ['home_unreachable', 'robots_blocks_all', 'robots_blocks_ai', 'sitemap_missing'].includes(finding.id)

  return (
    <article
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
      data-finding={finding.id}
      data-severity={finding.severity}
      data-fixable={finding.fixable ? 'yes' : 'no'}
    >
      {/* The severity reads from its Badge (a word and a dot); the card carries no start rail. */}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge variant={SEVERITY_BADGE[finding.severity]} dot>{copy.severity[finding.severity]}</Badge>
          {!siteWide && <span className="text-caption font-medium text-muted">{count}</span>}
        </div>
        <h3 className="mt-3 text-section font-semibold text-ink text-balance">{text.title}</h3>
        <p className="mt-1.5 max-w-3xl text-copy text-muted text-pretty">
          <span className="sr-only">{copy.whyLabel}: </span>
          {text.why}
        </p>

        {!siteWide && finding.pages.length > 0 && (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-inset border border-line" role="list">
            {shown.map((page) => {
              // With the queue live, the server's jobs decide; this browser's memory is only the fallback.
              const held = jobStateFor ? jobStateFor(finding, page) : null
              const done = jobStateFor ? held === 'applied' : fixed.has(fixKey(finding.id, page.url))
              const queued = held === 'queued'
              const measure = measureOf(copy, finding, page)
              const mode = fixModeFor ? fixModeFor(finding, page) : page.fixable ? 'fix' : null
              const guidance = rowGuidance(finding, page, { platform, storeConnected })
              return (
                <li key={`${page.url}|${page.from ?? ''}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-page-row={done ? 'fixed' : queued ? 'queued' : mode === 'fix' ? 'fixable' : mode === 'install' ? 'install' : mode === 'update' ? 'update' : mode === 'copy' ? 'copy' : 'guide'}>
                  <div className="min-w-0">
                    {/* The address reads left to right, while the row keeps the page's own alignment. */}
                    <p className="truncate text-copy font-medium text-ink" title={page.url}>
                      {page.kind === 'home' ? pageLabel(copy, page) : <bdi dir="ltr">{pageLabel(copy, page)}</bdi>}
                    </p>
                    {(measure || (isLinks && page.from)) && (
                      <p className="mt-0.5 truncate text-caption text-muted">
                        {isLinks && page.from ? <>{copy.foundOn}: <span dir="ltr">{pageLabel(copy, { ...page, path: pathOf(page.from), kind: 'other' })}</span></> : measure}
                      </p>
                    )}
                    {/* Why this row has no fix: one line (lib/site-health/row-note.ts), never two. */}
                    {guidance.note && !done && !queued && (
                      <p className="mt-1 max-w-xl text-caption text-muted text-pretty" data-outside-content={page.outside} data-row-note={guidance.note}>
                        {copy[guidance.note]}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {done ? (
                      <Badge variant="success"><Check size={14} strokeWidth={2.4} aria-hidden="true" />{copy.fixedBadge}</Badge>
                    ) : queued ? (
                      <Badge variant="info"><Clock size={14} strokeWidth={2.2} aria-hidden="true" />{copy.queuedBadge}</Badge>
                    ) : mode === 'fix' ? (
                      <Button variant="secondary" size="sm" onClick={() => onFix(finding, page)} aria-label={copy.fixForMeAria(pageLabel(copy, page))} data-fix-for-me="" data-fix-button={finding.fixType && fixModeFor ? finding.fixType : finding.field ?? ''}>
                        {copy.fixForMe}
                      </Button>
                    ) : mode === 'copy' ? (
                      <Button variant="secondary" size="sm" onClick={() => onFix(finding, page)} aria-label={copy.createTextAria(pageLabel(copy, page))} data-copy-button={finding.fixType ?? ''}>
                        {copy.createText}
                      </Button>
                    ) : mode === 'install' && onInstall ? (
                      <Button variant="ghost" size="sm" onClick={onInstall} data-install-button={finding.fixType ?? ''}>
                        {copy.autofix.connection.install}
                      </Button>
                    ) : mode === 'update' && onInstall ? (
                      <Button variant="ghost" size="sm" onClick={onInstall} data-update-button={finding.fixType ?? ''}>
                        {copy.autofix.connection.update.action}
                      </Button>
                    ) : guidance.adminLink && page.adminUrl ? (
                      <a
                        href={page.adminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-semibold text-ink shadow-control transition-colors hover:border-line-strong hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                      >
                        {copy.openInShopify}
                        <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
                      </a>
                    ) : null}
                  </div>
                </li>
              )
            })}
            {(hiddenInList > 0 || (allPages && beyondList > 0)) && (
              <li className="px-4 py-2.5">
                {hiddenInList > 0 ? (
                  <button type="button" onClick={() => setAllPages(true)} className="text-caption font-semibold text-action hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-control">
                    {copy.more(finding.total - shown.length)}
                  </button>
                ) : (
                  <span className="text-caption text-muted">{copy.more(beyondList)}</span>
                )}
              </li>
            )}
          </ul>
        )}

        {themeAlt && (
          // Images in the theme repeat on every page that uses it: said once, for the whole site.
          <p className="mt-4 max-w-3xl rounded-inset border border-line bg-sunk/60 px-4 py-3 text-copy text-body text-pretty" data-theme-alt={themeAlt.pages}>
            {copy.themeAlt(themeAlt.pages, themeAlt.images)}
          </p>
        )}
        {themeAlt && themeFix && (() => {
          const held = jobStateFor ? jobStateFor(finding, themeFix) : null
          return (
            <div className="mt-3 flex flex-wrap items-center gap-3" data-theme-alt-fix={held ?? 'open'}>
              {held === 'applied' ? (
                <Badge variant="success"><Check size={14} strokeWidth={2.4} aria-hidden="true" />{copy.fixedBadge}</Badge>
              ) : held === 'queued' ? (
                <Badge variant="info"><Clock size={14} strokeWidth={2.2} aria-hidden="true" />{copy.queuedBadge}</Badge>
              ) : (
                <>
                  <Button variant="secondary" size="sm" onClick={() => onFix(finding, themeFix)} data-fix-for-me="" data-fix-button="image_alt_media">
                    {copy.fixForMe}
                  </Button>
                  <span className="text-caption text-muted text-pretty">{copy.themeAltMedia}</span>
                </>
              )}
            </div>
          )
        })()}

        <div className="mt-4">
          <button
            type="button"
            aria-expanded={stepsOpen}
            aria-controls={stepsId}
            onClick={() => setStepsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-control text-copy font-semibold text-action hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            data-steps-toggle=""
          >
            {stepsOpen ? copy.hideSteps : copy.showSteps}
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cn('transition-transform duration-200 ease-snappy', stepsOpen && 'rotate-180')} />
          </button>
          {stepsOpen && (
            <div className="mt-3 motion-safe:animate-pop-in">
              <GuideSteps id={stepsId} steps={steps} title={copy.stepsTitle} />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
