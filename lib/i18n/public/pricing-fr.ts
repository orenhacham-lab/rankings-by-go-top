/**
 * The French pricing page's words around the plan grid
 * (app/(public)/fr/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise. The badge says what it is, a
 * recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in France sees the same dollar
 * price every market outside Israel is billed in today, because France's own
 * local price is not set yet. Nothing here promises a currency, and the French
 * page never names euros.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingFr: PricingCopy = {
  hero: {
    eyebrow: 'Tarifs',
    title: 'Tout ce qu’il faut pour être trouvé,',
    accent: 'pour un prix mensuel',
    subtitle: 'Des articles rédigés et publiés sur votre site, le suivi de vos positions dans Google et dans Google Maps, et une vérification de ce que ChatGPT et Gemini recommandent. Choisissez la formule selon vos besoins et commencez par un essai gratuit.',
    trust: [`${DAYS} jours d’essai gratuit`, 'Sans carte bancaire', 'Résiliez quand vous voulez depuis votre tableau de bord'],
  },
  plans: {
    perMonth: '/mois',
    popular: 'Notre choix',
    cta: `Essayer gratuitement ${DAYS} jours`,
    dashboard: 'Aller à mon tableau de bord',
    noCard: 'Sans carte bancaire',
    checksNote: CHECKS_EXPLAINER.fr,
    taxNote: {
      ILS: 'Les prix incluent la TVA israélienne. C’est le montant que vous payez, sans rien en plus.',
      USD: 'Lors d’un paiement par carte, le vendeur est Creem, en tant que marchand enregistré : il calcule la taxe d’après votre adresse de facturation et affiche le montant final avant le paiement. Les prix indiqués ici ne l’incluent pas.',
    },
    everyPlanLabel: 'Dans toutes les formules',
    everyPlan: [
      'Publication programmée automatique sur WordPress, Shopify et Wix',
      'Le suivi de votre position dans Google et dans Google Maps',
      'Une vérification de savoir si 6 moteurs d’IA, comme ChatGPT et Gemini, vous citent',
      'Une note de santé du site avec la liste des corrections',
      'Des rapports PDF et Excel que vous pouvez envoyer',
      'Un accompagnement personnel',
    ],
  },
  unsure: {
    text: 'Pas encore convaincu ? Commencez par un audit gratuit de votre site.',
    cta: 'Auditer mon site',
  },
  included: {
    eyebrow: 'Dans toutes les formules',
    title: 'Sans options. Tout est inclus dès le premier jour.',
    body: 'Les formules ne diffèrent que par le volume : combien de sites, combien d’articles et combien de vérifications vous avez chaque mois. Les fonctionnalités sont les mêmes dans toutes.',
    items: [
      {
        title: 'Des articles rédigés et publiés',
        desc: 'La plateforme rédige des articles complets sur les sujets que vous validez, avec des images, une section de questions-réponses et un maillage interne, et les publie sur votre site selon un calendrier.',
      },
      {
        title: 'Suivi dans Google et dans Google Maps',
        desc: 'Voyez à quelle position vous apparaissez pour chaque expression qui compte, dans la recherche classique et dans Maps, et comment cela évolue dans le temps.',
      },
      {
        title: 'Visibilité dans les moteurs d’IA',
        desc: 'Vérifiez si ChatGPT, Gemini, Perplexity, Copilot, Grok et Google AI vous citent, et qui ils citent à votre place.',
      },
      {
        title: 'Recherche de mots-clés',
        desc: 'La plateforme trouve ce que vos clients recherchent et demandent, et vous suggère par où commencer.',
      },
      {
        title: 'Des rapports que vous pouvez envoyer',
        desc: 'Vos positions, vos tendances et votre visibilité dans les IA dans un rapport PDF ou Excel fait en un clic, prêt pour un client ou pour la direction.',
      },
      {
        title: 'Un accompagnement personnel',
        desc: 'Ce sont de vraies personnes qui vous répondent, sur WhatsApp et par e-mail.',
      },
    ],
  },
  value: {
    eyebrow: 'Pourquoi cela vaut le coup',
    title: 'Un abonnement à la place de trois métiers',
    body: 'D’habitude il vous faut quelqu’un pour choisir les sujets et rédiger, quelqu’un pour mettre le tout en ligne, et un outil pour vérifier si cela a marché. Ici, tout se passe au même endroit.',
    items: [
      {
        title: 'Le travail est fait, pas seulement mesuré',
        desc: 'Ce n’est pas un rapport de plus qui attend que quelqu’un agisse. La plateforme rédige et publie les articles elle-même, uniquement sur les sujets que vous avez validés.',
      },
      {
        title: 'Vous voyez exactement ce que vous payez',
        desc: 'Les articles publiés, les évolutions de position et les citations dans les IA sur un même tableau de bord, et dans un rapport que vous pouvez transmettre à qui vous voulez.',
      },
      {
        title: 'Sans engagement',
        desc: `Un essai de ${DAYS} jours sans carte bancaire, un paiement mensuel et une résiliation quand vous voulez depuis votre tableau de bord.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Comment l’usage est compté',
    title: 'Sans petits caractères',
    body: 'Trois unités simples, et chaque quota se renouvelle tous les mois.',
    items: [
      {
        title: 'Article',
        desc: 'Créer un nouvel article consomme une unité de votre quota. Modifier, programmer ou publier un article existant ne consomme rien.',
      },
      {
        title: 'Vérification de position dans Google',
        desc: 'Voir à quelle position un mot-clé apparaît, à un seul endroit : Google ou Google Maps. Le même mot-clé dans les deux compte pour deux vérifications.',
      },
      {
        title: 'Vérification de visibilité dans les IA',
        desc: 'Poser une question à un moteur d’IA et voir si votre entreprise est citée. La même question dans ChatGPT et dans Gemini compte pour deux vérifications.',
      },
    ],
    note: 'Le quota d’articles est par compte. Dans les formules à plusieurs sites, il est partagé entre tous vos sites.',
  },
  faq: {
    eyebrow: 'Questions',
    title: 'Ce que l’on demande avant de choisir une formule',
    body: 'Vous n’avez pas trouvé votre réponse ? Écrivez-nous sur WhatsApp.',
    items: [
      {
        q: 'Quelle formule nous convient ?',
        a: `Basic et Advanced sont faites pour un seul site, et la principale différence entre elles est le nombre d’articles par mois : ${BASIC_ARTICLES} contre ${ADVANCED_ARTICLES}. Premium est faite pour ceux qui gèrent plus d’un site, et Agency pour gérer les sites de clients. Vous pouvez commencer petit et changer de formule quand vous voulez.`,
      },
      {
        q: 'Que comprend l’essai gratuit ?',
        a: `${DAYS} jours sans carte bancaire : un site, jusqu’à ${TRIAL_CATALOG.maxKeywordsPerProject} mots-clés, jusqu’à ${TRIAL_CATALOG.maxGoogleChecksLifetime} vérifications de position dans Google, jusqu’à ${TRIAL_CATALOG.maxAIChecksLifetime} vérifications de visibilité dans les IA et un article, pour que vous voyiez tout le processus, du début jusqu’à la publication.`,
      },
      {
        q: `Que se passe-t-il à la fin de l’essai de ${DAYS} jours ?`,
        a: 'Vous choisissez une formule et vous reprenez là où vous en étiez. Si vous n’en choisissez aucune, rien ne vous est facturé, parce que nous ne vous avons jamais demandé de carte.',
      },
      {
        q: 'Pouvons-nous changer de formule ou résilier ?',
        a: 'Oui. Changez de formule quand vous voulez et les nouveaux quotas s’appliquent à partir de ce moment-là. Résiliez depuis votre tableau de bord, sans pénalité ni frais de résiliation.',
      },
      {
        q: 'Que deviennent les articles que nous n’utilisons pas ?',
        a: 'Le quota se renouvelle tous les mois, et les articles non utilisés ne se reportent pas sur le mois suivant.',
      },
      {
        q: 'Les analyses se lancent-elles toutes seules ?',
        a: 'Lancez une analyse manuelle quand vous voulez, ou activez une analyse mensuelle automatique qui se lance toute seule chaque mois. Il n’y a pour l’instant pas d’analyse automatique quotidienne ni hebdomadaire.',
      },
      {
        q: 'Les articles peuvent-ils être programmés et publiés automatiquement ?',
        a: 'Oui. Programmez un article à une date future, ou publiez-le tout de suite sur un site connecté : WordPress, Shopify ou Wix.',
      },
      {
        q: 'Comment nos données sont-elles protégées ?',
        a: 'Tout le trafic est chiffré (SSL/TLS), les mots de passe sont stockés chiffrés et chaque compte ne voit que ses propres données. Les informations ne sont partagées qu’avec les prestataires sur lesquels la plateforme fonctionne, comme l’hébergement, les paiements et les données de recherche, conformément à la politique de confidentialité.',
        // The privacy policy exists in this language (content/legal/fr, rendered
        // by app/(public)/fr/privacy), so the link stays inside the language the
        // reader chose. It used to point at /en/privacy, left over from the
        // months when only the English document existed — which meant a reader
        // on this page was handed an English policy, the one thing the site's
        // language rule forbids.
        link: { label: 'Lire la politique de confidentialité', href: '/fr/privacy' },
      },
    ],
  },
  cta: {
    title: 'Vous voulez d’abord voir ce que la plateforme trouve sur votre site ?',
    body: `L’audit gratuit lit votre site et vous renvoie une première synthèse de recherche, sans inscription. Ou ouvrez un essai de ${DAYS} jours et essayez tout.`,
    check: 'Auditer mon site gratuitement',
    trial: 'Commencer l’essai gratuit',
    dashboard: 'Aller à mon tableau de bord',
  },
}
