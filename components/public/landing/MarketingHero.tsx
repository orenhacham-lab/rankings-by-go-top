/**
 * The hero of the inner marketing pages (pricing, the feature pages, about):
 * the landing page's backdrop (a faint drafting grid and two cobalt glows)
 * around a title, a subtitle, an optional trust row and whatever the page puts
 * under it.
 *
 * A server component with no motion of its own: it is complete at rest, and
 * the glows only drift under `prefers-reduced-motion: no-preference`, from the
 * landing stylesheet. It lives next to the landing pieces and not in
 * marketing.tsx because it imports a CSS module, which the node-run guards that
 * import marketing.tsx cannot load.
 */
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTAINER, Eyebrow } from '../marketing'
import styles from './landing.module.css'

export function MarketingHero({
  eyebrow, eyebrowIcon, title, accent, subtitle, trust, before, children, compact = false,
}: {
  eyebrow?: React.ReactNode
  eyebrowIcon?: LucideIcon
  title: React.ReactNode
  /** The headline's second line, in solid action blue. Never gradient text. */
  accent?: React.ReactNode
  subtitle?: React.ReactNode
  /** Short, true reassurances under the subtitle, each with a check. */
  trust?: string[]
  /** Above the eyebrow, e.g. breadcrumbs. */
  before?: React.ReactNode
  children?: React.ReactNode
  compact?: boolean
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className={cn(styles.heroGrid, 'absolute inset-x-0 top-0 h-[640px]')} />
        <div className={styles.glowA} />
        <div className={styles.glowB} />
      </div>
      <div className={cn(CONTAINER, 'relative', compact ? 'pt-24 pb-12 sm:pt-32 sm:pb-14' : 'pt-24 pb-16 sm:pt-32 sm:pb-20')}>
        {before && <div className="mb-8">{before}</div>}
        <div className="mx-auto max-w-4xl text-center">
          {eyebrow && <div className="mb-5"><Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow></div>}
          <h1 className="text-title font-bold tracking-tight text-ink text-balance sm:text-display">
            {title}
            {accent && <span className="block text-action">{accent}</span>}
          </h1>
          {subtitle && <p className="mx-auto mt-5 max-w-2xl text-section font-normal text-body text-pretty">{subtitle}</p>}
          {trust && trust.length > 0 && (
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-copy text-body">
              {trust.map((line) => (
                <li key={line} className="flex items-center gap-1.5">
                  <Check className="size-4 text-action" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
        {children && <div className="mt-8 sm:mt-10">{children}</div>}
      </div>
    </section>
  )
}
