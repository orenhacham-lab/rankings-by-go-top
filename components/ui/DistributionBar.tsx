import { cn } from '@/lib/utils'

/**
 * How a whole splits into buckets, as one stacked bar and a legend under it: the
 * keywords by page of Google, the research by difficulty. Each part grows from the
 * bar's start edge (.grow-x, 900ms, a little after the one before it); with reduced
 * motion it is simply there. The bar is one image for a screen reader, named by
 * `label`; the legend repeats every figure in words.
 *
 * `tone="contrast"` is for the dark context card; the swatches are then given by the
 * caller in contrast-safe tokens.
 */
export interface DistributionPart {
  key: string
  label: string
  count: number
  /** The part's fill, a token class (bg-action, bg-action/60, bg-line-strong…). */
  swatch: string
}

export default function DistributionBar({ parts, label, tone = 'default', formatCount = String, className }: {
  parts: readonly DistributionPart[]
  label: string
  tone?: 'default' | 'contrast'
  formatCount?: (n: number) => string
  className?: string
}) {
  const shown = parts.filter((p) => p.count > 0)
  const contrast = tone === 'contrast'
  return (
    <div className={cn('min-w-0', className)} data-distribution="">
      <div role="img" aria-label={label} className={cn('flex h-2.5 w-full gap-[3px] overflow-hidden rounded-pill', contrast ? 'bg-contrast-ink/10' : 'bg-sunk')}>
        {shown.map((p, i) => (
          <span
            key={p.key}
            data-part={p.key}
            className={cn('grow-x h-full min-w-1.5 rounded-pill', p.swatch)}
            style={{ flex: `${p.count} 1 0%`, '--grow-delay': `${160 + i * 110}ms` } as React.CSSProperties}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {parts.map((p) => (
          <li key={p.key} className={cn('inline-flex items-center gap-2 text-caption', contrast ? 'text-contrast-ink/75' : 'text-muted')}>
            <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-pill', p.swatch)} />
            {p.label}
            <span className={cn('font-semibold tabular-nums', contrast ? 'text-contrast-ink' : 'text-ink')}>{formatCount(p.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
