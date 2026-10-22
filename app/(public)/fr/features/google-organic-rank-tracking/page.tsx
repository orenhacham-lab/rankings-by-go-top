import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingFr } from '@/lib/i18n/public/landing-fr'

export const metadata: Metadata = {
  title: 'Suivi de position dans Google organique | Go Top SEO',
  description: "Suivez vos positions dans Google par mot-clé, lieu, langue et appareil. Lancez une analyse quand vous voulez, ou une fois par mois automatiquement, avec des rapports de tendances et de concurrence.",
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="fr" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['fr']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Vos positions dans Google',
    eyebrowIcon: TrendingUp,
    title: 'Sachez à quelle position vous êtes dans Google,',
    accent: 'et si le travail porte ses fruits',
    subtitle: "Suivez chaque expression qui compte pour vous, par pays, par ville, par langue et par appareil. Analysez quand vous voulez, ou une fois par mois automatiquement, avec l’historique de chaque changement.",
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingFr.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Pourquoi mesurer',
      title: "Ce qui n’est pas mesuré ne s’améliore pas",
      intro: "Sans suivi, impossible de savoir si un nouvel article, une modification du site ou le travail d’une agence ont changé quelque chose.",
      items: [
        { icon: LineChart, title: 'Voyez la tendance', body: "En hausse, en baisse ou stable sur chaque expression, d’une analyse à la suivante." },
        { icon: FileText, title: 'Reliez le contenu au résultat', body: "Voyez quelles pages progressent après la publication d’un article, et sur quoi écrire ensuite." },
        { icon: Target, title: 'Concentrez-vous sur ce qui est proche', body: "Les expressions juste sous la première page sont souvent l’occasion la plus proche. Le suivi vous montre lesquelles." },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Comment ça marche',
      title: 'Réglez une fois, voyez chaque changement',
      items: [
        { title: 'Ajoutez vos expressions', body: 'Saisissez les expressions qui comptent pour vous, ou ajoutez-les depuis la recherche de mots-clés en un clic.' },
        { title: "Choisissez le lieu et l’appareil", body: 'Pays, langue, ville, ordinateur ou mobile, parce que les résultats changent avec chacun.' },
        { title: 'Analysez et suivez la tendance', body: "Lancez une analyse à la main quand vous voulez, ou une analyse mensuelle automatique qui tourne seule. Chaque résultat est conservé dans votre historique." },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Ce que vous recevez',
      title: 'Une image précise de votre place dans Google',
      items: [
        { icon: Smartphone, title: 'Ordinateur et mobile, séparément', body: 'Les résultats sur mobile et sur ordinateur ne sont pas toujours les mêmes. Vérifiez chacun pour lui-même.' },
        { icon: Globe, title: 'Par pays, par ville et par langue', body: "Voyez ce que voit un client lorsqu’il cherche depuis le lieu qui compte pour vous." },
        { icon: Link2, title: 'La page qui se positionne', body: 'Pour chaque expression, quelle page de votre site ressort dans les résultats.' },
        { icon: History, title: 'Historique complet', body: "Chaque analyse est conservée : vous voyez le chemin parcouru, et pas seulement la photo du jour." },
        { icon: MapPin, title: 'Google Maps aussi', body: 'Suivez les mêmes expressions dans Maps, par ville ou par zone.' },
        { icon: FileSpreadsheet, title: 'Des rapports PDF et Excel', body: "Les positions, les évolutions et l’historique dans un rapport que vous pouvez transmettre à qui vous voulez." },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: "Ce que l’on demande sur le suivi de position",
      items: [
        { q: 'À quelle fréquence les positions sont-elles vérifiées ?', a: "Chaque fois que vous lancez une analyse à la main, et vous pouvez aussi activer une analyse mensuelle automatique. Il n’y a pour l’instant aucune analyse automatique quotidienne ni hebdomadaire." },
        { q: 'Pourquoi ce que je vois dans Google ne correspond-il pas à la plateforme ?', a: "Google personnalise les résultats selon le lieu, l’appareil et l’historique de recherche. La plateforme vérifie dans des conditions fixes que vous définissez, ce qui en fait une meilleure mesure pour comparer dans le temps." },
        { q: "Combien d’expressions puis-je suivre ?", a: 'Cela dépend de votre formule. Les quotas exacts figurent sur la page des tarifs.' },
      ],
    },
  ],
  cta: {
    title: "Découvrez où vous en êtes aujourd’hui",
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
