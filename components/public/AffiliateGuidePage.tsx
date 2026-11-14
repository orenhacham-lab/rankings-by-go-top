/**
 * The two cluster pages under /affiliates, in every language.
 *
 * They are FeaturePages like every other marketing page, so they inherit the
 * site's bands, rhythm and dark/light handling instead of inventing a layout.
 * The copy is lib/i18n/public/affiliate-cluster; the numbers inside it are
 * interpolated from lib/affiliate/terms.ts, which is the same single source the
 * program page and the commission engine read.
 *
 * WHERE EVERY BUTTON GOES. Both pages end at the application form on
 * /affiliates — `#affiliate-apply`, the anchor the program page's own hero
 * points at — because a cluster page that collects nothing is a page that
 * ranks and does nothing. The program page is the hub and these are its
 * spokes: each one links to the hub (the apply buttons) and to its sibling (the
 * callout above the closing band), and the hub links back to both, so a reader
 * who lands on any of the three can reach the other two in one click.
 */
import { ArrowLeftRight, BadgePercent, Clock, Coins, FileText, Handshake, Infinity as InfinityIcon, Link2, PiggyBank, Repeat, Scale, ShieldCheck, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AFFILIATE_CLUSTER, AFFILIATE_CLUSTER_SLUGS, affiliateClusterPath, type AffiliateClusterKey } from '@/lib/i18n/public/affiliate-cluster'
import { LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'

/** The eyebrow icon and the three "why" icons, per page. */
const ICONS: Record<AffiliateClusterKey, { hero: typeof Handshake; why: readonly [typeof Handshake, typeof Handshake, typeof Handshake]; list: typeof Handshake }> = {
  marketing: { hero: Handshake, why: [Repeat, InfinityIcon, Users], list: BadgePercent },
  choosing: { hero: Scale, why: [Coins, PiggyBank, Clock], list: ShieldCheck },
}

const LIST_ICONS: Record<AffiliateClusterKey, readonly [typeof Handshake, typeof Handshake, typeof Handshake, typeof Handshake]> = {
  marketing: [BadgePercent, Users, Link2, Handshake],
  choosing: [BadgePercent, Link2, Coins, ShieldCheck],
}

/** The other page of the cluster: `marketing` points at `choosing` and back. */
const SIBLING: Record<AffiliateClusterKey, AffiliateClusterKey> = { marketing: 'choosing', choosing: 'marketing' }

export function affiliateGuideContent(locale: PublicLocale, key: AffiliateClusterKey): FeaturePageContent {
  const c = AFFILIATE_CLUSTER[locale][key]
  const prefix = LOCALE_PREFIX[locale]
  // The application form lives on the program page, so the button is a link to
  // it and not an anchor on this page: #affiliate-apply exists there.
  const apply = { label: c.apply, href: `${prefix}/affiliates#affiliate-apply` }
  const icons = ICONS[key]
  return {
    hero: {
      eyebrow: c.eyebrow,
      eyebrowIcon: icons.hero,
      title: c.title,
      accent: c.accent,
      subtitle: c.subtitle,
      trust: [...c.trust],
      primary: apply,
    },
    sections: [
      {
        kind: 'cards',
        tone: 'contrast',
        title: c.whyTitle,
        intro: c.whyIntro,
        items: c.why.map((w, i) => ({ icon: icons.why[i], title: w.title, body: w.body })),
      },
      { kind: 'steps', title: c.stepsTitle, intro: c.stepsIntro, items: [...c.steps] },
      {
        kind: 'cards',
        columns: 2,
        title: c.listTitle,
        intro: c.listIntro,
        items: c.list.map((item, i) => ({ icon: LIST_ICONS[key][i], title: item.title, body: item.body })),
      },
      // What the page does NOT promise, in its own band rather than as small
      // print: no income figure, no ranking, no partner count.
      { kind: 'callout', icon: FileText, title: c.honestTitle, body: <p>{c.honestBody}</p> },
      { kind: 'faq', title: c.faqTitle, items: [...c.faq] },
      {
        // The sibling link, immediately before the closing band: a reader who
        // got this far is either ready to apply or still comparing, and the
        // other page is written for the second one.
        kind: 'callout',
        icon: ArrowLeftRight,
        body: (
          <p>
            <a className="underline" href={`${prefix}${affiliateClusterPath(SIBLING[key])}`}>{c.siblingLabel}</a>
          </p>
        ),
      },
    ],
    cta: { title: c.ctaTitle, body: c.ctaBody, primary: apply },
  }
}

export default function AffiliateGuidePage({ locale, page }: { locale: PublicLocale; page: AffiliateClusterKey }) {
  return <FeaturePage locale={locale} content={affiliateGuideContent(locale, page)} path={affiliateClusterPath(page)} />
}

export { AFFILIATE_CLUSTER_SLUGS }
