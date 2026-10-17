import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * The landing hero's backdrop without its CSS module: a faint drafting grid that
 * fades out from the top, and two soft cobalt glows. Decoration only
 * (aria-hidden), and still at rest (no motion at all). Inline styles instead of
 * landing.module.css, so the node-run guards that render the auth pages and the
 * free check can load it (w7 P1-9).
 *
 * The parent is `relative` (and `overflow-hidden` when the glows must not bleed).
 */
const GRID: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
  maskImage: 'radial-gradient(70% 60% at 50% 25%, #000 20%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(70% 60% at 50% 25%, #000 20%, transparent 75%)',
  opacity: 0.7,
}

export default function HeroBackdrop({ className, height = 600 }: { className?: string; height?: number }) {
  return (
    <div aria-hidden="true" data-hero-backdrop className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-x-0 top-0" style={{ ...GRID, height }} />
      <div className="absolute -top-44 start-1/2 size-[520px] -translate-x-1/2 rounded-pill bg-action/10 blur-3xl rtl:translate-x-1/2" />
      <div className="absolute end-[-120px] top-[420px] size-[380px] rounded-pill bg-action/5 blur-3xl" />
    </div>
  )
}
