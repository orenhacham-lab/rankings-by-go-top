import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { buildArticlesIndexSchema } from '@/lib/articles/server'
import { jsonForScriptTag } from '@/lib/content/public-article-html'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Artigos sobre SEO, posições e visibilidade em IA | Go Top SEO',
  description: 'Artigos, guias e dicas sobre o acompanhamento de posições no Google, SEO e visibilidade no ChatGPT, Gemini, Perplexity e outros mecanismos de IA.',
  openGraph: {
    title: 'Artigos sobre SEO, posições e visibilidade em IA | Go Top SEO',
    description: 'Artigos e guias sobre acompanhamento de posições, SEO e visibilidade em IA',
    url: 'https://www.gotopseo.com/pt-BR/articles',
    type: 'website',
    locale: LOCALE_CONFIG['pt-BR'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForScriptTag(buildArticlesIndexSchema('pt-BR')) }}
      />
      {children}
    </>
  )
}
