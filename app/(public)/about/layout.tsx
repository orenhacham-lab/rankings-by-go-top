import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'עמוד אודות - Rankings by Go Top',
  description: 'גלו הכל על Rankings by Go Top - מערכת מעקב מיקומים בגוגל ונראות ב-AI המהפכנית. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI כמו ChatGPT ו-Gemini.',
  openGraph: {
    title: 'עמוד אודות - Rankings by Go Top',
    description: 'מערכת מעקב מיקומים בגוגל ונראות ב-AI. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI',
    url: 'https://www.gotopseo.com/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/about',
    languages: buildHreflangAlternates('/about', '/en/about'),
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
