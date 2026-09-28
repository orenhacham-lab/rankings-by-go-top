/**
 * The product promotion under the blog (the Hebrew index, each Hebrew
 * article, and the English "coming soon" page): one navy band with the pitch
 * and four figures, then three feature cards. Before this the same block was
 * copied three times as a bright gradient slab with a pulsing green dot.
 *
 * The words come from the page; this only lays them out.
 */
import { FileText, MapPin, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ButtonLink, FeatureCard } from './marketing'

export type ArticlesPromoCopy = {
  badge: string
  /** Two lines; they break apart from the small breakpoint up. */
  title: [string, string]
  body: string
  signup: { label: string; href: string }
  pricing: { label: string; href: string }
  stats: { num: string; label: string }[]
  features: { title: string; desc: string }[]
  /** The heading level of the band's title; the index page has no h2 above it. */
  headingLevel?: 'h2' | 'h3'
}

const FEATURE_ICONS: LucideIcon[] = [Search, MapPin, FileText]

export function ArticlesPromo({ copy }: { copy: ArticlesPromoCopy }) {
  const H = copy.headingLevel ?? 'h3'
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-card bg-contrast p-6 text-contrast-ink shadow-card sm:p-10 lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_110%_at_100%_0%,rgb(0_134_245/0.22),transparent_60%)] rtl:bg-[radial-gradient(80%_110%_at_0%_0%,rgb(0_134_245/0.22),transparent_60%)]"
        />
        <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <span className="mb-4 inline-flex h-7 items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-3 text-caption font-semibold text-contrast-ink" dir="ltr">
              <span className="size-1.5 rounded-pill bg-rail-tagline" aria-hidden="true" />
              {copy.badge}
            </span>
            <H className="text-title font-bold tracking-tight text-contrast-ink text-balance">
              {copy.title[0]}
              <br className="hidden sm:block" />
              {' '}
              {copy.title[1]}
            </H>
            <p className="mt-4 text-section font-normal text-contrast-ink/75 text-pretty">{copy.body}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={copy.signup.href} size="lg">{copy.signup.label}</ButtonLink>
              <ButtonLink href={copy.pricing.href} variant="inverse" size="lg">{copy.pricing.label}</ButtonLink>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {copy.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse rounded-inset border border-white/10 bg-white/5 p-4 lg:p-5">
                <dt className="mt-1 text-copy text-contrast-ink/70">{stat.label}</dt>
                <dd className="text-metric font-bold tabular-nums text-contrast-ink">{stat.num}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
        {copy.features.map((feat, i) => (
          <FeatureCard key={feat.title} icon={FEATURE_ICONS[i] ?? Search} title={feat.title} as="h4">
            <p>{feat.desc}</p>
          </FeatureCard>
        ))}
      </div>
    </div>
  )
}
