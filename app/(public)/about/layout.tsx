export const metadata = {
  title: 'עמוד אודות - Rankings by Go Top',
  description: 'גלו הכל על אפליקציית בדיקת המיקומים בגוגל המהפכנית Rankings by Go Top מבית גו טופ שיווק דיגיטלי.',
  openGraph: {
    title: 'עמוד אודות - Rankings by Go Top',
    description: 'גלו הכל על אפליקציית בדיקת המיקומים בגוגל המהפכנית Rankings by Go Top',
    url: 'https://www.gotopseo.com/about',
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
      name: 'אודות',
      item: 'https://www.gotopseo.com/about',
    },
  ],
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
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
