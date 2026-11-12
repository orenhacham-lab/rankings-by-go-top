import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { sitemapArticleLinks, sitemapArticleSection } from '@/lib/sitemap/articles'

export const metadata = {
  title: 'Sitemap | Go Top SEO',
  description: 'Complete sitemap for Go Top SEO — find all our pages in one place.',
  openGraph: {
    title: 'Sitemap | Go Top SEO',
    description: 'Complete sitemap for Go Top SEO',
    url: 'https://www.gotopseo.com/en/sitemap',
    locale: 'en_US',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/sitemap',
    // The ten maps are one page in ten languages. Without this block the
    // page inherits the root layout's alternates, which name the ten HOME
    // pages as this page's translations and (in Hebrew) canonicalise the map
    // to the home page — measured 11.11.2026 on all ten.
    languages: buildHreflangAlternates('/sitemap', '/en/sitemap', '/es/sitemap'),
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default async function EnglishSitemapPage() {
  const articles = await sitemapArticleLinks('en')

  const sections: SitemapSection[] = [
    {
      title: 'Pages',
      links: [
        { label: 'Home', href: '/en' },
        { label: 'Pricing', href: '/en/pricing' },
        { label: 'About', href: '/en/about' },
        { label: 'Articles', href: '/en/articles' },
        { label: 'Free site check', href: '/en/free-check' },
        { label: 'Which AI crawlers is your site blocking?', href: '/en/ai-crawlers' },
        { label: 'Affiliate program', href: '/en/affiliates' },
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
        { label: 'Links to your site', href: '/en/features/site-links' },
        { label: 'Google Maps posts', href: '/en/features/google-maps-posts' },
        { label: 'Google Business Profile', href: '/en/features/google-business-profile' },
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
        { label: 'Shopify stores', href: '/en/solutions/shopify' },
      ],
    },
    {
      title: 'Comparisons',
      links: [
        { label: 'All comparisons', href: '/en/compare' },
        { label: 'Go Top SEO vs Semrush', href: '/en/compare/semrush' },
        { label: 'Go Top SEO vs Yoast', href: '/en/compare/yoast' },
        { label: 'Go Top SEO vs Rank Math', href: '/en/compare/rankmath' },
        { label: 'Go Top SEO vs Surfer', href: '/en/compare/surfer' },
        { label: 'Go Top SEO vs Writesonic', href: '/en/compare/writesonic' },
        { label: 'Go Top SEO vs BrightLocal', href: '/en/compare/brightlocal' },
        { label: 'Go Top SEO vs Booster SEO', href: '/en/compare/booster' },
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

  const articleSection: SitemapSection[] = sitemapArticleSection('Articles on the site', articles)

  return (
    <LegalFrame locale="en" breadcrumbs={[{ label: 'Sitemap', href: '/en/sitemap' }]}>
      <LegalHeader title="Sitemap" subtitle="Find all pages and sections of Go Top SEO here" />

      <SitemapGroups groups={[...sections, ...articleSection]} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        For more information, visit our{' '}
        <Link href="/en/about" className={`${LEGAL_LINK} mx-1`}>
          about page
        </Link>
        or{' '}
        <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>
          contact us
        </a>
      </p>
    </LegalFrame>
  )
}
