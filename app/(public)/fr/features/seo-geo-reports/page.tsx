import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingFr } from '@/lib/i18n/public/landing-fr'

export const metadata: Metadata = {
  title: 'Rapports SEO et GEO | Go Top SEO',
  description: "Des rapports PDF et Excel professionnels avec vos positions, vos tendances et l’analyse de vos concurrents, prêts à envoyer à un client en quelques secondes.",
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="fr" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['fr']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Rapports',
    eyebrowIcon: ChartColumn,
    title: 'Un rapport qui montre ce qui a changé,',
    accent: 'en un clic',
    subtitle: "Vos positions dans Google et dans Maps et votre visibilité dans les moteurs d’IA, dans un rapport PDF ou Excel prêt à envoyer à un client, à votre direction, ou à vous-même.",
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingFr.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Pourquoi un rapport',
      title: 'Le bon travail doit se voir',
      intro: 'Un rapport clair évite les explications et montre que le site avance.',
      items: [
        { icon: Eye, title: 'La vue complète', body: "Google, Maps et les IA au même endroit, au lieu de captures d’écran venues de plusieurs outils." },
        { icon: Clock, title: 'Rien à assembler à la main', body: 'Les données sont déjà dans la plateforme. Le rapport se construit à partir de ces données en un clic.' },
        { icon: Handshake, title: 'La confiance du client', body: "Pour les agences : un rapport régulier montre au client ce qui a changé et pourquoi continuer." },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Comment ça marche',
      title: 'Des données au rapport en trois étapes',
      items: [
        { title: 'Choisissez un projet', body: 'Chaque site est son propre projet, avec ses propres rapports.' },
        { title: 'Exportez', body: 'Un PDF à envoyer, ou un Excel pour travailler les données.' },
        { title: 'Envoyez', body: "À un client, à votre direction ou à un associé, sans rien à mettre en page." },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Ce que contient le rapport',
      title: "Tout ce qui compte, rien de ce qui ne compte pas",
      items: [
        { icon: TrendingUp, title: 'Positions et évolutions', body: "Pour chaque expression : la position du jour, la précédente, et l’écart entre les deux." },
        { icon: ArrowUpDown, title: 'La page qui se positionne', body: 'Quelle page de votre site ressort sur chaque expression.' },
        { icon: ChartColumn, title: 'Trafic estimé', body: 'Une estimation des visites venues de Google, selon le volume de recherche et la position actuelle.' },
        { icon: Sparkles, title: 'Visibilité dans les IA', body: "Les mentions et les citations de votre site, moteur d’IA par moteur d’IA." },
        { icon: History, title: 'Historique complet', body: "Dans le fichier Excel : toutes les vérifications dans le temps, pas seulement la dernière." },
        { icon: FileSpreadsheet, title: 'PDF et Excel', body: 'Un PDF soigné à envoyer, et un Excel pour qui veut travailler les chiffres.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: 'Ce que l’on demande sur les rapports',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete French block, so the export really does come out
        // in French. Keep this answer and those two files in step.
        { q: 'Dans quelles langues sortent les rapports ?', a: "Le rapport sort dans la langue de votre tableau de bord, et le français en fait partie, aux côtés de l’hébreu, de l’anglais, de l’espagnol et du portugais." },
        { q: 'Puis-je faire un rapport distinct pour chaque client ?', a: 'Oui. Chaque site est son propre projet, et chaque projet a son propre rapport. Le nombre de projets de chaque formule figure sur la page des tarifs.' },
        { q: 'Les rapports sont-ils inclus dans toutes les formules ?', a: 'Oui. Les rapports PDF et Excel sont inclus dans toutes les formules.' },
      ],
    },
  ],
  cta: {
    title: 'Votre premier rapport est à quelques jours',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
