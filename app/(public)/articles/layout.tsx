export const metadata = {
  title: 'מאמרים בנושאי קידום אתרים ושיווק דיגיטלי | Rankings by Go Top',
  description: 'מאמרים בנושאי קידום אתרים ושיווק דיגיטלי של מומחי השיווק מהגדולים בישראל. להמשך קריאה כנסו עכשיו >>',
  openGraph: {
    title: 'מאמרים בנושאי קידום אתרים ושיווק דיגיטלי',
    description: 'מאמרים בנושאי קידום אתרים ושיווק דיגיטלי של מומחי השיווק מהגדולים בישראל',
    url: 'https://www.gotopseo.com/articles',
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
      name: 'מאמרים',
      item: 'https://www.gotopseo.com/articles',
    },
  ],
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
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
