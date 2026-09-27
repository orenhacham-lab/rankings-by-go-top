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
      <Card padding={false} className={cn('overflow-clip', danger && 'border-bad/30')}>
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b px-5 py-4 sm:px-6 sm:py-5',
            danger ? 'border-bad/15 bg-bad-soft/70' : 'border-line bg-gradient-to-b from-sunk/70 to-surface',
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <span
              aria-hidden
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl shadow-sm ring-1',
                danger ? 'bg-surface text-bad ring-bad/25' : 'bg-action text-action-ink ring-action/20',
              )}
            >
              <Icon size={19} strokeWidth={2} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id={`${id}-title`} className={cn('text-section font-bold', danger ? 'text-bad' : 'text-ink')}>{title}</h2>
              {description && <p className="mt-0.5 max-w-prose text-copy text-muted text-pretty">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
        {footer && (
          <footer
            className={cn(
              'sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/90 px-5 py-3 backdrop-blur-md sm:px-6',
              'transition-colors duration-200',
              // SaveBar marks itself while there is something unsaved: the footer warms to say so.
              'has-[[data-dirty]]:border-commit/40 has-[[data-dirty]]:bg-commit-soft/95',
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
  'w-full rounded-control border border-line bg-surface px-3 py-2 text-copy text-ink shadow-sm placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-line-strong ' +
  'focus:border-action focus:outline-none focus:ring-4 focus:ring-action/20 disabled:cursor-not-allowed disabled:bg-sunk disabled:text-muted'
