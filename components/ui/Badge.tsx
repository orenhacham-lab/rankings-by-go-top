import { cn } from '@/lib/utils'

/**
 * A badge states a fact about the thing beside it. It is a soft tint plus dark
 * text — never a filled colour, because a filled colour in this app means an
 * action you can take, and a badge is not clickable.
 *
 * `dot` adds a small leading point in the badge's own colour, for a state that
 * is live (running, active) rather than a plain label.
 */
interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  dot?: boolean
  className?: string
}

export default function Badge({ children, variant = 'default', dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap px-2.5 rounded-pill text-caption font-semibold border',
        {
          'bg-sunk text-muted border-line': variant === 'default' || variant === 'neutral',
          'bg-ok-soft text-ok border-ok/20': variant === 'success',
          'bg-warn-soft text-warn border-warn/20': variant === 'warning',
          'bg-bad-soft text-bad border-bad/20': variant === 'danger',
          'bg-info-soft text-info border-info/20': variant === 'info',
        },
        className
      )}
    >
      {dot && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  )
}
