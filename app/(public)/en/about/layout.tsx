export const metadata = {
  title: 'About Rankings by Go Top',
  description: 'Discover the story of Rankings by Go Top - a Google rank tracking and AI visibility platform built on 11+ years of digital experience. Professional, transparent, results-focused.',
  openGraph: {
    title: 'About Rankings by Go Top',
    description: 'Google rank tracking and AI visibility platform built with 11+ years of digital expertise',
    url: 'https://www.gotopseo.com/en/about',
    type: 'website',
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
