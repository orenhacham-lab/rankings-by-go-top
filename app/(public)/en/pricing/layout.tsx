import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Pricing - Rankings by Go Top',
  description: 'Flexible pricing plans for Google rank tracking and AI visibility. Free 7-day trial, no commitment. Plans starting from $79/month.',
  openGraph: {
    title: 'Pricing - Rankings by Go Top',
    description: 'Flexible pricing plans for Google rank tracking and AI visibility monitoring',
    url: 'https://www.gotopseo.com/en/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing'),
  },
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://www.gotopseo.com/en',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Pricing',
      item: 'https://www.gotopseo.com/en/pricing',
    },
  ],
}

export default function EnglishPricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  )
}
