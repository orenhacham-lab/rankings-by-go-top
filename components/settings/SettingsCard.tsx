import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

/**
 * One section of the settings screen: its own card, its own heading and, when
 * it edits something, its own save bar. A section never shares a save with
 * another, so saving the audiences can never also save a half-typed
 * description.
 *
 *   header  icon · title · one line of why        [the section's own action]
 *   body    the fields
 *   footer  what is unsaved or went wrong            [discard] [save]
 */
export default function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  actions,
  footer,
  tone = 'default',
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  description?: string
  /** The section's own action, such as "detect again with AI". */
  actions?: React.ReactNode
  footer?: React.ReactNode
  tone?: 'default' | 'danger'
  children: React.ReactNode
}) {
  const danger = tone === 'danger'
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      {/* overflow-clip, not overflow-hidden: it rounds the corners the same way but is not a
          scroll container, so the footer below can stick to the bottom of the screen. */}
      <Card padding={false} className="overflow-clip">
        {/* Below sm the section's own action drops under the title, so the description keeps the
            full width instead of wrapping three words to a line beside a pill. */}
        <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            {/* One accent per card: the icon squircle, in the bad tone for the danger zone (no start rail). */}
            <span
              aria-hidden
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-inset [&_svg]:size-5',
                danger ? 'bg-bad-soft text-bad' : 'bg-action-soft text-action',
              )}
            >
              <Icon strokeWidth={2} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id={`${id}-title`} className="text-section font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 max-w-prose text-copy text-muted text-pretty">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0" data-settings-card-actions="">{actions}</div>}
        </header>
        <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
        {footer && (
          <footer
            data-float-clear=""
            className={cn(
              'sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/90 px-5 py-3 backdrop-blur-md sm:px-6',
              'transition-colors duration-150 ease-snappy',
              // SaveBar marks itself while there is something unsaved: the footer's rule takes the action colour.
              'has-[[data-dirty]]:border-action/40',
            )}
          >
            {footer}
          </footer>
        )}
      </Card>
    </section>
  )
}

/** A field's label row: the label, and beside it where the value came from or how long it is. */
export function FieldLabel({ htmlFor, children, aside }: { htmlFor?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-copy font-semibold text-ink">{children}</label>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </div>
  )
}

/** The settings screen's own text field and area: the app's tokens, full width. */
export const fieldClass =
  'w-full rounded-control border border-line bg-surface px-3 py-2 text-copy text-ink shadow-control placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-150 ease-snappy hover:border-line-strong ' +
  'focus:border-action focus:outline-none focus:ring-4 focus:ring-action/20 disabled:cursor-not-allowed disabled:bg-sunk disabled:text-muted'
