import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata = {
  title: 'Mapa do site | Go Top SEO',
  description: 'Mapa do site do Go Top SEO: todas as nossas páginas em um só lugar.',
  openGraph: {
    title: 'Mapa do site | Go Top SEO',
    description: 'Mapa do site do Go Top SEO',
    url: 'https://www.gotopseo.com/pt-BR/sitemap',
    locale: 'pt_BR',
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function PortugueseSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Páginas',
      links: [
        { label: 'Início', href: '/pt-BR' },
        { label: 'Preços', href: '/pt-BR/pricing' },
        { label: 'Quem somos', href: '/pt-BR/about' },
        { label: 'Artigos', href: '/pt-BR/articles' },
      ],
    },
    {
      title: 'Conta',
      links: [
        { label: 'Entrar', href: authHref('login', 'pt-BR') },
        { label: 'Começar o teste grátis', href: authHref('signup', 'pt-BR') },
      ],
    },
    {
      title: 'Funcionalidades',
      links: [
        { label: 'Criação e publicação de conteúdo', href: '/pt-BR/features/seo-geo-content-publishing' },
        { label: 'Acompanhamento de posições no Google orgânico', href: '/pt-BR/features/google-organic-rank-tracking' },
        { label: 'Acompanhamento de posições no Google Maps', href: '/pt-BR/features/google-maps-rank-tracking' },
        { label: 'Acompanhamento da visibilidade em IA', href: '/pt-BR/features/ai-visibility-tracking' },
        { label: 'Relatórios SEO e GEO', href: '/pt-BR/features/seo-geo-reports' },
        { label: 'Pesquisa de palavras-chave', href: '/pt-BR/features/keyword-research' },
        { label: 'Correções no site', href: '/pt-BR/features/site-health-fixes' },
      ],
    },
    {
      title: 'Para quem',
      links: [
        { label: 'Donos de negócios', href: '/pt-BR/solutions/businesses' },
        { label: 'Agências', href: '/pt-BR/solutions/agencies' },
        { label: 'Sites WordPress', href: '/pt-BR/solutions/wordpress' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Política de privacidade', href: '/pt-BR/privacy' },
        { label: 'Termos de uso', href: '/pt-BR/terms' },
        { label: 'Política de cancelamento e reembolso', href: '/pt-BR/refund-policy' },
        { label: 'Acessibilidade', href: '/pt-BR/accessibility' },
        { label: 'Contrato do Programa de Parceiros', href: '/pt-BR/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="pt-BR" breadcrumbs={[{ label: 'Mapa do site', href: '/pt-BR/sitemap' }]}>
      <LegalHeader title="Mapa do site" subtitle="Aqui você encontra todas as páginas e seções do Go Top SEO" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Para saber mais, visite nossa{' '}
        <Link href="/pt-BR/about" className={`${LEGAL_LINK} mx-1`}>
          página sobre nós
        </Link>
        ou{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          escreva para a gente
        </a>
      </p>
    </LegalFrame>
  )
}
