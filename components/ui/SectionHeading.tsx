import { cn } from '@/lib/utils'

/**
 * The heading above a section of a screen: what this block is, one line of why,
 * and the action that belongs to it. Sections used to open with a bare bold line
 * and put their action wherever there was room, so the same structure looked
 * different on every screen.
 *
 * `eyebrow` is an optional short label above the title (a step number, a
 * category). It is never a second title.
 */
export default function SectionHeading({
  title, description, action, eyebrow, className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  eyebrow?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-overline font-semibold text-muted">{eyebrow}</p>}
        <h2 className="text-section font-semibold text-ink">{title}</h2>
        {description && <p className="text-copy text-muted mt-0.5 max-w-prose">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
