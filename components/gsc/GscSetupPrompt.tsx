'use client'

/**
 * The three things a Search Console widget can say instead of its data.
 *
 *  - GscSetupPrompt: the data needs Search Console set up. One sentence on what will
 *    appear and why it is worth it, and exactly one button, which goes to the Search
 *    Console section of the project's settings. Its label names the one step that is
 *    missing (connect, reconnect, choose a property, sync), so the merchant is never
 *    told to connect an account that is already connected.
 *  - GscLoadError: the data could not be read. It says so and offers a retry; a failed
 *    read is never presented as "not connected", nor as a zero.
 *  - GscLoading: the data is on its way.
 *
 * The button is a link, not a <button> inside a link: it navigates, and it is the only
 * interactive element of the prompt.
 */
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { gscSettingsHref, type GscSetupState } from '@/lib/gsc/widget-state'

export const GSC_ACTION_LINK_CLASS =
  'inline-flex h-7 items-center justify-center gap-2 whitespace-nowrap rounded-control bg-action px-3 text-caption font-semibold text-action-ink transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'

export default function GscSetupPrompt({
  state, about, projectId, layout = 'stack', className,
}: {
  state: GscSetupState
  /** The widget's one sentence: what will appear here and why it is worth it. */
  about: string
  projectId: string | null | undefined
  /** `inline` puts the button beside the sentence, for a one-line notice. */
  layout?: 'stack' | 'inline'
  className?: string
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  return (
    <div
      data-gsc-setup={state}
      className={cn(
        layout === 'inline' ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'flex flex-col items-start gap-3',
        className,
      )}
    >
      {/* The sentence's basis is what lets the button wrap under it on a phone:
          at basis 0 the sentence gives up all its width and the unbreakable
          button runs past the screen's edge. */}
      <p className={cn('text-copy text-muted', layout === 'inline' && 'min-w-0 flex-1 basis-56')}>{about}</p>
      <Link href={gscSettingsHref(projectId)} className={GSC_ACTION_LINK_CLASS}>
        {t.actions[state]}
      </Link>
    </div>
  )
}

export function GscLoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  return (
    <p data-gsc-error="" className={cn('text-copy text-muted', className)}>
      {t.loadError}{' '}
      <button
        type="button"
        onClick={onRetry}
        className="font-medium text-action underline decoration-dotted underline-offset-2 hover:text-action-hover"
      >
        {t.retry}
      </button>
    </p>
  )
}

export function GscLoading({ className, lines = 2 }: { className?: string; lines?: number }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cn('h-3 rounded-control bg-sunk', i === lines - 1 ? 'w-2/3' : 'w-full')} aria-hidden="true" />
      ))}
      <span className="sr-only">{t.loading}</span>
    </div>
  )
}
