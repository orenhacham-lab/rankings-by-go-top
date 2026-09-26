import { cn } from '@/lib/utils'

/**
 * A card is a flat surface with a real border.
 *
 * It used to carry two stacked shadows, a hover shadow and a hover lift, so a
 * page of cards floated and nothing sat still while the cursor moved. Depth now
 * comes from the border; the single soft shadow only lifts the card off the
 * canvas. `tone` covers the two other surfaces a screen needs: `sunk` for an
 * inset panel inside a card, and `ink` for the dark context card a screen can
 * open with (one per screen — it stops meaning "read this first" if repeated).
 */
interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
  tone?: 'default' | 'sunk' | 'ink'
}

export function Card({ children, className, padding = true, tone = 'default' }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border transition-colors',
        tone === 'default' && 'bg-surface border-line shadow-card',
        tone === 'sunk' && 'bg-sunk border-line',
        tone === 'ink' && 'bg-contrast text-contrast-ink border-transparent shadow-card',
        padding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-base font-semibold text-ink', className)}>
      {children}
    </h2>
  )
}
