'use client'

/**
 * The link network's place at the top of the Links screen when it cannot run for
 * this site (wave 9). It used to vanish, and the outreach list led the screen: the
 * owner read that as "the network I asked for is not there". Now the network always
 * leads, and when it cannot run the hero says so and why:
 *
 *   'shopify'  the project is a Shopify store, or the account is billed through
 *              Shopify (lib/link-network/store.ts, unchanged): no switch, the reason;
 *   'off'      the network could not be read right now: the reason and a retry.
 *
 * The figures stay, as "—": nothing is counted for a site that is not in the network.
 * Every word comes from the dictionary; nothing here writes.
 */
import { ArrowDownLeft, ArrowUpRight, Clock, Network } from 'lucide-react'
import Button from '@/components/ui/Button'
import HeroPanel, { HERO_INVERSE_BUTTON, HeroBadge, HeroStat } from '@/components/ui/HeroPanel'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { UnavailableReason } from '@/lib/link-network/http'
import { NetworkPromises } from './NetworkPanel'

export default function NetworkUnavailable({ reason, onRetry }: { reason: UnavailableReason; onRetry: () => void }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).siteLinks
  const copy = dict.network
  const h = copy.hero
  const u = h.unavailable
  return (
    <HeroPanel data-link-network="hero" data-network-state="unavailable" data-reason={reason}>
      <section aria-labelledby="link-network-title" className="px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <HeroBadge tone="muted">{u.badge}</HeroBadge>
          <span className="inline-flex items-center gap-1.5 text-caption font-medium text-contrast-ink/70">
            <Network aria-hidden="true" className="size-3.5" />
            {h.overline}
          </span>
        </div>
        <h2 id="link-network-title" className="mt-5 max-w-[32ch] text-title font-bold tracking-tight text-balance">{u.title}</h2>
        <p className="mt-3 max-w-prose text-copy text-contrast-ink/80 text-pretty" data-link-network="unavailable-reason">
          {reason === 'shopify' ? u.shopify : u.off}
        </p>
        <NetworkPromises label={h.promisesLabel} items={h.promises} />
        {reason === 'off' && (
          <div className="mt-5">
            <Button variant="secondary" className={HERO_INVERSE_BUTTON} onClick={onRetry}>{dict.retry}</Button>
          </div>
        )}
        <div className="mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3" data-link-network="stats">
          <HeroStat label={copy.stats.received} icon={<ArrowDownLeft className="rtl:-scale-x-100" />} value="—" />
          <HeroStat label={copy.stats.given} icon={<ArrowUpRight className="rtl:-scale-x-100" />} value="—" />
          <HeroStat label={copy.stats.waiting} icon={<Clock />} value="—" />
        </div>
      </section>
    </HeroPanel>
  )
}
