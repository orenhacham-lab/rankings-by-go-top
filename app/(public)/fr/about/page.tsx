import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function FrenchAboutPage() {
  return <AboutPage locale="fr" copy={COPY} />
}

/**
 * The same page as the Hebrew, English and Spanish ones, in French. Every
 * claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the French
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['fr'], href: '/fr/about' },
  title: '11 ans de SEO,',
  accent: 'dans une plateforme qui travaille pour vous.',
  subtitle: "Une seule plateforme qui rédige et publie des articles sur votre site, suit votre position dans Google et dans Google Maps, et vérifie si les moteurs d’IA vous recommandent. Elle est construite par Go Top, une agence digitale forte de plus de 11 ans d’expérience en référencement naturel et en publicité payante.",
  who: {
    title: 'Qui est derrière la plateforme',
    paragraphs: [
      "Go Top SEO est construit par Go Top, une agence digitale forte de plus de 11 ans d’expérience en référencement naturel, en publicité payante et en création de sites pour des entreprises en Israël et à l’étranger.",
      "La plateforme est née de notre travail quotidien avec nos clients : nous avons vu quels rapports les gens comprennent vraiment, quelles données les aident à décider, et où le temps se perd. Nous avons donc construit un seul endroit où le contenu est rédigé, publié et mesuré, dans Google comme dans les moteurs d’IA.",
    ],
  },
  founderEyebrow: 'La personne derrière le projet',
  gaps: {
    title: 'Ce qui manquait, et ce que nous avons construit à la place',
    body: "Nous voulions qu’une entreprise puisse faire tout ce qu’il faut pour être trouvée, au même endroit, sans avoir à apprendre le référencement naturel.",
    missingLabel: 'Ce qui manquait',
    builtLabel: 'Ce que nous avons construit',
    rows: [
      {
        pain: { title: 'Le suivi de position à la main prend trop de temps', description: 'Vérifier les mêmes mots-clés encore et encore, plusieurs écrans de résultats et des calculs faits à la main qui pèsent sur la journée.' },
        answer: { title: 'Vos positions dans Google et dans Google Maps', description: "Le suivi de chaque expression dans la recherche classique et dans Maps, par zone et par appareil, avec l’historique de chaque changement." },
      },
      {
        pain: { title: 'Des données éparpillées entre les outils', description: "Les positions dans Google, dans Maps, dans les moteurs d’IA et ailleurs, sans une seule image claire." },
        answer: { title: 'Tout au même endroit', description: 'La recherche de mots-clés, les positions, la visibilité dans les IA et vos articles sont reliés entre eux, et non répartis dans quatre outils différents.' },
      },
      {
        pain: { title: "Les moteurs d’IA font désormais partie de la recherche", description: 'De plus en plus de clients posent leur question à ChatGPT, à Gemini ou à Google AI. Vous devez savoir si votre entreprise figure dans la réponse.' },
        answer: { title: 'Suivi de la visibilité dans les IA', description: 'Voyez si votre entreprise est mentionnée, citée ou recommandée dans les réponses de ChatGPT, de Gemini et de Google AI.' },
      },
      {
        pain: { title: 'Du contenu qui reste en route', description: "Savoir sur quoi écrire, c’est la moitié du travail. Encore faut-il le rédiger, le mettre en ligne et le mesurer." },
        answer: { title: 'Des articles rédigés et publiés', description: 'Des articles complets sur les sujets que vous validez, avec des images, une section de questions-réponses et un maillage interne, publiés sur WordPress ou Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Notre façon de travailler',
    items: [
      {
        title: 'Transparence',
        description: "Nous disons ce qui est mesuré, d’où viennent les données et ce qu’elles veulent dire. Aucun indicateur gonflé.",
      },
      {
        title: 'Des données utiles',
        description: "Des rapports qui racontent une histoire d’entreprise claire, pas seulement de jolis chiffres.",
      },
      {
        title: 'Une interface simple',
        description:
          "Un seul écran pour votre contenu, vos positions dans Google et dans Maps et votre visibilité dans les IA, sans bruit inutile.",
      },
      {
        title: 'SEO et GEO ensemble',
        description: "Du contenu pensé pour Google et pour les moteurs d’IA, et la mesure des deux.",
      },
    ],
  },
  choose: {
    title: 'Pourquoi choisir Go Top SEO',
    items: [
      {
        title: 'Un suivi personnel, sans compromis',
        description:
          'Pas de « chargé de compte » qui change tous les mois. Vous travaillez avec les mêmes professionnels, qui connaissent votre activité.',
      },
      {
        title: 'Une transparence totale',
        description: "Vous savez toujours ce qui se passe sur votre compte : ce qui a marché, ce qui n’a pas marché et comment progresser.",
      },
      {
        title: "De l’expertise sans le jargon",
        description: 'Pas de grands mots. Nous parlons de résultats que vous pouvez mesurer et comprendre.',
      },
      {
        title: 'Nous aussi, nous dirigeons une entreprise',
        description: 'Nous connaissons la pression, le budget serré et le besoin de voir des résultats, parce que nous le vivons aussi.',
      },
    ],
  },
  cta: {
    title: 'Vous voulez voir ce que nous pourrions faire de votre site ?',
    body: FEATURE_COMMON['fr'].closeBody,
    contact: 'Des questions ? Écrivez-nous :',
    updated: 'Cette page a été mise à jour pour la dernière fois en septembre 2026',
  },
}
