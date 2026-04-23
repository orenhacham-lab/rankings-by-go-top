export const metadata = {
  title: 'מפת אתר - Rankings by Go Top',
  description: 'מפת אתר של Rankings by Go Top - ניווט קל לכל העמודים וההמאמרים באתר',
  openGraph: {
    title: 'מפת אתר - Rankings by Go Top',
    description: 'מפת אתר של Rankings by Go Top',
    url: 'https://www.gotopseo.com/sitemap',
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
