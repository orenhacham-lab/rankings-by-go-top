import { Check, Star } from 'lucide-react'
import { ButtonLink } from '@/components/public/marketing'
import styles from '@/components/public/landing/landing.module.css'
import { PLAN_CATALOG, PLAN_CODES, type PlanCode } from '@/lib/plans/catalog'
import {
  planLimitLines, PLAN_AUDIENCE_LABEL, PLAN_DISPLAY_NAME, HIGHLIGHTED_PLAN,
} from '@/lib/plans/features'
import { formatPlanPrice, planPriceIn, type BillingMarket } from '@/lib/billing/market'
import { authHref } from '@/lib/i18n/auth-href'
import { INTL_LOCALE, type PublicLocale } from '@/lib/i18n/locales'
import { ARTICLES_COPY, type ArticlesCopy } from '@/lib/articles/i18n'
import { cn } from '@/lib/utils'

/**
 * THE PLANS, INSIDE AN ARTICLE — the real cards, not a typed table.
 *
 * Every article that talks about the product wants to show what it costs. Until
 * now that meant the author wrote a `<table>` of four prices into the article
 * body, which is a second place for a price to be wrong: a plan whose price
 * changes in `PLAN_CATALOG` leaves every published article quoting the old one,
 * silently and in four languages. The articles also showed shekels to everyone,
 * including the readers of the English, Spanish and Portuguese ones.
 *
 * So the numbers come from the same three places the pricing page reads —
 * `PLAN_CATALOG` for the plan, `planLimitLines` for the allowances,
 * `planPriceIn` for the visitor's currency — and the article only says WHERE
 * the block goes (`<div class="gt-plans"></div>`).
 *
 * Deliberately not the pricing page's grid: no "what every plan includes"
 * column and no FAQ, because this sits in the middle of someone's reading. One
 * row of four cards, the five allowance lines, one button underneath, and a
 * link to the page that carries the rest.
 *
 * It renders no heading of its own either. The article's own `<h2>` stays in
 * the body above it, so the plans keep their line in the table of contents and
 * their heading looks like every other heading in the piece.
 */
export function ArticlePlans({
  locale,
  market,
  signedIn,
}: {
  locale: PublicLocale
  market: BillingMarket
  signedIn: boolean
}) {
  const copy: ArticlesCopy['widgets']['plans'] = ARTICLES_COPY[locale].widgets.plans
  const pricingHref = locale === 'he' ? '/pricing' : `/${locale}/pricing`

  return (
    <section className="my-10 rounded-card border border-line bg-sunk p-5 shadow-card sm:my-12 sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_CODES.map((code: PlanCode) => {
          const plan = PLAN_CATALOG[code]
          const highlighted = code === HIGHLIGHTED_PLAN

          return (
            <div
              key={code}
              className={cn(
                'relative flex flex-col rounded-inset border p-5',
                highlighted ? cn(styles.stage, 'border-contrast text-contrast-ink') : 'border-line bg-surface',
              )}
            >
              {highlighted && (
                <div className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center gap-1 rounded-pill bg-commit px-3 text-caption font-semibold text-commit-ink shadow-control">
                  <Star className="size-3" fill="currentColor" aria-hidden="true" />
                  {copy.popular}
                </div>
              )}

              <p className={cn(
                'mb-2 inline-flex h-6 w-fit items-center rounded-pill px-2.5 text-caption font-semibold',
                highlighted ? 'bg-white/10 text-rail-tagline' : 'bg-action-soft text-action',
              )}>
                {PLAN_AUDIENCE_LABEL[code][locale]}
              </p>

              <h3 className={cn('text-section font-bold tracking-tight', highlighted ? 'text-contrast-ink' : 'text-ink')}>
                {PLAN_DISPLAY_NAME[code][locale]}
              </h3>

              <div className="mb-4 mt-2 flex items-baseline gap-1.5">
                <span className={cn('text-title font-bold tracking-tight tabular-nums', highlighted ? 'text-contrast-ink' : 'text-ink')}>
                  {formatPlanPrice(planPriceIn(plan, market), market, INTL_LOCALE[locale])}
                </span>
                <span className={cn('text-caption', highlighted ? 'text-contrast-ink/60' : 'text-muted')}>
                  {copy.perMonth}
                </span>
              </div>

              <ul className={cn('space-y-2 border-t pt-4', highlighted ? 'border-white/10' : 'border-line')}>
                {planLimitLines(code, locale).map((line) => (
                  <li
                    key={line}
                    className={cn('flex items-start gap-2 text-caption', highlighted ? 'text-contrast-ink/90' : 'text-body')}
                  >
                    <Check
                      className={cn('mt-0.5 size-3.5 shrink-0', highlighted ? 'text-rail-tagline' : 'text-action')}
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <ButtonLink href={signedIn ? '/dashboard' : authHref('signup', locale)} size="lg">
          {copy.cta}
        </ButtonLink>
        <a
          href={pricingHref}
          className="rounded-control text-copy font-semibold text-action underline-offset-4 hover:underline"
        >
          {copy.allPlans}
        </a>
      </div>
      {!signedIn && <p className="mt-2.5 text-caption text-muted">{copy.noCard}</p>}
    </section>
  )
}
