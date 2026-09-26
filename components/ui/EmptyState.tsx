import { cn } from '@/lib/utils'

/**
 * An empty state is not an error message.
 *
 * The screens said "No topics / briefs yet" and stopped, which tells a merchant
 * that something is missing but not what to do or what will happen. Every empty
 * state here has to carry the same four things: an icon, a title that is not a
 * negation, one sentence about what appears here and when, and exactly one
 * action. A second action turns it back into a decision the merchant cannot make.
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
        <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-action-soft text-action">
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-md">
        <p className="text-base font-semibold text-ink">{title}</p>
        {body && <p className="text-sm text-muted">{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
      {secondary && <div className="text-xs text-muted">{secondary}</div>}
    </div>
  )
}
