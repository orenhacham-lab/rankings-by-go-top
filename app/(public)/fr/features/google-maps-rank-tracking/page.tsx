import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Suivi de position dans Google Maps | Go Top SEO',
  description: "Suivez votre visibilité locale dans Google Maps. Vérifiez votre position ville par ville et zone par zone, le point de départ du référencement local.",
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="fr" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['fr']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: "Quand quelqu’un cherche près de chez lui une entreprise comme la vôtre,",
    accent: 'sachez où vous êtes sur la carte',
    subtitle: "Suivez votre position dans Google Maps par expression et par zone : une ville, ou un point précis de la carte. Voyez qui vous précède et comment votre position bouge dans le temps.",
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // The example is a French market, not a translated American one: the same
    // choice as the French landing page’s demo (Lyon, ClimaPoint). The figures
    // are the sample ones the English and Spanish pages already show, so no new
    // rating or review count is invented here.
    visual: (
      <MapsVisual
        positionLabel="Votre position"
        position="3"
        positionSub='à Lyon, "installation climatisation"'
        changeLabel="Ce mois-ci"
        change="2"
        changeSub="places gagnées"
        reviewsLabel="avis"
        rows={[
          { rank: 1, name: 'ClimaPoint Lyon', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Confort Lyonnais', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Votre entreprise', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Air Nord Climatisation', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Pourquoi la carte',
      title: "Dans la recherche locale, la carte est la vitrine",
      intro: "Quand quelqu’un cherche un service près de chez lui, Google montre d’abord quelques entreprises sur la carte. C’est là que se décide à qui on téléphone.",
      items: [
        { icon: Phone, title: "C’est de là que viennent les appels", body: "Dans les résultats de la carte, les gens appellent, demandent l’itinéraire ou ouvrent votre site d’un seul geste." },
        { icon: Users, title: 'Peu de places, beaucoup de concurrents', body: "Seule une poignée d’entreprises occupe les premières places. Vous devez savoir si vous en faites partie." },
        { icon: MapPin, title: 'Chaque zone est une course à part', body: "Vous pouvez être premier dans une ville et absent de la commune voisine. Le suivi par zone le montre." },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Comment ça marche',
      title: 'Trois étapes pour voir clair sur la carte',
      items: [
        { title: 'Renseignez votre entreprise', body: 'Ajoutez votre entreprise et la zone que vous desservez.' },
        { title: 'Choisissez les expressions et les zones', body: 'Par exemple « installation climatisation » à Lyon, ou à partir d’un point précis de la carte.' },
        { title: "Suivez l’évolution", body: "Analysez à la main quand vous voulez, ou une fois par mois automatiquement, avec l’historique de chaque changement." },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Ce que vous recevez',
      title: 'Votre place sur la carte, sans supposition',
      items: [
        { icon: MapPin, title: 'Par ville ou par zone', body: 'Vérifiez chaque expression dans la zone où se trouvent vos clients.' },
        { icon: Navigation, title: 'Un point précis de la carte', body: "Vérifiez depuis les coordonnées que vous choisissez, pour voir ce que voit un client qui se trouve juste là." },
        { icon: Store, title: 'Qui vous précède', body: "Les entreprises qui ressortent au-dessus de vous dans les résultats, avec leur note Google." },
        { icon: History, title: 'Historique des positions', body: "Voyez comment votre position a évolué d’une analyse à la suivante." },
        { icon: Search, title: 'La recherche classique aussi', body: 'Suivez les mêmes expressions dans les résultats classiques de Google.' },
        { icon: FileSpreadsheet, title: 'Des rapports PDF et Excel', body: 'Vos positions dans Maps entrent dans un rapport que vous pouvez transmettre à qui vous voulez.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: "Ce que l’on demande sur le suivi dans Maps",
      items: [
        { q: "Ai-je besoin d’une fiche Google Business Profile ?", a: "Pour apparaître dans Maps, il faut une fiche Google Business Profile. Le suivi montre où votre fiche ressort, ou si elle ne ressort pas." },
        { q: 'À quelle fréquence ma position est-elle vérifiée ?', a: "Chaque fois que vous lancez une analyse à la main, et vous pouvez aussi activer une analyse mensuelle automatique. Il n’y a pour l’instant aucune analyse automatique quotidienne ni hebdomadaire." },
        { q: 'Chaque expression dans Maps compte-t-elle pour une vérification à part ?', a: "Oui. Une vérification dans Google, c’est une expression dans un lieu : la même expression dans la recherche classique et dans Maps compte donc pour deux vérifications." },
      ],
    },
  ],
  cta: {
    title: 'Découvrez qui récolte les appels dans votre zone',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
