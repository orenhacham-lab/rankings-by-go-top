import { cn } from '@/lib/utils'

/**
 * The heading above a section of a screen: what this block is, one line of why,
 * and the action that belongs to it. Sections used to open with a bare bold line
 * and put their action wherever there was room, so the same structure looked
 * different on every screen.
 */
export default function SectionHeading({
  title, description, action, className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
