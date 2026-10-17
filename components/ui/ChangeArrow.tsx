import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChangeDirection = 'up' | 'down' | 'flat'

/**
 * The one mark for "went up / went down / did not move" next to a change
 * (design contract §9, review G2). It replaces the ▲ ▼ • text glyphs the tiles,
 * PositionChange and the Search Console tiles each drew: those were font
 * characters, so their size and weight followed whichever font rendered them
 * and a screen reader read them out as "black up-pointing triangle".
 *
 * The arrow is decoration (aria-hidden); the colour comes from the caller's
 * text colour (`text-ok` / `text-bad` / `text-muted`), so the arrow and the
 * number beside it are always the same tone. `ChangeSign` puts a spoken "+" or "−"
 * in front of the number for a screen reader, which otherwise hears only the
 * bare figure.
 */
export default function ChangeArrow({ direction, className }: { direction: ChangeDirection; className?: string }) {
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus
  return <Icon aria-hidden="true" strokeWidth={2.5} className={cn('size-3 shrink-0', className)} data-change={direction} />
}

/** A spoken sign for the number that follows the arrow ("+", "−" or nothing). */
export function ChangeSign({ direction }: { direction: ChangeDirection }) {
  if (direction === 'flat') return null
  return <span className="sr-only">{direction === 'up' ? '+' : '−'}</span>
}
