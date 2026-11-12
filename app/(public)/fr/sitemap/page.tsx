import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { sitemapArticleLinks, sitemapArticleSection } from '@/lib/sitemap/articles'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata = {
  title: 'Plan du site | Go Top SEO',
  description: 'Plan du site de Go Top SEO : toutes nos pages en un seul endroit.',
  openGraph: {
    title: 'Plan du site | Go Top SEO',
    description: 'Plan du site de Go Top SEO',
    url: 'https://www.gotopseo.com/fr/sitemap',
    locale: 'fr_FR',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/sitemap',
    // The ten maps are one page in ten languages. Without this block the
    // page inherits the root layout's alternates, which name the ten HOME
    // pages as this page's translations and (in Hebrew) canonicalise the map
    // to the home page — measured 11.11.2026 on all ten.
    languages: buildHreflangAlternates('/sitemap', '/en/sitemap', '/es/sitemap'),
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default async function FrenchSitemapPage() {
  const articles = await sitemapArticleLinks('fr')

  const sections: SitemapSection[] = [
    {
      title: 'Pages',
      links: [
        { label: 'Accueil', href: '/fr' },
        { label: 'Tarifs', href: '/fr/pricing' },
        { label: 'À propos', href: '/fr/about' },
        { label: 'Articles', href: '/fr/articles' },
        { label: 'Audit gratuit', href: '/fr/free-check' },
        { label: "Quels robots d'IA votre site bloque-t-il ?", href: '/fr/ai-crawlers' },
        { label: 'Programme d’affiliation', href: '/fr/affiliates' },
      ],
    },
    {
      title: 'Compte',
      links: [
        { label: 'Se connecter', href: authHref('login', 'fr') },
        { label: 'Démarrer l’essai gratuit', href: authHref('signup', 'fr') },
      ],
    },
    {
      title: 'Fonctionnalités',
      links: [
        { label: 'Création et publication de contenu', href: '/fr/features/seo-geo-content-publishing' },
        { label: 'Suivi de position dans Google organique', href: '/fr/features/google-organic-rank-tracking' },
        { label: 'Suivi de position dans Google Maps', href: '/fr/features/google-maps-rank-tracking' },
        { label: 'Suivi de la visibilité dans les IA', href: '/fr/features/ai-visibility-tracking' },
        { label: 'Rapports SEO et GEO', href: '/fr/features/seo-geo-reports' },
        { label: 'Recherche de mots-clés', href: '/fr/features/keyword-research' },
        { label: 'Corrections sur le site', href: '/fr/features/site-health-fixes' },
        { label: 'Liens vers votre site', href: '/fr/features/site-links' },
        { label: 'Publications Google Maps', href: '/fr/features/google-maps-posts' },
        { label: 'Fiche d’établissement Google', href: '/fr/features/google-business-profile' },
        { label: 'Vous face aux concurrents', href: '/fr/features/competitor-tracking' },
        { label: 'Données Search Console', href: '/fr/features/search-console' },
      ],
    },
    {
      title: 'Pour qui',
      links: [
        { label: 'Chefs d’entreprise', href: '/fr/solutions/businesses' },
        { label: 'Agences', href: '/fr/solutions/agencies' },
        { label: 'Sites WordPress', href: '/fr/solutions/wordpress' },
        { label: 'Boutiques Shopify', href: '/fr/solutions/shopify' },
      ],
    },
    {
      title: 'Comparatifs',
      links: [
        { label: 'Tous les comparatifs', href: '/fr/compare' },
        { label: 'Go Top SEO face à Semrush', href: '/fr/compare/semrush' },
        { label: 'Go Top SEO face à Yoast', href: '/fr/compare/yoast' },
        { label: 'Go Top SEO face à Rank Math', href: '/fr/compare/rankmath' },
        { label: 'Go Top SEO face à Surfer', href: '/fr/compare/surfer' },
        { label: 'Go Top SEO face à Writesonic', href: '/fr/compare/writesonic' },
        { label: 'Go Top SEO face à BrightLocal', href: '/fr/compare/brightlocal' },
        { label: 'Go Top SEO face à Booster SEO', href: '/fr/compare/booster' },
      ],
    },
    {
      title: 'Mentions légales',
      links: [
        { label: 'Politique de confidentialité', href: '/fr/privacy' },
        { label: 'Conditions d’utilisation', href: '/fr/terms' },
        { label: 'Politique d’annulation et de remboursement', href: '/fr/refund-policy' },
        { label: 'Accessibilité', href: '/fr/accessibility' },
        { label: 'Contrat du programme de partenariat', href: '/fr/affiliate-terms' },
      ],
    },
  ]

  const articleSection: SitemapSection[] = sitemapArticleSection('Articles du site', articles)

  return (
    <LegalFrame locale="fr" breadcrumbs={[{ label: 'Plan du site', href: '/fr/sitemap' }]}>
      <LegalHeader title="Plan du site" subtitle="Retrouvez ici toutes les pages et toutes les sections de Go Top SEO" />

      <SitemapGroups groups={[...sections, ...articleSection]} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Pour en savoir plus, consultez notre{' '}
        <Link href="/fr/about" className={`${LEGAL_LINK} mx-1`}>
          page à propos
        </Link>
        ou{' '}
        <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>
          écrivez-nous
        </a>
      </p>
    </LegalFrame>
  )
}
