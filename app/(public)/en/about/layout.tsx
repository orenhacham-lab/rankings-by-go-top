import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'About Go Top SEO',
  description: 'Discover the story of Go Top SEO - a Google rank tracking and AI visibility platform built on 11+ years of digital experience. Professional, transparent, results-focused.',
  openGraph: {
    title: 'About Go Top SEO',
    description: 'Google rank tracking and AI visibility platform built with 11+ years of digital expertise',
    url: 'https://www.gotopseo.com/en/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
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
      name: 'About',
      item: 'https://www.gotopseo.com/en/about',
    },
  ],
}

export default function EnglishAboutLayout({ children }: { children: React.ReactNode }) {
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
