/**
 * The French home page's words (app/(public)/fr/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * French, addressing the reader as "vous" throughout: never "tu". The demo's
 * example business is in Lyon rather than in Austin: the French site opens in
 * France, and a demo full of US cities reads as a translated page rather than a
 * French one. Its names and figures are illustrative and the caption under the
 * demo says so, the same promise the other locales make.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/fr/features/...' here would ship
 * '/fr/fr/features/...'. That is the bug the Spanish launch hit.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press, no percentage or ranking promise. Prices come from the plan catalogue,
 * so the page cannot drift from it, and they are quoted in USD — the French
 * page never names euros.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. France's own price is not set yet, so the French
 * page shows the USD price every market outside Israel is billed in today,
 * grouped the French way.
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('fr-FR')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingFr: LandingCopy = {
  hero: {
    eyebrow: 'La promotion automatique dans Google et dans les moteurs d’IA, dans un seul système',
    title: 'Vos prochains clients sont déjà en train de chercher.',
    accent: 'Nous faisons en sorte qu’ils vous trouvent.',
    subtitle:
      'Go Top SEO rédige et publie des articles qui répondent à ce que vos clients recherchent, puis vous montre où vous apparaissez dans Google, Google Maps, ChatGPT et Gemini. Sans équipe de contenu. Sans deviner.',
    signup: `Essai gratuit de ${TRIAL_DAYS} jours`,
    trialNote: 'Sans carte bancaire, sans engagement. Résiliez quand vous voulez.',
    checkLead: 'Pas encore prêt à créer un compte ? Faites un audit gratuit de votre site, sans inscription :',
    dashboard: 'Aller à mon tableau de bord',
    trust: ['Publie sur WordPress et Shopify', 'Une assistance assurée par de vraies personnes'],
    climbChip: '3e position dans Google',
    published: 'Article publié sur votre site',
  },
  demo: {
    label: 'Une démonstration réelle de la plateforme',
    caption: 'Démonstration du produit. Les noms d’entreprises et les chiffres sont des exemples.',
    tabs: ['La remontée dans Google', 'Un nouvel article', 'Recommandé par les IA'],
    describe: [
      'L’écran des mots-clés : une expression passée de la 18e à la 3e position dans Google, et trois autres en progression.',
      'L’écran des articles : un nouvel article est rédigé, passe le contrôle qualité et attend sa publication programmée sur le site.',
      'L’écran de visibilité dans les IA : une réponse de ChatGPT qui recommande l’entreprise, et les moteurs qui la citent.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Tableau de bord', 'Mots-clés', 'Stratégie de contenu', 'Articles', 'Visibilité dans les IA', 'Rapports'],
    rank: {
      heading: 'Mots-clés',
      keyword: 'installation climatisation lyon',
      positionLabel: 'Position dans Google',
      period: 'Ces 8 dernières semaines',
      from: 18,
      to: 3,
      columns: ['Mot-clé', 'Position', 'Évolution'],
      rows: [
        { keyword: 'prix climatisation réversible', from: 24, to: 7 },
        { keyword: 'dépannage climatisation villeurbanne', from: 31, to: 9 },
        { keyword: 'nettoyage climatisation', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, Lyon',
      mapsValue: '2e position',
      toast: 'Vous avez gagné 15 places dans Google',
    },
    article: {
      heading: 'Nouvel article',
      title: 'Combien coûte l’installation d’une climatisation réversible, et quoi demander avant',
      subheading: 'Qu’est-ce qui fait le prix ?',
      checksTitle: 'Contrôle qualité',
      checks: ['Questions et réponses', 'Données structurées', 'Maillage interne', 'Image à la une', 'Titres guidés par la recherche'],
      draft: 'Rédaction',
      scheduled: 'Programmé',
      when: 'Mar. 9h00',
      toast: 'Publication sur WordPress',
    },
    ai: {
      heading: 'Visibilité dans les IA',
      question: 'Qui installe bien la climatisation à Lyon ?',
      intro: 'Voici quelques entreprises bien recommandées dans le secteur :',
      items: [
        { name: 'Air Rhône', desc: 'Installateurs qualifiés, garantie sur les travaux et réponse le jour même.', you: true },
        { name: 'ClimaPoint', desc: 'Des prix justes pour le nettoyage et l’entretien.' },
        { name: 'Confort Lyonnais', desc: 'Spécialistes des systèmes gainables.' },
      ],
      youTag: 'Votre entreprise',
      mentionedIn: 'Citée dans :',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT vous recommande',
    },
  },
  worksWith: {
    label: 'Nous vérifions et nous publions pour vous sur :',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: 'Ce que vous obtenez',
    title: 'Ce que Go Top SEO fait pour vous pendant que vous gérez votre entreprise',
    body: 'Ce n’est pas un outil de plus à apprendre. C’est un système qui fait le travail, puis vous en montre les résultats.',
    items: [
      {
        title: 'Du contenu qui amène des clients, pas seulement des visites',
        desc: 'La plateforme trouve ce que vos clients recherchent et demandent, rédige des articles complets sur le sujet et les publie sur votre site à un rythme régulier. Vous n’avez qu’à choisir les sujets.',
        chips: ['Se publie tout seul', 'Avec des images', 'Sections de questions', 'Maillage interne'],
      },
      {
        title: 'Une place dans les réponses de ChatGPT et de Gemini',
        desc: 'De plus en plus de gens interrogent les IA au lieu de chercher. Voyez si elles vous recommandent, qui elles recommandent à votre place, et ce qu’il faut améliorer.',
        chips: ['6 moteurs d’IA', 'Face à vos concurrents'],
      },
      {
        title: 'Une vision claire de ce qui fonctionne',
        desc: 'Vos positions dans Google et dans Maps, vos citations dans les IA et vos articles publiés sur un seul écran. Sans tableur et sans deviner.',
        chips: ['Rapports PDF et Excel', 'Historique complet'],
      },
    ],
    stats: [
      { value: 6, label: 'moteurs d’IA vérifiés', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok et Google AI' },
      { value: 3, label: 'canaux dans un seul rapport', detail: 'Google, Google Maps et les réponses des IA' },
      { value: 2, label: 'plateformes de publication', detail: 'WordPress et Shopify, sans copier-coller' },
      { value: TRIAL_DAYS, label: 'jours d’essai gratuit', detail: 'Sans carte bancaire' },
    ],
  },
  shift: {
    eyebrow: 'La recherche a changé',
    title: 'Les clients ne passent plus seulement par Google. Ils interrogent les IA et reçoivent trois recommandations.',
    body: 'Si votre site ne répond pas à leurs questions, ni dans Google ni dans une réponse de ChatGPT, cette recommandation part chez un concurrent. Presque aucune entreprise ne sait où elle en est, parce qu’aucun outil ne lui a montré les deux à la fois.',
    withoutTitle: 'Sans Go Top SEO',
    without: [
      'Un article tous les deux mois, quand quelqu’un trouve le temps',
      'Aucune idée claire de quoi écrire, ni de l’expression qui en vaut la peine',
      'Des positions vérifiées à la main, ou pas vérifiées du tout',
      'Aucune idée si ChatGPT vous recommande, vous ou un concurrent',
    ],
    withTitle: 'Avec Go Top SEO',
    with: [
      'Un calendrier de contenu régulier qui publie quand vous le décidez',
      'Des sujets choisis à partir de ce que vos clients recherchent vraiment',
      'Un suivi automatique de vos positions dans Google et dans Google Maps',
      'Des vérifications automatiques de ce que ChatGPT, Gemini et Google AI disent de vous, plus trois autres moteurs à la demande',
    ],
  },
  flow: {
    eyebrow: 'Comment ça marche',
    title: 'D’une adresse de site à du contenu qui fonctionne, en quatre étapes',
    body: 'Vous décidez ce qui est écrit. La plateforme fait le reste.',
    steps: [
      { tag: 'Gratuit, sans inscription', title: 'Auditez votre site', desc: 'Saisissez une adresse. En moins d’une minute, nous comprenons ce que fait l’entreprise, qui sont ses clients et ce qui vous retient dans Google et dans les IA.' },
      { tag: 'Vous validez', title: 'Recevez un plan', desc: 'Les expressions de recherche, les questions que posent les clients et une liste d’articles prêts à être rédigés. Vous choisissez ce qui entre.' },
      { tag: 'Automatique', title: 'Les articles sont rédigés et publiés', desc: 'Chaque article arrive avec ses images et sa section de questions-réponses, et paraît sur votre site à la date que vous avez programmée. Sur les sites WordPress équipés du plugin Go Top, des données structurées sont ajoutées également.' },
      { tag: 'Transparent', title: 'Suivez les résultats', desc: 'Vos positions dans Google et dans Maps, vos citations dans les IA et des rapports que vous pouvez envoyer à qui vous voulez.' },
    ],
    cta: 'Commencez par un audit gratuit',
  },
  features: {
    eyebrow: 'Ce qui est inclus',
    title: 'Tout ce dont vous avez besoin pour remonter, au même endroit',
    body: 'Quatre outils qui travaillent ensemble, pour que chaque article soit mesuré et que chaque mesure donne le prochain article.',
    more: 'En savoir plus',
    note: 'Les noms et les chiffres des captures sont des exemples.',
    content: {
      overline: 'Contenu et publication',
      title: 'Des articles écrits pour être trouvés, pas pour remplir un blog',
      body: 'Chaque article est construit autour d’une recherche réelle : des titres tirés de ce que les gens demandent, une section de questions-réponses, un maillage interne vers les pages qui vendent et, sur les sites WordPress équipés du plugin Go Top, des données structurées que Google et les moteurs d’IA lisent. Vous relisez, vous ajustez si besoin, et la plateforme publie.',
      points: ['Une image à la une et des images dans le texte', 'Un contrôle qualité avant chaque publication', 'Programmation et publication directe sur WordPress et Shopify'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'Cette semaine sur votre site',
        days: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
        items: [
          { day: 0, title: 'Comment choisir la climatisation d’une chambre', status: 'published', label: 'Publié' },
          { day: 2, title: 'Combien coûte l’installation d’une climatisation réversible', status: 'scheduled', label: 'Programmé' },
          { day: 4, title: 'Nettoyage de la climatisation : à quelle fréquence ?', status: 'writing', label: 'Rédaction' },
        ],
        destinationLabel: 'Publication sur',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'Visibilité dans les IA',
      title: 'Sachez quand ChatGPT vous recommande, et quand il choisit un concurrent',
      body: 'Nous posons aux moteurs d’IA les questions que posent vos clients et nous vérifions qui apparaît dans la réponse. Vous verrez sur quelles questions vous gagnez, où un concurrent emporte la recommandation, et ce qu’il faut améliorer sur votre site.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok et Google AI', 'Côte à côte avec vos concurrents', 'Des recommandations sur ce qu’il faut changer pour entrer dans la réponse'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Qui apparaît dans la réponse',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Qui installe la climatisation à Lyon ?', hits: [true, true, true, false, true, false] },
          { question: 'Combien coûte un nettoyage de climatisation ?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Part des citations',
        you: { label: 'Votre entreprise', value: 58 },
        rival: { label: 'Principal concurrent', value: 42 },
      },
    },
    rank: {
      overline: 'Positions dans Google',
      title: 'Voyez chaque remontée, dans Google et dans Google Maps',
      body: 'Suivez chaque expression qui compte pour vous, dans la recherche classique et dans Maps par ville ou par région, avec un historique qui montre si les articles font leur travail.',
      points: ['Google naturel par pays, langue et appareil', 'Google Maps par ville ou par région', 'Recherche de mots-clés avec le volume de recherche et la concurrence'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Vos mots-clés',
        columns: ['Mot-clé', 'Position', 'Évolution'],
        rows: [
          { keyword: 'installation climatisation lyon', pos: 3, up: 15 },
          { keyword: 'prix climatisation réversible', pos: 7, up: 17 },
          { keyword: 'dépannage climatisation villeurbanne', pos: 9, up: 22 },
          { keyword: 'nettoyage climatisation', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'Lyon', value: '2e position sur 20' },
      },
    },
    reports: {
      overline: 'Rapports',
      title: 'Un rapport que vous pouvez envoyer à un client ou à votre direction, en un clic',
      body: 'Exportez vos positions, vos tendances et votre visibilité dans les IA en PDF et en Excel. Les agences gèrent plusieurs sites clients depuis un seul compte, chacun dans son propre projet.',
      points: ['PDF et Excel en un clic', 'Plusieurs sites dans un seul compte', 'Toutes les données au même endroit, sans monter les rapports à la main'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Rapport de performance',
        period: 'Septembre',
        stats: [
          { label: 'Mots-clés en première page', value: '14', up: true },
          { label: 'Citations dans les IA', value: '9', up: true },
          { label: 'Articles publiés', value: '8' },
          { label: 'Position moyenne', value: '6,2', up: true },
        ],
        clientsLabel: 'Projets :',
        clients: ['air-rhone.fr', 'studio-dana.fr', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Pour qui',
    title: 'Pour tous ceux qui veulent que leur site amène des clients',
    body: 'Vous n’avez pas besoin de connaître le SEO. Vous avez besoin de savoir ce que vous vendez.',
    items: [
      {
        title: 'Chefs d’entreprise',
        desc: 'Vous voulez plus de contacts venus de Google sans apprendre le référencement naturel ni recruter un rédacteur. Validez les sujets, et le reste se fait tout seul.',
        gain: 'Un site qui travaille pendant que vous êtes occupé',
      },
      {
        title: 'Indépendants et agences',
        desc: 'Gérez plusieurs clients depuis un seul compte, produisez du contenu plus vite et remettez à chaque client un rapport clair.',
        gain: 'Plus de clients pour les mêmes heures de travail',
      },
      {
        title: 'Équipes marketing',
        desc: 'Tenez un rythme de publication régulier et voyez au même endroit ce que votre contenu fait dans Google et dans les IA.',
        gain: 'Une réponse claire à « est-ce que ça marche ? »',
      },
    ],
  },
  check: {
    eyebrow: 'Audit gratuit du site',
    title: 'Pas encore convaincu ? Laissez-nous vous montrer ce que nous voyons',
    body: 'L’audit lit réellement votre site et vous renvoie une première synthèse de recherche en moins d’une minute :',
    items: [
      'Ce que nous avons compris de l’entreprise et qui sont vos clients',
      'Quels concurrents apparaissent à côté de vous',
      'Ce qui vous retient dans Google, avec les preuves relevées sur votre site',
      'À quel point le site est prêt pour les réponses des IA',
      'La liste des articles que nous écririons pour vous',
    ],
    cta: 'Auditer mon site',
    note: 'Gratuit, sans inscription et sans carte bancaire.',
    preview: {
      domain: 'air-rhone.fr',
      heading: 'Votre première synthèse de recherche',
      scoreLabel: 'Préparation pour les IA',
      score: '3/4',
      findings: ['Les images n’ont pas de texte alternatif', 'Pas de section de questions-réponses', 'La métadescription n’a pas la bonne longueur'],
      lockedLabel: 'D’autres constats et concurrents se débloquent avec un compte gratuit',
    },
  },
  faq: {
    eyebrow: 'Questions',
    title: 'Ce que l’on demande le plus souvent avant de commencer',
    body: 'Vous n’avez pas trouvé votre réponse ? Écrivez-nous sur WhatsApp.',
    items: [
      {
        q: 'Je ne connais rien au SEO. Est-ce que c’est fait pour moi ?',
        a: 'Oui. La plateforme choisit les expressions, propose les sujets et rédige les articles. Il ne vous reste qu’à décider ce qui correspond à l’entreprise, et à valider.',
      },
      {
        q: 'Est-ce que quelque chose sera publié sur mon site sans que je le voie ?',
        a: 'Seuls les sujets que vous validez partent en rédaction, et chaque article passe un contrôle qualité avant sa publication. Vous pouvez relire et modifier n’importe quel article, et choisir quand il est publié.',
      },
      {
        q: 'Pourquoi ne pas l’écrire moi-même avec ChatGPT ?',
        a: 'Vous pouvez, mais alors c’est vous qui choisissez les sujets, vérifiez les expressions, montez les questions-réponses et les données structurées, reliez les pages entre elles, mettez tout en ligne sur le site et vérifiez si cela a marché, tout seul. Go Top SEO prend en charge toute la chaîne et mesure le résultat dans Google et dans les IA.',
      },
      {
        q: 'Avec quels sites est-ce que ça fonctionne ?',
        a: 'La publication directe fonctionne avec WordPress et Shopify. Le suivi de position, la visibilité dans les IA et la recherche de mots-clés fonctionnent avec n’importe quel site.',
      },
      {
        q: `Que se passe-t-il à la fin de l’essai de ${TRIAL_DAYS} jours ?`,
        a: 'Vous choisissez une formule et vous reprenez exactement là où vous en étiez. Vous n’en choisissez aucune ? Rien ne vous est facturé, parce que nous ne vous avons jamais demandé de carte.',
      },
      {
        q: 'Est-ce que je peux résilier ?',
        a: 'Oui, quand vous voulez, directement depuis votre tableau de bord, sans pénalité ni frais de résiliation.',
      },
    ],
  },
  cta: {
    title: 'Votre prochain client cherche aujourd’hui. Faites en sorte qu’il vous trouve.',
    body: `Auditez votre site gratuitement, ou lancez un essai de ${TRIAL_DAYS} jours et votre premier article peut être rédigé dès aujourd’hui.`,
    check: 'Auditer mon site gratuitement',
    signup: 'Commencer l’essai gratuit',
    dashboard: 'Aller à mon tableau de bord',
    pricing: `Formules à partir de ${FROM_USD} USD par mois.`,
    pricingLink: 'Voir toutes les formules et les tarifs',
  },
}
