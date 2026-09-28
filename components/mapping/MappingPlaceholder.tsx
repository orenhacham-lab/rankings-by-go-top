'use client'

/**
 * The body of an area only the mapping can fill, on a project that has not
 * been mapped: three still skeleton lines (not a shimmer: nothing is loading),
 * "revealed after the mapping", one sentence about what will appear here, and
 * "Run the mapping". While the mapping runs, its four steps instead.
 *
 * It sits inside the area's own frame (a dashboard widget, a card of the AI
 * tab), so the area keeps its place and its height and the screen does not
 * jump when the mapping fills it. Never shown when the mapping cannot be
 * offered (the scan's flag off for this user): that area is then left out, as
 * it always was, instead of promising something the owner cannot start.
 */
import { Telescope } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Locale } from '@/lib/i18n/locales'
import { MappingNotice, MappingSteps } from './MappingBanner'
import type { MappingControl } from './useMapping'

export default function MappingPlaceholder({ control, body, locale, withNotice = false }: {
  control: MappingControl
  body: string
  locale: Locale
  /** Say what a start came to here: on a screen with no mapping banner to say it. */
  withNotice?: boolean
}) {
  const m = getDashboardDictionary(locale).mapping
  const { mapping, starting, start } = control
  if (mapping.available !== true) return null
  return (
    <div data-mapping-placeholder={mapping.state} className="space-y-4">
      <div aria-hidden="true" className="space-y-3">
        {['w-full', 'w-11/12', 'w-2/3'].map((w) => (
          <div key={w} className="flex items-center gap-3">
            <span className="size-4 shrink-0 rounded-pill bg-sunk" />
            <span className={`h-3.5 rounded-control bg-sunk ${w}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-line-strong bg-sunk/40 px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-action">
            <Telescope size={14} aria-hidden />
            {m.placeholderBadge}
          </p>
          <p className="mt-0.5 text-caption text-body">{body}</p>
        </div>
        {mapping.state !== 'running' && (
          <Button size="sm" onClick={() => void start()} loading={starting} data-mapping-run>
            {starting ? m.starting : m.run}
          </Button>
        )}
      </div>
      {mapping.state === 'running' && <MappingSteps mapping={mapping} locale={locale} />}
      {withNotice && <MappingNotice control={control} locale={locale} />}
    </div>
  )
}
