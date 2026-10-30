import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Recherche de mots-clés | Go Top SEO',
  description: "Trouvez des idées de mots-clés avec les données de Google Ads : volume de recherche, concurrence et coût par clic estimé. Ajoutez-les au suivi de position ou transformez-les en questions pour les IA.",
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="fr" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['fr']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Recherche de mots-clés',
    eyebrowIcon: Search,
    title: 'Écrivez sur ce que vos clients',
    accent: 'cherchent vraiment',
    subtitle: "Des idées de mots-clés avec les données de Google Ads : volume de recherche mensuel, concurrence et coût par clic estimé. Ajoutez les bonnes au suivi, ou transformez-les en questions pour les IA en un clic.",
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="installation climatisation"
        headers={['Mot-clé', 'Recherches par mois', 'Concurrence']}
        rows={[
          { keyword: 'installation climatisation réversible', volume: '1 900', competition: 'Moyenne', level: 'medium', added: true },
          { keyword: 'prix installation climatisation', volume: '1 300', competition: 'Faible', level: 'low' },
          { keyword: 'climatisation gainable', volume: '590', competition: 'Élevée', level: 'high' },
          { keyword: 'dépannage climatisation villeurbanne', volume: '320', competition: 'Faible', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Pourquoi commencer par là',
      title: "Un excellent article sur une expression que personne ne cherche n’amène personne",
      intro: "La recherche montre ce que les gens cherchent, à quelle fréquence et à quel point il est difficile de rivaliser, avant que vous n’écriviez un seul mot.",
      items: [
        { icon: TrendingUp, title: 'Une demande réelle', body: "Le volume de recherche mensuel estimé pour chaque expression, d’après les données de Google." },
        { icon: Target, title: 'Là où vous pouvez gagner', body: "La concurrence de chaque expression, pour choisir celles sur lesquelles vous pouvez vraiment vous positionner." },
        { icon: Coins, title: 'Ce que vaut un clic', body: "Ce que les annonceurs paient par clic : un bon signal de ce qu’une expression vaut pour les entreprises." },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Comment ça marche',
      title: "D’une idée à une liste de travail",
      items: [
        { title: "Partez d’une expression ou d’un site", body: "Saisissez une expression ou l’adresse d’un site, puis choisissez le pays et la langue." },
        { title: 'Recevez des idées chiffrées', body: 'Une liste d’expressions proches, avec le volume de recherche, la concurrence et le coût par clic estimé.' },
        { title: 'Mettez-les au travail', body: 'Ajoutez des expressions au suivi de position, ou transformez-les en questions pour le suivi dans les IA.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Ce que vous pouvez faire',
      title: "Tout ce qu’il faut pour choisir les bonnes expressions",
      items: [
        { icon: Lightbulb, title: "Des idées à partir d’une expression ou d’un site", body: "Des expressions proches à partir d’une seule expression, ou de l’adresse d’un site." },
        { icon: TrendingUp, title: 'Le volume de recherche', body: "Combien de fois chaque expression est cherchée par mois, selon l’estimation de Google." },
        { icon: Target, title: 'La concurrence', body: 'Faible, moyenne ou élevée, pour chaque expression.' },
        { icon: Coins, title: 'Le coût par clic estimé', body: 'La fourchette des enchères pour le haut de page dans la recherche payante.' },
        { icon: Plus, title: 'Au suivi en un clic', body: "L’expression que vous choisissez entre directement dans le suivi de position du projet." },
        { icon: Sparkles, title: 'Des questions pour le suivi dans les IA', body: "Transformez une expression en question en langage naturel, pour vérifier si les moteurs d’IA vous recommandent." },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'À propos des données',
      body: (
        <>
          <p>Les données viennent de l’API Google Ads. Le volume de recherche, la concurrence et le coût par clic sont des estimations de Google, et ils varient selon le secteur, la saison et le lieu.</p>
          <p>C’est un bon point de départ pour choisir des sujets. Le résultat réel, lui, se mesure dans le suivi de position.</p>
        </>
      ),
    },
  ],
  cta: {
    title: "Trouvez les expressions qui valent le travail",
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
