import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingFr } from '@/lib/i18n/public/landing-fr'

export const metadata: Metadata = {
  title: 'Rédaction, planification et publication de contenu SEO et GEO | Go Top SEO',
  description:
    "Planifiez des sujets, recevez un article complet rédigé par IA, modifiez-le, programmez-le et publiez-le directement sur WordPress ou Shopify, le tout au même endroit.",
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="fr" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['fr']

const faqs = [
  {
    q: "Dois-je relire chaque article avant sa publication ?",
    a: "Ce n’est pas obligatoire, mais vous pouvez toujours le faire. Seuls les sujets que vous avez validés sont rédigés, chaque article passe un contrôle qualité avant sa publication, et vous pouvez le lire, le modifier et le valider avant qu’il ne sorte.",
  },
  {
    q: 'Sur quels sites puis-je publier ?',
    a: "La publication directe fonctionne avec WordPress et Shopify. Connectez votre site une fois, et les articles validés y partent directement.",
  },
  {
    q: 'Comment fonctionne la planification ?',
    a: "Quand vous validez un article, publiez-le tout de suite ou choisissez une date et une heure. La plateforme publie seule le moment venu.",
  },
  {
    q: 'Les articles arrivent-ils avec des images et des titres SEO ?',
    a: "Oui. Chaque article arrive avec une image à la une et des images dans le texte, un méta-titre et une méta-description, et tout reste modifiable avant publication.",
  },
  {
    q: 'Comment fonctionne le quota d’articles ?',
    a: "Chaque formule comprend un nombre d’articles par mois. Le quota est rattaché au compte, il se renouvelle chaque mois, et les articles non utilisés ne se cumulent pas. Créer un article en consomme un ; le modifier, le programmer et le publier ne consomment rien.",
  },
  {
    q: "Et s’ils sont épuisés en milieu de mois ?",
    a: "Passez à une formule qui comprend plus d’articles et continuez dans le même mois.",
  },
  {
    q: 'Puis-je essayer avant de payer ?',
    a: `Oui. Un essai de ${TRIAL_CATALOG.days} jours sans carte bancaire, avec un article inclus pour voir tout le parcours jusqu’à la publication.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Rédaction et publication',
    eyebrowIcon: FileText,
    title: 'Des articles rédigés et publiés sur votre site,',
    accent: "sans équipe de contenu",
    subtitle: "Planifiez des sujets, validez-les et recevez un article complet avec des images, une section de questions-réponses et un maillage interne. Modifiez-le si vous le souhaitez, puis publiez-le sur WordPress ou Shopify, tout de suite ou à la date que vous choisissez.",
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingFr.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Pourquoi le contenu bloque',
      title: 'Le contenu est toujours remis à plus tard parce que ce sont en réalité trois métiers',
      intro: "Trouver un sujet, le rédiger et le mettre en ligne. Chacun prend du temps, alors on reporte au mois suivant. Ici, les trois se font au même endroit.",
      items: [
        { icon: Search, title: 'Trouver de quoi parler', body: "Vérifier ce que les gens cherchent, ce que les concurrents couvrent déjà et ce qui manque sur votre site." },
        { icon: PenLine, title: 'Bien écrire', body: "Un bon brouillon prend des heures, et il faut encore le reprendre et le relire." },
        { icon: Send, title: 'Le mettre en ligne', body: "Copier, charger les images, remplir les champs SEO et penser à cliquer sur publier." },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Comment ça marche',
      title: "Du sujet à l’article publié en cinq étapes",
      items: [
        { title: 'Planifiez des sujets', body: "La plateforme propose des sujets à partir des mots-clés de votre activité et de votre secteur." },
        { title: 'Validez', body: 'Choisissez les sujets qui ont du sens maintenant. Seuls ceux-là sont rédigés.' },
        { title: 'Recevez un article complet', body: 'Titre, corps de texte, intertitres, images, une section de questions-réponses et un maillage interne.' },
        { title: 'Relisez et modifiez', body: 'Lisez, changez tout ce que vous voulez, et validez quand vous êtes prêt.' },
        { title: 'Programmez ou publiez', body: "Tout de suite, ou à la date et à l’heure que vous choisissez, directement sur WordPress ou Shopify." },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Dans chaque article',
      title: 'Un article complet, pas un texte brut',
      items: [
        { icon: FileText, title: 'Un article entier', body: "Le sujet que vous avez validé devient un article complet, pas un résumé ni un plan." },
        { icon: ImageIcon, title: 'Des images', body: "Une image à la une et des images dans le texte, sans avoir à les chercher ni à les charger." },
        { icon: ListChecks, title: 'Questions-réponses et données structurées', body: "Une section de questions-réponses dans chaque article. Sur les sites WordPress équipés du plugin Go Top, des données structurées que Google et les moteurs d’IA savent lire sont également ajoutées." },
        { icon: Link2, title: 'Maillage interne', body: "Des liens proposés vers d’autres pages de votre site, et c’est vous qui validez lesquels entrent." },
        { icon: FileCheck2, title: 'Méta-titre et méta-description', body: 'Rédigés pour la recherche, et modifiables comme tout le reste.' },
        { icon: ShieldCheck, title: 'Un contrôle qualité avant publication', body: "Chaque article est relu avant de sortir : rien n’est publié à moitié." },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Publication directe',
      title: 'Connectez une fois, publiez sans copier-coller',
      intro: "Un article que vous avez validé part directement sur votre site, avec vos images et vos champs SEO.",
      items: [
        { icon: Globe, title: 'WordPress', body: "Connectez votre site WordPress et publiez-y des articles tout de suite ou à la date prévue." },
        { icon: ShoppingBag, title: 'Shopify', body: "Connectez votre boutique Shopify et publiez les articles du blog directement depuis la plateforme." },
      ],
    },
    { kind: 'faq', eyebrow: 'Questions', title: "Ce que l’on demande sur la rédaction et la publication", items: faqs },
  ],
  cta: {
    title: 'Votre prochain article peut être rédigé aujourd’hui',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
