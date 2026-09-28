'use client'

/**
 * The body of an area only the mapping can fill, on a project that has not
 * been mapped: the shared EmptyState (icon, what will appear here, one action:
 * "Run the mapping"). It used to draw still skeleton lines and a dashed box,
 * which read as a broken load. While the mapping runs, its four steps show
 * under the same empty state instead of the action.
 *
 * It sits inside the area's own frame (a card of the AI tab), so the area keeps
 * its place and the screen does not jump when the mapping fills it. Never shown
 * when the mapping cannot be offered (the scan's flag off for this user): that
 * area is then left out, as it always was, instead of promising something the
 * owner cannot start.
 */
import { Telescope } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Locale } from '@/lib/i18n/locales'
import { MappingNotice, MappingSteps } from './MappingBanner'
import type { MappingControl } from './useMapping'

export default function MappingPlaceholder({ control, title, body, locale, withNotice = false }: {
  control: MappingControl
  /** What this area will hold once mapped (the empty state's title). */
  title: string
  body: string
  locale: Locale
  /** Say what a start came to here: on a screen with no mapping banner to say it. */
  withNotice?: boolean
}) {
  const m = getDashboardDictionary(locale).mapping
  const { mapping, starting, start } = control
  if (mapping.available !== true) return null
  const running = mapping.state === 'running'
  return (
    <div data-mapping-placeholder={mapping.state} className="space-y-4">
      <EmptyState
        className="py-8"
        icon={<Telescope />}
        title={title}
        body={body}
        action={running ? undefined : (
          // Secondary: the tab's one primary is the opening card's "choose questions".
          <Button variant="secondary" size="sm" onClick={() => void start()} loading={starting} data-mapping-run>
            {starting ? m.starting : m.run}
          </Button>
        )}
      />
      {running && <MappingSteps mapping={mapping} locale={locale} />}
      {withNotice && <MappingNotice control={control} locale={locale} />}
    </div>
  )
}
