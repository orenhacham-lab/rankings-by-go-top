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
 * The page's own APPLICATION FORM sits after the rules, and WhatsApp and email
 * stay in the hero and the closing call for a partner who would rather talk
 * first. The form asks the one thing a free email always leaves out — where
 * their audience is — and sending it grants nothing: the row is `pending`, a
 * pending partner has no code (a CHECK constraint, not a convention), so no link
 * exists until a person has read it. That manual approval is the program's real
 * defence against someone joining to refer themselves.
 */
import { BadgePercent, FileText, Handshake, Infinity as InfinityIcon, Megaphone, Receipt, RotateCcw, ShieldCheck, TicketPercent, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import AffiliateApplicationForm from '@/components/public/AffiliateApplicationForm'
import { AFFILIATES_COPY } from '@/lib/i18n/public/affiliates'
import { LOCALE_PREFIX } from '@/lib/i18n/locales'
import { whatsappHelpUrl } from '@/components/public/contact'
import type { PublicLocale } from '@/lib/i18n/locales'

const WHY_ICONS = [InfinityIcon, BadgePercent, Users] as const
const RULE_ICONS = [ShieldCheck, Megaphone, TicketPercent, Megaphone, RotateCcw, Receipt] as const

export function affiliatesContent(locale: PublicLocale): FeaturePageContent {
  const c = AFFILIATES_COPY[locale]
  // The hero's primary button scrolls to the form on this page rather than
  // opening a mail client: the form is the thing we want filled in, and a
  // mailto from a phone is where an application goes to die. Email stays as the
  // address in the footer, and WhatsApp is the secondary button, for a partner
  // who would rather ask something first.
  const apply = { label: c.apply, href: '#affiliate-apply' }
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
      // The form comes after the rules and the agreement, so an applicant has
      // read what they are joining before they type — and right before the FAQ,
      // which is where someone who is nearly convinced looks next.
      { kind: 'custom', node: <AffiliateApplicationForm locale={locale} /> },
      { kind: 'faq', title: c.faqTitle, items: c.faq },
    ],
    cta: { title: c.closeTitle, body: c.closeBody, primary: apply, secondary: talk },
  }
}

export default function AffiliatesPage({ locale }: { locale: PublicLocale }) {
  return <FeaturePage locale={locale} content={affiliatesContent(locale)} />
}
