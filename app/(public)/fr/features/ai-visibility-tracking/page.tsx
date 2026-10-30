import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingFr } from '@/lib/i18n/public/landing-fr'

export const metadata: Metadata = {
  title: 'Suivi de la visibilité dans les IA | Go Top SEO',
  description: "Suivez les mentions de votre entreprise dans ChatGPT, Gemini et Google AI. Mesurez votre GEO, l’optimisation pour les moteurs génératifs.",
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="fr" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['fr']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: "Visibilité dans les moteurs d’IA",
    eyebrowIcon: Sparkles,
    title: 'Quand un client interroge ChatGPT,',
    accent: 'sachez s’il vous recommande',
    subtitle: 'La plateforme pose à ChatGPT, à Gemini et à Google AI les questions que vos clients posent, et montre qui apparaît dans la réponse : vous, ou un concurrent.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingFr.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: "Pourquoi cela compte maintenant",
      title: 'Certains clients ne cherchent plus dans Google. Ils demandent à une IA.',
      intro: "Celui qui apparaît dans la réponse récolte la recommandation. Celui qui n’en est pas reste hors de la conversation.",
      items: [
        { icon: MessagesSquare, title: 'La question est passée au chat', body: "Au lieu de parcourir dix résultats, on pose une question et on obtient une réponse qui cite quelques noms. L’un d’eux devrait être le vôtre." },
        { icon: Award, title: 'Une recommandation à laquelle on se fie', body: "Quand un moteur d’IA cite une entreprise, cela sonne comme un conseil. Le client qui arrive ainsi arrive déjà décidé." },
        { icon: Target, title: 'Vos concurrents y sont peut-être déjà', body: 'Sans vérifier, impossible de savoir qui est recommandé dans votre secteur. Le suivi le montre question par question et moteur par moteur.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Comment ça marche',
      title: 'Trois étapes pour une vue claire',
      items: [
        { title: 'Choisissez les questions', body: 'La plateforme propose des questions à partir des mots-clés de votre activité, et vous en ajoutez ou en retirez. Par exemple : « Qui installe la climatisation à Lyon ? »' },
        { title: 'Chaque moteur est interrogé séparément', body: 'Chaque question est posée aux trois moteurs, et chaque réponse est lue et vérifiée.' },
        { title: 'Voyez qui y figure', body: "Pour chaque question : si vous êtes cité, si votre site est donné comme source, et qui est cité à votre place." },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Ce que vous recevez',
      title: 'Tout ce qu’il faut pour entrer dans la réponse',
      items: [
        { icon: Sparkles, title: 'Les mentions par moteur', body: 'Dans chacun des trois moteurs séparément, parce que chacun répond à sa manière.' },
        { icon: Link2, title: 'Cité comme source', body: 'Si la réponse renvoie à votre site comme source, et pas seulement à votre nom.' },
        { icon: Users, title: 'Qui est cité à votre place', body: 'Les concurrents qui ressortent dans les réponses, et les questions où ils récoltent la recommandation.' },
        { icon: Lightbulb, title: 'Ce qu’il faut améliorer', body: 'Des recommandations sur ce qu’il faut ajouter ou changer sur votre site pour avoir plus de chances d’être dans la réponse.' },
        { icon: LineChart, title: 'Les tendances dans le temps', body: 'Chaque vérification est conservée : vous voyez ainsi si la visibilité progresse à mesure que des articles sont publiés.' },
        { icon: FileSpreadsheet, title: 'Des rapports PDF et Excel', body: 'Les mentions et les citations par moteur, dans un rapport que vous pouvez envoyer à un client ou à votre direction.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: 'Ce que l’on demande sur la visibilité dans les IA',
      items: [
        { q: 'Quelle est la différence entre le SEO et le GEO ?', a: "Le SEO, c’est apparaître dans les résultats de Google. Le GEO, c’est apparaître dans les réponses des moteurs d’IA. La plateforme mesure les deux, et les articles qu’elle rédige sont pensés pour les deux : une structure claire et des sections de questions-réponses, auxquelles s’ajoutent des données structurées sur les sites WordPress équipés du plugin Go Top." },
        { q: 'Garantissez-vous que nous apparaîtrons dans les réponses ?', a: "Non. Personne ne maîtrise ce que répond un moteur d’IA. Ce que nous faisons : mesurer exactement où vous en êtes, montrer qui apparaît à votre place, et produire du contenu qui augmente vos chances." },
        { q: "Comment une vérification IA est-elle comptée ?", a: 'Une question dans un moteur compte pour une vérification. La même question dans les trois moteurs compte pour trois vérifications. Le quota de chaque formule figure sur la page des tarifs.' },
      ],
    },
  ],
  cta: {
    title: 'Découvrez ce que ChatGPT dit de votre secteur',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
