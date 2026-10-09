import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { buildArticlesIndexSchema } from '@/lib/articles/server'
import { jsonForScriptTag } from '@/lib/content/public-article-html'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'מאמרים בנושאי קידום אתרים ושיווק דיגיטלי | Go Top SEO',
  description: 'מאמרים בנושאי קידום אתרים, נראות ב-AI ושיווק דיגיטלי, מהצוות של Go Top SEO. להמשך קריאה כנסו עכשיו >>',
  openGraph: {
    title: 'מאמרים בנושאי קידום אתרים ושיווק דיגיטלי',
    description: 'מאמרים בנושאי קידום אתרים, נראות ב-AI ושיווק דיגיטלי מהצוות של Go Top SEO',
    url: 'https://www.gotopseo.com/articles',
    type: 'website',
    locale: LOCALE_CONFIG['he'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForScriptTag(buildArticlesIndexSchema('he')) }}
      />
      {children}
    </>
  )
}
