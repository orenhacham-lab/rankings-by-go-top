import { headers } from 'next/headers'
import { authHref } from '@/lib/i18n/auth-href'
import { Check, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { ButtonLink, Section } from '@/components/public/marketing'
import { MarketingHero } from '@/components/public/landing/MarketingHero'
import styles from '@/components/public/landing/landing.module.css'
import {
  PricingChecksNote, PricingClose, PricingFaq, PricingIncluded, PricingUnsure, PricingUsage, PricingValue,
} from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, type PlanCode } from '@/lib/plans/catalog'
import { planLimitLines, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION, PLAN_DISPLAY_NAME, HIGHLIGHTED_PLAN } from '@/lib/plans/features'
import { pricingPl as copy } from '@/lib/i18n/public/pricing-pl'
import { cn } from '@/lib/utils'
import { formatPlanPrice, planPriceIn } from '@/lib/billing/market'
import { countryFromHeaders, resolveBillingMarket } from '@/lib/billing/server-market'
import { koreaTrialOnlyNoticeForCountry } from '@/lib/billing/korea-sale'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

const PLAN_ORDER: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

/**
 * The words around the grid are in lib/i18n/public/pricing-pl.ts and laid out
 * by components/public/pricing/PricingSections.tsx, shared with the Hebrew and
 * English pages. The plan grid itself stays here, as on those pages.
 *
 * THE PRICE IS NOT DECIDED BY THIS PAGE'S LANGUAGE. resolveBillingMarket reads
 * the visitor's country, so a visitor in Israel reading Polish still sees
 * shekels and pays through PayPal, and everyone else sees the dollar price that
 * market is billed in today. A ZŁOTY price is the owner's to set; until he
 * does, nothing here promises złoty — and that matters most on this page.
 * The unit is art. 4 ust. 5 of the ustawa o informowaniu o cenach towarów i
 * usług, not ust. 1: ust. 1 binds the place of retail sale and service
 * provision, and ust. 5 extends the display duty "odpowiednio" to advertising a
 * service together with its price, which is exactly what this page does. The
 * act does NOT make a consumer price the total payable, and an earlier draft of
 * this comment said it did: `cena` in art. 3 ust. 1 pkt 1 is merely "wartość
 * wyrażoną w jednostkach pieniężnych", and art. 3 ust. 2 counts VAT in only
 * where the sale is subject to Polish VAT under separate provisions. The reason
 * that survives scrutiny is art. 5: on a discrepancy or doubt about the price
 * the consumer may demand the service at the price most favourable to them, and
 * art. 6 ust. 1-2 makes it publicly enforced (up to 20,000 zł by the
 * wojewódzki inspektor Inspekcji Handlowej, up to 40,000 zł on a third breach
 * within twelve months). So an invented złoty figure would be a price we could
 * be made to take. art. 4 ust. 2 is the one to remember for later: the moment
 * this page carries a reduction or a struck-out price, the lowest price of the
 * preceding thirty days has to stand beside it.
 */
export default async function PolishPricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // w17 — the price is in the VISITOR's currency, decided on the server from
  // the country header (or the signed-in account's market), not the page's
  // language: an Israeli on either page sees shekels, anyone else dollars.
  // The page reads cookies and headers, so it renders per request.
  const { market } = await resolveBillingMarket(supabase, user)
  // Before the trial, not only at the refusal: a visitor placed in Korea is
  // told here that only the trial is open to them, because 전자상거래법 제21조
  // 제1항 제1호 forbids inducement with a material fact withheld, and it binds
  // any business carrying on electronic commerce. lib/billing/korea-sale.ts.
  const koreaTrialOnly = koreaTrialOnlyNoticeForCountry(countryFromHeaders(await headers()))

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="pl" />

      <main className="flex-1">
        <MarketingHero
          compact
          /* The trail the page's BreadcrumbList describes, on the page.
             Same component and same dictionary label as the markup in
             this route's layout. */
          before={<Breadcrumbs items={[{ label: getPublicDictionary('pl').nav.pricing, href: '/pl/pricing' }]} locale="pl" />}
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          accent={copy.hero.accent}
          subtitle={copy.hero.subtitle}
          trust={copy.hero.trust}
        />

        <Section className="pt-12 sm:pt-14 lg:pt-16">
          {/* ONE row of four cards on a large screen, two columns on a tablet, one
              on a phone. The audience distinction is carried by a small label on
              each card rather than by full-width stacked sections, which pushed
              Premium and Agency below the fold. Static text — no toggle, no URL
              parameter, no cookie, no client state. The recommended plan is the
              only navy card and carries the one primary button. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLAN_ORDER.map((code) => {
              const plan = PLAN_CATALOG[code]
              const highlighted = code === HIGHLIGHTED_PLAN

              // The five LIMIT lines come from the shared builder, so this card and
              // the dashboard's billing card cannot disagree with the server. What
              // every plan shares is listed under them, from the page's copy.
              const features = [
                ...planLimitLines(code, 'pl'),
              ]

              return (
                <div
                  key={code}
                  className={cn(
                    'relative flex flex-col rounded-card border p-6 shadow-card transition-[transform,box-shadow] duration-200 ease-snappy hover:shadow-pop motion-safe:hover:-translate-y-1',
                    highlighted ? cn(styles.stage, 'border-contrast text-contrast-ink') : 'border-line bg-surface',
                  )}
                >
                  {highlighted && (
                    <div className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center gap-1 rounded-pill bg-commit px-3 text-caption font-semibold text-commit-ink shadow-control">
                      <Star className="size-3" fill="currentColor" aria-hidden="true" />
                      {copy.plans.popular}
                    </div>
                  )}

                  <div className="mb-5">
                    <p className={cn(
                      'mb-3 inline-flex h-6 items-center rounded-pill px-2.5 text-caption font-semibold',
                      highlighted ? 'bg-white/10 text-rail-tagline' : 'bg-action-soft text-action',
                    )}>
                      {PLAN_AUDIENCE_LABEL[code]['pl']}
                    </p>
                    <h3 className={cn('text-title font-bold tracking-tight', highlighted ? 'text-contrast-ink' : 'text-ink')}>
                      {PLAN_DISPLAY_NAME[code]['pl']}
                    </h3>
                    <p className={cn('mt-1 text-copy md:min-h-12', highlighted ? 'text-contrast-ink/75' : 'text-body')}>
                      {PLAN_AUDIENCE_DESCRIPTION[code]['pl']}
                    </p>
                  </div>

                  <div className="mb-6 flex items-baseline gap-1.5">
                    <span className={cn('text-display font-bold tracking-tight tabular-nums', highlighted ? 'text-contrast-ink' : 'text-ink')}>
                      {formatPlanPrice(planPriceIn(plan, market), market, 'pl')}
                    </span>
                    <span className={cn('text-copy', highlighted ? 'text-contrast-ink/60' : 'text-muted')}>{copy.plans.perMonth}</span>
                  </div>

                  <ul className={cn('space-y-3 border-t pt-5', highlighted ? 'border-white/10' : 'border-line')}>
                    {features.map((feature) => (
                      <li key={feature} className={cn('flex items-start gap-2.5 text-copy', highlighted ? 'text-contrast-ink/90' : 'text-body')}>
                        <Check className={cn('mt-1 size-4 shrink-0', highlighted ? 'text-rail-tagline' : 'text-action')} strokeWidth={2.5} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className={cn('mb-8 mt-5 flex-1 border-t pt-4', highlighted ? 'border-white/10' : 'border-line')}>
                    <p className={cn('mb-2 text-caption font-semibold', highlighted ? 'text-rail-tagline' : 'text-muted')}>{copy.plans.everyPlanLabel}</p>
                    <ul className={cn('space-y-1.5 text-caption', highlighted ? 'text-contrast-ink/70' : 'text-muted')}>
                      {copy.plans.everyPlan.map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <span className={cn('mt-2 size-1 shrink-0 rounded-pill', highlighted ? 'bg-rail-tagline' : 'bg-line-strong')} aria-hidden="true" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <ButtonLink
                    href={user ? '/dashboard' : authHref('signup', 'pl', { plan: code })}
                    variant={highlighted ? 'primary' : 'secondary'}
                    size="lg"
                    className="w-full"
                  >
                    {user ? copy.plans.dashboard : copy.plans.cta}
                  </ButtonLink>
                  {!user && (
                    <p className={cn('mt-2.5 text-center text-caption', highlighted ? 'text-contrast-ink/60' : 'text-muted')}>{copy.plans.noCard}</p>
                  )}
                </div>
              )
            })}
          </div>

          <PricingChecksNote copy={copy} market={market} koreaTrialOnly={koreaTrialOnly} />
          <PricingUnsure copy={copy} checkHref="/pl/free-check" />
        </Section>

        <PricingIncluded copy={copy} />
        <PricingValue copy={copy} />
        <PricingUsage copy={copy} />
        <PricingFaq copy={copy} />
        <PricingClose
          copy={copy}
          checkHref="/pl/free-check"
          startHref={user ? '/dashboard' : authHref('signup', 'pl')}
          signedIn={!!user}
        />
      </main>

      <Footer locale="pl" />
    </div>
  )
}
