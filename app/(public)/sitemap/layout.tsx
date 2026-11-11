import { buildHreflangAlternates } from '@/lib/seo/hreflang'
export const metadata = {
  title: 'מפת אתר - Go Top SEO',
  description: 'מפת אתר של Go Top SEO - ניווט קל לכל העמודים וההמאמרים באתר',
  openGraph: {
    title: 'מפת אתר - Go Top SEO',
    description: 'מפת אתר של Go Top SEO',
    url: 'https://www.gotopseo.com/sitemap',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/sitemap',
    // The ten maps are one page in ten languages. Without this block the
    // page inherits the root layout's alternates, which name the ten HOME
    // pages as this page's translations and (in Hebrew) canonicalise the map
    // to the home page — measured 11.11.2026 on all ten.
    languages: buildHreflangAlternates('/sitemap', '/en/sitemap', '/es/sitemap'),
  },
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'דף הבית',
      item: 'https://www.gotopseo.com',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'מפת אתר',
      item: 'https://www.gotopseo.com/sitemap',
    },
  ],
}

export default function SitemapLayout({ children }: { children: React.ReactNode }) {
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
