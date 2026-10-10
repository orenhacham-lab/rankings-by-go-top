import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'מחירים - Go Top SEO',
  description: 'תוכניות מחירים גמישות ליצירת תוכן SEO/GEO, מעקב מיקומים בגוגל ונראות ב-AI. ניסיון חינם של 7 ימים, ללא התחייבות. תוכניות החל מ-₪249 לחודש.',
  openGraph: {
    title: 'מחירים - Go Top SEO',
    description: 'תוכניות מחירים גמישות למעקב מיקומים בגוגל ונראות ב-AI',
    url: 'https://www.gotopseo.com/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('he', '/pricing', getPublicDictionary('he').nav.pricing)

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
