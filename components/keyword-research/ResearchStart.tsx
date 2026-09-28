'use client'

/**
 * The research tab of a project with no research yet (no scan, and none run by
 * hand): the research screen's own start, not the older form. One keyword field
 * that runs the same research as the form, a quiet way to the full form (by web
 * address, or both), and, when the mapping can be offered for this project, the
 * mapping as the other way in.
 *
 * Part B of the UX review: an older project opens on the same screen as a new
 * one. The form it used to open on is one click away, never lost.
 */
import { Search, Telescope } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { MappingNotice, MappingSteps } from '@/components/mapping/MappingBanner'
import type { MappingControl } from '@/components/mapping/useMapping'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Locale } from '@/lib/i18n/locales'

export default function ResearchStart({
  locale, keyword, onKeyword, onSubmit, loading, onAdvanced, mapping,
}: {
  locale: Locale
  keyword: string
  onKeyword: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
  /** Opens the full form (a web address, or both). */
  onAdvanced: () => void
  /** The mapping, when this project can be offered it; null otherwise. */
  mapping: MappingControl | null
}) {
  const m = getDashboardDictionary(locale).mapping
  const offered = mapping?.mapping.available === true && mapping.mapping.state !== 'done' ? mapping : null
  return (
    <section data-research-start="" className="mb-8">
      <Card>
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-inset bg-action-soft text-action" aria-hidden="true">
            <Search size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section font-semibold text-ink">{m.researchEmptyTitle}</h2>
            <p className="mt-1 max-w-2xl text-copy text-muted">{m.researchEmptyBody}</p>
            <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label htmlFor="research-start-keyword" className={FIELD_LABEL_CLASSES}>{m.researchInputLabel}</label>
                <input
                  id="research-start-keyword"
                  name="keyword"
                  value={keyword}
                  onChange={(e) => onKeyword(e.target.value)}
                  placeholder={m.researchInputPlaceholder}
                  autoComplete="off"
                  className={`${FIELD_CLASSES} h-11`}
                />
              </div>
              <Button type="submit" size="lg" loading={loading} disabled={loading || !keyword.trim()}>
                {m.researchSubmit}
              </Button>
            </form>
            <button
              type="button"
              onClick={onAdvanced}
              className="mt-3 text-caption font-semibold text-action underline decoration-dotted underline-offset-4 hover:text-action-hover"
            >
              {m.researchAdvanced}
            </button>
            {offered && (
              <div data-research-start-mapping={offered.mapping.state ?? ''} className="mt-5 border-t border-line pt-4">
                {offered.mapping.state === 'running' ? (
                  <MappingSteps mapping={offered.mapping} locale={locale} />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Telescope size={16} className="shrink-0 text-action" aria-hidden />
                    <p className="min-w-0 flex-1 basis-56 text-copy text-body">{m.researchOrMap}</p>
                    <Button variant="secondary" size="sm" onClick={() => void offered.start()} loading={offered.starting} data-mapping-run>
                      {offered.starting ? m.starting : m.run}
                    </Button>
                  </div>
                )}
                <div className="mt-3 empty:hidden">
                  <MappingNotice control={offered} locale={locale} />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  )
}
