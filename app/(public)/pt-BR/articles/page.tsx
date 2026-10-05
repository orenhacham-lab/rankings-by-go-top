import { Newspaper } from 'lucide-react'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { ButtonLink, PageHero, Section } from '@/components/public/marketing'
import { ArticlesPromo, type ArticlesPromoCopy } from '@/components/public/ArticlesPromo'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata = {
  title: 'Artigos sobre SEO, posições e visibilidade em IA | Go Top SEO',
  description: 'Artigos, guias e dicas sobre o acompanhamento de posições no Google, SEO e visibilidade no ChatGPT, Gemini, Perplexity e outros mecanismos de IA.',
  openGraph: {
    title: 'Artigos sobre SEO, posições e visibilidade em IA | Go Top SEO',
    description: 'Artigos e guias sobre acompanhamento de posições, SEO e visibilidade em IA',
    url: 'https://www.gotopseo.com/pt-BR/articles',
    type: 'website',
    locale: 'pt_BR',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function PortugueseArticlesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="pt-BR" />
      <main className="flex-1">
        <PageHero
          compact
          before={<Breadcrumbs items={[{ label: 'Artigos', href: '/pt-BR/articles' }]} locale="pt-BR" />}
          title="Artigos"
          subtitle="Guias e análises sobre o acompanhamento de posições no Google, SEO e visibilidade em IA"
        />

        <Section className="pt-10 sm:pt-12 lg:pt-14">
          {/* Same honest "coming soon" state as the English page: there are no
              Portuguese articles yet, and the page says so rather than showing an
              empty list or the Hebrew ones. */}
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card sm:px-10">
            <div className="mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70" aria-hidden="true">
              <Newspaper className="size-5" />
            </div>
            <h2 className="text-title font-bold tracking-tight text-ink">Os artigos em português chegam em breve</h2>
            <p className="max-w-2xl text-section font-normal text-body text-pretty">
              Estamos preparando uma biblioteca de artigos em português sobre acompanhamento de
              posições, boas práticas de SEO e visibilidade em IA. Enquanto isso, você pode
              começar a acompanhar suas posições hoje com o teste grátis de 7 dias.
            </p>
            <div className="mt-4 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
              <ButtonLink href={authHref('signup', 'pt-BR')} size="lg">Começar o teste grátis</ButtonLink>
              <ButtonLink href="/pt-BR/pricing" variant="secondary" size="lg">Ver preços</ButtonLink>
            </div>
          </div>

          <div className="mt-16 sm:mt-20">
            <ArticlesPromo copy={PROMO} />
          </div>
        </Section>
      </main>
      <Footer locale="pt-BR" />
    </div>
  )
}

const PROMO: ArticlesPromoCopy = {
  badge: 'Go Top SEO',
  title: ['Acompanhe suas posições', 'no Google quando precisar'],
  body: 'Plataforma profissional para acompanhar suas posições no Google orgânico e no Google Maps. Faça uma análise quando quiser, ou deixe que ela rode sozinha uma vez por mês. Relatórios detalhados, acompanhamento de tendências e suporte pessoal.',
  signup: { label: 'Começar o teste grátis', href: authHref('signup', 'pt-BR') },
  pricing: { label: 'Ver preços', href: '/pt-BR/pricing' },
  stats: [
    { num: '1000+', label: 'Palavras-chave' },
    { num: '2', label: 'Mecanismos de posição (Google + Maps)' },
    { num: 'IA', label: 'Acompanhamento de visibilidade' },
    { num: '7 dias', label: 'De teste grátis' },
  ],
  features: [
    { title: 'Google orgânico', desc: 'Acompanhe suas posições nas páginas 1 e 2 do Google com resultados precisos' },
    { title: 'Google Maps', desc: 'Acompanhe sua posição por local: cidade, CEP ou ponto de referência' },
    { title: 'Relatórios profissionais', desc: 'Exporte relatórios em PDF e Excel com tendências, comparativos e análise avançada' },
  ],
}
