/**
 * The affiliate program's page, one component for every language.
 *
 * It is a FeaturePage like every other marketing page, so it inherits the site's
 * bands, spacing and dark/light handling rather than inventing a layout. The copy and
 * the numbers come from lib/i18n/public/affiliates.ts, which holds them once for every
 * language.
 *
 * The page points at the AGREEMENT in the reader's own language, right after the
 * rules. A page that states rates, payout thresholds and reversal rules is making
 * an offer, and an offer has to be findable from the terms that bind it; the
 * guard in lib/i18n/public/__qa__/affiliates-page.qa.ts fails if any language
 * loses that link or points at another language's copy of it.
 *
 * The two calls to action open a CONVERSATION (email, WhatsApp), not a form. That is
 * deliberate: every affiliate is approved by a person before they get a link, which is
 * the program's real defence against someone signing up to refer themselves. A form
 * arrives with the attribution table.
 */
import { BadgePercent, FileText, Handshake, Infinity as InfinityIcon, Megaphone, Receipt, RotateCcw, ShieldCheck, TicketPercent, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AFFILIATES_COPY } from '@/lib/i18n/public/affiliates'
import { LOCALE_PREFIX } from '@/lib/i18n/locales'
import { EMAIL, whatsappHelpUrl } from '@/components/public/contact'
import type { PublicLocale } from '@/lib/i18n/locales'

const WHY_ICONS = [InfinityIcon, BadgePercent, Users] as const
const RULE_ICONS = [ShieldCheck, Megaphone, TicketPercent, Megaphone, RotateCcw, Receipt] as const

export function affiliatesContent(locale: PublicLocale): FeaturePageContent {
  const c = AFFILIATES_COPY[locale]
  const apply = { label: c.apply, href: `mailto:${EMAIL}?subject=${encodeURIComponent(c.eyebrow)}` }
  const talk = { label: c.talk, href: whatsappHelpUrl(c.whatsappMessage) }
  return {
    hero: {
      eyebrow: c.eyebrow,
      eyebrowIcon: Handshake,
      title: c.title,
      accent: c.accent,
      subtitle: c.subtitle,
      trust: c.trust,
      primary: apply,
      secondary: talk,
    },
    sections: [
      {
        kind: 'cards',
        tone: 'contrast',
        title: c.whyTitle,
        intro: c.whyIntro,
        items: c.why.map((w, i) => ({ icon: WHY_ICONS[i], title: w.title, body: w.body })),
      },
      { kind: 'steps', title: c.howTitle, items: c.how },
      {
        // The rules are a section of their own rather than a line of small print:
        // an affiliate who reads them first is an affiliate we do not have to refuse.
        kind: 'cards',
        columns: 2,
        title: c.rulesTitle,
        intro: c.rulesIntro,
        items: c.rules.map((r, i) => ({ icon: RULE_ICONS[i % RULE_ICONS.length], title: r.title, body: r.body })),
      },
      {
        // Immediately after the rules, because that is where a reader who has just
        // been told the rules looks for the document behind them.
        kind: 'callout',
        icon: FileText,
        body: (
          <p>
            {`${c.termsNote} `}
            <a className="underline" href={`${LOCALE_PREFIX[locale]}/affiliate-terms`}>{c.termsLink}</a>
          </p>
        ),
      },
      { kind: 'faq', title: c.faqTitle, items: c.faq },
    ],
    cta: { title: c.closeTitle, body: c.closeBody, primary: apply, secondary: talk },
  }
}

export default function AffiliatesPage({ locale }: { locale: PublicLocale }) {
  return <FeaturePage locale={locale} content={affiliatesContent(locale)} />
}
