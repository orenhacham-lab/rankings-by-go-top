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
 *
 * `interactive` is for a card that IS a link or a button: only then does it
 * answer the pointer, with a stronger border and (wave 7) a 3px lift. A card
 * that cannot be clicked does not pretend it can.
 */
interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
  tone?: 'default' | 'sunk' | 'ink'
  interactive?: boolean
}

export function Card({ children, className, padding = true, tone = 'default', interactive = false }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border transition-[border-color,box-shadow,background-color] duration-200 ease-snappy',
        tone === 'default' && 'bg-surface border-line shadow-card',
        tone === 'sunk' && 'bg-sunk border-line',
        // The context card: deep ink with one quiet cobalt glow in its top corner,
        // drawn on the card itself so it needs no extra element.
        tone === 'ink' && 'overflow-hidden bg-contrast text-contrast-ink border-contrast-ink/5 shadow-card bg-[radial-gradient(120%_140%_at_100%_0%,color-mix(in_srgb,var(--color-brand)_20%,transparent),transparent_55%)] rtl:bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--color-brand)_20%,transparent),transparent_55%)]',
        // A card that is a link or a button rises 3px under the pointer and its
        // shadow softens out (.lift, wave 7); with reduced motion only the shadow and border answer.
        interactive && 'lift cursor-pointer hover:border-line-strong',
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
    <div className={cn('flex flex-wrap items-center justify-between gap-3 mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-section font-semibold text-ink', className)}>
      {children}
    </h2>
  )
}
