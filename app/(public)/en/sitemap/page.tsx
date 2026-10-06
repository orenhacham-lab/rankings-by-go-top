import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Sitemap | Go Top SEO',
  description: 'Complete sitemap for Go Top SEO — find all our pages in one place.',
  openGraph: {
    title: 'Sitemap | Go Top SEO',
    description: 'Complete sitemap for Go Top SEO',
    url: 'https://www.gotopseo.com/en/sitemap',
    locale: 'en_US',
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function EnglishSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Pages',
      links: [
        { label: 'Home', href: '/en' },
        { label: 'Pricing', href: '/en/pricing' },
        { label: 'About', href: '/en/about' },
        { label: 'Articles', href: '/en/articles' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Sign in', href: '/login?lang=en' },
        { label: 'Start free trial', href: '/en/signup' },
      ],
    },
    {
      title: 'Features',
      links: [
        { label: 'Content Creation & Publishing', href: '/en/features/seo-geo-content-publishing' },
        { label: 'Google Organic Rank Tracking', href: '/en/features/google-organic-rank-tracking' },
        { label: 'Google Maps Rank Tracking', href: '/en/features/google-maps-rank-tracking' },
        { label: 'AI Visibility Tracking', href: '/en/features/ai-visibility-tracking' },
        { label: 'SEO/GEO Reports', href: '/en/features/seo-geo-reports' },
        { label: 'Keyword Research', href: '/en/features/keyword-research' },
        { label: 'Site fixes', href: '/en/features/site-health-fixes' },
        { label: 'You vs. competitors', href: '/en/features/competitor-tracking' },
        { label: 'Search Console data', href: '/en/features/search-console' },
      ],
    },
    {
      title: "Who it's for",
      links: [
        { label: 'Business owners', href: '/en/solutions/businesses' },
        { label: 'Agencies', href: '/en/solutions/agencies' },
        { label: 'WordPress sites', href: '/en/solutions/wordpress' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/en/privacy' },
        { label: 'Terms of Use', href: '/en/terms' },
        { label: 'Cancellation and Refund Policy', href: '/en/refund-policy' },
        { label: 'Accessibility', href: '/en/accessibility' },
        { label: 'Partner Program Agreement', href: '/en/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="en" breadcrumbs={[{ label: 'Sitemap', href: '/en/sitemap' }]}>
      <LegalHeader title="Sitemap" subtitle="Find all pages and sections of Go Top SEO here" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        For more information, visit our{' '}
        <Link href="/en/about" className={`${LEGAL_LINK} mx-1`}>
          about page
        </Link>
        or{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          contact us
        </a>
      </p>
    </LegalFrame>
  )
}
