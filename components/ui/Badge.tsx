import { cn } from '@/lib/utils'

/**
 * A badge states a fact about the thing beside it. It is a soft tint plus dark
 * text — never a filled colour, because a filled colour in this app means an
 * action you can take, and a badge is not clickable.
 */
interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  className?: string
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-pill text-xs font-semibold border',
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
      {children}
    </span>
  )
}
