export const metadata = {
  title: 'מחירים - Rankings by Go Top',
  description: 'תוכניות מחירים גמישות למעקב מיקומים בגוגל ונראות ב-AI. ניסיון חינם של 7 ימים, ללא התחייבות. תוכניות החל מ-₪79 לחודש.',
  openGraph: {
    title: 'מחירים - Rankings by Go Top',
    description: 'תוכניות מחירים גמישות למעקב מיקומים בגוגל ונראות ב-AI',
    url: 'https://www.gotopseo.com/pricing',
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
      name: 'מחירים',
      item: 'https://www.gotopseo.com/pricing',
    },
  ],
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
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
