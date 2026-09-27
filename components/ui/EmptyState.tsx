import { cn } from '@/lib/utils'

/**
 * An empty state is not an error message.
 *
 * The screens said "No topics / briefs yet" and stopped, which tells a merchant
 * that something is missing but not what to do or what will happen. Every empty
 * state here has to carry the same four things: an icon, a title that is not a
 * negation, one sentence about what appears here and when, and exactly one
 * action. A second action turns it back into a decision the merchant cannot make.
 *
 * The icon sits on a small layered tile (an accent-tinted square on a quiet
 * ring), so an empty state reads as a designed moment, not a missing one.
 */
export default function EmptyState({
  icon, title, body, action, secondary, className,
}: {
  icon?: React.ReactNode
  title: string
  body?: string
  action?: React.ReactNode
  /** A quiet link — help, docs, "how this works". Never a second button. */
  secondary?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center text-center gap-3 px-6 py-12', className)}>
      {icon && (
        <div className="relative mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70 [&_svg]:size-5" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-md">
        <p className="text-section font-semibold text-ink">{title}</p>
        {body && <p className="text-copy text-muted text-pretty">{body}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
      {secondary && <div className="text-caption text-muted">{secondary}</div>}
    </div>
  )
}
