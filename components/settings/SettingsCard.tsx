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
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <Card padding={false} className={cn('overflow-hidden', tone === 'danger' && 'border-bad/25')}>
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              aria-hidden
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-control',
                tone === 'danger' ? 'bg-bad-soft text-bad' : 'bg-action-soft text-action',
              )}
            >
              <Icon size={18} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="text-section font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-copy text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunk/60 px-5 py-3 sm:px-6">
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
      <label htmlFor={htmlFor} className="text-copy font-medium text-body">{children}</label>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </div>
  )
}

/** The settings screen's own text field and area: the app's tokens, full width. */
export const fieldClass =
  'w-full rounded-control border border-line bg-surface px-3 py-2 text-copy text-ink placeholder:text-muted transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action disabled:opacity-60'
